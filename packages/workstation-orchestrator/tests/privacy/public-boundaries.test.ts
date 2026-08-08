import { describe, expect, test } from "vitest";
import type { PublicResultV2 } from "../../src/application/contracts/public-result.js";
import { sanitizePublicResultV2 } from "../../src/application/contracts/public-result.js";
import { createPresentationSession } from "../../src/presentation/atoms/request-session.js";
import { encodePublicResult } from "../../src/presentation/cli/public-result-encoder.js";
import { createTuiPresentation } from "../../src/presentation/tui/view-models/presentation.js";

const unsafe = {
  version: "PublicResultV2", operation: "show_backup", status: "completed", correlationId: "request:privacy",
  payload: { kind: "backup", backupId: "backup:weekly", targetId: "target:dotfiles", eligibility: "verified", identityEvidenceIds: ["evidence:identity"], integrityEvidenceIds: ["evidence:integrity"] },
  blockers: [], evidence: [{ evidenceId: "evidence:private", strength: "structural", summaryCode: "/home/alice/.local/share/omarchy secret=token" }], nextActions: ["inspect-results"],
} as unknown as PublicResultV2;

describe("public privacy boundaries", () => {
  test("redacts unsafe public values before JSON, Atom, hooks/view models, and TUI diagnostics", async () => {
    const safe = sanitizePublicResultV2(unsafe);
    const encoded = new TextDecoder().decode(encodePublicResult(safe));
    const session = createPresentationSession({ invoke: async () => safe });
    await session.run({ version: "AgentRequestV1", requestId: "request:privacy", operation: "show_backup", input: { backupId: "backup:weekly" }, timeoutSeconds: 30 });
    const tui = createTuiPresentation(session.state().result as PublicResultV2, 120);

    expect(safe).toMatchObject({ status: "failed", payload: { kind: "unavailable" }, evidence: [], nextActions: [] });
    expect(`${encoded}${JSON.stringify(session.state())}${JSON.stringify(tui)}`).not.toMatch(/alice|secret|token|\.local\/share|\/home/);
  });

  test("preserves safe symbolic values while refusing direct backup path and execution-shaped input", () => {
    const safe = sanitizePublicResultV2({ ...unsafe, evidence: [{ evidenceId: "evidence:backup", strength: "structural", summaryCode: "backup-verified" }] });
    expect(safe).toMatchObject({ status: "completed", payload: { backupId: "backup:weekly", targetId: "target:dotfiles" } });
    expect(new TextDecoder().decode(encodePublicResult(safe))).not.toMatch(/stderr|stdout|argv|restore/);
  });
});
