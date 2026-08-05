import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AcquisitionVerificationPort,
  HomebrewExecutionPort,
  OmarchyExecutionPort,
  PackageExecutionClockPort,
  PackageExecutionUnavailable,
  PackageExecutionObservationPort,
  PackageExecutionPolicyPort,
  type ProviderExecutionReport,
} from "../../src/application/ports/package-execution.js";
import {
  ExecutePackagePlan,
  PackageExecutionRefused,
  confirmationTtlMs,
} from "../../src/application/services/package-execution.js";
import { mutationUnavailableLayer } from "../../src/composition/mutation.js";
import { createPlanBinding, PlanDigestService, type PackagePlan, type PlanBindingInput } from "../../src/domain/plans.js";

const acknowledged = {
  network: true,
  privilege: true,
  prompts: true,
  sideEffects: true,
  noAutomaticRollback: true,
} as const;

const bindingInput = (provider: "omarchy" | "homebrew" = "omarchy", fallbackOptIn = false): PlanBindingInput => ({
  operation: "package-acquisition",
  logicalRequestIds: ["program:neovim"],
  platformObservationDigest: "observation:linux",
  profilePolicyDigest: "policy:base",
  provider,
  providerRole: provider === "homebrew" ? "fallback" : "primary",
  providerPolicy: { id: provider === "homebrew" ? "policy:brew-linux" : "policy:omarchy-3", version: "1" },
  capabilityId: provider === "homebrew" ? "homebrew-formula" : "omarchy-pkg-add",
  mappingIds: [provider === "homebrew" ? "mapping:brew-neovim" : "mapping:omarchy-neovim"],
  packageStateDigests: ["state:missing-neovim"],
  verificationPolicyId: "verification:package-presence",
  riskCodes: ["network", "side-effects"],
  fallbackOptIn,
});

const makePlan = (input = bindingInput()): Effect.Effect<PackagePlan, never, PlanDigestService> => Effect.map(
  createPlanBinding(input),
  (plan) => ({ plan, blockers: [], nextActions: [], acquisitionDoesNotVerifyConfiguration: true as const, acquisitionDoesNotVerifyDotfileStow: true as const }),
).pipe(Effect.orDie);

const makeHarness = (options: {
  readonly currentPlan?: PackagePlan;
  readonly report?: ProviderExecutionReport;
  readonly verification?: "provider-reported" | "independently-verified" | "unverifiable";
  readonly now?: { value: number };
} = {}) => {
  const calls: Array<{ readonly provider: string; readonly argv: readonly string[] }> = [];
  const now = options.now ?? { value: 1_000_000 };
  const report = options.report ?? { kind: "provider-reported" as const, evidenceIds: ["evidence:provider"] };
  const dependencies = (_currentPlan: PackagePlan) => Layer.mergeAll(
    Layer.succeed(PackageExecutionClockPort, { now: Effect.sync(() => now.value) }),
    Layer.succeed(PackageExecutionObservationPort, { reobserve: (plan) => Effect.succeed((options.currentPlan ?? plan).plan) }),
    Layer.succeed(PackageExecutionPolicyPort, {
      commandFor: (plan) => Effect.succeed(plan.plan.binding.provider === "omarchy"
        ? { provider: "omarchy" as const, policyId: plan.plan.binding.providerPolicy.id, argv: ["omarchy", "pkg", "add", "neovim"] as const }
        : { provider: "homebrew" as const, policyId: plan.plan.binding.providerPolicy.id, argv: ["brew", "install", "neovim"] as const }),
    }),
    Layer.succeed(AcquisitionVerificationPort, { verify: () => Effect.succeed(options.verification ?? "independently-verified") }),
    Layer.succeed(OmarchyExecutionPort, { execute: ({ command }) => Effect.sync(() => { calls.push({ provider: "omarchy", argv: command.argv }); return report; }) }),
    Layer.succeed(HomebrewExecutionPort, { execute: ({ command }) => Effect.sync(() => { calls.push({ provider: "homebrew", argv: command.argv }); return report; }) }),
  );
  return { calls, now, dependencies };
};

