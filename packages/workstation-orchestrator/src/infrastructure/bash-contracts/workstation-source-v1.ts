import * as Result from "effect/Result";
import { InvalidContract, Refused, evidenceFingerprint, type WorkstationSource } from "../../application/contracts/bash.js";

type Availability = "present" | "missing" | "unavailable";
const safe = /^[a-z0-9][a-z0-9._:/-]*$/;
const sha = /^sha256:[a-f0-9]{64}$/;
const privateData = /\r|secret|token|password|private[_-]?key|\/home\/|@/i;
const invalid = (text: string, code = "source-record") => Result.fail(new InvalidContract({ code, evidenceDigest: evidenceFingerprint(text) }));
const refusalCodes = new Set(["PROFILE_UNKNOWN", "SOURCE_BOUNDS", "SOURCE_HASH_UNAVAILABLE", "SOURCE_MANIFEST_INCOMPLETE", "SOURCE_MANIFEST_INVALID", "SOURCE_OBSERVATION_FAILED", "SOURCE_TIMEOUT"]);
const ordered = (values: readonly string[]) => values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);

export const parseWorkstationSource = (text: string): Result.Result<WorkstationSource, InvalidContract | Refused> => {
  if (!text.endsWith("\n") || text.length > 262144 || privateData.test(text)) return invalid(text, "source-bounds-or-privacy");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > 256 || lines.some((line) => line.length > 512)) return invalid(text, "source-bounds-or-privacy");
  if (lines[0] !== "schema\tworkstation-source-v1") return invalid(text, "source-version");
  if (lines.length === 2) {
    const [, status, code, extra] = lines[1]?.split("\t") ?? [];
    return status === "refused" && code !== undefined && extra === undefined && refusalCodes.has(code)
      ? Result.fail(new Refused({ code, evidenceDigest: evidenceFingerprint(text) }))
      : invalid(text);
  }
  const records = lines.slice(1).map((line) => line.split("\t"));
  const fingerprint = records[0];
  const platform = records[1];
  const omarchy = records[2];
  const status = records.at(-1);
  if (fingerprint?.length !== 2 || fingerprint[0] !== "source_fingerprint" || !sha.test(fingerprint[1] ?? "") || platform?.length !== 3 || platform[0] !== "platform" || !["linux", "macos", "unknown"].includes(platform[1] ?? "") || !["x86_64", "aarch64", "unknown"].includes(platform[2] ?? "") || status?.join("\t") !== "status\tcomplete") return invalid(text);
  const profileRecords = records.filter(([tag]) => tag === "profile");
  const expectationRecords = records.filter(([tag]) => tag === "expectation");
  const evidenceRecords = records.filter(([tag]) => tag === "program" || tag === "dependency");
  const knownCount = 4 + profileRecords.length + expectationRecords.length + evidenceRecords.length;
  if (knownCount !== records.length || profileRecords.length === 0 || expectationRecords.length === 0 || evidenceRecords.length === 0) return invalid(text);
  const profiles = profileRecords.map((fields) => fields.length === 5 && /^profile:[a-z0-9][a-z0-9._-]*$/.test(fields[1] ?? "") && safe.test(fields[2] ?? "") && /^(?:[a-z0-9][a-z0-9._/-]*)(?:,[a-z0-9][a-z0-9._/-]*)*$/.test(fields[3] ?? "") && ["selected", "available"].includes(fields[4] ?? "") ? { id: fields[1]!, bootstrapSelector: fields[2]!, dotfileSelectors: fields[3]!.split(","), selected: fields[4] === "selected" } : undefined);
  const expectations = expectationRecords.map((fields) => fields.length === 9 && fields.slice(1).every((field) => safe.test(field ?? "")) && /^profile:/.test(fields[1] ?? "") && ["any", "darwin", "linux"].includes(fields[2] ?? "") && ["program", "dependency"].includes(fields[6] ?? "") ? { profileId: fields[1]!, platform: fields[2] as "any" | "darwin" | "linux", selector: fields[3]!, source: fields[4]!, concern: fields[5]!, kind: fields[6] as "program" | "dependency", id: fields[7]!, probe: fields[8]! } : undefined);
  const evidence = evidenceRecords.map((fields) => fields.length === 7 && ["program", "dependency"].includes(fields[0] ?? "") && safe.test(fields[1] ?? "") && ["present", "missing", "unavailable"].includes(fields[2] ?? "") && fields.slice(3).every((field) => field === "unavailable") ? { kind: fields[0] as "program" | "dependency", id: fields[1]!, availability: fields[2] as Availability, version: "unavailable" as const, configuration: "unavailable" as const, dotfileStow: "unavailable" as const, acquisition: "unavailable" as const } : undefined);
  const omarchyValue = omarchy?.length === 4 && omarchy[0] === "omarchy" && omarchy[1] === "observed" && /^\d+\.\d+\.\d+$/.test(omarchy[2] ?? "") && ["omarchy-3", "omarchy-4", "unknown"].includes(omarchy[3] ?? "") ? { availability: "observed" as const, version: omarchy[2]!, generation: omarchy[3] as "omarchy-3" | "omarchy-4" | "unknown" } : omarchy?.length === 4 && omarchy[0] === "omarchy" && omarchy[1] === "unavailable" && safe.test(omarchy[2] ?? "") && omarchy[3] === "-" ? { availability: "unavailable" as const, reason: omarchy[2]! } : undefined;
  const profileIds = profiles.map((value) => value?.id ?? "");
  const expectationIds = expectationRecords.map((fields) => fields.slice(1).join("\t"));
  const evidenceIds = evidence.map((value) => value?.id ?? "");
  if (profiles.some((value) => value === undefined)) return invalid(text, "source-profile-field");
  if (expectations.some((value) => value === undefined)) return invalid(text, "source-expectation-field");
  if (evidence.some((value) => value === undefined)) return invalid(text, "source-evidence-field");
  if (omarchyValue === undefined) return invalid(text, "source-omarchy-field");
  const profileSet = new Set(profileIds);
  const evidenceSet = new Set(evidenceIds);
  const expectationKeys = expectations.map((value) => `${value?.profileId}\t${value?.platform}\t${value?.selector}\t${value?.source}`);
  const linked = expectations.every((value) => value !== undefined && profileSet.has(value.profileId) && value.id.startsWith(`${value.kind}:`) && evidenceSet.has(value.id)) && evidence.every((value) => value !== undefined && expectations.some((expectation) => expectation?.id === value.id && expectation.kind === value.kind));
  const canonical = profiles.filter((value) => value?.selected).length === 1 && ordered(profileIds) && ordered(expectationIds) && ordered(evidenceIds) && new Set(expectationKeys).size === expectationKeys.length && new Set(lines).size === lines.length;
  if (!linked) return invalid(text, "source-incomplete");
  if (!canonical) return invalid(text, "source-order-or-duplicate");
  return Result.succeed({ sourceFingerprint: fingerprint[1]!, platform: { name: platform[1] as WorkstationSource["platform"]["name"], architecture: platform[2] as WorkstationSource["platform"]["architecture"] }, omarchy: omarchyValue, profiles: profiles as WorkstationSource["profiles"], expectations: expectations as WorkstationSource["expectations"], evidence: evidence as WorkstationSource["evidence"] });
};
