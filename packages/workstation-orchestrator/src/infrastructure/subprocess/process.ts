import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type { BashOperationalFailure } from "../../application/contracts/bash.js";

export type ProcessFailure = BashOperationalFailure;
export interface ProcessOutput { readonly exitCode: number; readonly stdout: string; }
export interface BashProcessShape { readonly run: (argv: readonly string[]) => Effect.Effect<ProcessOutput, ProcessFailure>; }
export const BashProcess = Context.Service<BashProcessShape>("BashProcess");
