import type { DomainBlockerCode } from "../../src/domain/states";

export interface DomainFixture {
  readonly name: "completed" | "refused" | "unsupported" | "ambiguous" | "stale" | "failed" | "missing-provider" | "unsafe-mapping" | "fallback-not-opted-in" | "unverified-evidence";
  readonly blocker?: DomainBlockerCode;
  readonly evidenceIds: readonly string[];
}

export const domainFixtures: readonly DomainFixture[] = [
  { name: "completed", evidenceIds: ["evidence:completed"] },
  { name: "refused", blocker: "confirmation-declined", evidenceIds: ["evidence:confirmation"] },
  { name: "unsupported", blocker: "package-unsupported", evidenceIds: ["evidence:policy"] },
  { name: "ambiguous", blocker: "provider-capability-ambiguous", evidenceIds: ["evidence:capability"] },
  { name: "stale", blocker: "plan-stale", evidenceIds: ["evidence:binding"] },
  { name: "failed", blocker: "provider-execution-failed", evidenceIds: ["evidence:provider"] },
  { name: "missing-provider", blocker: "provider-missing", evidenceIds: ["evidence:provider"] },
  { name: "unsafe-mapping", blocker: "package-mapping-unsafe", evidenceIds: ["evidence:mapping"] },
  { name: "fallback-not-opted-in", blocker: "fallback-not-opted-in", evidenceIds: ["evidence:fallback"] },
  { name: "unverified-evidence", blocker: "native-evidence-unverified", evidenceIds: ["evidence:macos"] },
] as const;
