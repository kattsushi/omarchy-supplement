import { Schema } from "effect";

export const PlatformSchema = Schema.Literals(["linux", "macos", "unknown"]);
export type Platform = Schema.Schema.Type<typeof PlatformSchema>;

export const OmarchyGenerationSchema = Schema.Literals(["omarchy-3", "omarchy-4", "unknown", "ambiguous"]);
export type OmarchyGeneration = Schema.Schema.Type<typeof OmarchyGenerationSchema>;

export const PackageStateSchema = Schema.Literals(["present", "missing", "planned", "blocked", "provider-reported", "verified", "unverifiable"]);
export type PackageState = Schema.Schema.Type<typeof PackageStateSchema>;

export const ConfigurationStateSchema = Schema.Literals(["absent", "ready", "applied", "drifted", "blocked", "incompatible", "unverifiable"]);
export type ConfigurationState = Schema.Schema.Type<typeof ConfigurationStateSchema>;

export const DotfileStowStateSchema = Schema.Literals(["source-valid", "materialization-ready", "ownership-clear", "stow-ready", "applied", "conflict", "blocked", "unverifiable"]);
export type DotfileStowState = Schema.Schema.Type<typeof DotfileStowStateSchema>;

export const CompatibilityStateSchema = Schema.Literals(["supported", "unsupported", "ambiguous", "unverified"]);
export type CompatibilityState = Schema.Schema.Type<typeof CompatibilityStateSchema>;

export const EvidenceStrengthSchema = Schema.Literals(["native", "structural", "provider-reported", "fixture", "simulated", "unverified"]);
export type EvidenceStrength = Schema.Schema.Type<typeof EvidenceStrengthSchema>;

export const BackupStateSchema = Schema.Literals(["unknown", "verification-failed", "verified", "eligible-for-manual-restore"]);
export type BackupState = Schema.Schema.Type<typeof BackupStateSchema>;

export const ProviderIdSchema = Schema.Literals(["omarchy", "homebrew"]);
export type ProviderId = Schema.Schema.Type<typeof ProviderIdSchema>;

export const ProviderRoleSchema = Schema.Literals(["primary", "fallback"]);
export type ProviderRole = Schema.Schema.Type<typeof ProviderRoleSchema>;

export const ProgramIdSchema = Schema.String.pipe(Schema.brand("ProgramId"));
export type ProgramId = Schema.Schema.Type<typeof ProgramIdSchema>;

export const SafeNextActionSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("reassess"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("review-policy"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("request-confirmation"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("follow-manual-guidance"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("none"), reasonCode: Schema.String }),
]);
export type SafeNextAction = Schema.Schema.Type<typeof SafeNextActionSchema>;

export const DomainBlockerCodeSchema = Schema.Literals([
  "provider-missing", "provider-version-unsupported", "provider-capability-missing",
  "provider-capability-ambiguous", "package-mapping-missing", "package-mapping-unsafe",
  "package-unsupported", "fallback-not-opted-in", "confirmation-absent",
  "confirmation-declined", "plan-stale", "provider-execution-failed",
  "acquisition-unverifiable", "platform-ambiguous", "native-evidence-unverified",
]);
export type DomainBlockerCode = Schema.Schema.Type<typeof DomainBlockerCodeSchema>;

export const TypedBlockerSchema = Schema.Struct({
  code: DomainBlockerCodeSchema,
  evidenceIds: Schema.Array(Schema.String),
  policyDecision: Schema.Literals(["refused", "unsupported", "ambiguous", "stale"]),
  nextAction: SafeNextActionSchema,
});
export type TypedBlocker = Schema.Schema.Type<typeof TypedBlockerSchema>;
