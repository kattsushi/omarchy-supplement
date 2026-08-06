export type ProviderCommandPolicyStatus = "draft" | "in-review" | "approved" | "rejected" | "deprecated" | "superseded";
export interface ProviderCommandApproval<Role extends string> { readonly role: Role; readonly reviewer: string; readonly decision: "approved" | "rejected"; readonly decidedAt: string; readonly signoffRef: string }
export interface ProviderCommandPolicyWindow { readonly effectiveFrom: string; readonly reviewBy: string; readonly supportedUntil: string }
export interface ProviderCommandEvidence {
  readonly source: "structural" | "fixture" | "native"; readonly fixture: boolean; readonly repository: string; readonly commitSha: string;
  readonly artifactSha256: string; readonly evidenceId: string; readonly context: string; readonly outputSha256: string;
  readonly observedAt: string; readonly freshUntil: string;
}
export interface ProviderPositionalArgument { readonly name: string; readonly cardinality: "required" | "optional"; readonly canonicalization: "exact" | "lowercase"; readonly pattern: string }
export interface ProviderOptionArgument { readonly token: string; readonly kind: "flag" | "value"; readonly cardinality: "required" | "optional"; readonly valuePattern?: string }
export interface ProviderCommandGrammar { readonly executable: string; readonly route: readonly string[]; readonly positionals: readonly ProviderPositionalArgument[]; readonly options: readonly ProviderOptionArgument[] }
export interface ProviderCommandPolicyEntry<Scope, Role extends string> {
  readonly id: string; readonly version: string; readonly status: ProviderCommandPolicyStatus; readonly owner: string; readonly preparer: string;
  readonly scope: Scope; readonly grammar: ProviderCommandGrammar; readonly privilege: "user" | "elevated";
  readonly prompt: "noninteractive" | "interactive"; readonly network: "forbidden" | "required"; readonly disclosure: "none" | "bounded";
  readonly sideEffect: "read-only" | "mutating"; readonly confirmation: "required" | "not-required";
  readonly rollbackRef: string; readonly reassessmentRef: string; readonly approvals: readonly ProviderCommandApproval<Role>[]; readonly evidence: readonly ProviderCommandEvidence[];
  readonly lifecycle: ProviderCommandPolicyWindow; readonly supersedes: readonly string[]; readonly supersededBy?: string; readonly conflictsWith: readonly string[];
}
export interface ProviderCommandPolicyRegistry<SchemaVersion extends string, Entry, Role extends string> {
  readonly schemaVersion: SchemaVersion; readonly id: string; readonly version: string; readonly status: ProviderCommandPolicyStatus;
  readonly owner: string; readonly preparer: string; readonly requiredApprovals: readonly Role[]; readonly approvals: readonly ProviderCommandApproval<Role>[];
  readonly lifecycle: ProviderCommandPolicyWindow; readonly entries: readonly Entry[]; readonly digest: string;
}
export type ProviderCommandPolicyUnavailableReason = "registry-not-approved" | "integrity-invalid" | "policy-invalid" | "approval-invalid" |
  "provenance-invalid" | "native-evidence-invalid" | "entry-not-approved" | "scope-mismatch" | "argument-invalid" | "outside-window" | "ambiguous";
export type ProviderCommandPolicyResolution<Entry> = { readonly available: true; readonly entry: Entry } |
  { readonly available: false; readonly reason: ProviderCommandPolicyUnavailableReason };

type Entry<Scope, Role extends string> = ProviderCommandPolicyEntry<Scope, Role>;
type Registry<SchemaVersion extends string, Scope, Role extends string> = ProviderCommandPolicyRegistry<SchemaVersion, Entry<Scope, Role>, Role>;
export interface ProviderCommandPolicySpecialization<SchemaVersion extends string, Scope, Role extends string> {
  readonly schemaVersion: SchemaVersion; readonly reviewerRoles: readonly Role[]; readonly scopeKeys: readonly (keyof Scope & string)[];
  readonly validScope: (scope: Scope) => boolean; readonly validRegistryVersion: (version: string) => boolean; readonly validEntryVersion: (version: string) => boolean;
  readonly evidenceContext: (entry: Pick<Entry<Scope, Role>, "scope" | "grammar">) => unknown;
}

