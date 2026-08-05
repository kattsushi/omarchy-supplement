import * as Schema from "effect/Schema";

export const PublicStatus = Schema.Literals(["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "failed", "timed-out", "cancelled"]);
export type PublicStatus = typeof PublicStatus.Type;
export const PublicCode = Schema.Literals(["invalid-request", "operation-unsupported", "operation-refused", "operation-ambiguous", "operation-stale", "operation-failed", "operation-timed-out", "operation-cancelled"]);
export type PublicCode = typeof PublicCode.Type;
const CorrelationId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^request:[A-Za-z0-9_-]+$/));
const SafeText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256), Schema.isPattern(/^[A-Za-z0-9 .,:_-]+$/));

export const PublicResult = Schema.Struct({
  version: Schema.Literal("PublicResultV1"),
  status: PublicStatus,
  correlationId: CorrelationId,
  blockers: Schema.Array(Schema.Struct({ code: PublicCode })).check(Schema.isMaxLength(64)),
  evidence: Schema.Array(SafeText).check(Schema.isMaxLength(64)),
  nextActions: Schema.Array(SafeText).check(Schema.isMaxLength(64)),
});
export type PublicResult = typeof PublicResult.Type;
