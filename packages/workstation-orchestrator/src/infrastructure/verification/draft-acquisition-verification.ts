import type { AcquisitionVerificationRegistry } from "../../domain/acquisition-verification.js";

export const draftAcquisitionVerification = {
  schemaVersion: "AcquisitionVerificationRegistryV1", id: "policy:acquisition-verification-registry", version: "0.1.0", status: "draft",
  owner: "kattsushi", preparer: "", requiredApprovals: [], approvals: [], lifecycle: { effectiveFrom: "2026-08-06T00:00:00.000Z", reviewBy: "2026-09-06T00:00:00.000Z", supportedUntil: "2026-11-06T00:00:00.000Z" }, entries: [],
  digest: "b5c3a134ff2f06457f41dffef4e90f75ca2add3a72ddb4634fcdc0cb06dc6022",
} as const satisfies AcquisitionVerificationRegistry;
