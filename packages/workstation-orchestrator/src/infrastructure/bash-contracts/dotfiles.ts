import * as Result from "effect/Result";
import { InvalidContract, evidenceFingerprint } from "../../application/contracts/bash.js";

export type Inventory = { readonly records: readonly { readonly path: string; readonly type: "file" | "executable" | "symlink"; readonly digest: string }[] };
const sha = /^sha256:[a-f0-9]{64}$/;
const path = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const invalid = (text: string, code: string) => Result.fail(new InvalidContract({ code, evidenceDigest: evidenceFingerprint(text) }));

const inventoryTypes = {
  file: { mode: "100644", validValue: sha },
  executable: { mode: "100755", validValue: sha },
  symlink: { mode: "120000", validValue: path },
} as const;

const record = (line: string) => {
  const fields = line.split("\t");
  const [tag, name, rawType, mode, size, value, group, platform, inclusion, approval, status] = fields;
  const type = inventoryTypes[rawType as keyof typeof inventoryTypes];
  const valid = fields.length === 11 && tag === "file" && name !== undefined && path.test(name) && group !== undefined && path.test(group) && ["arch/omarchy", "macos", "shared"].includes(platform ?? "") && inclusion === "include" && approval === "approved" && ["clear", "reviewed-reference", "media-separate"].includes(status ?? "") && /^\d+$/.test(size ?? "") && type !== undefined && type.mode === mode && type.validValue.test(value ?? "");
  return !valid || value === undefined ? undefined : { path: name, type: rawType as keyof typeof inventoryTypes, digest: value };
};
export const parseInventory = (text: string): Result.Result<Inventory, InvalidContract> => {
  if (!text.endsWith("\n") || text.length === 0 || text.length > 262144 || /\r|secret|token|password|private[_-]?key|\/home\/|@/i.test(text)) return invalid(text, "inventory-bounds-or-privacy");
  const [header, ...lines] = text.slice(0, -1).split("\n");
  const records = lines.map(record);
  const complete = records.every((value): value is Inventory["records"][number] => value !== undefined);
  return header !== "schema\tinventory-v1" || records.length === 0 || !complete || new Set(records.map((value) => value.path)).size !== records.length ? invalid(text, "inventory-record") : Result.succeed({ records });
};
