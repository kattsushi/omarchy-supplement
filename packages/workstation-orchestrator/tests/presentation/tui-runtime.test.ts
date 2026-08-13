import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { KeyEvent } from "@opentui/core";
import type { PublicResultV2 } from "../../src/application/contracts/public-result.js";
import { runWorkstation } from "../../src/presentation/cli/main.js";
import { createWorkstationTuiApp } from "../../src/presentation/tui/components/workstation-tui-app.js";
import { runRendererLifecycle, runWorkstationTui, TuiLifecycleError, type TuiRenderer } from "../../src/presentation/tui/runtime.js";

const execFileAsync = promisify(execFile);

const unavailable: PublicResultV2 = {
  version: "PublicResultV2", operation: "assess_workstation", status: "unsupported", correlationId: "request:test",
  payload: { kind: "unavailable", operation: "assess_workstation", reason: "source-unavailable" },
  blockers: [{ code: "operation-unsupported" }], evidence: [], nextActions: [],
};

class LifecycleRenderer extends EventEmitter {
  readonly width = 80;
  readonly keyInput = new EventEmitter();
  screenContent = "";
  updateCalls = 0;
  failUpdate = false;
  readonly screen = Object.defineProperty({}, "content", {
    get: () => this.screenContent,
    set: (value: string) => {
      this.updateCalls++;
      if (this.failUpdate) throw new Error("frame update failure");
      this.screenContent = value;
    },
  }) as { content: string };
  readonly root = { add: vi.fn(), getRenderable: vi.fn(() => this.screen) };
  isDestroyed = false;
  destroyCalls = 0;
  destroy(): void {
    this.destroyCalls++;
    this.isDestroyed = true;
    this.emit("destroy");
  }
  key(name: string, ctrl = false): void {
    this.keyInput.emit("keypress", { name, ctrl, shift: false } as KeyEvent);
  }
  lifecycle() { return runRendererLifecycle(unavailable, this as unknown as TuiRenderer); }
}

afterEach(() => vi.restoreAllMocks());

describe("read-only TUI runtime", () => {
  test("captures a frame, navigates, and quits cleanly under Bun OpenTUI", async () => {
    const { stdout } = await execFileAsync("bun", ["tests/presentation/tui-runtime-smoke.ts"], { cwd: process.cwd(), timeout: 10_000 });
    expect(JSON.parse(stdout)).toEqual({
      title: true,
      usefulSource: true,
      initialFrameReady: true,
      navigated: true,
      blockerVisible: true,
      destroyCalls: [1, 1, 1, 1],
      exactDestroy: true,
      listenersRestored: true,
    });
  });

  test.each([["q", false], ["escape", false], ["c", true]] as const)("settles %s once and restores listener baselines", async (name, ctrl) => {
    const renderer = new LifecycleRenderer();
    const running = renderer.lifecycle();
    await Promise.resolve();
    expect(renderer.keyInput.listenerCount("keypress")).toBe(1);
    expect(renderer.listenerCount("destroy")).toBe(1);

    renderer.key(name, ctrl);
    renderer.key("6");
    await running;

    expect(renderer.destroyCalls).toBe(1);
    expect(renderer.updateCalls).toBe(0);
    expect(renderer.keyInput.listenerCount("keypress")).toBe(0);
    expect(renderer.listenerCount("destroy")).toBe(0);
  });

  test("does not destroy twice after external destruction", async () => {
    const renderer = new LifecycleRenderer();
    const running = renderer.lifecycle();
    await Promise.resolve();

    renderer.destroy();
    await running;

    expect(renderer.destroyCalls).toBe(1);
    expect(renderer.keyInput.listenerCount("keypress")).toBe(0);
    expect(renderer.listenerCount("destroy")).toBe(0);
  });

  test("rejects callback failures and cleans up without an unhandled settlement", async () => {
    const renderer = new LifecycleRenderer();
    const createFailingApp = (result: PublicResultV2, width: number) => ({
      ...createWorkstationTuiApp(result, width),
      onKey: () => { throw new Error("private callback failure"); },
    });
    const running = runRendererLifecycle(unavailable, renderer as unknown as TuiRenderer, createFailingApp);
    await Promise.resolve();

    renderer.key("6");
    renderer.key("7");
    await expect(running).rejects.toEqual(new TuiLifecycleError());
    expect(renderer.destroyCalls).toBe(1);
    expect(renderer.keyInput.listenerCount("keypress")).toBe(0);
    expect(renderer.listenerCount("destroy")).toBe(0);
  });

  test("rejects frame construction and update failures with the same cleanup", async () => {
    const construction = new LifecycleRenderer();
    const createFailingFrame = (result: PublicResultV2, width: number) => ({
      ...createWorkstationTuiApp(result, width),
      presentation: () => { throw new Error("frame construction failure"); },
    });
    await expect(runRendererLifecycle(unavailable, construction as unknown as TuiRenderer, createFailingFrame)).rejects.toEqual(new TuiLifecycleError());
    expect(construction.destroyCalls).toBe(1);
    expect(construction.keyInput.listenerCount("keypress")).toBe(0);
    expect(construction.listenerCount("destroy")).toBe(0);

    const update = new LifecycleRenderer();
    update.failUpdate = true;
    const running = update.lifecycle();
    await Promise.resolve();
    update.key("6");
    await expect(running).rejects.toEqual(new TuiLifecycleError());
    expect(update.destroyCalls).toBe(1);
    expect(update.keyInput.listenerCount("keypress")).toBe(0);
    expect(update.listenerCount("destroy")).toBe(0);
  });

  test("cleans up render and renderer-creation failures", async () => {
    const renderer = new LifecycleRenderer();
    renderer.root.add.mockImplementation(() => { throw new Error("render failure"); });

    await expect(renderer.lifecycle()).rejects.toEqual(new TuiLifecycleError());
    expect(renderer.destroyCalls).toBe(1);
    expect(renderer.keyInput.listenerCount("keypress")).toBe(0);
    expect(renderer.listenerCount("destroy")).toBe(0);

    const signals = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    await expect(runWorkstationTui(async () => { throw new Error("creation failure"); })).rejects.toThrow("Workstation TUI failed to start");
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(signals);
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
