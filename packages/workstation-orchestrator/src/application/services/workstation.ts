import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ProgramAssessment, ProgramNotReady, assessProgram, validateProgramReadiness } from "../../domain/assessment.js";
import { CompatibilityDecision, selectCompatibility } from "../../domain/compatibility.js";
import { EvidenceRecord } from "../../domain/evidence.js";
import { createPlanBinding, PackagePlan, PlanBindingDigestFailure, PlanBindingInput, PlanDigestService } from "../../domain/plans.js";
import { providerBlocker } from "../../domain/providers.js";
import { BackupVisibility } from "../../domain/recovery.js";
import { ProgramId, SafeNextAction, TypedBlocker } from "../../domain/states.js";
import {
  BackupStatusPort, EvidenceStatusPort, ObservationUnavailable, PackageMappingPort, PlatformFactsPort, ProviderDiscoveryPort,
} from "../ports/workstation.js";

export { BackupStatusPort, EvidenceStatusPort, PackageMappingPort, PlatformFactsPort, ProviderDiscoveryPort } from "../ports/workstation.js";

export const WorkstationAssessment = Schema.Struct({
  compatibility: CompatibilityDecision,
  programs: Schema.Array(ProgramAssessment),
  evidence: Schema.Array(EvidenceRecord),
  backups: Schema.Array(BackupVisibility),
  blockers: Schema.Array(TypedBlocker),
  nextActions: Schema.Array(SafeNextAction),
});
export type WorkstationAssessment = typeof WorkstationAssessment.Type;

export const PackagePlanningResult = Schema.Struct({
  plan: Schema.optional(PackagePlan), blockers: Schema.Array(TypedBlocker), nextActions: Schema.Array(SafeNextAction),
});
export type PackagePlanningResult = typeof PackagePlanningResult.Type;

export const PackageAcquisitionRequest = Schema.Struct({ programId: ProgramId, fallbackOptIn: Schema.Boolean, binding: PlanBindingInput });
export type PackageAcquisitionRequest = typeof PackageAcquisitionRequest.Type;

export class PlanningRefused extends Data.TaggedError("PlanningRefused")<{
  readonly code: "provider-missing" | "package-mapping-missing" | "package-mapping-unsafe" | "fallback-not-opted-in";
  readonly evidenceIds: readonly string[];
}> {}

const refused = (code: PlanningRefused["code"], evidenceIds: readonly string[]): PackagePlanningResult => {
  const blocker = providerBlocker(code, evidenceIds);
  return { blockers: [blocker], nextActions: [blocker.nextAction] };
};

export class AssessWorkstation extends Context.Service<
  AssessWorkstation,
  { readonly assess: (programIds: readonly (typeof ProgramId.Type)[]) => Effect.Effect<WorkstationAssessment, ObservationUnavailable | ProgramNotReady> }
>()("AssessWorkstation", {
  make: Effect.gen(function*() {
    const platform = yield* PlatformFactsPort;
    const evidenceStatus = yield* EvidenceStatusPort;
    const backupStatus = yield* BackupStatusPort;
    return {
      assess: (programIds) => Effect.gen(function*() {
        const facts = yield* platform.facts;
        const compatibility = selectCompatibility(facts);
        const statuses = yield* Effect.forEach(programIds, evidenceStatus.forProgram);
        const programs = yield* Effect.forEach(statuses, (status) => {
          const assessment = assessProgram(status);
          return Effect.fromResult(validateProgramReadiness(assessment));
        });
        const backups = yield* backupStatus.visibility;
        const blockers = compatibility.state === "ambiguous"
          ? [providerBlocker("platform-ambiguous", facts.evidence.map((record) => record.evidenceId))]
          : compatibility.state === "supported" ? [] : [providerBlocker("native-evidence-unverified", facts.evidence.map((record) => record.evidenceId))];
        return { compatibility, programs, evidence: [...facts.evidence, ...statuses.flatMap((status) => status.evidence)], backups, blockers, nextActions: blockers.map((blocker) => blocker.nextAction) };
      }),
    };
  }),
}) { static readonly layer = Layer.effect(this, this.make); }

export class PlanPackageAcquisition extends Context.Service<
  PlanPackageAcquisition,
  { readonly plan: (request: PackageAcquisitionRequest) => Effect.Effect<PackagePlanningResult, ObservationUnavailable | PlanBindingDigestFailure, PlanDigestService> }
>()("PlanPackageAcquisition", {
  make: Effect.gen(function*() {
    const platform = yield* PlatformFactsPort;
    const providers = yield* ProviderDiscoveryPort;
    const mappings = yield* PackageMappingPort;
    return {
      plan: (request) => Effect.gen(function*() {
        const facts = yield* platform.facts;
        const primary = facts.platform === "macos" ? "homebrew" as const : "omarchy" as const;
        const primaryObservation = yield* providers.discover(primary);
        let provider: "omarchy" | "homebrew" = primary;
        let providerRole: "primary" | "fallback" = "primary";
        if (primaryObservation.availability !== "present") {
          if (facts.platform !== "linux") return refused("provider-missing", primaryObservation.evidence.map((record) => record.evidenceId));
          if (!request.fallbackOptIn) return refused("fallback-not-opted-in", primaryObservation.evidence.map((record) => record.evidenceId));
          const fallback = yield* providers.discover("homebrew");
          if (fallback.availability !== "present") return refused("provider-missing", fallback.evidence.map((record) => record.evidenceId));
          provider = "homebrew";
          providerRole = "fallback";
        }
        const mapping = yield* mappings.map(request.programId, provider);
        if (!mapping.safe) return refused("package-mapping-unsafe", []);
        if (providerRole === "fallback" && !mapping.alreadyPresent) return refused("package-mapping-missing", []);
        const bound = yield* createPlanBinding({ ...request.binding, provider, providerRole, capabilityId: provider === "homebrew" ? "homebrew-formula" : "omarchy-pkg-add", mappingIds: [mapping.mappingId], platformObservationDigest: facts.observationDigest, fallbackOptIn: request.fallbackOptIn });
        return { plan: { plan: bound, blockers: [], nextActions: [], acquisitionDoesNotVerifyConfiguration: true as const, acquisitionDoesNotVerifyDotfileStow: true as const }, blockers: [], nextActions: [] };
      }),
    };
  }),
}) { static readonly layer = Layer.effect(this, this.make); }
