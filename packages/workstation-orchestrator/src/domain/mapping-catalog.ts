import * as Schema from "effect/Schema";
import type { SafePackageMapping } from "../application/ports/workstation.js";
import { OmarchyGeneration, Platform, ProviderId, ProviderRole, type ProgramId } from "./states.js";

export type MappingCatalogStatus = "draft" | "in-review" | "approved" | "rejected" | "deprecated" | "superseded";
export type MappingApprovalRole = "security" | "provider-policy";

export interface MappingApproval {
  readonly role: MappingApprovalRole;
  readonly approver: string;
  readonly decision: "approved" | "rejected";
  readonly decidedAt: string;
  readonly signoffRef: string;
}

export interface MappingProvenance {
  readonly repository: string;
  readonly commitSha: string;
  readonly artifactSha256: string;
  readonly fixture: boolean;
}

export interface MappingLifecycle {
  readonly effectiveFrom: string;
  readonly reviewBy: string;
  readonly supportedUntil: string;
}

export interface MappingCatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly status: MappingCatalogStatus;
  readonly owner: string;
  readonly preparer?: string;
  readonly scope: {
    readonly programId: ProgramId;
    readonly platform: Platform;
    readonly architecture: string;
    readonly omarchyGeneration: OmarchyGeneration;
    readonly provider: ProviderId;
    readonly providerVersion: string;
    readonly providerRole: ProviderRole;
    readonly capabilityId: string;
  };
  readonly safety: "candidate" | "reviewed-safe" | "unsafe";
  readonly mapping: SafePackageMapping;
  readonly approvals: readonly MappingApproval[];
  readonly provenance?: MappingProvenance;
  readonly lifecycle: MappingLifecycle;
  readonly supersedes: readonly string[];
  readonly supersededBy?: string;
}

export interface MappingCatalog {
  readonly schemaVersion: "MappingCatalogV1";
  readonly version: string;
  readonly status: MappingCatalogStatus;
  readonly owner: string;
  readonly requiredApprovals: readonly MappingApprovalRole[];
  readonly provenance?: MappingProvenance;
  readonly lifecycle: MappingLifecycle;
  readonly entries: readonly MappingCatalogEntry[];
  readonly digest: string;
}

export type MappingCatalogUnavailableReason =
  | "catalog-not-approved"
  | "integrity-invalid"
  | "catalog-policy-invalid"
  | "entry-not-approved"
  | "approval-invalid"
  | "provenance-invalid"
  | "scope-mismatch"
  | "outside-support-window"
  | "ambiguous";

export type MappingCatalogResolution =
  | { readonly available: true; readonly entry: MappingCatalogEntry }
  | { readonly available: false; readonly reason: MappingCatalogUnavailableReason };

const sha256Pattern = /^[a-f0-9]{64}$/;
const immutableSignoffPattern = /^sha256:[a-f0-9]{64}$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+$/;
const requiredApprovalRoles = ["security", "provider-policy"] as const;
const scopeKeys: readonly (keyof MappingCatalogEntry["scope"])[] = [
  "programId", "platform", "architecture", "omarchyGeneration", "provider", "providerVersion", "providerRole", "capabilityId",
];

export function canonicalMappingCatalogPayload(catalog: MappingCatalog): string {
  const { digest: _digest, ...payload } = catalog;
  return canonicalize(payload);
}

export async function mappingCatalogDigest(catalog: MappingCatalog): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMappingCatalogPayload(catalog));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function validateMappingCatalogIntegrity(catalog: MappingCatalog): Promise<boolean> {
  return sha256Pattern.test(catalog.digest) && catalog.digest === await mappingCatalogDigest(catalog);
}

