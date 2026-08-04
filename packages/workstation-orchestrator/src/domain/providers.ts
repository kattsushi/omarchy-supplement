import { Schema } from "effect";
import { EvidenceRecordSchema, type EvidenceRecord } from "./evidence";
import { DomainBlockerCodeSchema, ProviderIdSchema, TypedBlockerSchema, type DomainBlockerCode, type ProviderId, type SafeNextAction, type TypedBlocker } from "./states";

export const ProviderCapabilitySchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["omarchy-pkg-add", "homebrew-formula", "homebrew-cask"]), commandPolicyId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("omarchy-install-group"), commandPolicyId: Schema.String, variantId: Schema.String }),
  Schema.Struct({ kind: Schema.Literals(["unknown", "ambiguous"]), reasonCode: Schema.String }),
]);
export type ProviderCapability = Schema.Schema.Type<typeof ProviderCapabilitySchema>;

export const ProviderObservationSchema = Schema.Struct({
  provider: ProviderIdSchema,
  availability: Schema.Literals(["present", "missing", "ambiguous"]),
  observedVersion: Schema.Union([Schema.String, Schema.Literal("unknown")]),
  capabilities: Schema.Array(ProviderCapabilitySchema),
  evidence: Schema.Array(EvidenceRecordSchema),
});
export interface ProviderObservation {
  readonly provider: ProviderId;
  readonly availability: "present" | "missing" | "ambiguous";
  readonly observedVersion: string | "unknown";
  readonly capabilities: readonly ProviderCapability[];
  readonly evidence: readonly EvidenceRecord[];
}

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
} satisfies Record<DomainBlockerCode, BlockerPolicy>;

const nextActions: Record<BlockerPolicy["nextActionKind"], (reasonCode: DomainBlockerCode) => SafeNextAction> = {
  reassess: (reasonCode) => ({ kind: "reassess", reasonCode }),
  "review-policy": (reasonCode) => ({ kind: "review-policy", reasonCode }),
};

export function providerBlocker(code: DomainBlockerCode, evidenceIds: readonly string[]): TypedBlocker {
  const policy = blockerPolicies[code];
  return Schema.decodeUnknownSync(TypedBlockerSchema)({
    code: Schema.decodeUnknownSync(DomainBlockerCodeSchema)(code),
    evidenceIds: [...evidenceIds].sort(),
    policyDecision: policy.policyDecision,
    nextAction: nextActions[policy.nextActionKind](code),
  });
}
