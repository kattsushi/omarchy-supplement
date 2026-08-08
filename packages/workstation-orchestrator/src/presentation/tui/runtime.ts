import { CliRenderEvents, Text, createCliRenderer, type CliRenderer, type KeyEvent, type TextRenderable } from "@opentui/core";
import * as Effect from "effect/Effect";
import type { AgentRequest } from "../../application/contracts/agent-request.js";
import type { PublicResultV2 } from "../../application/contracts/public-result.js";
import { createReadOnlyRuntime } from "../../composition/runtime.js";
import { readOnlyLayer, ReadOnlyRequestService } from "../../composition/read-only.js";
import { createWorkstationTuiApp } from "./components/workstation-tui-app.js";

export type TuiRendererFactory = () => Promise<CliRenderer>;

const initialRequest: AgentRequest = {
  version: "AgentRequestV1",
  requestId: "request:tui",
  operation: "assess_workstation",
  input: { programIds: [] },
  timeoutSeconds: 30,
};

const keyName = (key: KeyEvent): string => {
  if (key.name === "up") return "ArrowUp";
  if (key.name === "down") return "ArrowDown";
  if (key.name === "return") return "Enter";
  if (key.name === "escape") return "Escape";
  if (key.name === "tab") return key.shift ? "Shift+Tab" : "Tab";
  return key.name;
};

const frameFor = (result: PublicResultV2, app: ReturnType<typeof createWorkstationTuiApp>): string => {
  const presentation = app.presentation();
  const state = app.state();
  const view = presentation.views.find(({ id }) => id === state.viewId)!;
  const source = result.payload.kind === "unavailable" ? result.payload.reason : "read-only result";
  const items = view.items.length === 0 ? ["No data available"] : view.items;
  const details = state.overlay === "details" ? `\n\nDetails\n${JSON.stringify(result.payload, null, 2)}` : "";

  return [
    "WORKSTATION / READ ONLY",
    `Status: ${result.status} | Source: ${source}`,
    "",
    presentation.views.map(({ shortTitle }, index) => `${index + 1} ${shortTitle}`).join("  "),
    "",
    view.title,
    ...items.map((item) => `${state.selectedId !== undefined && item.startsWith(state.selectedId) ? ">" : " "} ${item}`),
    "",
    "Keys: 1-8 views | Up/Down select | Enter details | q/Esc quit",
  ].join("\n") + details;
};

export const runWorkstationTui = async (createRenderer: TuiRendererFactory = createCliRenderer): Promise<void> => {
  const runtime = createReadOnlyRuntime(readOnlyLayer);
  let renderer: CliRenderer | undefined;
  let quit = (): void => {};
  try {
    const result = await runtime.runPromise(Effect.gen(function*() {
      return yield* (yield* ReadOnlyRequestService).dispatch(initialRequest);
    }));
    if (result.version !== "PublicResultV2") throw new Error("TUI requires a PublicResultV2 read-only projection");

    renderer = await createRenderer();
    const app = createWorkstationTuiApp(result, renderer.width);
    renderer.root.add(Text({ id: "workstation-screen", content: frameFor(result, app), width: "100%", height: "100%" }));
    const screen = renderer.root.getRenderable("workstation-screen") as TextRenderable;

    await new Promise<void>((resolve) => {
      quit = resolve;
      const onKey = (key: KeyEvent): void => {
        const name = keyName(key);
        if ((key.ctrl && name === "c") || name === "q" || (name === "Escape" && app.state().overlay === undefined)) return quit();
        app.onKey(name);
        screen.content = frameFor(result, app);
      };
      renderer!.keyInput.on("keypress", onKey);
      process.once("SIGINT", quit);
      process.once("SIGTERM", quit);
      renderer!.once(CliRenderEvents.DESTROY, quit);
    });
  } finally {
    process.removeListener("SIGINT", quit);
    process.removeListener("SIGTERM", quit);
    renderer?.destroy();
    await runtime.dispose();
  }
};
