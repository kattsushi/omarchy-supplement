import type { ProgramAssessment } from "../../domain/assessment";
import type { CompatibilityDecision } from "../../domain/compatibility";
import type { EvidenceRecord } from "../../domain/evidence";
import type { PackagePlan } from "../../domain/plans";
import type { TypedBlocker, SafeNextAction } from "../../domain/states";
export interface AssessmentResult { readonly compatibility: CompatibilityDecision; readonly programs: readonly ProgramAssessment[]; readonly evidence: readonly EvidenceRecord[]; readonly blockers: readonly TypedBlocker[]; readonly nextActions: readonly SafeNextAction[]; }
export type ReadOnlyAssessmentResult = AssessmentResult | { readonly kind: "blocked"; readonly blockers: readonly TypedBlocker[]; readonly nextActions: readonly SafeNextAction[]; readonly plan?: PackagePlan };
