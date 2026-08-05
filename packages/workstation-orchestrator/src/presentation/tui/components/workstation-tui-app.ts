import { createSignal } from "solid-js";
import type { PublicResultV2 } from "../../../application/contracts/public-result.js";
import { tuiPartsFoundation } from "../tuiparts/primitives.js";
import { createTuiController, createTuiPresentation } from "../view-models/presentation.js";

export const createWorkstationTuiApp = (result: PublicResultV2, initialColumns: number) => {
  const controller = createTuiController(result, initialColumns);
  const [columns, setColumns] = createSignal(initialColumns);
  const [revision, setRevision] = createSignal(0);
  const update = (key: string): void => {
    controller.handleKey(key);
    setRevision((current) => current + 1);
  };

  return {
    state: () => {
      revision();
      return controller.state();
    },
    presentation: () => {
      revision();
      return createTuiPresentation(result, columns());
    },
    onKey: update,
    onResize: (width: number): void => { setColumns(width); },
    mountOpenTuiInteractions: (): void => {
      tuiPartsFoundation.keyboard((key) => update(key.name));
      tuiPartsFoundation.resize((width) => { setColumns(width); });
    },
  };
};
