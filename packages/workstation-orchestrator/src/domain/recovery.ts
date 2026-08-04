import type { BackupState, SafeNextAction } from "./states";
export interface BackupVisibility { readonly backupId: string; readonly state: BackupState; readonly identityEvidenceIds: readonly string[]; readonly integrityEvidenceIds: readonly string[]; readonly nextAction: SafeNextAction; }
export function manualRestoreEligibility(input: { readonly identityVerified: boolean; readonly integrityVerified: boolean }): BackupVisibility {
  const eligible = input.identityVerified && input.integrityVerified;
  return { backupId: "backup:unresolved", state: eligible ? "eligible-for-manual-restore" : "verification-failed", identityEvidenceIds: [], integrityEvidenceIds: [], nextAction: { kind: eligible ? "follow-manual-guidance" : "reassess", reasonCode: eligible ? "manual-restore-only" : "backup-verification-required" } };
}
