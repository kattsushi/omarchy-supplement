import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  homebrewCommandEvidenceContextDigest, homebrewCommandPolicyDigest, resolveHomebrewCommandPolicy,
  validateHomebrewCommandPolicyIntegrity, type HomebrewCommandPolicyEntry, type HomebrewCommandPolicyRegistry, type HomebrewCommandScope,
} from "../../src/domain/homebrew-command-policy.js";
import { draftHomebrewCommandPolicy } from "../../src/infrastructure/providers/draft-homebrew-command-policy.js";

const now = new Date("2026-08-10T00:00:00.000Z"); const hash = "a".repeat(64);
const linux: HomebrewCommandScope = { platform: "linux", architecture: "architecture:x86_64", distribution: "linuxbrew", packageKind: "formula",
  provider: "homebrew", capabilityId: "homebrew-formula", observedHomebrewVersion: "4.6.0", binaryIdentity: "binary:brew@synthetic",
  brewPrefix: "/home/linuxbrew/.linuxbrew", variantId: "variant:none" };
const macos: HomebrewCommandScope = { ...linux, platform: "macos", architecture: "architecture:arm64", distribution: "homebrew-macos", packageKind: "cask",
  capabilityId: "homebrew-cask", brewPrefix: "/opt/homebrew", variantId: "variant:synthetic" };
const lifecycle = { effectiveFrom: "2026-08-01T00:00:00.000Z", reviewBy: "2026-09-01T00:00:00.000Z", supportedUntil: "2026-10-01T00:00:00.000Z" };
const approvals = [
  { role: "security" as const, reviewer: "reviewer:security-synthetic", decision: "approved" as const, decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${hash}` },
  { role: "homebrew-native-capability" as const, reviewer: "reviewer:homebrew-synthetic", decision: "approved" as const, decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${hash}` },
];
const evidence = { source: "native" as const, fixture: false, repository: "https://example.test/synthetic-only", commitSha: hash, artifactSha256: hash,
  evidenceId: "evidence:synthetic-only", context: "bind:synthetic", outputSha256: hash, observedAt: "2026-08-02T00:00:00.000Z", freshUntil: "2026-09-01T00:00:00.000Z" };
const grammar = (kind: HomebrewCommandScope["packageKind"], options: HomebrewCommandPolicyEntry["grammar"]["options"] = []) => ({
  executable: "brew", route: ["install"], positionals: [{ name: kind, cardinality: "required" as const, canonicalization: "lowercase" as const,
    pattern: kind === "formula" ? "^(?:[a-z0-9][a-z0-9@+._-]*)$" : "^(?:[a-z0-9][a-z0-9-]*)$" }], options,
});
const entryFor = (scope: HomebrewCommandScope, id = `policy:${scope.packageKind}-synthetic`): HomebrewCommandPolicyEntry => ({
  id, version: "1.0.0", status: "approved", owner: "owner:synthetic", preparer: "preparer:synthetic", scope, grammar: grammar(scope.packageKind),
  privilege: "user", prompt: "noninteractive", network: "required", disclosure: "bounded", sideEffect: "mutating", confirmation: "required",
  rollbackRef: "rollback:synthetic", reassessmentRef: "reassess:synthetic", approvals, evidence: [evidence], lifecycle, supersedes: [], conflictsWith: [],
});
async function signed(entries: readonly HomebrewCommandPolicyEntry[], overrides: Partial<HomebrewCommandPolicyRegistry> = {}) {
  const bound = await Promise.all(entries.map(async (entry) => { const context = await homebrewCommandEvidenceContextDigest(entry);
    return { ...entry, evidence: entry.evidence.map((item) => item.context === "bind:synthetic" ? { ...item, context } : item) }; }));
  const registry: HomebrewCommandPolicyRegistry = { schemaVersion: "HomebrewCommandPolicyRegistryV1", id: "policy:homebrew-synthetic-registry", version: "1.0.0",
    status: "approved", owner: "owner:registry-synthetic", preparer: "preparer:registry-synthetic", requiredApprovals: ["security", "homebrew-native-capability"],
    approvals, lifecycle, entries: bound, digest: "", ...overrides };
  return { ...registry, digest: await homebrewCommandPolicyDigest(registry) };
}
const reason = async (registry: HomebrewCommandPolicyRegistry, scope: HomebrewCommandScope, argv: readonly string[]) => {
  const result = await resolveHomebrewCommandPolicy(registry, scope, argv, now); return result.available ? undefined : result.reason;
};

