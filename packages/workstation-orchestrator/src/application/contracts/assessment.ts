import { Schema } from "effect";
import { ProgramAssessmentSchema, type ProgramAssessment } from "../../domain/assessment";
import { CompatibilityDecisionSchema, type CompatibilityDecision } from "../../domain/compatibility";
import { EvidenceRecordSchema, type EvidenceRecord } from "../../domain/evidence";
import type { PackagePlan } from "../../domain/plans";
import { SafeNextActionSchema, TypedBlockerSchema, type SafeNextAction, type TypedBlocker } from "../../domain/states";

export const AssessmentResultSchema = Schema.Struct({
  compatibility: CompatibilityDecisionSchema,
  programs: Schema.Array(ProgramAssessmentSchema),
  evidence: Schema.Array(EvidenceRecordSchema),
  blockers: Schema.Array(TypedBlockerSchema),
  nextActions: Schema.Array(SafeNextActionSchema),
});

export interface AssessmentResult {
  readonly compatibility: CompatibilityDecision;
  readonly programs: readonly ProgramAssessment[];
  readonly evidence: readonly EvidenceRecord[];
  readonly blockers: readonly TypedBlocker[];
  readonly nextActions: readonly SafeNextAction[];
}

export type ReadOnlyAssessmentResult = AssessmentResult | {
  readonly kind: "blocked";
  readonly blockers: readonly TypedBlocker[];
  readonly nextActions: readonly SafeNextAction[];
  readonly plan?: PackagePlan;
};
