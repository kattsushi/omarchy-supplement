import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export class InvalidContract extends Data.TaggedError("InvalidContract")<{ readonly code: string; readonly evidenceDigest: string }> {}
export class Refused extends Data.TaggedError("Refused")<{ readonly code: string; readonly evidenceDigest: string }> {}
export class BashOperationalFailure extends Data.TaggedError("BashOperationalFailure")<{
  readonly code: "timeout" | "output-limit" | "spawn" | "exit";
  readonly evidenceDigest: string;
}> {}

export const LogicalProfile = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]{0,63}$/));
export const SourceProfile = Schema.String.check(Schema.isPattern(/^profile:[a-z0-9][a-z0-9._-]{0,63}$/));
export const LogicalTarget = Schema.String.check(Schema.isPattern(/^target:[a-z0-9][a-z0-9._-]{0,63}$/));
export const Platform = Schema.Literals(["linux", "darwin", "macos"]);
export const DotfilesRequest = Schema.Union([
  Schema.Struct({ form: Schema.Literals(["inventory-verify", "source-verify", "materialize-fingerprint"]) }),
  Schema.Struct({ form: Schema.Literal("materialize-inspect"), target: LogicalTarget }),
  Schema.Struct({ form: Schema.Literal("stow-packages"), profile: LogicalProfile, platform: Platform }),
  Schema.Struct({ form: Schema.Literals(["stow-check", "stow-verify"]), profile: LogicalProfile, platform: Platform, target: LogicalTarget }),
]);
export type DotfilesRequest = typeof DotfilesRequest.Type;
export const BootstrapRequest = Schema.Struct({ form: Schema.Literals(["plan", "check"]), profiles: Schema.Array(LogicalProfile).check(Schema.isMinLength(1), Schema.isMaxLength(8)) });
export type BootstrapRequest = typeof BootstrapRequest.Type;
export const SourceRequest = Schema.Struct({ form: Schema.Literal("observe"), profile: SourceProfile });
export type SourceRequest = typeof SourceRequest.Type;
export type WorkstationSource = {
  readonly sourceFingerprint: string;
  readonly platform: { readonly name: "linux" | "macos" | "unknown"; readonly architecture: "x86_64" | "aarch64" | "unknown" };
  readonly omarchy: { readonly availability: "observed"; readonly version: string; readonly generation: "omarchy-3" | "omarchy-4" } | { readonly availability: "unavailable"; readonly reason: string };
  readonly profiles: readonly { readonly id: string; readonly bootstrapSelector: string; readonly dotfileSelectors: readonly string[]; readonly selected: boolean }[];
  readonly expectations: readonly { readonly profileId: string; readonly platform: "any" | "darwin" | "linux"; readonly selector: string; readonly source: string; readonly concern: string; readonly kind: "program" | "dependency"; readonly id: string; readonly probe: string }[];
  readonly evidence: readonly { readonly kind: "program" | "dependency"; readonly id: string; readonly availability: "present" | "missing" | "unavailable"; readonly version: "unavailable"; readonly configuration: "unavailable"; readonly dotfileStow: "unavailable"; readonly acquisition: "unavailable" }[];
};

const fingerprint = (text: string) => `fingerprint:${Array.from(text).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261).toString(16)}`;
export const decodeDotfilesRequest = (input: unknown): Result.Result<DotfilesRequest, InvalidContract> => {
  try { return Result.succeed(Schema.decodeUnknownSync(DotfilesRequest)(input)); }
  catch { return Result.fail(new InvalidContract({ code: "request-invalid", evidenceDigest: fingerprint(JSON.stringify(input)) })); }
};
export const decodeBootstrapRequest = (input: unknown): Result.Result<BootstrapRequest, InvalidContract> => {
  try { return Result.succeed(Schema.decodeUnknownSync(BootstrapRequest)(input)); }
  catch { return Result.fail(new InvalidContract({ code: "request-invalid", evidenceDigest: fingerprint(JSON.stringify(input)) })); }
};
export const decodeSourceRequest = (input: unknown): Result.Result<SourceRequest, InvalidContract> => {
  try { return Result.succeed(Schema.decodeUnknownSync(SourceRequest)(input)); }
  catch { return Result.fail(new InvalidContract({ code: "request-invalid", evidenceDigest: fingerprint(JSON.stringify(input)) })); }
};
export const evidenceFingerprint = fingerprint;
