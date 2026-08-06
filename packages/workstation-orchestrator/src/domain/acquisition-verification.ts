export type VerificationStatus = "draft" | "in-review" | "approved" | "rejected" | "deprecated" | "superseded";
export type VerificationRole = "evidence-owner" | "independent-verification-reviewer";
export interface VerificationApproval { readonly role: VerificationRole; readonly reviewer: string; readonly decision: "approved" | "rejected"; readonly decidedAt: string; readonly subjectDigest: string; readonly signoffRef: string }
export interface VerificationWindow { readonly effectiveFrom: string; readonly reviewBy: string; readonly supportedUntil: string }
export interface VerificationScope { readonly provider: "omarchy" | "homebrew"; readonly capabilityId: string; readonly platform: "linux" | "macos"; readonly architecture: "x86_64" | "arm64"; readonly providerVersion: string; readonly packageKind: "package" | "formula" | "cask" }
export interface VerificationBinding {
  readonly planId: string; readonly requestId: string; readonly planBindingDigest: string; readonly commandDigest: string;
  readonly providerPolicyDigest: string; readonly mappingCatalogDigest: string; readonly mappingEntryDigest: string; readonly verificationPolicyDigest: string;
}
export interface VerificationObservation {
  readonly id: string; readonly phase: "pre" | "post"; readonly observer: string; readonly planId: string; readonly requestId: string;
  readonly scopeDigest: string; readonly verificationPolicyDigest: string; readonly observedAt: string; readonly freshUntil: string; readonly source: "native" | "fixture" | "structural";
  readonly fixture: boolean; readonly provenanceRef: string; readonly provenanceDigest: string; readonly artifactSha256: string; readonly outputSha256: string; readonly sizeBytes: number;
  readonly packageState: "absent" | "present"; readonly packageId: string; readonly version: string; readonly location: string;
}
export interface AcquisitionVerificationEntry {
  readonly id: string; readonly version: string; readonly status: VerificationStatus; readonly owner: string; readonly preparer: string;
  readonly approvals: readonly VerificationApproval[]; readonly lifecycle: VerificationWindow; readonly supersedes: readonly string[];
  readonly supersededBy: string; readonly conflictsWith: readonly string[]; readonly scope: VerificationScope; readonly binding: VerificationBinding;
  readonly observations: readonly VerificationObservation[]; readonly requestedPackageIds: readonly string[]; readonly observedPackageIds: readonly string[];
  readonly expectedVersion: string; readonly observedVersion: string; readonly installationLocation: string; readonly sideEffects: readonly ("none" | "package-installed" | "package-updated" | "package-removed" | "unknown")[];
  readonly outcome: "success" | "partial" | "failure" | "unknown"; readonly completeness: number; readonly completenessThreshold: number;
  readonly evidenceCeilingBytes: number; readonly timedOut: boolean; readonly truncated: boolean; readonly providerDisagreement: boolean;
  readonly indeterminateWrites: boolean; readonly ambiguous: boolean; readonly reassessmentRequired: boolean; readonly retryEligible: boolean;
  readonly retryBudget: number; readonly automaticRollback: false; readonly guidanceRef: string; readonly recoveryRef: string;
  readonly auditId: string; readonly replayId: string; readonly retention: "ephemeral" | "bounded"; readonly privacy: "sanitized"; readonly sanitizationRef: string;
}
export interface AcquisitionVerificationRegistry {
  readonly schemaVersion: "AcquisitionVerificationRegistryV1"; readonly id: string; readonly version: string; readonly status: VerificationStatus;
  readonly owner: string; readonly preparer: string; readonly requiredApprovals: readonly VerificationRole[]; readonly approvals: readonly VerificationApproval[];
  readonly lifecycle: VerificationWindow; readonly entries: readonly AcquisitionVerificationEntry[]; readonly digest: string;
}
export type VerificationRequest = { readonly scope: VerificationScope; readonly binding: VerificationBinding; readonly expectedPackageIds: readonly string[]; readonly expectedVersion: string; readonly expectedLocation: string };
export type VerificationResolution = { readonly available: false; readonly structurallyEligible: true; readonly reason: "independent-verification-required"; readonly authenticity: "not-established"; readonly authority: "trusted-external-verifier-required"; readonly entry: AcquisitionVerificationEntry } |
  { readonly available: false; readonly structurallyEligible: false; readonly reason: "integrity-invalid" | "registry-not-approved" | "policy-invalid" | "approval-invalid" | "outside-window" | "scope-mismatch" | "ambiguous" | "entry-not-approved" | "evidence-invalid" | "non-success" };

