import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { DEV, OWNER_PROFILE, PRIYA } from "../../stage/diagrams";
import { APP_TABLES, buildSeed, lines, literal, render, seedStatements } from "../../stage/seed";
import { api, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

const OWNER = "stage-owner@example.com";
const NOW = 1_760_000_000_000;

type Json = Record<string, any>;

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

/** Apply the seed one statement per line, as `wrangler d1 execute --file` gets it. */
async function seed(owner = OWNER) {
  const statements = seedStatements(await buildSeed(owner, NOW));
  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
}

async function counts() {
  const out: Record<string, number> = {};
  for (const table of APP_TABLES) out[table] = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  return out;
}

async function workspacesOf(email: string): Promise<Json[]> {
  return (await call.get(email, "/api/workspaces")).body;
}

async function diagramsIn(email: string, workspace: string): Promise<Json[]> {
  return (await call.get(email, `/api/diagrams?workspace=${encodeURIComponent(workspace)}`)).body;
}

describe("seed SQL", () => {
  it("quotes text, spells newlines with char(), and fills ?/?N parameters", () => {
    expect(literal("it's")).toBe("'it''s'");
    expect(literal("a\n\nb")).toBe("('a' || char(10) || char(10) || 'b')");
    expect(literal("")).toBe("''");
    expect(literal(null)).toBe("NULL");
    expect(literal(true)).toBe("1");
    expect(() => literal(Number.NaN)).toThrow();
    expect(render("SELECT ?1, ?2, ?1, '?'", ["x", 2])).toBe("SELECT 'x', 2, 'x', '?'");
    expect(render("VALUES (?, ?)", ["a", null])).toBe("VALUES ('a', NULL)");
    expect(() => render("SELECT 'oops", [])).toThrow(/unterminated quote/);
  });

  it("splits an importer insert that would be too long for D1, keeping every row", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, text: "x".repeat(5000) }));
    const sql = "INSERT INTO t (a, b) SELECT ?1, json_extract(value, '$.id') FROM json_each(?2)";
    const out = lines({ sql, params: ["owner", JSON.stringify(rows)] });
    expect(out.length).toBeGreaterThan(1);
    for (const line of out) expect(line.length).toBeLessThan(100_000);
    expect(out.join("").match(/"id":"r\d+"/g)).toHaveLength(40);
    expect(() => lines({ sql: "INSERT INTO t VALUES (?)", params: ["x".repeat(200_000)] })).toThrow(/too long/);
  });
});

