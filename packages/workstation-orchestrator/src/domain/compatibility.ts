import type { CompatibilityState, EvidenceStrength, OmarchyGeneration, Platform } from "./states";

export interface CompatibilityInput { readonly platform: Platform; readonly generation: OmarchyGeneration; }
export interface CompatibilityDecision { readonly state: CompatibilityState; readonly policyId?: string; readonly generation: OmarchyGeneration; readonly evidenceStrength: EvidenceStrength; readonly reasonCode?: string; }

type CompatibilityKey = `${Platform}:${OmarchyGeneration}`;
type CompatibilityRule = Omit<CompatibilityDecision, "generation">;

const compatibilityRules = {
  "linux:omarchy-3": { state: "supported", policyId: "omarchy-3-policy-v1", evidenceStrength: "structural" },
  "linux:omarchy-4": { state: "supported", policyId: "omarchy-4-policy-v1", evidenceStrength: "structural" },
  "linux:unknown": { state: "unverified", evidenceStrength: "unverified", reasonCode: "generation-unknown" },
  "linux:ambiguous": { state: "ambiguous", evidenceStrength: "unverified", reasonCode: "generation-ambiguous" },
  "macos:omarchy-3": { state: "unverified", evidenceStrength: "unverified", reasonCode: "native-macos-evidence-required" },
  "macos:omarchy-4": { state: "unverified", evidenceStrength: "unverified", reasonCode: "native-macos-evidence-required" },
  "macos:unknown": { state: "unverified", evidenceStrength: "unverified", reasonCode: "native-macos-evidence-required" },
  "macos:ambiguous": { state: "ambiguous", evidenceStrength: "unverified", reasonCode: "generation-ambiguous" },
  "unknown:omarchy-3": { state: "unverified", evidenceStrength: "unverified", reasonCode: "generation-unknown" },
  "unknown:omarchy-4": { state: "unverified", evidenceStrength: "unverified", reasonCode: "generation-unknown" },
  "unknown:unknown": { state: "unverified", evidenceStrength: "unverified", reasonCode: "generation-unknown" },
  "unknown:ambiguous": { state: "ambiguous", evidenceStrength: "unverified", reasonCode: "generation-ambiguous" },
} satisfies Record<CompatibilityKey, CompatibilityRule>;

export function selectCompatibility(input: CompatibilityInput): CompatibilityDecision {
  return { ...compatibilityRules[`${input.platform}:${input.generation}`], generation: input.generation };
}
