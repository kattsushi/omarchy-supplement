import { EvidenceRecord } from "../../domain/evidence.js";

export type BoundedLinuxEvidenceInput = {
  readonly architecture: string;
  readonly providerVersion: string;
  readonly policyId: string;
  readonly testedCapability: string;
  readonly date: string;
  readonly result: "passed" | "failed" | "unavailable";
  readonly source: "native" | "fixture" | "structural";
};

export const captureBoundedLinuxEvidence = (input: BoundedLinuxEvidenceInput): EvidenceRecord & BoundedLinuxEvidenceInput & { readonly platform: "linux" } => ({
  platform: "linux",
  ...input,
  evidenceId: `evidence:linux-${input.testedCapability}-${input.result}`,
  subjectId: `capability:${input.testedCapability}`,
  claim: input.testedCapability,
  strength: input.source,
  sourceContract: "bounded-linux-capability-evidence",
  sourceVersion: input.providerVersion,
  platformContext: `linux/${input.architecture}`,
  policyContext: input.policyId,
  summaryCode: `${input.testedCapability}-${input.result}`,
});
