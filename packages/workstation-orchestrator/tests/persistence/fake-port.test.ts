import { describe, expect, test } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { assessLedgerAuthority, canonicalLedgerRecord, ledgerRecordDigest } from "../../src/application/contracts/persistence.js";
import { makeMemoryPersistencePort } from "../../src/application/ports/persistence-fake.js";

const now = 1_700_000_000_000;
const record = (recordId = "ledger:plan", policyId = "policy:alpha") => ({
  schemaVersion: "v1" as const, kind: "plan-binding" as const, recordId, planId: "plan:alpha", bindingDigest: `sha256:${"a".repeat(64)}`, policyId, policyVersion: "v1", evidenceIds: ["evidence:beta", "evidence:alpha"], observedAt: now, expiresAt: now + 1_000,
});

describe("ledger authority blockers", () => {
  test("requires a fresh authoritative observation for missing, stale, and contradictory records", () => {
    expect(assessLedgerAuthority(undefined, { bindingDigest: record().bindingDigest, observedAt: now + 2_000, authoritative: true, explicitUserRecovery: false })).toEqual({ code: "fresh-observation-required", requiresFreshObservation: true, grantsAuthority: false });
    expect(assessLedgerAuthority(record(), { bindingDigest: record().bindingDigest, observedAt: now, authoritative: true, explicitUserRecovery: false })).toEqual({ code: "stale-record", requiresFreshObservation: true, grantsAuthority: false });
    expect(assessLedgerAuthority(record(), { bindingDigest: `sha256:${"b".repeat(64)}`, observedAt: now + 2_000, authoritative: true, explicitUserRecovery: false })).toEqual({ code: "stale-record", requiresFreshObservation: true, grantsAuthority: false });
    expect(assessLedgerAuthority(record(), { bindingDigest: record().bindingDigest, observedAt: now + 2_000, authoritative: false, explicitUserRecovery: false })).toMatchObject({ code: "fresh-observation-required", grantsAuthority: false });
  });

  test("keeps a persisted indeterminate outcome blocked until fresh observation and user-owned recovery", () => {
    const indeterminate = { ...record("ledger:indeterminate"), kind: "operation-outcome" as const, operationId: "operation:acquire", providerId: "provider:omarchy", outcome: "indeterminate" as const };
    expect(assessLedgerAuthority(indeterminate, { bindingDigest: indeterminate.bindingDigest, observedAt: now + 2_000, authoritative: true, explicitUserRecovery: false })).toMatchObject({ code: "indeterminate-recovery-required", grantsAuthority: false });
    expect(assessLedgerAuthority(indeterminate, { bindingDigest: indeterminate.bindingDigest, observedAt: now + 2_000, authoritative: true, explicitUserRecovery: true })).toEqual({ code: "fresh-observation-required", requiresFreshObservation: true, grantsAuthority: false });
  });
});

describe("deterministic in-memory persistence port", () => {
  test("inserts, recognizes exact canonical duplicates, and rejects unequal duplicate keys", async () => {
    const port = makeMemoryPersistencePort();
    expect(await Effect.runPromise(port.put(record()))).toBe("inserted");
    expect(await Effect.runPromise(port.put({ ...record(), evidenceIds: ["evidence:alpha", "evidence:beta"] }))).toBe("exact-duplicate");
    const conflict = await Effect.runPromise(port.put(record("ledger:plan", "policy:changed")).pipe(Effect.catchTag("PersistenceFailure", Effect.succeed)));
    expect(conflict).toMatchObject({ code: "conflicting-duplicate" });
    const saved = await Effect.runPromise(port.get("ledger:plan"));
    expect(Option.getOrUndefined(saved)).toMatchObject({ policyId: "policy:alpha", evidenceIds: ["evidence:alpha", "evidence:beta"] });
  });

  test("erases explicit and expired records and hashes canonical bytes deterministically", async () => {
    const port = makeMemoryPersistencePort();
    await Effect.runPromise(port.put(record("ledger:explicit")));
    await Effect.runPromise(port.put(record("ledger:expired")));
    expect(canonicalLedgerRecord(record("ledger:explicit"))).toContain("evidence:alpha");
    expect(await ledgerRecordDigest(record("ledger:explicit"))).toBe(await ledgerRecordDigest({ ...record("ledger:explicit"), evidenceIds: ["evidence:alpha", "evidence:beta"] }));
    await Effect.runPromise(port.erase("ledger:explicit"));
    expect(Option.isNone(await Effect.runPromise(port.get("ledger:explicit")))).toBe(true);
    expect(await Effect.runPromise(port.eraseExpired(now + 1_001))).toBe(1);
    expect(Option.isNone(await Effect.runPromise(port.get("ledger:expired")))).toBe(true);
  });

  test("rejects unsafe input before storage instead of retaining a substitute", async () => {
    const port = makeMemoryPersistencePort();
    const rejected = await Effect.runPromise(port.put({ ...record("ledger:rejected"), path: "/private" } as unknown as ReturnType<typeof record>).pipe(Effect.catchTag("PersistenceFailure", Effect.succeed)));
    expect(rejected).toMatchObject({ code: "forbidden-field" });
    expect(Option.isNone(await Effect.runPromise(port.get("ledger:rejected")))).toBe(true);
  });
});
