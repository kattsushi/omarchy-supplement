import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { PlatformFacts, PlatformFactsPort, ProviderDiscoveryPort } from "../../application/ports/workstation.js";
import { ProviderObservation } from "../../domain/providers.js";

export const OmarchyFixture = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("observed"), output: Schema.String }),
  Schema.Struct({ kind: Schema.Literals(["missing", "timeout", "truncated"]) }),
]);
export type OmarchyFixture = typeof OmarchyFixture.Type;

export const HomebrewFixture = Schema.Struct({
  platform: Schema.Literals(["linux", "macos", "unknown"]),
  kind: Schema.Literals(["present", "missing", "unsupported"]),
  packages: Schema.Array(Schema.String),
});
export type HomebrewFixture = typeof HomebrewFixture.Type;

const evidence = (id: string, claim: string, summaryCode: string, platformContext: string) => [{
  evidenceId: id, subjectId: "platform:fixture", claim, strength: "fixture" as const,
  sourceContract: "fixture-only", sourceVersion: "1", platformContext, summaryCode,
}];

export function parseOmarchyObservation(input: OmarchyFixture): PlatformFacts {
  if (input.kind !== "observed") return {
    platform: "unknown", generation: "unknown", observationDigest: `fixture:omarchy:${input.kind}`,
    evidence: evidence(`evidence:omarchy:${input.kind}`, "omarchy-unavailable", input.kind, "unknown"),
  };
  const versions = [...input.output.matchAll(/Omarchy\s+(\d+)\.(\d+)(?:\.\d+)?/gi)].map((match) => Number(match[1]));
  const unique = [...new Set(versions)];
  const generation = unique.length > 1 ? "ambiguous" : unique[0] === 3 ? "omarchy-3" : unique[0] === 4 ? "omarchy-4" : "unknown";
  const summaryCode = unique.length > 1 ? "conflicting" : unique.length === 0 ? "malformed" : unique[0]! > 4 ? "future" : "known";
  return {
    platform: generation === "unknown" || generation === "ambiguous" ? "unknown" : "linux",
    generation,
    observationDigest: `fixture:omarchy:${summaryCode}`,
    evidence: evidence(`evidence:omarchy:${summaryCode}`, "omarchy-generation", summaryCode, "linux"),
  };
}

export const fixturePlatformFactsLayer = (input: OmarchyFixture) => Layer.succeed(PlatformFactsPort, {
  facts: Effect.succeed(parseOmarchyObservation(input)),
});

export function parseHomebrewObservation(input: HomebrewFixture): ProviderObservation {
  const capabilities = input.kind !== "present" || input.platform !== "macos" ? [] : [
    ...(input.packages.some((value) => value.startsWith("formula:")) ? [{ kind: "homebrew-formula" as const, commandPolicyId: "fixture-only" }] : []),
    ...(input.packages.some((value) => value.startsWith("cask:")) ? [{ kind: "homebrew-cask" as const, commandPolicyId: "fixture-only" }] : []),
  ];
  return {
    provider: "homebrew",
    availability: input.kind === "present" ? "present" : "missing",
    observedVersion: input.kind === "present" ? "fixture" : "unknown",
    capabilities,
    evidence: evidence(`evidence:homebrew:${input.kind}`, "homebrew-observation", input.kind, input.platform),
  };
}

export const fixtureHomebrewDiscoveryLayer = (input: HomebrewFixture) => Layer.succeed(ProviderDiscoveryPort, {
  discover: (provider) => provider === "homebrew"
    ? Effect.succeed(parseHomebrewObservation(input))
    : Effect.succeed({ provider, availability: "missing" as const, observedVersion: "unknown" as const, capabilities: [], evidence: [] }),
});
