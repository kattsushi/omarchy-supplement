import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

export type CliRoute = { readonly kind: "agent" | "tui" | "help" | "invalid" };
const agent = Command.make("agent", { request: Argument.string("request"), help: Flag.boolean("help") }, () => Effect.void);
const tui = Command.make("tui", { help: Flag.boolean("help") }, () => Effect.void);
export const cliCommand = Command.make("workstation").pipe(Command.withSubcommands([agent, tui]));
// Kept here as the replaceable unstable adapter boundary; process framing stays outside it.
export const runCliAdapter = Command.runWith(cliCommand, { version: "0.0.0" });

const routeByName = {
  agent: { kind: "agent" },
  tui: { kind: "tui" },
} as const satisfies Record<string, CliRoute>;

export const classifyRoute = (argv: readonly string[]): CliRoute => {
  if (argv.length === 0 || (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))) return { kind: "help" };
  if (argv.length !== 1) return { kind: "invalid" };
  return routeByName[argv[0] as keyof typeof routeByName] ?? { kind: "invalid" };
};
