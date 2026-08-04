import type { CompatibilityState, EvidenceStrength, OmarchyGeneration, Platform } from "./states";

export interface CompatibilityInput { readonly platform: Platform; readonly generation: OmarchyGeneration; }
export interface CompatibilityDecision { readonly state: CompatibilityState; readonly policyId?: string; readonly generation: OmarchyGeneration; readonly evidenceStrength: EvidenceStrength; readonly reasonCode?: string; }
export function selectCompatibility(input: CompatibilityInput): CompatibilityDecision {
  if (input.platform === "linux" && input.generation === "omarchy-3") return { state: "supported", policyId: "omarchy-3-policy-v1", generation: input.generation, evidenceStrength: "structural" };
  if (input.platform === "linux" && input.generation === "omarchy-4") return { state: "supported", policyId: "omarchy-4-policy-v1", generation: input.generation, evidenceStrength: "structural" };
  if (input.generation === "ambiguous") return { state: "ambiguous", generation: input.generation, evidenceStrength: "unverified", reasonCode: "generation-ambiguous" };
  if (input.platform === "macos") return { state: "unverified", generation: input.generation, evidenceStrength: "unverified", reasonCode: "native-macos-evidence-required" };
  return { state: "unverified", generation: input.generation, evidenceStrength: "unverified", reasonCode: "generation-unknown" };
}
