import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { AgentRequest as AgentRequestSchema, type AgentRequest } from "../../../src/application/contracts/agent-request.js";
import type { PublicResult } from "../../../src/application/contracts/public-result.js";
import {
  BackupStatusPort,
  EvidenceStatusPort,
  PackageMappingPort,
  PlatformFactsPort,
  ProviderDiscoveryPort,
} from "../../../src/application/ports/workstation.js";
import { AssessWorkstation } from "../../../src/application/services/workstation.js";
import { makeReadOnlyLayer, readOnlyLayer, ReadOnlyRequestService } from "../../../src/composition/read-only.js";
import { createReadOnlyRuntime, presentationAdapter } from "../../../src/composition/runtime.js";
import { createPresentationSession, type PresentationAdapter } from "../../../src/presentation/atoms/request-session.js";
import { WorkstationRegistryProvider } from "../../../src/presentation/hooks/use-workstation-projection.js";
import { projectRequestState } from "../../../src/presentation/view-models/request-state.js";
import { ProgramId } from "../../../src/domain/states.js";

const request = Schema.decodeUnknownSync(AgentRequestSchema)({
  version: "AgentRequestV1",
  requestId: "request:atom-test",
  operation: "assess_workstation",
  input: { programIds: ["program:neovim"] },
  timeoutSeconds: 30,
});

const completed = (correlationId = request.requestId): PublicResult => ({
  version: "PublicResultV1",
  status: "completed",
  correlationId,
  blockers: [],
  evidence: ["assessment-ready"],
  nextActions: ["inspect-results"],
});

const refused = (): PublicResult => ({
  ...completed(),
  status: "refused",
  blockers: [{ code: "operation-refused" }],
});

