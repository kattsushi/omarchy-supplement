import type { EvidenceStrength } from "./states";

export interface EvidenceRecord {
  readonly evidenceId: string; readonly subjectId: string; readonly claim: string;
  readonly strength: EvidenceStrength; readonly sourceContract: string; readonly sourceVersion: string;
  readonly platformContext: string; readonly policyContext?: string; readonly digest?: string; readonly summaryCode: string;
}

const rank: Record<EvidenceStrength, number> = { unverified: 0, simulated: 1, fixture: 1, structural: 2, "provider-reported": 2, native: 3 };
export const cannotUpgradeEvidence = (observed: EvidenceStrength, requested: EvidenceStrength): boolean => rank[requested] > rank[observed];
export const nativeEvidenceFor = (record: EvidenceRecord, platformContext: string): boolean => record.strength === "native" && record.platformContext === platformContext;
