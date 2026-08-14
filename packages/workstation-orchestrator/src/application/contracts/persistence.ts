import * as Data from "effect/Data";

export const maxPersistenceRetentionMs = 30 * 24 * 60 * 60 * 1_000;
const maxEvidenceIds = 64;
const identifier = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const digest = /^sha256:[a-f0-9]{64}$/;

export type PersistencePutResult = "inserted" | "exact-duplicate";
export type PlanBindingLedgerRecord = { readonly schemaVersion: "v1"; readonly kind: "plan-binding"; readonly recordId: string; readonly planId: string; readonly bindingDigest: string; readonly policyId: string; readonly policyVersion: string; readonly evidenceIds: readonly string[]; readonly observedAt: number; readonly expiresAt: number };
export type ConfirmationDigestLedgerRecord = { readonly schemaVersion: "v1"; readonly kind: "confirmation-digest"; readonly recordId: string; readonly planId: string; readonly confirmationDigest: string; readonly observedAt: number; readonly expiresAt: number };
export type OperationOutcomeLedgerRecord = { readonly schemaVersion: "v1"; readonly kind: "operation-outcome"; readonly recordId: string; readonly planId: string; readonly bindingDigest: string; readonly operationId: string; readonly providerId: string; readonly policyId: string; readonly policyVersion: string; readonly evidenceIds: readonly string[]; readonly outcome: "completed" | "failed" | "indeterminate"; readonly observedAt: number; readonly expiresAt: number };
export type LedgerRecord = PlanBindingLedgerRecord | ConfirmationDigestLedgerRecord | OperationOutcomeLedgerRecord;

export class PersistenceFailure extends Data.TaggedError("PersistenceFailure")<{
  readonly code: "forbidden-field" | "invalid-identifier" | "invalid-digest" | "payload-too-large" | "conflicting-duplicate" | "retention-exceeded" | "stale-record" | "fresh-observation-required" | "indeterminate-recovery-required";
}> {}

type DecodeResult = { readonly _tag: "Success"; readonly success: LedgerRecord } | { readonly _tag: "Failure"; readonly failure: PersistenceFailure };
const failure = (code: PersistenceFailure["code"]): DecodeResult => ({ _tag: "Failure", failure: new PersistenceFailure({ code }) });
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const isIdentifier = (value: unknown): value is string => typeof value === "string" && identifier.test(value);
const isTypedIdentifier = (value: unknown, prefix: string): value is string => isIdentifier(value) && value.startsWith(`${prefix}:`);
const isDigest = (value: unknown): value is string => typeof value === "string" && digest.test(value);
const isTimestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const policyVersionFailure = (value: unknown): PersistenceFailure["code"] | undefined => {
  if (typeof value !== "string" || !/^[\x20-\x7e]+$/.test(value) || !/^v[0-9]+$/.test(value)) return "invalid-identifier";
  return value.length > 128 ? "payload-too-large" : undefined;
};

const recordFields = {
  "plan-binding": ["schemaVersion", "kind", "recordId", "planId", "bindingDigest", "policyId", "policyVersion", "evidenceIds", "observedAt", "expiresAt"],
  "confirmation-digest": ["schemaVersion", "kind", "recordId", "planId", "confirmationDigest", "observedAt", "expiresAt"],
  "operation-outcome": ["schemaVersion", "kind", "recordId", "planId", "bindingDigest", "operationId", "providerId", "policyId", "policyVersion", "evidenceIds", "outcome", "observedAt", "expiresAt"],
} as const;

const validateEnvelope = (value: Readonly<Record<string, unknown>>, fields: readonly string[]): PersistenceFailure["code"] | undefined => {
  for (const [key, field] of Object.entries(value)) if (!fields.includes(key)) return typeof field === "string" && field.length > 256 ? "payload-too-large" : "forbidden-field";
  if (value.schemaVersion !== "v1") return "forbidden-field";
  if (!isTypedIdentifier(value.recordId, "ledger")) return "invalid-identifier";
  if (!isTimestamp(value.observedAt) || !isTimestamp(value.expiresAt) || value.expiresAt < value.observedAt || value.expiresAt - value.observedAt > maxPersistenceRetentionMs) return "retention-exceeded";
  return undefined;
};

const validateEvidence = (value: unknown): readonly string[] | PersistenceFailure["code"] => {
  if (!Array.isArray(value) || value.length > maxEvidenceIds) return "payload-too-large";
  if (!value.every((identifierValue) => isTypedIdentifier(identifierValue, "evidence")) || new Set(value).size !== value.length) return "invalid-identifier";
  return Object.freeze([...value].sort());
};

