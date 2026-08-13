import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { PlanDigestService } from "../../src/domain/plans.js";
import type { PlatformFacts } from "../../src/application/ports/workstation.js";
import { ProgramId } from "../../src/domain/states.js";
import {
  AssessWorkstation,
  BackupStatusPort,
  EvidenceStatusPort,
  PackageMappingPort,
  PlanPackageAcquisition,
  PlatformFactsPort,
  ProviderDiscoveryPort,
} from "../../src/application/services/workstation.js";

const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
const platform = { platform: "macos" as const, generation: "unknown" as const, observationDigest: "platform:macos", evidence: [] } satisfies PlatformFacts;
const evidence = { programId, packageState: "missing" as const, configurationState: "unverifiable" as const, dotfileStowState: "unverifiable" as const, evidence: [] };
const ports = Layer.mergeAll(
  Layer.succeed(PlatformFactsPort, { facts: Effect.succeed(platform) }),
  Layer.succeed(EvidenceStatusPort, { forProgram: () => Effect.succeed(evidence) }),
  Layer.succeed(BackupStatusPort, { visibility: Effect.succeed([]) }),
  Layer.succeed(ProviderDiscoveryPort, { discover: (provider) => Effect.succeed({ provider, availability: "present", observedVersion: "1", capabilities: [{ kind: "homebrew-formula", commandPolicyId: "fixture-only" }], evidence: [] }) }),
  Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: false }) }),
);
const planLayer = Layer.merge(PlanPackageAcquisition.layer, PlanDigestService.layer);
const linuxPorts = Layer.mergeAll(
  ports,
  Layer.succeed(PlatformFactsPort, { facts: Effect.succeed({ ...platform, platform: "linux" as const, generation: "omarchy-4" as const, omarchyIdentity: { availability: "eligible" as const, version: "4.0.0", revision: "1", generation: "omarchy-4" as const }, observationDigest: "platform:linux" }) }),
  Layer.succeed(ProviderDiscoveryPort, { discover: (provider) => Effect.succeed({ provider, availability: provider === "omarchy" ? "missing" : "present", observedVersion: "1", capabilities: [{ kind: "homebrew-formula", commandPolicyId: "fixture-only" }], evidence: [] }) }),
  Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: true }) }),
);

describe("read-only workstation application services", () => {
  it.effect("retains a not-ready program assessment without mutating anything", () => Effect.gen(function*() {
    const assessor = yield* AssessWorkstation;
    const result = yield* assessor.assess([programId]);
    expect(result.programs[0]).toMatchObject({ programId, packageState: "missing", configurationState: "unverifiable", dotfileStowState: "unverifiable", ready: false });
  }).pipe(Effect.provide(Layer.provide(AssessWorkstation.layer, ports))));

  it.effect("plans macOS Homebrew as primary and fails closed for unsafe mappings", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const planned = yield* planner.plan({ programId, fallbackOptIn: false, binding: binding("homebrew", "primary") });
    expect(planned.plan?.plan.binding.providerRole).toBe("primary");
  }).pipe(Effect.provide(Layer.provide(planLayer, ports))));

  it.effect("refuses unsafe mappings", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const refused = yield* planner.plan({ programId, fallbackOptIn: false, binding: binding("homebrew", "primary") });
    expect(refused.plan).toBeUndefined();
    expect(refused.blockers[0]?.code).toBe("package-mapping-unsafe");
  }).pipe(Effect.provide(Layer.provide(planLayer, Layer.mergeAll(ports, Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:bad", packageName: "bad", safe: false, alreadyPresent: false }) }))))));

    it.effect("refuses macOS planning when its primary Homebrew provider is missing", () => Effect.gen(function*() {
      const planner = yield* PlanPackageAcquisition;
      const result = yield* planner.plan({ programId, fallbackOptIn: false, binding: binding("homebrew", "primary") });
      expect(result.plan).toBeUndefined();
      expect(result.blockers[0]?.code).toBe("provider-missing");
    }).pipe(Effect.provide(Layer.provide(planLayer, Layer.mergeAll(
      ports,
      Layer.succeed(ProviderDiscoveryPort, { discover: (provider) => Effect.succeed({ provider, availability: "missing" as const, observedVersion: "unknown" as const, capabilities: [], evidence: [] }) }),
    )))));

  it.effect("allows Linux fallback only with opt-in and already-present safe mapping evidence", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const noOptIn = yield* planner.plan({ programId, fallbackOptIn: false, binding: binding("omarchy", "primary") });
    const optedIn = yield* planner.plan({ programId, fallbackOptIn: true, binding: binding("omarchy", "primary") });
    expect(noOptIn.blockers[0]?.code).toBe("fallback-not-opted-in");
    expect(optedIn.plan?.plan.binding.providerRole).toBe("fallback");
  }).pipe(Effect.provide(Layer.provide(planLayer, linuxPorts))));

  it.effect("refuses Linux fallback without already-present mapping evidence", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const result = yield* planner.plan({ programId, fallbackOptIn: true, binding: binding("omarchy", "primary") });
    expect(result.plan).toBeUndefined();
    expect(result.blockers[0]?.code).toBe("package-mapping-missing");
  }).pipe(Effect.provide(Layer.provide(planLayer, Layer.mergeAll(
    linuxPorts,
    Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: false }) }),
  )))));

  it.effect("refuses unsafe Linux fallback mappings", () => Effect.gen(function*() {
    const planner = yield* PlanPackageAcquisition;
    const result = yield* planner.plan({ programId, fallbackOptIn: true, binding: binding("omarchy", "primary") });
    expect(result.plan).toBeUndefined();
    expect(result.blockers[0]?.code).toBe("package-mapping-unsafe");
  }).pipe(Effect.provide(Layer.provide(planLayer, Layer.mergeAll(
    linuxPorts,
    Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:bad", packageName: "bad", safe: false, alreadyPresent: true }) }),
  )))));
});

function binding(provider: "omarchy" | "homebrew", providerRole: "primary" | "fallback") {
  return { operation: "package-acquisition" as const, logicalRequestIds: ["program:neovim"], platformObservationDigest: "platform", profilePolicyDigest: "profile", provider, providerRole, providerPolicy: { id: "fixture", version: "1" }, capabilityId: "homebrew-formula", mappingIds: ["mapping"], packageStateDigests: ["missing"], verificationPolicyId: "read-only", riskCodes: [], fallbackOptIn: false };
}
