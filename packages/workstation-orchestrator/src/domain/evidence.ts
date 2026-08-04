import { Schema } from "effect";
import { EvidenceStrengthSchema } from "./states";

export const EvidenceRecordSchema = Schema.Struct({
  evidenceId: Schema.String,
  subjectId: Schema.String,
  claim: Schema.String,
  strength: EvidenceStrengthSchema,
  sourceContract: Schema.String,
  sourceVersion: Schema.String,
  platformContext: Schema.String,
  policyContext: Schema.optional(Schema.String),
  digest: Schema.optional(Schema.String),
  summaryCode: Schema.String,
});
export type EvidenceRecord = Schema.Schema.Type<typeof EvidenceRecordSchema>;

type EvidenceStrength = EvidenceRecord["strength"];

const rank: Record<EvidenceStrength, number> = { unverified: 0, simulated: 1, fixture: 1, structural: 2, "provider-reported": 2, native: 3 };
export const cannotUpgradeEvidence = (observed: EvidenceStrength, requested: EvidenceStrength): boolean => rank[requested] > rank[observed];
export const nativeEvidenceFor = (record: EvidenceRecord, platformContext: string): boolean => record.strength === "native" && record.platformContext === platformContext;
