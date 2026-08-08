import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-solid";
import type { PresentationSession } from "../atoms/request-session.js";
import { projectRequestState } from "../view-models/request-state.js";

export { RegistryProvider as WorkstationRegistryProvider } from "@effect/atom-solid";

export const useWorkstationProjection = (session: PresentationSession) => {
  const request = useAtomValue(() => session.atoms.request);
  const [interaction, setInteraction] = useAtom(() => session.atoms.interaction);
  return {
    request: () => projectRequestState(request()),
    interaction,
    refresh: session.refresh,
    cancel: session.cancel,
    select: (selectedId: string | undefined): void => setInteraction((current) => ({ ...current, selectedId })),
    navigate: session.navigate,
    filter: session.filter,
  };
};

export const workstationRegistryProvider = RegistryProvider;
