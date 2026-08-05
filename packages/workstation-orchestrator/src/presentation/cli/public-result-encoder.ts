import type { PublicResult } from "../../application/contracts/public-result.js";

export const maxResponseBytes = 1024 * 1024;
const encoder = new TextEncoder();
const safeText = /^[A-Za-z0-9 .,:_-]{1,256}$/;
const statuses = new Set(["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "failed", "timed-out", "cancelled"]);
const codes = new Set(["invalid-request", "operation-unsupported", "operation-refused", "operation-ambiguous", "operation-stale", "operation-failed", "operation-timed-out", "operation-cancelled"]);
const failedOverflow = (): PublicResult => ({
  version: "PublicResultV1", status: "failed", correlationId: "request:overflow",
  blockers: [{ code: "operation-failed" }], evidence: [], nextActions: [],
});
const stable = (result: PublicResult) => ({
  blockers: [...result.blockers].sort((a, b) => a.code.localeCompare(b.code)), correlationId: result.correlationId,
  evidence: [...result.evidence].sort(), nextActions: [...result.nextActions].sort(), status: result.status, version: result.version,
});
const isSafe = (result: PublicResult) => result.version === "PublicResultV1" && statuses.has(result.status)
  && /^request:[A-Za-z0-9_-]{1,120}$/.test(result.correlationId) && result.blockers.every(({ code }) => codes.has(code))
  && result.blockers.length <= 64 && result.evidence.length <= 64 && result.nextActions.length <= 64
  && result.evidence.every((value) => safeText.test(value)) && result.nextActions.every((value) => safeText.test(value));

export const encodePublicResult = (result: PublicResult): Uint8Array => {
  const bytes = isSafe(result) ? encoder.encode(`${JSON.stringify(stable(result))}\n`) : new Uint8Array(maxResponseBytes + 1);
  return bytes.length <= maxResponseBytes ? bytes : encoder.encode(`${JSON.stringify(stable(failedOverflow()))}\n`);
};
