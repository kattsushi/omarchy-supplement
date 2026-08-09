import { describe, expect, test } from "vitest";
import { getEventListeners } from "node:events";
import * as Effect from "effect/Effect";
import { BashProcess, makeWorkstationSourceProcessLayer } from "../../src/infrastructure/subprocess/process.js";

const argv = ["workstation-bootstrap", "observe", "--profile", "profile:base"];
const process = (stdout: ReadableStream<Uint8Array>, exitCode = 0) => {
  let killed = 0;
  let resolveExit!: (code: number) => void;
  const exited = new Promise<number>((resolve) => { resolveExit = resolve; });
  if (exitCode >= 0) resolveExit(exitCode);
  return {
    child: { stdout, exited, kill: () => { killed++; resolveExit(143); } },
    killed: () => killed,
  };
};
const run = (child: ReturnType<typeof process>["child"], signal?: AbortSignal) => Effect.runPromise(Effect.gen(function*() {
  return yield* (yield* BashProcess).run(argv);
}).pipe(Effect.provide(makeWorkstationSourceProcessLayer(() => child))), signal === undefined ? undefined : { signal });

describe("bounded workstation source process", () => {
  test("kills and awaits a hanging child when the fiber is cancelled", async () => {
    let cancelled = 0;
    const fake = process(new ReadableStream({ cancel: () => { cancelled++; } }), -1);
    const controller = new AbortController();
    const pending = run(fake.child, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    await expect(pending).rejects.toBeDefined();
    expect(fake.killed()).toBe(1);
    expect(cancelled).toBe(1);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    await expect(fake.child.exited).resolves.toBe(143);
  });

  test("kills immediately when incremental stdout exceeds 256 KiB", async () => {
    let pulls = 0;
    const fake = process(new ReadableStream({
      pull: (controller) => {
        pulls++;
        controller.enqueue(new Uint8Array(pulls === 1 ? 256 * 1024 : 1));
        if (pulls === 10) controller.close();
      },
    }), -1);

    await expect(run(fake.child)).rejects.toMatchObject({ _tag: "BashOperationalFailure", code: "output-limit" });
    expect(fake.killed()).toBe(1);
    expect(pulls).toBeLessThan(10);
  });

  test("decodes split multibyte output only after all bounded bytes arrive", async () => {
    const fake = process(new ReadableStream({
      start: (controller) => {
        controller.enqueue(new Uint8Array(256 * 1024 - 5).fill(0x61));
        controller.enqueue(Uint8Array.from([0xf0, 0x9f]));
        controller.enqueue(Uint8Array.from([0x98, 0x80, 0x0a]));
        controller.close();
      },
    }));

    const result = await run(fake.child);
    expect(new TextEncoder().encode(result.stdout)).toHaveLength(256 * 1024);
    expect(result.stdout.endsWith("😀\n")).toBe(true);
    expect(fake.killed()).toBe(0);
  });

  test("fails closed when bounded stdout has no final newline", async () => {
    const fake = process(new ReadableStream({ start: (controller) => { controller.enqueue(new TextEncoder().encode("bounded")); controller.close(); } }), -1);

    await expect(run(fake.child)).rejects.toMatchObject({ _tag: "BashOperationalFailure", code: "spawn", evidenceDigest: "fingerprint:source-process" });
    expect(fake.killed()).toBe(1);
  });

  test("sanitizes stream failures without leaking raw diagnostics", async () => {
    const fake = process(new ReadableStream({ pull: () => { throw new Error("/home/private stdout secret"); } }), -1);

    const error = await run(fake.child).catch((value) => value);
    expect(error).toMatchObject({ _tag: "BashOperationalFailure", code: "spawn", evidenceDigest: "fingerprint:source-process" });
    expect(JSON.stringify(error)).not.toMatch(/home|private|stdout|secret/i);
    expect(fake.killed()).toBe(1);
  });
});
