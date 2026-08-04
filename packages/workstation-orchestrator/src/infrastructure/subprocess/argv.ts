import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Result from "effect/Result";
import { BashOperationalFailure, decodeBootstrapRequest, decodeDotfilesRequest, evidenceFingerprint, type BootstrapRequest as Bootstrap, type DotfilesRequest as Dotfiles, InvalidContract, Refused } from "../../application/contracts/bash.js";
import { BashBridge } from "../../application/ports/bash.js";
import { BashProcess, type ProcessOutput } from "./process.js";

type Request = Dotfiles | Bootstrap;
type Descriptor = { readonly example: Request; readonly argv: (request: Request) => readonly string[]; readonly request: (argv: readonly string[]) => unknown | undefined; };
const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
const command = (form: Request["form"], example: Request, argv: (request: Request) => readonly string[], request: (value: readonly string[]) => unknown | undefined): Descriptor => ({ example, argv, request });
const dotfiles = (form: Dotfiles["form"], extra: readonly string[] = []) => ["workstation-dotfiles", ...form.split("-"), ...extra];

export const commandDescriptors: readonly Descriptor[] = [
  command("inventory-verify", { form: "inventory-verify" }, () => dotfiles("inventory-verify"), (a) => same(a, dotfiles("inventory-verify")) ? { form: "inventory-verify" } : undefined),
  command("source-verify", { form: "source-verify" }, () => dotfiles("source-verify"), (a) => same(a, dotfiles("source-verify")) ? { form: "source-verify" } : undefined),
  command("materialize-fingerprint", { form: "materialize-fingerprint" }, () => dotfiles("materialize-fingerprint"), (a) => same(a, dotfiles("materialize-fingerprint")) ? { form: "materialize-fingerprint" } : undefined),
  command("materialize-inspect", { form: "materialize-inspect", target: "target:managed" }, (r) => r.form === "materialize-inspect" ? dotfiles(r.form, ["--target", r.target]) : [], (a) => a.length === 5 && a[0] === "workstation-dotfiles" && a[1] === "materialize" && a[2] === "inspect" && a[3] === "--target" ? { form: "materialize-inspect", target: a[4] } : undefined),
  command("stow-packages", { form: "stow-packages", profile: "base", platform: "linux" }, (r) => r.form === "stow-packages" ? dotfiles(r.form, ["--profile", r.profile, "--platform", r.platform]) : [], (a) => a.length === 7 && a[0] === "workstation-dotfiles" && a[1] === "stow" && a[2] === "packages" && a[3] === "--profile" && a[5] === "--platform" ? { form: "stow-packages", profile: a[4], platform: a[6] } : undefined),
  ...(["stow-check", "stow-verify"] as const).map((form) => command(form, { form, profile: "base", platform: "linux", target: "target:managed" }, (r) => r.form === form ? dotfiles(r.form, ["--profile", r.profile, "--platform", r.platform, "--target", r.target]) : [], (a) => a.length === 9 && a[0] === "workstation-dotfiles" && a[1] === "stow" && a[2] === form.slice(5) && a[3] === "--profile" && a[5] === "--platform" && a[7] === "--target" ? { form, profile: a[4], platform: a[6], target: a[8] } : undefined)),
  ...(["plan", "check"] as const).map((form) => command(form, { form, profiles: ["base"] }, (r) => r.form === form ? ["workstation-bootstrap", form, ...r.profiles.flatMap((profile) => ["--profile", profile])] : [], (a) => a[0] === "workstation-bootstrap" && a[1] === form && a.length > 3 && a.slice(2).every((part, index) => index % 2 ? true : part === "--profile") ? { form, profiles: a.filter((_, index) => index > 1 && index % 2 === 1) } : undefined)),
];
const compile = (request: Request) => commandDescriptors.find((descriptor) => descriptor.example.form === request.form)?.argv(request);
const decode = (input: unknown) => Match.value(input).pipe(Match.when({ form: "plan" }, decodeBootstrapRequest), Match.when({ form: "check" }, decodeBootstrapRequest), Match.orElse(decodeDotfilesRequest));
export const isAllowedArgv = (argv: readonly string[]) => commandDescriptors.some((descriptor) => {
  const request = descriptor.request(argv);
  const parsed = request === undefined ? undefined : decode(request);
  return parsed !== undefined && Result.isSuccess(parsed) && same(descriptor.argv(parsed.success), argv);
});

const receipt = (output: ProcessOutput) => ({ evidenceDigest: evidenceFingerprint(output.stdout) });
export const bashBridgeLayer = Layer.effect(BashBridge, Effect.gen(function*() {
  const process = yield* BashProcess;
  const run = (request: Request) => Effect.gen(function*() {
    const argv = compile(request);
    if (!argv || !isAllowedArgv(argv)) return yield* new InvalidContract({ code: "request-invalid", evidenceDigest: "fingerprint:request" });
    const output = yield* process.run(argv);
    if (output.exitCode === 2) return yield* new Refused({ code: "command-refused", evidenceDigest: receipt(output).evidenceDigest });
    if (output.exitCode !== 0) return yield* new BashOperationalFailure({ code: "exit", evidenceDigest: receipt(output).evidenceDigest });
    return receipt(output);
  });
  return { dotfiles: (request: Dotfiles) => run(request), bootstrap: (request: Bootstrap) => run(request) };
}));
