import {
  createProviderCommandPolicy, type ProviderCommandApproval, type ProviderCommandPolicyEntry,
  type ProviderCommandPolicyRegistry, type ProviderCommandPolicyResolution,
} from "./provider-command-policy.js";

export type HomebrewCommandApprovalRole = "security" | "homebrew-native-capability";
export interface HomebrewCommandApproval extends ProviderCommandApproval<HomebrewCommandApprovalRole> {}
export interface HomebrewCommandScope {
  readonly platform: "linux" | "macos"; readonly architecture: string; readonly distribution: "linuxbrew" | "homebrew-macos";
  readonly packageKind: "formula" | "cask"; readonly provider: "homebrew"; readonly capabilityId: "homebrew-formula" | "homebrew-cask";
  readonly observedHomebrewVersion: string; readonly binaryIdentity: string; readonly brewPrefix: string; readonly variantId: string;
}
export interface HomebrewCommandPolicyEntry extends ProviderCommandPolicyEntry<HomebrewCommandScope, HomebrewCommandApprovalRole> {}
export interface HomebrewCommandPolicyRegistry extends ProviderCommandPolicyRegistry<"HomebrewCommandPolicyRegistryV1", HomebrewCommandPolicyEntry, HomebrewCommandApprovalRole> {}
export type HomebrewCommandPolicyResolution = ProviderCommandPolicyResolution<HomebrewCommandPolicyEntry>;

const semver = /^\d+\.\d+\.\d+$/; const canonicalId = /^[a-z]+:[A-Za-z0-9._@+-]+$/;
const exact = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
const core = createProviderCommandPolicy({
  schemaVersion: "HomebrewCommandPolicyRegistryV1", reviewerRoles: ["security", "homebrew-native-capability"],
  scopeKeys: ["platform", "architecture", "distribution", "packageKind", "provider", "capabilityId", "observedHomebrewVersion", "binaryIdentity", "brewPrefix", "variantId"],
  validScope: (scope: HomebrewCommandScope) => scope.provider === "homebrew" && semver.test(scope.observedHomebrewVersion)
    && ["linux", "macos"].includes(scope.platform) && ["x86_64", "arm64"].includes(scope.architecture)
    && ["linuxbrew", "homebrew-macos"].includes(scope.distribution) && ["formula", "cask"].includes(scope.packageKind)
    && ["homebrew-formula", "homebrew-cask"].includes(scope.capabilityId) && scope.binaryIdentity === "brew"
    && ["/home/linuxbrew/.linuxbrew", "/opt/homebrew", "/usr/local"].includes(scope.brewPrefix) && canonicalId.test(scope.variantId),
  validRegistryVersion: (version: string) => semver.test(version), validEntryVersion: (version: string) => semver.test(version),
  validEntryRelationship: ({ scope, grammar }) => {
    const positional = grammar.positionals[0]; const formula = scope.packageKind === "formula";
    const prefixMatches = scope.platform === "linux" ? scope.distribution === "linuxbrew" && scope.brewPrefix === "/home/linuxbrew/.linuxbrew"
      : scope.distribution === "homebrew-macos" && ((scope.architecture === "arm64" && scope.brewPrefix === "/opt/homebrew") || (scope.architecture === "x86_64" && scope.brewPrefix === "/usr/local"));
    return grammar.executable === scope.binaryIdentity && scope.binaryIdentity === "brew" && exact(grammar.route, formula ? ["install"] : ["install", "--cask"])
      && grammar.positionals.length === 1 && positional?.name === scope.packageKind && positional.cardinality === "required"
      && !grammar.options.some((option) => option.token === "--cask") && prefixMatches
      && ((formula && scope.capabilityId === "homebrew-formula") || (!formula && scope.capabilityId === "homebrew-cask"));
  },
  evidenceContext: (entry: Pick<HomebrewCommandPolicyEntry, "scope" | "grammar">) => ({
    platform: entry.scope.platform, distribution: entry.scope.distribution, packageKind: entry.scope.packageKind, capabilityId: entry.scope.capabilityId,
  }),
});

export const homebrewCommandPolicyDigest = (registry: HomebrewCommandPolicyRegistry): Promise<string> => core.policyDigest(registry);
export const homebrewCommandEvidenceContextDigest = (entry: Pick<HomebrewCommandPolicyEntry, "scope" | "grammar">): Promise<string> => core.evidenceContextDigest(entry);
export const validateHomebrewCommandPolicyIntegrity = (registry: HomebrewCommandPolicyRegistry): Promise<boolean> => core.validateIntegrity(registry);
export const resolveHomebrewCommandPolicy = (registry: HomebrewCommandPolicyRegistry, scope: HomebrewCommandScope, argv: readonly string[], now: Date): Promise<HomebrewCommandPolicyResolution> => core.resolve(registry, scope, argv, now);
