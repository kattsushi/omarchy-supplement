import { Match, Schema } from "effect";
import { BackupStateSchema, SafeNextActionSchema, type BackupState, type SafeNextAction } from "./states";

export const BackupVisibilitySchema = Schema.Struct({
  backupId: Schema.String,
  state: BackupStateSchema,
  identityEvidenceIds: Schema.Array(Schema.String),
  integrityEvidenceIds: Schema.Array(Schema.String),
  nextAction: SafeNextActionSchema,
});
export interface BackupVisibility {
  readonly backupId: string;
  readonly state: BackupState;
  readonly identityEvidenceIds: readonly string[];
  readonly integrityEvidenceIds: readonly string[];
  readonly nextAction: SafeNextAction;
}

export const ManualRestoreInputSchema = Schema.Struct({
  identityVerified: Schema.Boolean,
  integrityVerified: Schema.Boolean,
  identityEvidenceIds: Schema.Array(Schema.String),
  integrityEvidenceIds: Schema.Array(Schema.String),
});
export type ManualRestoreInput = Schema.Schema.Type<typeof ManualRestoreInputSchema>;

type RestorePolicy = Pick<BackupVisibility, "state" | "nextAction">;
const verificationFailed: RestorePolicy = {
  state: "verification-failed",
  nextAction: { kind: "reassess", reasonCode: "backup-verification-required" },
};

export function manualRestoreEligibility(input: ManualRestoreInput): BackupVisibility {
  const policy = Match.value(input).pipe(
    Match.when({ identityVerified: true, integrityVerified: true }, (): RestorePolicy => ({
      state: "eligible-for-manual-restore",
      nextAction: { kind: "follow-manual-guidance", reasonCode: "manual-restore-only" },
    })),
    Match.orElse(() => verificationFailed),
  );
  return {
    backupId: "backup:unresolved",
    ...policy,
    identityEvidenceIds: [...input.identityEvidenceIds],
    integrityEvidenceIds: [...input.integrityEvidenceIds],
  };
}
