import { describe, expect, test } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { createPlanBinding, PlanDigestService } from "../../src/domain/plans.js";
import { manualRestoreGuidance } from "../../src/domain/recovery.js";
import { captureBoundedLinuxEvidence } from "../../src/infrastructure/platform/native-evidence.js";
import { PackageMappingPort, PlatformFactsPort, ProfileInventoryPort, ProviderDiscoveryPort, SourceEvidencePort } from "../../src/application/ports/workstation.js";
import { PlanPackageAcquisition } from "../../src/application/services/workstation.js";
import { ProgramId } from "../../src/domain/states.js";
import { makeReadOnlyOperationHandlers } from "../../src/application/contracts/operation-registry.js";
import { BackupStatusPort, EvidenceStatusPort } from "../../src/application/ports/workstation.js";
import { makeReadOnlyLayer, ReadOnlyRequestService } from "../../src/composition/read-only.js";
import { decodeAgentRequest } from "../../src/presentation/cli/agent-request-decoder.js";
import * as Result from "effect/Result";
import { createTuiPresentation } from "../../src/presentation/tui/view-models/presentation.js";

const programId = Schema.decodeUnknownSync(ProgramId)("program:neovim");
const binding = (fallbackOptIn: boolean) => ({
  operation: "package-acquisition" as const, logicalRequestIds: ["program:neovim"], platformObservationDigest: "platform:linux", profilePolicyDigest: "policy:omarchy-3", provider: "omarchy" as const, providerRole: "primary" as const, providerPolicy: { id: "policy:omarchy-3", version: "1" }, capabilityId: "omarchy-pkg-add", mappingIds: ["mapping:neovim"], packageStateDigests: ["state:missing"], verificationPolicyId: "verification:read-only", riskCodes: [], fallbackOptIn,
});

