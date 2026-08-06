import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  acquisitionVerificationApprovalSubjectDigest, acquisitionVerificationDigest, resolveAcquisitionVerification, validateAcquisitionVerificationIntegrity,
  type AcquisitionVerificationEntry, type AcquisitionVerificationRegistry, type VerificationApproval, type VerificationRequest,
} from "../../src/domain/acquisition-verification.js";
import { draftAcquisitionVerification } from "../../src/infrastructure/verification/draft-acquisition-verification.js";

const now = new Date("2026-08-10T00:00:00.000Z"); const hash = "a".repeat(64);
const approvals: readonly VerificationApproval[] = [
  { role: "evidence-owner", reviewer: "identity:evidence-owner", decision: "approved", decidedAt: "2026-08-02T00:00:00.000Z", subjectDigest: hash, signoffRef: `sha256:${hash}` },
  { role: "independent-verification-reviewer", reviewer: "identity:independent-reviewer", decision: "approved", decidedAt: "2026-08-02T00:00:00.000Z", subjectDigest: hash, signoffRef: `sha256:${hash}` },
];
const lifecycle = { effectiveFrom: "2026-08-01T00:00:00.000Z", reviewBy: "2026-09-01T00:00:00.000Z", supportedUntil: "2026-10-01T00:00:00.000Z" };
const scope = { provider: "homebrew", capabilityId: "homebrew-formula", platform: "linux", architecture: "x86_64", providerVersion: "4.6.0", packageKind: "formula" } as const;
const binding = { planId: "plan:synthetic", requestId: "request:synthetic", planBindingDigest: hash, commandDigest: hash, providerPolicyDigest: hash,
  mappingCatalogDigest: hash, mappingEntryDigest: hash, verificationPolicyDigest: hash };
const scopeDigest = await acquisitionVerificationApprovalSubjectDigest(scope);
const observation = (phase: "pre" | "post", observer: string, observedAt: string) => ({ id: `evidence:${phase}`, phase, observer,
  planId: binding.planId, requestId: binding.requestId, scopeDigest, verificationPolicyDigest: hash, observedAt, freshUntil: "2026-08-20T00:00:00.000Z",
  source: "native" as const, fixture: false, provenanceRef: `provenance:${phase}`, provenanceDigest: (phase === "pre" ? "1" : "2").repeat(64), artifactSha256: (phase === "pre" ? "b" : "c").repeat(64), outputSha256: (phase === "pre" ? "d" : "e").repeat(64), sizeBytes: 10,
  packageState: phase === "pre" ? "absent" as const : "present" as const, packageId: "jq", version: phase === "pre" ? "absent" : "1.7.1", location: phase === "pre" ? "absent" : "/home/linuxbrew/.linuxbrew/bin/jq" });
const entry = (change: Partial<AcquisitionVerificationEntry> = {}): AcquisitionVerificationEntry => ({
  id: "verification:synthetic", version: "1.0.0", status: "approved", owner: "identity:entry-policy-owner", preparer: "identity:entry-preparer", approvals, lifecycle,
  supersedes: [], supersededBy: "", conflictsWith: [], scope, binding, observations: [observation("pre", "identity:pre-observer", "2026-08-03T00:00:00.000Z"), observation("post", "identity:post-observer", "2026-08-04T00:00:00.000Z")],
  requestedPackageIds: ["jq"], observedPackageIds: ["jq"], expectedVersion: "1.7.1", observedVersion: "1.7.1", installationLocation: "/home/linuxbrew/.linuxbrew/bin/jq",
  sideEffects: ["package-installed"], outcome: "success", completeness: 1, completenessThreshold: 1, evidenceCeilingBytes: 100,
  timedOut: false, truncated: false, providerDisagreement: false, indeterminateWrites: false, ambiguous: false, reassessmentRequired: false,
  retryEligible: false, retryBudget: 0, automaticRollback: false, guidanceRef: "guidance:synthetic", recoveryRef: "recovery:synthetic",
  auditId: "audit:synthetic", replayId: "replay:synthetic", retention: "bounded", privacy: "sanitized", sanitizationRef: "sanitization:synthetic", ...change,
});
async function signed(entries: readonly AcquisitionVerificationEntry[] = [entry()], change: Partial<AcquisitionVerificationRegistry> = {}) {
  const bind = async (subject: unknown, candidates: readonly VerificationApproval[]) => { const subjectDigest = await acquisitionVerificationApprovalSubjectDigest(subject); return candidates.map((approval) => ({ ...approval, subjectDigest })); };
  const boundEntries = await Promise.all(entries.map(async (candidate) => ({ ...candidate, approvals: await bind(candidate, candidate.approvals) })));
  const registry: AcquisitionVerificationRegistry = { schemaVersion: "AcquisitionVerificationRegistryV1", id: "policy:verification-synthetic", version: "1.0.0",
    status: "approved", owner: "identity:registry-policy-owner", preparer: "identity:registry-preparer", requiredApprovals: ["evidence-owner", "independent-verification-reviewer"],
    approvals, lifecycle, entries: boundEntries, digest: "", ...change }; const approved = { ...registry, approvals: await bind(registry, registry.approvals) }; return { ...approved, digest: await acquisitionVerificationDigest(approved) };
}
const request: VerificationRequest = { scope, binding, expectedPackageIds: ["jq"], expectedVersion: "1.7.1", expectedLocation: "/home/linuxbrew/.linuxbrew/bin/jq" };
const reason = async (registry: AcquisitionVerificationRegistry, candidate: VerificationRequest = request) => (await resolveAcquisitionVerification(registry, candidate, now)).reason;

