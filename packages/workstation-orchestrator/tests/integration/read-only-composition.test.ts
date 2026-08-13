import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { type AgentRequest } from "../../src/application/contracts/agent-request.js";
import { BashOperationalFailure, InvalidContract, Refused, type WorkstationSource } from "../../src/application/contracts/bash.js";
import { type PublicResultV2 } from "../../src/application/contracts/public-result.js";
import { BashBridge } from "../../src/application/ports/bash.js";
import {
  BackupStatusPort,
  EvidenceStatusPort,
  ObservationUnavailable,
  PackageMappingPort,
  PlatformFactsPort,
  ProfileInventoryPort,
  ProviderDiscoveryPort,
  SourceEvidencePort,
} from "../../src/application/ports/workstation.js";
import { makeReadOnlyLayer, makeSourceReadOnlyLayer, ReadOnlyRequestService } from "../../src/composition/read-only.js";
import { makeReadOnlyOperationHandlers } from "../../src/application/contracts/operation-registry.js";
import { makeReadOnlyObservationAdapters } from "../../src/infrastructure/read-only-observations/adapters.js";
import { bashBridgeLayer } from "../../src/infrastructure/subprocess/argv.js";
import { BashProcess } from "../../src/infrastructure/subprocess/process.js";
import { ProgramId } from "../../src/domain/states.js";
import { createPresentationSession } from "../../src/presentation/atoms/request-session.js";
import { encodePublicResult } from "../../src/presentation/cli/public-result-encoder.js";
import { createTuiPresentation } from "../../src/presentation/tui/view-models/presentation.js";

const sourceFingerprint = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const neovim = Schema.decodeUnknownSync(ProgramId)("program:neovim");
const missingProgram = Schema.decodeUnknownSync(ProgramId)("program:missing");
const source = (omarchy: WorkstationSource["omarchy"] = { availability: "unavailable", reason: "unknown-version" }): WorkstationSource => ({
  sourceFingerprint,
  platform: { name: "linux", architecture: "x86_64" },
  omarchy,
  profiles: [
    { id: "profile:base", bootstrapSelector: "base", dotfileSelectors: ["shared"], selected: true },
    { id: "profile:omarchy", bootstrapSelector: "omarchy", dotfileSelectors: ["arch/omarchy"], selected: false },
  ],
  expectations: [
    { profileId: "profile:base", platform: "any", selector: "shared", source: "nvim", concern: "editor", kind: "program", id: "program:neovim", probe: "nvim" },
    { profileId: "profile:omarchy", platform: "linux", selector: "arch/omarchy", source: "git", concern: "tooling", kind: "dependency", id: "dependency:git", probe: "git" },
  ],
  evidence: [
    { kind: "program", id: "program:neovim", availability: "present", version: "unavailable", configuration: "unavailable", dotfileStow: "unavailable", acquisition: "unavailable" },
    { kind: "dependency", id: "dependency:git", availability: "missing", version: "unavailable", configuration: "unavailable", dotfileStow: "unavailable", acquisition: "unavailable" },
  ],
});

const unavailable = (subject: ObservationUnavailable["subject"]) => Effect.fail(new ObservationUnavailable({ subject, reasonCode: "source-unavailable" }));
const layerFor = (value = source()) => {
  const adapters = makeReadOnlyObservationAdapters(Result.succeed(value));
  return makeReadOnlyLayer(Layer.mergeAll(
    Layer.succeed(PlatformFactsPort, adapters.platform),
    Layer.succeed(ProfileInventoryPort, adapters.profiles),
    Layer.succeed(SourceEvidencePort, adapters.sourceEvidence),
    Layer.succeed(EvidenceStatusPort, adapters.programEvidence),
    Layer.succeed(BackupStatusPort, { visibility: unavailable("evidence") }),
    Layer.succeed(ProviderDiscoveryPort, { discover: () => unavailable("provider") }),
    Layer.succeed(PackageMappingPort, { map: () => unavailable("mapping") }),
  ));
};

const request = <Name extends AgentRequest["operation"]>(operation: Name, input: Extract<AgentRequest, { operation: Name }>["input"]): AgentRequest => ({
  version: "AgentRequestV1",
  requestId: `request:${operation}`,
  operation,
  input,
  timeoutSeconds: 30,
} as AgentRequest);

