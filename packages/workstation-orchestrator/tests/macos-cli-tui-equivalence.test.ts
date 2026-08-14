import { describe, expect, test } from "vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { AgentRequest } from "../src/application/contracts/agent-request.js";
import {
  BackupStatusPort,
  EvidenceStatusPort,
  PackageMappingPort,
  PlatformFactsPort,
  ProfileInventoryPort,
  ProviderDiscoveryPort,
  SourceEvidencePort,
} from "../src/application/ports/workstation.js";
import { makeReadOnlyLayer } from "../src/composition/read-only.js";
import { createReadOnlyRuntime, presentationAdapter } from "../src/composition/runtime.js";
import { runWorkstation } from "../src/presentation/cli/main.js";
import { createPresentationSession } from "../src/presentation/atoms/request-session.js";
import { createTuiPresentation } from "../src/presentation/tui/view-models/presentation.js";
import { macosCliTuiRefusalFixtures } from "./fixtures/macos-cli-tui-refusal-fixtures.js";

const request = Schema.decodeUnknownSync(AgentRequest)({
  version: "AgentRequestV1",
  requestId: "request:macos-equivalence",
  operation: "assess_workstation",
  input: { programIds: [] },
  timeoutSeconds: 30,
});

describe("macOS CLI, Atom, and TUI refusal equivalence", () => {
  test("submits a macOS refusal through the public JSON CLI and application composition", async () => {
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, {
        facts: Effect.succeed({
          platform: "macos" as const,
          generation: "unknown" as const,
          architecture: "aarch64" as const,
          observationDigest: "observation:macos-red",
          omarchyAvailability: "unavailable" as const,
          omarchyUnavailableReason: "not-applicable",
          evidence: [macosCliTuiRefusalFixtures.nativeCapabilityUnavailable.evidence],
        }),
      }),
      Layer.succeed(EvidenceStatusPort, { forProgram: () => Effect.die("not-reached") }),
      Layer.succeed(BackupStatusPort, { visibility: Effect.succeed([]) }),
      Layer.succeed(ProfileInventoryPort, { inventory: Effect.succeed({ sourceContract: "workstation-source-v1" as const, sourceVersion: "1" as const, sourceFingerprint: "fingerprint:macos-red", evidenceStrength: "structural" as const, profiles: [], expectations: [] }) }),
      Layer.succeed(SourceEvidencePort, { observations: Effect.succeed([]) }),
      Layer.succeed(ProviderDiscoveryPort, { discover: () => Effect.die("not-reached") }),
      Layer.succeed(PackageMappingPort, { map: () => Effect.die("not-reached") }),
    );
    const writes: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
    try {
      await runWorkstation(
        ["agent"],
        async () => new TextEncoder().encode(JSON.stringify(request)),
        undefined,
        () => createReadOnlyRuntime(makeReadOnlyLayer(ports)),
      );
    } finally {
      write.mockRestore();
    }

    const cli = JSON.parse(writes.join(""));
    expect(cli.operation).toBe("assess_workstation");
    expect(cli.status).toBe("refused");
    expect(cli.payload.kind).toBe("assessment");
    expect(cli.payload.platform).toBe("macos");
    expect(cli.evidence).toContainEqual({
      evidenceId: "evidence:macos:structural",
      strength: "structural",
      summaryCode: "macos-native-capability-unverified",
    });
    const atomRuntime = createReadOnlyRuntime(makeReadOnlyLayer(ports));
    const session = createPresentationSession(presentationAdapter(atomRuntime));
    await session.run(request);
    const atom = session.state().result;
    if (atom?.version !== "PublicResultV2") throw new Error("expected a V2 public result");
    const tui = createTuiPresentation(atom, 120);

    expect(atom).toEqual(cli);
    expect(tui.result).toBe(atom);
    await atomRuntime.dispose();
  });

  test("preserves a distinct macOS primary-provider refusal with sanitized evidence", async () => {
    const providerCalls: string[] = [];
    let mappingCalls = 0;
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, {
        facts: Effect.succeed({
          platform: "macos" as const,
          generation: "unknown" as const,
          architecture: "aarch64" as const,
          observationDigest: "observation:macos-provider-red",
          omarchyAvailability: "unavailable" as const,
          omarchyUnavailableReason: "not-applicable",
          evidence: [macosCliTuiRefusalFixtures.primaryProviderUnavailable.platformEvidence],
        }),
      }),
      Layer.succeed(EvidenceStatusPort, { forProgram: () => Effect.die("not-reached") }),
      Layer.succeed(BackupStatusPort, { visibility: Effect.succeed([]) }),
      Layer.succeed(ProfileInventoryPort, { inventory: Effect.succeed({ sourceContract: "workstation-source-v1" as const, sourceVersion: "1" as const, sourceFingerprint: "fingerprint:macos-provider-red", evidenceStrength: "structural" as const, profiles: [], expectations: [] }) }),
      Layer.succeed(SourceEvidencePort, { observations: Effect.succeed([]) }),
      Layer.succeed(ProviderDiscoveryPort, {
        discover: (provider) => {
          providerCalls.push(provider);
          return Effect.succeed({
            provider,
            availability: "missing" as const,
            observedVersion: "unknown" as const,
            capabilities: [],
            evidence: [{
              ...macosCliTuiRefusalFixtures.primaryProviderUnavailable.providerEvidence,
            }],
          });
        },
      }),
      Layer.succeed(PackageMappingPort, {
        map: () => {
          mappingCalls += 1;
          return Effect.die("must-not-map-after-primary-provider-refusal");
        },
      }),
    );
    const providerRequest = Schema.decodeUnknownSync(AgentRequest)({
      version: "AgentRequestV1",
      requestId: macosCliTuiRefusalFixtures.primaryProviderUnavailable.requestId,
      operation: "plan_package_install",
      input: { programId: "program:neovim", fallbackOptIn: false },
      timeoutSeconds: 30,
    });
    const writes: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
    try {
      await runWorkstation(
        ["agent"],
        async () => new TextEncoder().encode(JSON.stringify(providerRequest)),
        undefined,
        () => createReadOnlyRuntime(makeReadOnlyLayer(ports)),
      );
    } finally {
      write.mockRestore();
    }

    const cli = JSON.parse(writes.join(""));
    expect(cli).toMatchObject({
      operation: "plan_package_install",
      status: "refused",
      payload: { kind: "unavailable", operation: "plan_package_install", reason: "source-unavailable" },
      nextActions: ["provider-missing"],
    });
    expect(cli.evidence).toContainEqual({
      evidenceId: "evidence:macos:homebrew",
      strength: "structural",
      summaryCode: "macos-primary-provider-unverified",
    });
    const atomRuntime = createReadOnlyRuntime(makeReadOnlyLayer(ports));
    const session = createPresentationSession(presentationAdapter(atomRuntime));
    await session.run(providerRequest);
    const atom = session.state().result;
    if (atom?.version !== "PublicResultV2") throw new Error("expected a V2 public result");
    const tui = createTuiPresentation(atom, 120);

    expect(atom).toEqual(cli);
    expect(tui.result).toBe(atom);
    expect(providerCalls).toEqual(["homebrew", "homebrew"]);
    expect(mappingCalls).toBe(0);
    expect(JSON.stringify(cli)).not.toContain("example-user");
    expect(JSON.stringify(cli)).not.toContain("example-redacted");
    expect(JSON.stringify(atom)).not.toContain("example-user");
    expect(JSON.stringify(tui)).not.toContain("example-redacted");
    await atomRuntime.dispose();
  });
});
