import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as TypeScript from "typescript";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PersistencePort } from "../../src/application/ports/persistence-port.js";
import { confirmationDigest, createConfirmationToken, decodeLedgerRecord, type LedgerRecord } from "../../src/application/contracts/persistence.js";

const now = 1_700_000_000_000;
const sha = (character: string) => `sha256:${character.repeat(64)}`;
const planRecord = {
  schemaVersion: "v1", kind: "plan-binding", recordId: "ledger:plan", planId: "plan:alpha", bindingDigest: sha("a"), policyId: "policy:alpha", policyVersion: "v1", evidenceIds: ["evidence:beta", "evidence:alpha"], observedAt: now, expiresAt: now + 1_000,
} as const satisfies LedgerRecord;

describe("PersistencePort", () => {
  test("is a metadata-only Effect service with the four ledger operations", async () => {
    const service = {
      put: () => Effect.succeed("inserted" as const),
      get: () => Effect.succeed(Option.none()),
      erase: () => Effect.void,
      eraseExpired: () => Effect.succeed(0),
    };
    const operations = await Effect.runPromise(Effect.gen(function* () {
      const port = yield* PersistencePort;
      return Object.keys(port).sort();
    }).pipe(Effect.provide(Layer.succeed(PersistencePort, service))));

    expect(operations).toEqual(["erase", "eraseExpired", "get", "put"]);
  });

  test("does not import infrastructure, provider, presentation, executable, or argv concerns", async () => {
    const source = await readFile(new URL("../../src/application/ports/persistence-port.ts", import.meta.url), "utf8");
    const file = TypeScript.createSourceFile("persistence-port.ts", source, TypeScript.ScriptTarget.ES2022, true);
    const imports = file.statements.flatMap((statement) => TypeScript.isImportDeclaration(statement) && TypeScript.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : []);
    expect(imports).toEqual([
      "effect/Context", "effect/Effect", "effect/Layer", "effect/Option", "../contracts/persistence.js", "../contracts/persistence.js",
    ]);
  });

  test("compiles metadata-only use and rejects forbidden dependency-shaped service inputs", () => {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
    const compile = (fixture: string) => spawnSync(tsc, ["--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--skipLibCheck", "--types", "bun-types", fixture], { cwd: packageRoot, encoding: "utf8" });
    const allowed = compile("tests/persistence/compile-fixtures/metadata-only.cts");
    const forbidden = compile("tests/persistence/compile-fixtures/forbidden-inputs.cts");

    expect(allowed.status).toBe(0);
    expect(forbidden.status).not.toBe(0);
    expect(`${forbidden.stdout}${forbidden.stderr}`).toMatch(/not assignable|incompatible/i);
  });
});

describe("ledger record codec", () => {
  test("round-trips the 128-character policyVersion boundary and rejects longer or non-ASCII versions", () => {
    const boundary = `v${"9".repeat(127)}`;
    expect(decodeLedgerRecord({ ...planRecord, policyVersion: boundary })).toMatchObject({ _tag: "Success", success: { policyVersion: boundary } });
    expect(decodeLedgerRecord({ ...planRecord, policyVersion: `${boundary}9` })).toMatchObject({ _tag: "Failure", failure: { code: "payload-too-large" } });
    expect(decodeLedgerRecord({ ...planRecord, policyVersion: "v1é" })).toMatchObject({ _tag: "Failure" });
  });

  test("round-trips every closed metadata variant and canonicalizes set-like evidence", async () => {
    const token = createConfirmationToken();
    const records: readonly LedgerRecord[] = [
      planRecord,
      { schemaVersion: "v1", kind: "confirmation-digest", recordId: "ledger:confirmation", planId: "plan:alpha", confirmationDigest: await confirmationDigest(token), observedAt: now, expiresAt: now + 1_000 },
      { schemaVersion: "v1", kind: "operation-outcome", recordId: "ledger:outcome", planId: "plan:alpha", bindingDigest: sha("b"), operationId: "operation:acquire", providerId: "provider:omarchy", policyId: "policy:alpha", policyVersion: "v1", evidenceIds: ["evidence:beta", "evidence:alpha"], outcome: "indeterminate", observedAt: now, expiresAt: now + 1_000 },
    ];

    expect(token).toHaveLength(32);
    await expect(confirmationDigest(new Uint8Array(31))).rejects.toThrow("32 bytes");
    expect(await confirmationDigest(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    for (const record of records) {
      const decoded = decodeLedgerRecord(record);
      expect(decoded).toMatchObject({ _tag: "Success", success: { kind: record.kind, recordId: record.recordId, planId: record.planId } });
      if (decoded._tag === "Success" && "evidenceIds" in decoded.success) expect(decoded.success.evidenceIds).toEqual(["evidence:alpha", "evidence:beta"]);
    }
  });

  test("rejects unsafe, malformed, and unbounded values rather than replacing them", () => {
    const invalidRecords = [
      { recordId: "" }, { recordId: "é" }, { recordId: "x".repeat(129) }, { bindingDigest: "sha256:UPPER" },
      { expiresAt: now + 30 * 24 * 60 * 60 * 1_000 + 1 }, { evidenceIds: Array.from({ length: 65 }, (_, index) => `evidence:${index}`) },
      { confirmationToken: "plaintext" }, { path: "/private" }, { stdout: "raw" }, { stderr: "raw" }, { diagnostics: "raw" }, { host: "host" }, { user: "user" }, { executable: "tool" }, { argv: ["tool"] }, { atomRecord: true }, { extra: "x".repeat(257) },
      { planId: "host:workstation" }, { policyId: "user:alice" }, { evidenceIds: ["path:private"] },
    ];

    for (const invalid of invalidRecords) expect(decodeLedgerRecord({ ...planRecord, ...invalid })).toMatchObject({ _tag: "Failure" });
  });
});
