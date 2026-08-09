import { describe, expect, test } from "vitest";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { BashBridge } from "../../src/application/ports/bash.js";
import { BashOperationalFailure, decodeBootstrapRequest, decodeDotfilesRequest } from "../../src/application/contracts/bash.js";
import { bashBridgeLayer, commandDescriptors, isAllowedArgv } from "../../src/infrastructure/subprocess/argv.js";
import { BashProcess } from "../../src/infrastructure/subprocess/process.js";
import { parseInventory } from "../../src/infrastructure/bash-contracts/dotfiles.js";
import { parseBrf } from "../../src/infrastructure/bash-contracts/bootstrap.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inventory = `schema\tinventory-v1\nfile\tREADME.md\tfile\t100644\t1\t${digest}\tREADME.md\tarch/omarchy\tinclude\tapproved\tclear\n`;
const brf = `schema\tbrf-v1\nplan_schema\tv1\nplatform\tlinux\tx86_64\nengine_digest\t${digest}\ncatalog_digest\t${digest}\nprofile\tbase\naction\talpha\tmanaged-state\t1\trequired\tfixture\tdesired\tnoop\tautomatic\nprofile_complete\ttrue\n`;

describe("bash bridge contracts", () => {
  test("Schema rejects mutations and unknown flags", () => {
    for (const value of [
      { form: "materialize-apply" },
      { form: "stow-check", profile: "base", platform: "linux", target: "target:x", force: true },
      { form: "plan", profiles: ["base"], apply: true },
    ]) expect(Result.isFailure(decodeDotfilesRequest(value)) || Result.isFailure(decodeBootstrapRequest(value))).toBe(true);
  });

  test("the descriptor table compiles every accepted argv and is the allowlist", () => {
    for (const descriptor of commandDescriptors) {
      const argv = descriptor.argv(descriptor.example);
      expect(isAllowedArgv(argv)).toBe(true);
    }
    expect(isAllowedArgv(["workstation-dotfiles", "stow", "apply"])).toBe(false);
  });

  test("parsers return Result failures, preserve full digests, and reject malformed records", () => {
    expect(parseInventory(inventory)).toMatchObject({ _tag: "Success", success: { records: [{ digest }] } });
    for (const text of [inventory.replace("README.md", "../bad"), `${inventory}file\tREADME.md\tfile\t100644\t1\t${digest}\tREADME.md\tarch/omarchy\tinclude\tapproved\tclear\n`]) {
      expect(Result.isFailure(parseInventory(text))).toBe(true);
    }
    expect(parseBrf(brf.replace("profile_complete\ttrue", "profile_complete\tfalse"))).toMatchObject({ _tag: "Failure", failure: { _tag: "Refused" } });
    expect(Result.isFailure(parseBrf(brf.replace("action\talpha", "action\tzeta").replace("profile\tbase", "profile\tzulu\nprofile\tbase")))).toBe(true);
    expect(Result.isFailure(parseBrf(brf.replace("profile_complete\ttrue\n", "")))).toBe(true);
  });
});

describe("bash bridge effect boundary", () => {
  const process = (effect: Effect.Effect<{ readonly exitCode: number; readonly stdout: string }, BashOperationalFailure>) =>
    Layer.succeed(BashProcess, { run: () => effect });

  it.effect("refusal is an exit-2 failure and operational output stays private", () => Effect.gen(function*() {
    const bridge = yield* BashBridge;
    const refused = yield* bridge.dotfiles({ form: "inventory-verify" }).pipe(Effect.catchTag("Refused", Effect.succeed));
    expect(refused).toMatchObject({ _tag: "Refused", code: "command-refused" });
      }).pipe(
        Effect.provide(Layer.provide(bashBridgeLayer, process(Effect.succeed({ exitCode: 2, stdout: "/home/alice secret" })))),
      ));

      it.effect("timeout and output-limit failures are sanitized", () => Effect.gen(function*() {
            const bridge = yield* BashBridge;
            const timeout = yield* bridge.dotfiles({ form: "inventory-verify" }).pipe(Effect.catchTag("BashOperationalFailure", Effect.succeed));
            expect(timeout).toMatchObject({ _tag: "BashOperationalFailure", code: "timeout" });
            expect(JSON.stringify(timeout)).not.toContain("/home/alice");
      }).pipe(
            Effect.provide(Layer.provide(bashBridgeLayer, process(Effect.fail(new BashOperationalFailure({ code: "timeout", evidenceDigest: "fingerprint:timeout" }))))),
      ));

      it.effect("nonzero exits and output limits remain operational errors", () => Effect.gen(function*() {
            const bridge = yield* BashBridge;
            const limited = yield* bridge.dotfiles({ form: "inventory-verify" }).pipe(Effect.catchTag("BashOperationalFailure", Effect.succeed));
            expect(limited).toMatchObject({ _tag: "BashOperationalFailure", code: "output-limit" });
      }).pipe(
            Effect.provide(Layer.provide(bashBridgeLayer, process(Effect.fail(new BashOperationalFailure({ code: "output-limit", evidenceDigest: "fingerprint:limit" }))))),
      ));

      it.effect("nonzero output maps to a sanitized process exit", () => Effect.gen(function*() {
            const bridge = yield* BashBridge;
            const exit = yield* bridge.dotfiles({ form: "inventory-verify" }).pipe(Effect.catchTag("BashOperationalFailure", Effect.succeed));
            expect(exit).toMatchObject({ _tag: "BashOperationalFailure", code: "exit" });
      }).pipe(
            Effect.provide(Layer.provide(bashBridgeLayer, process(Effect.succeed({ exitCode: 1, stdout: "/home/alice private" })))),
      ));
});
