import { describe, expect, it } from "vitest";
import { validateMappingAttestation } from "../../src/application/contracts/execution-governance.js";

const now = new Date("2026-08-09T12:00:00.000Z");
const digest = `sha256:${"a".repeat(64)}`;
const evidenceIntegrityId = `sha256:${"b".repeat(64)}`;

const subject = {
  id: "mapping:catalog",
  version: "v1",
  exactRevision: "revision:20260809",
  sha256: digest,
};

const validAttestation = () => ({
  mode: "maintainer-owned" as const,
  subject,
  status: "approved" as const,
  decision: "approved" as const,
  attester: "kattsushi",
  riskAcceptance: {
    accepted: true,
    statement: "Accept mapping-governance review risk.",
  },
  scope: ["mapping-governance"] as const,
  exclusions: [
    "mapping-entries",
    "provider-commands",
    "native-support",
    "execution-environment",
    "production-wiring",
    "execution-authority",
  ] as const,
  evidenceReferences: [
    {
      reference: "evidence:mapping-governance:source",
      strength: "structural" as const,
      integrityId: evidenceIntegrityId,
    },
  ],
  effectiveAt: "2026-08-01T00:00:00.000Z",
  reviewBy: "2026-09-01T00:00:00.000Z",
  supersedes: "none" as const,
  revocationState: "active" as const,
  revocationReason: "none" as const,
});

const validate = (attestation: unknown, expectedSubject = subject) =>
  validateMappingAttestation(expectedSubject, attestation, now);

describe("mapping attestation governance", () => {
  it("accepts one exact, effective, active attestation without promoting structural evidence", () => {
    const result = validate(validAttestation());

    expect(result).toEqual({
      status: "approved",
      evidenceReferences: [
        {
          reference: "evidence:mapping-governance:source",
          strength: "structural",
          integrityId: evidenceIntegrityId,
        },
      ],
    });
  });

  it.each([
    ["absent", undefined, "attestation-absent"],
    ["malformed", { status: "self-approved" }, "attestation-malformed"],
    [
      "missing risk acceptance",
      {
        ...validAttestation(),
        riskAcceptance: { accepted: false, statement: "No." },
      },
      "risk-acceptance-missing",
    ],
    [
      "invalid maintainer",
      { ...validAttestation(), attester: "someone-else" },
      "attester-invalid",
    ],
    [
      "expired",
      { ...validAttestation(), reviewBy: "2026-08-08T12:00:00.000Z" },
      "attestation-expired",
    ],
    [
      "not yet effective",
      { ...validAttestation(), effectiveAt: "2026-08-10T00:00:00.000Z" },
      "attestation-not-effective",
    ],
    [
      "revoked",
      {
        ...validAttestation(),
        revocationState: "revoked",
        revocationReason: "Evidence withdrawn.",
      },
      "attestation-revoked",
    ],
    [
      "insufficient evidence",
      { ...validAttestation(), evidenceReferences: [] },
      "evidence-insufficient",
    ],
    [
      "mislabeled evidence",
      {
        ...validAttestation(),
        evidenceReferences: [
          {
            reference: "evidence:mapping-governance:source",
            strength: "native",
            integrityId: "sha256:not-a-digest",
          },
        ],
      },
      "evidence-invalid",
    ],
    [
      "scope that implies entries",
      { ...validAttestation(), scope: ["mapping-entries"] },
      "attestation-malformed",
    ],
    [
      "scope that implies commands",
      { ...validAttestation(), scope: ["provider-commands"] },
      "attestation-malformed",
    ],
    [
      "scope that implies native support",
      { ...validAttestation(), scope: ["native-support"] },
      "attestation-malformed",
    ],
    [
      "scope that implies environment",
      { ...validAttestation(), scope: ["execution-environment"] },
      "attestation-malformed",
    ],
    [
      "scope that implies production wiring",
      { ...validAttestation(), scope: ["production-wiring"] },
      "attestation-malformed",
    ],
    [
      "scope that implies execution authority",
      { ...validAttestation(), scope: ["execution-authority"] },
      "attestation-malformed",
    ],
  ])("rejects %s", (_case, attestation, reason) => {
    expect(validate(attestation)).toMatchObject({
      status: "unapproved",
      reason,
    });
  });

  it.each([
    ["id", { ...subject, id: "mapping:other" }],
    ["version", { ...subject, version: "v2" }],
    ["exact revision", { ...subject, exactRevision: "revision:other" }],
    ["digest", { ...subject, sha256: `sha256:${"c".repeat(64)}` }],
  ])("rejects a subject %s mismatch", (_case, attestedSubject) => {
    expect(
      validate({ ...validAttestation(), subject: attestedSubject }),
    ).toMatchObject({
      status: "unapproved",
      reason: "subject-mismatch",
    });
  });

  it("rejects self-supersession and an unpaired revocation reason", () => {
    expect(
      validate({ ...validAttestation(), supersedes: [subject] }),
    ).toMatchObject({
      status: "unapproved",
      reason: "supersession-invalid",
    });
    expect(
      validate({
        ...validAttestation(),
        revocationReason: "Unexpected reason.",
      }),
    ).toMatchObject({
      status: "unapproved",
      reason: "revocation-invalid",
    });
  });

  it("accepts only a distinct, integrity-bound external independence claim", () => {
    const externalReview = {
      reviewer: "reviewer-one",
      identityId: "identity:reviewer-one",
      identityIntegrityId: `sha256:${"d".repeat(64)}`,
      subject,
      scope: ["mapping-governance"] as const,
      exclusions: [
        "mapping-entries",
        "provider-commands",
        "native-support",
        "execution-environment",
        "production-wiring",
        "execution-authority",
      ] as const,
      decision: "approved" as const,
      reviewedAt: "2026-08-02T00:00:00.000Z",
      independence: "proven" as const,
      evidenceReferences: [
        {
          reference: "evidence:reviewer-one:source",
          strength: "structural" as const,
          integrityId: evidenceIntegrityId,
        },
      ],
    };

    expect(
      validate({ ...validAttestation(), externalReviews: [externalReview] }),
    ).toMatchObject({ status: "approved" });
    expect(
      validate({
        ...validAttestation(),
        externalReviews: [
          {
            ...externalReview,
            reviewer: "kattsushi",
            identityId: "identity:kattsushi",
          },
        ],
      }),
    ).toMatchObject({
      status: "unapproved",
      reason: "external-independence-invalid",
    });
  });
});