const statuses = ["draft", "in-review", "approved", "rejected", "deprecated", "superseded"] as const;
const sha = /^[a-f0-9]{64}$/; const signoff = /^sha256:[a-f0-9]{64}$/;
const closed = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const canonical = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim();
const timestamp = (value: unknown): value is string => canonical(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (left: string, right: string) => left.trim() === right.trim();
const validWindow = (window: ProviderCommandPolicyWindow) => timestamp(window.effectiveFrom) && timestamp(window.reviewBy) && timestamp(window.supportedUntil)
  && Date.parse(window.effectiveFrom) <= Date.parse(window.reviewBy) && Date.parse(window.reviewBy) <= Date.parse(window.supportedUntil);
const current = (window: ProviderCommandPolicyWindow, now: Date) => validWindow(window) && Date.parse(window.effectiveFrom) <= now.getTime()
  && now.getTime() <= Date.parse(window.reviewBy) && now.getTime() <= Date.parse(window.supportedUntil);

export function createProviderCommandPolicy<SchemaVersion extends string, Scope, Role extends string>(specialization: ProviderCommandPolicySpecialization<SchemaVersion, Scope, Role>) {
  type PolicyEntry = Entry<Scope, Role>; type PolicyRegistry = Registry<SchemaVersion, Scope, Role>;
  const canonicalPayload = (registry: PolicyRegistry): string => {
    if (!record(registry)) throw new TypeError("non-plain registry"); canonicalize(registry);
    const { digest: _digest, ...payload } = registry; return canonicalize(payload);
  };
  const policyDigest = (registry: PolicyRegistry) => digest(canonicalPayload(registry));
  const evidenceContextDigest = (entry: Pick<PolicyEntry, "scope" | "grammar">): Promise<string> => {
    if (!dataRecord(entry) || !Object.hasOwn(entry, "scope") || !Object.hasOwn(entry, "grammar")) throw new TypeError("non-plain entry");
    return digest(canonicalize(specialization.evidenceContext(entry)));
  };
  const validateIntegrity = async (registry: PolicyRegistry): Promise<boolean> => {
    try { const field = record(registry) ? Object.getOwnPropertyDescriptor(registry, "digest") : undefined;
      return field !== undefined && "value" in field && sha.test(field.value) && field.value === await policyDigest(registry); } catch { return false; }
  };
  const validScope = (scope: Scope) => dataRecord(scope) && Object.keys(scope).length === specialization.scopeKeys.length
    && specialization.scopeKeys.every((key) => canonical(scope[key])) && specialization.validScope(scope);
  const validRegistry = (registry: PolicyRegistry) => registry.schemaVersion === specialization.schemaVersion && canonical(registry.id)
    && specialization.validRegistryVersion(registry.version) && closed(statuses, registry.status) && canonical(registry.owner) && canonical(registry.preparer)
    && !same(registry.owner, registry.preparer) && registry.requiredApprovals.length === specialization.reviewerRoles.length
    && specialization.reviewerRoles.every((role) => registry.requiredApprovals.includes(role));
  const validApprovals = (owner: string, preparer: string, required: readonly Role[], approvals: readonly ProviderCommandApproval<Role>[]) => approvals.length === required.length
    && required.every((role) => closed(specialization.reviewerRoles, role) && approvals.some((approval) => approval.role === role && approval.decision === "approved"))
    && approvals.every((approval) => closed(specialization.reviewerRoles, approval.role) && canonical(approval.reviewer) && approval.decision === "approved" && timestamp(approval.decidedAt)
      && signoff.test(approval.signoffRef) && !same(approval.reviewer, owner) && !same(approval.reviewer, preparer))
    && new Set(approvals.map((approval) => approval.reviewer)).size === approvals.length;
  const validEntry = (entry: PolicyEntry) => canonical(entry.id) && specialization.validEntryVersion(entry.version) && closed(statuses, entry.status)
    && canonical(entry.owner) && canonical(entry.preparer) && !same(entry.owner, entry.preparer) && validScope(entry.scope)
    && closed(["user", "elevated"] as const, entry.privilege) && closed(["noninteractive", "interactive"] as const, entry.prompt)
    && closed(["forbidden", "required"] as const, entry.network) && closed(["none", "bounded"] as const, entry.disclosure)
    && closed(["read-only", "mutating"] as const, entry.sideEffect) && closed(["required", "not-required"] as const, entry.confirmation)
    && entry.privilege === "user" && entry.prompt === "noninteractive" && entry.confirmation === "required" && canonical(entry.rollbackRef) && canonical(entry.reassessmentRef)
    && entry.supersedes.every(canonical) && entry.conflictsWith.every(canonical) && (entry.supersededBy === undefined || canonical(entry.supersededBy)) && validGrammar(entry.grammar);
  const resolve = async (registry: PolicyRegistry, scope: Scope, argv: readonly string[], now: Date): Promise<ProviderCommandPolicyResolution<PolicyEntry>> => {
    try {
      if (!await validateIntegrity(registry)) return unavailable("integrity-invalid");
      registry = JSON.parse(canonicalPayload(registry)) as PolicyRegistry;
      if (registry.status !== "approved") return unavailable("registry-not-approved");
      if (!validRuntimeShape(registry) || !validRegistry(registry)) return unavailable("policy-invalid");
      if (!registry.entries.every((entry) => canonical(entry.id)) || new Set(registry.entries.map((entry) => entry.id)).size !== registry.entries.length) return unavailable("policy-invalid");
      if (!validApprovals(registry.owner, registry.preparer, registry.requiredApprovals, registry.approvals)) return unavailable("approval-invalid");
      if (!current(registry.lifecycle, now)) return unavailable("outside-window");
      if (!validScope(scope)) return unavailable("scope-mismatch");
      const exact = registry.entries.filter((entry) => validScope(entry.scope) && specialization.scopeKeys.every((key) => entry.scope[key] === scope[key]));
      if (exact.length === 0) return unavailable("scope-mismatch");
      if (exact.length > 1 || exact.some((entry) => exact.some((other) => entry !== other && entry.conflictsWith.includes(other.id)))) return unavailable("ambiguous");
      const entry = exact[0]!;
      if (!validEntry(entry)) return unavailable("policy-invalid");
      if (entry.status !== "approved" || entry.supersededBy !== undefined) return unavailable("entry-not-approved");
      if (!validApprovals(entry.owner, entry.preparer, registry.requiredApprovals, entry.approvals)) return unavailable("approval-invalid");
      if (!validArguments(entry.grammar, argv)) return unavailable("argument-invalid");
      if (!current(entry.lifecycle, now)) return unavailable("outside-window");
      if (!entry.evidence.every(validProvenance)) return unavailable("provenance-invalid");
      const context = await evidenceContextDigest(entry);
      if (!entry.evidence.some((evidence) => validNativeEvidence(evidence, entry, context, now))) return unavailable("native-evidence-invalid");
      return { available: true, entry };
    } catch { return unavailable("policy-invalid"); }
  };
  return { canonicalPayload, policyDigest, evidenceContextDigest, validateIntegrity, resolve };
}

const unavailable = <Entry>(reason: ProviderCommandPolicyUnavailableReason): ProviderCommandPolicyResolution<Entry> => ({ available: false, reason });
async function digest(payload: string): Promise<string> { const bytes = new TextEncoder().encode(payload); const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, "0")).join(""); }
const validProvenance = (evidence: ProviderCommandEvidence) => closed(["structural", "fixture", "native"] as const, evidence.source)
  && typeof evidence.fixture === "boolean" && canonical(evidence.repository) && sha.test(evidence.commitSha) && sha.test(evidence.artifactSha256) && canonical(evidence.evidenceId)
  && sha.test(evidence.context) && sha.test(evidence.outputSha256) && timestamp(evidence.observedAt) && timestamp(evidence.freshUntil)
  && Date.parse(evidence.observedAt) <= Date.parse(evidence.freshUntil);
