import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { BoundPlan, PackagePlan } from "../../domain/plans.js";

export type ProviderExecutionReport =
  | { readonly kind: "provider-reported" | "partial" | "unverifiable"; readonly evidenceIds: readonly string[] }
  | { readonly kind: "failed"; readonly reason: "exit" | "spawn"; readonly evidenceIds: readonly string[] }
  | { readonly kind: "timed-out" | "malformed"; readonly evidenceIds: readonly string[] };

export type OmarchyCommand = { readonly provider: "omarchy"; readonly policyId: string; readonly argv: readonly ["omarchy", "pkg", "add", string] | readonly ["omarchy", "install", string, string] };
export type HomebrewCommand = { readonly provider: "homebrew"; readonly policyId: string; readonly argv: readonly ["brew", "install", string] };
export type ProviderExecutionCommand = OmarchyCommand | HomebrewCommand;
export type OmarchyPackagePlan = PackagePlan & { readonly plan: PackagePlan["plan"] & { readonly binding: PackagePlan["plan"]["binding"] & { readonly provider: "omarchy" } } };
export type HomebrewPackagePlan = PackagePlan & { readonly plan: PackagePlan["plan"] & { readonly binding: PackagePlan["plan"]["binding"] & { readonly provider: "homebrew" } } };
export type OmarchyExecutionInput = { readonly plan: OmarchyPackagePlan; readonly command: OmarchyCommand };
export type HomebrewExecutionInput = { readonly plan: HomebrewPackagePlan; readonly command: HomebrewCommand };

export class PackageExecutionUnavailable extends Data.TaggedError("PackageExecutionUnavailable")<{ readonly reason: "mapping-evidence" | "capability-evidence" | "verification-evidence" | "provider-adapter"; }> {}

export class OmarchyExecutionPort extends Context.Service<OmarchyExecutionPort, { readonly execute: (input: OmarchyExecutionInput) => Effect.Effect<ProviderExecutionReport, PackageExecutionUnavailable> }>()("OmarchyExecutionPort", { make: Effect.never }) { static readonly layer = Layer.effect(this, this.make); }
export class HomebrewExecutionPort extends Context.Service<HomebrewExecutionPort, { readonly execute: (input: HomebrewExecutionInput) => Effect.Effect<ProviderExecutionReport, PackageExecutionUnavailable> }>()("HomebrewExecutionPort", { make: Effect.never }) { static readonly layer = Layer.effect(this, this.make); }
export class PackageExecutionObservationPort extends Context.Service<PackageExecutionObservationPort, { readonly reobserve: (plan: PackagePlan) => Effect.Effect<BoundPlan, PackageExecutionUnavailable> }>()("PackageExecutionObservationPort", { make: Effect.never }) { static readonly layer = Layer.effect(this, this.make); }
export class PackageExecutionPolicyPort extends Context.Service<PackageExecutionPolicyPort, { readonly commandFor: (plan: PackagePlan) => Effect.Effect<ProviderExecutionCommand, PackageExecutionUnavailable> }>()("PackageExecutionPolicyPort", { make: Effect.never }) { static readonly layer = Layer.effect(this, this.make); }
export class AcquisitionVerificationPort extends Context.Service<AcquisitionVerificationPort, { readonly verify: (plan: PackagePlan, report: ProviderExecutionReport) => Effect.Effect<"provider-reported" | "independently-verified" | "unverifiable", PackageExecutionUnavailable> }>()("AcquisitionVerificationPort", { make: Effect.never }) { static readonly layer = Layer.effect(this, this.make); }
export class PackageExecutionClockPort extends Context.Service<PackageExecutionClockPort, { readonly now: Effect.Effect<number> }>()("PackageExecutionClockPort", { make: Effect.succeed({ now: Effect.sync(Date.now) }) }) { static readonly layer = Layer.effect(this, this.make); }
