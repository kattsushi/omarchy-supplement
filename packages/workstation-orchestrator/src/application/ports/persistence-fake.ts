import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { canonicalLedgerRecord, decodeLedgerRecord, type LedgerRecord } from "../contracts/persistence.js";
import { PersistenceFailure } from "../contracts/persistence.js";

export const makeMemoryPersistencePort = () => {
  const records = new Map<string, { readonly canonical: string; readonly record: LedgerRecord }>();
  const put = (input: LedgerRecord) => Effect.suspend(() => {
    const decoded = decodeLedgerRecord(input);
    if (decoded._tag === "Failure") return Effect.fail(decoded.failure);
    const canonical = canonicalLedgerRecord(decoded.success);
    const existing = records.get(decoded.success.recordId);
    if (existing === undefined) {
      records.set(decoded.success.recordId, { canonical, record: decoded.success });
      return Effect.succeed("inserted" as const);
    }
    return existing.canonical === canonical ? Effect.succeed("exact-duplicate" as const) : Effect.fail(new PersistenceFailure({ code: "conflicting-duplicate" }));
  });

  return {
    put,
    get: (recordId: string) => Effect.sync(() => {
      const record = records.get(recordId)?.record;
      return record === undefined ? Option.none() : Option.some(record);
    }),
    erase: (recordId: string) => Effect.sync(() => void records.delete(recordId)),
    eraseExpired: (asOf: number) => Effect.sync(() => {
      const expired = [...records.values()].filter(({ record }) => record.expiresAt <= asOf);
      for (const { record } of expired) records.delete(record.recordId);
      return expired.length;
    }),
  };
};
