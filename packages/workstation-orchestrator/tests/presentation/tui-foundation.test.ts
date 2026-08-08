import { describe, expect, test } from "vitest";
import * as Schema from "effect/Schema";
import { AgentRequest } from "../../src/application/contracts/agent-request.js";
import type { PublicResultV2 } from "../../src/application/contracts/public-result.js";
import { createPresentationSession } from "../../src/presentation/atoms/request-session.js";
import { encodePublicResult } from "../../src/presentation/cli/public-result-encoder.js";
import { tuiPartsFoundation } from "../../src/presentation/tui/tuiparts/primitives.js";
import { workstationTheme } from "../../src/presentation/tui/tuiparts/theme/tokens.js";
import { createWorkstationTuiApp } from "../../src/presentation/tui/components/workstation-tui-app.js";
import { createTuiController, createTuiPresentation, tuiViewIds } from "../../src/presentation/tui/view-models/presentation.js";

const assessment: PublicResultV2 = {
  version: "PublicResultV2",
  operation: "assess_workstation",
  status: "completed",
  correlationId: "request:tui",
  payload: {
    kind: "assessment",
    platform: "macos",
    policyId: "policy:macos",
    profiles: ["profile:shared"],
    programs: [
      { programId: "program:neovim", packageState: "present", configurationState: "ready", dotfileStowState: "stow-ready" },
      { programId: "program:git", packageState: "missing", configurationState: "blocked", dotfileStowState: "blocked" },
    ],
    backups: ["backup:verified"],
  },
  blockers: [{ code: "operation-refused" }],
  evidence: [{ evidenceId: "evidence:platform", strength: "structural", summaryCode: "platform-observed" }],
  nextActions: ["inspect-results"],
};

describe("TUI presentation foundation", () => {
  test("keeps the V2 semantic result by reference while exposing all required read-only views", () => {
    const presentation = createTuiPresentation(assessment, 120);

    expect(presentation.result).toBe(assessment);
    expect(presentation.views.map((view) => view.id)).toEqual(tuiViewIds);
    expect(presentation.views.find((view) => view.id === "platform-policy")).toMatchObject({ title: "Platform & Policy", role: "region" });
    expect(presentation.views.find((view) => view.id === "backups")?.items).toContain("backup:verified");
  });

  test("routes keys, contains an overlay, and restores focus after dismissal", () => {
    const controller = createTuiController(assessment, 120);

    controller.handleKey("2");
    expect(controller.state()).toMatchObject({ viewId: "platform-policy", focusIndex: 0, overlay: undefined });
    controller.handleKey("Enter");
    controller.handleKey("3");
    expect(controller.state()).toMatchObject({ viewId: "platform-policy", overlay: "details" });
    controller.handleKey("Escape");
    expect(controller.state()).toMatchObject({ viewId: "platform-policy", focusIndex: 0, overlay: undefined });
    controller.handleKey("Tab");
    expect(controller.state().focusIndex).toBe(1);
  });

  test("moves collection selection without changing shared semantics", () => {
    const controller = createTuiController(assessment, 120);

    controller.handleKey("4");
    controller.handleKey("ArrowDown");
    expect(controller.state()).toMatchObject({ viewId: "programs", selectedId: "program:git" });
    expect(controller.state().result).toBe(assessment);
  });

  test("preserves every defined V2 outcome without translating it into presentation status", () => {
    const statuses = ["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "timed-out", "cancelled", "failed"] as const;

    for (const status of statuses) {
      const result: PublicResultV2 = {
        ...assessment,
        operation: "show_evidence",
        status,
        payload: { kind: "unavailable", operation: "show_evidence", reason: "service-not-implemented" },
      };
      const presentation = createTuiPresentation(result, 120);

      expect(presentation.result).toBe(result);
      expect(presentation.views[0]?.items).toEqual(["show_evidence", status]);
    }
  });

  test("uses narrow-terminal fallbacks with accessible text and explicit local tokens", () => {
    const presentation = createTuiPresentation(assessment, 72);

    expect(presentation.layout).toBe("stacked");
    expect(presentation.views[0]).toMatchObject({ role: "region", accessibleLabel: "Overview", items: ["assess_workstation", "completed"] });
    expect(workstationTheme).toEqual(expect.objectContaining({ foreground: "#e8edf2", accent: "#79c0ff" }));
  });

  test("keeps Solid presentation state local while rendering the same shared result", () => {
    const app = createWorkstationTuiApp(assessment, 120);

    app.onResize(72);
    app.onKey("5");
    expect(app.presentation()).toMatchObject({ layout: "stacked", result: assessment });
    expect(app.state()).toMatchObject({ viewId: "plans" });
  });

  test("binds correctness-critical interaction behavior to packaged TuiParts and OpenTUI adapters", () => {
    expect(tuiPartsFoundation.tabs.Root).toBeTypeOf("function");
    expect(tuiPartsFoundation.dialog.Root).toBeTypeOf("function");
    expect(tuiPartsFoundation.keyboard).toBeTypeOf("function");
    expect(tuiPartsFoundation.resize).toBeTypeOf("function");
  });

  test("keeps JSON, Atom, and TUI on the exact same V2 result for every public outcome", async () => {
    const request = Schema.decodeUnknownSync(AgentRequest)({
      version: "AgentRequestV1", requestId: "request:tui", operation: "assess_workstation", input: { programIds: [] }, timeoutSeconds: 30,
    });
    const statuses = ["completed", "refused", "unsupported", "ambiguous", "stale", "invalid-request", "timed-out", "cancelled", "failed"] as const;

    for (const status of statuses) {
      const result: PublicResultV2 = {
        ...assessment,
        operation: "assess_workstation",
        status,
        payload: { kind: "unavailable", operation: "assess_workstation", reason: "service-not-implemented" },
      };
      const session = createPresentationSession({ invoke: async () => result });
      await session.run(request);
      const encoded = JSON.parse(new TextDecoder().decode(encodePublicResult(result))) as PublicResultV2;

      expect(encoded).toEqual(result);
      expect(session.state().result).toBe(result);
      expect(createTuiPresentation(result, 120).result).toBe(session.state().result);
    }
  });
});
