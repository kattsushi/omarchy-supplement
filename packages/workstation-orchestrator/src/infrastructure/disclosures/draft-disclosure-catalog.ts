import type { DisclosureCatalog } from "../../domain/disclosure-catalog.js";

export const draftDisclosureCatalog = {
  schemaVersion: "DisclosureCatalogV1", id: "catalog:workstation-disclosures", version: "0.1.0", status: "draft",
  owner: "identity:kattsushi", preparer: "identity:kattsushi", requiredApprovals: [], approvals: [],
  lifecycle: { effectiveFrom: "2026-08-06T00:00:00.000Z", reviewBy: "2026-09-06T00:00:00.000Z", supportedUntil: "2026-11-06T00:00:00.000Z" },
  requiredCategories: [], entries: [], digest: "fcaf4f38aaa5aa8a61333387e76837c426e66977beccaf1a577dc94df49a587d",
} as const satisfies DisclosureCatalog;
