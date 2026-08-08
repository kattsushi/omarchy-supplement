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
program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable
status\tcomplete
`;

describe("workstation-source-v1 parser", () => {
  test("parses source-owned mappings without promoting executable presence", () => {
    expect(parseWorkstationSource(source)).toMatchObject({
      _tag: "Success",
      success: {
        platform: { name: "linux", architecture: "x86_64" },
        omarchy: { availability: "observed", version: "4.2.1", generation: "omarchy-4" },
        profiles: [{ id: "profile:base", selected: true }, { id: "profile:omarchy", selected: false }],
        evidence: [{ id: "program:neovim", availability: "present", version: "unavailable", configuration: "unavailable", dotfileStow: "unavailable", acquisition: "unavailable" }],
      },
    });
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

  test("parses unavailable and future Omarchy authority without inventing generation support", () => {
    expect(parseWorkstationSource(source.replace("observed\t4.2.1\tomarchy-4", "unavailable\ttimeout\t-"))).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "unavailable", reason: "timeout" } } });
    expect(parseWorkstationSource(source.replace("4.2.1\tomarchy-4", "5.0.0\tunknown"))).toMatchObject({ _tag: "Success", success: { omarchy: { availability: "observed", version: "5.0.0", generation: "unknown" } } });
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
