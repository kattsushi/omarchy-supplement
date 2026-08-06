import type { MappingCatalog } from "../../domain/mapping-catalog.js";

export const draftMappingCatalog = {
  schemaVersion: "MappingCatalogV1",
  version: "0.1.0",
  status: "draft",
  owner: "kattsushi",
  requiredApprovals: ["security", "provider-policy"],
  lifecycle: {
    effectiveFrom: "2026-08-05T00:00:00.000Z",
    reviewBy: "2026-09-05T00:00:00.000Z",
    supportedUntil: "2026-11-05T00:00:00.000Z",
  },
  entries: [],
  digest: "e0b522b38d1d446433d551ff08c8dc1dcd6c5f43aa97a1d521c99f8ab7ac60de",
} as const satisfies MappingCatalog;
