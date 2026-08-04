export type Platform = "linux" | "macos" | "unknown";
export type OmarchyGeneration = "omarchy-3" | "omarchy-4" | "unknown" | "ambiguous";
export type PackageState = "present" | "missing" | "planned" | "blocked" | "provider-reported" | "verified" | "unverifiable";
export type ConfigurationState = "absent" | "ready" | "applied" | "drifted" | "blocked" | "incompatible" | "unverifiable";
export type DotfileStowState = "source-valid" | "materialization-ready" | "ownership-clear" | "stow-ready" | "applied" | "conflict" | "blocked" | "unverifiable";
export type CompatibilityState = "supported" | "unsupported" | "ambiguous" | "unverified";
export type EvidenceStrength = "native" | "structural" | "provider-reported" | "fixture" | "simulated" | "unverified";
export type BackupState = "unknown" | "verification-failed" | "verified" | "eligible-for-manual-restore";
export type ProviderId = "omarchy" | "homebrew";
export type ProviderRole = "primary" | "fallback";

export type SafeNextAction =
  | { readonly kind: "reassess"; readonly reasonCode: string }
  | { readonly kind: "review-policy"; readonly reasonCode: string }
  | { readonly kind: "request-confirmation"; readonly reasonCode: string }
  | { readonly kind: "follow-manual-guidance"; readonly reasonCode: string }
  | { readonly kind: "none"; readonly reasonCode: string };

export type DomainBlockerCode =
  | "provider-missing" | "provider-version-unsupported" | "provider-capability-missing"
  | "provider-capability-ambiguous" | "package-mapping-missing" | "package-mapping-unsafe"
  | "package-unsupported" | "fallback-not-opted-in" | "confirmation-absent"
  | "confirmation-declined" | "plan-stale" | "provider-execution-failed"
  | "acquisition-unverifiable" | "platform-ambiguous" | "native-evidence-unverified";

export interface TypedBlocker { readonly code: DomainBlockerCode; readonly evidenceIds: readonly string[]; readonly policyDecision: "refused" | "unsupported" | "ambiguous" | "stale"; readonly nextAction: SafeNextAction; }