describe("stage seed", () => {
  it("clears every app table first, so nothing from earlier PRs survives", async () => {
    await env.DB.prepare("INSERT INTO users (email, name, created_at) VALUES ('left-over@example.com', 'x', 1)").run();
    await seed();
    expect(await env.DB.prepare("SELECT email FROM users WHERE email = 'left-over@example.com'").first()).toBeNull();
    const sql = await buildSeed(OWNER, NOW);
    expect(seedStatements(sql).slice(0, APP_TABLES.length)).toEqual(APP_TABLES.map(t => `DELETE FROM ${t};`));
  });

  it("gives the same rows when run again", async () => {
    await seed();
    const first = await counts();
    await seed();
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ rate_windows: 0, access_tokens: 0, workspace_types: 0, snapshots: 6, diagrams: 10, workspace_members: 3 + 3 + 2 + 1, workspaces: 6, users: 3 });
  });

  it("signs the owner and teammates in to their seeded profiles", async () => {
    await seed();
    expect((await call.get(OWNER, "/api/me")).body).toEqual({ email: OWNER, ...OWNER_PROFILE });
    // Stage doesn't offer the tour after each reset.
    expect(OWNER_PROFILE.settings.tutorial).toEqual({ step: 0, dismissed: true });
    expect((await call.get(PRIYA.email, "/api/me")).body).toMatchObject({ name: PRIYA.name, title: PRIYA.title });
    expect((await call.get(DEV.email, "/api/me")).body).toMatchObject({ name: DEV.name, title: DEV.title });
  });

  it("gives the owner a personal workspace, a team they run, and a workspace a teammate shares", async () => {
    await seed();
    const ws = await workspacesOf(OWNER);
    expect(ws.map(w => [w.name, w.ownerEmail, w.personal])).toEqual([
      ["Personal", OWNER, true],
      ["Platform team", OWNER, false],
      ["Payments", PRIYA.email, false],
      ["Ledger C4", OWNER, false],
    ]);
    expect(ws[1].members).toEqual([OWNER, PRIYA.email, DEV.email]);
    expect(ws[2].members).toEqual([PRIYA.email, OWNER]);
    expect((await workspacesOf(DEV.email)).map(w => w.name)).toEqual(["Personal", "Platform team"]);
  });

  it("fills every workspace with diagrams the owner can open", async () => {
    await seed();
    for (const w of await workspacesOf(OWNER)) {
      const list = await diagramsIn(OWNER, w.id);
      expect(list.length, w.name).toBeGreaterThan(0);
      for (const d of list) {
        const full = (await call.get(OWNER, `/api/diagrams/${d.id}`)).body;
        expect(full.doc.version).toBe(1);
        expect(full.doc.nodes.length).toBeGreaterThan(0);
      }
    }
  });

  it("shows a follower with upstream changes waiting, one already skipped, and a paused follower", async () => {
    await seed();
    const [, platform] = await workspacesOf(OWNER);
    const list = await diagramsIn(OWNER, platform.id);
    const copy = list.find(d => d.name === "edge-ingress (platform copy)")!;
    const lead = (await call.get(OWNER, `/api/diagrams/${copy.leadId}`)).body;
    expect(lead).toMatchObject({ name: "edge-ingress", workspaceId: `personal:${OWNER}` });
    const history: Json[] = (await call.get(OWNER, `/api/diagrams/${lead.id}/snapshots`)).body;
    expect(history.map(s => s.label)).toEqual(["First sketch", "Add the web firewall", "Second region"]);
    expect(copy.syncedSnapshotId).toBe(history[1].id);
    expect(copy.decided).toEqual({ [`${history[2].id}:na:pool-b`]: "skipped" });

    const drill = list.find(d => d.name === "ledger-platform (DR drill)")!;
    expect(drill.paused).toBe(true);
    const ledgerHistory: Json[] = (await call.get(OWNER, `/api/diagrams/${drill.leadId}/snapshots`)).body;
    expect(drill.syncedSnapshotId).toBe(ledgerHistory.at(-1)!.id);
  });

  it("keeps the teammate's diagrams read-only for the owner, but clonable", async () => {
    await seed();
    const payments = (await workspacesOf(OWNER)).find(w => w.name === "Payments")!;
    const [flow] = (await diagramsIn(OWNER, payments.id)).filter(d => d.name === "payment-flow");
    expect(flow.ownerEmail).toBe(PRIYA.email);
    expect((await call.put(OWNER, `/api/diagrams/${flow.id}`, { rev: flow.rev, name: "mine now" })).status).toBe(403);
    const clone = await call.post(OWNER, "/api/diagrams", { workspace: `personal:${OWNER}`, from: flow.id, follow: true });
    expect(clone.status).toBe(201);
  });

  it("links the Ledger C4 set down level by level, with refs back up, by the seeded diagrams' own ids", async () => {
    await seed();
    const rows = (await env.DB.prepare("SELECT d.id, d.name, d.doc FROM diagrams d JOIN workspaces w ON w.id = d.workspace_id WHERE w.name = 'Ledger C4'").all<{ id: string; name: string; doc: string }>()).results;
    const by = Object.fromEntries(rows.map(r => [r.name, { id: r.id, doc: JSON.parse(r.doc) }]));
    const node = (name: string, id: string) => by[name].doc.nodes.find((n: { id: string }) => n.id === id);
    expect(node("ledger-context", "ledger").links).toEqual([{ diagram: by["ledger-containers"].id }]);
    expect(node("ledger-containers", "postings").links).toEqual([{ diagram: by["postings-components"].id }]);
    expect(by["ledger-containers"].doc.boundaries[0].ref).toBe(`${by["ledger-context"].id}#ledger`);
    expect(by["postings-components"].doc.boundaries[0].ref).toBe(`${by["ledger-containers"].id}#postings`);
  });

  it("covers every node, edge and boundary option the export writes", async () => {
    await seed();
    const docs = (await env.DB.prepare("SELECT doc FROM diagrams").all<{ doc: string }>()).results.map(r => JSON.parse(r.doc));
    const nodes = docs.flatMap(d => d.nodes);
    const edges = docs.flatMap(d => d.edges);
    const boundaries = docs.flatMap(d => d.boundaries ?? []);
    for (const key of ["subtitle", "flags", "notes", "links"]) expect(nodes.some(n => key in n), `node ${key}`).toBe(true);
    // The prototype draws only these flags (web/index.html Component.FLAGS); any other id would never show.
    expect(new Set(nodes.flatMap(n => n.flags ?? []))).toEqual(new Set(["db", "cache", "mq"]));
    expect(nodes.some(n => n.layout.h)).toBe(true);
    for (const key of ["label", "line", "direction", "route", "anchors", "width", "showLabel"]) expect(edges.some(e => key in e), `edge ${key}`).toBe(true);
    for (const key of ["border", "moveContents", "labelPosition"]) expect(boundaries.some(b => key in b), `boundary ${key}`).toBe(true);
    expect(new Set(docs.map(d => d.diagram.kind))).toEqual(new Set(["c4-context", "c4-container", "c4-component", "deployment", "freeform"]));
    // An edge may end on a boundary, as the prototype allows.
    const boundaryIds = new Set(boundaries.map(b => b.id));
    expect(edges.some(e => boundaryIds.has(e.to))).toBe(true);
  });

  it("lower-cases the owner, as Access sign-in does", async () => {
    await seed(" Stage-Owner@Example.com ");
    expect((await call.get(OWNER, "/api/me")).body).toMatchObject({ email: OWNER, name: OWNER_PROFILE.name });
  });

  it("refuses an owner that is not an email address, or one of the invented teammates", async () => {
    await expect(buildSeed("", NOW)).rejects.toThrow(/email/);
    await expect(buildSeed(PRIYA.email, NOW)).rejects.toThrow(/belongs to the stage data/);
  });

  it("keeps the invented data on example.com", async () => {
    const sql = await buildSeed(OWNER, NOW);
    const emails = new Set(sql.match(/[\w.+-]+@[\w.-]+\.\w+/g));
    for (const e of emails) expect(e.endsWith("@example.com"), e).toBe(true);
  });
});
