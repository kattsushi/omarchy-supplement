import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  commandEvidenceContextDigest, commandPolicyDigest, resolveOmarchyCommandPolicy, validateCommandPolicyIntegrity,
  type CommandApprovalRole, type CommandPolicyStatus, type CommandScope, type OmarchyCommandPolicyEntry, type OmarchyCommandPolicyRegistry,
} from "../../src/domain/omarchy-command-policy.js";
import { createProviderCommandPolicy, type ProviderCommandPolicySpecialization } from "../../src/domain/provider-command-policy.js";
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
  evidenceId: "evidence:fixture-test", context: "bind:fixture-test", outputSha256: hash, observedAt: "2026-08-02T00:00:00.000Z", freshUntil: "2026-09-01T00:00:00.000Z" };
const entry: OmarchyCommandPolicyEntry = {
  id: "policy:fixture-test", version: "1.0.0", status: "approved", owner: "owner:fixture-test", preparer: "preparer:fixture-test", scope,
  grammar: { executable: "fixture-bin", route: ["fixture-route"], positionals: [{ name: "target", cardinality: "required", canonicalization: "lowercase", pattern: "^(?:[a-z]+)$" }],
    options: [{ token: "--fixture-flag", kind: "flag", cardinality: "required" }, { token: "--fixture-value", kind: "value", cardinality: "optional", valuePattern: "^(?:[a-z]+)$" }] },
  privilege: "user", prompt: "noninteractive", network: "forbidden", disclosure: "none", sideEffect: "mutating", confirmation: "required",
  rollbackRef: "rollback:fixture-test", reassessmentRef: "reassess:fixture-test", approvals, evidence: [evidence], lifecycle,
  supersedes: [], conflictsWith: [],
};
async function signed(overrides: Partial<OmarchyCommandPolicyRegistry> = {}, entries: readonly OmarchyCommandPolicyEntry[] = [entry]) {
  const bound = await Promise.all(entries.map(async (candidate) => { const context = await commandEvidenceContextDigest(candidate); return {
    ...candidate, evidence: candidate.evidence.map((item) => item.context === "bind:fixture-test" ? { ...item, context } : item),
  }; }));
  const registry: OmarchyCommandPolicyRegistry = { schemaVersion: "OmarchyCommandPolicyRegistryV1", id: "policy:fixture-test-registry", version: "1.0.0", status: "approved",
    owner: "owner:registry-test", preparer: "preparer:registry-test", requiredApprovals: ["security", "omarchy-native-capability"], approvals, lifecycle, entries: bound, digest: "", ...overrides };
  return { ...registry, digest: await commandPolicyDigest(registry) };
}
const resolve = async (registry: OmarchyCommandPolicyRegistry, candidateScope = scope, argv: readonly string[] = ["fixture-bin", "fixture-route", "target", "--fixture-flag"]) =>
  resolveOmarchyCommandPolicy(registry, candidateScope, argv, now);