export const decodeLedgerRecord = (value: unknown): DecodeResult => {
  if (!isObject(value) || typeof value.kind !== "string" || !(value.kind in recordFields)) return failure("forbidden-field");
  const kind = value.kind;
  const fields = recordFields[kind as keyof typeof recordFields];
  const envelope = validateEnvelope(value, fields);
  if (envelope !== undefined) return failure(envelope);
  const { recordId, planId, observedAt, expiresAt } = value;
  if (!isTypedIdentifier(recordId, "ledger") || !isTypedIdentifier(planId, "plan")) return failure("invalid-identifier");
  if (!isTimestamp(observedAt) || !isTimestamp(expiresAt)) return failure("retention-exceeded");
  if (kind === "confirmation-digest") return isDigest(value.confirmationDigest) ? { _tag: "Success", success: Object.freeze({ schemaVersion: "v1", kind, recordId, planId, confirmationDigest: value.confirmationDigest, observedAt, expiresAt }) } : failure("invalid-digest");
  const evidenceIds = validateEvidence(value.evidenceIds);
  if (typeof evidenceIds === "string") return failure(evidenceIds);
  if (!isDigest(value.bindingDigest)) return failure("invalid-digest");
  if (!isTypedIdentifier(value.policyId, "policy")) return failure("invalid-identifier");
  const policyVersion = value.policyVersion;
  if (typeof policyVersion !== "string") return failure("invalid-identifier");
  const invalidPolicyVersion = policyVersionFailure(policyVersion);
  if (invalidPolicyVersion !== undefined) return failure(invalidPolicyVersion);
  if (kind === "plan-binding") return { _tag: "Success", success: Object.freeze({ schemaVersion: "v1", kind, recordId, planId, bindingDigest: value.bindingDigest, policyId: value.policyId, policyVersion, evidenceIds, observedAt, expiresAt }) };
  if (!isTypedIdentifier(value.operationId, "operation") || !isTypedIdentifier(value.providerId, "provider") || !["completed", "failed", "indeterminate"].includes(value.outcome as string)) return failure("invalid-identifier");
  return { _tag: "Success", success: Object.freeze({ schemaVersion: "v1", kind: "operation-outcome", recordId, planId, bindingDigest: value.bindingDigest, operationId: value.operationId, providerId: value.providerId, policyId: value.policyId, policyVersion, evidenceIds, outcome: value.outcome as OperationOutcomeLedgerRecord["outcome"], observedAt, expiresAt }) };
};

const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, key === "evidenceIds" && Array.isArray(value[key]) ? [...value[key]].sort() : sorted(value[key])])) : value;
export const canonicalLedgerRecord = (record: LedgerRecord): string => JSON.stringify(sorted(record));
const sha256 = async (value: Uint8Array): Promise<string> => {
  const input = new ArrayBuffer(value.byteLength);
  new Uint8Array(input).set(value);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};
export const ledgerRecordDigest = (record: LedgerRecord): Promise<string> => sha256(new TextEncoder().encode(canonicalLedgerRecord(record)));
export const createConfirmationToken = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));
export const confirmationDigest = async (token: Uint8Array): Promise<string> => {
  if (token.byteLength !== 32) throw new TypeError("confirmation token must contain 32 bytes");
  return sha256(token);
};

export type AuthoritativeObservation = { readonly bindingDigest: string; readonly observedAt: number; readonly authoritative: boolean; readonly explicitUserRecovery: boolean };
export type LedgerAuthorityBlocker = { readonly code: "fresh-observation-required" | "stale-record" | "indeterminate-recovery-required"; readonly requiresFreshObservation: true; readonly grantsAuthority: false };
const authorityBlocker = (code: LedgerAuthorityBlocker["code"]): LedgerAuthorityBlocker => ({ code, requiresFreshObservation: true, grantsAuthority: false });

/** Ledger metadata can only block or request reassessment; it never confers authority. */
export const assessLedgerAuthority = (record: LedgerRecord | undefined, observation: AuthoritativeObservation): LedgerAuthorityBlocker => {
  if (record === undefined || !observation.authoritative) return authorityBlocker("fresh-observation-required");
  const bindingDigest = "bindingDigest" in record ? record.bindingDigest : undefined;
  if (bindingDigest === undefined || bindingDigest !== observation.bindingDigest || observation.observedAt <= record.observedAt) return authorityBlocker("stale-record");
  if (record.kind === "operation-outcome" && record.outcome === "indeterminate" && !observation.explicitUserRecovery) return authorityBlocker("indeterminate-recovery-required");
  return authorityBlocker("fresh-observation-required");
};
