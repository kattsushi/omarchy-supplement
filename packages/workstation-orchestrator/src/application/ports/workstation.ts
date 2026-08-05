import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

export class PlatformFactsPort extends Context.Service<PlatformFactsPort, PlatformFactsPortShape>()("PlatformFactsPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
export class EvidenceStatusPort extends Context.Service<EvidenceStatusPort, EvidenceStatusPortShape>()("EvidenceStatusPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
export class BackupStatusPort extends Context.Service<BackupStatusPort, BackupStatusPortShape>()("BackupStatusPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
export class ProviderDiscoveryPort extends Context.Service<ProviderDiscoveryPort, ProviderDiscoveryPortShape>()("ProviderDiscoveryPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
export class PackageMappingPort extends Context.Service<PackageMappingPort, PackageMappingPortShape>()("PackageMappingPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
