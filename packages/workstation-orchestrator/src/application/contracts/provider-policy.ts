import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type ProviderPolicyPredicate =
  | "humanGovernance"
  | "technicalAuthenticity"
  | "nativeEvidence"
  | "acquisitionVerification"
  | "disclosureComprehension"
  | "confirmation"
  | "safeEnvironment"
  | "auditReplay"
  | "rollbackReassessment";

export type ProviderPolicyPredicates = Readonly<
  Record<ProviderPolicyPredicate, boolean>
>;

export type ProviderPolicyEvaluation = {
  readonly eligible: boolean;
  readonly failedPredicates: readonly ProviderPolicyPredicate[];
};

const predicateNames = [
  "humanGovernance",
  "technicalAuthenticity",
  "nativeEvidence",
  "acquisitionVerification",
  "disclosureComprehension",
  "confirmation",
  "safeEnvironment",
  "auditReplay",
  "rollbackReassessment",
] as const satisfies readonly ProviderPolicyPredicate[];

export const evaluateProviderPolicy = (
  predicates: ProviderPolicyPredicates,
): ProviderPolicyEvaluation => {
  const failedPredicates = predicateNames.filter(
    (predicate) => !predicates[predicate],
  );

  return Object.freeze({
    eligible: failedPredicates.length === 0,
    failedPredicates: Object.freeze(failedPredicates),
  });
};

export class ProviderPolicyGate extends Context.Service<
  ProviderPolicyGate,
  { readonly evaluate: () => Effect.Effect<ProviderPolicyEvaluation, never> }
>()("ProviderPolicyGate", {
  make: Effect.succeed({
    evaluate: () =>
      Effect.succeed(
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
      ),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export const makeProviderPolicyGateLayer = (
  predicates: ProviderPolicyPredicates,
) =>
  Layer.succeed(ProviderPolicyGate, {
    evaluate: () => Effect.succeed(evaluateProviderPolicy(predicates)),
  });
