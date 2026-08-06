import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  commandPolicyDigest, resolveOmarchyCommandPolicy, validateCommandPolicyIntegrity,
  type CommandPolicyStatus, type CommandScope, type OmarchyCommandPolicyEntry, type OmarchyCommandPolicyRegistry,
} from "../../src/domain/omarchy-command-policy.js";
import { draftOmarchyCommandPolicy } from "../../src/infrastructure/providers/draft-omarchy-command-policy.js";

const now = new Date("2026-08-10T00:00:00.000Z"); const hash = "a".repeat(64);
const scope: CommandScope = { platform: "linux", architecture: "x86_64", omarchyGeneration: "omarchy-3", observedOmarchyVersion: "3.2.1",
  provider: "omarchy", capabilityId: "capability:fixture-test", variantId: "variant:fixture-test", binaryIdentity: "binary:fixture-test" };
const lifecycle = { effectiveFrom: "2026-08-01T00:00:00.000Z", reviewBy: "2026-09-01T00:00:00.000Z", supportedUntil: "2026-10-01T00:00:00.000Z" };
const approvals = [
  { role: "security" as const, reviewer: "reviewer:security-test", decision: "approved" as const, decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${hash}` },
  { role: "omarchy-native-capability" as const, reviewer: "reviewer:native-test", decision: "approved" as const, decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${hash}` },
];
const evidence = { source: "native" as const, fixture: true, repository: "https://example.test/fixture", commitSha: hash, artifactSha256: hash,
  evidenceId: "evidence:fixture-test", context: "fixture-test-only", outputSha256: hash, observedAt: "2026-08-02T00:00:00.000Z", freshUntil: "2026-09-01T00:00:00.000Z" };
const entry: OmarchyCommandPolicyEntry = {
  id: "policy:fixture-test", version: "1.0.0", status: "approved", owner: "owner:fixture-test", preparer: "preparer:fixture-test", scope,
  grammar: { executable: "fixture-bin", route: ["fixture-route"], positionals: [{ name: "target", cardinality: "required", canonicalization: "lowercase", pattern: "^[a-z]+$" }],
    options: [{ token: "--fixture-flag", kind: "flag" }, { token: "--fixture-value", kind: "value", valuePattern: "^[a-z]+$" }] },
  privilege: "user", prompt: "noninteractive", network: "forbidden", disclosure: "none", sideEffect: "mutating", confirmation: "required",
  rollbackRef: "rollback:fixture-test", reassessmentRef: "reassess:fixture-test", approvals, evidence: [evidence], lifecycle,
  supersedes: [], conflictsWith: [],
};
async function signed(overrides: Partial<OmarchyCommandPolicyRegistry> = {}, entries: readonly OmarchyCommandPolicyEntry[] = [entry]) {
  const registry: OmarchyCommandPolicyRegistry = { schemaVersion: "OmarchyCommandPolicyRegistryV1", id: "policy:fixture-test-registry", version: "1.0.0", status: "approved",
    owner: "owner:registry-test", preparer: "preparer:registry-test", requiredApprovals: ["security", "omarchy-native-capability"], approvals, lifecycle, entries, digest: "", ...overrides };
  return { ...registry, digest: await commandPolicyDigest(registry) };
}
const resolve = async (registry: OmarchyCommandPolicyRegistry, candidateScope = scope, argv: readonly string[] = ["fixture-bin", "fixture-route", "target"]) =>
  resolveOmarchyCommandPolicy(registry, candidateScope, argv, now);
const reason = async (registry: OmarchyCommandPolicyRegistry, candidateScope = scope, argv?: readonly string[]) => {
  const result = await resolve(registry, candidateScope, argv); return result.available ? undefined : result.reason;
};

