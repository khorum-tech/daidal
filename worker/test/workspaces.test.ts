import { beforeAll, describe, expect, it } from "vitest";
import { api, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

describe("workspaces", () => {
  it("lists the personal workspace on first visit", async () => {
    const res = await call.get("ws-first@example.com", "/api/workspaces");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "personal:ws-first@example.com", name: "Personal", ownerEmail: "ws-first@example.com", personal: true, members: ["ws-first@example.com"], types: [] },
    ]);
  });

  it("creates a workspace with the caller as owner and member", async () => {
    const res = await call.post("ws-create@example.com", "/api/workspaces", { name: "  Platform  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Platform", ownerEmail: "ws-create@example.com", personal: false, members: ["ws-create@example.com"] });
    const listed = await call.get("ws-create@example.com", "/api/workspaces");
    expect(listed.body.map((w: { name: string }) => w.name)).toEqual(["Personal", "Platform"]);
  });

  it("adds a member by email before they ever sign in, and shows them the workspace", async () => {
    const { body: ws } = await call.post("ws-owner@example.com", "/api/workspaces", { name: "Team" });
    expect((await call.post("ws-owner@example.com", `/api/workspaces/${ws.id}/members`, { email: " Friend@Example.com " })).status).toBe(201);
    const friend = await call.get("friend@example.com", "/api/workspaces");
    expect(friend.body.find((w: { id: string }) => w.id === ws.id)).toMatchObject({ name: "Team", members: ["ws-owner@example.com", "friend@example.com"] });
  });

  it("shows the member list only to the owner; a member sees the owner and themselves", async () => {
    const { body: ws } = await call.post("ws-list-owner@example.com", "/api/workspaces", { name: "Private" });
    for (const m of ["ws-list-a@example.com", "ws-list-b@example.com"]) await call.post("ws-list-owner@example.com", `/api/workspaces/${ws.id}/members`, { email: m });
    const asOwner = (await call.get("ws-list-owner@example.com", "/api/workspaces")).body.find((w: { id: string }) => w.id === ws.id);
    expect(asOwner.members).toEqual(["ws-list-owner@example.com", "ws-list-a@example.com", "ws-list-b@example.com"]);
    const asMember = (await call.get("ws-list-a@example.com", "/api/workspaces")).body.find((w: { id: string }) => w.id === ws.id);
    expect(asMember.members).toEqual(["ws-list-owner@example.com", "ws-list-a@example.com"]);
    expect(JSON.stringify(asMember)).not.toContain("ws-list-b@example.com");
  });

  it("lets only the owner rename, delete or change members", async () => {
    const { body: ws } = await call.post("ws-boss@example.com", "/api/workspaces", { name: "Boss" });
    await call.post("ws-boss@example.com", `/api/workspaces/${ws.id}/members`, { email: "ws-helper@example.com" });
    expect((await call.patch("ws-helper@example.com", `/api/workspaces/${ws.id}`, { name: "Mine" })).status).toBe(403);
    expect((await call.del("ws-helper@example.com", `/api/workspaces/${ws.id}`)).status).toBe(403);
    expect((await call.post("ws-helper@example.com", `/api/workspaces/${ws.id}/members`, { email: "x@example.com" })).status).toBe(403);
    expect((await call.patch("ws-boss@example.com", `/api/workspaces/${ws.id}`, { name: "Renamed" })).body).toEqual({ id: ws.id, name: "Renamed" });
  });

  it("returns 404, not 403, to someone outside the workspace", async () => {
    const { body: ws } = await call.post("ws-private@example.com", "/api/workspaces", { name: "Private" });
    expect((await call.patch("ws-stranger@example.com", `/api/workspaces/${ws.id}`, { name: "x" })).status).toBe(404);
    expect((await call.get("ws-stranger@example.com", `/api/workspaces/${ws.id}/export`)).status).toBe(404);
  });

  it("never removes the owner, and never deletes the personal workspace", async () => {
    const { body: ws } = await call.post("ws-keep@example.com", "/api/workspaces", { name: "Keep" });
    expect((await call.del("ws-keep@example.com", `/api/workspaces/${ws.id}/members/WS-KEEP@example.com`)).body).toEqual({ error: "the owner can't leave; delete the workspace instead" });
    expect((await call.del("ws-keep@example.com", "/api/workspaces/personal:ws-keep@example.com")).body).toEqual({ error: "the personal workspace cannot be deleted" });
  });

  it("lets a member leave, but not remove anyone else; what they made there passes to the owner", async () => {
    const { body: ws } = await call.post("ws-host@example.com", "/api/workspaces", { name: "Shared" });
    for (const m of ["ws-leaver@example.com", "ws-stays@example.com"]) await call.post("ws-host@example.com", `/api/workspaces/${ws.id}/members`, { email: m });
    const { body: d } = await call.post("ws-leaver@example.com", "/api/diagrams", { workspace: ws.id, doc: { version: 1, diagram: { name: "mine" } } });
    expect((await call.del("ws-leaver@example.com", `/api/workspaces/${ws.id}/members/ws-stays@example.com`)).status).toBe(403);
    expect((await call.del("ws-leaver@example.com", `/api/workspaces/${ws.id}/members/WS-Leaver@example.com`)).status).toBe(204);
    expect((await call.get("ws-leaver@example.com", "/api/workspaces")).body.map((w: { id: string }) => w.id)).not.toContain(ws.id);
    expect((await call.get("ws-leaver@example.com", `/api/diagrams/${d.id}`)).status).toBe(404);
    expect((await call.get("ws-host@example.com", `/api/diagrams/${d.id}`)).body).toMatchObject({ ownerEmail: "ws-host@example.com", workspaceId: ws.id });
    expect((await call.del("ws-leaver@example.com", `/api/workspaces/${ws.id}/members/ws-leaver@example.com`)).status).toBe(404);
  });

  it("removes a member, who then can't see the workspace", async () => {
    const { body: ws } = await call.post("ws-rm@example.com", "/api/workspaces", { name: "Shrinking" });
    await call.post("ws-rm@example.com", `/api/workspaces/${ws.id}/members`, { email: "ws-gone@example.com" });
    expect((await call.del("ws-rm@example.com", `/api/workspaces/${ws.id}/members/ws-gone@example.com`)).status).toBe(204);
    const gone = await call.get("ws-gone@example.com", "/api/workspaces");
    expect(gone.body.map((w: { id: string }) => w.id)).not.toContain(ws.id);
  });

  it.each([
    [{}, "name is required"],
    [{ name: "x".repeat(101) }, "name must be 100 characters or fewer"],
  ])("rejects %j", async (body, error) => {
    const res = await call.post("ws-bad@example.com", "/api/workspaces", body);
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it("rejects a member that is not an email address", async () => {
    const { body: ws } = await call.post("ws-bad-member@example.com", "/api/workspaces", { name: "W" });
    expect((await call.post("ws-bad-member@example.com", `/api/workspaces/${ws.id}/members`, { email: "nope" })).body).toEqual({ error: "email must be an email address" });
  });
});

