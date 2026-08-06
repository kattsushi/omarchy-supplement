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

const semver = /^\d+\.\d+\.\d+$/; const canonicalId = /^[a-z]+:[A-Za-z0-9._@+-]+$/; const prefix = /^\/(?:[A-Za-z0-9._+-]+\/?)+$/;
const core = createProviderCommandPolicy({
  schemaVersion: "HomebrewCommandPolicyRegistryV1", reviewerRoles: ["security", "homebrew-native-capability"],
  scopeKeys: ["platform", "architecture", "distribution", "packageKind", "provider", "capabilityId", "observedHomebrewVersion", "binaryIdentity", "brewPrefix", "variantId"],
  validScope: (scope: HomebrewCommandScope) => scope.provider === "homebrew" && semver.test(scope.observedHomebrewVersion)
    && canonicalId.test(scope.architecture) && canonicalId.test(scope.binaryIdentity) && canonicalId.test(scope.variantId) && prefix.test(scope.brewPrefix)
    && ((scope.platform === "linux" && scope.distribution === "linuxbrew") || (scope.platform === "macos" && scope.distribution === "homebrew-macos"))
    && ((scope.packageKind === "formula" && scope.capabilityId === "homebrew-formula") || (scope.packageKind === "cask" && scope.capabilityId === "homebrew-cask")),
  validRegistryVersion: (version: string) => semver.test(version), validEntryVersion: (version: string) => semver.test(version),
  evidenceContext: (entry: Pick<HomebrewCommandPolicyEntry, "scope" | "grammar">) => ({
    platform: entry.scope.platform, distribution: entry.scope.distribution, packageKind: entry.scope.packageKind, capabilityId: entry.scope.capabilityId,
  }),
});

export const homebrewCommandPolicyDigest = (registry: HomebrewCommandPolicyRegistry): Promise<string> => core.policyDigest(registry);
export const homebrewCommandEvidenceContextDigest = (entry: Pick<HomebrewCommandPolicyEntry, "scope" | "grammar">): Promise<string> => core.evidenceContextDigest(entry);
export const validateHomebrewCommandPolicyIntegrity = (registry: HomebrewCommandPolicyRegistry): Promise<boolean> => core.validateIntegrity(registry);
export const resolveHomebrewCommandPolicy = (registry: HomebrewCommandPolicyRegistry, scope: HomebrewCommandScope, argv: readonly string[], now: Date): Promise<HomebrewCommandPolicyResolution> => core.resolve(registry, scope, argv, now);
