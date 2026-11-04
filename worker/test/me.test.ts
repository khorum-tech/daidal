import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { makeSigner } from "./tokens";

let signer: Awaited<ReturnType<typeof makeSigner>>;

beforeAll(async () => {
  signer = await makeSigner();
});

// Tests in a file share one database, so each test signs in as its own user.
async function call(email: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (email) headers.set("Cf-Access-Jwt-Assertion", await signer.sign({ email }));
  return handleRequest(new Request(`https://skope.khorum-oss.org${path}`, { ...init, headers }), env, signer.getKeys);
}

function put(email: string, body: string) {
  return call(email, "/api/me", { method: "PUT", body, headers: { "content-type": "application/json" } });
}

describe("/api/*", () => {
  it("rejects a request with no token", async () => {
    const res = await call(null, "/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not signed in" });
  });

  it("returns 404 JSON for an unknown route", async () => {
    const res = await call("unknown-route@example.com", "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("GET /api/me", () => {
  it("creates the user on first visit and returns it", async () => {
    const res = await call("first-visit@example.com", "/api/me");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ email: "first-visit@example.com", name: "first-visit", title: "", settings: {} });
  });

  it("treats differently-cased emails as the same user", async () => {
    await put("Mixed.Case@Example.com", JSON.stringify({ name: "Mixed" }));
    const res = await call("mixed.case@example.com", "/api/me");
    expect(await res.json()).toMatchObject({ email: "mixed.case@example.com", name: "Mixed" });
  });

  it("rejects other methods", async () => {
    expect((await call("methods@example.com", "/api/me", { method: "PATCH" })).status).toBe(405);
  });
});

describe("PUT /api/me", () => {
  it("updates name, title and settings", async () => {
    const res = await put(
      "update@example.com",
      JSON.stringify({ name: "  Josh  ", title: "Engineer", settings: { theme: "light" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "update@example.com",
      name: "Josh",
      title: "Engineer",
      settings: { theme: "light" },
    });
  });

  it("works as the very first request from a new user", async () => {
    const res = await put("put-first@example.com", JSON.stringify({ title: "Engineer" }));
    expect(await res.json()).toMatchObject({ name: "put-first", title: "Engineer" });
  });

  it("keeps the existing name when the new one is blank", async () => {
    await put("blank-name@example.com", JSON.stringify({ name: "Josh" }));
    const res = await put("blank-name@example.com", JSON.stringify({ name: "   " }));
    expect(await res.json()).toMatchObject({ name: "Josh" });
  });

  it("ignores an email in the body", async () => {
    const res = await put("own-email@example.com", JSON.stringify({ email: "someone-else@example.com", name: "Josh" }));
    expect(await res.json()).toMatchObject({ email: "own-email@example.com" });
  });

  it.each([
    ["not json", "body must be JSON"],
    ["[]", "body must be a JSON object"],
    [JSON.stringify({ name: 5 }), "name must be a string"],
    [JSON.stringify({ name: "x".repeat(101) }), "name must be 100 characters or fewer"],
    [JSON.stringify({ title: "x".repeat(101) }), "title must be 100 characters or fewer"],
    [JSON.stringify({ settings: [] }), "settings must be a JSON object"],
    [JSON.stringify({ settings: { blob: "x".repeat(17000) } }), "settings is too large"],
  ])("rejects %s", async (body, error) => {
    const res = await put("invalid@example.com", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});
