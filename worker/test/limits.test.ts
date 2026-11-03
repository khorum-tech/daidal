import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyLimitOverrides, LIMITS } from "../src/limits";
import { api, doc, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

let signer: Signer;
let call: ReturnType<typeof api>;
const saved = { ...LIMITS };

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

// Each test lowers a limit so it can be reached in a few requests; put them back after.
afterEach(() => Object.assign(LIMITS, saved));

const personal = (email: string) => `personal:${email}`;
const diagram = async (email: string, name = "d") => (await call.post(email, "/api/diagrams", { workspace: personal(email), doc: doc(name) })).body;

describe("limits", () => {
  it("fills a diagram's history up to its count, then says to start a fresh one", async () => {
    LIMITS.snapshotsPerDiagram = 2;
    const email = "lim-count@example.com";
    const d = await diagram(email);
    for (const label of ["one", "two"]) expect((await call.post(email, `/api/diagrams/${d.id}/snapshots`, { label, doc: doc() })).status).toBe(201);
    const full = await call.post(email, `/api/diagrams/${d.id}/snapshots`, { label: "three", doc: doc() });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/^This diagram's history is full \(at most 2 snapshots and 20 MB\)\. Make a copy of the diagram/);
    // A copy starts its own history.
    const copy = (await call.post(email, "/api/diagrams", { workspace: personal(email), from: d.id })).body;
    expect((await call.post(email, `/api/diagrams/${copy.id}/snapshots`, { label: "fresh", doc: doc() })).status).toBe(201);
  });

  it("stops a history at its size, whatever the count", async () => {
    const email = "lim-bytes@example.com";
    const d = await diagram(email);
    const one = JSON.stringify(doc()).length;
    LIMITS.historyBytes = one * 2 + 10;
    for (let i = 0; i < 2; i++) expect((await call.post(email, `/api/diagrams/${d.id}/snapshots`, { label: `s${i}`, doc: doc() })).status).toBe(201);
    expect((await call.post(email, `/api/diagrams/${d.id}/snapshots`, { label: "big", doc: doc() })).status).toBe(409);
  });

  it("caps the diagrams, workspaces and members one person can have", async () => {
    const email = "lim-own@example.com";
    LIMITS.diagramsPerPerson = 2;
    await diagram(email, "a");
    await diagram(email, "b");
    const third = await call.post(email, "/api/diagrams", { workspace: personal(email), doc: doc("c") });
    expect(third).toEqual({ status: 409, body: { error: "You can own at most 2 diagrams; delete some you no longer need first." } });

    LIMITS.workspacesPerPerson = 1;
    const team = (await call.post(email, "/api/workspaces", { name: "Team" })).body;
    expect((await call.post(email, "/api/workspaces", { name: "Another" })).status).toBe(409);

    LIMITS.membersPerWorkspace = 2;
    expect((await call.post(email, `/api/workspaces/${team.id}/members`, { email: "friend@example.com" })).status).toBe(201);
    // Adding someone already in changes nothing, so it isn't refused.
    expect((await call.post(email, `/api/workspaces/${team.id}/members`, { email: "friend@example.com" })).status).toBe(201);
    const full = await call.post(email, `/api/workspaces/${team.id}/members`, { email: "another@example.com" });
    expect(full).toEqual({ status: 409, body: { error: "A workspace can have at most 2 members." } });
  });

  it("refuses an import over the limits whole, writing nothing", async () => {
    const email = "lim-import@example.com";
    LIMITS.snapshotsPerDiagram = 1;
    const snapshots = [
      { id: "s1", label: "one", doc: doc() },
      { id: "s2", label: "two", doc: doc() },
    ];
    const file = { format: "skope-backup", version: 1, workspaces: [{ name: "Imported", diagrams: [{ id: "d", name: "ledger", doc: doc(), snapshots }] }] };
    const res = await call.post(email, "/api/workspaces/import", file);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/^The history of "ledger" in the file is full/);
    expect((await call.get(email, "/api/workspaces")).body.map((w: { name: string }) => w.name)).toEqual(["Personal"]);

    LIMITS.snapshotsPerDiagram = saved.snapshotsPerDiagram;
    LIMITS.workspacesPerPerson = 0;
    expect((await call.post(email, "/api/workspaces/import", file)).status).toBe(409);
  });

  it("refuses to export a workspace too large to build in one file", async () => {
    const email = "lim-export@example.com";
    await diagram(email);
    LIMITS.exportBytes = 10;
    const res = await call.get(email, `/api/workspaces/${personal(email)}/export`);
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/^This workspace is too large to export in one file/);
  });

  it("limits changes a minute through a browser sign-in, but never reading", async () => {
    const email = "lim-rate@example.com";
    const d = await diagram(email);
    await env.DB.prepare("UPDATE rate_windows SET window_writes = ?, window_start = ? WHERE email = ?").bind(LIMITS.writesPerMinute, Date.now(), email).run();
    const res = await call.put(email, `/api/diagrams/${d.id}`, { rev: d.rev, name: "renamed" });
    expect(res).toEqual({ status: 429, body: { error: "Too many changes at once; wait a moment and try again." } });
    expect((await call.get(email, `/api/diagrams/${d.id}`)).status).toBe(200);
    // A minute on, the window starts again.
    await env.DB.prepare("UPDATE rate_windows SET window_start = ? WHERE email = ?").bind(Date.now() - 61_000, email).run();
    expect((await call.put(email, `/api/diagrams/${d.id}`, { rev: d.rev, name: "renamed" })).status).toBe(200);
  });

  it("takes overrides only for known limits and numbers (the end-to-end server's SKOPE_LIMITS)", () => {
    applyLimitOverrides("workspacesPerPerson=7, nope=3, diagramsPerPerson=lots, writesPerMinute=-1");
    expect(LIMITS.workspacesPerPerson).toBe(7);
    expect(LIMITS.diagramsPerPerson).toBe(saved.diagramsPerPerson);
    expect(LIMITS.writesPerMinute).toBe(saved.writesPerMinute);
    expect(LIMITS).not.toHaveProperty("nope");
  });
});