const refusedCode = <A, R>(effect: Effect.Effect<A, PackageExecutionRefused | PackageExecutionUnavailable, R>) => effect.pipe(
  Effect.catchTag("PackageExecutionUnavailable", (error) => Effect.die(error)),
  Effect.flip,
  Effect.map((error) => error.code),
);

describe("ExecutePackagePlan", () => {
  it("issues a short-lived exact confirmation and executes one Omarchy plan once", async () => {
    const plan = await Effect.runPromise(makePlan().pipe(Effect.provide(PlanDigestService.layer)));
    const harness = makeHarness();
    await Effect.runPromise(Effect.gen(function*() {
      const service = yield* ExecutePackagePlan;
      const confirmation = yield* service.confirm({ plan, acknowledgements: acknowledged });

      expect(confirmation.planId).toBe(plan.plan.planId);
      expect(confirmation.bindingDigest).toBe(plan.plan.digest);
      expect(Date.parse(confirmation.expiresAt) - harness.now.value).toBe(confirmationTtlMs);
      expect(Object.keys(confirmation).sort()).toEqual(["bindingDigest", "confirmationId", "expiresAt", "planId", "replayPolicy"]);

      const outcome = yield* service.execute({ plan, confirmationId: confirmation.confirmationId });
      expect(outcome).toEqual({ kind: "independently-verified", evidenceIds: ["evidence:provider"], reassessmentRequired: false });
      expect(harness.calls).toEqual([{ provider: "omarchy", argv: ["omarchy", "pkg", "add", "neovim"] }]);
      expect(yield* refusedCode(service.execute({ plan, confirmationId: confirmation.confirmationId }))).toBe("confirmation-replayed");
    }).pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, harness.dependencies(plan)))));
  });

  it("refuses incomplete acknowledgements, batch plans, and missing mappings before issuing authority", async () => {
    const [plan, batch, unmapped] = await Promise.all([
      makePlan(),
      makePlan({ ...bindingInput(), logicalRequestIds: ["program:neovim", "program:git"] }),
      makePlan({ ...bindingInput(), mappingIds: [] }),
    ].map((effect) => Effect.runPromise(effect.pipe(Effect.provide(PlanDigestService.layer)))));
    const harness = makeHarness();
    await Effect.runPromise(Effect.gen(function*() {
      const service = yield* ExecutePackagePlan;
      expect(yield* refusedCode(service.confirm({ plan, acknowledgements: { ...acknowledged, prompts: false } }))).toBe("confirmation-declined");
      expect(yield* refusedCode(service.confirm({ plan: batch, acknowledgements: acknowledged }))).toBe("single-package-required");
      expect(yield* refusedCode(service.confirm({ plan: unmapped, acknowledgements: acknowledged }))).toBe("package-mapping-missing");
    }).pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, harness.dependencies(plan)))));
  });

  it("consumes mismatched, expired, and stale confirmations without provider execution", async () => {
    const [plan, other] = await Promise.all([makePlan(), makePlan({ ...bindingInput(), packageStateDigests: ["state:changed"] })]
      .map((effect) => Effect.runPromise(effect.pipe(Effect.provide(PlanDigestService.layer)))));
    const harness = makeHarness({ currentPlan: other });
    await Effect.runPromise(Effect.gen(function*() {
      const service = yield* ExecutePackagePlan;
      const mismatched = yield* service.confirm({ plan, acknowledgements: acknowledged });
      expect(yield* refusedCode(service.execute({ plan: other, confirmationId: mismatched.confirmationId }))).toBe("confirmation-mismatch");
      const expired = yield* service.confirm({ plan, acknowledgements: acknowledged });
      harness.now.value += confirmationTtlMs + 1;
      expect(yield* refusedCode(service.execute({ plan, confirmationId: expired.confirmationId }))).toBe("confirmation-expired");
      harness.now.value = 1_000_000;
      const stale = yield* service.confirm({ plan, acknowledgements: acknowledged });
      expect(yield* refusedCode(service.execute({ plan, confirmationId: stale.confirmationId }))).toBe("plan-stale");
      expect(harness.calls).toEqual([]);
    }).pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, harness.dependencies(plan)))));
  });

  it("requires per-plan Homebrew fallback opt-in and preserves bounded non-success outcomes", async () => {
    const [notOptedIn, optedIn, primary] = await Promise.all([
      makePlan(bindingInput("homebrew", false)),
      makePlan(bindingInput("homebrew", true)),
      makePlan({ ...bindingInput("homebrew", false), providerRole: "primary" }),
    ]
      .map((effect) => Effect.runPromise(effect.pipe(Effect.provide(PlanDigestService.layer)))));
    const harness = makeHarness();
    await Effect.runPromise(Effect.gen(function*() {
      const service = yield* ExecutePackagePlan;
      expect(yield* refusedCode(service.confirm({ plan: notOptedIn, acknowledgements: acknowledged }))).toBe("fallback-not-opted-in");
      const confirmation = yield* service.confirm({ plan: optedIn, acknowledgements: acknowledged });
      const result = yield* service.execute({ plan: optedIn, confirmationId: confirmation.confirmationId });
      expect(result.kind).toBe("independently-verified");
      const primaryConfirmation = yield* service.confirm({ plan: primary, acknowledgements: acknowledged });
      const primaryResult = yield* service.execute({ plan: primary, confirmationId: primaryConfirmation.confirmationId });
      expect(primaryResult.kind).toBe("independently-verified");
    }).pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, harness.dependencies(optedIn)))));
  });

  it("distinguishes provider-reported, unverifiable, partial, and failed acquisition outcomes", async () => {
    const cases = [
      { report: { kind: "provider-reported", evidenceIds: ["evidence:reported"] } as const, verification: "provider-reported" as const, expected: "provider-reported" },
      { report: { kind: "provider-reported", evidenceIds: ["evidence:weak"] } as const, verification: "unverifiable" as const, expected: "unverifiable" },
      { report: { kind: "partial", evidenceIds: ["evidence:partial"] } as const, verification: "independently-verified" as const, expected: "partial" },
      { report: { kind: "failed", reason: "exit", evidenceIds: [] } as const, verification: "independently-verified" as const, expected: "failed" },
    ];
    for (const testCase of cases) {
      const plan = await Effect.runPromise(makePlan().pipe(Effect.provide(PlanDigestService.layer)));
      const harness = makeHarness(testCase);
      await Effect.runPromise(Effect.gen(function*() {
        const service = yield* ExecutePackagePlan;
        const confirmation = yield* service.confirm({ plan, acknowledgements: acknowledged });
        const result = yield* service.execute({ plan, confirmationId: confirmation.confirmationId });
        expect(result.kind).toBe(testCase.expected);
        expect(result.reassessmentRequired).toBe(testCase.expected !== "independently-verified");
      }).pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, harness.dependencies(plan)))));
    }
  });

  it("keeps production execution typed-unavailable without approved capability evidence", async () => {
    const plan = await Effect.runPromise(makePlan().pipe(Effect.provide(PlanDigestService.layer)));
    const service = await Effect.runPromise(ExecutePackagePlan.pipe(Effect.provide(mutationUnavailableLayer)));
    const confirmation = await Effect.runPromise(service.confirm({ plan, acknowledgements: acknowledged }));
    const unavailable = await Effect.runPromise(Effect.flip(service.execute({ plan, confirmationId: confirmation.confirmationId })));
    expect(unavailable).toMatchObject({ _tag: "PackageExecutionUnavailable", reason: "capability-evidence" });
  });
});
