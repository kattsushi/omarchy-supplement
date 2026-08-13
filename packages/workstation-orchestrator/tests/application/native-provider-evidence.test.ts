import { describe, expect, it } from "vitest";
import {
  emptyNativeProviderEvidenceRegistry,
  selectEligibleNativeProviderEvidence,
  validateNativeProviderEvidence,
} from "../../src/application/contracts/native-provider-evidence.js";

const now = new Date("2026-08-13T12:00:00.000Z");
const digest = (character: string) => `sha256:${character.repeat(64)}`;

const expected = {
  platform: "linux",
  architecture: "x86_64",
  omarchy: { generation: "omarchy-4" as const, version: "4.0.0rc3", revision: "1" },
  provider: {
    id: "provider:omarchy",
    binary: "omarchy",
    version: "4.0.0rc3",
    revision: "1",
    sha256: digest("a"),
    provenanceReference: "provenance:omarchy:release",
  },
  capabilityId: "capability:package-install",
  mappingId: "mapping:omarchy-4:package-install",
  policy: { id: "policy:omarchy-package", version: "v1" },
  argv: ["omarchy", "pkg", "add", "ripgrep"],
  runner: {
    id: "runner:maintainer-host",
    version: "v1",
    safeEnvironmentReferences: ["environment:isolated-native-host"],
  },
  rawEvidence: {
    sha256: digest("c"),
    provenanceReference: "provenance:omarchy:provider-run",
  },
  subject: {
    id: "evidence:omarchy-package-install",
    version: "v1",
    exactRevision: "revision:20260813",
    sha256: digest("b"),
  },
} as const;

const validEvidence = () => ({
  schema: "native-provider-evidence-v1" as const,
  strength: "approval-grade-native" as const,
  platform: expected.platform,
  architecture: expected.architecture,
  omarchy: expected.omarchy,
  provider: expected.provider,
  capabilityId: expected.capabilityId,
  mappingId: expected.mappingId,
  policy: expected.policy,
  argv: [...expected.argv],
  runner: expected.runner,
  observedAt: "2026-08-13T11:00:00.000Z",
  freshUntil: "2026-08-13T13:00:00.000Z",
  expiresAt: "2026-08-14T11:00:00.000Z",
  outcome: { kind: "succeeded" as const, result: "independently-verified" as const },
  rawEvidence: {
    ...expected.rawEvidence,
    origin: "native" as const,
  },
  subject: expected.subject,
});

const validate = (evidence: unknown, expectation = expected) =>
  validateNativeProviderEvidence(expectation, evidence, now);

describe("native Omarchy 4 provider evidence", () => {
  it("accepts only a complete exact approval-grade native binding", () => {
    expect(validate(validEvidence())).toEqual({
      status: "eligible",
      evidence: validEvidence(),
    });
  });

  it.each([
    ["missing", undefined, "evidence-missing"],
    ["malformed", { schema: "native-provider-evidence-v1" }, "evidence-malformed"],
    ["cross platform", { ...validEvidence(), platform: "macos" }, "platform-mismatch"],
    ["cross architecture", { ...validEvidence(), architecture: "aarch64" }, "architecture-mismatch"],
    ["cross generation", { ...validEvidence(), omarchy: { ...expected.omarchy, generation: "omarchy-3" } }, "generation-mismatch"],
    ["cross version", { ...validEvidence(), omarchy: { ...expected.omarchy, version: "4.0.0" } }, "omarchy-version-mismatch"],
    ["cross revision", { ...validEvidence(), omarchy: { ...expected.omarchy, revision: "2" } }, "omarchy-revision-mismatch"],
    ["provider mismatch", { ...validEvidence(), provider: { ...expected.provider, sha256: digest("d") } }, "provider-mismatch"],
    ["capability mismatch", { ...validEvidence(), capabilityId: "capability:other" }, "capability-mismatch"],
    ["mapping mismatch", { ...validEvidence(), mappingId: "mapping:other" }, "mapping-mismatch"],
    ["policy mismatch", { ...validEvidence(), policy: { ...expected.policy, version: "v2" } }, "policy-mismatch"],
    ["argv mismatch", { ...validEvidence(), argv: ["omarchy", "pkg", "add", "fd"] }, "argv-mismatch"],
    ["runner mismatch", { ...validEvidence(), runner: { ...expected.runner, id: "runner:other-host" } }, "runner-mismatch"],
    ["environment reference mismatch", { ...validEvidence(), runner: { ...expected.runner, safeEnvironmentReferences: ["environment:other-host"] } }, "safe-environment-mismatch"],
    ["raw digest mismatch", { ...validEvidence(), rawEvidence: { ...validEvidence().rawEvidence, sha256: digest("d") } }, "raw-evidence-digest-mismatch"],
    ["raw provenance mismatch", { ...validEvidence(), rawEvidence: { ...validEvidence().rawEvidence, provenanceReference: "provenance:omarchy:other-run" } }, "raw-evidence-provenance-mismatch"],
    ["future observation", { ...validEvidence(), observedAt: "2026-08-13T12:00:01.000Z" }, "future-observation"],
    ["subject mismatch", { ...validEvidence(), subject: { ...expected.subject, sha256: digest("d") } }, "subject-mismatch"],
    ["expired", { ...validEvidence(), freshUntil: "2026-08-13T11:59:59.000Z" }, "evidence-expired"],
    ["fixture provenance", { ...validEvidence(), rawEvidence: { ...validEvidence().rawEvidence, origin: "fixture" } }, "fixture-evidence"],
    ["sandbox provenance", { ...validEvidence(), rawEvidence: { ...validEvidence().rawEvidence, origin: "sandbox" } }, "sandbox-evidence"],
    ["structural provenance", { ...validEvidence(), rawEvidence: { ...validEvidence().rawEvidence, origin: "structural" } }, "structural-evidence"],
    ["non-native strength", { ...validEvidence(), strength: "fixture" }, "evidence-strength-insufficient"],
  ])("rejects %s deterministically", (_case, evidence, reason) => {
    expect(validate(evidence)).toEqual({ status: "ineligible", reason });
  });

  it("cannot promote fixture, sandbox, or structural evidence through an approval-grade label", () => {
    for (const origin of ["fixture", "sandbox", "structural"] as const) {
      expect(validate({
        ...validEvidence(),
        strength: "approval-grade-native",
        rawEvidence: { ...validEvidence().rawEvidence, origin },
      })).toEqual({ status: "ineligible", reason: `${origin}-evidence` });
    }
  });

  it("keeps the default registry empty and therefore has no eligible evidence", () => {
    expect(emptyNativeProviderEvidenceRegistry).toEqual([]);
    expect(selectEligibleNativeProviderEvidence(expected, emptyNativeProviderEvidenceRegistry, now)).toEqual({
      status: "ineligible",
      reason: "evidence-missing",
    });
  });
});
