import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import { ProgramAssessment, assessProgram } from "../../domain/assessment.js";
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
  readonly code: "provider-missing" | "package-mapping-missing" | "package-mapping-unsafe" | "fallback-not-opted-in" | "native-evidence-unverified";
  readonly evidenceIds: readonly string[];
}> {}

const refused = (code: PlanningRefused["code"], evidenceIds: readonly string[]): PackagePlanningResult => {
  const blocker = providerBlocker(code, evidenceIds);
  return { blockers: [blocker], nextActions: [blocker.nextAction] };
};

const compatibilityBlockers = {
  supported: () => [],
  ambiguous: (evidenceIds: readonly string[]) => [providerBlocker("platform-ambiguous", evidenceIds)],
  unsupported: (evidenceIds: readonly string[]) => [providerBlocker("native-evidence-unverified", evidenceIds)],
  unverified: (evidenceIds: readonly string[]) => [providerBlocker("native-evidence-unverified", evidenceIds)],
} satisfies Record<CompatibilityDecision["state"], (evidenceIds: readonly string[]) => TypedBlocker[]>;

const primaryProviders = {
  macos: "homebrew",
  linux: "omarchy",
  unknown: "omarchy",
} as const;

type ProviderSelection = { readonly provider: "omarchy" | "homebrew"; readonly providerRole: "primary" | "fallback" };

const mappingRefusal = (selection: ProviderSelection, mapping: { readonly safe: boolean; readonly alreadyPresent: boolean }) => Match.value({ selection, mapping }).pipe(
  Match.when({ mapping: { safe: false } }, () => "package-mapping-unsafe" as const),
  Match.when({ selection: { providerRole: "fallback" }, mapping: { alreadyPresent: false } }, () => "package-mapping-missing" as const),
  Match.orElse(() => undefined),
);

export class AssessWorkstation extends Context.Service<
  AssessWorkstation,
  { readonly assess: (programIds: readonly (typeof ProgramId.Type)[]) => Effect.Effect<WorkstationAssessment, ObservationUnavailable> }
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
        const programs = statuses.map(assessProgram);
        const backups = yield* backupStatus.visibility.pipe(Effect.catch(() => Effect.succeed([])));
        const blockers = compatibilityBlockers[compatibility.state](facts.evidence.map((record) => record.evidenceId));
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
          const primary = primaryProviders[facts.platform];
          const primaryObservation = yield* providers.discover(primary);
          const selection = yield* Match.value(primaryObservation.availability).pipe(
            Match.when("present", () => Effect.succeed({ provider: primary, providerRole: "primary" as const })),
            Match.orElse(() => Match.value({ platform: facts.platform, fallbackOptIn: request.fallbackOptIn }).pipe(
              Match.when({ platform: "linux", fallbackOptIn: true }, () => Effect.gen(function*() {
                if (selectCompatibility(facts).state !== "supported") return refused("native-evidence-unverified", facts.evidence.map((record) => record.evidenceId));
                const fallback = yield* providers.discover("homebrew");
                return yield* Match.value(fallback.availability).pipe(
                  Match.when("present", () => Effect.succeed({ provider: "homebrew" as const, providerRole: "fallback" as const })),
                  Match.orElse(() => Effect.succeed(refused("provider-missing", fallback.evidence.map((record) => record.evidenceId)))),
                );
              })),
              Match.when({ platform: "linux" }, () => Effect.succeed(refused("fallback-not-opted-in", primaryObservation.evidence.map((record) => record.evidenceId)))),
              Match.orElse(() => Effect.succeed(refused("provider-missing", primaryObservation.evidence.map((record) => record.evidenceId)))),
            )),
          );
          if ("blockers" in selection) return selection;
          const mapping = yield* mappings.map(request.programId, selection.provider);
          const refusal = mappingRefusal(selection, mapping);
          if (refusal !== undefined) return refused(refusal, []);
          const bound = yield* createPlanBinding({ ...request.binding, provider: selection.provider, providerRole: selection.providerRole, capabilityId: selection.provider === "homebrew" ? "homebrew-formula" : "omarchy-pkg-add", mappingIds: [mapping.mappingId], platformObservationDigest: facts.observationDigest, fallbackOptIn: request.fallbackOptIn });
          return { plan: { plan: bound, blockers: [], nextActions: [], acquisitionDoesNotVerifyConfiguration: true as const, acquisitionDoesNotVerifyDotfileStow: true as const }, blockers: [], nextActions: [] };
      }),
    };
  }),
}) { static readonly layer = Layer.effect(this, this.make); }
