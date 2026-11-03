import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, doc, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

const backup = (workspaces: unknown[]) => ({ format: "skope-backup", version: 1, workspaces });

/** A lead with two snapshots in a team, and a follower in the personal workspace synced to the first. */
const twoWorkspaces = () =>
  backup([
    {
      name: "Platform",
      diagrams: [
        {
          id: "lead",
          doc: doc("ledger"),
          updated: "2026-10-01T10:00:00.000Z",
          snapshots: [
            { id: "s1", label: "first cut", doc: doc("ledger-1"), at: "2026-09-01T10:00:00.000Z" },
            { id: "s2", label: "second cut", doc: doc("ledger-2"), at: "2026-09-02T10:00:00.000Z" },
          ],
        },
      ],
    },
    {
      personal: true,
      diagrams: [{ id: "mine", name: "my ledger", doc: doc("ledger-1"), follows: { diagram: "lead", synced: "s1", decided: { "s2:na:gw": "skipped", "other:x": "accepted" } } }],
    },
  ]);

describe("POST /api/workspaces/import", () => {
  it("creates the workspaces, diagrams, history and follows in the file, owned by the caller", async () => {
    const res = await call.post("i-all@example.com", "/api/workspaces/import", twoWorkspaces());
    expect(res.status).toBe(201);
    const [platform, personal] = res.body.workspaces;
    expect(platform).toMatchObject({ name: "Platform", personal: false, diagrams: 1, snapshots: 2 });
    expect(personal).toEqual({ id: "personal:i-all@example.com", name: "Personal", personal: true, diagrams: 1, snapshots: 0 });

    const [lead] = (await call.get("i-all@example.com", `/api/diagrams?workspace=${platform.id}`)).body;
    expect(lead).toMatchObject({ name: "ledger", ownerEmail: "i-all@example.com", updatedAt: Date.parse("2026-10-01T10:00:00.000Z") });
    const stored = await env.DB.prepare("SELECT summary FROM diagrams WHERE id = ?").bind(lead.id).first<{ summary: string | null }>();
    expect(JSON.parse(stored!.summary!)).toMatchObject({ nodes: 1, names: ["Gateway"] });
    const history = (await call.get("i-all@example.com", `/api/diagrams/${lead.id}/snapshots`)).body;
    expect(history.map((s: { label: string }) => s.label)).toEqual(["first cut", "second cut"]);
    expect(history[0]).toMatchObject({ authorEmail: "i-all@example.com", doc: doc("ledger-1") });

    const [mine] = (await call.get("i-all@example.com", `/api/diagrams?workspace=${personal.id}`)).body;
    expect(mine).toMatchObject({ name: "my ledger", leadId: lead.id, syncedSnapshotId: history[0].id, paused: false });
    // A verdict on a lead snapshot is re-keyed to that snapshot's new id; any other key is kept as it is.
    expect(mine.decided).toEqual({ [`${history[1].id}:na:gw`]: "skipped", "other:x": "accepted" });
  });

  it("never takes a time from the file that is later than the import, or a snapshot later than its diagram", async () => {
    const email = "i-future@example.com";
    const file = backup([{ name: "Later", diagrams: [{ id: "d", doc: doc("x"), updated: "2999-01-01T00:00:00.000Z", snapshots: [{ id: "s", label: "s", doc: doc("x"), at: "2999-06-01T00:00:00.000Z" }] }] }]);
    const before = Date.now();
    const res = await call.post(email, "/api/workspaces/import", file);
    const [d] = (await call.get(email, `/api/diagrams?workspace=${res.body.workspaces[0].id}`)).body;
    expect(d.updatedAt).toBeGreaterThanOrEqual(before);
    expect(d.updatedAt).toBeLessThanOrEqual(Date.now());
    const [snap] = (await call.get(email, `/api/diagrams/${d.id}/snapshots`)).body;
    expect(snap.createdAt).toBeLessThanOrEqual(d.updatedAt);
  });

  it("gives everything new ids, so the same file imports twice side by side", async () => {
    const first = await call.post("i-twice@example.com", "/api/workspaces/import", twoWorkspaces());
    const second = await call.post("i-twice@example.com", "/api/workspaces/import", twoWorkspaces());
    expect(second.status).toBe(201);
    expect(second.body.workspaces[0].id).not.toBe(first.body.workspaces[0].id);
    const mine = (await call.get("i-twice@example.com", "/api/diagrams?workspace=personal:i-twice@example.com")).body;
    expect(mine).toHaveLength(2);
  });

  it("round-trips through export: same diagrams, history and follows", async () => {
    const file = backup([
      {
        name: "Round trip",
        diagrams: [
          { id: "a", doc: doc("a"), snapshots: [{ id: "a1", label: "one", doc: doc("a1"), at: "2026-08-01T00:00:00.000Z" }] },
          { id: "b", doc: doc("b"), follows: { diagram: "a", synced: "a1", paused: true } },
        ],
      },
    ]);
    const { body: imported } = await call.post("i-round@example.com", "/api/workspaces/import", file);
    const exported = await call.get("i-round@example.com", `/api/workspaces/${imported.workspaces[0].id}/export`);
    expect(exported.status).toBe(200);
    const again = await call.post("i-round@example.com", "/api/workspaces/import", exported.body);
    expect(again.body.workspaces[0]).toMatchObject({ name: "Round trip", diagrams: 2, snapshots: 1 });

    const strip = (f: { workspaces: { diagrams: { name: string; doc: unknown; snapshots: unknown[]; follows?: { paused: boolean } }[] }[] }) =>
      f.workspaces[0].diagrams.map(d => ({ name: d.name, doc: d.doc, snapshots: d.snapshots.length, follows: d.follows?.paused }));
    const reexported = await call.get("i-round@example.com", `/api/workspaces/${again.body.workspaces[0].id}/export`);
    expect(strip(reexported.body)).toEqual(strip(exported.body));
    expect(strip(exported.body).map(d => d.follows)).toEqual([undefined, true]);
  });

  it("writes nothing when any part of the file is wrong", async () => {
    const file = twoWorkspaces();
    (file.workspaces[1] as { diagrams: { doc: unknown }[] }).diagrams[0].doc = { version: 2 };
    const res = await call.post("i-atomic@example.com", "/api/workspaces/import", file);
    expect(res).toEqual({ status: 400, body: { error: "diagram mine's doc must be a version 1 Skope document" } });
    expect(await env.DB.prepare("SELECT 1 FROM workspaces WHERE owner_email = ? AND name = 'Platform'").bind("i-atomic@example.com").first()).toBeNull();
  });

  it.each([
    ["not a backup", { format: "storybild-backup" }, "this isn't a Skope backup file"],
    ["a newer version", { format: "skope-backup", version: 2, workspaces: [] }, "this Skope backup is from a newer version"],
    ["no workspaces", backup([]), "the file has no workspaces to import"],
    ["a duplicate id", backup([{ name: "W", diagrams: [{ id: "x", doc: doc() }, { id: "x", doc: doc() }] }]), "two diagrams in the file share the id x"],
    ["a bad id", backup([{ name: "W", diagrams: [{ id: "a b", doc: doc() }] }]), 'a diagram has an id the import cannot use: "a b"'],
    ["a missing lead", backup([{ name: "W", diagrams: [{ id: "x", doc: doc(), follows: { diagram: "y" } }] }]), 'diagram x follows "y", which is not in the file'],
    [
      "a follow loop",
      backup([{ name: "W", diagrams: [{ id: "x", doc: doc(), follows: { diagram: "y" } }, { id: "y", doc: doc(), follows: { diagram: "x" } }] }]),
      "diagram x follows itself through a loop",
    ],
    [
      "a synced snapshot of another diagram",
      backup([{ name: "W", diagrams: [{ id: "x", doc: doc(), snapshots: [{ id: "s", label: "s", doc: doc() }] }, { id: "y", doc: doc() }, { id: "z", doc: doc(), follows: { diagram: "y", synced: "s" } }] }]),
      'diagram z is synced to "s", which is not a snapshot of y',
    ],
    ["a nameless workspace", backup([{ diagrams: [] }]), "workspace 1's name is required"],
  ])("refuses %s", async (_, file, error) => {
    expect(await call.post("i-bad@example.com", "/api/workspaces/import", file)).toEqual({ status: 400, body: { error } });
  });

  it("refuses a file too big for one request instead of half-writing it", async () => {
    // Rows share statements, but every new workspace takes two of its own.
    const workspaces = Array.from({ length: 25 }, (_, i) => ({ name: `W${i}`, diagrams: [{ id: `d${i}`, doc: doc() }] }));
    const res = await call.post("i-big@example.com", "/api/workspaces/import", backup(workspaces));
    expect(res.body).toEqual({ error: "the file is too large to import in one request; import one workspace at a time" });
    expect(await env.DB.prepare("SELECT 1 FROM workspaces WHERE owner_email = 'i-big@example.com' AND name = 'W0'").first()).toBeNull();
  });

  it("imports large documents across several statements", async () => {
    const diagrams = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, doc: doc(`d${i}`, { notes: "x".repeat(300_000) }) }));
    const res = await call.post("i-large@example.com", "/api/workspaces/import", backup([{ name: "Large", diagrams }]));
    expect(res.body.workspaces[0]).toMatchObject({ diagrams: 12 });
  });
});

describe("GET /api/workspaces/:id/export", () => {
  it("drops a follow whose lead is in another workspace, so import gets a standalone copy", async () => {
    const { body } = await call.post("e-cross@example.com", "/api/workspaces/import", twoWorkspaces());
    const exported = await call.get("e-cross@example.com", `/api/workspaces/${body.workspaces[1].id}/export`);
    expect(exported.body.workspaces[0]).toMatchObject({ name: "Personal", personal: true });
    expect(exported.body.workspaces[0].diagrams[0]).not.toHaveProperty("follows");
  });

  it("marks a workspace personal only for its owner", async () => {
    await call.post("e-mine@example.com", "/api/workspaces", { name: "x" });
    expect((await call.get("e-mine@example.com", "/api/workspaces/personal:e-mine@example.com/export")).body.workspaces[0].personal).toBe(true);
  });
});
