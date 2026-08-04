import * as Schema from "effect/Schema";

export const Platform = Schema.Literals(["linux", "macos", "unknown"]);
export type Platform = typeof Platform.Type;

export const OmarchyGeneration = Schema.Literals(["omarchy-3", "omarchy-4", "unknown", "ambiguous"]);
export type OmarchyGeneration = typeof OmarchyGeneration.Type;

export const PackageState = Schema.Literals(["present", "missing", "planned", "blocked", "provider-reported", "verified", "unverifiable"]);
export type PackageState = typeof PackageState.Type;

export const ConfigurationState = Schema.Literals(["absent", "ready", "applied", "drifted", "blocked", "incompatible", "unverifiable"]);
export type ConfigurationState = typeof ConfigurationState.Type;

export const DotfileStowState = Schema.Literals(["source-valid", "materialization-ready", "ownership-clear", "stow-ready", "applied", "conflict", "blocked", "unverifiable"]);
export type DotfileStowState = typeof DotfileStowState.Type;

export const CompatibilityState = Schema.Literals(["supported", "unsupported", "ambiguous", "unverified"]);
export type CompatibilityState = typeof CompatibilityState.Type;

export const EvidenceStrength = Schema.Literals(["native", "structural", "provider-reported", "fixture", "simulated", "unverified"]);
export type EvidenceStrength = typeof EvidenceStrength.Type;

export const BackupState = Schema.Literals(["unknown", "verification-failed", "verified", "eligible-for-manual-restore"]);
export type BackupState = typeof BackupState.Type;

export const ProviderId = Schema.Literals(["omarchy", "homebrew"]);
export type ProviderId = typeof ProviderId.Type;

export const ProviderRole = Schema.Literals(["primary", "fallback"]);
export type ProviderRole = typeof ProviderRole.Type;

export const ProgramId = Schema.String.pipe(Schema.brand("ProgramId"));
export type ProgramId = typeof ProgramId.Type;

export const SafeNextAction = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("reassess"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("review-policy"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("request-confirmation"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("follow-manual-guidance"), reasonCode: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("none"), reasonCode: Schema.String }),
]);
export type SafeNextAction = typeof SafeNextAction.Type;

export const DomainBlockerCode = Schema.Literals([
  "provider-missing", "provider-version-unsupported", "provider-capability-missing",
  "provider-capability-ambiguous", "package-mapping-missing", "package-mapping-unsafe",
  "package-unsupported", "fallback-not-opted-in", "confirmation-absent",
  "confirmation-declined", "plan-stale", "provider-execution-failed",
  "acquisition-unverifiable", "platform-ambiguous", "native-evidence-unverified",
]);
export type DomainBlockerCode = typeof DomainBlockerCode.Type;

export const TypedBlocker = Schema.Struct({
  code: DomainBlockerCode,
  evidenceIds: Schema.Array(Schema.String),
  policyDecision: Schema.Literals(["refused", "unsupported", "ambiguous", "stale"]),
  nextAction: SafeNextAction,
});
export type TypedBlocker = typeof TypedBlocker.Type;
