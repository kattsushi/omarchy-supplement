import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type { AgentRequest } from "../../application/contracts/agent-request.js";
import type { PublicResult, PublicResultV2 } from "../../application/contracts/public-result.js";
import { OperationRegistry } from "../../application/contracts/operation-registry.js";

type FailureStatus = "failed" | "timed-out" | "cancelled";

const failureCode = {
  failed: "operation-failed",
  "timed-out": "operation-timed-out",
  cancelled: "operation-cancelled",
} as const satisfies Record<FailureStatus, "operation-failed" | "operation-timed-out" | "operation-cancelled">;

const publicFailure = (request: AgentRequest, status: FailureStatus): PublicResultV2 => ({
  version: "PublicResultV2", operation: request.operation,
  status,
  correlationId: request.requestId,
  payload: { kind: "unavailable", operation: request.operation, reason: "source-unavailable" },
  blockers: [{ code: failureCode[status] }],
  evidence: [],
  nextActions: [],
});

const failureStatusFor = (cause: Cause.Cause<unknown>): FailureStatus => Match.value(Cause.hasInterruptsOnly(cause)).pipe(
  Match.when(true, () => "cancelled" as const),
  Match.orElse(() => "failed" as const),
);

const sanitize = <E, R>(request: AgentRequest, execute: Effect.Effect<PublicResult, E, R>) => execute.pipe(
  Effect.timeout(`${request.timeoutSeconds} seconds`),
  Effect.catchIf(Cause.isTimeoutError, () => Effect.succeed(publicFailure(request, "timed-out"))),
  Effect.catchCause((cause) => Effect.succeed(publicFailure(request, failureStatusFor(cause)))),
);

export interface AgentRequestDispatcherShape {
  readonly dispatch: (request: AgentRequest) => Effect.Effect<PublicResult, never>;
  readonly run: <E, R>(request: AgentRequest, execute: Effect.Effect<PublicResult, E, R>) => Effect.Effect<PublicResult, never, R>;
}

export class AgentRequestDispatcher extends Context.Service<AgentRequestDispatcher, AgentRequestDispatcherShape>()("AgentRequestDispatcher", {
  make: Effect.gen(function*() {
    const registry = yield* OperationRegistry;
    return { dispatch: registry.execute, run: sanitize };
  }),
}) {
  static readonly layer = Layer.provide(Layer.effect(this, this.make), OperationRegistry.layer);
}
export const boundAgentRequestDispatcherLayer = Layer.effect(AgentRequestDispatcher, AgentRequestDispatcher.make);

export const dispatchAgentRequest = (request: AgentRequest) => Effect.gen(function*() {
  const dispatcher = yield* AgentRequestDispatcher;
  return yield* dispatcher.dispatch(request);
});

export const dispatchOperation = dispatchAgentRequest;
export const runAgentRequest = sanitize;