const statuses = ["draft", "in-review", "approved", "rejected", "deprecated", "superseded"] as const;
const roles = ["evidence-owner", "independent-verification-reviewer"] as const;
const sha = /^[a-f0-9]{64}$/; const signoff = /^sha256:[a-f0-9]{64}$/; const semver = /^\d+\.\d+\.\d+$/; const id = /^[a-z][a-z0-9-]*:[a-z0-9._+-]+$/; const identity = /^identity:[a-z0-9._+-]+$/; const evidenceId = /^evidence:[a-z0-9._+-]+$/; const provenance = /^provenance:[a-z0-9._+-]+$/;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim();
const closed = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const time = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => data(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const same = (left: object, right: object) => Object.keys(left).every((key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]);
const current = (window: VerificationWindow, now: Date) => validWindow(window) && Date.parse(window.effectiveFrom) <= now.getTime() && now.getTime() <= Date.parse(window.reviewBy) && now.getTime() <= Date.parse(window.supportedUntil);
const validWindow = (value: VerificationWindow) => exact(value, ["effectiveFrom", "reviewBy", "supportedUntil"]) && time(value.effectiveFrom) && time(value.reviewBy) && time(value.supportedUntil)
  && Date.parse(value.effectiveFrom) <= Date.parse(value.reviewBy) && Date.parse(value.reviewBy) <= Date.parse(value.supportedUntil);
const validApprovals = (owner: string, preparer: string, approvals: readonly VerificationApproval[], subjectDigest: string) => dense(approvals) && approvals.length === roles.length
  && roles.every((role) => approvals.some((approval) => approval.role === role && approval.decision === "approved"))
  && approvals.every((approval) => exact(approval, ["role", "reviewer", "decision", "decidedAt", "subjectDigest", "signoffRef"]) && closed(roles, approval.role)
    && identity.test(approval.reviewer) && approval.decision === "approved" && time(approval.decidedAt) && approval.subjectDigest === subjectDigest && signoff.test(approval.signoffRef)
    && approval.reviewer !== owner && approval.reviewer !== preparer)
  && new Set(approvals.map((approval) => approval.reviewer)).size === approvals.length;
const validScope = (value: VerificationScope) => exact(value, ["provider", "capabilityId", "platform", "architecture", "providerVersion", "packageKind"])
  && closed(["omarchy", "homebrew"] as const, value.provider) && text(value.capabilityId) && closed(["linux", "macos"] as const, value.platform)
  && closed(["x86_64", "arm64"] as const, value.architecture) && semver.test(value.providerVersion) && closed(["package", "formula", "cask"] as const, value.packageKind);
const bindingKeys = ["planId", "requestId", "planBindingDigest", "commandDigest", "providerPolicyDigest", "mappingCatalogDigest", "mappingEntryDigest", "verificationPolicyDigest"] as const;
const validBinding = (value: VerificationBinding) => exact(value, bindingKeys) && id.test(value.planId) && id.test(value.requestId) && bindingKeys.slice(2).every((key) => sha.test(value[key]));
const validObservation = (value: VerificationObservation, entry: AcquisitionVerificationEntry, scopeDigest: string, now: Date) => exact(value, ["id", "phase", "observer", "planId", "requestId", "scopeDigest", "verificationPolicyDigest", "observedAt", "freshUntil", "source", "fixture", "provenanceRef", "provenanceDigest", "artifactSha256", "outputSha256", "sizeBytes", "packageState", "packageId", "version", "location"])
  && evidenceId.test(value.id) && closed(["pre", "post"] as const, value.phase) && identity.test(value.observer) && value.observer !== entry.owner && value.observer !== entry.preparer
  && value.planId === entry.binding.planId && value.requestId === entry.binding.requestId && value.scopeDigest === scopeDigest && value.verificationPolicyDigest === entry.binding.verificationPolicyDigest
  && time(value.observedAt) && time(value.freshUntil) && Date.parse(value.observedAt) <= now.getTime() && now.getTime() <= Date.parse(value.freshUntil)
  && Date.parse(entry.lifecycle.effectiveFrom) <= Date.parse(value.observedAt) && Date.parse(value.freshUntil) <= Date.parse(entry.lifecycle.reviewBy) && Date.parse(value.freshUntil) <= Date.parse(entry.lifecycle.supportedUntil)
  && closed(["native", "fixture", "structural"] as const, value.source) && typeof value.fixture === "boolean" && value.fixture === (value.source !== "native")
  && provenance.test(value.provenanceRef) && sha.test(value.provenanceDigest) && sha.test(value.artifactSha256) && sha.test(value.outputSha256) && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes > 0
  && closed(["absent", "present"] as const, value.packageState) && text(value.packageId) && text(value.version) && text(value.location);
const entryKeys = ["id", "version", "status", "owner", "preparer", "approvals", "lifecycle", "supersedes", "supersededBy", "conflictsWith", "scope", "binding", "observations", "requestedPackageIds", "observedPackageIds", "expectedVersion", "observedVersion", "installationLocation", "sideEffects", "outcome", "completeness", "completenessThreshold", "evidenceCeilingBytes", "timedOut", "truncated", "providerDisagreement", "indeterminateWrites", "ambiguous", "reassessmentRequired", "retryEligible", "retryBudget", "automaticRollback", "guidanceRef", "recoveryRef", "auditId", "replayId", "retention", "privacy", "sanitizationRef"] as const;
const validEntry = (entry: AcquisitionVerificationEntry, scopeDigest: string, now: Date) => exact(entry, entryKeys) && id.test(entry.id) && semver.test(entry.version) && closed(statuses, entry.status)
  && identity.test(entry.owner) && (entry.preparer === "" || identity.test(entry.preparer)) && entry.owner !== entry.preparer && dense(entry.approvals) && validWindow(entry.lifecycle)
  && dense(entry.supersedes) && entry.supersedes.every(id.test.bind(id)) && (entry.supersededBy === "" || id.test(entry.supersededBy)) && dense(entry.conflictsWith) && entry.conflictsWith.every(id.test.bind(id))
  && validScope(entry.scope) && validBinding(entry.binding) && dense(entry.observations) && entry.observations.length === 2
  && entry.observations.every((observation) => validObservation(observation, entry, scopeDigest, now)) && new Set(entry.observations.map((observation) => observation.phase)).size === 2
  && new Set(entry.observations.map((observation) => observation.id)).size === 2 && entry.observations[0]!.observer !== entry.observations[1]!.observer
  && Date.parse(entry.observations.find((observation) => observation.phase === "pre")!.observedAt) < Date.parse(entry.observations.find((observation) => observation.phase === "post")!.observedAt)
  && arrays(entry.requestedPackageIds, text) && arrays(entry.observedPackageIds, text)
  && arrays(entry.sideEffects, (value) => closed(["none", "package-installed", "package-updated", "package-removed", "unknown"] as const, value)) && closed(["success", "partial", "failure", "unknown"] as const, entry.outcome)
  && [entry.completeness, entry.completenessThreshold].every((value) => typeof value === "number" && value >= 0 && value <= 1)
  && Number.isSafeInteger(entry.evidenceCeilingBytes) && entry.evidenceCeilingBytes >= 0 && [entry.timedOut, entry.truncated, entry.providerDisagreement, entry.indeterminateWrites, entry.ambiguous, entry.reassessmentRequired, entry.retryEligible].every((value) => typeof value === "boolean")
  && Number.isSafeInteger(entry.retryBudget) && entry.retryBudget >= 0 && entry.automaticRollback === false && [entry.guidanceRef, entry.recoveryRef, entry.auditId, entry.replayId, entry.sanitizationRef].every(id.test.bind(id))
  && closed(["ephemeral", "bounded"] as const, entry.retention) && entry.privacy === "sanitized" && current(entry.lifecycle, now);

export async function acquisitionVerificationDigest(registry: AcquisitionVerificationRegistry): Promise<string> { try { const { digest: _digest, ...payload } = registry; return await hash(canonical(payload)); } catch { return ""; } }
export async function acquisitionVerificationApprovalSubjectDigest(subject: unknown): Promise<string> { try { return await hash(canonical(withoutApprovalFields(subject))); } catch { return ""; } }
export async function validateAcquisitionVerificationIntegrity(registry: AcquisitionVerificationRegistry): Promise<boolean> { try { return data(registry) && sha.test(registry.digest) && registry.digest === await acquisitionVerificationDigest(registry); } catch { return false; } }
export async function resolveAcquisitionVerification(registry: AcquisitionVerificationRegistry, request: VerificationRequest, now: Date): Promise<VerificationResolution> { try {
  if (!await validateAcquisitionVerificationIntegrity(registry)) return no("integrity-invalid");
  if (registry.status !== "approved") return no("registry-not-approved");
  if (!validRegistry(registry)) return no("policy-invalid");
  if (!validApprovals(registry.owner, registry.preparer, registry.approvals, await acquisitionVerificationApprovalSubjectDigest(registry))) return no("approval-invalid");
  if (!current(registry.lifecycle, now)) return no("outside-window");
  if (!exact(request, ["scope", "binding", "expectedPackageIds", "expectedVersion", "expectedLocation"]) || !validScope(request.scope) || !validBinding(request.binding)
    || !arrays(request.expectedPackageIds, text) || request.expectedPackageIds.length !== 1 || !text(request.expectedVersion) || !text(request.expectedLocation)) return no("scope-mismatch");
  if (["id", "auditId", "replayId"].some((key) => new Set(registry.entries.map((entry) => entry[key as "id"])).size !== registry.entries.length)
    || new Set(registry.entries.flatMap((entry) => Array.isArray(entry.observations) ? entry.observations.map((observation) => observation.id) : [])).size !== registry.entries.reduce((count, entry) => count + (Array.isArray(entry.observations) ? entry.observations.length : 0), 0)) return no("policy-invalid");
  const matches = registry.entries.filter((entry) => data(entry.scope) && data(entry.binding) && same(entry.scope, request.scope) && same(entry.binding, request.binding));
  if (matches.length === 0) return no("scope-mismatch"); if (matches.length !== 1 || matches.some((entry) => matches.some((other) => entry !== other && entry.conflictsWith.includes(other.id)))) return no("ambiguous");
  const entry = matches[0]!; const scopeDigest = await acquisitionVerificationApprovalSubjectDigest(entry.scope); if (!validEntry(entry, scopeDigest, now)) return no("policy-invalid"); if (entry.status !== "approved" || entry.supersededBy !== "") return no("entry-not-approved");
  if (!validApprovals(entry.owner, entry.preparer, entry.approvals, await acquisitionVerificationApprovalSubjectDigest(entry))) return no("approval-invalid");
  const bytes = entry.observations.reduce((total, observation) => total + observation.sizeBytes, 0);
  const pre = entry.observations.find((observation) => observation.phase === "pre")!; const post = entry.observations.find((observation) => observation.phase === "post")!;
  const governance: readonly (readonly [string, string])[] = [[registry.owner, "product-policy-owner"], [entry.owner, "product-policy-owner"], ...[registry.preparer, entry.preparer].filter(Boolean).map((identity) => [identity, "preparer"] as const), ...[...registry.approvals, ...entry.approvals].map((approval) => [approval.reviewer, approval.role] as const)];
  const roleSets = new Map<string, Set<string>>(); for (const [identity, role] of governance) roleSets.set(identity, (roleSets.get(identity) ?? new Set()).add(role));
  if ([...roleSets.values()].some((assigned) => assigned.size !== 1) || [pre.observer, post.observer].some((identity) => roleSets.has(identity)) || pre.provenanceRef === post.provenanceRef
    || new Set([pre.provenanceDigest, pre.artifactSha256, pre.outputSha256, post.provenanceDigest, post.artifactSha256, post.outputSha256]).size !== 6) return no("evidence-invalid");
  if (entry.outcome !== "success" || entry.timedOut || entry.truncated || entry.providerDisagreement || entry.indeterminateWrites || entry.ambiguous || entry.reassessmentRequired
    || entry.retryEligible || entry.retryBudget !== 0 || entry.conflictsWith.length > 0 || entry.sideEffects.length !== 1 || entry.sideEffects[0] !== "package-installed" || entry.completeness !== 1
    || entry.completenessThreshold <= 0 || entry.completeness < entry.completenessThreshold || entry.evidenceCeilingBytes <= 0 || bytes > entry.evidenceCeilingBytes
    || entry.requestedPackageIds.length !== 1 || entry.requestedPackageIds.length !== entry.observedPackageIds.length || entry.requestedPackageIds.some((item, index) => item !== entry.observedPackageIds[index])
    || entry.requestedPackageIds.length !== request.expectedPackageIds.length || entry.requestedPackageIds.some((item, index) => item !== request.expectedPackageIds[index])
    || pre.packageState !== "absent" || pre.packageId !== entry.requestedPackageIds[0] || pre.version !== "absent" || pre.location !== "absent"
    || post.packageState !== "present" || post.packageId !== entry.observedPackageIds[0] || post.version !== entry.observedVersion || post.location !== entry.installationLocation
    || entry.expectedVersion !== request.expectedVersion || entry.observedVersion !== entry.expectedVersion || entry.installationLocation !== request.expectedLocation) return no("non-success");
  return { available: false, structurallyEligible: true, reason: "independent-verification-required", authenticity: "not-established", authority: "trusted-external-verifier-required", entry };
} catch { return no("policy-invalid"); } }

const registryKeys = ["schemaVersion", "id", "version", "status", "owner", "preparer", "requiredApprovals", "approvals", "lifecycle", "entries", "digest"] as const;
const validRegistry = (registry: AcquisitionVerificationRegistry) => exact(registry, registryKeys) && registry.schemaVersion === "AcquisitionVerificationRegistryV1" && id.test(registry.id)
  && semver.test(registry.version) && closed(statuses, registry.status) && identity.test(registry.owner) && (registry.preparer === "" || identity.test(registry.preparer)) && registry.owner !== registry.preparer
  && dense(registry.requiredApprovals) && registry.requiredApprovals.length === roles.length && roles.every((role) => registry.requiredApprovals.includes(role))
  && dense(registry.approvals) && validWindow(registry.lifecycle) && dense(registry.entries) && registry.entries.every(data);
const no = (reason: Exclude<VerificationResolution, { structurallyEligible: true }>["reason"]): VerificationResolution => ({ available: false, structurallyEligible: false, reason });
const arrays = <T>(value: readonly T[], valid: (item: T) => boolean) => dense(value) && value.every(valid);
const data = (value: unknown): value is Record<string, unknown> => { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value); const fields = Object.getOwnPropertyDescriptors(value); return Reflect.ownKeys(value).length === keys.length && keys.every((key) => fields[key]?.enumerable && "value" in fields[key]!); };
const dense = (value: unknown): boolean => { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false; const keys = Reflect.ownKeys(value).filter((key) => key !== "length"); const fields = Object.getOwnPropertyDescriptors(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index) && fields[String(index)]?.enumerable && "value" in fields[String(index)]!); };
function canonical(value: unknown, seen = new Set<object>()): string { if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (typeof value !== "object" || seen.has(value)) throw new TypeError("non-canonical value"); seen.add(value); try { if (Array.isArray(value)) { if (!dense(value)) throw new TypeError("non-canonical array"); return `[${value.map((item) => canonical(item, seen)).join(",")}]`; }
    if (!data(value)) throw new TypeError("non-canonical record"); return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], seen)}`).join(",")}}`; } finally { seen.delete(value); } }
function withoutApprovalFields(value: unknown): unknown { if (Array.isArray(value)) { if (!dense(value)) throw new TypeError("non-canonical array"); return value.map(withoutApprovalFields); }
  if (value !== null && typeof value === "object") { if (!data(value)) throw new TypeError("non-canonical record"); return Object.fromEntries(Object.keys(value).filter((key) => !["approvals", "subjectDigest", "signoffRef", "digest"].includes(key)).map((key) => [key, withoutApprovalFields(value[key])])); } return value; }
async function hash(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
