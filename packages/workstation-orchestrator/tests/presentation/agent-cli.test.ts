import { describe, expect, test } from "vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AgentRequest } from "../../src/application/contracts/agent-request.js";
import { operationNames, unavailableOperationHandlers, unsupportedResult } from "../../src/application/contracts/operation-registry.js";
import { decodePublicResult, projectPublicResultV2, type PublicResultV2 } from "../../src/application/contracts/public-result.js";
import { decodeAgentRequest } from "../../src/presentation/cli/agent-request-decoder.js";
import { exitCodeFor, exitCodes } from "../../src/presentation/cli/exit-codes.js";
import { encodePublicResult, maxResponseBytes } from "../../src/presentation/cli/public-result-encoder.js";
import { AgentRequestDispatcher, dispatchAgentRequest, runAgentRequest } from "../../src/presentation/cli/operation-dispatcher.js";
import { classifyRoute, cliCommand } from "../../src/presentation/cli/effect-cli-adapter.js";

describe("deterministic agent CLI contract", () => {
  const request = Schema.decodeUnknownSync(AgentRequest)({ version: "AgentRequestV1", requestId: "request:abc", operation: "assess_workstation", input: { programIds: ["program:neovim"] }, timeoutSeconds: 30 });

  test("has a versioned closed request schema", () => {
    expect(Schema.decodeUnknownSync(AgentRequest)(request)).toMatchObject(request);
    expect(Schema.decodeUnknownSync(AgentRequest)({ ...request, timeoutSeconds: undefined })).toMatchObject({ ...request, timeoutSeconds: 30 });
    expect(() => Schema.decodeUnknownSync(AgentRequest)({ ...request, operation: "execute_confirmed_plan" })).toThrow();
    expect(() => Schema.decodeUnknownSync(AgentRequest)({ ...request, operation: "unknown" })).toThrow();
    expect(() => Schema.decodeUnknownSync(AgentRequest)({ ...request, requestId: "x".repeat(129) })).toThrow();
  });

  test("decodes one bounded safe JSON object only", () => {
    expect(Result.isSuccess(decodeAgentRequest(new TextEncoder().encode(JSON.stringify(request))))).toBe(true);
    for (const source of ["", "{", "{}{}", "{} trailing", "\u00ff", "null"]) expect(Result.isFailure(decodeAgentRequest(new TextEncoder().encode(source)))).toBe(true);
    expect(Result.isFailure(decodeAgentRequest(new Uint8Array([0xc3, 0x28])))).toBe(true);
    const pathPayload = new TextEncoder().encode(JSON.stringify({ ...request, input: { programIds: [], path: "/tmp/x" } }));
    expect(Result.isFailure(decodeAgentRequest(pathPayload))).toBe(true);
    expect(Result.isFailure(decodeAgentRequest(new Uint8Array(256 * 1024 + 1)))).toBe(true);
  });

  test("has six registry slots with no fallthrough", () => {
    expect(operationNames).toEqual(["assess_workstation", "list_profiles", "plan_package_install", "show_evidence", "show_backup", "restore_guidance"]);
    for (const operation of operationNames) {
      expect(unsupportedResult(operation, "request:abc").status).toBe("unsupported");
      expect(Effect.runSync(unavailableOperationHandlers[operation](request))).toMatchObject({ status: "unsupported" });
    }
  });

  test("encodes deterministic private responses and exact exits", () => {
    expect(exitCodes).toEqual({ completed: 0, refused: 2, unsupported: 3, ambiguous: 4, stale: 5, "invalid-request": 64, failed: 70, "timed-out": 124, cancelled: 130 });
    const response = unsupportedResult("show_evidence", "request:abc");
    const bytes = encodePublicResult(response);
    expect(new TextDecoder().decode(bytes)).toBe('{"blockers":[{"code":"operation-unsupported"}],"correlationId":"request:abc","evidence":[],"nextActions":[],"status":"unsupported","version":"PublicResultV1"}\n');
    expect(exitCodeFor("completed")).toBe(0);
    expect(exitCodeFor("invalid-request")).toBe(64);
    expect(exitCodeFor("timed-out")).toBe(124);
    expect(new TextDecoder().decode(bytes)).not.toContain("stack");
    const overflow = encodePublicResult({ ...response, evidence: ["x".repeat(maxResponseBytes)] });
    expect(overflow.length).toBeLessThan(maxResponseBytes);
    expect(new TextDecoder().decode(overflow)).toContain('"status":"failed"');
  });

      test("provides dispatcher orchestration through its service layer", () => {
        const result = Effect.runSync(dispatchAgentRequest(request).pipe(Effect.provide(AgentRequestDispatcher.layer)));
        expect(result).toMatchObject({ status: "unsupported" });
      });

      test("sanitizes timeout, cancellation, and defects", async () => {
    await expect(Effect.runPromise(runAgentRequest({ ...request, timeoutSeconds: 1 }, Effect.never))).resolves.toMatchObject({ status: "timed-out", evidence: [] });
    expect(Effect.runSync(runAgentRequest(request, Effect.interrupt))).toMatchObject({ status: "cancelled", evidence: [] });
    expect(Effect.runSync(runAgentRequest(request, Effect.die("/private/path stack argv")))).toMatchObject({ status: "failed", evidence: [] });
  });

  test("uses the unstable CLI adapter only for routes and help", () => {
    expect(cliCommand.name).toBe("workstation");
    expect(classifyRoute(["agent"])).toEqual({ kind: "agent" });
    expect(classifyRoute(["tui"])).toEqual({ kind: "tui" });
    expect(classifyRoute(["--help"])).toEqual({ kind: "help" });
    expect(classifyRoute(["agent", "extra"])).toEqual({ kind: "invalid" });
  });

  test("keeps V1 bytes frozen while decoding an explicit rich V2 result", () => {
    const v1 = unsupportedResult("show_evidence", "request:abc");
    expect(new TextDecoder().decode(encodePublicResult(v1))).toBe('{"blockers":[{"code":"operation-unsupported"}],"correlationId":"request:abc","evidence":[],"nextActions":[],"status":"unsupported","version":"PublicResultV1"}\n');
    expect(decodePublicResult(v1)).toMatchObject({ version: "PublicResultV1", evidence: [] });

    const v2: PublicResultV2 = {
      version: "PublicResultV2", operation: "plan_package_install", status: "completed", correlationId: "request:abc",
      payload: { kind: "plan", provider: "homebrew", providerRole: "primary", policyId: "policy:macos", planId: "plan:opaque", bindingDigest: "digest:opaque", confirmationRequired: true, acquisitionDoesNotVerifyConfiguration: true, acquisitionDoesNotVerifyDotfileStow: true },
      blockers: [], evidence: [], nextActions: [],
    };
    expect(decodePublicResult(v2)).toEqual(v2);
    expect(projectPublicResultV2(v2)).toEqual(v2);
  });

  test("projects every operation and outcome without normalizing rich semantics", () => {
    const statuses = ["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "timed-out", "cancelled", "failed"] as const;
    for (const operation of operationNames) for (const status of statuses) {
      const result = projectPublicResultV2({
        version: "PublicResultV2", operation, status, correlationId: "request:matrix",
        payload: { kind: "unavailable", operation, reason: "service-not-implemented" },
        blockers: [{ code: status === "completed" ? "operation-refused" : `operation-${status === "unsupported" ? "unsupported" : status === "invalid-request" ? "failed" : status}` }],
        evidence: [], nextActions: [],
      });
      expect(result.operation).toBe(operation);
      expect(result.status).toBe(status);
      expect(result.payload).toMatchObject({ operation });
    }
  });
});
