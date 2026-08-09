import { Dialog } from "@tuiparts/solid/dialog";
import { Tabs } from "@tuiparts/solid/tabs";
import { onResize, useKeyboard } from "@opentui/solid";

export const tuiPartsFoundation = {
  tabs: Tabs,
  dialog: Dialog,
  keyboard: (listener: Parameters<typeof useKeyboard>[0]): void => useKeyboard(listener),
  resize: (listener: Parameters<typeof onResize>[0]): void => onResize(listener),
};
