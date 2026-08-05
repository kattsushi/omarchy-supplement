import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProgramId } from "../../domain/states.js";

const RequestId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128), Schema.isPattern(/^request:[A-Za-z0-9_-]+$/));
const TimeoutSeconds = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })).pipe(Schema.withDecodingDefault(Effect.succeed(30)));
const EmptyInput = Schema.Struct({});
const ProgramInput = Schema.Struct({ programId: ProgramId });

export const AgentOperation = Schema.Literals([
  "assess_workstation", "list_profiles", "plan_package_install", "show_evidence", "show_backup", "restore_guidance",
]);
export type AgentOperation = typeof AgentOperation.Type;

export const AgentRequest = Schema.Union([
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("assess_workstation"), input: Schema.Struct({ programIds: Schema.Array(ProgramId).check(Schema.isMaxLength(64)) }), timeoutSeconds: TimeoutSeconds }),
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("list_profiles"), input: EmptyInput, timeoutSeconds: TimeoutSeconds }),
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("plan_package_install"), input: Schema.Struct({ programId: ProgramId, fallbackOptIn: Schema.Boolean }), timeoutSeconds: TimeoutSeconds }),
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("show_evidence"), input: ProgramInput, timeoutSeconds: TimeoutSeconds }),
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("show_backup"), input: EmptyInput, timeoutSeconds: TimeoutSeconds }),
  Schema.Struct({ version: Schema.Literal("AgentRequestV1"), requestId: RequestId, operation: Schema.Literal("restore_guidance"), input: ProgramInput, timeoutSeconds: TimeoutSeconds }),
]);
export type AgentRequest = typeof AgentRequest.Type;
export const defaultTimeoutSeconds = 30;
