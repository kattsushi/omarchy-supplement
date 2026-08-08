import * as Atom from "effect/unstable/reactivity/Atom";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import type { AgentRequest } from "../../application/contracts/agent-request.js";
import type { PublicResult } from "../../application/contracts/public-result.js";
import { initialRequestState, projectFailure, projectResult, type RequestState } from "../view-models/request-state.js";

export interface PresentationAdapter {
  readonly invoke: (request: AgentRequest, signal: AbortSignal) => Promise<PublicResult>;
}

export type NavigationTarget = "overview" | "platform-policy" | "profiles" | "programs" | "plans" | "blockers" | "evidence" | "backups";

export type PresentationInteraction = {
  readonly selectedId?: string;
  readonly navigation: NavigationTarget;
  readonly filter: string;
};

const initialInteraction: PresentationInteraction = { navigation: "overview", filter: "" };

export type PresentationSession = ReturnType<typeof createPresentationSession>;

export const createPresentationSession = (adapter: PresentationAdapter) => {
  const registry = AtomRegistry.make();
  const requestAtom = Atom.make(initialRequestState);
  const interactionAtom = Atom.make(initialInteraction);
  let lastRequest: AgentRequest | undefined;
  let controller: AbortController | undefined;

  const current = () => registry.get(requestAtom);
  const nextIdentity = () => current().refreshIdentity + 1;

  const run = async (request: AgentRequest): Promise<void> => {
    controller?.abort();
    lastRequest = request;
    const refreshIdentity = nextIdentity();
    controller = new AbortController();
    const priorResult = current().result;
    registry.set(requestAtom, {
      lifecycle: "loading",
      refreshIdentity,
      ...(priorResult === undefined ? {} : { result: priorResult }),
    });

    try {
      const result = await adapter.invoke(request, controller.signal);
      if (current().refreshIdentity === refreshIdentity) registry.set(requestAtom, projectResult(result, refreshIdentity));
    } catch {
      if (current().refreshIdentity === refreshIdentity) registry.set(requestAtom, projectFailure(refreshIdentity));
    }
  };

  const refresh = async (): Promise<void> => {
    if (lastRequest !== undefined) await run(lastRequest);
  };

  const cancel = (): void => {
    controller?.abort();
    controller = undefined;
    const priorResult = current().result;
    registry.set(requestAtom, {
      ...initialRequestState,
      refreshIdentity: nextIdentity(),
      ...(priorResult === undefined ? {} : { result: priorResult }),
    });
  };

  const updateInteraction = (update: Partial<PresentationInteraction>) => {
    registry.update(interactionAtom, (current) => ({ ...current, ...update }));
  };

  return {
    atoms: { request: requestAtom, interaction: interactionAtom },
    state: (): RequestState => registry.get(requestAtom),
    interaction: (): PresentationInteraction => registry.get(interactionAtom),
    run,
    refresh,
    cancel,
    select: (selectedId: string | undefined): void => updateInteraction({ selectedId }),
    navigate: (navigation: NavigationTarget): void => updateInteraction({ navigation }),
    filter: (filter: string): void => updateInteraction({ filter: filter.slice(0, 128) }),
    dispose: (): void => registry.dispose(),
  };
};
