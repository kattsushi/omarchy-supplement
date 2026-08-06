import type { HomebrewCommandPolicyRegistry } from "../../domain/homebrew-command-policy.js";

export const draftHomebrewCommandPolicy = {
  schemaVersion: "HomebrewCommandPolicyRegistryV1", id: "policy:homebrew-command-registry", version: "0.1.0", status: "draft",
  owner: "kattsushi", preparer: "", requiredApprovals: [], approvals: [],
  lifecycle: { effectiveFrom: "2026-08-06T00:00:00.000Z", reviewBy: "2026-09-06T00:00:00.000Z", supportedUntil: "2026-11-06T00:00:00.000Z" },
  entries: [], digest: "f5647a8585020c581d3c96140d93075e2c6504ce174c58f333b69106037b25f0",
} as const satisfies HomebrewCommandPolicyRegistry;
