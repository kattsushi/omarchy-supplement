import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import { PlatformFacts, PlatformFactsPort, ProviderDiscoveryPort } from "../../application/ports/workstation.js";

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

const generationByMajor: Partial<Record<number, "omarchy-3" | "omarchy-4">> = {
  3: "omarchy-3",
  4: "omarchy-4",
};

const classifyOmarchyVersions = (versions: readonly number[]) => Match.value(versions).pipe(
  Match.when((values) => values.length > 1, () => ({ generation: "ambiguous" as const, summaryCode: "conflicting" })),
  Match.when((values) => values.length === 0, () => ({ generation: "unknown" as const, summaryCode: "malformed" })),
  Match.orElse(([major]) => ({
    generation: generationByMajor[major!] ?? "unknown" as const,
    summaryCode: Match.value(major! > 4).pipe(
      Match.when(true, () => "future"),
      Match.orElse(() => "known"),
    ),
  })),
);

const unavailableOmarchyObservation = (kind: Exclude<OmarchyFixture["kind"], "observed">): PlatformFacts => ({
  platform: "unknown", generation: "unknown", observationDigest: `fixture:omarchy:${kind}`,
  evidence: evidence(`evidence:omarchy:${kind}`, "omarchy-unavailable", kind, "unknown"),
});

export const parseOmarchyObservation = (input: OmarchyFixture) => Match.value(input).pipe(
  Match.when({ kind: "observed" }, ({ output }) => {
    const versions = [...output.matchAll(/Omarchy\s+(\d+)\.(\d+)(?:\.\d+)?/gi)].map((match) => Number(match[1]));
    const { generation, summaryCode } = classifyOmarchyVersions([...new Set(versions)]);
    return {
      platform: Match.value(generation).pipe(
        Match.when("omarchy-3", () => "linux" as const),
        Match.when("omarchy-4", () => "linux" as const),
        Match.orElse(() => "unknown" as const),
      ),
      generation,
      observationDigest: `fixture:omarchy:${summaryCode}`,
      evidence: evidence(`evidence:omarchy:${summaryCode}`, "omarchy-generation", summaryCode, "linux"),
    };
  }),
  Match.orElse(({ kind }) => unavailableOmarchyObservation(kind)),
);

export const fixturePlatformFactsLayer = (input: OmarchyFixture) => Layer.succeed(PlatformFactsPort, {
  facts: Effect.succeed(parseOmarchyObservation(input)),
});

const homebrewCapabilities = {
  formula: { kind: "homebrew-formula" as const, commandPolicyId: "fixture-only" },
  cask: { kind: "homebrew-cask" as const, commandPolicyId: "fixture-only" },
};

const homebrewStatus = {
  present: { availability: "present" as const, observedVersion: "fixture" },
  missing: { availability: "missing" as const, observedVersion: "unknown" },
  unsupported: { availability: "missing" as const, observedVersion: "unknown" },
} as const;

export const parseHomebrewObservation = (input: HomebrewFixture) => {
  const capabilities = Match.value({ kind: input.kind, platform: input.platform }).pipe(
    Match.when({ kind: "present", platform: "macos" }, () => Object.entries(homebrewCapabilities).flatMap(([prefix, capability]) => input.packages.some((value) => value.startsWith(`${prefix}:`)) ? [capability] : [])),
    Match.orElse(() => []),
  );
  return {
    provider: "homebrew" as const,
    ...homebrewStatus[input.kind],
    capabilities,
    evidence: evidence(`evidence:homebrew:${input.kind}`, "homebrew-observation", input.kind, input.platform),
  };
};

const missingProvider = (provider: "omarchy" | "homebrew") => ({ provider, availability: "missing" as const, observedVersion: "unknown" as const, capabilities: [], evidence: [] });

export const fixtureHomebrewDiscoveryLayer = (input: HomebrewFixture) => Layer.succeed(ProviderDiscoveryPort, {
  discover: (provider) => Match.value(provider).pipe(
    Match.when("homebrew", () => Effect.succeed(parseHomebrewObservation(input))),
    Match.orElse(() => Effect.succeed(missingProvider(provider))),
  ),
});
