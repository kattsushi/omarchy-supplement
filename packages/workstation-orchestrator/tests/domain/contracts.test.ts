import { describe, expect, it, test } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  BoundPlan,
  PlanBinding,
  PlanBindingDigestFailure,
  PlanBindingInput,
  PlanDigestService,
  canonicalPlanBindingJson,
  createPlanBinding,
  isPlanBindingCurrent,
} from "../../src/domain/plans.js";
import { assessProgram, validateProgramReadiness } from "../../src/domain/assessment.js";
import { CompatibilityInput, selectCompatibility, validateCompatibility } from "../../src/domain/compatibility.js";
import { providerBlocker } from "../../src/domain/providers.js";
import { manualRestoreEligibility, validateManualRestore } from "../../src/domain/recovery.js";
import { Platform, ProgramId } from "../../src/domain/states.js";
import { cannotUpgradeEvidence, nativeEvidenceFor } from "../../src/domain/evidence.js";
import { domainFixtures } from "../fixtures/domain-fixtures.js";

const programId = (value: string) => Schema.decodeUnknownSync(ProgramId)(value);

const bindingInput = {
  operation: "package-acquisition" as const,
  logicalRequestIds: ["program:zellij", "program:neovim"],
  platformObservationDigest: "platform-v1",
  profilePolicyDigest: "profile-v1",
  provider: "homebrew" as const,
  providerRole: "fallback" as const,
  providerPolicy: { id: "policy:homebrew-linux", version: "1" },
  capabilityId: "homebrew-formula",
  mappingIds: ["mapping:zellij@1", "mapping:neovim@1"],
  packageStateDigests: ["package:zellij:missing", "package:neovim:missing"],
  verificationPolicyId: "acquisition-v1",
  riskCodes: ["network", "provider-side-effect"],
  fallbackOptIn: true,
};

