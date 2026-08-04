import { Effect, Match, Schema } from "effect";
import { ProviderIdSchema, ProviderRoleSchema, SafeNextActionSchema, TypedBlockerSchema, type ProviderId, type ProviderRole, type SafeNextAction, type TypedBlocker } from "./states";

export const PlanOperationSchema = Schema.Literals(["package-acquisition", "configuration-apply"]);
export type PlanOperation = Schema.Schema.Type<typeof PlanOperationSchema>;

export const PlanBindingDigestSchema = Schema.String.pipe(Schema.brand("PlanBindingDigest"));
export type PlanBindingDigest = Schema.Schema.Type<typeof PlanBindingDigestSchema>;

export const PlanIdSchema = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = Schema.Schema.Type<typeof PlanIdSchema>;

export const ConfirmationIdSchema = Schema.String.pipe(Schema.brand("ConfirmationId"));
export type ConfirmationId = Schema.Schema.Type<typeof ConfirmationIdSchema>;

export const ProviderPolicySchema = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
});
export type ProviderPolicy = Schema.Schema.Type<typeof ProviderPolicySchema>;

const planBindingInputFields = {
  operation: PlanOperationSchema,
  logicalRequestIds: Schema.Array(Schema.String),
  platformObservationDigest: Schema.String,
  profilePolicyDigest: Schema.String,
  provider: ProviderIdSchema,
  providerRole: ProviderRoleSchema,
  providerPolicy: ProviderPolicySchema,
  capabilityId: Schema.String,
  mappingIds: Schema.Array(Schema.String),
  packageStateDigests: Schema.Array(Schema.String),
  verificationPolicyId: Schema.String,
  riskCodes: Schema.Array(Schema.String),
  fallbackOptIn: Schema.Boolean,
} as const;

const planBindingFields = {
  ...planBindingInputFields,
  platformObservationDigest: PlanBindingDigestSchema,
  profilePolicyDigest: PlanBindingDigestSchema,
  packageStateDigests: Schema.Array(PlanBindingDigestSchema),
} as const;

export const PlanBindingSchema = Schema.Struct({
  schemaVersion: Schema.Literal("PlanBindingV1"),
  ...planBindingFields,
});
export type PlanBindingV1 = Schema.Schema.Type<typeof PlanBindingSchema>;

export const PlanBindingInputSchema = Schema.Struct(planBindingInputFields);
export type PlanBindingInput = Schema.Schema.Type<typeof PlanBindingInputSchema>;

export const BoundPlanSchema = Schema.Struct({
  planId: PlanIdSchema,
  binding: PlanBindingSchema,
  digest: PlanBindingDigestSchema,
});
export type BoundPlan = Schema.Schema.Type<typeof BoundPlanSchema>;

export const ConfirmationRecordSchema = Schema.Struct({
  confirmationId: ConfirmationIdSchema,
  planId: PlanIdSchema,
  bindingDigest: PlanBindingDigestSchema,
  expiresAt: Schema.String,
  replayPolicy: Schema.Literals(["single-use", "not-replayable"]),
});
export type ConfirmationRecord = Schema.Schema.Type<typeof ConfirmationRecordSchema>;

export const PackagePlanSchema = Schema.Struct({
  plan: BoundPlanSchema,
  blockers: Schema.Array(TypedBlockerSchema),
  nextActions: Schema.Array(SafeNextActionSchema),
  acquisitionDoesNotVerifyConfiguration: Schema.Literal(true),
  acquisitionDoesNotVerifyDotfileStow: Schema.Literal(true),
});
export type PackagePlan = Schema.Schema.Type<typeof PackagePlanSchema>;

export class PlanBindingDigestFailure extends Error {
  readonly _tag = "PlanBindingDigestFailure";

  constructor(readonly cause: unknown) {
    super("Unable to calculate the plan binding digest");
  }
}

// Tuicr: normalize operation and unordered collections before binding them to a deterministic plan digest.
export function normalizePlanBinding(input: PlanBindingInput): PlanBindingV1 {
  return {
    ...input,
    schemaVersion: "PlanBindingV1",
    operation: Match.value(input.operation).pipe(
      Match.when("package-acquisition", () => "package-acquisition" as const),
      Match.when("configuration-apply", () => "configuration-apply" as const),
      Match.exhaustive,
    ),
    platformObservationDigest: Schema.decodeUnknownSync(PlanBindingDigestSchema)(input.platformObservationDigest),
    profilePolicyDigest: Schema.decodeUnknownSync(PlanBindingDigestSchema)(input.profilePolicyDigest),
    logicalRequestIds: [...input.logicalRequestIds].sort(),
    mappingIds: [...input.mappingIds].sort(),
    packageStateDigests: input.packageStateDigests.map((digest) => Schema.decodeUnknownSync(PlanBindingDigestSchema)(digest)).sort(),
    riskCodes: [...input.riskCodes].sort(),
  };
}

export function canonicalPlanBindingJson(binding: PlanBindingV1): string {
  return canonicalize(binding);
}

export function createPlanBinding(input: PlanBindingInput): Effect.Effect<BoundPlan, PlanBindingDigestFailure> {
  const binding = normalizePlanBinding(input);
  return Effect.map(sha256(canonicalPlanBindingJson(binding)), (digest) => ({
    binding,
    digest: Schema.decodeUnknownSync(PlanBindingDigestSchema)(digest),
    planId: Schema.decodeUnknownSync(PlanIdSchema)(`plan:${digest}`),
  }));
}

export function isPlanBindingCurrent(plan: BoundPlan, current: PlanBindingInput): Effect.Effect<boolean, PlanBindingDigestFailure> {
  return Effect.map(createPlanBinding(current), (candidate) => plan.digest === candidate.digest);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function sha256(input: string): Effect.Effect<string, PlanBindingDigestFailure> {
  return Effect.tryPromise({
    try: async () => {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    },
    catch: (cause) => new PlanBindingDigestFailure(cause),
  });
}
