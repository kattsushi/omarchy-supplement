import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { BashOperationalFailure, InvalidContract, Refused, type WorkstationSource } from "../../src/application/contracts/bash.js";
import { ProgramId } from "../../src/domain/states.js";
import { parseWorkstationSource } from "../../src/infrastructure/bash-contracts/workstation-source-v1.js";
import { makeReadOnlyObservationAdapters } from "../../src/infrastructure/read-only-observations/adapters.js";

const fingerprint = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const source = (selected = "profile:base") => `schema\tworkstation-source-v1
source_fingerprint\t${fingerprint}
platform\tlinux\tx86_64
omarchy\tobserved\t4.2.1\tomarchy-4
profile\tprofile:base\tbase\tmacos,shared\t${selected === "profile:base" ? "selected" : "available"}
profile\tprofile:omarchy\tomarchy\tarch/omarchy\t${selected === "profile:omarchy" ? "selected" : "available"}
expectation\tprofile:base\tany\tshared\tnvim\teditor\tprogram\tprogram:neovim\tnvim
expectation\tprofile:base\tdarwin\tmacos\tghostty-darwin\tterminal\tprogram\tprogram:ghostty\tghostty
expectation\tprofile:omarchy\tlinux\tarch/omarchy\tgit\ttooling\tdependency\tdependency:git\tgit
dependency\tdependency:git\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
program\tprogram:ghostty\tmissing\tunavailable\tunavailable\tunavailable\tunavailable
program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
status\tcomplete
`;

const parsed = (text = source()) => {
  const result = parseWorkstationSource(text);
  if (Result.isFailure(result)) throw result.failure;
  return Result.succeed(result.success);
};

const errorOf = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

