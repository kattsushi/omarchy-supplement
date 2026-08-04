import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { EvidenceRecord } from "./evidence.js";
import { ConfigurationState, DotfileStowState, PackageState, ProgramId } from "./states.js";

export const ProgramAssessment = Schema.Struct({
  programId: ProgramId,
  packageState: PackageState,
  configurationState: ConfigurationState,
  dotfileStowState: DotfileStowState,
  evidence: Schema.Array(EvidenceRecord),
  ready: Schema.Boolean,
});
export type ProgramAssessment = typeof ProgramAssessment.Type;

const packageReadiness: Record<ProgramAssessment["packageState"], boolean> = {
  present: true, missing: false, planned: false, blocked: false, "provider-reported": true, verified: true, unverifiable: false,
};
const configurationReadiness: Record<ProgramAssessment["configurationState"], boolean> = {
  absent: false, ready: true, applied: true, drifted: false, blocked: false, incompatible: false, unverifiable: false,
};
const stowReadiness: Record<ProgramAssessment["dotfileStowState"], boolean> = {
  "source-valid": false, "materialization-ready": false, "ownership-clear": false, "stow-ready": true, applied: true, conflict: false, blocked: false, unverifiable: false,
};

export class ProgramNotReady extends Data.TaggedError("ProgramNotReady")<{
  readonly programId: ProgramAssessment["programId"];
  readonly packageState: ProgramAssessment["packageState"];
  readonly configurationState: ProgramAssessment["configurationState"];
  readonly dotfileStowState: ProgramAssessment["dotfileStowState"];
}> {}

export function assessProgram(input: Omit<ProgramAssessment, "ready">) {
  const readiness = [
    packageReadiness[input.packageState],
    configurationReadiness[input.configurationState],
    stowReadiness[input.dotfileStowState],
  ];
  return { ...input, ready: readiness.every(Boolean) };
}

export function validateProgramReadiness(assessment: ProgramAssessment) {
  return assessment.ready
    ? Result.succeed(assessment)
    : Result.fail(new ProgramNotReady({
      programId: assessment.programId,
      packageState: assessment.packageState,
      configurationState: assessment.configurationState,
      dotfileStowState: assessment.dotfileStowState,
    }));
}
