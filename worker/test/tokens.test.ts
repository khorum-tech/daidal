import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { MAX_TOKENS, WRITES_PER_MINUTE } from "../src/tokens";
import { api, doc, type Signer } from "./helpers";
import { makeSigner } from "./tokens";

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

/** A request with [token] as its bearer, as an MCP client or a script sends it. */
async function withToken(token: string, method: string, path: string, body?: unknown) {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await handleRequest(new Request(`https://skope.khorum-oss.org${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, signer.getKeys);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function makeToken(email: string, body: Record<string, unknown> = { name: "laptop", scope: "write" }) {
  const res = await call.post(email, "/api/me/tokens", body);
  expect(res.status).toBe(201);
  return res.body as { id: string; token: string; scope: string; workspaces: string[] | null };
}

describe("access tokens", () => {
  it("are made, shown once, listed without their secret, and revoked", async () => {
    const made = await makeToken("tk-make@example.com", { name: "  Claude Code ", scope: "read" });
    expect(made.token).toMatch(/^skt_[A-Za-z0-9_-]{43}$/);
    expect(made).toMatchObject({ name: "Claude Code", scope: "read", workspaces: null, lastUsedAt: null });

    const listed = await call.get("tk-make@example.com", "/api/me/tokens");
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).not.toHaveProperty("token");
    expect(JSON.stringify(listed.body)).not.toContain(made.token);

    expect((await withToken(made.token, "GET", "/api/me")).body.email).toBe("tk-make@example.com");
    expect((await call.get("tk-make@example.com", "/api/me/tokens")).body[0].lastUsedAt).not.toBeNull();

    expect((await call.del("tk-make@example.com", `/api/me/tokens/${made.id}`)).status).toBe(204);
    expect(await withToken(made.token, "GET", "/api/me")).toEqual({ status: 401, body: { error: "this access token is not valid or was revoked" } });
    expect((await call.del("tk-make@example.com", `/api/me/tokens/${made.id}`)).status).toBe(404);
  });

  it("refuses a malformed or unknown token before reading anything", async () => {
    expect((await withToken("nope", "GET", "/api/me")).body).toEqual({ error: "not a valid access token" });
    expect((await withToken(`skt_${"a".repeat(43)}`, "GET", "/api/me")).status).toBe(401);
  });

  it("checks what it's given: a name, a scope, workspaces that are yours, and at most twenty", async () => {
    expect((await call.post("tk-check@example.com", "/api/me/tokens", { name: " ", scope: "read" })).body).toEqual({ error: "give the token a name" });
    expect((await call.post("tk-check@example.com", "/api/me/tokens", { name: "x", scope: "admin" })).body).toEqual({ error: "scope must be read or write" });
    expect((await call.post("tk-check@example.com", "/api/me/tokens", { name: "x", scope: "read", workspaces: [] })).status).toBe(400);
    const { body: theirs } = await call.post("tk-other@example.com", "/api/workspaces", { name: "Theirs" });
    expect((await call.post("tk-check@example.com", "/api/me/tokens", { name: "x", scope: "read", workspaces: [theirs.id] })).body).toEqual({
      error: "a workspace in the list is not one of yours",
    });
    for (let i = 0; i < MAX_TOKENS; i++) await makeToken("tk-many@example.com", { name: `t${i}`, scope: "read" });
    expect((await call.post("tk-many@example.com", "/api/me/tokens", { name: "one more", scope: "read" })).status).toBe(409);
  });

  it("can't manage tokens, import or export, even with write scope", async () => {
    const { token } = await makeToken("tk-own@example.com");
    expect((await withToken(token, "GET", "/api/me/tokens")).status).toBe(403);
    expect((await withToken(token, "POST", "/api/me/tokens", { name: "x", scope: "write" })).status).toBe(403);
    expect((await withToken(token, "GET", "/api/workspaces/personal:tk-own@example.com/export")).status).toBe(403);
    expect((await withToken(token, "POST", "/api/workspaces/import", { format: "daidal-backup" })).status).toBe(403);
    // The routes decode each segment, so the policy has to as well.
    expect((await withToken(token, "GET", "/api/workspaces/personal:tk-own@example.com/%65xport")).status).toBe(403);
  });

  it("reads with read scope, and writes nothing", async () => {
    const email = "tk-read@example.com";
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: `personal:${email}`, doc: doc() });
    const { token } = await makeToken(email, { name: "reader", scope: "read" });
    expect((await withToken(token, "GET", `/api/diagrams/${d.id}`)).body.doc.nodes[0].name).toBe("Gateway");
    expect(await withToken(token, "PUT", `/api/diagrams/${d.id}`, { rev: d.rev, name: "x" })).toEqual({ status: 403, body: { error: "this access token can only read" } });
  });

  it("with write scope makes and saves diagrams and snapshots, but deletes, moves and manages nothing", async () => {
    const email = "tk-write@example.com";
    const ws = `personal:${email}`;
    const { token } = await makeToken(email);
    const made = await withToken(token, "POST", "/api/diagrams", { workspace: ws, doc: doc("by-token") });
    expect(made.status).toBe(201);
    const saved = await withToken(token, "PUT", `/api/diagrams/${made.body.id}`, { rev: made.body.rev, name: "renamed by token" });
    expect(saved.body.name).toBe("renamed by token");
    expect((await withToken(token, "POST", `/api/diagrams/${made.body.id}/snapshots`, { label: "v1", doc: doc() })).status).toBe(201);
    expect((await withToken(token, "PUT", `/api/workspaces/${encodeURIComponent(ws)}/types/bot`, { name: "Bot", category: "AI", icon: "robot" })).status).toBe(200);

    expect((await withToken(token, "DELETE", `/api/diagrams/${made.body.id}`)).body).toEqual({ error: "access tokens cannot do this; use the app" });
    expect((await withToken(token, "PATCH", `/api/diagrams/${made.body.id}`, { workspace: ws })).status).toBe(403);
    expect((await withToken(token, "POST", "/api/workspaces", { name: "New" })).status).toBe(403);
    expect((await withToken(token, "PUT", "/api/me", { name: "Bot" })).status).toBe(403);
  });

  it("never goes beyond its person: someone else's diagram is still out of reach", async () => {
    const { body: d } = await call.post("tk-owner@example.com", "/api/diagrams", { workspace: "personal:tk-owner@example.com", doc: doc() });
    const { token } = await makeToken("tk-stranger@example.com");
    expect((await withToken(token, "GET", `/api/diagrams/${d.id}`)).status).toBe(404);
  });

  it("limited to some workspaces, sees and reaches only those", async () => {
    const email = "tk-some@example.com";
    const { body: team } = await call.post(email, "/api/workspaces", { name: "Team" });
    const { body: other } = await call.post(email, "/api/workspaces", { name: "Other" });
    const { body: inTeam } = await call.post(email, "/api/diagrams", { workspace: team.id, doc: doc("in-team") });
    const { body: inOther } = await call.post(email, "/api/diagrams", { workspace: other.id, doc: doc("in-other") });
    const { token } = await makeToken(email, { name: "team only", scope: "write", workspaces: [team.id] });

    expect((await withToken(token, "GET", "/api/workspaces")).body.map((w: { name: string }) => w.name)).toEqual(["Team"]);
    expect((await withToken(token, "GET", `/api/diagrams?workspace=${team.id}`)).status).toBe(200);
    expect((await withToken(token, "GET", `/api/diagrams?workspace=${other.id}`)).status).toBe(404);
    expect((await withToken(token, "GET", `/api/diagrams/${inTeam.id}`)).status).toBe(200);
    expect((await withToken(token, "GET", `/api/diagrams/${inOther.id}`)).status).toBe(404);
    expect((await withToken(token, "GET", `/api/diagrams/${inOther.id}/snapshots`)).status).toBe(404);
    expect((await withToken(token, "POST", "/api/diagrams", { workspace: other.id, doc: doc() })).status).toBe(404);
    expect((await withToken(token, "POST", "/api/diagrams", { workspace: team.id, from: inOther.id })).status).toBe(404);
    expect((await withToken(token, "POST", "/api/diagrams", { workspace: team.id, doc: doc("new") })).status).toBe(201);
    expect((await withToken(token, "PUT", `/api/workspaces/${other.id}/types/bot`, { name: "Bot", category: "AI", icon: "robot" })).status).toBe(404);
  });

  it(`allows ${WRITES_PER_MINUTE} writes a minute`, async () => {
    const email = "tk-busy@example.com";
    const { token, id } = await makeToken(email);
    await env.DB.prepare("UPDATE access_tokens SET window_start = ?, window_writes = ? WHERE id = ?").bind(Date.now(), WRITES_PER_MINUTE, id).run();
    const res = await withToken(token, "POST", "/api/diagrams", { workspace: `personal:${email}`, doc: doc() });
    expect(res.status).toBe(429);
    expect((await withToken(token, "GET", "/api/workspaces")).status).toBe(200);
  });
});
