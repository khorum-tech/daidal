import { expect, type APIRequestContext } from "@playwright/test";
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
