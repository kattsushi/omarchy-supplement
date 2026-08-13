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

const completeManifestSource = () => {
  const manifest = readFileSync(new URL("../../../../bootstrap/contracts/workstation-source-v1.tsv", import.meta.url), "utf8");
  const records = manifest.trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
  const profiles = records.filter(([tag]) => tag === "profile");
  const sources = records.filter(([tag]) => tag === "source");
  const expectations = sources.map(([, selector, platform, sourceName, concern, kind, id, probe]) => {
    const profileId = profiles.find(([, , , selectors]) => selectors?.split(",").includes(selector!))?.[1];
    return `expectation\t${profileId}\t${platform}\t${selector}\t${sourceName}\t${concern}\t${kind}\t${id}\t${probe}`;
  }).sort();
  const evidence = [...new Set(sources.map(([, , , , , kind, id]) => `${kind}\t${id}\tunavailable\tunavailable\tunavailable\tunavailable\tunavailable`))].sort();
  return `schema\tworkstation-source-v1\nsource_fingerprint\t${fingerprint}\nplatform\tlinux\tx86_64\nomarchy\tunavailable\tprobe-failed\t-\n${profiles.map(([, id, bootstrap, selectors], index) => `profile\t${id}\t${bootstrap}\t${selectors}\t${index === 0 ? "selected" : "available"}`).join("\n")}\n${expectations.join("\n")}\n${evidence.join("\n")}\nstatus\tcomplete\n`;
};

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
      omarchyAvailability: "observed",
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

  test("preserves Linux and macOS platform facts independently of Omarchy", async () => {
    for (const platform of ["linux", "macos"] as const) {
      const unavailable = parsed(source()
        .replace("platform\tlinux\tx86_64", `platform\t${platform}\tx86_64`)
        .replace("observed\t4.2.1\tomarchy-4", "unavailable\ttimeout\t-"));
      expect(await Effect.runPromise(makeReadOnlyObservationAdapters(unavailable).platform.facts)).toMatchObject({
        platform,
        architecture: "x86_64",
        generation: "unknown",
        omarchyAvailability: "unavailable",
        omarchyUnavailableReason: "unknown-version",
        sourceFingerprint: fingerprint,
      });
    }
  });

  test("preserves valid Omarchy 3/4 and isolates contradictory Omarchy evidence", async () => {
    for (const [version, generation] of [["3.2.1", "omarchy-3"], ["4.2.1", "omarchy-4"]] as const) {
      const facts = await Effect.runPromise(makeReadOnlyObservationAdapters(parsed(source().replace("4.2.1\tomarchy-4", `${version}\t${generation}`))).platform.facts);
      expect(facts).toMatchObject({ platform: "linux", architecture: "x86_64", omarchyAvailability: "observed", omarchyVersion: version, generation });
    }

    for (const text of [
      source().replace("4.2.1\tomarchy-4", "3.2.1\tomarchy-4"),
      source().replace("platform\tlinux\tx86_64", "platform\tmacos\tx86_64"),
    ]) {
      const facts = await Effect.runPromise(makeReadOnlyObservationAdapters(parsed(text)).platform.facts);
      expect(facts).toMatchObject({ platform: expect.any(String), architecture: "x86_64", generation: "unknown", omarchyAvailability: "unavailable", omarchyUnavailableReason: "ambiguous-version" });
      expect(facts).not.toHaveProperty("omarchyVersion");
    }
  });

  test("fails platform facts closed only for unsupported platform or architecture", async () => {
    for (const text of [
      [source().replace("platform\tlinux\tx86_64", "platform\tunknown\tx86_64"), "source-platform-unavailable"],
      [source().replace("platform\tlinux\tx86_64", "platform\tlinux\tunknown"), "source-platform-unavailable"],
    ] as const) {
      expect(await errorOf(makeReadOnlyObservationAdapters(parsed(text[0])).platform.facts)).toMatchObject({
        subject: "platform",
        reasonCode: text[1],
      });
    }
  });

  test("carries parser failures for semver, generation, completeness, duplicates, and missing records", async () => {
    const invalidSources = [
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
    const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
    const firstProgram = await Effect.runPromise(adapters.programEvidence.forProgram(programId));
    (mutable.profiles as Array<WorkstationSource["profiles"][number]>)[0] = mutable.profiles[1]!;
    (mutable.expectations as Array<WorkstationSource["expectations"][number]>).reverse();
    (mutable.expectations as unknown as Array<{ concern: string }>)[0]!.concern = "mutated";
    (mutable.evidence as unknown as Array<{ id: string; availability: string }>).find(({ id }) => id === "program:neovim")!.availability = "missing";
    (mutable.evidence as unknown as Array<{ id: string }>).find(({ id }) => id === "dependency:git")!.id = "dependency:mutated";
    const secondProfiles = await Effect.runPromise(adapters.profiles.inventory);
    const secondEvidence = await Effect.runPromise(adapters.sourceEvidence.observations);
    const secondProgram = await Effect.runPromise(adapters.programEvidence.forProgram(programId));

    expect(secondProfiles).toEqual(firstProfiles);
    expect(secondEvidence).toEqual(firstEvidence);
    expect(secondProgram).toEqual(firstProgram);
    expect(secondProgram.packageState).toBe("present");
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

  test("validates snapshots and maps every manifest expectation exactly once", async () => {
    const result = parseWorkstationSource(completeManifestSource());
    if (Result.isFailure(result)) throw result.failure;
    const adapters = makeReadOnlyObservationAdapters(result);
    const inventory = await Effect.runPromise(adapters.profiles.inventory);
    const observations = await Effect.runPromise(adapters.sourceEvidence.observations);
    const expected = inventory.expectations.map(({ profileId, platform, selector, source, kind, id }) => `${profileId}|${platform}|${selector}|${source}|${kind}|${id}`).sort();
    const projected = observations.flatMap(({ expectations }) => expectations.map(({ profileId, platform, selector, source, kind, id }) => `${profileId}|${platform}|${selector}|${source}|${kind}|${id}`)).sort();

    expect(expected).toHaveLength(22);
    expect(new Set(projected).size).toBe(22);
    expect(projected).toEqual(expected);
    expect(observations).toHaveLength(13);

    const malformed = structuredClone(result.success) as WorkstationSource;
    (malformed.evidence as unknown as Array<{ availability: string }>)[0]!.availability = "verified";
    expect(await errorOf(makeReadOnlyObservationAdapters(Result.succeed(malformed)).sourceEvidence.observations)).toMatchObject({ reasonCode: "source-snapshot-invalid" });
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
