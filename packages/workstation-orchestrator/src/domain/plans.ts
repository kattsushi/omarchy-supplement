import type { ProviderId, ProviderRole, SafeNextAction, TypedBlocker } from "./states";

export interface PlanBindingV1 {
  readonly schemaVersion: "PlanBindingV1"; readonly operation: "package-acquisition" | "configuration-apply";
  readonly logicalRequestIds: readonly string[]; readonly platformObservationDigest: string; readonly profilePolicyDigest: string;
  readonly provider: ProviderId; readonly providerRole: ProviderRole; readonly providerPolicy: { readonly id: string; readonly version: string };
  readonly capabilityId: string; readonly mappingIds: readonly string[]; readonly packageStateDigests: readonly string[];
  readonly verificationPolicyId: string; readonly riskCodes: readonly string[]; readonly fallbackOptIn: boolean;
}
export type PlanBindingInput = Omit<PlanBindingV1, "schemaVersion">;
export interface BoundPlan { readonly planId: string; readonly binding: PlanBindingV1; readonly digest: string; }
export interface ConfirmationRecord { readonly confirmationId: string; readonly planId: string; readonly bindingDigest: string; readonly expiresAt: string; readonly replayPolicy: "single-use" | "not-replayable"; }
export interface PackagePlan { readonly plan: BoundPlan; readonly blockers: readonly TypedBlocker[]; readonly nextActions: readonly SafeNextAction[]; readonly acquisitionDoesNotVerifyConfiguration: true; readonly acquisitionDoesNotVerifyDotfileStow: true; }

export function normalizePlanBinding(input: PlanBindingInput): PlanBindingV1 {
  return { ...input, schemaVersion: "PlanBindingV1", logicalRequestIds: [...input.logicalRequestIds].sort(), mappingIds: [...input.mappingIds].sort(), packageStateDigests: [...input.packageStateDigests].sort(), riskCodes: [...input.riskCodes].sort() };
}
export function canonicalPlanBindingJson(binding: PlanBindingV1): string { return canonicalize(binding); }
export async function createPlanBinding(input: PlanBindingInput): Promise<BoundPlan> {
  const binding = normalizePlanBinding(input); const digest = await sha256(canonicalPlanBindingJson(binding));
  return { binding, digest, planId: `plan:${digest}` };
}
export async function isPlanBindingCurrent(plan: BoundPlan, current: PlanBindingInput): Promise<boolean> { return plan.digest === (await createPlanBinding(current)).digest; }
function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