const reason = async (registry: OmarchyCommandPolicyRegistry, candidateScope = scope, argv?: readonly string[]) => {
  const result = await resolve(registry, candidateScope, argv); return result.available ? undefined : result.reason;
};
type Specialization = ProviderCommandPolicySpecialization<"OmarchyCommandPolicyRegistryV1", CommandScope, CommandApprovalRole>;
const generic = (overrides: Partial<Specialization> = {}) => createProviderCommandPolicy({ schemaVersion: "OmarchyCommandPolicyRegistryV1",
  reviewerRoles: ["security", "omarchy-native-capability"], scopeKeys: ["platform", "architecture", "omarchyGeneration", "observedOmarchyVersion", "provider", "capabilityId", "variantId", "binaryIdentity"],
  validScope: () => true, validRegistryVersion: () => true, validEntryVersion: () => true, evidenceContext: () => ({}), ...overrides });

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
  it("resolves one fully valid approved policy without asserting external reviewer authenticity", async () => {
    expect(await resolve(await signed({}, [{ ...entry, evidence: [{ ...evidence, fixture: false }] }]))).toMatchObject({ available: true, entry: { id: entry.id } });
  });
  it.each([
    ["undefined entry", { entries: [undefined] }], ["null entries", { entries: null }],
    ["null scope", { entries: [{ ...entry, scope: null }] }], ["malformed options", { entries: [{ ...entry, grammar: { ...entry.grammar, options: null } }] }],
  ])("fails closed without throwing for malformed runtime %s", async (_name, change) => {
    const malformed = { ...await signed(), ...change } as unknown as OmarchyCommandPolicyRegistry;
    await expect(validateCommandPolicyIntegrity(malformed)).resolves.toBe(false);
    await expect(resolve(malformed)).resolves.toMatchObject({ available: false, reason: "integrity-invalid" });
  });
  it("rejects a malformed nested shape even when its digest matches", async () => {
    const malformed = { ...await signed(), entries: [{ ...entry, scope: null }], digest: "" } as unknown as OmarchyCommandPolicyRegistry;
    const matching = { ...malformed, digest: await commandPolicyDigest(malformed) };
    await expect(resolve(matching)).resolves.toMatchObject({ available: false, reason: "policy-invalid" });
  });
  it("rejects inherited, exotic, and cyclic policy records while preserving plain JSON", async () => {
    const base = await signed({}, [{ ...entry, evidence: [{ ...evidence, fixture: false }] }]); const item = base.entries[0]!;
    class PolicyRecord {} const cyclic = { ...item.scope } as Record<string, unknown>; cyclic.self = cyclic;
    const candidates: unknown[] = [Object.create(base),
      { ...base, entries: [Object.create(item)] }, { ...base, entries: [{ ...item, scope: Object.create(item.scope) }] },
      { ...base, entries: [{ ...item, grammar: Object.create(item.grammar) }] }, { ...base, entries: [{ ...item, evidence: [Object.create(item.evidence[0]!)] }] },
      { ...base, entries: [Object.assign(new PolicyRecord(), item)] }, { ...base, entries: [Object.assign(Object.create(null), item)] },
      { ...base, entries: [{ ...item, scope: cyclic }] },
    ];
    for (const candidate of candidates) { await expect(validateCommandPolicyIntegrity(candidate as OmarchyCommandPolicyRegistry)).resolves.toBe(false);
      await expect(resolve(candidate as OmarchyCommandPolicyRegistry)).resolves.toMatchObject({ available: false }); }
    await expect(resolve(JSON.parse(JSON.stringify(base)) as OmarchyCommandPolicyRegistry)).resolves.toMatchObject({ available: true });
  });
  it("rejects non-plain external scopes", async () => {
    class ScopeRecord {} const accessor = { ...scope }; Object.defineProperty(accessor, "architecture", { enumerable: true, get: () => scope.architecture });
    const candidates: unknown[] = [Object.create(scope), Object.assign(new ScopeRecord(), scope), Object.assign(Object.create(null), scope), accessor,
      { ...scope, [Symbol("extra")]: "x" }, { ...scope, extra: () => "x" }]; const registry = await signed({}, [{ ...entry, evidence: [{ ...evidence, fixture: false }] }]);
    for (const candidate of candidates) await expect(resolve(registry, candidate as CommandScope)).resolves.toMatchObject({ available: false, reason: "scope-mismatch" });
  });
  it("rejects exotic external argv while preserving dense arrays", async () => {
    const ordinary = ["fixture-bin", "fixture-route", "target", "--fixture-flag"]; class Args extends Array<string> {} const accessor = [...ordinary];
    Object.defineProperty(accessor, "0", { enumerable: true, get: () => ordinary[0] }); const candidates = [Args.from(ordinary), accessor, Object.assign([...ordinary], { slice: () => [] })];
    const registry = await signed({}, [{ ...entry, evidence: [{ ...evidence, fixture: false }] }]);
    for (const candidate of candidates) await expect(resolve(registry, scope, candidate)).resolves.toMatchObject({ available: false, reason: "argument-invalid" });
    await expect(resolve(registry, scope, ordinary)).resolves.toMatchObject({ available: true });
  });
  it("rejects sparse and extra-key security arrays without throwing", async () => {
    const holes = <T>(length: number) => new Array<T>(length); const keyed = Object.assign(["fixture-route"], { extra: "unsupported" });
    const candidates: readonly [string, unknown][] = [
      ["entries", holes<OmarchyCommandPolicyEntry>(1)], ["route", [{ ...entry, grammar: { ...entry.grammar, route: holes<string>(1) } }]],
      ["positionals", [{ ...entry, grammar: { ...entry.grammar, positionals: holes(1) } }]], ["options", [{ ...entry, grammar: { ...entry.grammar, options: holes(1) } }]],
      ["approvals", [{ ...entry, approvals: holes(2) }]], ["extra route key", [{ ...entry, grammar: { ...entry.grammar, route: keyed } }]],
    ];
    for (const [_name, entries] of candidates) { const malformed = { ...await signed(), entries } as OmarchyCommandPolicyRegistry;
      await expect(validateCommandPolicyIntegrity(malformed)).resolves.toBe(false); await expect(resolve(malformed)).resolves.toMatchObject({ available: false, reason: "integrity-invalid" }); }
  });
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
    ["future native evidence", [{ ...evidence, fixture: false, observedAt: "2026-08-11T00:00:00.000Z" }]],
    ["pre-effective native evidence", [{ ...evidence, fixture: false, observedAt: "2026-07-31T00:00:00.000Z" }]],
    ["freshness beyond review", [{ ...evidence, fixture: false, freshUntil: "2026-09-02T00:00:00.000Z" }]],
    ["unbound native evidence", [{ ...evidence, fixture: false, context: hash.replace(/^a/, "b") }]],
  ])("rejects %s as native evidence", async (_name, candidate) => {
    expect(await resolve(await signed({}, [{ ...entry, evidence: candidate }]))).toEqual({ available: false, reason: "native-evidence-invalid" });
  });
  it.each([
    ["blank repository", { ...evidence, repository: " " }], ["padded identity", { ...evidence, evidenceId: " evidence:fixture-test " }],
    ["malformed hash", { ...evidence, outputSha256: "A".repeat(64) }], ["malformed timestamp", { ...evidence, observedAt: "bad" }],
    ["non-boolean fixture marker", { ...evidence, fixture: "false" as unknown as boolean }],
  ])("rejects %s provenance", async (_name, candidate) => {
    expect(await resolve(await signed({}, [{ ...entry, evidence: [candidate] }]))).toEqual({ available: false, reason: "provenance-invalid" });
  });
  it.each([
    ["before effective", { ...lifecycle, effectiveFrom: "2026-08-11T00:00:00.000Z" }], ["review overdue", { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" }],
    ["support expired", { ...lifecycle, supportedUntil: "2026-08-09T00:00:00.000Z" }],
  ])("rejects entry lifecycle %s", async (_name, candidate) => { expect(await reason(await signed({}, [{ ...entry, lifecycle: candidate }]))).toBe("outside-window"); });
  it("rejects registry lifecycle", async () => { expect(await reason(await signed({ lifecycle: { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" } }))).toBe("outside-window"); });
  it("rejects inverted lifecycle ordering", async () => {
    expect(await reason(await signed({}, [{ ...entry, lifecycle: { ...lifecycle, reviewBy: "2026-10-02T00:00:00.000Z" } }]))).toBe("outside-window");
  });
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
    ["missing positional", ["fixture-bin", "fixture-route", "--fixture-flag"]], ["missing required option", ["fixture-bin", "fixture-route", "target"]],
    ["extra", ["fixture-bin", "fixture-route", "target", "extra", "--fixture-flag"]], ["padded", ["fixture-bin", "fixture-route", " target", "--fixture-flag"]],
    ["undeclared option", ["fixture-bin", "fixture-route", "target", "--fixture-flag", "--other"]],
    ["duplicate option", ["fixture-bin", "fixture-route", "target", "--fixture-flag", "--fixture-flag"]],
    ["missing option value", ["fixture-bin", "fixture-route", "target", "--fixture-flag", "--fixture-value"]],
    ["padded option value", ["fixture-bin", "fixture-route", "target", "--fixture-flag", "--fixture-value", " value"]],
    ["mismatch", ["fixture-bin", "wrong", "target", "--fixture-flag"]],
  ])("rejects %s arguments", async (_name, argv) => { expect(await reason(await signed(), scope, argv)).toBe("argument-invalid"); });
  it("rejects unanchored argument patterns as policy-invalid", async () => {
    const grammar = { ...entry.grammar, positionals: [{ ...entry.grammar.positionals[0]!, pattern: "[a-z]+" }] };
    expect(await reason(await signed({}, [{ ...entry, grammar }]))).toBe("policy-invalid");
  });
  it("refuses ambiguous exact policies without choosing", async () => {
    expect(await resolve(await signed({}, [entry, { ...entry, id: "policy:fixture-test-duplicate" }]))).toEqual({ available: false, reason: "ambiguous" });
  });
  it("rejects superseded and conflicting exact policies", async () => {
    expect(await reason(await signed({}, [{ ...entry, supersededBy: "policy:fixture-test-next" }]))).toBe("entry-not-approved");
    expect(await reason(await signed({}, [entry, { ...entry, id: "policy:fixture-test-next", conflictsWith: [entry.id] }]))).toBe("ambiguous");
  });
  it("rejects duplicate stable IDs globally before scope filtering", async () => {
    const duplicate = { ...entry, version: "2.0.0", scope: { ...scope, architecture: "arm64" } };
    expect(await reason(await signed({}, [entry, duplicate]))).toBe("policy-invalid");
    expect(await reason(await signed({}, [{ ...entry, id: " policy:other-test ", scope: duplicate.scope }]))).toBe("policy-invalid");
  });
  it("fails closed at the generic specialization boundary", async () => {
    const registry = await signed({}, [{ ...entry, evidence: [{ ...evidence, fixture: false }] }]); const argv = ["fixture-bin", "fixture-route", "target", "--fixture-flag"]; const calls = { scope: 0, registry: 0, entry: 0, relationship: 0, context: 0 };
    const core = generic({ validScope: () => (++calls.scope, true), validRegistryVersion: () => (++calls.registry, true), validEntryVersion: () => (++calls.entry, true), evidenceContext: () => (++calls.context, {}) });
    expect(await core.resolve(registry, scope, argv, now)).toMatchObject({ available: true });
    expect(calls).toEqual({ scope: 2, registry: 1, entry: 1, relationship: 0, context: 1 });
    const relationship = generic({ validEntryRelationship: (candidate) => { calls.relationship++; expect(candidate).not.toBe(entry);
      expect([candidate, candidate.scope, candidate.grammar].every(Object.isFrozen)).toBe(true); return true; } });
    expect(await relationship.resolve(registry, scope, argv, now)).toMatchObject({ available: true }); expect(calls.relationship).toBe(1);
    expect(await core.evidenceContextDigest(entry)).not.toBe(await core.evidenceContextDigest({ ...entry, scope: { ...scope, architecture: "arm64" } }));
    const mutate = generic({ validScope: (candidate) => ((candidate as { architecture: string }).architecture = "collapsed", true) });
    await expect(mutate.resolve(registry, scope, [], now)).resolves.toMatchObject({ available: false, reason: "scope-mismatch" }); expect(scope.architecture).toBe("x86_64");
    const throws = () => { throw new Error("provider"); };
    for (const callbacks of [{ validScope: () => ({}) as unknown as boolean }, { validRegistryVersion: () => ({}) as unknown as boolean }, { validEntryVersion: () => ({}) as unknown as boolean }, { validRegistryVersion: throws }, { validEntryVersion: throws }])
      await expect(generic(callbacks).resolve(registry, scope, [], now)).resolves.toMatchObject({ available: false });
    for (const validEntryRelationship of [throws, () => ({}) as unknown as boolean, () => Promise.resolve(true) as unknown as boolean,
      (candidate: Pick<OmarchyCommandPolicyEntry, "scope" | "grammar">) => ((candidate.scope as { architecture: string }).architecture = "mutated", true)])
      await expect(generic({ validEntryRelationship }).resolve(registry, scope, argv, now)).resolves.toMatchObject({ available: false, reason: "policy-invalid" });
    expect(entry.scope.architecture).toBe("x86_64");
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const evidenceContext of [throws, () => cyclic]) {
      const invalid = generic({ evidenceContext }); await expect(invalid.evidenceContextDigest(entry)).resolves.toMatch(/^[a-f0-9]{64}$/);
      await expect(invalid.resolve(registry, scope, argv, now)).resolves.toMatchObject({ available: false, reason: "native-evidence-invalid" });
    }
  });
  it("stays absent from production composition", async () => {
    const sources = await Promise.all(["read-only.ts", "mutation.ts"].map((file) => readFile(new URL(`../../src/composition/${file}`, import.meta.url), "utf8")));
    expect(sources.join("\n")).not.toMatch(/draftOmarchyCommandPolicy|resolveOmarchyCommandPolicy|omarchy-command-policy/);
  });
});
