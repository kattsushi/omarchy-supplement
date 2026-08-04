import * as Schema from "effect/Schema";
import { EvidenceStrength } from "./states.js";

export const EvidenceRecord = Schema.Struct({
  evidenceId: Schema.String,
  subjectId: Schema.String,
  claim: Schema.String,
  strength: EvidenceStrength,
  sourceContract: Schema.String,
  sourceVersion: Schema.String,
  platformContext: Schema.String,
  policyContext: Schema.optional(Schema.String),
  digest: Schema.optional(Schema.String),
  summaryCode: Schema.String,
});
export type EvidenceRecord = typeof EvidenceRecord.Type;

const rank: Record<EvidenceRecord["strength"], number> = { unverified: 0, simulated: 1, fixture: 1, structural: 2, "provider-reported": 2, native: 3 };
export const cannotUpgradeEvidence = (observed: EvidenceRecord["strength"], requested: EvidenceRecord["strength"]) => rank[requested] > rank[observed];
export const nativeEvidenceFor = (record: EvidenceRecord, platformContext: string) => record.strength === "native" && record.platformContext === platformContext;
