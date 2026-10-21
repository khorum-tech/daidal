import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { APP_TABLES, TEAMMATES, buildSeed, literal } from "../../scripts/stage-seed.mjs";
import { handleRequest } from "../src/app";
import { makeSigner } from "./tokens";

const OWNER = "stage-owner@example.com";
const NOW = 1_760_000_000_000;

let signer: Awaited<ReturnType<typeof makeSigner>>;

beforeAll(async () => {
  signer = await makeSigner();
});

async function seed(owner = OWNER) {
  // One statement per line, as `wrangler d1 execute --file` gets it.
  const statements = buildSeed(owner, NOW).trim().split("\n");
  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
}

async function count(table: string) {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
}

async function me(email: string) {
  const headers = { "Cf-Access-Jwt-Assertion": await signer.sign({ email }) };
  return handleRequest(new Request("https://skope-stage.khorum-oss.org/api/me", { headers }), env, signer.getKeys);
}

describe("stage seed", () => {
  it("writes strings and numbers as SQL literals, and refuses anything that would break a line", () => {
    expect(literal("it's")).toBe("'it''s'");
    expect(literal(42)).toBe("42");
    expect(literal(null)).toBe("NULL");
    expect(() => literal("a\nb")).toThrow(/one line/);
    expect(() => literal(Number.NaN)).toThrow();
  });

  it("clears every app table first, so nothing from earlier PRs survives", async () => {
    await env.DB.prepare("INSERT INTO users (email, name, created_at) VALUES ('left-over@example.com', 'x', 1)").run();
    await seed();
    expect(await env.DB.prepare("SELECT email FROM users WHERE email = 'left-over@example.com'").first()).toBeNull();
    const lines = buildSeed(OWNER, NOW).split("\n");
    expect(lines.slice(0, APP_TABLES.length)).toEqual(APP_TABLES.map(t => `DELETE FROM ${t};`));
  });

  it("signs the owner in to the seeded profile, not a fresh one", async () => {
    await seed();
    const res = await me(OWNER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: OWNER, name: "Rowan Ellery", title: "Platform lead", settings: { theme: "dark" } });
  });

  it("gives everyone a personal workspace, and the owner a team and a workspace shared by a teammate", async () => {
    await seed();
    const owned = await env.DB.prepare("SELECT w.id, w.owner_email FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.email = ? ORDER BY w.id")
      .bind(OWNER)
      .all<{ id: string; owner_email: string }>();
    expect(owned.results).toEqual([
      { id: `personal:${OWNER}`, owner_email: OWNER },
      { id: "stage:payments", owner_email: TEAMMATES[0].email },
      { id: "stage:platform", owner_email: OWNER },
    ]);
    for (const t of TEAMMATES) {
      expect(await env.DB.prepare("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND email = ?").bind(`personal:${t.email}`, t.email).first()).not.toBeNull();
    }
  });

  it("lower-cases the owner, as Access sign-in does", async () => {
    await seed(" Stage-Owner@Example.com ");
    expect(await (await me(OWNER)).json()).toMatchObject({ email: OWNER, name: "Rowan Ellery" });
  });

  it("gives the same rows when run again", async () => {
    await seed();
    const first = await Promise.all(APP_TABLES.map(count));
    await seed();
    expect(await Promise.all(APP_TABLES.map(count))).toEqual(first);
    expect(first).toEqual([3 + 3 + 2, 3 + 2, 3]);
  });

  it("refuses an owner that is not an email address", () => {
    expect(() => buildSeed("", NOW)).toThrow(/email/);
  });
});
