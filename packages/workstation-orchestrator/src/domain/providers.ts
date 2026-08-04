import type { EvidenceRecord } from "./evidence";
import type { DomainBlockerCode, ProviderId, TypedBlocker } from "./states";
export type ProviderCapability = { readonly kind: "omarchy-pkg-add" | "homebrew-formula" | "homebrew-cask"; readonly commandPolicyId: string } | { readonly kind: "omarchy-install-group"; readonly commandPolicyId: string; readonly variantId: string } | { readonly kind: "unknown" | "ambiguous"; readonly reasonCode: string };
export interface ProviderObservation { readonly provider: ProviderId; readonly availability: "present" | "missing" | "ambiguous"; readonly observedVersion: string | "unknown"; readonly capabilities: readonly ProviderCapability[]; readonly evidence: readonly EvidenceRecord[]; }
export function providerBlocker(code: DomainBlockerCode, evidenceIds: readonly string[]): TypedBlocker {
  const policyDecision = code.includes("ambiguous") ? "ambiguous" : code === "plan-stale" ? "stale" : "refused" as const;
  return { code, evidenceIds: [...evidenceIds].sort(), policyDecision, nextAction: { kind: code === "plan-stale" ? "reassess" : "review-policy", reasonCode: code } };
}
