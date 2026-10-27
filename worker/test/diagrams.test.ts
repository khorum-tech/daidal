import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { api, doc, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

/** A team workspace owned by [owner] with [members] in it. */
async function team(owner: string, ...members: string[]) {
  const { body: ws } = await call.post(owner, "/api/workspaces", { name: "Team" });
  for (const m of members) await call.post(owner, `/api/workspaces/${ws.id}/members`, { email: m });
  return ws.id as string;
}

describe("diagrams", () => {
  it("creates from a document, named after it, and lists it without the document", async () => {
    const ws = await team("d-create@example.com");
    const created = await call.post("d-create@example.com", "/api/diagrams", { workspace: ws, doc: doc("orders") });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ workspaceId: ws, ownerEmail: "d-create@example.com", name: "orders", doc: doc("orders"), rev: 1, leadId: null, paused: false, decided: {} });
    const listed = await call.get("d-create@example.com", `/api/diagrams?workspace=${ws}`);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).not.toHaveProperty("doc");
    expect(listed.body[0].name).toBe("orders");
    expect(listed.body[0].summary).toEqual({
      kind: "c4",
      nodes: 1,
      edges: 0,
      tags: ["#968ae0"],
      names: ["Gateway"],
      boxes: [[10, 20, 190, 88]],
      frames: [],
    });
  });

  it("keeps the summary in step with saves, and works out ones written before summaries were kept", async () => {
    const ws = await team("d-summary@example.com");
    const { body: d } = await call.post("d-summary@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    const nodes = [
      { id: "a", name: "Billing", type: "service", layout: { x: 0, y: 0 } },
      { id: "b", name: "Ledger DB", type: "database", layout: { x: 300, y: 0 } },
    ];
    await call.put("d-summary@example.com", `/api/diagrams/${d.id}`, { rev: 1, doc: doc("x", { nodes, edges: [{ from: "a", to: "b" }] }) });
    const [saved] = (await call.get("d-summary@example.com", `/api/diagrams?workspace=${ws}`)).body;
    expect(saved.summary).toMatchObject({ nodes: 2, edges: 1, names: ["Billing", "Ledger DB"] });

    await env.DB.prepare("UPDATE diagrams SET summary = NULL WHERE id = ?").bind(d.id).run();
    const [filled] = (await call.get("d-summary@example.com", `/api/diagrams?workspace=${ws}`)).body;
    expect(filled.summary).toEqual(saved.summary);
  });

  it("searches names and node names, and pages through a long list", async () => {
    const ws = await team("d-search@example.com");
    const make = (name: string, node: string) =>
      call.post("d-search@example.com", "/api/diagrams", { workspace: ws, name, doc: doc(name, { nodes: [{ id: "n", name: node, type: "service", layout: { x: 0, y: 0 } }] }) });
    await make("Checkout flow", "Cart");
    await make("Payments", "Card vault");
    await make("100%_done", "Plain");
    await make("wow!", "Bang");
    const names = async (query: string) =>
      ((await call.get("d-search@example.com", `/api/diagrams?workspace=${ws}${query}`)).body as { name: string }[]).map(d => d.name).sort();
    expect(await names("&q=checkout")).toEqual(["Checkout flow"]);
    expect(await names("&q=CAR")).toEqual(["Checkout flow", "Payments"]);
    expect(await names("&q=%25_")).toEqual(["100%_done"]);
    expect(await names("&q=_")).toEqual(["100%_done"]);
    expect(await names("&q=nothing")).toEqual([]);
    expect(await names("&q=!")).toEqual(["wow!"]);
    expect(await names("&q=%20%20")).toHaveLength(4);
    expect(await names("&limit=2")).toHaveLength(2);
    expect(await names("&limit=2&offset=2")).toHaveLength(2);
    expect(await names("&limit=2&offset=3")).toHaveLength(1);
    expect(await names("&limit=junk")).toHaveLength(4);
  });

  it("names a follower's lead only for someone who can see it", async () => {
    const lead = await team("d-leadname@example.com");
    const { body: d } = await call.post("d-leadname@example.com", "/api/diagrams", { workspace: lead, name: "Upstream", doc: doc() });
    const follower = await team("d-leadname@example.com", "d-outside-lead@example.com");
    await call.post("d-leadname@example.com", "/api/diagrams", { workspace: follower, from: d.id, follow: true });
    expect((await call.get("d-leadname@example.com", `/api/diagrams?workspace=${follower}`)).body[0]).toMatchObject({ leadId: d.id, leadName: "Upstream" });
    expect((await call.get("d-outside-lead@example.com", `/api/diagrams?workspace=${follower}`)).body[0]).toMatchObject({ leadId: d.id, leadName: null });
  });

  it("lets a member read and clone but not save, snapshot or delete someone else's diagram", async () => {
    const ws = await team("d-owner@example.com", "d-member@example.com");
    const { body: d } = await call.post("d-owner@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    expect((await call.get("d-member@example.com", `/api/diagrams/${d.id}`)).status).toBe(200);
    expect((await call.put("d-member@example.com", `/api/diagrams/${d.id}`, { rev: 1, name: "x" })).status).toBe(403);
    expect((await call.post("d-member@example.com", `/api/diagrams/${d.id}/snapshots`, { label: "x", doc: doc() })).status).toBe(403);
    expect((await call.del("d-member@example.com", `/api/diagrams/${d.id}`)).status).toBe(403);
    const clone = await call.post("d-member@example.com", "/api/diagrams", { workspace: `personal:d-member@example.com`, from: d.id });
    expect(clone.status).toBe(201);
    expect(clone.body).toMatchObject({ ownerEmail: "d-member@example.com", name: d.name, leadId: null });
  });

  it("returns 404 to a non-member for a workspace's diagrams and snapshots", async () => {
    const ws = await team("d-private@example.com");
    const { body: d } = await call.post("d-private@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    expect((await call.get("d-outsider@example.com", `/api/diagrams?workspace=${ws}`)).status).toBe(404);
    expect((await call.get("d-outsider@example.com", `/api/diagrams/${d.id}`)).status).toBe(404);
    expect((await call.get("d-outsider@example.com", `/api/diagrams/${d.id}/snapshots`)).status).toBe(404);
    expect((await call.post("d-outsider@example.com", "/api/diagrams", { workspace: ws, doc: doc() })).status).toBe(404);
    expect((await call.post("d-outsider@example.com", "/api/diagrams", { workspace: "personal:d-outsider@example.com", from: d.id })).status).toBe(404);
  });

  it("saves with the loaded rev and bumps it; a stale rev gets 409 with the current diagram and changes nothing", async () => {
    const ws = await team("d-save@example.com");
    const { body: d } = await call.post("d-save@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    const saved = await call.put("d-save@example.com", `/api/diagrams/${d.id}`, { rev: 1, name: "renamed", doc: doc("renamed") });
    expect(saved.body).toMatchObject({ rev: 2, name: "renamed", doc: doc("renamed") });
    const stale = await call.put("d-save@example.com", `/api/diagrams/${d.id}`, { rev: 1, name: "lost" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "the diagram changed since you loaded it", diagram: { rev: 2, name: "renamed" } });
    expect((await call.get("d-save@example.com", `/api/diagrams/${d.id}`)).body.name).toBe("renamed");
  });

  it("keeps history oldest first, and a clone with follow starts from the latest snapshot", async () => {
    const ws = await team("d-lead@example.com", "d-follower@example.com");
    const { body: lead } = await call.post("d-lead@example.com", "/api/diagrams", { workspace: ws, doc: doc("v0") });
    await call.post("d-lead@example.com", `/api/diagrams/${lead.id}/snapshots`, { label: "first", doc: doc("v1") });
    const { body: second } = await call.post("d-lead@example.com", `/api/diagrams/${lead.id}/snapshots`, { label: "second", doc: doc("v2") });
    const history = await call.get("d-follower@example.com", `/api/diagrams/${lead.id}/snapshots`);
    expect(history.body.map((s: { label: string }) => s.label)).toEqual(["first", "second"]);
    expect(history.body[1]).toMatchObject({ authorEmail: "d-lead@example.com", doc: doc("v2") });

    const { body: follower } = await call.post("d-follower@example.com", "/api/diagrams", { workspace: "personal:d-follower@example.com", from: lead.id, follow: true });
    expect(follower).toMatchObject({ leadId: lead.id, syncedSnapshotId: second.id, doc: doc("v2") });
  });

  it("clones a diagram with no history from its working copy", async () => {
    const ws = await team("d-nohist@example.com");
    const { body: d } = await call.post("d-nohist@example.com", "/api/diagrams", { workspace: ws, doc: doc("wip") });
    const { body: c } = await call.post("d-nohist@example.com", "/api/diagrams", { workspace: ws, from: d.id, follow: true, name: "copy" });
    expect(c).toMatchObject({ name: "copy", doc: doc("wip"), leadId: d.id, syncedSnapshotId: null });
  });

  it("records a follower's verdicts and pause", async () => {
    const ws = await team("d-verdict@example.com");
    const { body: d } = await call.post("d-verdict@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    const saved = await call.put("d-verdict@example.com", `/api/diagrams/${d.id}`, { rev: 1, decided: { "node:gw": "skip" }, paused: true, syncedSnapshotId: "s-1" });
    expect(saved.body).toMatchObject({ decided: { "node:gw": "skip" }, paused: true, syncedSnapshotId: "s-1" });
  });

  it("stops following on leadId null, forgetting where it was synced to, and refuses to set a lead", async () => {
    const ws = await team("d-unlink@example.com");
    const { body: lead } = await call.post("d-unlink@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    await call.post("d-unlink@example.com", `/api/diagrams/${lead.id}/snapshots`, { label: "s", doc: doc() });
    const { body: f } = await call.post("d-unlink@example.com", "/api/diagrams", { workspace: ws, from: lead.id, follow: true });
    const marked = await call.put("d-unlink@example.com", `/api/diagrams/${f.id}`, { rev: f.rev, decided: { "s:na:x": "skipped" }, paused: true });
    expect((await call.put("d-unlink@example.com", `/api/diagrams/${f.id}`, { rev: marked.body.rev, leadId: lead.id })).status).toBe(400);
    const gone = await call.put("d-unlink@example.com", `/api/diagrams/${f.id}`, { rev: marked.body.rev, leadId: null });
    expect(gone.body).toMatchObject({ leadId: null, syncedSnapshotId: null, decided: {}, paused: false, doc: doc() });
  });

  it("clears lead_id on followers when the lead is deleted, and deletes the lead's history", async () => {
    const ws = await team("d-del@example.com");
    const { body: lead } = await call.post("d-del@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    await call.post("d-del@example.com", `/api/diagrams/${lead.id}/snapshots`, { label: "s", doc: doc() });
    const { body: f } = await call.post("d-del@example.com", "/api/diagrams", { workspace: ws, from: lead.id, follow: true });
    expect((await call.del("d-del@example.com", `/api/diagrams/${lead.id}`)).status).toBe(204);
    expect((await call.get("d-del@example.com", `/api/diagrams/${f.id}`)).body.leadId).toBeNull();
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE diagram_id = ?").bind(lead.id).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("deletes a workspace's diagrams with it", async () => {
    const ws = await team("d-wsdel@example.com");
    const { body: d } = await call.post("d-wsdel@example.com", "/api/diagrams", { workspace: ws, doc: doc() });
    expect((await call.del("d-wsdel@example.com", `/api/workspaces/${ws}`)).status).toBe(204);
    expect(await env.DB.prepare("SELECT id FROM diagrams WHERE id = ?").bind(d.id).first()).toBeNull();
  });

  it.each([
    [{ doc: "nope" }, "doc must be a JSON object"],
    [{ doc: { version: 2 } }, "doc must be a version 1 Skope document"],
    [{ doc: { version: 1, blob: "x".repeat(1024 * 1024) } }, "doc must be 1 MB or less"],
    [{ doc: { version: 1 } }, "name is required"],
    [{ doc: doc(), from: "x" }, "send either doc or from, not both"],
  ])("rejects %#", async (body, error) => {
    const res = await call.post("d-bad@example.com", "/api/diagrams", { workspace: "personal:d-bad@example.com", ...body });
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it("refuses a save without a rev, and a body that is not sent as JSON", async () => {
    const { body: d } = await call.post("d-norev@example.com", "/api/diagrams", { workspace: "personal:d-norev@example.com", doc: doc() });
    expect((await call.put("d-norev@example.com", `/api/diagrams/${d.id}`, { name: "x" })).body).toEqual({ error: "rev must be the revision you loaded" });
    // A cross-site form can post text/plain without a preflight; it must not reach the database.
    const headers = { "Cf-Access-Jwt-Assertion": await signer.sign({ email: "d-norev@example.com" }), "content-type": "text/plain" };
    const form = new Request(`https://skope.khorum-oss.org/api/diagrams/${d.id}`, { method: "PUT", headers, body: JSON.stringify({ rev: 1, name: "x" }) });
    expect((await handleRequest(form, env, signer.getKeys)).status).toBe(415);
  });
});
