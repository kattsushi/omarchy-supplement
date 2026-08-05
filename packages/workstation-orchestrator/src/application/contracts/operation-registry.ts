import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { AgentOperation, AgentRequest } from "./agent-request.js";
import type { PublicResult } from "./public-result.js";

export const operationNames = ["assess_workstation", "list_profiles", "plan_package_install", "show_evidence", "show_backup", "restore_guidance"] as const;
export const unsupportedResult = (operation: AgentOperation, correlationId: string): PublicResult => ({
  version: "PublicResultV1", status: "unsupported", correlationId,
  blockers: [{ code: "operation-unsupported" }], evidence: [], nextActions: [],
});
export const refusedResult = (correlationId: string): PublicResult => ({
  version: "PublicResultV1", status: "refused", correlationId,
  blockers: [{ code: "operation-refused" }], evidence: [], nextActions: [],
});

type OperationHandler = (request: AgentRequest) => Effect.Effect<PublicResult, never>;
export type OperationHandlers = { readonly [Name in AgentOperation]: OperationHandler };
const unavailable = (request: AgentRequest) => Effect.succeed(unsupportedResult(request.operation, request.requestId));

export const unavailableOperationHandlers: OperationHandlers = {
  assess_workstation: unavailable,
  list_profiles: unavailable,
  plan_package_install: unavailable,
  show_evidence: unavailable,
  show_backup: unavailable,
  restore_guidance: unavailable,
};

export interface OperationRegistryShape {
  readonly handlers: OperationHandlers;
  readonly execute: (request: AgentRequest) => Effect.Effect<PublicResult, never>;
}
const makeRegistry = (handlers: OperationHandlers): OperationRegistryShape => ({
  handlers,
  execute: (request) => handlers[request.operation](request),
});
export class OperationRegistry extends Context.Service<OperationRegistry, OperationRegistryShape>()("OperationRegistry", {
  make: Effect.succeed(makeRegistry(unavailableOperationHandlers)),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export const makeOperationRegistry = (handlers: OperationHandlers = unavailableOperationHandlers) => makeRegistry(handlers);
