import { describe, expect, it, test } from "vitest";
import { execFileSync } from "node:child_process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  CompatibilityRefusalReason,
  classifyOmarchyIdentity,
  selectCompatibility,
} from "../src/domain/compatibility.js";
import { parseWorkstationSource } from "../src/infrastructure/bash-contracts/workstation-source-v1.js";
import { makeReadOnlyObservationAdapters } from "../src/infrastructure/read-only-observations/adapters.js";
import { ProgramId } from "../src/domain/states.js";
import { PlanDigestService } from "../src/domain/plans.js";
import {
  PackageMappingPort,
  PlanPackageAcquisition,
  PlatformFactsPort,
  ProviderDiscoveryPort,
} from "../src/application/services/workstation.js";
import { compatibilityRefusalResult } from "../src/application/contracts/operation-registry.js";
import { decodePublicResult } from "../src/application/contracts/public-result.js";
import { encodePublicResult } from "../src/presentation/cli/public-result-encoder.js";
import { createTuiPresentation } from "../src/presentation/tui/view-models/presentation.js";

const fingerprint = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const source = (omarchy: string) => `schema\tworkstation-source-v1
source_fingerprint\t${fingerprint}
platform\tlinux\tx86_64
${omarchy}
profile\tprofile:base\tbase\tshared\tselected
expectation\tprofile:base\tany\tshared\tnvim\teditor\tprogram\tprogram:neovim\tnvim
program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
status\tcomplete
`;

const platformFacts = (identity: ReturnType<typeof classifyOmarchyIdentity>) => ({
  platform: "linux" as const,
  architecture: "x86_64" as const,
  generation: identity.generation,
  omarchyIdentity: identity,
  observationDigest: fingerprint,
  evidence: [],
});

const observeSource = (observation: string) => execFileSync(
  "../../bin/workstation-bootstrap",
  ["observe", "--profile", "profile:base"],
  { cwd: process.cwd(), env: { ...process.env, BOOTSTRAP_TEST_OMARCHY_OBSERVATION: observation } },
).toString();

