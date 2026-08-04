import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import { ProviderId, ProviderRole, SafeNextAction, TypedBlocker } from "./states.js";

export const PlanOperation = Schema.Literals(["package-acquisition", "configuration-apply"]);
export type PlanOperation = typeof PlanOperation.Type;

export const PlanBindingDigest = Schema.String.pipe(Schema.brand("PlanBindingDigest"));
export type PlanBindingDigest = typeof PlanBindingDigest.Type;

export const PlanId = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = typeof PlanId.Type;

export const ConfirmationId = Schema.String.pipe(Schema.brand("ConfirmationId"));
export type ConfirmationId = typeof ConfirmationId.Type;

export const ProviderPolicy = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
});
export type ProviderPolicy = typeof ProviderPolicy.Type;

const planBindingInputFields = {
  operation: PlanOperation,
  logicalRequestIds: Schema.Array(Schema.String),
  platformObservationDigest: Schema.String,
  profilePolicyDigest: Schema.String,
  provider: ProviderId,
  providerRole: ProviderRole,
  providerPolicy: ProviderPolicy,
  capabilityId: Schema.String,
  mappingIds: Schema.Array(Schema.String),
  packageStateDigests: Schema.Array(Schema.String),
  verificationPolicyId: Schema.String,
  riskCodes: Schema.Array(Schema.String),
  fallbackOptIn: Schema.Boolean,
} as const;

const planBindingFields = {
  ...planBindingInputFields,
  platformObservationDigest: PlanBindingDigest,
  profilePolicyDigest: PlanBindingDigest,
  packageStateDigests: Schema.Array(PlanBindingDigest),
} as const;

export const PlanBinding = Schema.Struct({
  schemaVersion: Schema.Literal("PlanBindingV1"),
  ...planBindingFields,
});
export type PlanBindingV1 = typeof PlanBinding.Type;

export const PlanBindingInput = Schema.Struct(planBindingInputFields);
export type PlanBindingInput = typeof PlanBindingInput.Type;

export const BoundPlan = Schema.Struct({
  planId: PlanId,
  binding: PlanBinding,
  digest: PlanBindingDigest,
});
export type BoundPlan = typeof BoundPlan.Type;

export const ConfirmationRecord = Schema.Struct({
  confirmationId: ConfirmationId,
  planId: PlanId,
  bindingDigest: PlanBindingDigest,
  expiresAt: Schema.String,
  replayPolicy: Schema.Literals(["single-use", "not-replayable"]),
});
export type ConfirmationRecord = typeof ConfirmationRecord.Type;

export const PackagePlan = Schema.Struct({
  plan: BoundPlan,
  blockers: Schema.Array(TypedBlocker),
  nextActions: Schema.Array(SafeNextAction),
  acquisitionDoesNotVerifyConfiguration: Schema.Literal(true),
  acquisitionDoesNotVerifyDotfileStow: Schema.Literal(true),
});
export type PackagePlan = typeof PackagePlan.Type;

export class PlanBindingDigestFailure extends Data.TaggedError("PlanBindingDigestFailure")<{
  readonly cause: unknown;
}> {}

export class PlanDigestService extends Context.Service<
  PlanDigestService,
  { readonly sha256: (input: string) => Effect.Effect<string, PlanBindingDigestFailure> }
>()("PlanDigestService", {
  make: Effect.succeed({
    sha256: (input) => Effect.tryPromise({
      try: async () => {
        const bytes = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      },
      catch: (cause) => new PlanBindingDigestFailure({ cause }),
    }),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export function normalizePlanBinding(input: PlanBindingInput): PlanBindingV1 {
  return {
    ...input,
    schemaVersion: "PlanBindingV1",
    operation: Match.value(input.operation).pipe(
      Match.when("package-acquisition", () => "package-acquisition" as const),
      Match.when("configuration-apply", () => "configuration-apply" as const),
      Match.exhaustive,
    ),
    platformObservationDigest: Schema.decodeUnknownSync(PlanBindingDigest)(input.platformObservationDigest),
    profilePolicyDigest: Schema.decodeUnknownSync(PlanBindingDigest)(input.profilePolicyDigest),
    logicalRequestIds: [...input.logicalRequestIds].sort(),
    mappingIds: [...input.mappingIds].sort(),
    packageStateDigests: input.packageStateDigests.map((digest) => Schema.decodeUnknownSync(PlanBindingDigest)(digest)).sort(),
    riskCodes: [...input.riskCodes].sort(),
  };
}

export function canonicalPlanBindingJson(binding: PlanBindingV1) {
  return canonicalize(binding);
}

export function createPlanBinding(input: PlanBindingInput): Effect.Effect<BoundPlan, PlanBindingDigestFailure, PlanDigestService> {
  const binding = normalizePlanBinding(input);
  return Effect.gen(function*() {
    const digestService = yield* PlanDigestService;
    const digest = yield* digestService.sha256(canonicalPlanBindingJson(binding));
    return {
      binding,
      digest: Schema.decodeUnknownSync(PlanBindingDigest)(digest),
      planId: Schema.decodeUnknownSync(PlanId)(`plan:${digest}`),
    };
  });
}

export function isPlanBindingCurrent(plan: BoundPlan, current: PlanBindingInput): Effect.Effect<boolean, PlanBindingDigestFailure, PlanDigestService> {
  return Effect.map(createPlanBinding(current), (candidate) => plan.digest === candidate.digest);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record: Record<string, unknown> = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
