import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { AgentOperation, AgentRequest } from "./agent-request.js";
import type { PublicResult, PublicResultV1, PublicResultV2 } from "./public-result.js";

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

const unavailableByOperation = {
  list_profiles: unavailable,
  show_evidence: unavailable,
  show_backup: unavailable,
  restore_guidance: unavailable,
} satisfies Pick<OperationHandlers, "list_profiles" | "show_evidence" | "show_backup" | "restore_guidance">;

export const makeReadOnlyOperationHandlers = (assessment: AssessmentService, planning: PlanningService): OperationHandlers => ({
  ...unavailableByOperation,
  assess_workstation: (request) => request.operation !== "assess_workstation" ? unavailable(request) : Effect.map(assessment.assess(request.input.programIds), (value): PublicResultV2 => ({
    version: "PublicResultV2", operation: "assess_workstation", status: value.blockers.length === 0 ? "completed" : "refused", correlationId: request.requestId,
    payload: { kind: "assessment", platform: value.compatibility.platform ?? "unknown", policyId: `policy:${value.compatibility.policyId ?? "unknown"}`, profiles: [], programs: value.programs.map((program: any) => ({ programId: program.programId, packageState: program.packageState, configurationState: program.configurationState, dotfileStowState: program.dotfileStowState })), backups: value.backups.map((backup: any) => backup.backupId ?? "backup:unavailable") },
    blockers: value.blockers.map((blocker: any) => ({ code: blocker.policyDecision === "ambiguous" ? "operation-ambiguous" : blocker.policyDecision === "stale" ? "operation-stale" : "operation-refused" })), evidence: value.evidence.map((record: any) => ({ evidenceId: record.evidenceId, strength: record.strength, summaryCode: record.summaryCode })), nextActions: value.nextActions.map((action: any) => action.reasonCode),
  })).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
  plan_package_install: (request) => request.operation !== "plan_package_install" ? unavailable(request) : Effect.map(planning.plan({
    programId: request.input.programId, fallbackOptIn: request.input.fallbackOptIn,
    binding: { operation: "package-acquisition", logicalRequestIds: [request.input.programId], platformObservationDigest: "observation:pending", profilePolicyDigest: "policy:pending", provider: "omarchy", providerRole: "primary", providerPolicy: { id: "policy:pending", version: "v1" }, capabilityId: "capability:pending", mappingIds: ["mapping:pending"], packageStateDigests: ["state:pending"], verificationPolicyId: "verification:pending", riskCodes: [], fallbackOptIn: request.input.fallbackOptIn },
  }), (value): PublicResultV2 => value.plan === undefined ? {
    version: "PublicResultV2", operation: "plan_package_install", status: "refused", correlationId: request.requestId, payload: { kind: "unavailable", operation: "plan_package_install", reason: "source-unavailable" }, blockers: [{ code: "operation-refused" }], evidence: [], nextActions: value.nextActions.map((action: any) => action.reasonCode),
  } : {
    version: "PublicResultV2", operation: "plan_package_install", status: "completed", correlationId: request.requestId,
    payload: { kind: "plan", provider: value.plan.plan.binding.provider, providerRole: value.plan.plan.binding.providerRole, policyId: value.plan.plan.binding.providerPolicy.id, planId: value.plan.plan.planId, bindingDigest: `digest:${value.plan.plan.digest}`, confirmationRequired: true, acquisitionDoesNotVerifyConfiguration: true, acquisitionDoesNotVerifyDotfileStow: true }, blockers: [], evidence: [], nextActions: [],
  }).pipe(Effect.catchCause(() => unavailable(request, "source-unavailable"))),
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
