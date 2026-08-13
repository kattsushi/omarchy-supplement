import * as Schema from "effect/Schema";

const identifier = /^[a-z][a-z0-9]*(?::[A-Za-z0-9._-]+)+$/;
const sha256 = /^sha256:[a-f0-9]{64}$/;
const timestamp = (value: string): boolean =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export const NativeProviderEvidenceSubject = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  exactRevision: Schema.String,
  sha256: Schema.String,
});
export type NativeProviderEvidenceSubject = typeof NativeProviderEvidenceSubject.Type;

export const NativeProviderEvidenceExpectation = Schema.Struct({
  platform: Schema.Literal("linux"),
  architecture: Schema.String,
  omarchy: Schema.Struct({
    generation: Schema.Literal("omarchy-4"),
    version: Schema.String,
    revision: Schema.String,
  }),
  provider: Schema.Struct({
    id: Schema.String,
    binary: Schema.String,
    version: Schema.String,
    revision: Schema.String,
    sha256: Schema.String,
    provenanceReference: Schema.String,
  }),
  capabilityId: Schema.String,
  mappingId: Schema.String,
  policy: Schema.Struct({ id: Schema.String, version: Schema.String }),
  argv: Schema.Array(Schema.String),
  runner: Schema.Struct({
    id: Schema.String,
    version: Schema.String,
    safeEnvironmentReferences: Schema.Array(Schema.String),
  }),
  rawEvidence: Schema.Struct({
    sha256: Schema.String,
    provenanceReference: Schema.String,
  }),
  subject: NativeProviderEvidenceSubject,
});
export type NativeProviderEvidenceExpectation = typeof NativeProviderEvidenceExpectation.Type;

export const NativeProviderEvidence = Schema.Struct({
  schema: Schema.Literal("native-provider-evidence-v1"),
  strength: Schema.Literals(["approval-grade-native", "fixture", "sandbox", "structural"]),
  platform: Schema.String,
  architecture: Schema.String,
  omarchy: Schema.Struct({
    generation: Schema.Literals(["omarchy-3", "omarchy-4"]),
    version: Schema.String,
    revision: Schema.String,
  }),
  provider: NativeProviderEvidenceExpectation.fields.provider,
  capabilityId: Schema.String,
  mappingId: Schema.String,
  policy: NativeProviderEvidenceExpectation.fields.policy,
  argv: Schema.Array(Schema.String),
  runner: Schema.Struct({
    id: Schema.String,
    version: Schema.String,
    safeEnvironmentReferences: Schema.Array(Schema.String),
  }),
  observedAt: Schema.String,
  freshUntil: Schema.String,
  expiresAt: Schema.String,
  outcome: Schema.Struct({
    kind: Schema.Literals(["succeeded", "failed", "timed-out", "malformed"]),
    result: Schema.Literals(["independently-verified", "provider-reported", "unverifiable"]),
  }),
  rawEvidence: Schema.Struct({
    sha256: Schema.String,
    provenanceReference: Schema.String,
    origin: Schema.Literals(["native", "fixture", "sandbox", "structural"]),
  }),
  subject: NativeProviderEvidenceSubject,
});
export type NativeProviderEvidence = typeof NativeProviderEvidence.Type;

export type NativeProviderEvidenceValidation =
  | { readonly status: "eligible"; readonly evidence: NativeProviderEvidence }
  | {
      readonly status: "ineligible";
      readonly reason:
        | "evidence-missing"
        | "evidence-malformed"
        | "platform-mismatch"
        | "architecture-mismatch"
        | "generation-mismatch"
        | "omarchy-version-mismatch"
        | "omarchy-revision-mismatch"
        | "provider-mismatch"
        | "capability-mismatch"
        | "mapping-mismatch"
        | "policy-mismatch"
        | "argv-mismatch"
        | "runner-mismatch"
        | "safe-environment-mismatch"
        | "raw-evidence-digest-mismatch"
        | "raw-evidence-provenance-mismatch"
        | "subject-mismatch"
        | "future-observation"
        | "evidence-expired"
        | "fixture-evidence"
        | "sandbox-evidence"
        | "structural-evidence"
        | "evidence-strength-insufficient";
    };

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const validIdentifier = (value: string): boolean => identifier.test(value);
const validSubject = (subject: NativeProviderEvidenceSubject): boolean =>
  validIdentifier(subject.id) &&
  subject.version.trim().length > 0 &&
  validIdentifier(subject.exactRevision) &&
  sha256.test(subject.sha256);
const validExpectation = (expectation: NativeProviderEvidenceExpectation): boolean =>
  expectation.architecture.trim().length > 0 &&
  expectation.omarchy.version.trim().length > 0 &&
  expectation.omarchy.revision.trim().length > 0 &&
  validIdentifier(expectation.provider.id) &&
  expectation.provider.binary.trim().length > 0 &&
  expectation.provider.version.trim().length > 0 &&
  expectation.provider.revision.trim().length > 0 &&
  sha256.test(expectation.provider.sha256) &&
  validIdentifier(expectation.provider.provenanceReference) &&
  validIdentifier(expectation.capabilityId) &&
  validIdentifier(expectation.mappingId) &&
  validIdentifier(expectation.policy.id) &&
  expectation.policy.version.trim().length > 0 &&
  expectation.argv.length > 0 &&
  validIdentifier(expectation.runner.id) &&
  expectation.runner.version.trim().length > 0 &&
  expectation.runner.safeEnvironmentReferences.length > 0 &&
  expectation.runner.safeEnvironmentReferences.every(validIdentifier) &&
  sha256.test(expectation.rawEvidence.sha256) &&
  validIdentifier(expectation.rawEvidence.provenanceReference) &&
  validSubject(expectation.subject);
