import {
  createProviderCommandPolicy, type ProviderCommandApproval, type ProviderCommandEvidence, type ProviderCommandGrammar,
  type ProviderCommandPolicyEntry, type ProviderCommandPolicyRegistry, type ProviderCommandPolicyResolution,
  type ProviderCommandPolicyStatus, type ProviderCommandPolicyUnavailableReason, type ProviderCommandPolicyWindow,
  type ProviderOptionArgument, type ProviderPositionalArgument,
} from "./provider-command-policy.js";

export type CommandPolicyStatus = ProviderCommandPolicyStatus;
export type CommandApprovalRole = "security" | "omarchy-native-capability";
/** Reviewer identity authenticity is established outside this pure registry contract. */
export interface CommandApproval extends ProviderCommandApproval<CommandApprovalRole> {}
export interface CommandPolicyWindow extends ProviderCommandPolicyWindow {}
export interface CommandEvidence extends ProviderCommandEvidence {}
export interface CommandScope { readonly platform: "linux"; readonly architecture: string; readonly omarchyGeneration: "omarchy-3" | "omarchy-4"; readonly observedOmarchyVersion: string; readonly provider: "omarchy"; readonly capabilityId: string; readonly variantId: string; readonly binaryIdentity: string }
export interface PositionalArgument extends ProviderPositionalArgument {}
export interface OptionArgument extends ProviderOptionArgument {}
export interface CommandGrammar extends ProviderCommandGrammar {}
export interface OmarchyCommandPolicyEntry extends ProviderCommandPolicyEntry<CommandScope, CommandApprovalRole> {}
export interface OmarchyCommandPolicyRegistry extends ProviderCommandPolicyRegistry<"OmarchyCommandPolicyRegistryV1", OmarchyCommandPolicyEntry, CommandApprovalRole> {}
export type CommandPolicyUnavailableReason = ProviderCommandPolicyUnavailableReason;
export type CommandPolicyResolution = ProviderCommandPolicyResolution<OmarchyCommandPolicyEntry>;

const semver = /^\d+\.\d+\.\d+$/; const observedVersion = /^3\.\d+\.\d+$/;
const core = createProviderCommandPolicy({
  schemaVersion: "OmarchyCommandPolicyRegistryV1", reviewerRoles: ["security", "omarchy-native-capability"],
  scopeKeys: ["platform", "architecture", "omarchyGeneration", "observedOmarchyVersion", "provider", "capabilityId", "variantId", "binaryIdentity"],
  validScope: (scope: CommandScope) => scope.platform === "linux" && ["omarchy-3", "omarchy-4"].includes(scope.omarchyGeneration)
    && scope.provider === "omarchy" && observedVersion.test(scope.observedOmarchyVersion),
  validRegistryVersion: (version: string) => semver.test(version), validEntryVersion: (version: string) => semver.test(version),
  evidenceContext: (_entry: Pick<OmarchyCommandPolicyEntry, "scope" | "grammar">) => ({}),
});

export const canonicalCommandPolicyPayload = (registry: OmarchyCommandPolicyRegistry): string => core.canonicalPayload(registry);
export const commandPolicyDigest = (registry: OmarchyCommandPolicyRegistry): Promise<string> => core.policyDigest(registry);
export const commandEvidenceContextDigest = (entry: Pick<OmarchyCommandPolicyEntry, "scope" | "grammar">): Promise<string> => core.evidenceContextDigest(entry);
export const validateCommandPolicyIntegrity = (registry: OmarchyCommandPolicyRegistry): Promise<boolean> => core.validateIntegrity(registry);
export const resolveOmarchyCommandPolicy = (registry: OmarchyCommandPolicyRegistry, scope: CommandScope, argv: readonly string[], now: Date): Promise<CommandPolicyResolution> =>
  core.resolve(registry, scope, argv, now);
