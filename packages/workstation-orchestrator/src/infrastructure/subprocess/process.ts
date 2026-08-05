import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { BashOperationalFailure } from "../../application/contracts/bash.js";

export type ProcessFailure = BashOperationalFailure;
export interface ProcessOutput { readonly exitCode: number; readonly stdout: string; }
export interface BashProcessShape { readonly run: (argv: readonly string[]) => Effect.Effect<ProcessOutput, ProcessFailure>; }

export class BashProcess extends Context.Service<BashProcess, BashProcessShape>()("BashProcess", {
  make: Effect.never,
}) {
  static readonly layer = Layer.effect(this, this.make);
}
