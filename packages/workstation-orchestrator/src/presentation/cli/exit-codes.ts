import type { PublicStatus } from "../../application/contracts/public-result.js";

export const exitCodes = {
  completed: 0,
  refused: 2,
  unsupported: 3,
  ambiguous: 4,
  stale: 5,
  "invalid-request": 64,
  failed: 70,
  "timed-out": 124,
  cancelled: 130,
} as const satisfies Record<PublicStatus, number>;

export const exitCodeFor = (status: PublicStatus) => exitCodes[status];
