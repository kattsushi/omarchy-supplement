import type { EvidenceRecord } from "./evidence";
import type { ConfigurationState, DotfileStowState, PackageState } from "./states";
export interface ProgramAssessment { readonly programId: string; readonly packageState: PackageState; readonly configurationState: ConfigurationState; readonly dotfileStowState: DotfileStowState; readonly evidence: readonly EvidenceRecord[]; readonly ready: boolean; }
export function assessProgram(input: Omit<ProgramAssessment, "ready">): ProgramAssessment {
  return { ...input, ready: (input.configurationState === "ready" || input.configurationState === "applied") && (input.dotfileStowState === "stow-ready" || input.dotfileStowState === "applied") };
}
