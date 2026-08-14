import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { OmarchyExecutionPort } from "../../../src/application/ports/package-execution.js";
import { PersistencePort } from "../../../src/application/ports/persistence-port.js";
import { createPresentationSession } from "../../../src/presentation/atoms/request-session.js";

type ForbiddenInput =
  | typeof import("bun:sqlite")
  | typeof import("node:fs")
  | OmarchyExecutionPort
  | ReturnType<typeof createPresentationSession>
  | { readonly executable: string; readonly argv: readonly string[] };

const forbiddenLayer = Layer.succeed(PersistencePort, {
  put: (_record: ForbiddenInput) => Effect.succeed("inserted" as const),
  get: () => Effect.succeed(Option.none()),
  erase: () => Effect.void,
  eraseExpired: () => Effect.succeed(0),
});

void forbiddenLayer;
