import type { EvidenceRecord } from "./evidence";
import type { ConfigurationState, DotfileStowState, PackageState } from "./states";

export interface ProgramAssessment { readonly programId: string; readonly packageState: PackageState; readonly configurationState: ConfigurationState; readonly dotfileStowState: DotfileStowState; readonly evidence: readonly EvidenceRecord[]; readonly ready: boolean; }

const packageReadiness: Record<PackageState, boolean> = {
  present: true, missing: false, planned: false, blocked: false, "provider-reported": true, verified: true, unverifiable: false,
};
const configurationReadiness: Record<ConfigurationState, boolean> = {
  absent: false, ready: true, applied: true, drifted: false, blocked: false, incompatible: false, unverifiable: false,
};
const stowReadiness: Record<DotfileStowState, boolean> = {
  "source-valid": false, "materialization-ready": false, "ownership-clear": false, "stow-ready": true, applied: true, conflict: false, blocked: false, unverifiable: false,
};

export function assessProgram(input: Omit<ProgramAssessment, "ready">): ProgramAssessment {
  const readiness = [
    packageReadiness[input.packageState],
    configurationReadiness[input.configurationState],
    stowReadiness[input.dotfileStowState],
  ];
  return { ...input, ready: readiness.every(Boolean) };
}
