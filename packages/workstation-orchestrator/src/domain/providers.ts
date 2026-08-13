import * as Schema from "effect/Schema";
import { EvidenceRecord } from "./evidence.js";
import { DomainBlockerCode, ProviderId, SafeNextAction, TypedBlocker } from "./states.js";

export const ProviderCapability = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["omarchy-pkg-add", "homebrew-formula", "homebrew-cask"]), commandPolicyId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("omarchy-install-group"), commandPolicyId: Schema.String, variantId: Schema.String }),
  Schema.Struct({ kind: Schema.Literals(["unknown", "ambiguous"]), reasonCode: Schema.String }),
]);
export type ProviderCapability = typeof ProviderCapability.Type;

export const ProviderObservation = Schema.Struct({
  provider: ProviderId,
  availability: Schema.Literals(["present", "missing", "ambiguous"]),
  observedVersion: Schema.Union([Schema.String, Schema.Literal("unknown")]),
  capabilities: Schema.Array(ProviderCapability),
  evidence: Schema.Array(EvidenceRecord),
});
export type ProviderObservation = typeof ProviderObservation.Type;

type BlockerPolicy = Pick<TypedBlocker, "policyDecision"> & { readonly nextActionKind: "reassess" | "review-policy" };

const blockerPolicies = {
  "provider-missing": { policyDecision: "refused", nextActionKind: "review-policy" },
  "provider-version-unsupported": { policyDecision: "unsupported", nextActionKind: "review-policy" },
  "provider-capability-missing": { policyDecision: "refused", nextActionKind: "review-policy" },
  "provider-capability-ambiguous": { policyDecision: "ambiguous", nextActionKind: "review-policy" },
  "package-mapping-missing": { policyDecision: "refused", nextActionKind: "review-policy" },
  "package-mapping-unsafe": { policyDecision: "refused", nextActionKind: "review-policy" },
  "package-unsupported": { policyDecision: "unsupported", nextActionKind: "review-policy" },
  "fallback-not-opted-in": { policyDecision: "refused", nextActionKind: "review-policy" },
  "confirmation-absent": { policyDecision: "refused", nextActionKind: "review-policy" },
  "confirmation-declined": { policyDecision: "refused", nextActionKind: "review-policy" },
  "plan-stale": { policyDecision: "stale", nextActionKind: "reassess" },
  "provider-execution-failed": { policyDecision: "refused", nextActionKind: "review-policy" },
  "acquisition-unverifiable": { policyDecision: "refused", nextActionKind: "review-policy" },
  "platform-ambiguous": { policyDecision: "ambiguous", nextActionKind: "review-policy" },
  "native-evidence-unverified": { policyDecision: "refused", nextActionKind: "review-policy" },
  "compatibility-refused": { policyDecision: "refused", nextActionKind: "reassess" },
} satisfies Record<DomainBlockerCode, BlockerPolicy>;

const nextActions: Record<BlockerPolicy["nextActionKind"], (reasonCode: DomainBlockerCode) => SafeNextAction> = {
  reassess: (reasonCode) => ({ kind: "reassess", reasonCode }),
  "review-policy": (reasonCode) => ({ kind: "review-policy", reasonCode }),
};

export function providerBlocker(code: DomainBlockerCode, evidenceIds: readonly string[]) {
  const policy = blockerPolicies[code];
  return Schema.decodeUnknownSync(TypedBlocker)({
    code: Schema.decodeUnknownSync(DomainBlockerCode)(code),
    evidenceIds: [...evidenceIds].sort(),
    policyDecision: policy.policyDecision,
    nextAction: nextActions[policy.nextActionKind](code),
  });
}