describe("acquisition verification policy", () => {
  it("ships an integrity-valid empty unapproved draft", async () => {
    expect(draftAcquisitionVerification).toMatchObject({ version: "0.1.0", status: "draft", preparer: "", requiredApprovals: [], approvals: [], entries: [] });
    expect(await validateAcquisitionVerificationIntegrity(draftAcquisitionVerification)).toBe(true);
    expect(await reason(draftAcquisitionVerification, request)).toBe("registry-not-approved");
  });

  it("allows one accountable owner across registry and entry but still requires external verification", async () => {
    const structural = entry({ owner: "identity:registry-policy-owner", preparer: "", observations: entry().observations.map((item) => ({ ...item, source: "structural", fixture: true })) });
    await expect(resolveAcquisitionVerification(await signed([structural], { preparer: "" }), request, now)).resolves.toMatchObject({ available: false, structurallyEligible: true, reason: "independent-verification-required", authenticity: "not-established", authority: "trusted-external-verifier-required" });
  });

  it.each(["draft", "in-review", "rejected", "deprecated", "superseded"] as const)("rejects %s registry lifecycle status", async (status) => expect(await reason(await signed([entry()], { status }))).toBe("registry-not-approved"));
  it.each(["draft", "in-review", "rejected", "deprecated", "superseded"] as const)("rejects %s entry lifecycle status", async (status) => expect(await reason(await signed([entry({ status })]))).toBe("entry-not-approved"));

  it.each([
    ["self review", [{ ...approvals[0]!, reviewer: "identity:entry-policy-owner" }, approvals[1]!]],
    ["duplicate reviewer", [approvals[0]!, { ...approvals[1]!, reviewer: approvals[0]!.reviewer }]],
    ["rejection", [{ ...approvals[0]!, decision: "rejected" }, approvals[1]!]],
    ["bad role", [{ ...approvals[0]!, role: "security" }, approvals[1]!]],
    ["bad signoff", [{ ...approvals[0]!, signoffRef: "sha256:BAD" }, approvals[1]!]],
    ["padded identity", [{ ...approvals[0]!, reviewer: " identity:evidence-owner" }, approvals[1]!]], ["role-prefixed alias", [{ ...approvals[0]!, reviewer: "reviewer:evidence-owner" }, approvals[1]!]],
  ])("rejects approval class %s", async (_name, candidate) => expect(await reason(await signed([entry({ approvals: candidate as VerificationApproval[] })]))).toBeDefined());

  it.each([
    ["owner/preparer", { preparer: "identity:entry-policy-owner" }, {}], ["preparer/evidence owner", { approvals: [{ ...approvals[0]!, reviewer: "identity:entry-preparer" }, approvals[1]!] }, {}],
    ["policy owner/independent reviewer", { approvals: [approvals[0]!, { ...approvals[1]!, reviewer: "identity:entry-policy-owner" }] }, {}],
    ["cross-level owner/evidence owner", { approvals: [{ ...approvals[0]!, reviewer: "identity:registry-policy-owner" }, approvals[1]!] }, {}],
    ["cross-level preparer/independent reviewer", { approvals: [approvals[0]!, { ...approvals[1]!, reviewer: "identity:registry-preparer" }] }, {}],
    ["registry owner/preparer", {}, { preparer: "identity:registry-policy-owner" }],
  ])("rejects governance role reuse: %s", async (_name, entryChange, registryChange) => {
    expect(await reason(await signed([entry(entryChange as Partial<AcquisitionVerificationEntry>)], registryChange as Partial<AcquisitionVerificationRegistry>))).not.toBe("independent-verification-required");
  });

  it.each([
    ["future", { lifecycle: { ...lifecycle, effectiveFrom: "2026-08-11T00:00:00.000Z" } }],
    ["expired", { lifecycle: { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" } }],
    ["inverted", { lifecycle: { ...lifecycle, reviewBy: "2026-10-02T00:00:00.000Z" } }],
    ["superseded", { supersededBy: "verification:new" }],
  ])("rejects lifecycle class %s", async (_name, change) => expect(await reason(await signed([entry(change)]))).toBeDefined());

  it.each([
    ["stale", { freshUntil: "2026-08-09T00:00:00.000Z" }], ["future", { observedAt: "2026-08-11T00:00:00.000Z" }], ["truthy fixture", { fixture: "false" }],
    ["cross plan", { planId: "plan:other" }], ["cross request", { requestId: "request:other" }], ["cross policy", { verificationPolicyDigest: "b".repeat(64) }],
    ["cross scope", { scopeDigest: "f".repeat(64) }],
    ["bad artifact", { artifactSha256: "A".repeat(64) }], ["bad output", { outputSha256: "bad" }], ["zero bytes", { sizeBytes: 0 }], ["oversize", { sizeBytes: 101 }],
  ])("rejects evidence class %s", async (_name, change) => {
    const observations = [observation("pre", "identity:pre-observer", "2026-08-03T00:00:00.000Z"), { ...observation("post", "identity:post-observer", "2026-08-04T00:00:00.000Z"), ...change }];
    expect(await reason(await signed([entry({ observations: observations as AcquisitionVerificationEntry["observations"] })]))).toBeDefined();
  });

  it.each([
    ["partial", { outcome: "partial" }], ["failure", { outcome: "failure" }], ["unknown", { outcome: "unknown" }], ["timeout", { timedOut: true }],
    ["truncation", { truncated: true }], ["indeterminate write", { indeterminateWrites: true }], ["provider disagreement", { providerDisagreement: true }],
    ["incomplete", { completeness: 0.9 }], ["missing version", { observedVersion: "" }], ["version mismatch", { observedVersion: "2.0.0" }],
    ["missing location", { installationLocation: "" }], ["ambiguity", { ambiguous: true }], ["multi package", { observedPackageIds: ["jq", "git"] }],
    ["wrong identity", { observedPackageIds: ["git"] }], ["reassessment", { reassessmentRequired: true }], ["zero threshold", { completenessThreshold: 0 }],
    ["zero ceiling", { evidenceCeilingBytes: 0 }], ["unknown side effect", { sideEffects: ["unknown"] }], ["retry", { retryEligible: true }],
    ["retry budget", { retryBudget: 1 }], ["missing requested set", { requestedPackageIds: [] }], ["missing observed set", { observedPackageIds: [] }],
  ])("never promotes %s to success", async (_name, change) => expect(await reason(await signed([entry(change as Partial<AcquisitionVerificationEntry>)]))).toBe("non-success"));

  it("rejects false provider success without an independent post-observation", async () => {
    expect(await reason(await signed([entry({ observations: [observation("pre", "identity:pre-observer", "2026-08-03T00:00:00.000Z")] })]))).not.toBeUndefined();
  });

  it.each([
    ["observer repeats", { observer: "identity:pre-observer" }], ["observer reuses evidence owner", { observer: "identity:evidence-owner" }], ["observer reuses independent reviewer", { observer: "identity:independent-reviewer" }],
    ["observer reuses policy owner", { observer: "identity:entry-policy-owner" }], ["observer reuses preparer", { observer: "identity:entry-preparer" }], ["evidence id repeats", { id: "evidence:pre" }],
    ["provenance reuses preparer", { provenanceRef: "identity:entry-preparer" }], ["provenance repeats", { provenanceRef: "provenance:pre" }], ["provenance digest repeats", { provenanceDigest: "1".repeat(64) }],
    ["artifact repeats", { artifactSha256: "b".repeat(64) }], ["output repeats", { outputSha256: "d".repeat(64) }],
    ["observer uses evidence namespace", { observer: "evidence:post" }], ["evidence uses identity namespace", { id: "identity:post-observer" }], ["provenance uses evidence namespace", { provenanceRef: "evidence:post" }],
    ["provenance/artifact digest alias", { provenanceDigest: "b".repeat(64) }], ["artifact/output digest alias", { artifactSha256: "d".repeat(64) }], ["output/provenance digest alias", { outputSha256: "1".repeat(64) }],
    ["post absent", { packageState: "absent" }], ["package mismatch", { packageId: "git" }], ["version mismatch", { version: "2.0.0" }], ["location mismatch", { location: "/tmp/jq" }],
  ])("rejects contradictory pre/post evidence: %s", async (_name, change) => {
    const observations = [observation("pre", "identity:pre-observer", "2026-08-03T00:00:00.000Z"), { ...observation("post", "identity:post-observer", "2026-08-04T00:00:00.000Z"), ...change }];
    expect(await reason(await signed([entry({ observations: observations as AcquisitionVerificationEntry["observations"] })]))).not.toBe("independent-verification-required");
  });

  it.each(["commandDigest", "providerPolicyDigest", "mappingCatalogDigest", "mappingEntryDigest", "verificationPolicyDigest"] as const)("invalidates unchanged approvals when %s changes", async (key) => {
    const registry = await signed(); const changed = { ...registry, entries: [{ ...registry.entries[0]!, binding: { ...binding, [key]: "f".repeat(64) } }], digest: "" };
    expect(await reason({ ...changed, digest: await acquisitionVerificationDigest(changed) }, { ...request, binding: changed.entries[0]!.binding })).toBe("approval-invalid");
  });

  it.each([["native", false], ["fixture", true]] as const)("treats fabricated %s labels as structurally eligible only", async (source, fixture) => {
    const candidate = entry({ observations: entry().observations.map((item) => ({ ...item, source, fixture })) });
    await expect(resolveAcquisitionVerification(await signed([candidate]), request, now)).resolves.toMatchObject({ available: false, structurallyEligible: true, reason: "independent-verification-required" });
  });

  it("rejects every exact scope and binding mismatch", async () => {
    const scopeValues = { provider: "omarchy", capabilityId: "other", platform: "macos", architecture: "arm64", providerVersion: "4.6.1", packageKind: "cask" };
    for (const [key, value] of Object.entries(scopeValues)) expect(await reason(await signed(), { ...request, scope: { ...scope, [key]: value } } as VerificationRequest)).toBe("scope-mismatch");
    for (const key of Object.keys(binding)) expect(await reason(await signed(), { ...request, binding: { ...binding, [key]: key.endsWith("Id") ? `${key}:other` : "b".repeat(64) } } as VerificationRequest)).toBe("scope-mismatch");
  });

  it("rejects global duplicate and conflicting entries", async () => {
    expect(await reason(await signed([entry(), { ...entry(), scope: { ...scope, architecture: "arm64" } }]))).toBe("policy-invalid");
    expect(await reason(await signed([entry(), entry({ id: "verification:other", replayId: "replay:synthetic", scope: { ...scope, architecture: "arm64" } })]))).toBe("policy-invalid");
    const other = entry({ id: "verification:other", auditId: "audit:other", replayId: "replay:other", conflictsWith: ["verification:synthetic"], observations: entry().observations.map((item) => ({ ...item, id: `${item.id}-other` })) });
    expect(await reason(await signed([entry({ conflictsWith: ["verification:other"] }), other]))).toBe("ambiguous");
  });

  it("fails closed for plain-record and dense-array runtime exotics without mutation", async () => {
    const registry = await signed(); const before = JSON.stringify(registry); class Request extends Object {} class Observations extends Array<AcquisitionVerificationEntry["observations"][number]> {}
    const accessor = { ...request }; Object.defineProperty(accessor, "scope", { enumerable: true, get: () => scope }); const cycle = { ...request } as Record<string, unknown>; cycle.self = cycle;
    for (const candidate of [Object.create(request), Object.assign(new Request(), request), Object.assign(Object.create(null), request), accessor, { ...request, [Symbol("x")]: true }, null, cycle, { ...request, extra: true }])
      await expect(resolveAcquisitionVerification(registry, candidate as VerificationRequest, now)).resolves.toMatchObject({ available: false });
    const sparse = new Array(2); const exotic = entry({ observations: Observations.from(entry().observations) });
    for (const observations of [sparse, exotic.observations]) expect(await reason({ ...registry, entries: [entry({ observations })] })).toBeDefined();
    expect(JSON.stringify(registry)).toBe(before);
    expect(await acquisitionVerificationApprovalSubjectDigest(cycle)).toBe("");
    expect(await acquisitionVerificationDigest(null as unknown as AcquisitionVerificationRegistry)).toBe("");
  });

  it("has no production imports or wiring and preserves typed-unavailable execution", async () => {
    const root = new URL("../../src/", import.meta.url); const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".ts") && !file.endsWith("domain/acquisition-verification.ts") && !file.endsWith("infrastructure/verification/draft-acquisition-verification.ts"));
    const sources = await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8"))); expect(sources.join("\n")).not.toMatch(/resolveAcquisitionVerification|draftAcquisitionVerification/);
    expect(await readFile(new URL("../../src/application/ports/package-execution.ts", import.meta.url), "utf8")).toMatch(/PackageExecutionUnavailable/);
  });
});
