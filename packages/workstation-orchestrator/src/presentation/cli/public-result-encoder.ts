import { decodePublicResult, sanitizePublicResultV2, type PublicResult, type PublicResultV1, type PublicResultV2 } from "../../application/contracts/public-result.js";

export const maxResponseBytes = 1024 * 1024;
const encoder = new TextEncoder();

const overflowV1 = (): PublicResultV1 => ({
  version: "PublicResultV1", status: "failed", correlationId: "request:overflow",
  blockers: [{ code: "operation-failed" }], evidence: [], nextActions: [],
});
const overflowV2 = (result: PublicResultV2): PublicResultV2 => ({
  version: "PublicResultV2", operation: result.operation, status: "failed", correlationId: result.correlationId,
  payload: { kind: "unavailable", operation: result.operation, reason: "source-unavailable" },
  blockers: [{ code: "operation-failed" }], evidence: [], nextActions: [],
});

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
};

const stable = (result: PublicResult): PublicResult => result.version === "PublicResultV1" ? {
  ...result, blockers: [...result.blockers].sort((a, b) => a.code.localeCompare(b.code)), evidence: [...result.evidence].sort(), nextActions: [...result.nextActions].sort(),
} : sanitizePublicResultV2(result);

const safe = (result: PublicResult): PublicResult | undefined => {
  try { return decodePublicResult(result); } catch { return undefined; }
};

export const encodePublicResult = (result: PublicResult): Uint8Array => {
  const checked = safe(result);
  const bytes = checked === undefined ? new Uint8Array(maxResponseBytes + 1) : encoder.encode(`${canonicalize(stable(checked))}\n`);
  if (bytes.length <= maxResponseBytes) return bytes;
  const fallback = result.version === "PublicResultV2" ? overflowV2(result) : overflowV1();
  return encoder.encode(`${canonicalize(fallback)}\n`);
};
