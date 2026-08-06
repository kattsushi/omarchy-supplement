import * as Effect from "effect/Effect";
import { ObservationUnavailable, type PackageMappingPortShape } from "../../application/ports/workstation.js";
import { resolveMappingCatalogEntry, type MappingCatalog } from "../../domain/mapping-catalog.js";
import type { ProviderId, ProviderRole } from "../../domain/states.js";

export function makeCatalogMappingPort(
  catalog: MappingCatalog,
  providerRole: (provider: ProviderId) => ProviderRole,
  now: () => Date,
): PackageMappingPortShape {
  return {
    map: (programId, provider) => Effect.tryPromise({
      try: async () => {
        const result = await resolveMappingCatalogEntry(catalog, { programId, provider, providerRole: providerRole(provider) }, now());
        if (!result.available) throw result.reason;
        return result.entry.mapping;
      },
      catch: (cause) => new ObservationUnavailable({ subject: "mapping", reasonCode: typeof cause === "string" ? cause : "catalog-unavailable" }),
    }),
  };
}
