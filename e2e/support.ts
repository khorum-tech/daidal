import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { ownerBackup } from "../stage/diagrams";

/** Who the tests are signed in as (the Worker's DEV_USER_EMAIL under `wrangler dev`). */
export const OWNER = "e2e-owner@example.com";

export interface Imported {
  team: string;
  /** Diagram ids in the imported Platform team, by name. */
  diagrams: Record<string, string>;
}

/**
 * Import the stage data's owner file (a personal workspace and the Platform team) through the real import API. Each
 * call makes a new Platform team, so tests never share one; the personal workspace collects a copy per call.
 */
export async function importStageData(request: APIRequestContext): Promise<Imported> {
  const res = await request.post("/api/workspaces/import", { data: ownerBackup() });
  expect(res.status()).toBe(201);
  const { workspaces } = (await res.json()) as { workspaces: { id: string; name: string }[] };
  const team = workspaces.find(w => w.name === "Platform team")!.id;
  const list = (await (await request.get(`/api/diagrams?workspace=${encodeURIComponent(team)}`)).json()) as { id: string; name: string }[];
  return { team, diagrams: Object.fromEntries(list.map(d => [d.name, d.id])) };
}

/** One finger from (x, y) by (dx, dy), in steps, as raw touch events. With [alt], Alt is held (no snapping). */
export async function swipe(page: Page, x: number, y: number, dx: number, dy: number, alt = false) {
  const cdp = await page.context().newCDPSession(page);
  const modifiers = alt ? 1 : 0;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }], modifiers });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }], modifiers });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], modifiers });
}

/** The canvas's current offset and scale. */
export const sheet = (page: Page) =>
  page.getByTestId("diagram-sheet").evaluate(el => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)!;
    return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
  });
