export type CommandPolicyStatus = "draft" | "in-review" | "approved" | "rejected" | "deprecated" | "superseded";
export type CommandApprovalRole = "security" | "omarchy-native-capability";
export interface CommandApproval { readonly role: CommandApprovalRole; readonly reviewer: string; readonly decision: "approved" | "rejected"; readonly decidedAt: string; readonly signoffRef: string }
export interface CommandPolicyWindow { readonly effectiveFrom: string; readonly reviewBy: string; readonly supportedUntil: string }
export interface CommandEvidence {
  readonly source: "structural" | "fixture" | "native"; readonly fixture: boolean; readonly repository: string; readonly commitSha: string;
  readonly artifactSha256: string; readonly evidenceId: string; readonly context: string; readonly outputSha256: string;
  readonly observedAt: string; readonly freshUntil: string;
}
export interface CommandScope {
  readonly platform: "linux"; readonly architecture: string; readonly omarchyGeneration: "omarchy-3" | "omarchy-4";
  readonly observedOmarchyVersion: string; readonly provider: "omarchy"; readonly capabilityId: string; readonly variantId: string; readonly binaryIdentity: string;
}
export interface PositionalArgument { readonly name: string; readonly cardinality: "required" | "optional"; readonly canonicalization: "exact" | "lowercase"; readonly pattern: string }
export interface OptionArgument { readonly token: string; readonly kind: "flag" | "value"; readonly valuePattern?: string }
export interface CommandGrammar { readonly executable: string; readonly route: readonly string[]; readonly positionals: readonly PositionalArgument[]; readonly options: readonly OptionArgument[] }
export interface OmarchyCommandPolicyEntry {
  readonly id: string; readonly version: string; readonly status: CommandPolicyStatus; readonly owner: string; readonly preparer: string;
  readonly scope: CommandScope; readonly grammar: CommandGrammar; readonly privilege: "user" | "elevated";
  readonly prompt: "noninteractive" | "interactive"; readonly network: "forbidden" | "required"; readonly disclosure: "none" | "bounded";
  readonly sideEffect: "read-only" | "mutating"; readonly confirmation: "required" | "not-required";
  readonly rollbackRef: string; readonly reassessmentRef: string; readonly approvals: readonly CommandApproval[]; readonly evidence: readonly CommandEvidence[];
  readonly lifecycle: CommandPolicyWindow; readonly supersedes: readonly string[]; readonly supersededBy?: string; readonly conflictsWith: readonly string[];
}
export interface OmarchyCommandPolicyRegistry {
  readonly schemaVersion: "OmarchyCommandPolicyRegistryV1"; readonly id: string; readonly version: string; readonly status: CommandPolicyStatus;
  readonly owner: string; readonly preparer: string; readonly requiredApprovals: readonly CommandApprovalRole[]; readonly approvals: readonly CommandApproval[];
  readonly lifecycle: CommandPolicyWindow; readonly entries: readonly OmarchyCommandPolicyEntry[]; readonly digest: string;
}
export type CommandPolicyUnavailableReason = "registry-not-approved" | "integrity-invalid" | "policy-invalid" | "approval-invalid" |
  "provenance-invalid" | "native-evidence-invalid" | "entry-not-approved" | "scope-mismatch" | "argument-invalid" | "outside-window" | "ambiguous";
export type CommandPolicyResolution = { readonly available: true; readonly entry: OmarchyCommandPolicyEntry } |
  { readonly available: false; readonly reason: CommandPolicyUnavailableReason };

