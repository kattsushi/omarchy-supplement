import { Match, Schema } from "effect";
import { CompatibilityStateSchema, EvidenceStrengthSchema, OmarchyGenerationSchema, PlatformSchema } from "./states";

export const CompatibilityInputSchema = Schema.Struct({
  platform: PlatformSchema,
  generation: OmarchyGenerationSchema,
});
export type CompatibilityInput = Schema.Schema.Type<typeof CompatibilityInputSchema>;

export const CompatibilityDecisionSchema = Schema.Struct({
  state: CompatibilityStateSchema,
  policyId: Schema.optional(Schema.String),
  generation: OmarchyGenerationSchema,
  evidenceStrength: EvidenceStrengthSchema,
  reasonCode: Schema.optional(Schema.String),
});
export type CompatibilityDecision = Schema.Schema.Type<typeof CompatibilityDecisionSchema>;

type CompatibilityRule = Omit<CompatibilityDecision, "generation">;

const supported = (policyId: string): CompatibilityRule => ({ state: "supported", policyId, evidenceStrength: "structural" });
const unverified = (reasonCode: string): CompatibilityRule => ({ state: "unverified", evidenceStrength: "unverified", reasonCode });
const ambiguous: CompatibilityRule = { state: "ambiguous", evidenceStrength: "unverified", reasonCode: "generation-ambiguous" };

// Tuicr: model compatibility as literal states and exhaustive pattern matching, never if/else-if chains.
export function selectCompatibility(input: CompatibilityInput): CompatibilityDecision {
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
  return { ...rule, generation: input.generation };
}
