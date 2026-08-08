import { CliRenderEvents } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { runWorkstationTui } from "../../src/presentation/tui/runtime.js";

const exercise = async (quitKey: "q" | "escape" | "ctrl+c", navigate = false) => {
  const setup = await createTestRenderer({ width: 80, height: 20 });
  let destroyed = false;
  setup.renderer.once(CliRenderEvents.DESTROY, () => { destroyed = true; });
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
  else setup.mockInput.pressCtrlC();
  await Bun.sleep(10);
  await running;
  return { frame, navigated, destroyed };
};

const ctrlC = await exercise("ctrl+c", true);
const q = await exercise("q");
const escape = await exercise("escape");
console.log(JSON.stringify({
  title: ctrlC.frame.includes("WORKSTATION / READ ONLY"),
  unavailable: ctrlC.frame.includes("Status: unsupported | Source: source-unavailable"),
  navigated: ctrlC.navigated,
  destroyed: ctrlC.destroyed && q.destroyed && escape.destroyed,
}));
