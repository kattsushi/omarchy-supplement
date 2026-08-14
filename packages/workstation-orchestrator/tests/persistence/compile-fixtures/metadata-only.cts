import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PersistencePort } from "../../../src/application/ports/persistence-port.js";

const layer = Layer.succeed(PersistencePort, {
  put: () => Effect.succeed("inserted" as const),
  get: () => Effect.succeed(Option.none()),
  erase: () => Effect.void,
  eraseExpired: () => Effect.succeed(0),
});

void layer;
