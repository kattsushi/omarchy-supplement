import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type { BashOperationalFailure, BootstrapRequest, DotfilesRequest, InvalidContract, Refused } from "../contracts/bash.js";

export interface BashReceipt { readonly evidenceDigest: string; }
export interface BashBridgeShape {
readonly dotfiles: (request: DotfilesRequest) => Effect.Effect<BashReceipt, InvalidContract | Refused | BashOperationalFailure>;
  readonly bootstrap: (request: BootstrapRequest) => Effect.Effect<BashReceipt, InvalidContract | Refused | BashOperationalFailure>;
}
export const BashBridge = Context.Service<BashBridgeShape>("BashBridge");
