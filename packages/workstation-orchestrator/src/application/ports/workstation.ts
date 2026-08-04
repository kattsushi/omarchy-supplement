import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { EvidenceRecord } from "../../domain/evidence.js";
import { ProviderObservation } from "../../domain/providers.js";
import { BackupVisibility } from "../../domain/recovery.js";
import { ConfigurationState, DotfileStowState, OmarchyGeneration, PackageState, Platform, ProgramId, ProviderId } from "../../domain/states.js";

export const PlatformFacts = Schema.Struct({
  platform: Platform,
  generation: OmarchyGeneration,
  observationDigest: Schema.String,
  evidence: Schema.Array(EvidenceRecord),
});
export type PlatformFacts = typeof PlatformFacts.Type;

export const EvidenceStatus = Schema.Struct({
  programId: ProgramId,
  packageState: PackageState,
  configurationState: ConfigurationState,
  dotfileStowState: DotfileStowState,
  evidence: Schema.Array(EvidenceRecord),
});
export type EvidenceStatus = typeof EvidenceStatus.Type;

export const SafePackageMapping = Schema.Struct({
  mappingId: Schema.String,
  packageName: Schema.String,
  safe: Schema.Boolean,
  alreadyPresent: Schema.Boolean,
});
export type SafePackageMapping = typeof SafePackageMapping.Type;

export class ObservationUnavailable extends Data.TaggedError("ObservationUnavailable")<{
  readonly subject: "platform" | "evidence" | "provider" | "mapping";
  readonly reasonCode: string;
}> {}

export interface PlatformFactsPortShape {
  readonly facts: Effect.Effect<PlatformFacts, ObservationUnavailable>;
}
export interface EvidenceStatusPortShape {
  readonly forProgram: (programId: typeof ProgramId.Type) => Effect.Effect<EvidenceStatus, ObservationUnavailable>;
}
export interface BackupStatusPortShape {
  readonly visibility: Effect.Effect<readonly BackupVisibility[], ObservationUnavailable>;
}
export interface ProviderDiscoveryPortShape {
  readonly discover: (provider: ProviderId) => Effect.Effect<ProviderObservation, ObservationUnavailable>;
}
export interface PackageMappingPortShape {
  readonly map: (programId: typeof ProgramId.Type, provider: ProviderId) => Effect.Effect<SafePackageMapping, ObservationUnavailable>;
}

export const PlatformFactsPort = Context.Service<PlatformFactsPortShape>("PlatformFactsPort");
export const EvidenceStatusPort = Context.Service<EvidenceStatusPortShape>("EvidenceStatusPort");
export const BackupStatusPort = Context.Service<BackupStatusPortShape>("BackupStatusPort");
export const ProviderDiscoveryPort = Context.Service<ProviderDiscoveryPortShape>("ProviderDiscoveryPort");
export const PackageMappingPort = Context.Service<PackageMappingPortShape>("PackageMappingPort");
