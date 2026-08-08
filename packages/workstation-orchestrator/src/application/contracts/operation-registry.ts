import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { AgentOperation, AgentRequest } from "./agent-request.js";
import type { PublicResult, PublicResultV1, PublicResultV2 } from "./public-result.js";
import { manualRestoreGuidance, type BackupVisibility } from "../../domain/recovery.js";
import type { PlatformFacts, ProfileInventory, SourceEvidenceObservation } from "../ports/workstation.js";

export const operationNames = ["assess_workstation", "list_profiles", "plan_package_install", "show_evidence", "show_backup", "restore_guidance"] as const;
export const unsupportedResult = (operation: AgentOperation, correlationId: string): PublicResultV1 => ({
  version: "PublicResultV1", status: "unsupported", correlationId,
  blockers: [{ code: "operation-unsupported" }], evidence: [], nextActions: [],
});
export const refusedResult = (correlationId: string): PublicResultV1 => ({
  version: "PublicResultV1", status: "refused", correlationId,
  blockers: [{ code: "operation-refused" }], evidence: [], nextActions: [],
});

type OperationHandler = (request: AgentRequest) => Effect.Effect<PublicResult, never>;
export type OperationHandlers = { readonly [Name in AgentOperation]: OperationHandler };
const unavailable = (request: AgentRequest, reason: "service-not-implemented" | "source-unavailable" = "service-not-implemented"): Effect.Effect<PublicResultV2> => Effect.succeed({
  version: "PublicResultV2", operation: request.operation, status: "unsupported", correlationId: request.requestId,
  payload: { kind: "unavailable", operation: request.operation, reason },
  blockers: [{ code: "operation-unsupported" }], evidence: [], nextActions: [],
});

export const unavailableOperationHandlers: OperationHandlers = {
  assess_workstation: unavailable,
  list_profiles: unavailable,
  plan_package_install: unavailable,
  show_evidence: unavailable,
  show_backup: unavailable,
  restore_guidance: unavailable,
};

type AssessmentService = { readonly assess: (programIds: readonly any[]) => Effect.Effect<any, any, never> };
type PlanningService = { readonly plan: (request: any) => Effect.Effect<any, any, never> };
type BackupService = { readonly backups: () => Effect.Effect<readonly BackupVisibility[], unknown> };
type ObservationService = {
  readonly platform: () => Effect.Effect<PlatformFacts, unknown>;
  readonly profiles: () => Effect.Effect<ProfileInventory, unknown>;
  readonly evidence: () => Effect.Effect<readonly SourceEvidenceObservation[], unknown>;
};

const unavailableByOperation = {
  list_profiles: unavailable,
  show_evidence: unavailable,
  show_backup: unavailable,
  restore_guidance: unavailable,
} satisfies Pick<OperationHandlers, "list_profiles" | "show_evidence" | "show_backup" | "restore_guidance">;

const backupEvidence = (backup: BackupVisibility) => [...backup.identityEvidenceIds, ...backup.integrityEvidenceIds].map((evidenceId) => ({ evidenceId, strength: "structural" as const, summaryCode: "backup-verification" }));
const backupResult = (request: AgentRequest, backup: BackupVisibility): PublicResultV2 => ({
  version: "PublicResultV2", operation: "show_backup", status: "completed", correlationId: request.requestId,
  payload: { kind: "backup", backupId: backup.backupId, targetId: backup.targetId ?? "target:unresolved", eligibility: backup.state, identityEvidenceIds: backup.identityEvidenceIds, integrityEvidenceIds: backup.integrityEvidenceIds },
  blockers: [], evidence: backupEvidence(backup), nextActions: [backup.nextAction.reasonCode],
});
const guidanceResult = (request: AgentRequest, backup: BackupVisibility): PublicResultV2 => {
  const guidance = manualRestoreGuidance(backup);
  return {
    version: "PublicResultV2", operation: "restore_guidance", status: guidance.eligible ? "completed" : "refused", correlationId: request.requestId,
    payload: { kind: "guidance", backupId: guidance.backupId, targetId: guidance.targetId, manualOnly: true, prerequisites: guidance.prerequisites, steps: guidance.steps, checks: guidance.checks, stopConditions: guidance.stopConditions },
    blockers: guidance.eligible ? [] : [{ code: "operation-refused" }], evidence: backupEvidence(backup), nextActions: [backup.nextAction.reasonCode],
  };
};
const backupHandler = (request: AgentRequest, backups: BackupService, operation: "show_backup" | "restore_guidance") => request.operation !== operation
  ? unavailable(request)
  : Effect.flatMap(backups.backups(), (values) => {
    const backup = values.find((value) => value.backupId === request.input.backupId);
    return backup === undefined
      ? unavailable(request, "source-unavailable")
      : Effect.succeed(operation === "show_backup" ? backupResult(request, backup) : guidanceResult(request, backup));
  });

