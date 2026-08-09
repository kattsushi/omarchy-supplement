import * as Schema from "effect/Schema";

const identifier = /^[a-z][a-z0-9]*(?::[A-Za-z0-9._-]+)+$/;
const accountName = /^[a-z][a-z0-9-]{0,63}$/;
const sha256 = /^sha256:[a-f0-9]{64}$/;
const requiredExclusions = [
  "mapping-entries",
  "provider-commands",
  "native-support",
  "execution-environment",
  "production-wiring",
  "execution-authority",
] as const;

export const MappingAttestationSubject = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  exactRevision: Schema.String,
  sha256: Schema.String,
});
export type MappingAttestationSubject = typeof MappingAttestationSubject.Type;

export const AttestationStatus = Schema.Literals(["approved", "unapproved"]);
export type AttestationStatus = typeof AttestationStatus.Type;

export const EvidenceStrength = Schema.Literals([
  "native",
  "structural",
  "provider-reported",
  "fixture",
  "simulated",
  "unverified",
]);
export type EvidenceStrength = typeof EvidenceStrength.Type;

export const AttestationEvidenceReference = Schema.Struct({
  reference: Schema.String,
  strength: EvidenceStrength,
  integrityId: Schema.String,
});
export type AttestationEvidenceReference =
  typeof AttestationEvidenceReference.Type;

const GovernanceScope = Schema.Literal("mapping-governance");
const GovernanceExclusion = Schema.Literals(requiredExclusions);
const ExternalIndependence = Schema.Literals(["not-proven", "proven"]);

const ExternalReview = Schema.Struct({
  reviewer: Schema.String,
  identityId: Schema.String,
  identityIntegrityId: Schema.String,
  subject: MappingAttestationSubject,
  scope: Schema.Array(GovernanceScope),
  exclusions: Schema.Array(GovernanceExclusion),
  decision: AttestationStatus,
  reviewedAt: Schema.String,
  independence: ExternalIndependence,
  evidenceReferences: Schema.Array(AttestationEvidenceReference),
});

export const MappingAttestation = Schema.Struct({
  mode: Schema.Literal("maintainer-owned"),
  subject: MappingAttestationSubject,
  status: AttestationStatus,
  decision: AttestationStatus,
  attester: Schema.String,
  riskAcceptance: Schema.Struct({
    accepted: Schema.Boolean,
    statement: Schema.String,
  }),
  scope: Schema.Array(GovernanceScope),
  exclusions: Schema.Array(GovernanceExclusion),
  evidenceReferences: Schema.Array(AttestationEvidenceReference),
  effectiveAt: Schema.String,
  reviewBy: Schema.optional(Schema.String),
  expiresAt: Schema.optional(Schema.String),
  supersedes: Schema.Union([
    Schema.Literal("none"),
    Schema.Array(MappingAttestationSubject),
  ]),
  revocationState: Schema.Literals(["active", "revoked"]),
  revocationReason: Schema.String,
  externalReviews: Schema.optional(Schema.Array(ExternalReview)),
});
export type MappingAttestation = typeof MappingAttestation.Type;

export type MappingAttestationValidation =
  | {
      readonly status: "approved";
      readonly evidenceReferences: readonly AttestationEvidenceReference[];
    }
  | { readonly status: "unapproved"; readonly reason: string };

const isNonBlank = (value: string): boolean => value.trim().length > 0;
const isTimestamp = (value: string): boolean =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sameSubject = (
  left: MappingAttestationSubject,
  right: MappingAttestationSubject,
): boolean =>
  left.id === right.id &&
  left.version === right.version &&
  left.exactRevision === right.exactRevision &&
  left.sha256 === right.sha256;
const validSubject = (value: MappingAttestationSubject): boolean =>
  identifier.test(value.id) &&
  isNonBlank(value.version) &&
  identifier.test(value.exactRevision) &&
  sha256.test(value.sha256);
const validEvidence = (reference: AttestationEvidenceReference): boolean =>
  identifier.test(reference.reference) && sha256.test(reference.integrityId);
