import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  evaluateProviderPolicy,
  makeProviderPolicyGateLayer,
  type ProviderPolicyPredicates,
} from "../../src/application/contracts/provider-policy.js";
import {
  AcquisitionVerificationPort,
  HomebrewExecutionPort,
  OmarchyExecutionPort,
  PackageExecutionClockPort,
  PackageExecutionObservationPort,
  PackageExecutionPolicyPort,
} from "../../src/application/ports/package-execution.js";
import { ExecutePackagePlan } from "../../src/application/services/package-execution.js";
import { mutationUnavailableLayer } from "../../src/composition/mutation.js";

const passingPredicates = {
  humanGovernance: true,
  technicalAuthenticity: true,
  nativeEvidence: true,
  acquisitionVerification: true,
  disclosureComprehension: true,
  confirmation: true,
  safeEnvironment: true,
  auditReplay: true,
  rollbackReassessment: true,
} as const satisfies ProviderPolicyPredicates;

const acknowledgedRisks = {
  network: true,
  privilege: true,
  prompts: true,
  sideEffects: true,
  noAutomaticRollback: true,
} as const;

describe("provider-policy predicates", () => {
  it.each(Object.keys(passingPredicates) as Array<keyof ProviderPolicyPredicates>)(
    "keeps production unavailable when %s fails independently",
    (predicate) => {
      const result = evaluateProviderPolicy({ ...passingPredicates, [predicate]: false });

      expect(result).toEqual({
        eligible: false,
        failedPredicates: [predicate],
      });
    },
  );

  it("requires every independent predicate without making any predicate prove another", () => {
    expect(evaluateProviderPolicy(passingPredicates)).toEqual({
      eligible: true,
      failedPredicates: [],
    });
    expect(
      evaluateProviderPolicy({
        ...passingPredicates,
        humanGovernance: false,
        nativeEvidence: false,
      }),
    ).toEqual({
      eligible: false,
      failedPredicates: ["humanGovernance", "nativeEvidence"],
    });
  });

  it("reports every failed predicate in contract order", () => {
    expect(
      evaluateProviderPolicy({
        humanGovernance: false,
        technicalAuthenticity: false,
        nativeEvidence: false,
        acquisitionVerification: false,
        disclosureComprehension: false,
        confirmation: false,
        safeEnvironment: false,
        auditReplay: false,
        rollbackReassessment: false,
      }),
    ).toEqual({
      eligible: false,
      failedPredicates: [
        "humanGovernance",
        "technicalAuthenticity",
        "nativeEvidence",
        "acquisitionVerification",
        "disclosureComprehension",
        "confirmation",
        "safeEnvironment",
        "auditReplay",
        "rollbackReassessment",
      ],
    });
  });
});

describe("production composition gate", () => {
  it("refuses before plan confirmation or provider dispatch when a predicate is unavailable", async () => {
    const service = await Effect.runPromise(
      ExecutePackagePlan.pipe(
        Effect.provide(
          Layer.provide(
            mutationUnavailableLayer,
            makeProviderPolicyGateLayer({
              ...passingPredicates,
              nativeEvidence: false,
            }),
          ),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.flip(
        service.confirm({
          plan: {} as never,
          acknowledgements: acknowledgedRisks,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "PackageExecutionRefused",
      code: "production-unavailable",
    });
  });

  it("keeps production typed-unavailable with every predicate false", async () => {
    const service = await Effect.runPromise(ExecutePackagePlan.pipe(Effect.provide(mutationUnavailableLayer)));

    const result = await Effect.runPromise(
      Effect.flip(
        service.confirm({
          plan: {} as never,
          acknowledgements: acknowledgedRisks,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "PackageExecutionRefused",
      code: "production-unavailable",
    });
  });

  it("refuses confirmation and execution before every provider boundary when audit/replay fails", async () => {
    const calls = { reobserve: 0, command: 0, verify: 0, omarchy: 0, homebrew: 0 };
    const dependencies = Layer.mergeAll(
      PackageExecutionClockPort.layer,
      makeProviderPolicyGateLayer({ ...passingPredicates, auditReplay: false }),
      Layer.succeed(PackageExecutionObservationPort, { reobserve: () => {
        calls.reobserve += 1;
        return Effect.die("must not reobserve");
      } }),
      Layer.succeed(PackageExecutionPolicyPort, { commandFor: () => {
        calls.command += 1;
        return Effect.die("must not resolve a command");
      } }),
      Layer.succeed(AcquisitionVerificationPort, { verify: () => {
        calls.verify += 1;
        return Effect.die("must not verify");
      } }),
      Layer.succeed(OmarchyExecutionPort, { execute: () => {
        calls.omarchy += 1;
        return Effect.die("must not dispatch Omarchy");
      } }),
      Layer.succeed(HomebrewExecutionPort, { execute: () => {
        calls.homebrew += 1;
        return Effect.die("must not dispatch Homebrew");
      } }),
    );
    const service = await Effect.runPromise(ExecutePackagePlan.pipe(Effect.provide(Layer.provide(ExecutePackagePlan.layer, dependencies))));

    const [confirmation, execution] = await Promise.all([
      Effect.runPromise(Effect.flip(service.confirm({
        plan: {} as never,
        acknowledgements: acknowledgedRisks,
      }))),
      Effect.runPromise(Effect.flip(service.execute({ plan: {} as never, confirmationId: "confirmation:blocked" as never }))),
    ]);

    expect(confirmation).toMatchObject({ _tag: "PackageExecutionRefused", code: "production-unavailable" });
    expect(execution).toMatchObject({ _tag: "PackageExecutionRefused", code: "production-unavailable" });
    expect(calls).toEqual({ reobserve: 0, command: 0, verify: 0, omarchy: 0, homebrew: 0 });
  });
});
