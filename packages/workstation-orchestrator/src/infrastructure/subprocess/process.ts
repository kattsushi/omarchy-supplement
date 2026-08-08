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
type SourceChild = { readonly stdout: ReadableStream<Uint8Array>; readonly exited: Promise<number>; readonly kill: () => void };
type SpawnSource = () => SourceChild;
type RunningSource = { readonly child: SourceChild; reader?: ReadableStreamDefaultReader<Uint8Array>; exited: boolean; terminated: boolean };
const outputLimit = 256 * 1024;
const terminate = (running: RunningSource) => {
  if (!running.exited && !running.terminated) { running.terminated = true; running.child.kill(); }
};

const consume = async (running: RunningSource, signal: AbortSignal): Promise<ProcessOutput> => {
  const reader = running.child.stdout.getReader();
  running.reader = reader;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { terminate(running); void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > outputLimit) {
        terminate(running);
        await reader.cancel().catch(() => {});
        throw new Error("output-limit");
      }
      chunks.push(value);
      size += value.byteLength;
    }
    if (signal.aborted) throw new Error("cancelled");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const stdout = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!stdout.endsWith("\n")) throw new Error("missing-newline");
    const exitCode = await running.child.exited;
    running.exited = true;
    return { exitCode, stdout };
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
    running.reader = undefined;
  }
};

const cleanup = async (running: RunningSource): Promise<void> => {
  terminate(running);
  await running.reader?.cancel().catch(() => {});
  await running.child.exited.catch(() => -1);
};

const spawnSource: SpawnSource = () => {
  const child = Bun.spawn(["bash", sourceCommand, ...sourceArgv.slice(1)], { stdout: "pipe", stderr: "ignore" });
  return { stdout: child.stdout, exited: child.exited, kill: () => child.kill() };
};

export const makeWorkstationSourceProcessLayer = (spawn: SpawnSource = spawnSource) => Layer.succeed(BashProcess, {
  run: (argv) => !same(argv, sourceArgv)
    ? Effect.fail(new BashOperationalFailure({ code: "spawn", evidenceDigest: "fingerprint:command-refused" }))
    : Effect.acquireUseRelease(
      Effect.try({ try: () => ({ child: spawn(), exited: false, terminated: false } satisfies RunningSource), catch: () => new BashOperationalFailure({ code: "spawn", evidenceDigest: "fingerprint:source-process" }) }),
      (running) => Effect.tryPromise({
        try: (signal) => consume(running, signal),
        catch: (error) => new BashOperationalFailure({ code: error instanceof Error && error.message === "output-limit" ? "output-limit" : "spawn", evidenceDigest: "fingerprint:source-process" }),
      }),
      (running) => Effect.promise(() => cleanup(running)),
    ),
});

export const workstationSourceProcessLayer = makeWorkstationSourceProcessLayer();
