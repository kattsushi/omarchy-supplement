import { describe, expect, it } from "@effect/vitest";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { PackageMappingPort, PlatformFactsPort, ProviderDiscoveryPort } from "../../src/application/ports/workstation.js";
import { PlanPackageAcquisition } from "../../src/application/services/workstation.js";
import {
  mappingCatalogDigest,
  resolveMappingCatalogEntry,
  validateMappingCatalogIntegrity,
  type MappingCatalog,
  type MappingCatalogEntry,
  type MappingCatalogStatus,
} from "../../src/domain/mapping-catalog.js";
import { PlanDigestService } from "../../src/domain/plans.js";
import { ProgramId } from "../../src/domain/states.js";
import { makeCatalogMappingPort } from "../../src/infrastructure/mappings/catalog-mapping-port.js";
import { draftMappingCatalog } from "../../src/infrastructure/mappings/draft-mapping-catalog.js";

const now = new Date("2026-08-10T00:00:00.000Z");
const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
const scope = { programId, platform: "macos" as const, architecture: "arm64", omarchyGeneration: "unknown" as const,
  provider: "homebrew" as const, providerVersion: "4.6.0", providerRole: "primary" as const, capabilityId: "homebrew-formula" };
const mappingContext = { platform: scope.platform, architecture: scope.architecture, omarchyGeneration: scope.omarchyGeneration,
  providerVersion: scope.providerVersion, providerRole: scope.providerRole, capabilityId: scope.capabilityId };
