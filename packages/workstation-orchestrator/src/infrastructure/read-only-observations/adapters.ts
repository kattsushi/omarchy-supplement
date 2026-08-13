import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { InvalidContract, WorkstationSource, type ParsedWorkstationSourceResult } from "../../application/contracts/bash.js";
import {
  ObservationUnavailable,
  type EvidenceStatusPortShape,
  type PlatformFactsPortShape,
  type ProfileInventoryPortShape,
  type SourceEvidenceObservation,
  type SourceEvidencePortShape,
  type SourceExpectation,
} from "../../application/ports/workstation.js";
import type { EvidenceRecord } from "../../domain/evidence.js";
import { classifyOmarchyIdentity } from "../../domain/compatibility.js";

const sourceContract = "workstation-source-v1" as const;
const sourceVersion = "1" as const;

const deepFreeze = <A>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const unavailable = (
  result: Extract<ParsedWorkstationSourceResult, { readonly _tag: "Failure" }>,
  subject: ObservationUnavailable["subject"],
) => new ObservationUnavailable({
  subject,
  reasonCode: result.failure.code,
  sourceContract,
  sourceVersion,
  sourceFingerprint: result.failure.evidenceDigest,
});

const fromSource = <A>(
  result: ParsedWorkstationSourceResult,
  subject: ObservationUnavailable["subject"],
  map: (source: WorkstationSource) => A | ObservationUnavailable,
): Effect.Effect<A, ObservationUnavailable> => {
  if (Result.isFailure(result)) return Effect.fail(unavailable(result, subject));
  const mapped = map(result.success);
  return mapped instanceof ObservationUnavailable ? Effect.fail(mapped) : Effect.succeed(deepFreeze(mapped));
};

const metadata = (source: WorkstationSource, evidenceStrength: "native" | "structural") => ({
  sourceContract,
  sourceVersion,
  sourceFingerprint: source.sourceFingerprint,
  evidenceStrength,
});

const snapshot = (result: ParsedWorkstationSourceResult): ParsedWorkstationSourceResult => {
  if (Result.isFailure(result)) return result;
  try {
    const source = result.success;
    return Result.succeed(deepFreeze(Schema.decodeUnknownSync(WorkstationSource)({
      ...source,
      platform: { ...source.platform },
      omarchy: { ...source.omarchy },
      profiles: source.profiles.map((profile) => ({ ...profile, dotfileSelectors: [...profile.dotfileSelectors] })),
      expectations: source.expectations.map((expectation) => ({ ...expectation })),
      evidence: source.evidence.map((record) => ({ ...record })),
    })));
  } catch {
    return Result.fail(new InvalidContract({ code: "source-snapshot-invalid", evidenceDigest: "fingerprint:invalid" }));
  }
};

const evidence = (
  source: WorkstationSource,
  subjectId: string,
  claim: string,
  summaryCode: string,
  platformContext: string,
): EvidenceRecord => ({
  evidenceId: `evidence:${subjectId}:${claim}`,
  subjectId,
  claim,
  strength: "native",
  sourceContract,
  sourceVersion,
  platformContext,
  digest: source.sourceFingerprint,
  summaryCode,
});

const platformAdapter = (result: ParsedWorkstationSourceResult): PlatformFactsPortShape => Object.freeze({
  facts: fromSource(result, "platform", (source) => {
    if (source.platform.name === "unknown" || source.platform.architecture === "unknown") return new ObservationUnavailable({
      subject: "platform",
      reasonCode: "source-platform-unavailable",
      sourceContract,
      sourceVersion,
      sourceFingerprint: source.sourceFingerprint,
    });
    const platformContext = `${source.platform.name}/${source.platform.architecture}`;
    const omarchy = source.omarchy.availability === "observed" && source.platform.name !== "linux"
      ? { availability: "unavailable" as const, reason: "ambiguous-version" }
      : source.omarchy;
    const omarchyIdentity = classifyOmarchyIdentity(omarchy);
    return {
      platform: source.platform.name,
      architecture: source.platform.architecture,
      generation: omarchyIdentity.generation,
      ...(omarchy.availability === "observed" ? { omarchyVersion: omarchy.version, omarchyRevision: omarchy.revision } : { omarchyUnavailableReason: omarchyIdentity.availability === "refused" ? omarchyIdentity.reason : "unknown-version" }),
      omarchyIdentity,
      omarchyAvailability: omarchy.availability,
      observationDigest: source.sourceFingerprint,
      ...metadata(source, "native"),
      evidence: [
        evidence(source, "platform:workstation", "platform-observed", source.platform.name, platformContext),
        evidence(source, "platform:omarchy", omarchy.availability === "observed" ? "omarchy-observed" : "omarchy-refused", omarchy.availability === "observed" ? omarchy.generation : omarchyIdentity.availability === "refused" ? omarchyIdentity.reason : "unknown-version", platformContext),
      ],
    };
  }),
});

const profilesAdapter = (result: ParsedWorkstationSourceResult): ProfileInventoryPortShape => Object.freeze({
  inventory: fromSource(result, "profiles", (source) => ({
    ...metadata(source, "structural"),
    profiles: source.profiles.map(({ dotfileSelectors, ...profile }) => ({ ...profile, dotfileSelectors: [...dotfileSelectors] })),
    expectations: source.expectations.map((expectation) => ({ ...expectation })),
  })),
});

const sourceEvidence = (source: WorkstationSource): readonly SourceEvidenceObservation[] => source.evidence.map((record) => {
  const expectations = source.expectations
    .filter((expectation) => expectation.kind === record.kind && expectation.id === record.id)
    .map((expectation): SourceExpectation => ({ ...expectation }));
  const claim = record.availability === "present" ? "executable-presence" : record.availability === "missing" ? "executable-absence" : "executable-unavailable";
  return {
    ...metadata(source, "native"),
    ...record,
    expectations,
    evidence: [evidence(source, record.id, claim, record.availability, `${source.platform.name}/${source.platform.architecture}`)],
  };
});

const sourceEvidenceAdapter = (result: ParsedWorkstationSourceResult): SourceEvidencePortShape => Object.freeze({
  observations: fromSource(result, "evidence", sourceEvidence),
});

const programEvidenceAdapter = (result: ParsedWorkstationSourceResult): EvidenceStatusPortShape => Object.freeze({
  forProgram: (programId: Parameters<EvidenceStatusPortShape["forProgram"]>[0]) => fromSource(result, "evidence", (source) => {
    const observation = sourceEvidence(source).find(({ kind, id }) => kind === "program" && id === programId);
    if (observation === undefined) return new ObservationUnavailable({
      subject: "evidence",
      reasonCode: "source-evidence-missing",
      sourceContract,
      sourceVersion,
      sourceFingerprint: source.sourceFingerprint,
    });
    return {
      programId,
      packageState: observation.availability === "present" ? "present" as const : observation.availability === "missing" ? "missing" as const : "unverifiable" as const,
      configurationState: "unverifiable" as const,
      dotfileStowState: "unverifiable" as const,
      evidence: [...observation.evidence],
    };
  }),
});

export const makeReadOnlyObservationAdapters = (result: ParsedWorkstationSourceResult) => {
  const source = snapshot(result);
  return Object.freeze({
    platform: platformAdapter(source),
    profiles: profilesAdapter(source),
    sourceEvidence: sourceEvidenceAdapter(source),
    programEvidence: programEvidenceAdapter(source),
  });
};
