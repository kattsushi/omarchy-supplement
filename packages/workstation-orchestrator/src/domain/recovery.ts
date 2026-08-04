import type { BackupState, SafeNextAction } from "./states";

export interface BackupVisibility { readonly backupId: string; readonly state: BackupState; readonly identityEvidenceIds: readonly string[]; readonly integrityEvidenceIds: readonly string[]; readonly nextAction: SafeNextAction; }
export interface ManualRestoreInput {
  readonly identityVerified: boolean;
  readonly integrityVerified: boolean;
  readonly identityEvidenceIds: readonly string[];
  readonly integrityEvidenceIds: readonly string[];
}

type RestorePolicy = Pick<BackupVisibility, "state" | "nextAction">;
type VerificationKey = `${boolean}:${boolean}`;

const restorePolicies = {
  "true:true": { state: "eligible-for-manual-restore", nextAction: { kind: "follow-manual-guidance", reasonCode: "manual-restore-only" } },
  "true:false": { state: "verification-failed", nextAction: { kind: "reassess", reasonCode: "backup-verification-required" } },
  "false:true": { state: "verification-failed", nextAction: { kind: "reassess", reasonCode: "backup-verification-required" } },
  "false:false": { state: "verification-failed", nextAction: { kind: "reassess", reasonCode: "backup-verification-required" } },
} satisfies Record<VerificationKey, RestorePolicy>;

export function manualRestoreEligibility(input: ManualRestoreInput): BackupVisibility {
  const policy = restorePolicies[`${input.identityVerified}:${input.integrityVerified}`];
  return {
    backupId: "backup:unresolved",
    ...policy,
    identityEvidenceIds: [...input.identityEvidenceIds],
    integrityEvidenceIds: [...input.integrityEvidenceIds],
  };
}
