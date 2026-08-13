import { describe, expect, test } from "vitest";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { BashBridge } from "../../src/application/ports/bash.js";
import { parseBrf } from "../../src/infrastructure/bash-contracts/bootstrap.js";
import { parseWorkstationSource } from "../../src/infrastructure/bash-contracts/workstation-source-v1.js";
import { bashBridgeLayer, isAllowedArgv } from "../../src/infrastructure/subprocess/argv.js";
import { BashProcess } from "../../src/infrastructure/subprocess/process.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const source = `schema\tworkstation-source-v1
source_fingerprint\t${digest}
platform\tlinux\tx86_64
omarchy\tobserved\t4.2.1\tomarchy-4
profile\tprofile:base\tbase\tmacos,shared\tselected
profile\tprofile:omarchy\tomarchy\tarch/omarchy\tavailable
expectation\tprofile:base\tany\tshared\tnvim\teditor\tprogram\tprogram:neovim\tnvim
expectation\tprofile:base\tdarwin\tmacos\tghostty-darwin\tterminal\tprogram\tprogram:ghostty\tghostty
expectation\tprofile:omarchy\tlinux\tarch/omarchy\thyprland\twindow-manager\tprogram\tprogram:hyprland\tHyprland
program\tprogram:ghostty\tmissing\tunavailable\tunavailable\tunavailable\tunavailable
program\tprogram:hyprland\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
status\tcomplete
`;

describe("workstation-source-v1 parser", () => {
  test("parses source-owned mappings without promoting executable presence", () => {
    const result = parseWorkstationSource(source);
    expect(result).toMatchObject({
      _tag: "Success",
      success: {
        platform: { name: "linux", architecture: "x86_64" },
        omarchy: { availability: "observed", version: "4.2.1", generation: "omarchy-4" },
        profiles: [{ id: "profile:base", selected: true }, { id: "profile:omarchy", selected: false }],
      },
    });
    if (Result.isFailure(result)) throw result.failure;
    expect(result.success.evidence.find(({ id }) => id === "program:neovim")).toEqual({ id: "program:neovim", kind: "program", availability: "present", version: "unavailable", configuration: "unavailable", dotfileStow: "unavailable", acquisition: "unavailable" });
  });

  test("rejects unsupported, sparse, duplicate, unordered, private, and bounded records", () => {
    for (const value of [
      source.replace("workstation-source-v1", "workstation-source-v2"),
      source.replace("status\tcomplete\n", ""),
      source.replace("status\tcomplete\n", "program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable\nstatus\tcomplete\n"),
      source.replace("profile:base\tbase", "profile:zeta\tbase"),
      source.replace("program:neovim", "/home/alice/token"),
      `${source}${"x".repeat(513)}\n`,
      source.replace("present\tunavailable", "verified\tunavailable"),
      source.replace("status\tcomplete\n", `${Array.from({ length: 257 }, (_, index) => `program\tprogram:p${index.toString().padStart(3, "0")}\tmissing\tunavailable\tunavailable\tunavailable\tunavailable`).join("\n")}\nstatus\tcomplete\n`),
      `${source}${"x".repeat(262145)}`,
    ]) expect(Result.isFailure(parseWorkstationSource(value))).toBe(true);
  });

  test("validates exact Omarchy SemVer generation authority", () => {
    expect(parseWorkstationSource(source.replace("observed\t4.2.1\tomarchy-4", "unavailable\ttimeout\t-"))).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "unavailable", reason: "unknown-version" } } });
    expect(parseWorkstationSource(source.replace("observed\t4.2.1\tomarchy-4", "unavailable\tunsupported-major\t-"))).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "unavailable", reason: "future-version" } } });
    expect(parseWorkstationSource(source.replace("4.2.1", "4.2.1-rc.1+build.5"))).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "observed", version: "4.2.1-rc.1+build.5", generation: "omarchy-4" } } });
    const legacy = parseWorkstationSource(source);
    expect(legacy).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "observed", version: "4.2.1", generation: "omarchy-4" } } });
    expect(Result.isSuccess(legacy) && legacy.success.omarchy).not.toHaveProperty("revision");
    for (const value of [source.replace("4.2.1\tomarchy-4", "3.2.1\tomarchy-4"), source.replace("4.2.1\tomarchy-4", "4.2.1\tomarchy-3")]) expect(parseWorkstationSource(value)).toMatchObject({ _tag: "Success", success: { platform: { name: "linux", architecture: "x86_64" }, omarchy: { availability: "unavailable", reason: "ambiguous-version" } } });
    for (const value of [
      source.replace("4.2.1\tomarchy-4", "5.0.0\tunknown"),
      source.replace("unavailable", "../../private"),
    ]) expect(Result.isFailure(parseWorkstationSource(value))).toBe(true);
  });

  test("rejects selector and relationship contradictions", () => {
    for (const value of [
      source.replace("macos,shared", "shared,shared"),
      source.replace("macos,shared", "shared,macos"),
      source.replace("macos,shared", "macos,,shared"),
      source.replace("macos,shared", "macos,"),
      source.replace("profile:omarchy\tomarchy", "profile:omarchy\tbase"),
      source.replace("arch/omarchy\tavailable", "shared\tavailable"),
      source.replace(/^expectation\tprofile:base\tdarwin.*\n/m, ""),
      source.replace(/^program\tprogram:ghostty.*\n/m, ""),
      source.replace("profile:omarchy\tlinux\tarch/omarchy", "profile:base\tlinux\tarch/omarchy"),
    ]) expect(Result.isFailure(parseWorkstationSource(value))).toBe(true);
  });

  test("returns recursively frozen detached observations", () => {
    const result = parseWorkstationSource(source);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isFailure(result)) throw result.failure;
    const observation = result.success;
    expect([observation, observation.platform, observation.omarchy, observation.profiles, observation.profiles[0], observation.profiles[0]?.dotfileSelectors, observation.expectations, observation.expectations[0], observation.evidence, observation.evidence[0]].every(Object.isFrozen)).toBe(true);
    expect(() => (observation.profiles as unknown as Array<(typeof observation.profiles)[number]>).push(observation.profiles[0]!)).toThrow(TypeError);
    expect(() => ((observation.profiles[0]!.dotfileSelectors as string[])[0] = "changed")).toThrow(TypeError);
    const reparsed = parseWorkstationSource(source);
    expect(Result.isSuccess(reparsed) && reparsed.success.profiles[0]?.dotfileSelectors).toEqual(["macos", "shared"]);
  });

  test("enforces output and line bounds in encoded UTF-8 bytes", () => {
    const overlongLine = source.replace("status\tcomplete\n", `unknown\t${"é".repeat(253)}\nstatus\tcomplete\n`);
    const oversizedOutput = `${source}${"é".repeat(131000)}`;
    for (const value of [overlongLine, oversizedOutput]) expect(parseWorkstationSource(value)).toMatchObject({ _tag: "Failure", failure: { code: "source-bounds-or-privacy" } });
  });

  test("retains BRF platform and architecture as plan context", () => {
    const brf = `schema\tbrf-v1\nplan_schema\tv1\nplatform\tlinux\tx86_64\nengine_digest\t${digest}\ncatalog_digest\t${digest}\nprofile\tbase\naction\talpha\tmanaged-state\t1\trequired\tfixture\tdesired\tnoop\tautomatic\nprofile_complete\ttrue\n`;
    expect(parseBrf(brf)).toMatchObject({ _tag: "Success", success: { platform: "linux", architecture: "x86_64" } });
  });
});

describe("workstation source bridge", () => {
  const process = (exitCode: number, stdout: string) => Layer.succeed(BashProcess, {
    run: () => Effect.succeed({ exitCode, stdout }),
  });

  test("allows only the exact non-mutating observe argv", () => {
    expect(isAllowedArgv(["workstation-bootstrap", "observe", "--profile", "profile:base"])).toBe(true);
    expect(isAllowedArgv(["workstation-bootstrap", "observe", "--profile", "base"])).toBe(false);
    expect(isAllowedArgv(["workstation-bootstrap", "observe", "--profile", "profile:base", "--apply"])).toBe(false);
    expect(isAllowedArgv(["workstation-bootstrap", "apply", "--profile", "profile:base"])).toBe(false);
    expect(isAllowedArgv(["bash", "-c", "workstation-bootstrap observe --profile profile:base"])).toBe(false);
  });

  it.effect("returns parsed safe records and preserves validated structured refusal codes", () => Effect.gen(function*() {
    const bridge = yield* BashBridge;
    const observation = yield* bridge.source({ form: "observe", profile: "profile:base" });
    expect(observation.profiles.map((profile) => profile.id)).toEqual(["profile:base", "profile:omarchy"]);
  }).pipe(Effect.provide(Layer.provide(bashBridgeLayer, process(0, source)))));

  it.effect("keeps malformed exit-2 output generic and private", () => Effect.gen(function*() {
    const bridge = yield* BashBridge;
    const refusal = yield* bridge.source({ form: "observe", profile: "profile:base" }).pipe(Effect.catchTag("Refused", Effect.succeed));
    expect(refusal).toMatchObject({ _tag: "Refused", code: "command-refused" });
    expect(JSON.stringify(refusal)).not.toContain("/home/alice");
  }).pipe(Effect.provide(Layer.provide(bashBridgeLayer, process(2, "/home/alice token")))));

  it.effect("preserves an allowlisted refusal from exact structured stdout", () => Effect.gen(function*() {
    const bridge = yield* BashBridge;
    const refusal = yield* bridge.source({ form: "observe", profile: "profile:base" }).pipe(Effect.catchTag("Refused", Effect.succeed));
    expect(refusal).toMatchObject({ _tag: "Refused", code: "SOURCE_MANIFEST_INVALID" });
  }).pipe(Effect.provide(Layer.provide(bashBridgeLayer, process(2, "schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID\n")))));

  it.effect("rejects unknown refusal codes instead of exposing raw source output", () => Effect.gen(function*() {
    const bridge = yield* BashBridge;
    const refusal = yield* bridge.source({ form: "observe", profile: "profile:base" }).pipe(Effect.catchTag("Refused", Effect.succeed));
    expect(refusal).toMatchObject({ _tag: "Refused", code: "command-refused" });
    expect(JSON.stringify(refusal)).not.toContain("PRIVATE_PATH");
  }).pipe(Effect.provide(Layer.provide(bashBridgeLayer, process(2, "schema\tworkstation-source-v1\nstatus\trefused\tPRIVATE_PATH\n")))));
});
