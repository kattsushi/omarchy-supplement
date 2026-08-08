import { CliRenderEvents } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { runWorkstationTui } from "../../src/presentation/tui/runtime.js";

const exercise = async (quitKey: "q" | "escape" | "ctrl+c" | "external", navigate = false) => {
  const setup = await createTestRenderer({ width: 80, height: 20 });
  let destroyCalls = 0;
  const destroy = setup.renderer.destroy.bind(setup.renderer);
  setup.renderer.destroy = () => { destroyCalls++; destroy(); };
  const keyBaseline = setup.renderer.keyInput.listenerCount("keypress");
  const destroyBaseline = setup.renderer.listenerCount(CliRenderEvents.DESTROY);
  const running = runWorkstationTui(async () => setup.renderer);
  const frame = await setup.waitForFrame((value) => value.includes("WORKSTATION / READ ONLY"));
  let navigated = false;
  if (navigate) {
    await setup.mockInput.typeText("6");
    await Bun.sleep(10);
    await setup.renderOnce();
    const lines = setup.captureCharFrame().split("\n").map((line) => line.trim());
    navigated = lines.includes("Blockers") && lines.includes("operation-unsupported");
  }
  if (quitKey === "q") await setup.mockInput.typeText("q");
  else if (quitKey === "escape") setup.mockInput.pressEscape();
  else if (quitKey === "external") setup.renderer.destroy();
  else setup.mockInput.pressCtrlC();
  await Bun.sleep(10);
  await running;
  return {
    frame,
    navigated,
    destroyCalls,
    exactDestroy: destroyCalls === 1,
    noListenerIncrease: setup.renderer.keyInput.listenerCount("keypress") <= keyBaseline
      && setup.renderer.listenerCount(CliRenderEvents.DESTROY) <= destroyBaseline,
  };
};

const ctrlC = await exercise("ctrl+c", true);
const q = await exercise("q");
const escape = await exercise("escape");
const external = await exercise("external");
console.log(JSON.stringify({
  title: ctrlC.frame.includes("WORKSTATION / READ ONLY"),
  unavailable: ctrlC.frame.includes("Status: unsupported | Source: source-unavailable"),
  navigated: ctrlC.navigated,
  destroyCalls: [ctrlC.destroyCalls, q.destroyCalls, escape.destroyCalls, external.destroyCalls],
  exactDestroy: ctrlC.exactDestroy && q.exactDestroy && escape.exactDestroy && external.exactDestroy,
  listenersRestored: ctrlC.noListenerIncrease && q.noListenerIncrease && escape.noListenerIncrease && external.noListenerIncrease,
}));
