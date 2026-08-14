import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import * as Schema from "effect/Schema";
import * as TypeScript from "typescript";
import { AgentRequest as AgentRequestSchema } from "../../src/application/contracts/agent-request.js";
import type { PublicResult } from "../../src/application/contracts/public-result.js";
import { createPresentationSession } from "../../src/presentation/atoms/request-session.js";

const request = Schema.decodeUnknownSync(AgentRequestSchema)({
  version: "AgentRequestV1", requestId: "request:persistence-isolation", operation: "list_profiles", input: {}, timeoutSeconds: 30,
});
const result: PublicResult = {
  version: "PublicResultV1", status: "completed", correlationId: request.requestId, blockers: [], evidence: ["evidence:isolated"], nextActions: ["inspect-results"],
};

describe("persistence isolation", () => {
  test("a recreated project Atom registry invokes its adapter fresh and restores no history, confirmation, resume, recovery, or authority", async () => {
    let invocations = 0;
    const adapter = { invoke: async () => {
      invocations += 1;
      return result;
    } };
    const first = createPresentationSession(adapter);
    await first.run(request);
    expect(first.state()).toMatchObject({ lifecycle: "completed", result });
    first.dispose();

    const recreated = createPresentationSession(adapter);
    expect(recreated.state()).toEqual({ lifecycle: "idle", refreshIdentity: 0 });
    expect(JSON.stringify(recreated.state())).not.toMatch(/history|confirmation|resume|recovery|authority/i);
    await recreated.run(request);
    expect(invocations).toBe(2);
    recreated.dispose();
  });

  test("application persistence code has no Atom bridge and the actual Atom session has no port wiring", async () => {
    const [atomSession, ...sources] = await Promise.all([
      readFile(new URL("../../src/presentation/atoms/request-session.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/application/contracts/persistence.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/application/ports/persistence-port.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/application/ports/persistence-fake.ts", import.meta.url), "utf8"),
    ]);
    const imports = (source: string) => TypeScript.createSourceFile("boundary.ts", source, TypeScript.ScriptTarget.ES2022, true).statements.flatMap((statement) => TypeScript.isImportDeclaration(statement) && TypeScript.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : []);
    expect(sources.flatMap(imports)).toEqual([
      "effect/Data", "effect/Context", "effect/Effect", "effect/Layer", "effect/Option", "../contracts/persistence.js", "../contracts/persistence.js", "effect/Effect", "effect/Option", "../contracts/persistence.js", "../contracts/persistence.js",
    ]);
    expect(imports(atomSession)).not.toContain("../../application/ports/persistence-port.js");
    expect(imports(atomSession)).not.toContain("../../application/ports/persistence-fake.js");
    expect(imports(atomSession)).not.toContain("../../application/contracts/persistence.js");
  });
});