describe("Omarchy v4-only assessment refusal", () => {
  test("binds stable and prerelease v4 observations to their exact version and revision", () => {
    for (const [version, revision] of [["4.0.0", "1"], ["4.0.0alpha1", "2"], ["4.0.0beta2", "3"], ["4.0.0rc3", "1"]] as const) {
      const identity = classifyOmarchyIdentity({ availability: "observed", version, revision, generation: "omarchy-4" });
      expect(identity).toEqual({ availability: "eligible", version, revision, generation: "omarchy-4" });
      expect(selectCompatibility({ platform: "linux", identity }).policyId).toBe(`omarchy-4:${version}:${revision}`);
    }
  });

  test("refuses generation-only and missing-revision v4 inputs without fabricating an exact identity", () => {
    const missingRevision = classifyOmarchyIdentity({ availability: "observed", version: "4.0.0", generation: "omarchy-4" });
    const generationOnly = selectCompatibility({ platform: "linux", generation: "omarchy-4" });

    expect(missingRevision).toEqual({ availability: "refused", reason: "unknown-version", generation: "omarchy-4", version: "4.0.0" });
    expect(selectCompatibility({ platform: "linux", identity: missingRevision })).toMatchObject({ state: "refused", reasonCode: "unknown-version", policyId: undefined, revision: undefined });
    expect(generationOnly).toMatchObject({ state: "refused", reasonCode: "unknown-version", policyId: undefined, version: undefined, revision: undefined });
  });

  test("keeps v3 decodable but returns five non-interchangeable refusal reasons", () => {
    const inputs = [
      [{ availability: "observed", version: "3.8.4", revision: "1", generation: "omarchy-3" }, "deprecated-generation"],
      [{ availability: "unavailable", reason: "unknown-version" }, "unknown-version"],
      [{ availability: "unavailable", reason: "future-version" }, "future-version"],
      [{ availability: "unavailable", reason: "malformed-version" }, "malformed-version"],
      [{ availability: "unavailable", reason: "ambiguous-version" }, "ambiguous-version"],
    ] as const;

    for (const [input, reason] of inputs) {
      const identity = classifyOmarchyIdentity(input);
      expect(identity).toMatchObject({ availability: "refused", reason });
      expect(Schema.decodeUnknownSync(CompatibilityRefusalReason)(reason)).toBe(reason);
      expect(selectCompatibility({ platform: "linux", identity })).toMatchObject({ state: "refused", reasonCode: reason });
    }
  });

  test("parses the current RC source identity and preserves v3 provenance", async () => {
    const rc = parseWorkstationSource(source("omarchy\tobserved\t4.0.0rc3\t1\tomarchy-4"));
    const v3 = parseWorkstationSource(source("omarchy\tobserved\t3.8.4\t1\tomarchy-3"));
    expect(Result.isSuccess(rc) && rc.success.omarchy).toEqual({ availability: "observed", version: "4.0.0rc3", revision: "1", generation: "omarchy-4" });
    expect(Result.isSuccess(v3) && v3.success.omarchy).toEqual({ availability: "observed", version: "3.8.4", revision: "1", generation: "omarchy-3" });
    if (Result.isFailure(rc) || Result.isFailure(v3)) throw new Error("expected valid source observations");
    expect((await Effect.runPromise(makeReadOnlyObservationAdapters(rc).platform.facts)).omarchyIdentity).toEqual({ availability: "eligible", version: "4.0.0rc3", revision: "1", generation: "omarchy-4" });
    expect((await Effect.runPromise(makeReadOnlyObservationAdapters(v3).platform.facts)).omarchyIdentity).toMatchObject({ availability: "refused", reason: "deprecated-generation", version: "3.8.4", revision: "1" });
  });

  test("carries an exact compact stable identity from the Bash producer through the parser", () => {
    const result = parseWorkstationSource(observeSource("4.0.0-1"));

    expect(Result.isSuccess(result) && result.success.omarchy).toEqual({
      availability: "observed",
      version: "4.0.0",
      revision: "1",
      generation: "omarchy-4",
    });
  });

  test("carries a Bash malformed refusal through parsing and the public projection", () => {
    const parsed = parseWorkstationSource(observeSource("release candidate\nnot a version"));

    expect(Result.isSuccess(parsed) && parsed.success.omarchy).toEqual({ availability: "unavailable", reason: "malformed-version" });
    if (Result.isFailure(parsed)) throw new Error("expected valid source refusal record");
    const identity = classifyOmarchyIdentity(parsed.success.omarchy);
    if (identity.availability !== "refused") throw new Error("expected malformed source identity to be refused");
    const result = compatibilityRefusalResult("assess_workstation", "request:bash-contract", identity.reason);
    expect(JSON.parse(new TextDecoder().decode(encodePublicResult(result)))).toMatchObject({
      payload: { kind: "compatibility-refusal", reason: "malformed-version" },
      blockers: [{ code: "operation-refused" }],
    });
    expect(createTuiPresentation(result, 120).views.find(({ id }) => id === "platform-policy")?.items).toEqual(["malformed-version"]);
  });

  test("preserves a legacy revisionless source identity only as a refused historical observation", async () => {
    const legacy = parseWorkstationSource(source("omarchy\tobserved\t4.0.0\tomarchy-4"));
    expect(Result.isSuccess(legacy) && legacy.success.omarchy).toEqual({ availability: "observed", version: "4.0.0", generation: "omarchy-4" });
    if (Result.isFailure(legacy)) throw new Error("expected decodable legacy source observation");

    const facts = await Effect.runPromise(makeReadOnlyObservationAdapters(legacy).platform.facts);
    expect(facts).toMatchObject({ omarchyAvailability: "observed", omarchyVersion: "4.0.0", omarchyIdentity: { availability: "refused", reason: "unknown-version", version: "4.0.0" } });
    expect(selectCompatibility({ platform: "linux", identity: facts.omarchyIdentity! })).toMatchObject({ state: "refused", reasonCode: "unknown-version", policyId: undefined });
  });

  it("refuses planning before provider or mapping discovery for every refused identity", async () => {
    const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
    for (const reason of ["deprecated-generation", "unknown-version", "future-version", "malformed-version", "ambiguous-version"] as const) {
      let discoveryCalls = 0;
      let mappingCalls = 0;
      const identity = reason === "deprecated-generation"
        ? classifyOmarchyIdentity({ availability: "observed", version: "3.8.4", revision: "1", generation: "omarchy-3" })
        : classifyOmarchyIdentity({ availability: "unavailable", reason });
      const ports = Layer.mergeAll(
        Layer.succeed(PlatformFactsPort, { facts: Effect.succeed(platformFacts(identity)) }),
        Layer.succeed(ProviderDiscoveryPort, { discover: () => Effect.sync(() => { discoveryCalls++; return { provider: "omarchy" as const, availability: "present" as const, observedVersion: "4", capabilities: [], evidence: [] }; }) }),
        Layer.succeed(PackageMappingPort, { map: () => Effect.sync(() => { mappingCalls++; return { mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: true }; }) }),
      );
      const planner = await Effect.runPromise(Effect.provide(PlanPackageAcquisition, Layer.provide(PlanPackageAcquisition.layer, ports)));
      const result = await Effect.runPromise(planner.plan({
        programId,
        fallbackOptIn: true,
        binding: {
          operation: "package-acquisition",
          logicalRequestIds: [programId],
          platformObservationDigest: "ignored",
          profilePolicyDigest: "ignored",
          provider: "omarchy",
          providerRole: "primary",
          providerPolicy: { id: "policy:ignored", version: "1" },
          capabilityId: "ignored",
          mappingIds: ["mapping:ignored"],
          packageStateDigests: ["state:ignored"],
          verificationPolicyId: "ignored",
          riskCodes: [],
          fallbackOptIn: true,
        },
      }).pipe(Effect.provide(PlanDigestService.layer)));
      expect(result).toMatchObject({ blockers: [{ code: "compatibility-refused" }], nextActions: [{ reasonCode: reason }] });
      expect(result.plan).toBeUndefined();
      expect(discoveryCalls).toBe(0);
      expect(mappingCalls).toBe(0);
    }
  });

  test("projects each refusal reason identically through public JSON and required TUI views", () => {
    for (const reason of ["deprecated-generation", "unknown-version", "future-version", "malformed-version", "ambiguous-version"] as const) {
      const result = compatibilityRefusalResult("assess_workstation", "request:v4", reason);
      expect(decodePublicResult(result)).toEqual(result);
      expect(JSON.parse(new TextDecoder().decode(encodePublicResult(result)))).toEqual(result);
      const presentation = createTuiPresentation(result, 120);
      expect(presentation.views.find(({ id }) => id === "overview")?.items).toContain(reason);
      expect(presentation.views.find(({ id }) => id === "platform-policy")?.items).toContain(reason);
    }
  });
});
