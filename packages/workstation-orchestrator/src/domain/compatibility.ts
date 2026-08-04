import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CompatibilityState, EvidenceStrength, OmarchyGeneration, Platform } from "./states.js";

export const CompatibilityInput = Schema.Struct({
  platform: Platform,
  generation: OmarchyGeneration,
});
export type CompatibilityInput = typeof CompatibilityInput.Type;

export const CompatibilityDecision = Schema.Struct({
  state: CompatibilityState,
  policyId: Schema.optional(Schema.String),
  generation: OmarchyGeneration,
  evidenceStrength: EvidenceStrength,
  reasonCode: Schema.optional(Schema.String),
});
export type CompatibilityDecision = typeof CompatibilityDecision.Type;

type CompatibilityRule = Omit<CompatibilityDecision, "generation">;

const supported = (policyId: string) => ({ state: "supported", policyId, evidenceStrength: "structural" } satisfies CompatibilityRule);
const unverified = (reasonCode: string) => ({ state: "unverified", evidenceStrength: "unverified", reasonCode } satisfies CompatibilityRule);
const ambiguous = { state: "ambiguous", evidenceStrength: "unverified", reasonCode: "generation-ambiguous" } satisfies CompatibilityRule;

export class CompatibilityRejected extends Data.TaggedError("CompatibilityRejected")<{
  readonly decision: CompatibilityDecision;
}> {}

export function selectCompatibility(input: CompatibilityInput) {
  const rule = Match.value(input).pipe(
    Match.when({ platform: "linux", generation: "omarchy-3" }, () => supported("omarchy-3-policy-v1")),
    Match.when({ platform: "linux", generation: "omarchy-4" }, () => supported("omarchy-4-policy-v1")),
    Match.when({ platform: "linux", generation: "unknown" }, () => unverified("generation-unknown")),
    Match.when({ platform: "linux", generation: "ambiguous" }, () => ambiguous),
    Match.when({ platform: "macos", generation: "omarchy-3" }, () => unverified("native-macos-evidence-required")),
    Match.when({ platform: "macos", generation: "omarchy-4" }, () => unverified("native-macos-evidence-required")),
    Match.when({ platform: "macos", generation: "unknown" }, () => unverified("native-macos-evidence-required")),
    Match.when({ platform: "macos", generation: "ambiguous" }, () => ambiguous),
    Match.when({ platform: "unknown", generation: "omarchy-3" }, () => unverified("generation-unknown")),
    Match.when({ platform: "unknown", generation: "omarchy-4" }, () => unverified("generation-unknown")),
    Match.when({ platform: "unknown", generation: "unknown" }, () => unverified("generation-unknown")),
    Match.when({ platform: "unknown", generation: "ambiguous" }, () => ambiguous),
    Match.exhaustive,
  );
      return {
        ...rule,
        generation: input.generation,
        policyId: "policyId" in rule ? rule.policyId : undefined,
        reasonCode: "reasonCode" in rule ? rule.reasonCode : undefined,
      } satisfies CompatibilityDecision;
}

export function validateCompatibility(decision: CompatibilityDecision) {
  return decision.state === "supported"
    ? Result.succeed(decision)
    : Result.fail(new CompatibilityRejected({ decision }));
}
