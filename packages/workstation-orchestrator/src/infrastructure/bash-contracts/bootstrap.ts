import * as Result from "effect/Result";
import { InvalidContract, Refused, evidenceFingerprint } from "../../application/contracts/bash.js";

export type Brf = { readonly platform: "linux" | "darwin"; readonly architecture: string; readonly profiles: readonly string[]; readonly complete: boolean; readonly actions: readonly { readonly id: string; readonly state: "noop" | "execute" | "blocked" }[] };
const safe = /^[a-z0-9][a-z0-9._@-]*$/;
const sha = /^sha256:[a-f0-9]{64}$/;
const invalid = (text: string, code: string) => Result.fail(new InvalidContract({ code, evidenceDigest: evidenceFingerprint(text) }));
const actionStates = {
  noop: (id: string): Brf["actions"][number] => ({ id, state: "noop" }),
  execute: (id: string): Brf["actions"][number] => ({ id, state: "execute" }),
  blocked: (id: string): Brf["actions"][number] => ({ id, state: "blocked" }),
} as const;

const action = (fields: readonly string[]): Brf["actions"][number] | undefined => {
  const [tag, id = "", subject = "", order = "", requirement = "", source = "", desired = "", state = "", mode = ""] = fields;
  const actionState = actionStates[state as keyof typeof actionStates];
  const valid = fields.length === 9 && tag === "action" && safe.test(id) && safe.test(subject) && /^\d+$/.test(order) && ["required", "optional"].includes(requirement) && safe.test(source) && safe.test(desired) && actionState !== undefined && ["automatic", "unsupported"].includes(mode);
  return !valid ? undefined : actionState(id);
};
export const parseBrf = (text: string): Result.Result<Brf, InvalidContract | Refused> => {
  if (!text.endsWith("\n") || text.length > 262144 || /\r|secret|token|password|private[_-]?key|\/home\/|@/i.test(text)) return invalid(text, "brf-bounds-or-privacy");
  const [schema, plan, ...records] = text.slice(0, -1).split("\n");
  const fields = records.map((line) => line.split("\t"));
  const profiles = fields.filter(([tag]) => tag === "profile").map(([, value]) => value);
  const platform = fields.find(([tag]) => tag === "platform");
  const actions = fields.filter(([tag]) => tag === "action").map(action);
  const complete = fields.find(([tag]) => tag === "profile_complete")?.[1];
  const known = fields.every(([tag, ...rest]) => tag === "platform" ? ["linux", "darwin"].includes(rest[0] ?? "") && /^(x86_64|aarch64|arm64)$/.test(rest[1] ?? "") : ["engine_digest", "catalog_digest"].includes(tag ?? "") ? sha.test(rest[0] ?? "") : tag === "profile" ? safe.test(rest[0] ?? "") && rest.length === 1 : tag === "action" ? action([tag, ...rest]) !== undefined : tag === "input_pin" ? rest.length === 3 : tag === "block" ? rest.length === 5 : tag === "profile_complete" ? rest.length === 1 && ["true", "false"].includes(rest[0] ?? "") : false);
  const ordered = <A extends string>(values: readonly A[]) => values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);
  const completeActions = actions.every((value): value is NonNullable<typeof value> => value !== undefined);
  if (schema !== "schema\tbrf-v1" || plan !== "plan_schema\tv1" || !known || !ordered(profiles.filter((value): value is string => value !== undefined)) || !completeActions || !ordered(actions.map((value) => value?.id ?? "")) || !fields.some(([tag]) => tag === "platform") || !fields.some(([tag]) => tag === "engine_digest") || !fields.some(([tag]) => tag === "catalog_digest") || profiles.length === 0 || actions.length === 0 || complete === undefined) return invalid(text, "brf-record");
  if (complete === "false") return Result.fail(new Refused({ code: "profile-incomplete", evidenceDigest: evidenceFingerprint(text) }));
  return Result.succeed({ platform: platform?.[1] as Brf["platform"], architecture: platform?.[2] ?? "", profiles: profiles.filter((value): value is string => value !== undefined), actions, complete: true });
};
