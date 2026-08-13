import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CompatibilityState, EvidenceStrength, OmarchyGeneration, Platform } from "./states.js";

export const CompatibilityRefusalReason = Schema.Literals([
  "deprecated-generation",
  "unknown-version",
  "future-version",
  "malformed-version",
  "ambiguous-version",
]);
export type CompatibilityRefusalReason = typeof CompatibilityRefusalReason.Type;

export const OmarchyIdentity = Schema.Union([
  Schema.Struct({ availability: Schema.Literal("eligible"), version: Schema.String, revision: Schema.String, generation: Schema.Literal("omarchy-4") }),
  Schema.Struct({ availability: Schema.Literal("refused"), reason: CompatibilityRefusalReason, generation: OmarchyGeneration, version: Schema.optional(Schema.String), revision: Schema.optional(Schema.String) }),
]);
export type OmarchyIdentity = typeof OmarchyIdentity.Type;

export type SourceOmarchyIdentity =
  | { readonly availability: "observed"; readonly version: string; readonly revision?: string; readonly generation: "omarchy-3" | "omarchy-4" }
  | { readonly availability: "unavailable"; readonly reason: string };

export const classifyOmarchyIdentity = (source: SourceOmarchyIdentity): OmarchyIdentity => {
  if (source.availability === "unavailable") {
    const reason = Match.value(source.reason).pipe(
      Match.when("future-version", () => "future-version" as const),
      Match.when("malformed-version", () => "malformed-version" as const),
      Match.when("ambiguous-version", () => "ambiguous-version" as const),
      Match.orElse(() => "unknown-version" as const),
    );
    return { availability: "refused", reason, generation: "unknown" };
  }
  if (source.generation === "omarchy-3") return {
    availability: "refused",
    reason: "deprecated-generation",
    generation: source.generation,
    version: source.version,
    ...(source.revision === undefined ? {} : { revision: source.revision }),
  };
  if (source.revision === undefined || source.revision.length === 0) return {
    availability: "refused",
    reason: "unknown-version",
    generation: source.generation,
    version: source.version,
  };
  return { availability: "eligible", version: source.version, revision: source.revision, generation: source.generation };
};

const LegacyCompatibilityInput = Schema.Struct({ platform: Platform, generation: OmarchyGeneration });
export const CompatibilityInput = Schema.Union([Schema.Struct({ platform: Platform, identity: OmarchyIdentity }), LegacyCompatibilityInput]);
export type CompatibilityInput = typeof CompatibilityInput.Type;

export const CompatibilityDecision = Schema.Struct({
  state: CompatibilityState,
  policyId: Schema.optional(Schema.String),
  generation: OmarchyGeneration,
  evidenceStrength: EvidenceStrength,
  reasonCode: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  revision: Schema.optional(Schema.String),
});
export type CompatibilityDecision = typeof CompatibilityDecision.Type;

type CompatibilityRule = Omit<CompatibilityDecision, "generation" | "version" | "revision">;

const supported = (policyId: string) => ({ state: "supported", policyId, evidenceStrength: "structural" } satisfies CompatibilityRule);
const refused = (reasonCode: CompatibilityRefusalReason) => ({ state: "refused", evidenceStrength: "unverified", reasonCode } satisfies CompatibilityRule);
const unverified = { state: "unverified", evidenceStrength: "unverified" } satisfies CompatibilityRule;

export class CompatibilityRejected extends Data.TaggedError("CompatibilityRejected")<{
  readonly decision: CompatibilityDecision;
}> {}

export function selectCompatibility(input: CompatibilityInput): CompatibilityDecision {
  const identity = "identity" in input
    ? input.identity
    : classifyOmarchyIdentity(input.generation === "omarchy-3"
      ? { availability: "observed", version: "3.0.0", generation: "omarchy-3" }
      : input.generation === "omarchy-4"
        ? { availability: "unavailable", reason: "unknown-version" }
        : { availability: "unavailable", reason: input.generation === "ambiguous" ? "ambiguous-version" : "unknown-version" });
  const rule = Match.value({ platform: input.platform, identity }).pipe(
    Match.when({ platform: "linux", identity: { availability: "refused" } }, ({ identity }) => refused(identity.reason)),
    Match.when({ platform: "linux", identity: { availability: "eligible" } }, ({ identity }) => supported(`omarchy-4:${identity.version}:${identity.revision}`)),
    Match.orElse(() => unverified),
  );
  return Schema.decodeUnknownSync(CompatibilityDecision)({
    ...rule,
    generation: identity.generation,
    version: identity.availability === "eligible" ? identity.version : identity.version,
    revision: identity.availability === "eligible" ? identity.revision : identity.revision,
    policyId: "policyId" in rule ? rule.policyId : undefined,
    reasonCode: "reasonCode" in rule ? rule.reasonCode : undefined,
  });
}

export function validateCompatibility(decision: CompatibilityDecision) {
  return decision.state === "supported"
    ? Result.succeed(decision)
    : Result.fail(new CompatibilityRejected({ decision }));
}
