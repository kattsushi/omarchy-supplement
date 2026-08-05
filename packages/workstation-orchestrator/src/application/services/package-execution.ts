import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { canonicalPlanBindingJson, ConfirmationId, type ConfirmationRecord, type PackagePlan } from "../../domain/plans.js";
import {
  AcquisitionVerificationPort,
  HomebrewExecutionPort,
  OmarchyExecutionPort,
  PackageExecutionClockPort,
  PackageExecutionObservationPort,
  PackageExecutionPolicyPort,
  type HomebrewCommand,
  type HomebrewPackagePlan,
  type OmarchyCommand,
  type OmarchyPackagePlan,
  type ProviderExecutionReport,
} from "../ports/package-execution.js";

export const confirmationTtlMs = 5 * 60 * 1_000;

export type PackageRiskAcknowledgements = {
  readonly network: boolean;
  readonly privilege: boolean;
  readonly prompts: boolean;
  readonly sideEffects: boolean;
  readonly noAutomaticRollback: boolean;
};

export type AcquisitionOutcome =
  | { readonly kind: "provider-reported" | "independently-verified" | "unverifiable" | "partial"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: boolean }
  | { readonly kind: "failed"; readonly reason: "exit" | "spawn"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: true }
  | { readonly kind: "timed-out" | "malformed"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: true };

export class PackageExecutionRefused extends Data.TaggedError("PackageExecutionRefused")<{
  readonly code: "confirmation-declined" | "confirmation-absent" | "confirmation-expired" | "confirmation-replayed" | "confirmation-mismatch" | "single-package-required" | "package-mapping-missing" | "fallback-not-opted-in" | "plan-not-executable" | "plan-stale";
}> {}

type StoredConfirmation = ConfirmationRecord & {
  readonly expiresAtMs: number;
  readonly bindingJson: string;
  consumed: boolean;
};

const refuse = (code: PackageExecutionRefused["code"]) => new PackageExecutionRefused({ code });
const evidence = (values: readonly string[]) => [...values].slice(0, 8);
const allAcknowledged = (value: PackageRiskAcknowledgements) => Object.values(value).every((item) => item === true);

const validatePlan = (plan: PackagePlan) => {
  if (plan.plan.binding.operation !== "package-acquisition" || plan.blockers.length > 0) return refuse("plan-not-executable");
  if (plan.plan.binding.logicalRequestIds.length !== 1 || plan.plan.binding.packageStateDigests.length !== 1) return refuse("single-package-required");
  if (plan.plan.binding.mappingIds.length !== 1) return refuse("package-mapping-missing");
  if (plan.plan.binding.provider === "homebrew" && plan.plan.binding.providerRole === "fallback" && !plan.plan.binding.fallbackOptIn) return refuse("fallback-not-opted-in");
  return undefined;
};

const finalOutcome = (report: Exclude<ProviderExecutionReport, { readonly kind: "provider-reported" }>): AcquisitionOutcome => ({
  ...report,
  evidenceIds: evidence(report.evidenceIds),
  reassessmentRequired: true,
});

export class ExecutePackagePlan extends Context.Service<ExecutePackagePlan, {
  readonly confirm: (request: { readonly plan: PackagePlan; readonly acknowledgements: PackageRiskAcknowledgements }) => Effect.Effect<ConfirmationRecord, PackageExecutionRefused>;
  readonly execute: (request: { readonly plan: PackagePlan; readonly confirmationId: typeof ConfirmationId.Type }) => Effect.Effect<AcquisitionOutcome, PackageExecutionRefused | import("../ports/package-execution.js").PackageExecutionUnavailable>;
}>()("ExecutePackagePlan", {
  make: Effect.gen(function*() {
    const clock = yield* PackageExecutionClockPort;
    const observations = yield* PackageExecutionObservationPort;
    const policies = yield* PackageExecutionPolicyPort;
    const omarchy = yield* OmarchyExecutionPort;
    const homebrew = yield* HomebrewExecutionPort;
    const verification = yield* AcquisitionVerificationPort;
    const confirmations = new Map<string, StoredConfirmation>();

    const confirm = (request: { readonly plan: PackagePlan; readonly acknowledgements: PackageRiskAcknowledgements }) => Effect.gen(function*() {
      const invalid = validatePlan(request.plan);
      if (invalid !== undefined) return yield* invalid;
      if (!allAcknowledged(request.acknowledgements)) return yield* refuse("confirmation-declined");
      const now = yield* clock.now;
      const confirmationId = Schema.decodeUnknownSync(ConfirmationId)(`confirmation:${crypto.randomUUID()}`);
      const publicRecord: ConfirmationRecord = {
        confirmationId,
        planId: request.plan.plan.planId,
        bindingDigest: request.plan.plan.digest,
        expiresAt: new Date(now + confirmationTtlMs).toISOString(),
        replayPolicy: "single-use",
      };
      const record: StoredConfirmation = {
        ...publicRecord,
        expiresAtMs: now + confirmationTtlMs,
        bindingJson: canonicalPlanBindingJson(request.plan.plan.binding),
        consumed: false,
      };
      confirmations.set(confirmationId, record);
      return publicRecord;
    });

    const execute = (request: { readonly plan: PackagePlan; readonly confirmationId: typeof ConfirmationId.Type }) => Effect.gen(function*() {
      const record = confirmations.get(request.confirmationId);
      if (record === undefined) return yield* refuse("confirmation-absent");
      if (record.consumed) return yield* refuse("confirmation-replayed");
      record.consumed = true;
      const now = yield* clock.now;
      if (now > record.expiresAtMs) return yield* refuse("confirmation-expired");
      if (record.planId !== request.plan.plan.planId || record.bindingDigest !== request.plan.plan.digest || record.bindingJson !== canonicalPlanBindingJson(request.plan.plan.binding)) {
        return yield* refuse("confirmation-mismatch");
      }
      const current = yield* observations.reobserve(request.plan);
      if (current.planId !== request.plan.plan.planId || current.digest !== request.plan.plan.digest || canonicalPlanBindingJson(current.binding) !== record.bindingJson) {
        return yield* refuse("plan-stale");
      }
      const command = yield* policies.commandFor(request.plan);
      if (command.provider !== request.plan.plan.binding.provider || command.policyId !== request.plan.plan.binding.providerPolicy.id) return yield* refuse("confirmation-mismatch");
      const report = request.plan.plan.binding.provider === "omarchy" && command.provider === "omarchy"
        ? yield* omarchy.execute({ plan: request.plan as OmarchyPackagePlan, command: command as OmarchyCommand })
        : request.plan.plan.binding.provider === "homebrew" && command.provider === "homebrew"
          ? yield* homebrew.execute({ plan: request.plan as HomebrewPackagePlan, command: command as HomebrewCommand })
          : yield* refuse("confirmation-mismatch");
      if (report.kind !== "provider-reported") return finalOutcome(report);
      const verified = yield* verification.verify(request.plan, report);
      return {
        kind: verified,
        evidenceIds: evidence(report.evidenceIds),
        reassessmentRequired: verified !== "independently-verified",
      };
    });
    return { confirm, execute };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
