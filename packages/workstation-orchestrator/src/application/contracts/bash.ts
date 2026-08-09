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
export const WorkstationSource = Schema.Struct({
  sourceFingerprint: Schema.String,
  platform: Schema.Struct({ name: Schema.Literals(["linux", "macos", "unknown"]), architecture: Schema.Literals(["x86_64", "aarch64", "unknown"]) }),
  omarchy: Schema.Union([
    Schema.Struct({ availability: Schema.Literal("observed"), version: Schema.String, generation: Schema.Literals(["omarchy-3", "omarchy-4"]) }),
    Schema.Struct({ availability: Schema.Literal("unavailable"), reason: Schema.String }),
  ]),
  profiles: Schema.Array(Schema.Struct({ id: Schema.String, bootstrapSelector: Schema.String, dotfileSelectors: Schema.Array(Schema.String), selected: Schema.Boolean })),
  expectations: Schema.Array(Schema.Struct({ profileId: Schema.String, platform: Schema.Literals(["any", "darwin", "linux"]), selector: Schema.String, source: Schema.String, concern: Schema.String, kind: Schema.Literals(["program", "dependency"]), id: Schema.String, probe: Schema.String })),
  evidence: Schema.Array(Schema.Struct({ kind: Schema.Literals(["program", "dependency"]), id: Schema.String, availability: Schema.Literals(["present", "missing", "unavailable"]), version: Schema.Literal("unavailable"), configuration: Schema.Literal("unavailable"), dotfileStow: Schema.Literal("unavailable"), acquisition: Schema.Literal("unavailable") })),
});
export type WorkstationSource = typeof WorkstationSource.Type;
export type ParsedWorkstationSourceResult = Result.Result<WorkstationSource, InvalidContract | Refused | BashOperationalFailure>;

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