const validNativeEvidence = <Scope, Role extends string>(evidence: ProviderCommandEvidence, entry: Entry<Scope, Role>, context: string, now: Date) => evidence.source === "native"
  && evidence.fixture === false && evidence.context === context && Date.parse(entry.lifecycle.effectiveFrom) <= Date.parse(evidence.observedAt)
  && Date.parse(evidence.observedAt) <= now.getTime() && now.getTime() <= Date.parse(evidence.freshUntil)
  && Date.parse(evidence.freshUntil) <= Date.parse(entry.lifecycle.reviewBy) && Date.parse(evidence.freshUntil) <= Date.parse(entry.lifecycle.supportedUntil);
const validGrammar = (grammar: ProviderCommandGrammar) => canonical(grammar.executable) && grammar.route.every(canonical)
  && grammar.positionals.every((arg) => canonical(arg.name) && closed(["required", "optional"] as const, arg.cardinality)
    && closed(["exact", "lowercase"] as const, arg.canonicalization) && validPattern(arg.pattern))
  && grammar.options.every((option) => canonical(option.token) && option.token.startsWith("-") && closed(["flag", "value"] as const, option.kind)
    && closed(["required", "optional"] as const, option.cardinality) && (option.kind === "flag" ? option.valuePattern === undefined : validPattern(option.valuePattern)))
  && new Set(grammar.positionals.map((argument) => argument.name)).size === grammar.positionals.length
  && new Set(grammar.options.map((option) => option.token)).size === grammar.options.length;
