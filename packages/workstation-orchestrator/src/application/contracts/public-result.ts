import * as Schema from "effect/Schema";
import { AgentOperation } from "./agent-request.js";

export const PublicStatus = Schema.Literals(["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "failed", "timed-out", "cancelled"]);
export type PublicStatus = typeof PublicStatus.Type;
export const PublicCode = Schema.Literals(["invalid-request", "operation-unsupported", "operation-refused", "operation-ambiguous", "operation-stale", "operation-failed", "operation-timed-out", "operation-cancelled"]);
export type PublicCode = typeof PublicCode.Type;
const CorrelationId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^request:[A-Za-z0-9_-]+$/));
export const SafeText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256), Schema.isPattern(/^[A-Za-z0-9 .,:_-]+$/));
const OpaqueId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^[a-z]+(?::[A-Za-z0-9_.-]+)+$/));
const Blockers = Schema.Array(Schema.Struct({ code: PublicCode })).check(Schema.isMaxLength(64));
const NextActions = Schema.Array(SafeText).check(Schema.isMaxLength(64));

/** Frozen compatibility envelope. New semantics are never added here. */
export const PublicResultV1 = Schema.Struct({
  version: Schema.Literal("PublicResultV1"), status: PublicStatus, correlationId: CorrelationId,
  blockers: Blockers, evidence: Schema.Array(SafeText).check(Schema.isMaxLength(64)), nextActions: NextActions,
});
export type PublicResultV1 = typeof PublicResultV1.Type;

const CompatibilityRefusalPayload = Schema.Struct({ kind: Schema.Literal("compatibility-refusal"), reason: Schema.Literals(["deprecated-generation", "unknown-version", "future-version", "malformed-version", "ambiguous-version"]) });
const UnavailablePayload = Schema.Struct({ kind: Schema.Literal("unavailable"), operation: AgentOperation, reason: Schema.Literals(["service-not-implemented", "source-unavailable"]) });
const ProgramState = Schema.Struct({ programId: OpaqueId, packageState: SafeText, configurationState: SafeText, dotfileStowState: SafeText });
const OmarchyObservation = Schema.Union([
  Schema.Struct({ availability: Schema.Literal("observed"), version: SafeText, generation: SafeText }),
  Schema.Struct({ availability: Schema.Literal("unavailable"), reason: SafeText }),
]);
const AssessmentPayload = Schema.Struct({ kind: Schema.Literal("assessment"), platform: SafeText, architecture: SafeText, omarchy: OmarchyObservation, policyId: OpaqueId, profiles: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)), programs: Schema.Array(ProgramState).check(Schema.isMaxLength(64)), backups: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)) });
const ProfilesPayload = Schema.Struct({ kind: Schema.Literal("profiles"), profiles: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)), policyIds: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)) });
const PlanPayload = Schema.Struct({ kind: Schema.Literal("plan"), provider: Schema.Literals(["omarchy", "homebrew"]), providerRole: Schema.Literals(["primary", "fallback"]), policyId: OpaqueId, planId: OpaqueId, bindingDigest: OpaqueId, confirmationRequired: Schema.Literal(true), acquisitionDoesNotVerifyConfiguration: Schema.Literal(true), acquisitionDoesNotVerifyDotfileStow: Schema.Literal(true) });
const EvidencePayload = Schema.Struct({ kind: Schema.Literal("evidence"), evidenceId: OpaqueId, strength: SafeText, summaryCode: SafeText });
const BackupPayload = Schema.Struct({ kind: Schema.Literal("backup"), backupId: OpaqueId, targetId: OpaqueId, eligibility: SafeText, identityEvidenceIds: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)), integrityEvidenceIds: Schema.Array(OpaqueId).check(Schema.isMaxLength(64)) });
const GuidancePayload = Schema.Struct({ kind: Schema.Literal("guidance"), backupId: OpaqueId, targetId: OpaqueId, manualOnly: Schema.Literal(true), prerequisites: Schema.Array(SafeText).check(Schema.isMaxLength(64)), steps: Schema.Array(SafeText).check(Schema.isMaxLength(64)), checks: Schema.Array(SafeText).check(Schema.isMaxLength(64)), stopConditions: Schema.Array(SafeText).check(Schema.isMaxLength(64)) });

export const PublicResultV2 = Schema.Struct({
  version: Schema.Literal("PublicResultV2"), operation: AgentOperation, status: PublicStatus, correlationId: CorrelationId,
  payload: Schema.Union([UnavailablePayload, CompatibilityRefusalPayload, AssessmentPayload, ProfilesPayload, PlanPayload, EvidencePayload, BackupPayload, GuidancePayload]),
  blockers: Blockers,
  evidence: Schema.Array(Schema.Struct({ evidenceId: OpaqueId, strength: SafeText, summaryCode: SafeText })).check(Schema.isMaxLength(64)),
  nextActions: NextActions,
});
export type PublicResultV2 = typeof PublicResultV2.Type;
export const PublicResult = Schema.Union([PublicResultV1, PublicResultV2]);
export type PublicResult = PublicResultV1 | PublicResultV2;

export const decodePublicResult = (value: unknown): PublicResult => Schema.decodeUnknownSync(PublicResult)(value);

/** The sole public semantic projection used by JSON and Atom state. */
export const projectPublicResultV2 = (value: PublicResultV2): PublicResultV2 => {
  return sanitizePublicResultV2(value);
};

const sensitivePublicValue = /(?:^\/|\/home\b|\/users\b|\.local\/share\/omarchy|secret|password|token|api[_-]?key|stack|stderr|stdout|argv|process\.env|hostname|username)/i;
const containsSensitivePublicValue = (value: unknown): boolean => typeof value === "string"
  ? sensitivePublicValue.test(value)
  : Array.isArray(value)
    ? value.some(containsSensitivePublicValue)
    : value !== null && typeof value === "object"
      ? Object.values(value).some(containsSensitivePublicValue)
      : false;

export const sanitizePublicResultV2 = (value: PublicResultV2): PublicResultV2 => {
  try {
    decodePublicResult(value);
    if (!containsSensitivePublicValue(value)) return value;
  } catch {}
  return {
    version: "PublicResultV2", operation: value.operation, status: "failed", correlationId: value.correlationId,
    payload: { kind: "unavailable", operation: value.operation, reason: "source-unavailable" },
    blockers: [{ code: "operation-failed" }], evidence: [], nextActions: [],
  };
};
