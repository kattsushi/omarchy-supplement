const sha256 = /^sha256:[a-f0-9]{64}$/;

type CandidateStatus = "candidate" | "unapproved";
type ExactOmarchyRelease = {
  readonly release: "4.0.0rc3-1";
  readonly version: "4.0.0rc3";
  readonly revision: "1";
};
type CandidateSubject = {
  readonly id: string;
  readonly version: "v1";
  readonly exactRevision: string;
  readonly sha256: string;
};
type CandidateAttestation = {
  readonly status: "unapproved";
  readonly subject: CandidateSubject;
  readonly canonicalRecord: unknown;
  readonly canonicalRecordJson: string;
};

const omarchy: ExactOmarchyRelease = Object.freeze({
  release: "4.0.0rc3-1",
  version: "4.0.0rc3",
  revision: "1",
});
const argv = Object.freeze(["omarchy", "pkg", "add", "jq"] as const);
const packageObservation = Object.freeze({
  name: "jq",
  version: "1.8.2-1",
  installed: true,
});

const policy = Object.freeze({
  schema: "omarchy-pkg-add-noop-policy-v1" as const,
  id: "policy:omarchy-pkg-add:already-installed-no-op",
  version: "v1" as const,
  status: "candidate" as CandidateStatus,
  omarchy,
  capabilityId: "capability:omarchy-pkg-add",
  permittedPackageState: "already-installed" as const,
  permittedOutcome: "native-no-op-observation" as const,
  installationFallback: "forbidden" as const,
  excludedEffects: Object.freeze(["installation", "sudo", "network", "production-wiring", "activation"] as const),
});

const mapping = Object.freeze({
  schema: "omarchy-pkg-add-noop-mapping-v1" as const,
  id: "mapping:omarchy-pkg-add:jq:already-installed-no-op",
  version: "v1" as const,
  status: "candidate" as CandidateStatus,
  policy: Object.freeze({ id: policy.id, version: policy.version }),
  capabilityId: policy.capabilityId,
  logicalPackage: "jq",
  observedPackage: packageObservation,
  argv,
  installationFallback: "forbidden" as const,
});

const evidence = Object.freeze({
  schema: "native-provider-evidence-v1" as const,
  id: "evidence:omarchy-pkg-add:jq:already-installed-no-op",
  version: "v1" as const,
  status: "candidate" as CandidateStatus,
  approvalGrade: false,
  outcome: "native-no-op-observation" as const,
  omarchy,
  capabilityId: policy.capabilityId,
  mapping: Object.freeze({ id: mapping.id, version: mapping.version }),
  policy: Object.freeze({ id: policy.id, version: policy.version }),
  argv,
  packageBefore: packageObservation,
  packageAfter: packageObservation,
  packageDatabaseSha256: "sha256:beb29ac754afc2bf57446757709e1da990e8a04f00b1e02a7d446567893ad1c4",
  omarchyBinarySha256: "sha256:663c6ff7eab541f93751ec2b87f3e6147cd2761fb3d3a8223d0c87e6a39ca758",
  commandHelperSha256: "sha256:76bf74a1e4e65d07a29c06ebc5a621bf36662efc0a175ffc53b723bd80339a3e",
  execution: Object.freeze({
    exitCode: 0,
    durationMs: 41,
    stdout: "",
    stderr: "",
    sudoInvoked: false,
    networkIndicated: false,
    packageDatabaseMutated: false,
    survivingProcess: false,
  }),
  settlement: Object.freeze({
    attempt: "sha256:4de7c3e0c13756c458d67382cfc07316080b9a69d1765ce9165bf55c2785dd61",
    disposition: "settled-native-no-op-observation" as const,
    approval: "not-approval-grade-by-itself" as const,
  }),
});

export const canonicalCandidateSubjectJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCandidateSubjectJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalCandidateSubjectJson(record[key])}`).join(",")}}`;
};

