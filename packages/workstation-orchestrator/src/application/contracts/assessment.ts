import * as Schema from "effect/Schema";
import { ProgramAssessment } from "../../domain/assessment.js";
import { CompatibilityDecision } from "../../domain/compatibility.js";
import { EvidenceRecord } from "../../domain/evidence.js";
import type { PackagePlan } from "../../domain/plans.js";
import { SafeNextAction, TypedBlocker } from "../../domain/states.js";

export const AssessmentResult = Schema.Struct({
  compatibility: CompatibilityDecision,
  programs: Schema.Array(ProgramAssessment),
  evidence: Schema.Array(EvidenceRecord),
  blockers: Schema.Array(TypedBlocker),
  nextActions: Schema.Array(SafeNextAction),
});
export type AssessmentResult = typeof AssessmentResult.Type;

export type ReadOnlyAssessmentResult = AssessmentResult | {
  readonly kind: "blocked";
  readonly blockers: readonly TypedBlocker[];
  readonly nextActions: readonly SafeNextAction[];
  readonly plan?: PackagePlan;
};
