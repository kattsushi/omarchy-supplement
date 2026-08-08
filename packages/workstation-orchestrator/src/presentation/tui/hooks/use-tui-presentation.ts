import type { RequestProjection } from "../../view-models/request-state.js";
import { createTuiPresentation, type TuiPresentation } from "../view-models/presentation.js";

export const useTuiPresentation = (request: RequestProjection, columns: number): TuiPresentation | undefined => {
  const result = request.result;
  return result?.version === "PublicResultV2" ? createTuiPresentation(result, columns) : undefined;
};
