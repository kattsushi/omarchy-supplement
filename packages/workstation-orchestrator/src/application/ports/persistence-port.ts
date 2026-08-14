import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { LedgerRecord, PersistencePutResult } from "../contracts/persistence.js";
import { PersistenceFailure } from "../contracts/persistence.js";

export { PersistenceFailure, type PersistencePutResult } from "../contracts/persistence.js";

export class PersistencePort extends Context.Service<PersistencePort, {
  readonly put: (record: LedgerRecord) => Effect.Effect<PersistencePutResult, PersistenceFailure>;
  readonly get: (recordId: string) => Effect.Effect<Option.Option<LedgerRecord>, PersistenceFailure>;
  readonly erase: (recordId: string) => Effect.Effect<void, PersistenceFailure>;
  readonly eraseExpired: (asOf: number) => Effect.Effect<number, PersistenceFailure>;
}>()("PersistencePort", { make: Effect.never }) {
  static readonly layer = Layer.effect(this, this.make);
}