const unavailable = (reason: string): MappingAttestationValidation => ({
  status: "unapproved",
  reason,
});
const requiredScopeIsBounded = (
  scope: readonly string[],
  exclusions: readonly string[],
): boolean =>
  scope.length === 1 &&
  scope[0] === "mapping-governance" &&
  requiredExclusions.every((exclusion) => exclusions.includes(exclusion));

const validExternalReview = (
  review: typeof ExternalReview.Type,
  subject: MappingAttestationSubject,
  attester: string,
): boolean => {
  if (
    !accountName.test(review.reviewer) ||
    !isTimestamp(review.reviewedAt) ||
    !sameSubject(review.subject, subject)
  )
    return false;
  if (
    !requiredScopeIsBounded(review.scope, review.exclusions) ||
    review.evidenceReferences.length === 0 ||
    !review.evidenceReferences.every(validEvidence)
  )
    return false;
  if (!sha256.test(review.identityIntegrityId)) return false;
  return (
    review.independence !== "proven" ||
    (review.reviewer !== attester &&
      review.identityId === `identity:${review.reviewer}` &&
      review.identityId !== `identity:${attester}`)
  );
};

/** Validates human governance only; technical and production predicates remain separate. */
export const validateMappingAttestation = (
  expectedSubject: MappingAttestationSubject,
  input: unknown,
  now: Date = new Date(),
): MappingAttestationValidation => {
  if (input === undefined || input === null)
    return unavailable("attestation-absent");

  let attestation: MappingAttestation;
  try {
    attestation = Schema.decodeUnknownSync(MappingAttestation)(input);
  } catch {
    return unavailable("attestation-malformed");
  }

  if (!validSubject(expectedSubject) || !validSubject(attestation.subject))
    return unavailable("attestation-malformed");
  if (!sameSubject(expectedSubject, attestation.subject))
    return unavailable("subject-mismatch");
  if (attestation.status !== "approved" || attestation.decision !== "approved")
    return unavailable("decision-not-approved");
  if (attestation.attester !== "kattsushi")
    return unavailable("attester-invalid");
  if (
    !attestation.riskAcceptance.accepted ||
    !isNonBlank(attestation.riskAcceptance.statement)
  )
    return unavailable("risk-acceptance-missing");
  if (!requiredScopeIsBounded(attestation.scope, attestation.exclusions))
    return unavailable("scope-invalid");
  if (attestation.evidenceReferences.length === 0)
    return unavailable("evidence-insufficient");
  if (!attestation.evidenceReferences.every(validEvidence))
    return unavailable("evidence-invalid");
  if (
    !isTimestamp(attestation.effectiveAt) ||
    (attestation.reviewBy !== undefined &&
      !isTimestamp(attestation.reviewBy)) ||
    (attestation.expiresAt !== undefined && !isTimestamp(attestation.expiresAt))
  )
    return unavailable("attestation-malformed");
  if (attestation.reviewBy === undefined && attestation.expiresAt === undefined)
    return unavailable("review-bound-missing");
  if (Date.parse(attestation.effectiveAt) > now.getTime())
    return unavailable("attestation-not-effective");
  if (
    [attestation.reviewBy, attestation.expiresAt].some(
      (date) => date !== undefined && Date.parse(date) <= now.getTime(),
    )
  )
    return unavailable("attestation-expired");
  if (
    (attestation.revocationState === "revoked") !==
    (attestation.revocationReason !== "none")
  )
    return unavailable("revocation-invalid");
  if (attestation.revocationState === "revoked")
    return unavailable("attestation-revoked");
  if (
    attestation.supersedes !== "none" &&
    attestation.supersedes.some((superseded) =>
      sameSubject(superseded, attestation.subject),
    )
  )
    return unavailable("supersession-invalid");
  if (
    attestation.externalReviews?.some(
      (review) =>
        !validExternalReview(review, attestation.subject, attestation.attester),
    )
  )
    return unavailable("external-independence-invalid");

  return Object.freeze({
    status: "approved" as const,
    evidenceReferences: Object.freeze(
      attestation.evidenceReferences.map((reference) =>
        Object.freeze({ ...reference }),
      ),
    ),
  });
};