const dispatch = <A>(value: AgentRequest, layer: Layer.Layer<A, never, never> = layerFor() as Layer.Layer<A, never, never>) => Effect.runPromise(Effect.gen(function*() {
  return yield* (yield* ReadOnlyRequestService).dispatch(value);
}).pipe(Effect.provide(layer as Layer.Layer<ReadOnlyRequestService, never, never>))) as Promise<PublicResultV2>;

describe("production read-only composition semantics", () => {
  test("retains platform and architecture while reporting Omarchy unavailability independently", async () => {
    const result = await dispatch(request("assess_workstation", { programIds: [neovim] }));
    expect(result.status).toBe("refused");
    expect(result.payload).toMatchObject({
        kind: "compatibility-refusal",
        reason: "unknown-version",
    });
    expect(result.evidence).toEqual([]);
  });

  test("binds profile inventory and source evidence to populated operation-specific handlers", async () => {
    const [profiles, evidence] = await Promise.all([
      dispatch(request("list_profiles", {})),
      dispatch(request("show_evidence", { programId: neovim })),
    ]);

    expect(profiles).toMatchObject({
      operation: "list_profiles",
      status: "completed",
      payload: { kind: "profiles", profiles: ["profile:base", "profile:omarchy"] },
    });
    expect(evidence).toMatchObject({
      operation: "show_evidence",
      status: "completed",
      payload: { kind: "evidence", evidenceId: "evidence:program:neovim:executable-presence", strength: "native", summaryCode: "present" },
    });
    expect([profiles, evidence].map(({ payload }) => payload.kind)).not.toContain("unavailable");
  });

  test("projects one semantic result through JSON, Atom, and TUI without recomputing policy", async () => {
    const result = await dispatch(request("assess_workstation", { programIds: [] }));
    const json = JSON.parse(new TextDecoder().decode(encodePublicResult(result))) as PublicResultV2;
    const session = createPresentationSession({ invoke: async () => result });
    await session.run(request("assess_workstation", { programIds: [] }));
    const atom = session.state().result as PublicResultV2;
    const tui = createTuiPresentation(result, 120);

    expect(json).toEqual(result);
    expect(atom).toBe(result);
    expect(tui.result).toBe(result);
    expect(tui.views.find(({ id }) => id === "platform-policy")?.items).toEqual(["unknown-version"]);
    expect(tui.views.find(({ id }) => id === "profiles")?.items).toEqual([]);
  });

  test("carries actual Bash producer output through the production bridge, composition, dispatcher, JSON, and TUI", async () => {
    for (const scenario of [
      {
        observation: "release candidate\nnot a version",
        expected: { status: "refused", payload: { kind: "compatibility-refusal", reason: "malformed-version" }, blocker: "operation-refused", platformItems: ["malformed-version"] },
      },
      {
        observation: "4.0.0-1",
        expected: { status: "completed", payload: { kind: "assessment", omarchy: { availability: "observed", version: "4.0.0", generation: "omarchy-4" } }, blocker: undefined, platformItems: ["linux", "x86_64", "policy:omarchy-4:4.0.0:1", "Omarchy 4.0.0 (omarchy-4)"] },
      },
    ] as const) {
      const stdout = execFileSync(
        "../../bin/workstation-bootstrap",
        ["observe", "--profile", "profile:base"],
        { cwd: process.cwd(), env: { ...process.env, BOOTSTRAP_TEST_OMARCHY_OBSERVATION: scenario.observation } },
      ).toString();
      const bridge = Layer.provide(bashBridgeLayer, Layer.succeed(BashProcess, {
        run: (argv) => Effect.succeed({
          exitCode: argv.join(" ") === "workstation-bootstrap observe --profile profile:base" ? 0 : 1,
          stdout,
        }),
      }));
      const result = await dispatch(request("assess_workstation", { programIds: [] }), makeSourceReadOnlyLayer(bridge));
      const json = JSON.parse(new TextDecoder().decode(encodePublicResult(result))) as PublicResultV2;
      const tui = createTuiPresentation(result, 120);

      expect(result).toMatchObject({ operation: "assess_workstation", status: scenario.expected.status, payload: scenario.expected.payload });
      if (scenario.expected.blocker === undefined) expect(result.blockers).toEqual([]);
      else expect(result.blockers).toEqual([{ code: scenario.expected.blocker }]);
      expect(json.operation).toBe(result.operation);
      expect(json.status).toBe(scenario.expected.status);
      expect(json.payload).toMatchObject(scenario.expected.payload);
      expect(tui.result).toBe(result);
      expect(tui.views.find(({ id }) => id === "platform-policy")?.items).toEqual(scenario.expected.platformItems);
    }
  });

  test("triangulates observed Omarchy without promoting executable presence to readiness", async () => {
    const result = await dispatch(request("assess_workstation", { programIds: [neovim] }), layerFor(source({ availability: "observed", version: "4.2.1", revision: "1", generation: "omarchy-4" })));

    expect(result).toMatchObject({
      status: "completed",
      payload: {
        kind: "assessment",
        platform: "linux",
        architecture: "x86_64",
        policyId: "policy:omarchy-4:4.2.1:1",
        omarchy: { availability: "observed", version: "4.2.1", generation: "omarchy-4" },
        programs: [{ packageState: "present", configurationState: "unverifiable", dotfileStowState: "unverifiable" }],
      },
    });
  });

  test("keeps missing or unavailable program evidence operation-specific and fail-closed", async () => {
    const missing = await dispatch(request("show_evidence", { programId: missingProgram }));
    const availableSource = source();
    const unavailableSource = { ...availableSource, evidence: availableSource.evidence.map((record, index) => index === 0 ? { ...record, availability: "unavailable" as const } : record) };
    const unavailableEvidence = await dispatch(request("show_evidence", { programId: neovim }), layerFor(unavailableSource));

    expect(missing).toMatchObject({ operation: "show_evidence", status: "unsupported", payload: { kind: "unavailable", operation: "show_evidence", reason: "source-unavailable" } });
    expect(unavailableEvidence).toMatchObject({ status: "completed", payload: { kind: "evidence", summaryCode: "unavailable" } });
    expect(JSON.stringify(unavailableEvidence)).not.toMatch(/version-compatible|configured|stow-ready|acquired/i);
  });

  test.each([
    new Refused({ code: "SOURCE_PROFILE_REFUSED", evidenceDigest: "fingerprint:refused" }),
    new InvalidContract({ code: "source-contradictory", evidenceDigest: "fingerprint:invalid" }),
    new InvalidContract({ code: "source-privacy", evidenceDigest: "fingerprint:private" }),
    new BashOperationalFailure({ code: "timeout", evidenceDigest: "fingerprint:timeout" }),
  ])("preserves typed source failure without leaking diagnostics: %s", async (failure) => {
    const bridge = Layer.succeed(BashBridge, {
      source: () => Effect.fail(failure),
      bootstrap: () => Effect.die("not-reachable"),
      dotfiles: () => Effect.die("not-reachable"),
    });
    const result = await dispatch(request("list_profiles", {}), makeSourceReadOnlyLayer(bridge));

    expect(result).toMatchObject({ operation: "list_profiles", status: "unsupported", payload: { kind: "unavailable", operation: "list_profiles", reason: "source-unavailable" } });
    expect(JSON.stringify(result)).not.toMatch(/SOURCE_PROFILE_REFUSED|source-contradictory|source-privacy|fingerprint|timeout|home\/|secret/i);
  });

  test("takes one immutable source snapshot per dispatch and refreshes on the next request", async () => {
    let calls = 0;
    const first = source();
    const second = source({ availability: "observed", version: "4.2.1", revision: "1", generation: "omarchy-4" });
    const bridge = Layer.succeed(BashBridge, {
      source: () => Effect.succeed(++calls === 1 ? first : second),
      bootstrap: () => Effect.die("not-reachable"),
      dotfiles: () => Effect.die("not-reachable"),
    });
    const layer = makeSourceReadOnlyLayer(bridge);

    const unavailableOmarchy = await dispatch(request("assess_workstation", { programIds: [] }), layer);
    Reflect.set(first.platform, "name", "macos");
    const observedOmarchy = await dispatch(request("assess_workstation", { programIds: [] }), layer);

    expect(calls).toBe(2);
    expect(unavailableOmarchy).toMatchObject({ payload: { kind: "compatibility-refusal", reason: "unknown-version" } });
    expect(observedOmarchy).toMatchObject({ payload: { kind: "assessment", platform: "linux", omarchy: { availability: "observed", version: "4.2.1" } } });
  });

  test("limits production composition to the exact source observer and read-only services", () => {
    const composition = readFileSync(new URL("../../src/composition/read-only.ts", import.meta.url), "utf8");
    const process = readFileSync(new URL("../../src/infrastructure/subprocess/process.ts", import.meta.url), "utf8");

    expect(composition).not.toMatch(/(?:infrastructure\/providers|composition\/mutation|PackageExecution|Executor|fetch|WebSocket|writeFile|mkdir|unlink|rename|bun:sqlite)/);
    expect(process).toContain('const sourceArgv = ["workstation-bootstrap", "observe", "--profile", "profile:base"] as const');
    expect(process.match(/Bun\.spawn/g)).toHaveLength(1);
    expect(process).not.toMatch(/Response\(|\.text\(\)/);
    expect(process).not.toMatch(/(?:fetch|WebSocket|writeFile|mkdir|unlink|rename|provider|homebrew|omarchy pkg|stow)/i);
  });

  test("applies the production dispatcher timeout to a hanging source observation", async () => {
    const bridge = Layer.succeed(BashBridge, {
      source: () => Effect.never,
      bootstrap: () => Effect.die("not-reachable"),
      dotfiles: () => Effect.die("not-reachable"),
    });
    const result = await dispatch({ ...request("list_profiles", {}), timeoutSeconds: 1 }, makeSourceReadOnlyLayer(bridge));

    expect(result).toMatchObject({ operation: "list_profiles", status: "timed-out", blockers: [{ code: "operation-timed-out" }] });
  }, 2_000);

  test("preserves production source cancellation as a public cancelled result", async () => {
    const bridge = Layer.succeed(BashBridge, {
      source: () => Effect.interrupt,
      bootstrap: () => Effect.die("not-reachable"),
      dotfiles: () => Effect.die("not-reachable"),
    });
    const result = await dispatch(request("list_profiles", {}), makeSourceReadOnlyLayer(bridge));

    expect(result).toMatchObject({ operation: "list_profiles", status: "cancelled", blockers: [{ code: "operation-cancelled" }] });
  });

  test("preserves independent facts when one of multiple requested programs has no evidence", async () => {
    const result = await dispatch(request("assess_workstation", { programIds: [neovim, missingProgram] }));

    expect(result).toMatchObject({ status: "refused", payload: { kind: "compatibility-refusal", reason: "unknown-version" } });
    expect(result.evidence).toEqual([]);
    expect(result.blockers).toContainEqual({ code: "operation-refused" });
  });

  test.each([
    [[{ policyDecision: "ambiguous" }, { policyDecision: "stale" }, { policyDecision: "refused" }], "ambiguous"],
    [[{ policyDecision: "stale" }, { policyDecision: "refused" }], "stale"],
    [[{ policyDecision: "refused" }], "refused"],
    [[], "completed"],
  ] as const)("uses explicit assessment status precedence for %j", async (blockers, status) => {
    const handlers = makeReadOnlyOperationHandlers(
      { assess: () => Effect.succeed({ compatibility: { platform: "linux" }, programs: [], evidence: [], backups: [], blockers, nextActions: [] }) },
      { plan: () => Effect.die("not-reachable") },
      { backups: () => Effect.succeed([]) },
      {
        platform: () => makeReadOnlyObservationAdapters(Result.succeed(source())).platform.facts,
        profiles: () => makeReadOnlyObservationAdapters(Result.succeed(source())).profiles.inventory,
        evidence: () => Effect.succeed([]),
      },
    );

    const result = await Effect.runPromise(handlers.assess_workstation(request("assess_workstation", { programIds: [] })));
    expect(result.status).toBe(status);
  });
});
