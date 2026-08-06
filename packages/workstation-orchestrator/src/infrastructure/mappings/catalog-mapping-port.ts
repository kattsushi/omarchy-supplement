import * as Effect from "effect/Effect";
import { ObservationUnavailable, type PackageMappingPortShape } from "../../application/ports/workstation.js";
import { resolveMappingCatalogEntry, type MappingCatalog, type MappingCatalogEntry } from "../../domain/mapping-catalog.js";
import type { ProviderId } from "../../domain/states.js";

export type CatalogMappingContext = Omit<MappingCatalogEntry["scope"], "programId" | "provider">;

export function makeCatalogMappingPort(
  catalog: MappingCatalog,
  context: (provider: ProviderId) => CatalogMappingContext,
  now: () => Date,
): PackageMappingPortShape {
  return {
    map: (programId, provider) => Effect.tryPromise({
      try: async () => {
        const result = await resolveMappingCatalogEntry(catalog, { ...context(provider), programId, provider }, now());
        if (!result.available) throw result.reason;
        return result.entry.mapping;
      },
      catch: (cause) => new ObservationUnavailable({ subject: "mapping", reasonCode: typeof cause === "string" ? cause : "catalog-unavailable" }),
    }),
  };
}