describe("Task 8 read-only guidance", () => {
  test("binds an explicitly opted-in, already-present and safely mapped Homebrew fallback to a new plan", async () => {
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, { facts: Effect.succeed({ platform: "linux" as const, generation: "omarchy-4" as const, omarchyIdentity: { availability: "eligible" as const, version: "4.0.0", revision: "1", generation: "omarchy-4" as const }, observationDigest: "platform:linux", evidence: [] }) }),
      Layer.succeed(ProviderDiscoveryPort, { discover: (provider: "omarchy" | "homebrew") => Effect.succeed({ provider, availability: provider === "omarchy" ? "missing" as const : "present" as const, observedVersion: "1", capabilities: [{ kind: "homebrew-formula" as const, commandPolicyId: "policy:homebrew-linux" }], evidence: [] }) }),
      Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: true }) }),
    );
    const layer = Layer.provide(PlanPackageAcquisition.layer, Layer.merge(ports, PlanDigestService.layer));
    const plans = await Effect.runPromise(Effect.gen(function*() {
      const planner = yield* PlanPackageAcquisition;
      return yield* Effect.all([planner.plan({ programId, fallbackOptIn: false, binding: binding(false) }), planner.plan({ programId, fallbackOptIn: true, binding: binding(true) })]);
    }).pipe(Effect.provide(Layer.merge(layer, PlanDigestService.layer))));

    expect(plans[0]?.blockers[0]?.code).toBe("fallback-not-opted-in");
    expect(plans[1]?.plan?.plan.binding).toMatchObject({ provider: "homebrew", providerRole: "fallback", fallbackOptIn: true });
    expect(plans[1]?.plan?.plan.digest).not.toBe("plan:unchanged");
    const bindings = await Effect.runPromise(Effect.all([createPlanBinding(binding(false)), createPlanBinding(binding(true))]).pipe(Effect.provide(PlanDigestService.layer)));
    expect(bindings[0].digest).not.toBe(bindings[1].digest);
  });

  test("refuses an opted-in Homebrew fallback when the Linux policy is not eligible", async () => {
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, { facts: Effect.succeed({ platform: "linux" as const, generation: "unknown" as const, observationDigest: "platform:unknown", evidence: [] }) }),
      Layer.succeed(ProviderDiscoveryPort, { discover: (provider: "omarchy" | "homebrew") => Effect.succeed({ provider, availability: provider === "omarchy" ? "missing" as const : "present" as const, observedVersion: "1", capabilities: [{ kind: "homebrew-formula" as const, commandPolicyId: "policy:homebrew-linux" }], evidence: [] }) }),
      Layer.succeed(PackageMappingPort, { map: () => Effect.succeed({ mappingId: "mapping:neovim", packageName: "neovim", safe: true, alreadyPresent: true }) }),
    );
    const result = await Effect.runPromise(Effect.gen(function*() {
      return yield* (yield* PlanPackageAcquisition).plan({ programId, fallbackOptIn: true, binding: binding(true) });
    }).pipe(Effect.provide(Layer.merge(Layer.provide(PlanPackageAcquisition.layer, Layer.merge(ports, PlanDigestService.layer)), PlanDigestService.layer))));
    expect(result.plan).toBeUndefined();
    expect(result.blockers[0]?.code).toBe("compatibility-refused");
  });

  test("provides only manual verified-backup guidance and blocks ambiguous verification", () => {
    const eligible = manualRestoreGuidance({ backupId: "backup:weekly", targetId: "target:dotfiles", state: "verified", identityEvidenceIds: ["evidence:identity"], integrityEvidenceIds: ["evidence:integrity"], nextAction: { kind: "follow-manual-guidance", reasonCode: "manual-restore-only" } });
    const blocked = manualRestoreGuidance({ backupId: "backup:weekly", targetId: "target:dotfiles", state: "verification-failed", identityEvidenceIds: ["evidence:identity"], integrityEvidenceIds: [], nextAction: { kind: "reassess", reasonCode: "backup-verification-required" } });
    expect(eligible).toMatchObject({ manualOnly: true, backupId: "backup:weekly", prerequisites: expect.arrayContaining(["identity-verified", "integrity-verified"]), checks: ["reassess-after-manual-restore"] });
    expect(eligible.steps.join(" ")).not.toMatch(/restore|select.*path/i);
    expect(blocked).toMatchObject({ manualOnly: true, eligible: false, stopConditions: ["backup-verification-required"] });
  });

  test("captures bounded Linux metadata without promoting fixture evidence or mutating a provider", () => {
    const native = captureBoundedLinuxEvidence({ architecture: "x86_64", providerVersion: "3.1", policyId: "policy:omarchy-3", testedCapability: "omarchy-pkg-add", date: "2026-08-05", result: "passed", source: "native" });
    const fixture = captureBoundedLinuxEvidence({ architecture: "x86_64", providerVersion: "fixture", policyId: "policy:omarchy-3", testedCapability: "omarchy-pkg-add", date: "2026-08-05", result: "passed", source: "fixture" });
    expect(native).toMatchObject({ strength: "native", platformContext: "linux/x86_64", sourceVersion: "3.1", policyContext: "policy:omarchy-3", summaryCode: "omarchy-pkg-add-passed" });
    expect(fixture.strength).toBe("fixture");
  });

  test("binds show_backup and restore_guidance to symbolic, verification-gated read-only results", async () => {
    const handlers = makeReadOnlyOperationHandlers(
      { assess: () => Effect.die("not-used") },
      { plan: () => Effect.die("not-used") },
      { backups: () => Effect.succeed([{ backupId: "backup:weekly", targetId: "target:dotfiles", state: "verification-failed" as const, identityEvidenceIds: ["evidence:identity"], integrityEvidenceIds: [], nextAction: { kind: "reassess" as const, reasonCode: "backup-verification-required" } }]) },
      { platform: () => Effect.die("not-used"), profiles: () => Effect.die("not-used"), evidence: () => Effect.die("not-used") },
    );
    const request = { version: "AgentRequestV1" as const, requestId: "request:backup", operation: "show_backup" as const, input: { backupId: "backup:weekly" }, timeoutSeconds: 30 };
    const backup = await Effect.runPromise(handlers.show_backup(request));
    const guidance = await Effect.runPromise(handlers.restore_guidance({ ...request, operation: "restore_guidance" }));

    expect(backup).toMatchObject({ status: "completed", payload: { backupId: "backup:weekly", targetId: "target:dotfiles", eligibility: "verification-failed" } });
    expect(guidance).toMatchObject({ status: "refused", payload: { kind: "guidance", manualOnly: true, stopConditions: ["backup-verification-required"] } });
    expect(JSON.stringify({ backup, guidance })).not.toMatch(/path|restore.*execut|resume|rollback/i);
  });

  test("keeps read-only backup results equivalent across the composed service boundary", async () => {
    const ports = Layer.mergeAll(
      Layer.succeed(PlatformFactsPort, { facts: Effect.die("not-used") }),
      Layer.succeed(EvidenceStatusPort, { forProgram: () => Effect.die("not-used") }),
      Layer.succeed(ProfileInventoryPort, { inventory: Effect.die("not-used") }),
      Layer.succeed(SourceEvidencePort, { observations: Effect.die("not-used") }),
      Layer.succeed(ProviderDiscoveryPort, { discover: () => Effect.die("not-used") }),
      Layer.succeed(PackageMappingPort, { map: () => Effect.die("not-used") }),
      Layer.succeed(BackupStatusPort, { visibility: Effect.succeed([{ backupId: "backup:weekly", targetId: "target:dotfiles", state: "verified" as const, identityEvidenceIds: ["evidence:identity"], integrityEvidenceIds: ["evidence:integrity"], nextAction: { kind: "follow-manual-guidance" as const, reasonCode: "manual-restore-only" } }]) }),
    );
    const result = await Effect.runPromise(Effect.gen(function*() {
      return yield* (yield* ReadOnlyRequestService).dispatch({ version: "AgentRequestV1", requestId: "request:composed", operation: "restore_guidance", input: { backupId: "backup:weekly" }, timeoutSeconds: 30 });
    }).pipe(Effect.provide(makeReadOnlyLayer(ports))));
    expect(result).toMatchObject({ status: "completed", payload: { kind: "guidance", backupId: "backup:weekly", manualOnly: true, checks: ["reassess-after-manual-restore"] } });
  });

  test("accepts only a symbolic backup identifier at the CLI boundary", () => {
    const valid = { version: "AgentRequestV1", requestId: "request:backup-input", operation: "show_backup", input: { backupId: "backup:weekly" }, timeoutSeconds: 30 };
    const unsafe = { ...valid, input: { backupId: "/home/alice/backup" } };
    expect(Result.isSuccess(decodeAgentRequest(new TextEncoder().encode(JSON.stringify(valid))))).toBe(true);
    expect(Result.isFailure(decodeAgentRequest(new TextEncoder().encode(JSON.stringify(unsafe))))).toBe(true);
  });

  test("renders symbolic backup evidence and manual stop conditions without a path or executable action", () => {
    const presentation = createTuiPresentation({
      version: "PublicResultV2", operation: "restore_guidance", status: "refused", correlationId: "request:tui-guidance",
      payload: { kind: "guidance", backupId: "backup:weekly", targetId: "target:dotfiles", manualOnly: true, prerequisites: ["identity-verified", "integrity-verified"], steps: ["consult-authoritative-runbook"], checks: ["reassess-after-manual-restore"], stopConditions: ["backup-verification-required"] },
      blockers: [{ code: "operation-refused" }], evidence: [{ evidenceId: "evidence:identity", strength: "structural", summaryCode: "backup-verification" }], nextActions: ["backup-verification-required"],
    }, 120);
    const items = presentation.views.find((view) => view.id === "backups")?.items ?? [];
    expect(items).toEqual(expect.arrayContaining(["backup:weekly", "target:dotfiles", "identity-verified", "backup-verification-required"]));
    expect(items.join(" ")).not.toMatch(/path|execute|rollback|resume/i);
  });
});