export async function resolveMappingCatalogEntry(
  catalog: MappingCatalog,
  scope: MappingCatalogEntry["scope"],
  now: Date,
): Promise<MappingCatalogResolution> {
  if (catalog.status !== "approved") return unavailable("catalog-not-approved");
  if (!await validateMappingCatalogIntegrity(catalog)) return unavailable("integrity-invalid");
  if (!semanticVersionPattern.test(catalog.version) || !hasRequiredRoles(catalog.requiredApprovals)) return unavailable("catalog-policy-invalid");
  if (!validProvenance(catalog.provenance)) return unavailable("provenance-invalid");
  if (!current(catalog.lifecycle, now)) return unavailable("outside-support-window");

  if (!validScope(scope)) return unavailable("scope-mismatch");
  const exact = catalog.entries.filter((entry) => validScope(entry.scope)
    && scopeKeys.every((key) => entry.scope[key] === scope[key]));
  if (exact.length === 0) return unavailable("scope-mismatch");

  const eligible = exact.filter((entry) => entry.status === "approved"
    && entry.safety === "reviewed-safe" && entry.supersededBy === undefined
    && semanticVersionPattern.test(entry.version) && validApprovals(catalog, entry)
    && validProvenance(entry.provenance) && current(entry.lifecycle, now));
  if (eligible.length > 1) return unavailable("ambiguous");
  if (eligible.length === 1) return { available: true, entry: eligible[0]! };

  const entry = exact[0]!;
  if (entry.status !== "approved" || entry.safety !== "reviewed-safe" || entry.supersededBy !== undefined) return unavailable("entry-not-approved");
  if (!validApprovals(catalog, entry)) return unavailable("approval-invalid");
  if (!validProvenance(entry.provenance)) return unavailable("provenance-invalid");
  return unavailable("outside-support-window");
}

const unavailable = (reason: MappingCatalogUnavailableReason): MappingCatalogResolution => ({ available: false, reason });
const hasRequiredRoles = (roles: readonly MappingApprovalRole[]) => roles.length === 2
  && requiredApprovalRoles.every((role) => roles.includes(role));
const validProvenance = (value?: MappingProvenance) => value !== undefined && !value.fixture
  && canonicalNonblank(value.repository) && sha256Pattern.test(value.commitSha) && sha256Pattern.test(value.artifactSha256);
const validApprovals = (catalog: MappingCatalog, entry: MappingCatalogEntry) => {
  const approvals = requiredApprovalRoles.map((role) => entry.approvals.find((approval) => approval.role === role && approval.decision === "approved"));
  return canonicalNonblank(catalog.owner) && canonicalNonblank(entry.owner)
    && (entry.preparer === undefined || canonicalNonblank(entry.preparer)) && entry.approvals.length === requiredApprovalRoles.length
    && approvals.every((approval) => approval !== undefined && canonicalNonblank(approval.approver)
      && !sameIdentity(approval.approver, entry.owner) && !sameIdentity(approval.approver, entry.preparer) && !sameIdentity(approval.approver, catalog.owner)
      && immutableSignoffPattern.test(approval.signoffRef) && validIsoTimestamp(approval.decidedAt))
    && new Set(approvals.map((approval) => approval?.approver)).size === requiredApprovalRoles.length;
};
const nonblank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const canonicalNonblank = (value: unknown): value is string => nonblank(value) && value === value.trim();
const sameIdentity = (left: string, right?: string) => right !== undefined && left.trim() === right.trim();
const validIsoTimestamp = (value: unknown) => nonblank(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validScope = (scope: MappingCatalogEntry["scope"]) => scopeKeys.every((key) => nonblank(scope[key]))
  && Schema.is(Platform)(scope.platform) && Schema.is(OmarchyGeneration)(scope.omarchyGeneration)
  && Schema.is(ProviderId)(scope.provider) && Schema.is(ProviderRole)(scope.providerRole);
const current = (window: MappingLifecycle, now: Date) => {
  const effective = Date.parse(window.effectiveFrom);
  const review = Date.parse(window.reviewBy);
  const supported = Date.parse(window.supportedUntil);
  return [effective, review, supported].every(Number.isFinite) && effective <= now.getTime()
    && now.getTime() <= review && now.getTime() <= supported;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