describe("workspace types", () => {
  const agent = { name: "Billing Agent", category: "AI", icon: "robot" };

  it("lets any member add, rename and remove a type, listed with the workspace", async () => {
    const { body: ws } = await call.post("wt-owner@example.com", "/api/workspaces", { name: "Types" });
    await call.post("wt-owner@example.com", `/api/workspaces/${ws.id}/members`, { email: "wt-member@example.com" });
    const put = await call.put("wt-member@example.com", `/api/workspaces/${ws.id}/types/billing-agent`, { ...agent, name: "  Billing Agent " });
    expect(put).toEqual({ status: 200, body: agent });
    const listed = await call.get("wt-owner@example.com", "/api/workspaces");
    expect(listed.body.find((w: { id: string }) => w.id === ws.id).types).toEqual([agent]);

    await call.put("wt-owner@example.com", `/api/workspaces/${ws.id}/types/billing-agent`, { name: "Payments Agent", category: "AI", icon: "brain" });
    const renamed = await call.get("wt-member@example.com", "/api/workspaces");
    expect(renamed.body.find((w: { id: string }) => w.id === ws.id).types).toEqual([{ name: "Payments Agent", category: "AI", icon: "brain" }]);

    expect((await call.del("wt-member@example.com", `/api/workspaces/${ws.id}/types/payments-agent`)).status).toBe(204);
    expect((await call.get("wt-owner@example.com", "/api/workspaces")).body.find((w: { id: string }) => w.id === ws.id).types).toEqual([]);
  });

  it("refuses a name another type has, an icon outside the library, and a blank category", async () => {
    const { body: ws } = await call.post("wt-check@example.com", "/api/workspaces", { name: "Checks" });
    const path = (key: string) => `/api/workspaces/${ws.id}/types/${key}`;
    await call.put("wt-check@example.com", path("billing-agent"), agent);
    await call.put("wt-check@example.com", path("ledger"), { name: "Ledger", category: "Data", icon: "database" });
    expect((await call.put("wt-check@example.com", path("ledger"), { ...agent, name: "billing agent" })).status).toBe(409);
    expect((await call.put("wt-check@example.com", path("x"), { ...agent, name: "X", icon: "trash" })).body).toEqual({ error: "icon must be one of the library's node icons" });
    expect((await call.put("wt-check@example.com", path("x"), { ...agent, name: "X", icon: "toString" })).status).toBe(400);
    expect((await call.put("wt-check@example.com", path("x"), { ...agent, name: "X", category: " " })).body).toEqual({ error: "category is required" });
    expect((await call.put("wt-check@example.com", path("x"), { ...agent, name: "!!" })).body).toEqual({ error: "name needs a letter or a digit" });
  });

  it("is a 404 to someone outside the workspace", async () => {
    const { body: ws } = await call.post("wt-private@example.com", "/api/workspaces", { name: "Private" });
    expect((await call.put("wt-stranger@example.com", `/api/workspaces/${ws.id}/types/billing-agent`, agent)).status).toBe(404);
    expect((await call.del("wt-stranger@example.com", `/api/workspaces/${ws.id}/types/billing-agent`)).status).toBe(404);
  });

  it("goes out with an export and comes back with an import", async () => {
    const { body: ws } = await call.post("wt-backup@example.com", "/api/workspaces", { name: "Backed up" });
    await call.put("wt-backup@example.com", `/api/workspaces/${ws.id}/types/billing-agent`, agent);
    const exported = await call.get("wt-backup@example.com", `/api/workspaces/${ws.id}/export`);
    expect(exported.body.workspaces[0].types).toEqual([agent]);
    const imported = await call.post("wt-backup@example.com", "/api/workspaces/import", exported.body);
    const copy = imported.body.workspaces[0].id;
    const listed = await call.get("wt-backup@example.com", "/api/workspaces");
    expect(listed.body.find((w: { id: string }) => w.id === copy).types).toEqual([agent]);
  });
});
