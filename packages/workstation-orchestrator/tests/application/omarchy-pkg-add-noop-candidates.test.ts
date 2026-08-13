import { describe, expect, it } from "vitest";
import {
  canonicalCandidateSubjectJson,
  computeCandidateSubjectSha256,
  omarchyPkgAddNoopCandidateBundle,
  productionNativeProviderEvidenceRegistry,
  validateOmarchyPkgAddNoopCandidateBundle,
} from "../../src/application/contracts/omarchy-pkg-add-noop-candidates.js";
import { evaluateProviderPolicy } from "../../src/application/contracts/provider-policy.js";

const digest = (value: string) => `sha256:${value}`;

describe("Omarchy 4 pkg add jq native no-op candidates", () => {
  it("prepares exact unapproved policy, mapping, evidence, and attestation subjects", async () => {
    const bundle = omarchyPkgAddNoopCandidateBundle;

    expect(bundle.policy).toMatchObject({
      id: "policy:omarchy-pkg-add:already-installed-no-op",
      version: "v1",
      status: "candidate",
      omarchy: { release: "4.0.0rc3-1", version: "4.0.0rc3", revision: "1" },
      permittedPackageState: "already-installed",
      permittedOutcome: "native-no-op-observation",
      installationFallback: "forbidden",
    });
    expect(bundle.mapping).toMatchObject({
      id: "mapping:omarchy-pkg-add:jq:already-installed-no-op",
      version: "v1",
      logicalPackage: "jq",
      observedPackage: { name: "jq", version: "1.8.2-1", installed: true },
      argv: ["omarchy", "pkg", "add", "jq"],
      installationFallback: "forbidden",
    });
    expect(bundle.evidence).toMatchObject({
      id: "evidence:omarchy-pkg-add:jq:already-installed-no-op",
      version: "v1",
      status: "candidate",
      outcome: "native-no-op-observation",
      approvalGrade: false,
      packageDatabaseSha256: digest("beb29ac754afc2bf57446757709e1da990e8a04f00b1e02a7d446567893ad1c4"),
      omarchyBinarySha256: digest("663c6ff7eab541f93751ec2b87f3e6147cd2761fb3d3a8223d0c87e6a39ca758"),
      commandHelperSha256: digest("76bf74a1e4e65d07a29c06ebc5a621bf36662efc0a175ffc53b723bd80339a3e"),
      execution: {
        exitCode: 0,
        durationMs: 41,
        stdout: "",
        stderr: "",
        sudoInvoked: false,
        networkIndicated: false,
        packageDatabaseMutated: false,
        survivingProcess: false,
      },
    });
    expect(bundle.attestationSubjects).toHaveLength(3);
    expect(bundle.attestationSubjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "unapproved", subject: expect.objectContaining({ id: bundle.policy.id }) }),
        expect.objectContaining({ status: "unapproved", subject: expect.objectContaining({ id: bundle.mapping.id }) }),
        expect.objectContaining({ status: "unapproved", subject: expect.objectContaining({ id: bundle.evidence.id }) }),
      ]),
    );
    expect(productionNativeProviderEvidenceRegistry).toEqual([]);
    expect(evaluateProviderPolicy({
      humanGovernance: false,
      technicalAuthenticity: false,
      nativeEvidence: false,
      acquisitionVerification: false,
      disclosureComprehension: false,
      confirmation: false,
      safeEnvironment: false,
      auditReplay: false,
      rollbackReassessment: false,
    })).toEqual({
      eligible: false,
      failedPredicates: [
        "humanGovernance",
        "technicalAuthenticity",
        "nativeEvidence",
        "acquisitionVerification",
        "disclosureComprehension",
        "confirmation",
        "safeEnvironment",
        "auditReplay",
        "rollbackReassessment",
      ],
    });

    for (const candidate of bundle.attestationSubjects) {
      await expect(computeCandidateSubjectSha256(candidate.canonicalRecord)).resolves.toBe(candidate.subject.sha256);
      expect(canonicalCandidateSubjectJson(candidate.canonicalRecord)).toBe(candidate.canonicalRecordJson);
    }
  });

  it.each([
    ["missing package", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, mapping: { ...bundle.mapping, observedPackage: { ...bundle.mapping.observedPackage, installed: false } } })],
    ["package version drift", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, mapping: { ...bundle.mapping, observedPackage: { ...bundle.mapping.observedPackage, version: "1.8.3-1" } } })],
    ["Omarchy revision drift", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, policy: { ...bundle.policy, omarchy: { ...bundle.policy.omarchy, revision: "2" } } })],
    ["binary digest drift", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, evidence: { ...bundle.evidence, omarchyBinarySha256: digest("d".repeat(64)) } })],
    ["argv drift", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, mapping: { ...bundle.mapping, argv: ["omarchy", "pkg", "add", "fd"] } })],
    ["sudo", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, evidence: { ...bundle.evidence, execution: { ...bundle.evidence.execution, sudoInvoked: true } } })],
    ["network", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, evidence: { ...bundle.evidence, execution: { ...bundle.evidence.execution, networkIndicated: true } } })],
    ["mutation", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, evidence: { ...bundle.evidence, execution: { ...bundle.evidence.execution, packageDatabaseMutated: true } } })],
    ["non-no-op outcome", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, evidence: { ...bundle.evidence, outcome: "provider-reported" } })],
    ["attestation digest drift", (bundle: typeof omarchyPkgAddNoopCandidateBundle) => ({ ...bundle, attestationSubjects: [{ ...bundle.attestationSubjects[0], subject: { ...bundle.attestationSubjects[0].subject, sha256: digest("d".repeat(64)) } }, ...bundle.attestationSubjects.slice(1)] })],
  ])("fails closed for %s", (_case, mutate) => {
    expect(validateOmarchyPkgAddNoopCandidateBundle(mutate(omarchyPkgAddNoopCandidateBundle) as typeof omarchyPkgAddNoopCandidateBundle)).toMatchObject({
      status: "ineligible",
    });
  });
});
