import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { BashOperationalFailure, BootstrapRequest, DotfilesRequest, InvalidContract, Refused, SourceRequest, WorkstationSource } from "../contracts/bash.js";

export interface BashReceipt { readonly evidenceDigest: string; }
export interface BashBridgeShape {
  readonly dotfiles: (request: DotfilesRequest) => Effect.Effect<BashReceipt, InvalidContract | Refused | BashOperationalFailure>;
  readonly bootstrap: (request: BootstrapRequest) => Effect.Effect<BashReceipt, InvalidContract | Refused | BashOperationalFailure>;
  readonly source: (request: SourceRequest) => Effect.Effect<WorkstationSource, InvalidContract | Refused | BashOperationalFailure>;
}

export class BashBridge extends Context.Service<BashBridge, BashBridgeShape>()("BashBridge", {
  make: Effect.never,
}) {
  static readonly layer = Layer.effect(this, this.make);
}