const statuses = ["draft", "in-review", "approved", "rejected", "deprecated", "superseded"] as const;
const roles = ["security", "omarchy-native-capability"] as const;
const sha = /^[a-f0-9]{64}$/; const signoff = /^sha256:[a-f0-9]{64}$/; const semver = /^\d+\.\d+\.\d+$/;
const observedVersion = /^3\.\d+\.\d+$/;
const scopeKeys: readonly (keyof CommandScope)[] = ["platform", "architecture", "omarchyGeneration", "observedOmarchyVersion", "provider", "capabilityId", "variantId", "binaryIdentity"];
const closed = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const canonical = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim();
const timestamp = (value: unknown): value is string => canonical(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (left: string, right: string) => left.trim() === right.trim();
const current = (window: CommandPolicyWindow, now: Date) => timestamp(window.effectiveFrom) && timestamp(window.reviewBy) && timestamp(window.supportedUntil)
  && Date.parse(window.effectiveFrom) <= now.getTime() && now.getTime() <= Date.parse(window.reviewBy) && now.getTime() <= Date.parse(window.supportedUntil);

export function canonicalCommandPolicyPayload(registry: OmarchyCommandPolicyRegistry): string {
  const { digest: _digest, ...payload } = registry; return canonicalize(payload);
}
export async function commandPolicyDigest(registry: OmarchyCommandPolicyRegistry): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCommandPolicyPayload(registry)); const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export async function validateCommandPolicyIntegrity(registry: OmarchyCommandPolicyRegistry): Promise<boolean> {
  return sha.test(registry.digest) && registry.digest === await commandPolicyDigest(registry);
}
export async function resolveOmarchyCommandPolicy(
  registry: OmarchyCommandPolicyRegistry, scope: CommandScope, argv: readonly string[], now: Date,
): Promise<CommandPolicyResolution> {
  if (registry.status !== "approved") return unavailable("registry-not-approved");
  if (!await validateCommandPolicyIntegrity(registry)) return unavailable("integrity-invalid");
  if (!validRegistry(registry)) return unavailable("policy-invalid");
  if (!validApprovals(registry.owner, registry.preparer, registry.requiredApprovals, registry.approvals)) return unavailable("approval-invalid");
  if (!current(registry.lifecycle, now)) return unavailable("outside-window");
  if (!validScope(scope)) return unavailable("scope-mismatch");
  const exact = registry.entries.filter((entry) => validScope(entry.scope) && scopeKeys.every((key) => entry.scope[key] === scope[key]));
  if (exact.length === 0) return unavailable("scope-mismatch");
  if (exact.length > 1 || exact.some((entry) => exact.some((other) => entry !== other && entry.conflictsWith.includes(other.id)))) return unavailable("ambiguous");
  const entry = exact[0]!;
  if (!validEntry(entry)) return unavailable("policy-invalid");
  if (entry.status !== "approved" || entry.supersededBy !== undefined) return unavailable("entry-not-approved");
  if (!validApprovals(entry.owner, entry.preparer, registry.requiredApprovals, entry.approvals)) return unavailable("approval-invalid");
  if (!validArguments(entry.grammar, argv)) return unavailable("argument-invalid");
  if (!current(entry.lifecycle, now)) return unavailable("outside-window");
  if (!entry.evidence.every(validProvenance)) return unavailable("provenance-invalid");
  if (!entry.evidence.some((evidence) => evidence.source === "native" && !evidence.fixture && timestamp(evidence.freshUntil) && now.getTime() <= Date.parse(evidence.freshUntil))) return unavailable("native-evidence-invalid");
  return { available: true, entry };
}

const unavailable = (reason: CommandPolicyUnavailableReason): CommandPolicyResolution => ({ available: false, reason });
const validRegistry = (registry: OmarchyCommandPolicyRegistry) => registry.schemaVersion === "OmarchyCommandPolicyRegistryV1" && canonical(registry.id)
  && semver.test(registry.version) && closed(statuses, registry.status) && canonical(registry.owner) && canonical(registry.preparer)
  && !same(registry.owner, registry.preparer) && registry.requiredApprovals.length === roles.length && roles.every((role) => registry.requiredApprovals.includes(role));
const validScope = (scope: CommandScope) => scope.platform === "linux" && closed(["omarchy-3", "omarchy-4"] as const, scope.omarchyGeneration)
  && scope.provider === "omarchy" && observedVersion.test(scope.observedOmarchyVersion) && scopeKeys.every((key) => canonical(scope[key]));