describe("pure workstation domain contracts", () => {
  test("decodes literal states and brands opaque program identifiers", () => {
    expect(Schema.decodeUnknownSync(Platform)("linux")).toBe("linux");
    expect(() => Schema.decodeUnknownSync(Platform)("windows")).toThrow();
    expect(String(Schema.decodeUnknownSync(ProgramId)("program:neovim"))).toBe("program:neovim");
    expect(Schema.decodeUnknownSync(CompatibilityInput)({ platform: "linux", generation: "omarchy-4" })).toEqual({ platform: "linux", generation: "omarchy-4" });
  });

  it.effect("canonicalizes equivalent bindings and changes digest for every bound fact", () => Effect.gen(function*() {
    const first = yield* createPlanBinding(bindingInput).pipe(Effect.provide(PlanDigestService.layer));
    const reordered = yield* createPlanBinding({
      ...bindingInput,
      logicalRequestIds: [...bindingInput.logicalRequestIds].reverse(),
      mappingIds: [...bindingInput.mappingIds].reverse(),
      riskCodes: [...bindingInput.riskCodes].reverse(),
    }).pipe(Effect.provide(PlanDigestService.layer));

    expect(canonicalPlanBindingJson(first.binding)).toBe(canonicalPlanBindingJson(reordered.binding));
    expect(first.digest).toBe(reordered.digest);
    expect(String(first.digest)).toBe("3fb22a9fe1426f3fda6c43ab706e5e31e544a3c78923b5f10ccd4a6bf87f61a1");
    expect(yield* isPlanBindingCurrent(first, { ...bindingInput, fallbackOptIn: false }).pipe(Effect.provide(PlanDigestService.layer))).toBe(false);
    expect(yield* isPlanBindingCurrent(first, { ...bindingInput, providerRole: "primary" }).pipe(Effect.provide(PlanDigestService.layer))).toBe(false);
  }));

  it.effect("fails through the typed digest provider error channel", () => {
    const unavailableDigest = Layer.succeed(PlanDigestService, {
      sha256: () => Effect.fail(new PlanBindingDigestFailure({ cause: "digest unavailable" })),
    });

    return createPlanBinding(bindingInput).pipe(
      Effect.provide(unavailableDigest),
      Effect.match({
        onFailure: (failure) => expect(failure).toMatchObject({ _tag: "PlanBindingDigestFailure", cause: "digest unavailable" }),
        onSuccess: () => expect.fail("expected digest failure"),
      }),
    );
  });

  it.effect("changes a binding for each execution-relevant fact", () => Effect.gen(function*() {
    const original = yield* createPlanBinding(bindingInput).pipe(Effect.provide(PlanDigestService.layer));
    const changes = [
      { capabilityId: "homebrew-cask" },
      { platformObservationDigest: "platform-v2" },
      { profilePolicyDigest: "profile-v2" },
      { verificationPolicyId: "acquisition-v2" },
      { packageStateDigests: ["package:zellij:present"] },
    ];
    for (const change of changes) expect(yield* isPlanBindingCurrent(original, { ...bindingInput, ...change }).pipe(Effect.provide(PlanDigestService.layer))).toBe(false);
  }));

    test("decodes branded plan values at the domain boundary", () => {
      const binding = Schema.decodeUnknownSync(PlanBinding)({ ...bindingInput, schemaVersion: "PlanBindingV1" });
      const plan = Schema.decodeUnknownSync(BoundPlan)({ binding, digest: "a".repeat(64), planId: `plan:${"a".repeat(64)}` });

      expect(Schema.decodeUnknownSync(PlanBindingInput)(bindingInput)).toEqual(bindingInput);
      expect(String(plan.digest)).toBe("a".repeat(64));
      expect(() => Schema.decodeUnknownSync(PlanBinding)({ ...bindingInput, schemaVersion: "PlanBindingV2" })).toThrow();
    });

    test("requires an explicit package-ready state plus configuration and Stow readiness", () => {
    const missingPackage = assessProgram({
      programId: programId("program:neovim"),
      packageState: "missing",
      configurationState: "applied",
      dotfileStowState: "applied",
      evidence: [],
    });
    const presentPackage = assessProgram({
      ...missingPackage,
      packageState: "present",
    });
    const readyProgram = assessProgram({
      ...missingPackage,
      packageState: "verified",
    });

    expect(missingPackage.ready).toBe(false);
    expect(presentPackage.ready).toBe(true);
    expect(readyProgram.ready).toBe(true);
  });

    test("returns typed validation rejections for readiness, compatibility, and manual restore", () => {
      const notReady = validateProgramReadiness(assessProgram({
        programId: programId("program:neovim"),
        packageState: "missing",
        configurationState: "applied",
        dotfileStowState: "applied",
        evidence: [],
      }));
      const ready = validateProgramReadiness(assessProgram({
        programId: programId("program:neovim"),
        packageState: "verified",
        configurationState: "applied",
        dotfileStowState: "applied",
        evidence: [],
      }));
      const unsupported = validateCompatibility({
        state: "unsupported",
        generation: "omarchy-4",
        evidenceStrength: "structural",
        reasonCode: "unsupported",
      });
      const eligibleRestore = validateManualRestore(manualRestoreEligibility({
        identityVerified: true,
        integrityVerified: true,
        identityEvidenceIds: ["evidence:identity"],
        integrityEvidenceIds: ["evidence:integrity"],
      }));
      const refusedRestore = validateManualRestore(manualRestoreEligibility({
        identityVerified: true,
        integrityVerified: false,
        identityEvidenceIds: ["evidence:identity"],
        integrityEvidenceIds: ["evidence:integrity"],
      }));

      expect(Result.isFailure(notReady) && notReady.failure._tag).toBe("ProgramNotReady");
      expect(Result.isSuccess(ready)).toBe(true);
      expect(Result.isFailure(unsupported) && unsupported.failure._tag).toBe("CompatibilityRejected");
      expect(Result.isFailure(validateCompatibility(selectCompatibility({ platform: "linux", generation: "omarchy-4" })))).toBe(true);
      expect(Result.isFailure(refusedRestore) && refusedRestore.failure._tag).toBe("ManualRestoreRefused");
      expect(Result.isSuccess(eligibleRestore)).toBe(true);
    });

    test("never derives configuration or Stow readiness from package presence", () => {
    const result = assessProgram({
      programId: programId("program:neovim"),
      packageState: "present",
      configurationState: "absent",
      dotfileStowState: "conflict",
      evidence: [],
    });

    expect(result.configurationState).toBe("absent");
    expect(result.dotfileStowState).toBe("conflict");
    expect(result.ready).toBe(false);
  });

  test("isolates generations and preserves unverified macOS evidence", () => {
    expect(selectCompatibility({ platform: "linux", generation: "omarchy-3" })).toMatchObject({ state: "refused", reasonCode: "deprecated-generation" });
    expect(selectCompatibility({ platform: "linux", generation: "omarchy-4" })).toMatchObject({ state: "refused", reasonCode: "unknown-version", policyId: undefined });
    expect(selectCompatibility({ platform: "macos", generation: "unknown" }).evidenceStrength).toBe("unverified");
  });

  test("is monotonic for evidence and isolated across state domains", () => {
    const strengths = ["unverified", "fixture", "structural", "native"] as const;
    for (let observed = 0; observed < strengths.length; observed++) {
      for (let requested = observed + 1; requested < strengths.length; requested++) {
        expect(cannotUpgradeEvidence(strengths[observed], strengths[requested])).toBe(true);
      }
    }
    expect(nativeEvidenceFor({ evidenceId: "evidence:linux", subjectId: "program:neovim", claim: "ready", strength: "native", sourceContract: "test", sourceVersion: "1", platformContext: "linux", summaryCode: "native" }, "macos")).toBe(false);
    for (const packageState of ["present", "verified", "provider-reported"] as const) {
      const assessment = assessProgram({ programId: programId("program:nvim"), packageState, configurationState: "unverifiable", dotfileStowState: "blocked", evidence: [] });
      expect(assessment.ready).toBe(false);
      expect(assessment.configurationState).toBe("unverifiable");
      expect(assessment.dotfileStowState).toBe("blocked");
    }
    expect(selectCompatibility({ platform: "linux", generation: "ambiguous" })).toMatchObject({ state: "refused", reasonCode: "ambiguous-version" });
    expect(selectCompatibility({ platform: "unknown", generation: "unknown" }).state).toBe("unverified");
  });

  test("keeps the deterministic fixture matrix machine-readable and fail-closed", () => {
    expect(domainFixtures.map((fixture) => fixture.name)).toEqual([
      "completed", "refused", "unsupported", "ambiguous", "stale", "failed",
      "missing-provider", "unsafe-mapping", "fallback-not-opted-in", "unverified-evidence",
    ]);
    const requiredBlockers = [
      "provider-missing", "provider-version-unsupported", "provider-capability-missing", "provider-capability-ambiguous",
      "package-mapping-missing", "package-mapping-unsafe", "package-unsupported", "fallback-not-opted-in",
      "confirmation-absent", "confirmation-declined", "plan-stale", "provider-execution-failed", "acquisition-unverifiable",
    ] as const;
    for (const fixture of domainFixtures) {
      if (fixture.blocker) {
        const blocker = providerBlocker(fixture.blocker, fixture.evidenceIds);
        expect(blocker.code).toBe(fixture.blocker);
        expect(blocker.evidenceIds).toEqual([...fixture.evidenceIds].sort());
        expect(blocker.nextAction.kind).not.toBe("none");
      }
    }
    for (const code of requiredBlockers) expect(providerBlocker(code, ["evidence:policy"]).nextAction.kind).not.toBe("none");
  });

  test("classifies unsupported provider blockers and preserves manual restore evidence", () => {
    expect(providerBlocker("package-unsupported", ["evidence:policy"]).policyDecision).toBe("unsupported");
    expect(providerBlocker("provider-version-unsupported", ["evidence:provider"]).policyDecision).toBe("unsupported");

    const eligible = manualRestoreEligibility({
      identityVerified: true,
      integrityVerified: true,
      identityEvidenceIds: ["evidence:identity"],
      integrityEvidenceIds: ["evidence:integrity"],
    });
    const rejected = manualRestoreEligibility({
      identityVerified: true,
      integrityVerified: false,
      identityEvidenceIds: ["evidence:identity"],
      integrityEvidenceIds: ["evidence:integrity"],
    });

    expect(eligible.state).toBe("eligible-for-manual-restore");
    expect(eligible.identityEvidenceIds).toEqual(["evidence:identity"]);
    expect(eligible.integrityEvidenceIds).toEqual(["evidence:integrity"]);
    expect(rejected.state).toBe("verification-failed");
    expect(rejected.identityEvidenceIds).toEqual(["evidence:identity"]);
    expect(rejected.integrityEvidenceIds).toEqual(["evidence:integrity"]);
  });
});