const validPattern = (pattern: unknown): pattern is string => { try { return canonical(pattern) && pattern.startsWith("^(?:") && pattern.endsWith(")$") && (new RegExp(pattern), true); } catch { return false; } };
const validArguments = (grammar: ProviderCommandGrammar, argv: readonly string[]) => {
  if (!denseArray(argv) || argv[0] !== grammar.executable || grammar.route.some((part, index) => argv[index + 1] !== part)) return false;
  const tail: string[] = []; for (let index = 0; index < argv.length; index++) { if (!canonical(argv[index])) return false; if (index > grammar.route.length) tail[tail.length] = argv[index]!; }
  const positional: string[] = []; const seen = new Set<string>();
  for (let index = 0; index < tail.length; index++) { const token = tail[index]!; if (!token.startsWith("-")) { positional.push(token); continue; }
    const option = grammar.options.find((candidate) => candidate.token === token); if (!option || seen.has(token)) return false; seen.add(token);
    if (option.kind === "value") { const value = tail[++index]; if (!canonical(value) || value.startsWith("-") || !new RegExp(option.valuePattern!).test(value)) return false; }
  }
  if (positional.length > grammar.positionals.length || grammar.options.some((option) => option.cardinality === "required" && !seen.has(option.token))) return false;
  return grammar.positionals.every((definition, index) => { const value = positional[index]; if (value === undefined) return definition.cardinality === "optional";
    return new RegExp(definition.pattern).test(value) && (definition.canonicalization === "exact" || value === value.toLowerCase()); });
};
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const dataRecord = (value: unknown): value is Record<string, unknown> => { if (!record(value)) return false; const keys = Object.keys(value); const fields = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => fields[key]?.enumerable && "value" in fields[key]!); };
const denseArray = (value: unknown): value is readonly unknown[] => { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value).filter((key) => key !== "length"); const fields = Object.getOwnPropertyDescriptors(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index) && fields[String(index)]?.enumerable && "value" in fields[String(index)]!); };
const recordArray = (value: unknown) => denseArray(value) && value.every(record);
const validRuntimeShape = (registry: unknown): registry is Registry<string, unknown, string> => record(registry) && record(registry.lifecycle)
  && denseArray(registry.requiredApprovals) && recordArray(registry.approvals) && recordArray(registry.entries)
  && registry.entries.every((entry) => record(entry) && record(entry.scope) && record(entry.grammar) && record(entry.lifecycle)
    && denseArray(entry.grammar.route) && recordArray(entry.grammar.positionals) && recordArray(entry.grammar.options)
    && recordArray(entry.approvals) && recordArray(entry.evidence) && denseArray(entry.supersedes) && denseArray(entry.conflictsWith));
function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("non-JSON value"); ancestors.add(value);
  try { if (Array.isArray(value)) { if (!denseArray(value)) throw new TypeError("non-dense array"); return `[${value.map((item) => canonicalize(item, ancestors)).join(",")}]`; }
    if (!dataRecord(value)) throw new TypeError("non-plain object"); const keys = Object.keys(value);
    return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`).join(",")}}`;
  } finally { ancestors.delete(value); }
}
