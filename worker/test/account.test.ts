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

async function remove(email: string, confirm: unknown) {
  const headers = new Headers({ "Cf-Access-Jwt-Assertion": await signer.sign({ email }), "content-type": "application/json" });
  const res = await handleRequest(new Request("https://skope.khorum-oss.org/api/me", { method: "DELETE", headers, body: JSON.stringify({ confirm }) }), env, signer.getKeys);
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const count = async (sql: string, ...binds: unknown[]) => (await env.DB.prepare(sql).bind(...binds).first<{ n: number }>())!.n;

describe("your account", () => {
  it("downloads everything kept about you: profile, the workspaces you own, where you're a member, your tokens", async () => {
    const email = "acct-export@example.com";
    await call.put(email, "/api/me", { name: "Ada", title: "Architect" });
    const { body: team } = await call.post(email, "/api/workspaces", { name: "Mine" });
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: team.id, doc: doc("ledger") });
    await call.post(email, `/api/diagrams/${d.id}/snapshots`, { label: "v1", doc: doc("ledger") });
    const { body: theirs } = await call.post("acct-other@example.com", "/api/workspaces", { name: "Theirs" });
    await call.post("acct-other@example.com", `/api/workspaces/${theirs.id}/members`, { email });
    await call.post(email, "/api/me/tokens", { name: "laptop", scope: "read" });

    const res = await call.get(email, "/api/me/export");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      format: "skope-account",
      version: 1,
      profile: { email, name: "Ada", title: "Architect" },
      memberOf: ["Theirs"],
      accessTokens: [{ name: "laptop", scope: "read", workspaces: "all", lastUsedAt: null }],
    });
    expect(res.body.backup.format).toBe("skope-backup");
    expect(res.body.backup.workspaces.map((w: { name: string }) => w.name)).toEqual(["Personal", "Mine"]);
    expect(res.body.backup.workspaces[1].diagrams[0]).toMatchObject({ name: "ledger", snapshots: [{ label: "v1" }] });
    expect(JSON.stringify(res.body)).not.toMatch(/skt_|hash/);
    // The backup part imports as it is.
    expect((await call.post("acct-restore@example.com", "/api/workspaces/import", res.body.backup)).status).toBe(201);
  });

  it("deletes your account, after you confirm with your email", async () => {
    const email = "acct-gone@example.com";
    const host = "acct-host@example.com";
    const { body: own } = await call.post(email, "/api/workspaces", { name: "Doomed" });
    await call.post(email, "/api/diagrams", { workspace: own.id, doc: doc("doomed") });
    const { body: shared } = await call.post(host, "/api/workspaces", { name: "Shared" });
    await call.post(host, `/api/workspaces/${shared.id}/members`, { email });
    const { body: made } = await call.post(email, "/api/diagrams", { workspace: shared.id, doc: doc("left behind") });
    await call.post(email, `/api/diagrams/${made.id}/snapshots`, { label: "mine", doc: doc("left behind") });
    const { body: token } = await call.post(email, "/api/me/tokens", { name: "laptop", scope: "write" });

    expect(await remove(email, "someone@example.com")).toEqual({ status: 400, body: { error: "to delete your account, send your email address as confirm" } });
    expect((await remove(email, " ACCT-GONE@example.com ")).status).toBe(204);

    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?", email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM workspaces WHERE owner_email = ?", email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM workspace_members WHERE email = ?", email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM access_tokens WHERE email = ?", email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM snapshots WHERE author_email = ?", email)).toBe(0);
    // What they made in someone else's workspace stays there, now its owner's, and the history says "former member".
    const kept = await call.get(host, `/api/diagrams/${made.id}`);
    expect(kept.body).toMatchObject({ name: "left behind", ownerEmail: host });
    expect((await call.get(host, `/api/diagrams/${made.id}/snapshots`)).body[0].authorEmail).toBe("former member");
    // The token stops working at once.
    const headers = { authorization: `Bearer ${token.token}` };
    expect((await handleRequest(new Request("https://skope.khorum-oss.org/api/me", { headers }), env, signer.getKeys)).status).toBe(401);
  });

  it("can't be downloaded or deleted with an access token", async () => {
    const email = "acct-token@example.com";
    const { body } = await call.post(email, "/api/me/tokens", { name: "x", scope: "write" });
    const headers = new Headers({ authorization: `Bearer ${body.token}`, "content-type": "application/json" });
    const get = await handleRequest(new Request("https://skope.khorum-oss.org/api/me/export", { headers }), env, signer.getKeys);
    expect(get.status).toBe(403);
    const del = await handleRequest(new Request("https://skope.khorum-oss.org/api/me", { method: "DELETE", headers, body: JSON.stringify({ confirm: email }) }), env, signer.getKeys);
    expect(del.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?", email)).toBe(1);
  });
});