describe("draft Omarchy command policy", () => {
  it("ships an empty integrity-valid draft that is unavailable", async () => {
    expect(draftOmarchyCommandPolicy.entries).toEqual([]); expect(await validateCommandPolicyIntegrity(draftOmarchyCommandPolicy)).toBe(true);
    expect(await resolve(draftOmarchyCommandPolicy, scope)).toEqual({ available: false, reason: "registry-not-approved" });
  });
  it("rejects every non-approved registry and entry status", async () => {
    const statuses: CommandPolicyStatus[] = ["draft", "in-review", "rejected", "deprecated", "superseded"];
    for (const status of statuses) { expect((await resolve(await signed({ status }))).available).toBe(false); expect((await resolve(await signed({}, [{ ...entry, status }]))).available).toBe(false); }
  });
  it("detects tampering", async () => { const registry = await signed(); expect(await validateCommandPolicyIntegrity({ ...registry, owner: "tampered" })).toBe(false); });
  it.each([
    ["blank owner", { owner: " " }], ["padded identity", { id: " policy:fixture-test " }], ["malformed version", { version: "latest" }],
    ["padded preparer", { preparer: " preparer:fixture-test " }], ["owner self approval", { approvals: [{ ...approvals[0]!, reviewer: entry.owner }, approvals[1]!] }],
    ["preparer self approval", { approvals: [{ ...approvals[0]!, reviewer: entry.preparer }, approvals[1]!] }],
    ["duplicate reviewer", { approvals: [approvals[0]!, { ...approvals[1]!, reviewer: approvals[0]!.reviewer }] }],
    ["malformed signoff", { approvals: [{ ...approvals[0]!, signoffRef: "sha256:bad" }, approvals[1]!] }],
    ["padded timestamp", { approvals: [{ ...approvals[0]!, decidedAt: " 2026-08-02T00:00:00.000Z" }, approvals[1]!] }],
  ])("rejects %s", async (_name, change) => { expect((await resolve(await signed({}, [{ ...entry, ...change }]))).available).toBe(false); });
  it.each([
    ["missing evidence", []], ["fixture native evidence", [evidence]], ["fixture evidence", [{ ...evidence, source: "fixture" as const }]],
    ["structural evidence", [{ ...evidence, source: "structural" as const }]], ["stale native evidence", [{ ...evidence, fixture: false, freshUntil: "2026-08-09T00:00:00.000Z" }]],
  ])("rejects %s as native evidence", async (_name, candidate) => {
    expect(await resolve(await signed({}, [{ ...entry, evidence: candidate }]))).toEqual({ available: false, reason: "native-evidence-invalid" });
  });
  it.each([
    ["blank repository", { ...evidence, repository: " " }], ["padded identity", { ...evidence, evidenceId: " evidence:fixture-test " }],
    ["malformed hash", { ...evidence, outputSha256: "A".repeat(64) }], ["malformed timestamp", { ...evidence, observedAt: "bad" }],
  ])("rejects %s provenance", async (_name, candidate) => {
    expect(await resolve(await signed({}, [{ ...entry, evidence: [candidate] }]))).toEqual({ available: false, reason: "provenance-invalid" });
  });
  it.each([
    ["before effective", { ...lifecycle, effectiveFrom: "2026-08-11T00:00:00.000Z" }], ["review overdue", { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" }],
    ["support expired", { ...lifecycle, supportedUntil: "2026-08-09T00:00:00.000Z" }],
  ])("rejects entry lifecycle %s", async (_name, candidate) => { expect(await reason(await signed({}, [{ ...entry, lifecycle: candidate }]))).toBe("outside-window"); });
  it("rejects registry lifecycle", async () => { expect(await reason(await signed({ lifecycle: { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" } }))).toBe("outside-window"); });
  it.each([
    ["architecture", { ...scope, architecture: "arm64" }], ["version", { ...scope, observedOmarchyVersion: "3.2.2" }],
    ["capability", { ...scope, capabilityId: "capability:other-test" }], ["variant", { ...scope, variantId: "variant:other-test" }],
    ["binary", { ...scope, binaryIdentity: "binary:other-test" }], ["4.x", { ...scope, omarchyGeneration: "omarchy-4" as const, observedOmarchyVersion: "4.0.0" }],
  ])("rejects %s scope mismatch", async (_name, candidate) => { expect(await reason(await signed(), candidate)).toBe("scope-mismatch"); });
  it.each([
    ["platform", { ...scope, platform: "windows" }], ["generation", { ...scope, omarchyGeneration: "omarchy-5" }], ["provider", { ...scope, provider: "apt" }],
  ])("rejects invalid runtime %s", async (_name, candidate) => { expect((await resolve(await signed({}, [{ ...entry, scope: candidate as typeof scope }]), candidate as typeof scope)).available).toBe(false); });
  it.each([
    ["status", { status: "pending" }], ["privilege", { privilege: "root" }], ["prompt", { prompt: "sometimes" }], ["side effect", { sideEffect: "unknown" }],
  ])("rejects invalid runtime %s", async (_name, change) => { expect(await reason(await signed({}, [{ ...entry, ...change } as OmarchyCommandPolicyEntry]))).toBe("policy-invalid"); });
  it.each([
    ["missing", ["fixture-bin", "fixture-route"]], ["extra", ["fixture-bin", "fixture-route", "target", "extra"]], ["padded", ["fixture-bin", "fixture-route", " target"]],
    ["undeclared option", ["fixture-bin", "fixture-route", "target", "--other"]], ["mismatch", ["fixture-bin", "wrong", "target"]],
  ])("rejects %s arguments", async (_name, argv) => { expect(await reason(await signed(), scope, argv)).toBe("argument-invalid"); });
  it("refuses ambiguous exact policies without choosing", async () => {
    expect(await resolve(await signed({}, [entry, { ...entry, id: "policy:fixture-test-duplicate" }]))).toEqual({ available: false, reason: "ambiguous" });
  });
  it("rejects superseded and conflicting exact policies", async () => {
    expect(await reason(await signed({}, [{ ...entry, supersededBy: "policy:fixture-test-next" }]))).toBe("entry-not-approved");
    expect(await reason(await signed({}, [entry, { ...entry, id: "policy:fixture-test-next", conflictsWith: [entry.id] }]))).toBe("ambiguous");
  });
  it("stays absent from production composition", async () => {
    const sources = await Promise.all(["read-only.ts", "mutation.ts"].map((file) => readFile(new URL(`../../src/composition/${file}`, import.meta.url), "utf8")));
    expect(sources.join("\n")).not.toMatch(/draftOmarchyCommandPolicy|resolveOmarchyCommandPolicy|omarchy-command-policy/);
  });
});
