import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AgentRequest } from "../../application/contracts/agent-request.js";

export const maxRequestBytes = 256 * 1024;
export type DecodeFailure = "invalid-request";
const decoder = new TextDecoder("utf-8", { fatal: true });
const keysFor = {
  assess_workstation: ["programIds"], list_profiles: [], plan_package_install: ["programId", "fallbackOptIn"],
  show_evidence: ["programId"], show_backup: ["backupId"], restore_guidance: ["backupId"],
} as const;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
const isClosedRequest = (value: unknown): boolean => {
  if (!isObject(value) || !Object.keys(value).every((key) => ["version", "requestId", "operation", "input", "timeoutSeconds"].includes(key)) || !["version", "requestId", "operation", "input"].every((key) => key in value)) return false;
  if (typeof value.operation !== "string" || !(value.operation in keysFor) || !isObject(value.input)) return false;
  return exactKeys(value.input, keysFor[value.operation as keyof typeof keysFor]);
};

export const decodeAgentRequest = (bytes: Uint8Array): Result.Result<typeof AgentRequest.Type, DecodeFailure> => {
  if (bytes.length === 0 || bytes.length > maxRequestBytes) return Result.fail("invalid-request");
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    if (!isClosedRequest(value)) return Result.fail("invalid-request");
    return Result.succeed(Schema.decodeUnknownSync(AgentRequest)(value));
  } catch { return Result.fail("invalid-request"); }
};
