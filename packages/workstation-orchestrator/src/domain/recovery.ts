import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { BackupState, SafeNextAction } from "./states.js";

export const BackupVisibility = Schema.Struct({
  backupId: Schema.String,
  targetId: Schema.optional(Schema.String),
  state: BackupState,
  identityEvidenceIds: Schema.Array(Schema.String),
  integrityEvidenceIds: Schema.Array(Schema.String),
  nextAction: SafeNextAction,
});
export type BackupVisibility = typeof BackupVisibility.Type;

export type ManualRestoreGuidance = {
  readonly backupId: string;
  readonly targetId: string;
  readonly eligible: boolean;
  readonly manualOnly: true;
  readonly prerequisites: readonly string[];
  readonly steps: readonly string[];
  readonly checks: readonly string[];
  readonly stopConditions: readonly string[];
};

export const manualRestoreGuidance = (backup: BackupVisibility): ManualRestoreGuidance => {
  const eligible = backup.state === "eligible-for-manual-restore" || backup.state === "verified" && backup.identityEvidenceIds.length > 0 && backup.integrityEvidenceIds.length > 0;
  return {
    backupId: backup.backupId,
    targetId: backup.targetId ?? "target:unresolved",
    eligible,
    manualOnly: true,
    prerequisites: eligible ? ["identity-verified", "integrity-verified"] : ["independent-verification-required"],
    steps: eligible ? ["consult-authoritative-runbook", "perform-user-owned-step"] : [],
    checks: ["reassess-after-manual-restore"],
    stopConditions: eligible ? ["stop-on-mismatch-or-ambiguity"] : ["backup-verification-required"],
  };
};

export const ManualRestoreInput = Schema.Struct({
  identityVerified: Schema.Boolean,
  integrityVerified: Schema.Boolean,
  identityEvidenceIds: Schema.Array(Schema.String),
  integrityEvidenceIds: Schema.Array(Schema.String),
});
export type ManualRestoreInput = typeof ManualRestoreInput.Type;

type RestorePolicy = Pick<BackupVisibility, "state" | "nextAction">;
const verificationFailed: RestorePolicy = {
  state: "verification-failed",
  nextAction: { kind: "reassess", reasonCode: "backup-verification-required" },
};

export class ManualRestoreRefused extends Data.TaggedError("ManualRestoreRefused")<{
  readonly backup: BackupVisibility;
}> {}

export function manualRestoreEligibility(input: ManualRestoreInput) {
  const policy = Match.value(input).pipe(
    Match.when({ identityVerified: true, integrityVerified: true }, () => ({
      state: "eligible-for-manual-restore",
      nextAction: { kind: "follow-manual-guidance", reasonCode: "manual-restore-only" },
    } satisfies RestorePolicy)),
    Match.orElse(() => verificationFailed),
  );
  return {
    backupId: "backup:unresolved",
    ...policy,
    identityEvidenceIds: [...input.identityEvidenceIds],
    integrityEvidenceIds: [...input.integrityEvidenceIds],
  };
}

export function validateManualRestore(backup: BackupVisibility) {
  return backup.state === "eligible-for-manual-restore"
    ? Result.succeed(backup)
    : Result.fail(new ManualRestoreRefused({ backup }));
}
