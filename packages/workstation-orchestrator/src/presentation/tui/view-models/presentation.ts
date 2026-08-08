import { sanitizePublicResultV2, type PublicResultV2 } from "../../../application/contracts/public-result.js";

export const tuiViewIds = ["overview", "platform-policy", "profiles", "programs", "plans", "blockers", "evidence", "backups"] as const;
export type TuiViewId = typeof tuiViewIds[number];
export type TuiLayout = "split" | "stacked";

export type TuiView = {
  readonly id: TuiViewId;
  readonly title: string;
  readonly shortTitle: string;
  readonly role: "region";
  readonly accessibleLabel: string;
  readonly items: readonly string[];
};

export type TuiPresentation = {
  readonly result: PublicResultV2;
  readonly layout: TuiLayout;
  readonly views: readonly TuiView[];
};

const titles: Record<TuiViewId, readonly [string, string]> = {
  overview: ["Overview", "Overview"],
  "platform-policy": ["Platform & Policy", "Platform"],
  profiles: ["Profiles", "Profiles"],
  programs: ["Programs", "Programs"],
  plans: ["Plans", "Plans"],
  blockers: ["Blockers", "Blockers"],
  evidence: ["Evidence", "Evidence"],
  backups: ["Backups & restore guidance", "Backups"],
};

const assessmentItems = (result: PublicResultV2): readonly string[] => result.payload.kind === "assessment"
  ? [result.payload.platform, result.payload.policyId]
  : [];
const profileItems = (result: PublicResultV2): readonly string[] => result.payload.kind === "assessment" || result.payload.kind === "profiles"
  ? result.payload.profiles
  : [];
const programItems = (result: PublicResultV2): readonly string[] => result.payload.kind === "assessment"
  ? result.payload.programs.map(({ programId, packageState, configurationState, dotfileStowState }) => `${programId}: ${packageState}/${configurationState}/${dotfileStowState}`)
  : [];
const planItems = (result: PublicResultV2): readonly string[] => result.payload.kind === "plan"
  ? [result.payload.planId, result.payload.bindingDigest, result.payload.provider, result.payload.providerRole]
  : [];
const backupItems = (result: PublicResultV2): readonly string[] => result.payload.kind === "assessment"
  ? result.payload.backups
  : result.payload.kind === "backup"
    ? [result.payload.backupId, result.payload.targetId, ...result.payload.identityEvidenceIds, ...result.payload.integrityEvidenceIds, result.payload.eligibility]
    : result.payload.kind === "guidance"
      ? [result.payload.backupId, result.payload.targetId, ...result.payload.prerequisites, ...result.payload.steps, ...result.payload.checks, ...result.payload.stopConditions]
    : [];

const itemsFor = (id: TuiViewId, result: PublicResultV2): readonly string[] => {
  const byId: Record<TuiViewId, readonly string[]> = {
    overview: [result.operation, result.status],
    "platform-policy": assessmentItems(result),
    profiles: profileItems(result),
    programs: programItems(result),
    plans: planItems(result),
    blockers: result.blockers.map(({ code }) => code),
    evidence: result.evidence.map(({ evidenceId, strength, summaryCode }) => `${evidenceId}: ${strength}/${summaryCode}`),
    backups: backupItems(result),
  };
  return byId[id];
};

export const createTuiPresentation = (result: PublicResultV2, columns: number): TuiPresentation => {
  const safeResult = sanitizePublicResultV2(result);
  return {
    result: safeResult,
    layout: columns < 80 ? "stacked" : "split",
    views: tuiViewIds.map((id) => {
    const [title, shortTitle] = titles[id];
      return { id, title, shortTitle, role: "region", accessibleLabel: title, items: itemsFor(id, safeResult) };
    }),
  };
};

export type TuiState = {
  readonly result: PublicResultV2;
  readonly viewId: TuiViewId;
  readonly focusIndex: number;
  readonly selectedId?: string;
  readonly overlay?: "details";
};

const viewIndexForKey = (key: string): number | undefined => /^[1-8]$/.test(key) ? Number(key) - 1 : undefined;

export const createTuiController = (result: PublicResultV2, columns: number) => {
  const safeResult = sanitizePublicResultV2(result);
  const presentation = createTuiPresentation(safeResult, columns);
  let state: TuiState = { result: safeResult, viewId: "overview", focusIndex: 0, overlay: undefined };
  const currentItems = (): readonly string[] => presentation.views.find((view) => view.id === state.viewId)?.items ?? [];
  const select = (delta: number): void => {
    const items = currentItems();
    if (items.length === 0) return;
    const current = state.selectedId === undefined ? 0 : Math.max(0, items.findIndex((item) => item.startsWith(state.selectedId ?? "")));
    state = { ...state, selectedId: items[(current + delta + items.length) % items.length]?.split(": ")[0] };
  };

  return {
    presentation,
    state: (): TuiState => state,
    handleKey: (key: string): void => {
      if (state.overlay !== undefined) {
        if (key === "Escape") state = { ...state, overlay: undefined };
        else if (key === "Tab") state = { ...state, focusIndex: (state.focusIndex + 1) % 2 };
        return;
      }
      const viewIndex = viewIndexForKey(key);
      if (viewIndex !== undefined) {
        state = { ...state, viewId: tuiViewIds[viewIndex]!, focusIndex: 0, selectedId: undefined };
      } else if (key === "Tab") state = { ...state, focusIndex: (state.focusIndex + 1) % 2 };
      else if (key === "Shift+Tab") state = { ...state, focusIndex: (state.focusIndex + 1) % 2 };
      else if (key === "Enter") state = { ...state, overlay: "details" };
      else if (key === "ArrowDown") select(1);
      else if (key === "ArrowUp") select(-1);
    },
  };
};