describe("Homebrew command policy", () => {
  it("ships an integrity-valid empty draft that has no claimed policy roles or authority", async () => {
    expect(draftHomebrewCommandPolicy).toMatchObject({ version: "0.1.0", status: "draft", owner: "kattsushi", preparer: "", requiredApprovals: [], approvals: [], entries: [] });
    expect(await validateHomebrewCommandPolicyIntegrity(draftHomebrewCommandPolicy)).toBe(true);
    await expect(resolveHomebrewCommandPolicy(draftHomebrewCommandPolicy, linux, ["brew", "install", "jq"], now)).resolves.toEqual({ available: false, reason: "registry-not-approved" });
  });

  it.each([[linux, "jq"], [macos, "visual-studio-code"]] as const)("resolves synthetic %s mechanics without asserting real command correctness", async (scope, name) => {
    await expect(resolveHomebrewCommandPolicy(await signed([entryFor(scope)]), scope, ["brew", "install", name], now)).resolves.toMatchObject({ available: true });
  });

  it.each([
    ["platform", { ...linux, platform: "macos" }], ["distribution", { ...linux, distribution: "homebrew-macos" }], ["prefix", { ...linux, brewPrefix: "/opt/homebrew" }],
    ["version", { ...linux, observedHomebrewVersion: "4.6.1" }], ["binary", { ...linux, binaryIdentity: "binary:other" }],
    ["architecture", { ...linux, architecture: "architecture:arm64" }], ["kind", { ...linux, packageKind: "cask" }],
    ["capability", { ...linux, capabilityId: "homebrew-cask" }], ["variant", { ...linux, variantId: "variant:other" }],
  ] as const)("rejects exact %s mismatch", async (_name, scope) => expect(await reason(await signed([entryFor(linux)]), scope as HomebrewCommandScope, ["brew", "install", "jq"])).toBe("scope-mismatch"));

  it.each([
    ["platform", { ...linux, platform: "windows" }], ["distribution", { ...linux, distribution: "macports" }], ["kind", { ...linux, packageKind: "bottle" }],
    ["provider", { ...linux, provider: "apt" }], ["capability", { ...linux, capabilityId: "homebrew-service" }],
    ["linux/macOS distribution", { ...linux, platform: "macos" }], ["kind/capability", { ...linux, capabilityId: "homebrew-cask" }],
    ["version", { ...linux, observedHomebrewVersion: "latest" }], ["architecture", { ...linux, architecture: "x86_64" }],
  ])("rejects invalid runtime %s", async (_name, scope) => expect(await reason(await signed([entryFor(linux)]), scope as HomebrewCommandScope, ["brew", "install", "jq"])).toBe("scope-mismatch"));

  it("enforces exact formula and cask grammar, including explicitly declared synthetic flags", async () => {
    const cask = { ...entryFor(macos), grammar: grammar("cask", [{ token: "--cask", kind: "flag", cardinality: "required" }]) };
    await expect(resolveHomebrewCommandPolicy(await signed([cask]), macos, ["brew", "install", "--cask", "visual-studio-code"], now)).resolves.toMatchObject({ available: true });
    await expect(resolveHomebrewCommandPolicy(await signed([entryFor(linux)]), linux, ["brew", "install", "jq"], now)).resolves.toMatchObject({ available: true });
    expect(await reason(await signed([entryFor(macos)]), macos, ["brew", "install", "Visual-Studio-Code"])).toBe("argument-invalid");
  });

  it.each([
    ["shell route", ["sh", "-c", "brew install jq"]], ["metacharacters", ["brew", "install", "jq;id"]], ["extra package", ["brew", "install", "jq", "git"]],
    ["padded", ["brew", "install", " jq"]], ["undeclared", ["brew", "install", "jq", "--other"]], ["force", ["brew", "install", "jq", "--force"]],
    ["HEAD", ["brew", "install", "jq", "--HEAD"]], ["source", ["brew", "install", "jq", "--build-from-source"]], ["formula", ["brew", "install", "--formula", "jq"]],
    ["cask", ["brew", "install", "--cask", "jq"]], ["update", ["brew", "update"]], ["upgrade", ["brew", "upgrade", "jq"]], ["tap", ["brew", "tap", "x/y"]],
    ["untap", ["brew", "untap", "x/y"]], ["uninstall", ["brew", "uninstall", "jq"]], ["cleanup", ["brew", "cleanup"]],
    ["services", ["brew", "services", "start", "x"]], ["bundle", ["brew", "bundle"]],
  ])("rejects %s argv", async (_name, argv) => expect(await reason(await signed([entryFor(linux)]), linux, argv)).toBe("argument-invalid"));

  it.each([
    ["missing", []], ["fixture", [{ ...evidence, fixture: true }]], ["structural", [{ ...evidence, source: "structural" }]],
    ["future", [{ ...evidence, observedAt: "2026-08-11T00:00:00.000Z" }]], ["stale", [{ ...evidence, freshUntil: "2026-08-09T00:00:00.000Z" }]],
    ["unbound", [{ ...evidence, context: "b".repeat(64) }]],
  ] as const)("rejects %s native evidence", async (_name, evidence) => {
    const registry = await signed([{ ...entryFor(linux), evidence: evidence as HomebrewCommandPolicyEntry["evidence"] }]);
    expect(await reason(registry, linux, ["brew", "install", "jq"])).toBe("native-evidence-invalid");
  });

  it("binds native evidence across platform context", async () => {
    const macContext = await homebrewCommandEvidenceContextDigest(entryFor(macos)); const candidate = { ...entryFor(linux), evidence: [{ ...evidence, context: macContext }] };
    const registry = await signed([entryFor(linux)]); const unbound = { ...registry, entries: [candidate], digest: "" };
    expect(await reason({ ...unbound, digest: await homebrewCommandPolicyDigest(unbound) }, linux, ["brew", "install", "jq"])).toBe("native-evidence-invalid");
  });

  it.each([
    ["self-review", { approvals: [{ ...approvals[0]!, reviewer: "owner:synthetic" }, approvals[1]!] }],
    ["duplicate reviewer", { approvals: [approvals[0]!, { ...approvals[1]!, reviewer: approvals[0]!.reviewer }] }],
    ["bad signoff", { approvals: [{ ...approvals[0]!, signoffRef: "sha256:bad" }, approvals[1]!] }],
    ["future lifecycle", { lifecycle: { ...lifecycle, effectiveFrom: "2026-08-11T00:00:00.000Z" } }],
  ])("rejects %s", async (_name, change) => expect(await reason(await signed([{ ...entryFor(linux), ...change }]), linux, ["brew", "install", "jq"])).toBeDefined());

  it("rejects tampering, unapproved entries, and ambiguity", async () => {
    const registry = await signed([entryFor(linux)]); expect(await validateHomebrewCommandPolicyIntegrity({ ...registry, owner: "tampered" })).toBe(false);
    expect(await reason(await signed([{ ...entryFor(linux), status: "draft" }]), linux, ["brew", "install", "jq"])).toBe("entry-not-approved");
    expect(await reason(await signed([entryFor(linux), entryFor(linux, "policy:formula-other")]), linux, ["brew", "install", "jq"])).toBe("ambiguous");
  });

  it("inherits fail-closed handling for representative prototype, accessor, symbol, null, cycle, sparse, and exotic inputs", async () => {
    const registry = await signed([entryFor(linux)]); const accessor = { ...linux }; Object.defineProperty(accessor, "architecture", { enumerable: true, get: () => linux.architecture });
    const cyclic = { ...linux } as Record<string, unknown>; cyclic.self = cyclic; class Scope extends Object {} class Args extends Array<string> {}
    for (const scope of [Object.create(linux), Object.assign(new Scope(), linux), Object.assign(Object.create(null), linux), accessor, { ...linux, [Symbol("x")]: "x" }, null, cyclic])
      await expect(resolveHomebrewCommandPolicy(registry, scope as HomebrewCommandScope, ["brew", "install", "jq"], now)).resolves.toMatchObject({ available: false });
    const sparse = new Array<string>(3); for (const argv of [Args.from(["brew", "install", "jq"]), sparse])
      await expect(resolveHomebrewCommandPolicy(registry, linux, argv, now)).resolves.toMatchObject({ available: false });
  });

  it("has no production imports or wiring and leaves the typed-unavailable composition untouched", async () => {
    const root = new URL("../../src/", import.meta.url); const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".ts") && !file.endsWith("domain/homebrew-command-policy.ts") && !file.endsWith("infrastructure/providers/draft-homebrew-command-policy.ts"));
    const sources = await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8")));
    expect(sources.join("\n")).not.toMatch(/homebrew-command-policy|draftHomebrewCommandPolicy|resolveHomebrewCommandPolicy/);
    expect(sources.join("\n")).toMatch(/PackageExecutionUnavailable/);
  });
});
