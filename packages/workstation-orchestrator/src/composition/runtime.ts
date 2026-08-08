import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import type { AgentRequest } from "../application/contracts/agent-request.js";
import type { PublicResult } from "../application/contracts/public-result.js";
import { type PresentationAdapter } from "../presentation/atoms/request-session.js";
import { ReadOnlyRequestService } from "./read-only.js";

export const createReadOnlyRuntime = <R, E>(layer: Layer.Layer<R, E>) => ManagedRuntime.make(layer);

export const presentationAdapter = <E>(runtime: ManagedRuntime.ManagedRuntime<ReadOnlyRequestService, E>): PresentationAdapter => ({
  invoke: (request: AgentRequest, signal: AbortSignal): Promise<PublicResult> => runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* ReadOnlyRequestService;
      return yield* service.dispatch(request);
    }),
    { signal },
  ),
});