describe("authoritative read-only observation adapters", () => {
  test("maps observed platform, architecture, and Omarchy without desired-pin inference", async () => {
    const adapters = makeReadOnlyObservationAdapters(parsed());
    const facts = await Effect.runPromise(adapters.platform.facts);

    expect(facts).toMatchObject({
      platform: "linux",
      architecture: "x86_64",
      generation: "omarchy-4",
      omarchyVersion: "4.2.1",
      observationDigest: fingerprint,
      sourceContract: "workstation-source-v1",
      sourceVersion: "1",
      evidenceStrength: "native",
    });
    expect(facts.evidence).toEqual([
      expect.objectContaining({
        claim: "platform-observed",
        digest: fingerprint,
        platformContext: "linux/x86_64",
        sourceContract: "workstation-source-v1",
        sourceVersion: "1",
        strength: "native",
      }),
      expect.objectContaining({
        claim: "omarchy-observed",
        summaryCode: "omarchy-4",
        strength: "native",
      }),
    ]);
    expect(JSON.stringify(facts)).not.toContain("desired");
  });

  test("projects the complete profile inventory and expectations independently of selection", async () => {
    const base = await Effect.runPromise(makeReadOnlyObservationAdapters(parsed(source("profile:base"))).profiles.inventory);
    const omarchy = await Effect.runPromise(makeReadOnlyObservationAdapters(parsed(source("profile:omarchy"))).profiles.inventory);

    expect(base.profiles).toEqual([
      { id: "profile:base", bootstrapSelector: "base", dotfileSelectors: ["macos", "shared"], selected: true },
      { id: "profile:omarchy", bootstrapSelector: "omarchy", dotfileSelectors: ["arch/omarchy"], selected: false },
    ]);
    expect(base.expectations).toHaveLength(3);
    expect(base.expectations[2]).toEqual({
      profileId: "profile:omarchy",
      platform: "linux",
      selector: "arch/omarchy",
      source: "git",
      concern: "tooling",
      kind: "dependency",
      id: "dependency:git",
      probe: "git",
    });
    expect(omarchy.profiles.map(({ id }) => id)).toEqual(base.profiles.map(({ id }) => id));
    expect(omarchy.expectations).toEqual(base.expectations);
    expect(omarchy.profiles.map(({ bootstrapSelector }) => bootstrapSelector)).toEqual(["base", "omarchy"]);
    expect(omarchy.profiles.map(({ dotfileSelectors }) => dotfileSelectors)).toEqual([["macos", "shared"], ["arch/omarchy"]]);
  });

  test("maps explicit expectation-to-evidence relationships without readiness inference", async () => {
    const adapters = makeReadOnlyObservationAdapters(parsed());
    const observations = await Effect.runPromise(adapters.sourceEvidence.observations);
    const neovim = observations.find(({ id }) => id === "program:neovim");
    const git = observations.find(({ id }) => id === "dependency:git");

    expect(observations.map(({ id }) => id)).toEqual(["dependency:git", "program:ghostty", "program:neovim"]);
    expect(neovim).toMatchObject({
      kind: "program",
      availability: "present",
      version: "unavailable",
      configuration: "unavailable",
      dotfileStow: "unavailable",
      acquisition: "unavailable",
      expectations: [{ profileId: "profile:base", selector: "shared", source: "nvim", concern: "editor" }],
      evidence: [{ claim: "executable-presence", strength: "native", digest: fingerprint }],
    });
    expect(git).toMatchObject({
      kind: "dependency",
      availability: "present",
      version: "unavailable",
      configuration: "unavailable",
      dotfileStow: "unavailable",
      acquisition: "unavailable",
      expectations: [{ profileId: "profile:omarchy", selector: "arch/omarchy", source: "git", concern: "tooling" }],
    });

    const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
    expect(await Effect.runPromise(adapters.programEvidence.forProgram(programId))).toMatchObject({
      programId,
      packageState: "present",
      configurationState: "unverifiable",
      dotfileStowState: "unverifiable",
    });
  });

  test("preserves typed unavailable reasons and opaque source identity", async () => {
    const failures = [
      new InvalidContract({ code: "source-incomplete", evidenceDigest: "fingerprint:invalid" }),
      new Refused({ code: "SOURCE_MANIFEST_INVALID", evidenceDigest: "fingerprint:refused" }),
      new BashOperationalFailure({ code: "timeout", evidenceDigest: "fingerprint:timeout" }),
    ];

    for (const failure of failures) {
      const adapters = makeReadOnlyObservationAdapters(Result.fail(failure));
      for (const [subject, effect] of [
        ["platform", Effect.asVoid(adapters.platform.facts)],
        ["profiles", Effect.asVoid(adapters.profiles.inventory)],
        ["evidence", Effect.asVoid(adapters.sourceEvidence.observations)],
      ] as const) {
        expect(await errorOf(effect)).toMatchObject({
          _tag: "ObservationUnavailable",
          subject,
          reasonCode: failure.code,
          sourceContract: "workstation-source-v1",
          sourceVersion: "1",
          sourceFingerprint: failure.evidenceDigest,
        });
      }
    }
  });

  test("fails platform facts closed for unavailable, unknown, or contradictory authority", async () => {
    const unavailable = parsed(source().replace("observed\t4.2.1\tomarchy-4", "unavailable\ttimeout\t-"));
    expect(await errorOf(makeReadOnlyObservationAdapters(unavailable).platform.facts)).toMatchObject({
      subject: "platform",
      reasonCode: "timeout",
      sourceFingerprint: fingerprint,
    });

    for (const [text, reasonCode] of [
      [source().replace("platform\tlinux\tx86_64", "platform\tunknown\tx86_64"), "source-platform-unavailable"],
      [source().replace("platform\tlinux\tx86_64", "platform\tlinux\tunknown"), "source-platform-unavailable"],
      [source().replace("platform\tlinux\tx86_64", "platform\tmacos\tx86_64"), "source-platform-contradictory"],
    ] as const) {
      expect(await errorOf(makeReadOnlyObservationAdapters(parsed(text)).platform.facts)).toMatchObject({
        subject: "platform",
        reasonCode,
      });
    }
  });

  test("carries parser failures for semver, generation, completeness, duplicates, and missing records", async () => {
    const invalidSources = [
      source().replace("4.2.1\tomarchy-4", "3.2.1\tomarchy-4"),
      source().replace("4.2.1\tomarchy-4", "4.2.1\tomarchy-3"),
      source().replace("4.2.1\tomarchy-4", "5.0.0\tomarchy-4"),
      source().replace(/^expectation\tprofile:omarchy.*\n/m, ""),
      source().replace(/^dependency\tdependency:git.*\n/m, ""),
      source().replace("status\tcomplete\n", "program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable\nstatus\tcomplete\n"),
      source().replace("profile:omarchy\tlinux\tarch/omarchy", "profile:base\tlinux\tarch/omarchy"),
    ];

    for (const text of invalidSources) {
      const result = parseWorkstationSource(text);
      expect(Result.isFailure(result)).toBe(true);
      const error = await errorOf(makeReadOnlyObservationAdapters(result).sourceEvidence.observations);
      expect(error).toMatchObject({ _tag: "ObservationUnavailable", subject: "evidence" });
      expect(error.reasonCode).toMatch(/^source-/);
    }
  });

  test("never invents evidence from filenames, package names, or absent mappings", async () => {
    const adapters = makeReadOnlyObservationAdapters(parsed());
    const unknown = Schema.decodeUnknownSync(ProgramId)("program:nvim");
    expect(await errorOf(adapters.programEvidence.forProgram(unknown))).toMatchObject({
      subject: "evidence",
      reasonCode: "source-evidence-missing",
      sourceFingerprint: fingerprint,
    });
    const observations = await Effect.runPromise(adapters.sourceEvidence.observations);
    expect(observations.some(({ id }) => id === "program:nvim")).toBe(false);
    expect(observations.find(({ id }) => id === "program:neovim")?.expectations[0]?.source).toBe("nvim");
  });

  test("returns detached, recursively immutable, deterministic, bounded observations", async () => {
    const parsedResult = parsed();
    if (Result.isFailure(parsedResult)) throw parsedResult.failure;
    const mutable = structuredClone(parsedResult.success) as WorkstationSource;
    const adapters = makeReadOnlyObservationAdapters(Result.succeed(mutable));
    const firstProfiles = await Effect.runPromise(adapters.profiles.inventory);
    const firstEvidence = await Effect.runPromise(adapters.sourceEvidence.observations);
    (mutable.profiles as Array<WorkstationSource["profiles"][number]>)[0] = mutable.profiles[1]!;
    (mutable.expectations as Array<WorkstationSource["expectations"][number]>).reverse();
    const secondProfiles = await Effect.runPromise(adapters.profiles.inventory);
    const secondEvidence = await Effect.runPromise(adapters.sourceEvidence.observations);

    expect(secondProfiles).toEqual(firstProfiles);
    expect(secondEvidence).toEqual(firstEvidence);
    expect(secondProfiles.profiles[0]?.id).toBe("profile:base");
    expect(secondProfiles.profiles.length).toBeLessThanOrEqual(256);
    expect(secondProfiles.expectations.length).toBeLessThanOrEqual(256);
    expect(secondEvidence.length).toBeLessThanOrEqual(256);
    expect([
      secondProfiles,
      secondProfiles.profiles,
      secondProfiles.profiles[0],
      secondProfiles.profiles[0]?.dotfileSelectors,
      secondProfiles.expectations,
      secondEvidence,
      secondEvidence[0],
      secondEvidence[0]?.expectations,
      secondEvidence[0]?.evidence,
    ].every(Object.isFrozen)).toBe(true);
    expect(() => (secondProfiles.profiles as Array<(typeof secondProfiles.profiles)[number]>).push(secondProfiles.profiles[0]!)).toThrow(TypeError);
  });

  test("keeps over-limit and private source data behind typed unavailable errors", async () => {
    for (const text of [
      `${source()}${"x".repeat(262145)}`,
      source().replace("program:neovim", "/home/alice/private-token"),
    ]) {
      const error = await errorOf(makeReadOnlyObservationAdapters(parseWorkstationSource(text)).profiles.inventory);
      expect(error).toMatchObject({
        _tag: "ObservationUnavailable",
        subject: "profiles",
        reasonCode: "source-bounds-or-privacy",
      });
      expect(JSON.stringify(error)).not.toMatch(/\/home\/alice|private-token/);
    }
  });

  test("has no raw source, policy, process, filesystem, provider, network, or write capability", () => {
    const adapterSource = readFileSync(new URL("../../src/infrastructure/read-only-observations/adapters.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "node:fs",
      "node:child_process",
      "BashBridge",
      "BashProcess",
      "parseWorkstationSource",
      "ProviderDiscoveryPort",
      "PackageMappingPort",
      "workstation-bootstrap",
      "bootstrap/contracts",
      "process.env",
      "fetch(",
      ".writeFile",
      ".spawn",
      ".exec",
    ]) expect(adapterSource).not.toContain(forbidden);
    expect(adapterSource).toContain("ParsedWorkstationSourceResult");
    expect(adapterSource).not.toMatch(/ghostty|hyprland|neovim|dependency:git|\.desktop|\.stow/);
  });
});
