import type { OmarchyCommandPolicyRegistry } from "../../domain/omarchy-command-policy.js";

export const draftOmarchyCommandPolicy = {
  schemaVersion: "OmarchyCommandPolicyRegistryV1", id: "policy:omarchy-command-registry", version: "0.1.0", status: "draft",
  owner: "kattsushi", preparer: "workstation-policy-preparer", requiredApprovals: ["security", "omarchy-native-capability"], approvals: [],
  lifecycle: { effectiveFrom: "2026-08-06T00:00:00.000Z", reviewBy: "2026-09-06T00:00:00.000Z", supportedUntil: "2026-11-06T00:00:00.000Z" },
  entries: [], digest: "3b090d13d5735f22263d55a0c6c818443feed74e9a3408e5c0d26b4912ad0d52",
} as const satisfies OmarchyCommandPolicyRegistry;
