import { sanitizePublicResultV2, type PublicResult } from "../../application/contracts/public-result.js";

export type RequestLifecycle = "idle" | "loading" | "completed" | "refused" | "failed";

export type SanitizedRequestFailure = {
  readonly code: "operation-failed";
  readonly diagnosticId: "diagnostic:runtime";
};

export type RequestState = {
  readonly lifecycle: RequestLifecycle;
  readonly refreshIdentity: number;
  readonly result?: PublicResult;
  readonly failure?: SanitizedRequestFailure;
};

export const initialRequestState: RequestState = { lifecycle: "idle", refreshIdentity: 0 };

const lifecycleByStatus = {
  completed: "completed",
  refused: "refused",
  unsupported: "refused",
  ambiguous: "refused",
  stale: "refused",
  "invalid-request": "refused",
  failed: "failed",
  "timed-out": "failed",
  cancelled: "failed",
} as const satisfies Record<PublicResult["status"], Exclude<RequestLifecycle, "idle" | "loading">>;

export const projectResult = (result: PublicResult, refreshIdentity: number): RequestState => ({
  lifecycle: lifecycleByStatus[result.status],
  refreshIdentity,
  result: result.version === "PublicResultV2" ? sanitizePublicResultV2(result) : result,
});

export const projectFailure = (refreshIdentity: number): RequestState => ({
  lifecycle: "failed",
  refreshIdentity,
  failure: { code: "operation-failed", diagnosticId: "diagnostic:runtime" },
});

export type RequestProjection = {
  readonly lifecycle: RequestLifecycle;
  readonly refreshIdentity: number;
  readonly result?: PublicResult;
  readonly failure?: SanitizedRequestFailure;
};

export const projectRequestState = (state: RequestState): RequestProjection => ({
  lifecycle: state.lifecycle,
  refreshIdentity: state.refreshIdentity,
  ...(state.result === undefined ? {} : { result: state.result }),
  ...(state.failure === undefined ? {} : { failure: state.failure }),
});