export const computeCandidateSubjectSha256 = async (record: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(canonicalCandidateSubjectJson(record));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

const candidateAttestation = (
  record: { readonly id: string; readonly version: "v1" },
  exactRevision: string,
  recordSha256: string,
): CandidateAttestation => Object.freeze({
  status: "unapproved",
  subject: Object.freeze({ id: record.id, version: record.version, exactRevision, sha256: recordSha256 }),
  canonicalRecord: record,
  canonicalRecordJson: canonicalCandidateSubjectJson(record),
});

export const omarchyPkgAddNoopCandidateBundle = Object.freeze({
  policy,
  mapping,
  evidence,
  attestationSubjects: Object.freeze([
    candidateAttestation(policy, "revision:omarchy-pkg-add:4.0.0rc3-1:already-installed-no-op", "sha256:89751c80de682473111d7fee836e06b5d230a3470f59fe36190ec346b4920d74"),
    candidateAttestation(mapping, "revision:omarchy-pkg-add:4.0.0rc3-1:jq-1.8.2-1", "sha256:f8998493841c23c8d01ffd0b8d7daeac8b6875cddfa997354ee688d850781e29"),
    candidateAttestation(evidence, "revision:omarchy-pkg-add:4.0.0rc3-1:jq-native-no-op", "sha256:ca30b1f1c870d2ffa1ababe3d0e61aecfec0842b086e2ac6d5e83006902315f6"),
  ]),
});

type CandidateBundle = typeof omarchyPkgAddNoopCandidateBundle;
export type OmarchyPkgAddNoopCandidateValidation =
  | { readonly status: "valid-candidate"; readonly bundle: CandidateBundle }
  | { readonly status: "ineligible"; readonly reason: string };

const fail = (reason: string): OmarchyPkgAddNoopCandidateValidation => ({ status: "ineligible", reason });
const same = (left: unknown, right: unknown): boolean => canonicalCandidateSubjectJson(left) === canonicalCandidateSubjectJson(right);
const exactRelease = (value: ExactOmarchyRelease): boolean => same(value, omarchy);
const isDigest = (value: string): boolean => sha256.test(value);
const expectedAttestationSubjects = [
  { record: policy, id: policy.id, exactRevision: "revision:omarchy-pkg-add:4.0.0rc3-1:already-installed-no-op", sha256: "sha256:89751c80de682473111d7fee836e06b5d230a3470f59fe36190ec346b4920d74" },
  { record: mapping, id: mapping.id, exactRevision: "revision:omarchy-pkg-add:4.0.0rc3-1:jq-1.8.2-1", sha256: "sha256:f8998493841c23c8d01ffd0b8d7daeac8b6875cddfa997354ee688d850781e29" },
  { record: evidence, id: evidence.id, exactRevision: "revision:omarchy-pkg-add:4.0.0rc3-1:jq-native-no-op", sha256: "sha256:ca30b1f1c870d2ffa1ababe3d0e61aecfec0842b086e2ac6d5e83006902315f6" },
] as const;

/** Candidate validation never creates approval, populates production, or enables provider dispatch. */
export const validateOmarchyPkgAddNoopCandidateBundle = (bundle: CandidateBundle): OmarchyPkgAddNoopCandidateValidation => {
  if (bundle.policy.status !== "candidate" || !exactRelease(bundle.policy.omarchy) || bundle.policy.permittedPackageState !== "already-installed" || bundle.policy.permittedOutcome !== "native-no-op-observation" || bundle.policy.installationFallback !== "forbidden") return fail("policy-invalid");
  if (bundle.mapping.status !== "candidate" || bundle.mapping.logicalPackage !== "jq" || !bundle.mapping.observedPackage.installed || bundle.mapping.observedPackage.version !== "1.8.2-1" || !same(bundle.mapping.argv, argv) || !same(bundle.mapping.policy, { id: policy.id, version: policy.version }) || bundle.mapping.installationFallback !== "forbidden") return fail("mapping-invalid");
  if (bundle.evidence.status !== "candidate" || bundle.evidence.approvalGrade || bundle.evidence.outcome !== "native-no-op-observation" || !exactRelease(bundle.evidence.omarchy) || !same(bundle.evidence.mapping, { id: mapping.id, version: mapping.version }) || !same(bundle.evidence.policy, { id: policy.id, version: policy.version }) || !same(bundle.evidence.argv, argv) || !same(bundle.evidence.packageBefore, packageObservation) || !same(bundle.evidence.packageAfter, packageObservation)) return fail("evidence-binding-invalid");
  if (![bundle.evidence.packageDatabaseSha256, bundle.evidence.omarchyBinarySha256, bundle.evidence.commandHelperSha256, bundle.evidence.settlement.attempt].every(isDigest)) return fail("digest-invalid");
  if (bundle.evidence.packageDatabaseSha256 !== "sha256:beb29ac754afc2bf57446757709e1da990e8a04f00b1e02a7d446567893ad1c4" || bundle.evidence.omarchyBinarySha256 !== "sha256:663c6ff7eab541f93751ec2b87f3e6147cd2761fb3d3a8223d0c87e6a39ca758" || bundle.evidence.commandHelperSha256 !== "sha256:76bf74a1e4e65d07a29c06ebc5a621bf36662efc0a175ffc53b723bd80339a3e") return fail("digest-binding-invalid");
  const execution = bundle.evidence.execution;
  if (execution.exitCode !== 0 || execution.durationMs !== 41 || execution.stdout !== "" || execution.stderr !== "" || execution.sudoInvoked || execution.networkIndicated || execution.packageDatabaseMutated || execution.survivingProcess) return fail("native-no-op-invalid");
  if (bundle.evidence.settlement.disposition !== "settled-native-no-op-observation" || bundle.evidence.settlement.approval !== "not-approval-grade-by-itself") return fail("settlement-invalid");
  if (bundle.attestationSubjects.length !== expectedAttestationSubjects.length || bundle.attestationSubjects.some((candidate, index) => {
    const expected = expectedAttestationSubjects[index];
    return expected === undefined || candidate.status !== "unapproved" || candidate.subject.id !== expected.id || candidate.subject.version !== "v1" || candidate.subject.exactRevision !== expected.exactRevision || candidate.subject.sha256 !== expected.sha256 || !same(candidate.canonicalRecord, expected.record) || candidate.canonicalRecordJson !== canonicalCandidateSubjectJson(candidate.canonicalRecord);
  })) return fail("attestation-candidate-invalid");
  return { status: "valid-candidate", bundle };
};

/** This immutable empty registry is the production boundary for candidate-only preparation. */
export const productionNativeProviderEvidenceRegistry = Object.freeze([]) as readonly never[];
