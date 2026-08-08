import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runWorkstation } from "../../src/presentation/cli/main.js";

const execFileAsync = promisify(execFile);

afterEach(() => vi.restoreAllMocks());

describe("read-only TUI runtime", () => {
  test("captures a frame, navigates, and quits cleanly under Bun OpenTUI", async () => {
    const { stdout } = await execFileAsync("bun", ["tests/presentation/tui-runtime-smoke.ts"], { cwd: process.cwd(), timeout: 10_000 });
    expect(JSON.parse(stdout)).toEqual({
      title: true,
      unavailable: true,
      navigated: true,
      destroyed: true,
    });
  });

  test("dispatches the tui route without writing invalid-request JSON", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const runTui = vi.fn(async () => {});

    await expect(runWorkstation(["tui"], undefined, runTui)).resolves.toBe(0);
    expect(runTui).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  test("retains agent and invalid JSON route behavior", async () => {
    const writes: Array<string | Uint8Array> = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => { writes.push(value as string | Uint8Array); return true; });
    const request = new TextEncoder().encode(JSON.stringify({
      version: "AgentRequestV1", requestId: "request:cli-test", operation: "assess_workstation", input: { programIds: [] }, timeoutSeconds: 30,
    }));

    await expect(runWorkstation(["agent"], async () => request)).resolves.toBe(3);
    const text = (value: string | Uint8Array): string => typeof value === "string" ? value : new TextDecoder().decode(value);
    expect(JSON.parse(text(writes.pop()!))).toMatchObject({ status: "unsupported", payload: { reason: "source-unavailable" } });
    await expect(runWorkstation(["invalid"])).resolves.toBe(64);
    expect(JSON.parse(text(writes.pop()!))).toMatchObject({ status: "invalid-request" });
  });
});
