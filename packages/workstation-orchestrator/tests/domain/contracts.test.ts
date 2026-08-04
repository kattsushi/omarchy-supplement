import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";

import {
  BoundPlanSchema,
  PlanBindingInputSchema,
  PlanBindingSchema,
  canonicalPlanBindingJson,
  createPlanBinding,
  isPlanBindingCurrent,
} from "../../src/domain/plans";
import { assessProgram } from "../../src/domain/assessment";
import { CompatibilityInputSchema, selectCompatibility } from "../../src/domain/compatibility";
import { providerBlocker } from "../../src/domain/providers";
import { manualRestoreEligibility } from "../../src/domain/recovery";
import { PlatformSchema, ProgramIdSchema } from "../../src/domain/states";
import { cannotUpgradeEvidence, nativeEvidenceFor } from "../../src/domain/evidence";
import { domainFixtures } from "../fixtures/domain-fixtures";

const programId = (value: string) => Schema.decodeUnknownSync(ProgramIdSchema)(value);

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
    expect(Schema.decodeUnknownSync(PlatformSchema)("linux")).toBe("linux");
    expect(() => Schema.decodeUnknownSync(PlatformSchema)("windows")).toThrow();
    expect(String(Schema.decodeUnknownSync(ProgramIdSchema)("program:neovim"))).toBe("program:neovim");
    expect(Schema.decodeUnknownSync(CompatibilityInputSchema)({ platform: "linux", generation: "omarchy-4" })).toEqual({ platform: "linux", generation: "omarchy-4" });
  });

  test("canonicalizes equivalent bindings and changes digest for every bound fact", async () => {
    const first = await Effect.runPromise(createPlanBinding(bindingInput));
    const reordered = await Effect.runPromise(createPlanBinding({
      ...bindingInput,
      logicalRequestIds: [...bindingInput.logicalRequestIds].reverse(),
      mappingIds: [...bindingInput.mappingIds].reverse(),
      riskCodes: [...bindingInput.riskCodes].reverse(),
    }));

    expect(canonicalPlanBindingJson(first.binding)).toBe(canonicalPlanBindingJson(reordered.binding));
    expect(first.digest).toBe(reordered.digest);
    expect(String(first.digest)).toBe("3fb22a9fe1426f3fda6c43ab706e5e31e544a3c78923b5f10ccd4a6bf87f61a1");
    expect(await Effect.runPromise(isPlanBindingCurrent(first, { ...bindingInput, fallbackOptIn: false }))).toBe(false);
    expect(await Effect.runPromise(isPlanBindingCurrent(first, { ...bindingInput, providerRole: "primary" }))).toBe(false);
  });

  test("changes a binding for each execution-relevant fact", async () => {
    const original = await Effect.runPromise(createPlanBinding(bindingInput));
    const changes = [
      { capabilityId: "homebrew-cask" },
      { platformObservationDigest: "platform-v2" },
      { profilePolicyDigest: "profile-v2" },
      { verificationPolicyId: "acquisition-v2" },
      { packageStateDigests: ["package:zellij:present"] },
    ];
    for (const change of changes) expect(await Effect.runPromise(isPlanBindingCurrent(original, { ...bindingInput, ...change }))).toBe(false);
  });

    test("decodes branded plan values at the domain boundary", () => {
      const binding = Schema.decodeUnknownSync(PlanBindingSchema)({ ...bindingInput, schemaVersion: "PlanBindingV1" });
      const plan = Schema.decodeUnknownSync(BoundPlanSchema)({ binding, digest: "a".repeat(64), planId: `plan:${"a".repeat(64)}` });

      expect(Schema.decodeUnknownSync(PlanBindingInputSchema)(bindingInput)).toEqual(bindingInput);
      expect(String(plan.digest)).toBe("a".repeat(64));
      expect(() => Schema.decodeUnknownSync(PlanBindingSchema)({ ...bindingInput, schemaVersion: "PlanBindingV2" })).toThrow();
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
    expect(selectCompatibility({ platform: "linux", generation: "omarchy-3" }).policyId).toBe("omarchy-3-policy-v1");
    expect(selectCompatibility({ platform: "linux", generation: "omarchy-4" }).policyId).toBe("omarchy-4-policy-v1");
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
    expect(selectCompatibility({ platform: "linux", generation: "ambiguous" }).state).toBe("ambiguous");
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