const ineligible = (reason: Extract<NativeProviderEvidenceValidation, { readonly status: "ineligible" }> ["reason"]): NativeProviderEvidenceValidation => ({ status: "ineligible", reason });

/**
 * Validates evidence only; an empty registry is intentional and no caller may infer approval.
 */
export const validateNativeProviderEvidence = (
  expectationInput: unknown,
  input: unknown,
  now: Date = new Date(),
): NativeProviderEvidenceValidation => {
  if (input === undefined || input === null) return ineligible("evidence-missing");

  let expectation: NativeProviderEvidenceExpectation;
  let evidence: NativeProviderEvidence;
  try {
    expectation = Schema.decodeUnknownSync(NativeProviderEvidenceExpectation)(expectationInput);
    evidence = Schema.decodeUnknownSync(NativeProviderEvidence)(input);
  } catch {
    return ineligible("evidence-malformed");
  }

  if (!validExpectation(expectation) || !validSubject(evidence.subject) ||
    !validIdentifier(evidence.runner.id) || evidence.runner.version.trim().length === 0 ||
    evidence.runner.safeEnvironmentReferences.length === 0 || !evidence.runner.safeEnvironmentReferences.every(validIdentifier) ||
    !sha256.test(evidence.rawEvidence.sha256) || !validIdentifier(evidence.rawEvidence.provenanceReference) ||
    !timestamp(evidence.observedAt) || !timestamp(evidence.freshUntil) || !timestamp(evidence.expiresAt) ||
    Date.parse(evidence.observedAt) > Date.parse(evidence.freshUntil) ||
    Date.parse(evidence.freshUntil) > Date.parse(evidence.expiresAt)) return ineligible("evidence-malformed");
  if (evidence.platform !== expectation.platform) return ineligible("platform-mismatch");
  if (evidence.architecture !== expectation.architecture) return ineligible("architecture-mismatch");
  if (evidence.omarchy.generation !== expectation.omarchy.generation) return ineligible("generation-mismatch");
  if (evidence.omarchy.version !== expectation.omarchy.version) return ineligible("omarchy-version-mismatch");
  if (evidence.omarchy.revision !== expectation.omarchy.revision) return ineligible("omarchy-revision-mismatch");
  if (!same(evidence.provider, expectation.provider)) return ineligible("provider-mismatch");
  if (evidence.capabilityId !== expectation.capabilityId) return ineligible("capability-mismatch");
  if (evidence.mappingId !== expectation.mappingId) return ineligible("mapping-mismatch");
  if (!same(evidence.policy, expectation.policy)) return ineligible("policy-mismatch");
  if (!same(evidence.argv, expectation.argv)) return ineligible("argv-mismatch");
  if (evidence.runner.id !== expectation.runner.id || evidence.runner.version !== expectation.runner.version) return ineligible("runner-mismatch");
  if (!same(evidence.runner.safeEnvironmentReferences, expectation.runner.safeEnvironmentReferences)) return ineligible("safe-environment-mismatch");
  if (evidence.rawEvidence.sha256 !== expectation.rawEvidence.sha256) return ineligible("raw-evidence-digest-mismatch");
  if (evidence.rawEvidence.provenanceReference !== expectation.rawEvidence.provenanceReference) return ineligible("raw-evidence-provenance-mismatch");
  if (!same(evidence.subject, expectation.subject)) return ineligible("subject-mismatch");
  if (Date.parse(evidence.observedAt) > now.getTime()) return ineligible("future-observation");
  if (Date.parse(evidence.freshUntil) <= now.getTime() || Date.parse(evidence.expiresAt) <= now.getTime()) return ineligible("evidence-expired");
  if (evidence.rawEvidence.origin !== "native") return ineligible(`${evidence.rawEvidence.origin}-evidence`);
  if (evidence.strength !== "approval-grade-native") return ineligible("evidence-strength-insufficient");
  if (evidence.outcome.kind !== "succeeded" || evidence.outcome.result !== "independently-verified") return ineligible("evidence-strength-insufficient");

  return Object.freeze({ status: "eligible" as const, evidence: Object.freeze(evidence) });
};

export const emptyNativeProviderEvidenceRegistry = Object.freeze([]) as readonly NativeProviderEvidence[];

export const selectEligibleNativeProviderEvidence = (
  expectation: NativeProviderEvidenceExpectation,
  registry: readonly NativeProviderEvidence[] = emptyNativeProviderEvidenceRegistry,
  now: Date = new Date(),
): NativeProviderEvidenceValidation => {
  for (const evidence of registry) {
    const validation = validateNativeProviderEvidence(expectation, evidence, now);
    if (validation.status === "eligible") return validation;
  }
  return ineligible("evidence-missing");
};
