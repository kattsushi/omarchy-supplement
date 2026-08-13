import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { EvidenceRecord } from "../../domain/evidence.js";
import { ProviderObservation } from "../../domain/providers.js";
import { BackupVisibility } from "../../domain/recovery.js";
import { OmarchyIdentity } from "../../domain/compatibility.js";
import { ConfigurationState, DotfileStowState, OmarchyGeneration, PackageState, Platform, ProgramId, ProviderId } from "../../domain/states.js";

export const PlatformFacts = Schema.Struct({
  platform: Platform,
  generation: OmarchyGeneration,
  observationDigest: Schema.String,
  evidence: Schema.Array(EvidenceRecord),
  architecture: Schema.optional(Schema.Literals(["x86_64", "aarch64", "unknown"])),
  omarchyVersion: Schema.optional(Schema.String),
  omarchyRevision: Schema.optional(Schema.String),
  omarchyIdentity: Schema.optional(OmarchyIdentity),
  sourceContract: Schema.optional(Schema.String),
  sourceVersion: Schema.optional(Schema.String),
  sourceFingerprint: Schema.optional(Schema.String),
  evidenceStrength: Schema.optional(Schema.Literals(["native", "structural"])),
  omarchyAvailability: Schema.optional(Schema.Literals(["observed", "unavailable"])),
  omarchyUnavailableReason: Schema.optional(Schema.String),
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

const SourceMetadata = {
  sourceContract: Schema.Literal("workstation-source-v1"),
  sourceVersion: Schema.Literal("1"),
  sourceFingerprint: Schema.String,
  evidenceStrength: Schema.Literals(["native", "structural"]),
};
export const ProfileObservation = Schema.Struct({
  id: Schema.String,
  bootstrapSelector: Schema.String,
  dotfileSelectors: Schema.Array(Schema.String).check(Schema.isMaxLength(256)),
  selected: Schema.Boolean,
});
export type ProfileObservation = typeof ProfileObservation.Type;
export const SourceExpectation = Schema.Struct({
  profileId: Schema.String,
  platform: Schema.Literals(["any", "darwin", "linux"]),
  selector: Schema.String,
  source: Schema.String,
  concern: Schema.String,
  kind: Schema.Literals(["program", "dependency"]),
  id: Schema.String,
  probe: Schema.String,
});
export type SourceExpectation = typeof SourceExpectation.Type;
export const ProfileInventory = Schema.Struct({
  ...SourceMetadata,
  profiles: Schema.Array(ProfileObservation).check(Schema.isMaxLength(256)),
  expectations: Schema.Array(SourceExpectation).check(Schema.isMaxLength(256)),
});
export type ProfileInventory = typeof ProfileInventory.Type;
export const SourceEvidenceObservation = Schema.Struct({
  ...SourceMetadata,
  kind: Schema.Literals(["program", "dependency"]),
  id: Schema.String,
  availability: Schema.Literals(["present", "missing", "unavailable"]),
  version: Schema.Literal("unavailable"),
  configuration: Schema.Literal("unavailable"),
  dotfileStow: Schema.Literal("unavailable"),
  acquisition: Schema.Literal("unavailable"),
  expectations: Schema.Array(SourceExpectation).check(Schema.isMaxLength(256)),
  evidence: Schema.Array(EvidenceRecord).check(Schema.isMaxLength(256)),
});
export type SourceEvidenceObservation = typeof SourceEvidenceObservation.Type;

export const SafePackageMapping = Schema.Struct({
  mappingId: Schema.String,
  packageName: Schema.String,
  safe: Schema.Boolean,
  alreadyPresent: Schema.Boolean,
});
export type SafePackageMapping = typeof SafePackageMapping.Type;

export class ObservationUnavailable extends Data.TaggedError("ObservationUnavailable")<{
  readonly subject: "platform" | "profiles" | "evidence" | "provider" | "mapping";
  readonly reasonCode: string;
  readonly sourceContract?: "workstation-source-v1";
  readonly sourceVersion?: "1";
  readonly sourceFingerprint?: string;
}> {}

export interface PlatformFactsPortShape {
  readonly facts: Effect.Effect<PlatformFacts, ObservationUnavailable>;
}
export interface EvidenceStatusPortShape {
  readonly forProgram: (programId: typeof ProgramId.Type) => Effect.Effect<EvidenceStatus, ObservationUnavailable>;
}
export interface ProfileInventoryPortShape {
  readonly inventory: Effect.Effect<ProfileInventory, ObservationUnavailable>;
}
export interface SourceEvidencePortShape {
  readonly observations: Effect.Effect<readonly SourceEvidenceObservation[], ObservationUnavailable>;
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
export class ProfileInventoryPort extends Context.Service<ProfileInventoryPort, ProfileInventoryPortShape>()("ProfileInventoryPort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
export class SourceEvidencePort extends Context.Service<SourceEvidencePort, SourceEvidencePortShape>()("SourceEvidencePort", { make: Effect.never }) {
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