export const makeReadOnlyOperationHandlers = (assessment: AssessmentService, planning: PlanningService, backups: BackupService, observations: ObservationService): OperationHandlers => ({
  ...unavailableByOperation,
  assess_workstation: (request) => request.operation !== "assess_workstation" ? unavailable(request) : Effect.map(Effect.all([
    assessment.assess(request.input.programIds), observations.platform(), observations.profiles(),
  ]), ([value, facts, inventory]): PublicResultV2 => ({
      version: "PublicResultV2", operation: "assess_workstation", status: value.blockers.length === 0 ? "completed" : "refused", correlationId: request.requestId,
      payload: { kind: "assessment", platform: facts.platform, architecture: facts.architecture ?? "unknown", omarchy: facts.omarchyAvailability === "observed" && facts.omarchyVersion !== undefined ? { availability: "observed", version: facts.omarchyVersion, generation: facts.generation } : { availability: "unavailable", reason: facts.omarchyUnavailableReason ?? "source-unavailable" }, policyId: `policy:${value.compatibility.policyId ?? "unknown"}`, profiles: inventory.profiles.map(({ id }) => id), programs: value.programs.map((program: any) => ({ programId: program.programId, packageState: program.packageState, configurationState: program.configurationState, dotfileStowState: program.dotfileStowState })), backups: value.backups.map((backup: any) => backup.backupId ?? "backup:unavailable") },
      blockers: value.blockers.map((blocker: any) => ({ code: blocker.policyDecision === "ambiguous" ? "operation-ambiguous" : blocker.policyDecision === "stale" ? "operation-stale" : "operation-refused" })), evidence: value.evidence.map((record: any) => ({ evidenceId: record.evidenceId, strength: record.strength, summaryCode: record.summaryCode })), nextActions: value.nextActions.map((action: any) => action.reasonCode),
    })).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  list_profiles: (request) => request.operation !== "list_profiles" ? unavailable(request) : Effect.map(observations.profiles(), (inventory): PublicResultV2 => ({
    version: "PublicResultV2", operation: "list_profiles", status: "completed", correlationId: request.requestId,
    payload: { kind: "profiles", profiles: inventory.profiles.map(({ id }) => id), policyIds: [] }, blockers: [], evidence: [], nextActions: [],
  })).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  show_evidence: (request) => request.operation !== "show_evidence" ? unavailable(request) : Effect.flatMap(observations.evidence(), (values) => {
    const observation = values.find(({ kind, id }) => kind === "program" && id === request.input.programId);
    const records = observation?.evidence ?? [];
    const record = records[0];
    return record === undefined ? unavailable(request, "source-unavailable") : Effect.succeed({
      version: "PublicResultV2", operation: "show_evidence", status: "completed", correlationId: request.requestId,
      payload: { kind: "evidence", evidenceId: record.evidenceId, strength: record.strength, summaryCode: record.summaryCode }, blockers: [],
      evidence: records.map(({ evidenceId, strength, summaryCode }) => ({ evidenceId, strength, summaryCode })), nextActions: [],
    } satisfies PublicResultV2);
  }).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  plan_package_install: (request) => request.operation !== "plan_package_install" ? unavailable(request) : Effect.map(planning.plan({
    programId: request.input.programId, fallbackOptIn: request.input.fallbackOptIn,
    binding: { operation: "package-acquisition", logicalRequestIds: [request.input.programId], platformObservationDigest: "observation:pending", profilePolicyDigest: "policy:pending", provider: "omarchy", providerRole: "primary", providerPolicy: { id: "policy:pending", version: "v1" }, capabilityId: "capability:pending", mappingIds: ["mapping:pending"], packageStateDigests: ["state:pending"], verificationPolicyId: "verification:pending", riskCodes: [], fallbackOptIn: request.input.fallbackOptIn },
  }), (value): PublicResultV2 => value.plan === undefined ? {
    version: "PublicResultV2", operation: "plan_package_install", status: "refused", correlationId: request.requestId, payload: { kind: "unavailable", operation: "plan_package_install", reason: "source-unavailable" }, blockers: [{ code: "operation-refused" }], evidence: [], nextActions: value.nextActions.map((action: any) => action.reasonCode),
  } : {
    version: "PublicResultV2", operation: "plan_package_install", status: "completed", correlationId: request.requestId,
    payload: { kind: "plan", provider: value.plan.plan.binding.provider, providerRole: value.plan.plan.binding.providerRole, policyId: value.plan.plan.binding.providerPolicy.id, planId: value.plan.plan.planId, bindingDigest: `digest:${value.plan.plan.digest}`, confirmationRequired: true, acquisitionDoesNotVerifyConfiguration: true, acquisitionDoesNotVerifyDotfileStow: true }, blockers: [], evidence: [], nextActions: [],
  }).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  show_backup: (request) => backupHandler(request, backups, "show_backup").pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  restore_guidance: (request) => backupHandler(request, backups, "restore_guidance").pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
});

export interface OperationRegistryShape {
  readonly handlers: OperationHandlers;
  readonly execute: (request: AgentRequest) => Effect.Effect<PublicResult, never>;
}
const makeRegistry = (handlers: OperationHandlers): OperationRegistryShape => ({
  handlers,
  execute: (request) => handlers[request.operation](request),
});
export class OperationRegistry extends Context.Service<OperationRegistry, OperationRegistryShape>()("OperationRegistry", {
  make: Effect.succeed(makeRegistry(unavailableOperationHandlers)),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export const makeOperationRegistry = (handlers: OperationHandlers = unavailableOperationHandlers) => makeRegistry(handlers);