const sha = "a".repeat(64);
const provenance = { repository: "https://example.test/repo", commitSha: sha, artifactSha256: sha, fixture: false } as const;
const lifecycle = { effectiveFrom: "2026-08-01T00:00:00.000Z", reviewBy: "2026-09-01T00:00:00.000Z", supportedUntil: "2026-10-01T00:00:00.000Z" };
const entry: MappingCatalogEntry = {
  id: "mapping:neovim-homebrew", version: "1.0.0", status: "approved", owner: "mapping-owner", preparer: "mapping-preparer", scope,
  safety: "reviewed-safe", mapping: { mappingId: "mapping:neovim-homebrew", packageName: "neovim", safe: true, alreadyPresent: false },
  approvals: [
    { role: "security", approver: "security-reviewer", decision: "approved", decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${sha}` },
    { role: "provider-policy", approver: "provider-reviewer", decision: "approved", decidedAt: "2026-08-02T00:00:00.000Z", signoffRef: `sha256:${sha}` },
  ],
  provenance, lifecycle, supersedes: [],
};

async function signed(overrides: Partial<MappingCatalog> = {}, entries: readonly MappingCatalogEntry[] = [entry]): Promise<MappingCatalog> {
  const unsigned: MappingCatalog = {
    schemaVersion: "MappingCatalogV1", version: "1.0.0", status: "approved", owner: "catalog-owner",
    requiredApprovals: ["security", "provider-policy"], provenance, lifecycle, entries, digest: "",
    ...overrides,
  };
  return { ...unsigned, digest: await mappingCatalogDigest(unsigned) };
}

describe("mapping catalog", () => {
  it("keeps the shipped empty draft unavailable with valid integrity", async () => {
    expect(await validateMappingCatalogIntegrity(draftMappingCatalog)).toBe(true);
    expect(await resolveMappingCatalogEntry(draftMappingCatalog, scope, now)).toEqual({ available: false, reason: "catalog-not-approved" });
  });

  it("rejects every non-approved catalog and entry status", async () => {
    const statuses: MappingCatalogStatus[] = ["draft", "in-review", "rejected", "deprecated", "superseded"];
    for (const status of statuses) {
      expect((await resolveMappingCatalogEntry(await signed({ status }), scope, now)).available).toBe(false);
      expect((await resolveMappingCatalogEntry(await signed({}, [{ ...entry, status }]), scope, now)).available).toBe(false);
    }
  });

  it.each([
    ["owner self-approval", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: entry.owner }, entry.approvals[1]!] }],
    ["catalog-owner self-approval", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: "catalog-owner" }, entry.approvals[1]!] }],
    ["preparer self-approval", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: entry.preparer! }, entry.approvals[1]!] }],
    ["blank reviewer", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: " " }, entry.approvals[1]!] }],
    ["invalid approval timestamp", { ...entry, approvals: [{ ...entry.approvals[0]!, decidedAt: "not-a-date" }, entry.approvals[1]!] }],
    ["empty approval timestamp", { ...entry, approvals: [{ ...entry.approvals[0]!, decidedAt: "" }, entry.approvals[1]!] }],
    ["noncanonical approval timestamp", { ...entry, approvals: [{ ...entry.approvals[0]!, decidedAt: "2026-08-02T00:00:00Z" }, entry.approvals[1]!] }],
    ["blank sign-off reference", { ...entry, approvals: [{ ...entry.approvals[0]!, signoffRef: " " }, entry.approvals[1]!] }],
    ["mutable sign-off reference", { ...entry, approvals: [{ ...entry.approvals[0]!, signoffRef: "signoff:latest" }, entry.approvals[1]!] }],
    ["rejected decision", { ...entry, approvals: [{ ...entry.approvals[0]!, decision: "rejected" as const }, entry.approvals[1]!] }],
    ["one reviewer filling both roles", { ...entry, approvals: [entry.approvals[0]!, { ...entry.approvals[1]!, approver: entry.approvals[0]!.approver }] }],
    ["missing provenance", { ...entry, provenance: undefined }],
    ["fixture provenance", { ...entry, provenance: { ...provenance, fixture: true } }],
    ["padded entry owner", { ...entry, owner: ` ${entry.owner} ` }],
    ["padded preparer", { ...entry, preparer: ` ${entry.preparer!} ` }],
    ["padded reviewer", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: ` ${entry.approvals[0]!.approver} ` }, entry.approvals[1]!] }],
    ["padded catalog owner alias", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: " catalog-owner " }, entry.approvals[1]!] }],
    ["padded entry owner alias", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: ` ${entry.owner} ` }, entry.approvals[1]!] }],
    ["padded preparer alias", { ...entry, approvals: [{ ...entry.approvals[0]!, approver: ` ${entry.preparer!} ` }, entry.approvals[1]!] }],
  ])("rejects %s", async (_name, candidate) => {
    expect((await resolveMappingCatalogEntry(await signed({}, [candidate]), scope, now)).available).toBe(false);
  });

  it("rejects a padded accountable catalog owner", async () => {
    expect((await resolveMappingCatalogEntry(await signed({ owner: " catalog-owner " }), scope, now)).available).toBe(false);
  });

  it("detects payload tampering", async () => {
    const catalog = await signed();
    expect((await resolveMappingCatalogEntry(catalog, scope, now)).available).toBe(true);
    expect(await validateMappingCatalogIntegrity({ ...catalog, owner: "tampered" })).toBe(false);
  });

  it.each([
    ["program", { ...scope, programId: Schema.decodeUnknownSync(ProgramId)("program:other") }],
    ["platform", { ...scope, platform: "linux" as const }],
    ["architecture", { ...scope, architecture: "x86_64" }],
    ["generation", { ...scope, omarchyGeneration: "omarchy-4" as const }],
    ["provider", { ...scope, provider: "omarchy" as const }],
    ["provider version", { ...scope, providerVersion: "4.5.0" }],
    ["provider role", { ...scope, providerRole: "fallback" as const }],
    ["capability", { ...scope, capabilityId: "other-capability" }],
  ])("rejects %s scope mismatch", async (_name, candidateScope) => {
    expect((await resolveMappingCatalogEntry(await signed({}, [{ ...entry, scope: candidateScope }]), scope, now)).available).toBe(false);
  });

  it.each([
    ["expired support", { lifecycle: { ...lifecycle, supportedUntil: "2026-08-09T00:00:00.000Z" } }],
    ["overdue review", { lifecycle: { ...lifecycle, reviewBy: "2026-08-09T00:00:00.000Z" } }],
  ])("rejects %s", async (_name, change) => {
    expect((await resolveMappingCatalogEntry(await signed({}, [{ ...entry, ...change }]), scope, now)).available).toBe(false);
  });

  it.each([
    ["before effective", { ...lifecycle, effectiveFrom: "2026-08-11T00:00:00.000Z" }],
    ["expired", { ...lifecycle, supportedUntil: "2026-08-09T00:00:00.000Z" }],
  ])("rejects catalog lifecycle when %s", async (_name, catalogLifecycle) => {
    expect((await resolveMappingCatalogEntry(await signed({ lifecycle: catalogLifecycle }), scope, now)).available).toBe(false);
  });

  it.each([undefined, { ...provenance, fixture: true }])("rejects invalid catalog provenance", async (catalogProvenance) => {
    expect((await resolveMappingCatalogEntry(await signed({ provenance: catalogProvenance }), scope, now)).available).toBe(false);
  });

  it("fails closed instead of selecting between duplicate eligible entries", async () => {
    const duplicate = { ...entry, id: "mapping:duplicate", mapping: { ...entry.mapping, mappingId: "mapping:duplicate" } };
    expect(await resolveMappingCatalogEntry(await signed({}, [entry, duplicate]), scope, now)).toEqual({ available: false, reason: "ambiguous" });
  });

  it.each([
    ["platform", { ...scope, platform: "windows" }], ["generation", { ...scope, omarchyGeneration: "omarchy-5" }],
    ["provider", { ...scope, provider: "apt" }], ["provider role", { ...scope, providerRole: "secondary" }],
  ])("rejects matching invalid closed %s values at runtime", async (_name, invalid) => {
    const invalidScope = invalid as typeof scope;
    expect((await resolveMappingCatalogEntry(await signed({}, [{ ...entry, scope: invalidScope }]), invalidScope, now)).available).toBe(false);
  });
});

describe("catalog mapping adapter", () => {
  it("adapts one entry only with the injected exact environment context", async () => {
    const port = makeCatalogMappingPort(await signed(), () => mappingContext, () => now);
    await expect(Effect.runPromise(port.map(programId, "homebrew"))).resolves.toMatchObject({ mappingId: entry.mapping.mappingId });
  });

  it.each([["missing", {}], ["mismatched", { ...mappingContext, platform: "linux" }]])("rejects %s adapter context", async (_name, context) => {
    const port = makeCatalogMappingPort(await signed(), () => context as typeof mappingContext, () => now);
    await expect(Effect.runPromise(port.map(programId, "homebrew"))).rejects.toMatchObject({ _tag: "ObservationUnavailable", reasonCode: "scope-mismatch" });
  });

  it.effect("keeps draft mappings typed-unavailable so planning cannot produce a plan", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const result = yield* planner.plan({ programId, fallbackOptIn: false, binding: binding }).pipe(Effect.flip);
    expect(result).toMatchObject({ _tag: "ObservationUnavailable", subject: "mapping", reasonCode: "catalog-not-approved" });
  }).pipe(Effect.provide(Layer.provide(
    Layer.merge(PlanPackageAcquisition.layer, PlanDigestService.layer),
    Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, { facts: Effect.succeed({ platform: "macos" as const, generation: "unknown" as const, observationDigest: "platform:macos", evidence: [] }) }),
      Layer.succeed(ProviderDiscoveryPort, { discover: (provider) => Effect.succeed({ provider, availability: "present", observedVersion: "1", capabilities: [], evidence: [] }) }),
      Layer.succeed(PackageMappingPort, makeCatalogMappingPort(draftMappingCatalog, () => mappingContext, () => now)),
    ),
  ))));

  it("keeps the catalog and adapter out of production composition", async () => {
    const sources = await Promise.all(["read-only.ts", "mutation.ts"].map((file) => readFile(new URL(`../../src/composition/${file}`, import.meta.url), "utf8")));
    expect(sources.join("\n")).not.toMatch(/draftMappingCatalog|makeCatalogMappingPort|catalog-mapping-port/);
  });
});

const binding = {
  operation: "package-acquisition" as const, logicalRequestIds: [programId], platformObservationDigest: "platform", profilePolicyDigest: "profile",
  provider: "homebrew" as const, providerRole: "primary" as const, providerPolicy: { id: "fixture", version: "1" }, capabilityId: "homebrew-formula",
  mappingIds: ["mapping"], packageStateDigests: ["missing"], verificationPolicyId: "read-only", riskCodes: [], fallbackOptIn: false,
};
