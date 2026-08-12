import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  evaluateProviderPolicy,
  makeProviderPolicyGateLayer,
  type ProviderPolicyPredicates,
} from "../../src/application/contracts/provider-policy.js";
import { ExecutePackagePlan } from "../../src/application/services/package-execution.js";
import { mutationUnavailableLayer } from "../../src/composition/mutation.js";

const passingPredicates = {
  humanGovernance: true,
  technicalAuthenticity: true,
  nativeEvidence: true,
  disclosureComprehension: true,
  safeEnvironment: true,
  preservedSafetyGates: true,
} as const satisfies ProviderPolicyPredicates;

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
          acknowledgements: {
            network: true,
            privilege: true,
            prompts: true,
            sideEffects: true,
            noAutomaticRollback: true,
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "PackageExecutionRefused",
      code: "production-unavailable",
    });
  });
});
