import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { canonicalPlanBindingJson, ConfirmationId, type ConfirmationRecord, type PackagePlan } from "../../domain/plans.js";
import { ProviderPolicyGate } from "../contracts/provider-policy.js";
import { AcquisitionVerificationPort, HomebrewExecutionPort, OmarchyExecutionPort, PackageExecutionClockPort, PackageExecutionObservationPort, PackageExecutionPolicyPort, PackageExecutionUnavailable, type HomebrewCommand, type HomebrewPackagePlan, type OmarchyCommand, type OmarchyPackagePlan, type ProviderExecutionReport } from "../ports/package-execution.js";

export type PackageRiskAcknowledgements = { readonly network: boolean; readonly privilege: boolean; readonly prompts: boolean; readonly sideEffects: boolean; readonly noAutomaticRollback: boolean };
export type AcquisitionOutcome = { readonly kind: "provider-reported" | "independently-verified" | "unverifiable" | "partial"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: boolean } | { readonly kind: "failed"; readonly reason: "exit" | "spawn"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: true } | { readonly kind: "timed-out" | "malformed"; readonly evidenceIds: readonly string[]; readonly reassessmentRequired: true };
export const confirmationTtlMs = 5 * 60 * 1_000;
export class PackageExecutionRefused extends Data.TaggedError("PackageExecutionRefused")<{ readonly code: "production-unavailable" | "confirmation-declined" | "confirmation-absent" | "confirmation-expired" | "confirmation-replayed" | "confirmation-mismatch" | "single-package-required" | "package-mapping-missing" | "fallback-not-opted-in" | "plan-not-executable" | "plan-stale" }> {}

const refuse = (code: PackageExecutionRefused["code"]) => new PackageExecutionRefused({ code });
const acknowledged = (value: PackageRiskAcknowledgements) => Object.values(value).every(Boolean);
const validatePlan = (plan: PackagePlan) => plan.plan.binding.operation !== "package-acquisition" || plan.blockers.length > 0 ? refuse("plan-not-executable") : plan.plan.binding.logicalRequestIds.length !== 1 || plan.plan.binding.packageStateDigests.length !== 1 ? refuse("single-package-required") : plan.plan.binding.mappingIds.length !== 1 ? refuse("package-mapping-missing") : plan.plan.binding.provider === "homebrew" && plan.plan.binding.providerRole === "fallback" && !plan.plan.binding.fallbackOptIn ? refuse("fallback-not-opted-in") : undefined;

export class ExecutePackagePlan extends Context.Service<ExecutePackagePlan, { readonly confirm: (request: { readonly plan: PackagePlan; readonly acknowledgements: PackageRiskAcknowledgements }) => Effect.Effect<ConfirmationRecord, PackageExecutionRefused>; readonly execute: (request: { readonly plan: PackagePlan; readonly confirmationId: typeof ConfirmationId.Type }) => Effect.Effect<AcquisitionOutcome, PackageExecutionRefused | PackageExecutionUnavailable> }>()("ExecutePackagePlan", {
  make: Effect.gen(function*() {
    const policyGate = yield* ProviderPolicyGate;
    const clock = yield* PackageExecutionClockPort;
    const observations = yield* PackageExecutionObservationPort;
    const policies = yield* PackageExecutionPolicyPort;
    const omarchy = yield* OmarchyExecutionPort;
    const homebrew = yield* HomebrewExecutionPort;
    const verification = yield* AcquisitionVerificationPort;
    const confirmations = new Map<string, ConfirmationRecord & { readonly expiresAtMs: number; readonly bindingJson: string; consumed: boolean }>();
    const confirm = (request: { readonly plan: PackagePlan; readonly acknowledgements: PackageRiskAcknowledgements }) => Effect.gen(function*() {
      if (!(yield* policyGate.evaluate()).eligible) return yield* refuse("production-unavailable");
      const invalid = validatePlan(request.plan);
      if (invalid !== undefined) return yield* invalid;
      if (!acknowledged(request.acknowledgements)) return yield* refuse("confirmation-declined");
      const now = yield* clock.now;
      const confirmationId = Schema.decodeUnknownSync(ConfirmationId)(`confirmation:${crypto.randomUUID()}`);
      const record = { confirmationId, planId: request.plan.plan.planId, bindingDigest: request.plan.plan.digest, expiresAt: new Date(now + confirmationTtlMs).toISOString(), replayPolicy: "single-use" as const, expiresAtMs: now + confirmationTtlMs, bindingJson: canonicalPlanBindingJson(request.plan.plan.binding), consumed: false };
      confirmations.set(confirmationId, record);
      const { expiresAtMs: _, bindingJson: __, consumed: ___, ...confirmation } = record;
      return confirmation;
    });
    const execute = (request: { readonly plan: PackagePlan; readonly confirmationId: typeof ConfirmationId.Type }) => Effect.gen(function*() {
      if (!(yield* policyGate.evaluate()).eligible) return yield* refuse("production-unavailable");
      const record = confirmations.get(request.confirmationId);
      if (record === undefined) return yield* refuse("confirmation-absent");
      if (record.consumed) return yield* refuse("confirmation-replayed");
      record.consumed = true;
      if ((yield* clock.now) > record.expiresAtMs) return yield* refuse("confirmation-expired");
      if (record.planId !== request.plan.plan.planId || record.bindingDigest !== request.plan.plan.digest || record.bindingJson !== canonicalPlanBindingJson(request.plan.plan.binding)) return yield* refuse("confirmation-mismatch");
      const current = yield* observations.reobserve(request.plan);
      if (current.planId !== request.plan.plan.planId || current.digest !== request.plan.plan.digest || canonicalPlanBindingJson(current.binding) !== record.bindingJson) return yield* refuse("plan-stale");
      const command = yield* policies.commandFor(request.plan);
      if (command.provider !== request.plan.plan.binding.provider || command.policyId !== request.plan.plan.binding.providerPolicy.id) return yield* refuse("confirmation-mismatch");
      const report: ProviderExecutionReport = request.plan.plan.binding.provider === "omarchy" && command.provider === "omarchy" ? yield* omarchy.execute({ plan: request.plan as OmarchyPackagePlan, command: command as OmarchyCommand }) : request.plan.plan.binding.provider === "homebrew" && command.provider === "homebrew" ? yield* homebrew.execute({ plan: request.plan as HomebrewPackagePlan, command: command as HomebrewCommand }) : yield* refuse("confirmation-mismatch");
      if (report.kind !== "provider-reported") return { ...report, evidenceIds: report.evidenceIds.slice(0, 8), reassessmentRequired: true as const };
      const kind = yield* verification.verify(request.plan, report);
      return { kind, evidenceIds: report.evidenceIds.slice(0, 8), reassessmentRequired: kind !== "independently-verified" };
    });
    return { confirm, execute };
  }),
}) { static readonly layer = Layer.effect(this, this.make); }
