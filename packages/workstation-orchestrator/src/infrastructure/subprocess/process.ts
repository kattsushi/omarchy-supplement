import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fileURLToPath } from "node:url";
import { BashOperationalFailure } from "../../application/contracts/bash.js";

export type ProcessFailure = BashOperationalFailure;
export interface ProcessOutput { readonly exitCode: number; readonly stdout: string; }
export interface BashProcessShape { readonly run: (argv: readonly string[]) => Effect.Effect<ProcessOutput, ProcessFailure>; }

export class BashProcess extends Context.Service<BashProcess, BashProcessShape>()("BashProcess", {
  make: Effect.never,
}) {
  static readonly layer = Layer.effect(this, this.make);
}

const sourceArgv = ["workstation-bootstrap", "observe", "--profile", "profile:base"] as const;
const sourceCommand = fileURLToPath(new URL("../../../../../bin/workstation-bootstrap", import.meta.url));
const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

export const workstationSourceProcessLayer = Layer.succeed(BashProcess, {
  run: (argv) => !same(argv, sourceArgv)
    ? Effect.fail(new BashOperationalFailure({ code: "spawn", evidenceDigest: "fingerprint:command-refused" }))
    : Effect.tryPromise({
      try: async () => {
        const process = Bun.spawn(["bash", sourceCommand, ...argv.slice(1)], { stdout: "pipe", stderr: "ignore" });
        const stdout = await new Response(process.stdout).text();
        const exitCode = await process.exited;
        if (new TextEncoder().encode(stdout).length > 256 * 1024) throw new Error("output-limit");
        return { exitCode, stdout };
      },
      catch: (error) => new BashOperationalFailure({
        code: error instanceof Error && error.message === "output-limit" ? "output-limit" : "spawn",
        evidenceDigest: "fingerprint:source-process",
      }),
    }),
});