const validEntry = (entry: OmarchyCommandPolicyEntry) => canonical(entry.id) && semver.test(entry.version) && closed(statuses, entry.status)
  && canonical(entry.owner) && canonical(entry.preparer) && !same(entry.owner, entry.preparer) && validScope(entry.scope)
  && closed(["user", "elevated"] as const, entry.privilege) && closed(["noninteractive", "interactive"] as const, entry.prompt)
  && closed(["forbidden", "required"] as const, entry.network) && closed(["none", "bounded"] as const, entry.disclosure)
  && closed(["read-only", "mutating"] as const, entry.sideEffect) && closed(["required", "not-required"] as const, entry.confirmation)
  && entry.privilege === "user" && entry.prompt === "noninteractive" && entry.confirmation === "required" && canonical(entry.rollbackRef) && canonical(entry.reassessmentRef)
  && entry.supersedes.every(canonical) && entry.conflictsWith.every(canonical) && (entry.supersededBy === undefined || canonical(entry.supersededBy)) && validGrammar(entry.grammar);
const validApprovals = (owner: string, preparer: string, required: readonly CommandApprovalRole[], approvals: readonly CommandApproval[]) => approvals.length === required.length
  && required.every((role) => closed(roles, role) && approvals.some((approval) => approval.role === role && approval.decision === "approved"))
  && approvals.every((approval) => closed(roles, approval.role) && canonical(approval.reviewer) && approval.decision === "approved" && timestamp(approval.decidedAt)
    && signoff.test(approval.signoffRef) && !same(approval.reviewer, owner) && !same(approval.reviewer, preparer))
  && new Set(approvals.map((approval) => approval.reviewer)).size === approvals.length;
const validProvenance = (evidence: CommandEvidence) => closed(["structural", "fixture", "native"] as const, evidence.source)
  && canonical(evidence.repository) && sha.test(evidence.commitSha) && sha.test(evidence.artifactSha256) && canonical(evidence.evidenceId)
  && canonical(evidence.context) && sha.test(evidence.outputSha256) && timestamp(evidence.observedAt) && timestamp(evidence.freshUntil)
  && Date.parse(evidence.observedAt) <= Date.parse(evidence.freshUntil);
const validGrammar = (grammar: CommandGrammar) => canonical(grammar.executable) && grammar.route.every(canonical)
  && grammar.positionals.every((arg) => canonical(arg.name) && closed(["required", "optional"] as const, arg.cardinality)
    && closed(["exact", "lowercase"] as const, arg.canonicalization) && validPattern(arg.pattern))
  && grammar.options.every((option) => canonical(option.token) && option.token.startsWith("-") && closed(["flag", "value"] as const, option.kind)
    && (option.kind === "flag" ? option.valuePattern === undefined : validPattern(option.valuePattern)));
const validPattern = (pattern: unknown): pattern is string => { try { return canonical(pattern) && (new RegExp(pattern), true); } catch { return false; } };
const validArguments = (grammar: CommandGrammar, argv: readonly string[]) => {
  if (!argv.every(canonical) || argv[0] !== grammar.executable || grammar.route.some((part, index) => argv[index + 1] !== part)) return false;
  const tail = argv.slice(1 + grammar.route.length); const positional: string[] = []; const seen = new Set<string>();
  for (let index = 0; index < tail.length; index++) { const token = tail[index]!; if (!token.startsWith("-")) { positional.push(token); continue; }
    const option = grammar.options.find((candidate) => candidate.token === token); if (!option || seen.has(token)) return false; seen.add(token);
    if (option.kind === "value") { const value = tail[++index]; if (!canonical(value) || value.startsWith("-") || !new RegExp(option.valuePattern!).test(value)) return false; }
  }
  if (positional.length > grammar.positionals.length) return false;
  return grammar.positionals.every((definition, index) => { const value = positional[index]; if (value === undefined) return definition.cardinality === "optional";
    return new RegExp(definition.pattern).test(value) && (definition.canonicalization === "exact" || value === value.toLowerCase()); });
};
function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