const deferred = <A>() => {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe("Effect Atom service projection", () => {
  test("projects idle, loading, completed, and refused service results without deriving policy", async () => {
    const calls: AgentRequest[] = [];
    const adapter: PresentationAdapter = {
      invoke: async (value) => {
        calls.push(value);
        return calls.length === 1 ? completed() : refused();
      },
    };
    const session = createPresentationSession(adapter);

    expect(projectRequestState(session.state())).toEqual({ lifecycle: "idle", refreshIdentity: 0 });

    await session.run(request);
    expect(projectRequestState(session.state())).toEqual({
      lifecycle: "completed",
      refreshIdentity: 1,
      result: completed(),
    });

    await session.refresh();
    expect(projectRequestState(session.state())).toEqual({
      lifecycle: "refused",
      refreshIdentity: 2,
      result: refused(),
    });
    expect(calls).toEqual([request, request]);
  });

  test("keeps the newest refresh result when an earlier service invocation settles late", async () => {
    const first = deferred<PublicResult>();
    const second = deferred<PublicResult>();
    let invocation = 0;
    const session = createPresentationSession({
      invoke: () => (++invocation === 1 ? first.promise : second.promise),
    });

    const initial = session.run(request);
    expect(projectRequestState(session.state())).toMatchObject({ lifecycle: "loading", refreshIdentity: 1 });

    const refresh = session.refresh();
    second.resolve(refused());
    await refresh;
    first.resolve(completed("request:stale"));
    await initial;

    expect(projectRequestState(session.state())).toEqual({
      lifecycle: "refused",
      refreshIdentity: 2,
      result: refused(),
    });
  });

  test("cancels an in-flight invocation and sanitizes unknown failures", async () => {
    const running = deferred<PublicResult>();
    let aborted = false;
    const session = createPresentationSession({
      invoke: (_request, signal) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return running.promise;
      },
    });

    const pending = session.run(request);
    session.cancel();
    running.resolve(completed("request:cancelled"));
    await pending;

    expect(aborted).toBe(true);
    expect(projectRequestState(session.state())).toEqual({ lifecycle: "idle", refreshIdentity: 2 });

    const failed = createPresentationSession({
      invoke: async () => Promise.reject(new Error("/private/path stack cause")),
    });
    await failed.run(request);
    expect(projectRequestState(failed.state())).toEqual({
      lifecycle: "failed",
      refreshIdentity: 1,
      failure: { code: "operation-failed", diagnosticId: "diagnostic:runtime" },
    });
  });

  test("preserves the last authoritative result when a refresh is cancelled", async () => {
    const replacement = deferred<PublicResult>();
    let calls = 0;
    const session = createPresentationSession({
      invoke: () => (++calls === 1 ? Promise.resolve(completed()) : replacement.promise),
    });

    await session.run(request);
    const pending = session.refresh();
    session.cancel();
    replacement.resolve(refused());
    await pending;

    expect(projectRequestState(session.state())).toEqual({
      lifecycle: "idle",
      refreshIdentity: 3,
      result: completed(),
    });
  });

  test("keeps selection, navigation, and filters as local presentation state", () => {
    const session = createPresentationSession({ invoke: async () => completed() });

    session.select("program:neovim");
    session.navigate("programs");
    session.filter("neovim");

    expect(session.interaction()).toEqual({
      selectedId: "program:neovim",
      navigation: "programs",
      filter: "neovim",
    });
  });

  test("invokes a deterministic typed read-only service through its ManagedRuntime adapter", async () => {
    const dispatched: AgentRequest[] = [];
    const runtime = createReadOnlyRuntime(Layer.succeed(ReadOnlyRequestService, {
      dispatch: (value) => {
        dispatched.push(value);
        return Effect.succeed(completed());
      },
    }));
    const session = createPresentationSession(presentationAdapter(runtime));

    await session.run(request);

    expect(dispatched).toEqual([request]);
    expect(projectRequestState(session.state())).toMatchObject({ lifecycle: "completed", result: completed() });
    await runtime.dispose();
  });

  test("composes the production read-only layer without an executor or mutation capability", async () => {
    const runtime = createReadOnlyRuntime(readOnlyLayer);
    const session = createPresentationSession(presentationAdapter(runtime));

    await session.run(request);

    expect(projectRequestState(session.state())).toMatchObject({
      lifecycle: "refused",
      result: { status: "unsupported", blockers: [{ code: "operation-unsupported" }] },
    });
    await runtime.dispose();
  });

  test("composes read-only application services from deterministic port fakes", async () => {
    const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, {
        facts: Effect.succeed({ platform: "macos" as const, generation: "unknown" as const, observationDigest: "platform:fixture", evidence: [] }),
      }),
      Layer.succeed(EvidenceStatusPort, {
        forProgram: () => Effect.succeed({ programId, packageState: "present" as const, configurationState: "ready" as const, dotfileStowState: "stow-ready" as const, evidence: [] }),
      }),
      Layer.succeed(BackupStatusPort, { visibility: Effect.succeed([]) }),
      Layer.succeed(ProviderDiscoveryPort, {
        discover: (provider) => Effect.succeed({ provider, availability: "missing" as const, observedVersion: "unknown" as const, capabilities: [], evidence: [] }),
      }),
      Layer.succeed(PackageMappingPort, {
        map: () => Effect.succeed({ mappingId: "mapping:fixture", packageName: "fixture", safe: true, alreadyPresent: false }),
      }),
    );
    const runtime = createReadOnlyRuntime(makeReadOnlyLayer(ports));

    const assessment = await runtime.runPromise(Effect.gen(function*() {
      const service = yield* AssessWorkstation;
      return yield* service.assess([programId]);
    }));

    expect(assessment.programs).toHaveLength(1);
    expect(assessment.programs[0]?.programId).toBe(programId);
    await runtime.dispose();
  });

  test("exposes the verified Solid RegistryProvider and keeps presentation modules capability-free", () => {
    const presentationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/presentation");
    const sources = [
      "atoms/request-session.ts",
      "hooks/use-workstation-projection.ts",
      "view-models/request-state.ts",
    ].map((path) => readFileSync(resolve(presentationRoot, path), "utf8")).join("\n");
    const compositionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/composition");
    const composition = ["read-only.ts", "runtime.ts"].map((path) => readFileSync(resolve(compositionRoot, path), "utf8")).join("\n");

    expect(WorkstationRegistryProvider).toBeTypeOf("function");
    expect(sources).not.toMatch(/(?:infrastructure|providers|bash-contracts|bun:sqlite|node:fs|node:child_process|process\.env)/);
    expect(sources).not.toMatch(/(?:omarchy|homebrew|stow|restore|subprocess)/i);
    expect(composition).not.toMatch(/(?:Executor|execute_confirmed_plan|bun:sqlite|node:fs|node:child_process|process\.env|stow|restore)/i);
  });
});
