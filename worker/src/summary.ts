import { cardSummary } from "../../app/src/lib/diagram/summary";
import type { SkopeDoc } from "../../app/src/lib/types";

const EMPTY = { kind: "", nodes: 0, edges: 0, tags: [], names: [], boxes: [], frames: [] };

/**
 * A diagram's card summary as stored in `diagrams.summary`, from its document's JSON: what the home page draws and
 * searches without loading documents (see `cardSummary` in the app, which lays it out by the canvas's rules).
 */
export function summaryText(docJson: string): string {
  try {
    return JSON.stringify(cardSummary(JSON.parse(docJson) as SkopeDoc));
  } catch {
    return JSON.stringify(EMPTY);
  }
}
