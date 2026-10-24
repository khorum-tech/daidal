import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { makeSigner } from "./tokens";

let signer: Awaited<ReturnType<typeof makeSigner>>;
let other: Awaited<ReturnType<typeof makeSigner>>;

beforeAll(async () => {
  signer = await makeSigner();
  other = await makeSigner();
});

function request(path: string, token?: string) {
  return new Request(`https://skope.khorum-oss.org${path}`, {
    headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
  });
}

describe("handleRequest", () => {
  it("passes non-API paths to the static assets", async () => {
    const assets = { fetch: async () => new Response("the bundle") } as unknown as Fetcher;
    const res = await handleRequest(request("/index.html"), { ...env, ASSETS: assets }, signer.getKeys);
    expect(await res.text()).toBe("the bundle");
  });

  it("rejects a token signed by a different key", async () => {
    const token = await other.sign({ email: "forged@example.com" });
    const res = await handleRequest(request("/api/me", token), env, signer.getKeys);
    expect(res.status).toBe(401);
  });

  it("answers a database failure with 500 JSON instead of throwing", async () => {
    const broken = {
      batch: async () => {
        throw new Error("D1 is down");
      },
    } as unknown as D1Database;
    const token = await signer.sign({ email: "db-down@example.com" });
    const res = await handleRequest(request("/api/me", token), { ...env, DB: broken }, signer.getKeys);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
  });
});

describe("serving the app", () => {
  // A stand-in for the assets binding: these paths exist, everything else is a 404. Like the real one, it serves a
  // folder's index.html at the folder's own path.
  const files: Record<string, string> = { "/": "prototype", "/app/": "the app", "/app/_app/x.js": "js" };
  const assets = {
    fetch: async (input: Request | string) => {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      return path in files ? new Response(files[path]) : new Response("missing", { status: 404 });
    },
  } as unknown as Fetcher;
  const get = (path: string) => handleRequest(request(path), { ...env, ASSETS: assets }, signer.getKeys);

  it("serves the app's page for its routes", async () => {
    for (const path of ["/app", "/app/", "/app/d/123", "/app/d/abc?x=1"]) {
      const res = await get(path);
      expect(await res.text(), path).toBe("the app");
    }
  });

  it("serves files as they are, and keeps missing files and build assets a 404", async () => {
    expect(await (await get("/app/_app/x.js")).text()).toBe("js");
    expect((await get("/app/_app/missing.js")).status).toBe(404);
    expect((await get("/app/favicon.png")).status).toBe(404);
  });

  it("leaves the prototype's paths alone", async () => {
    expect((await get("/somewhere")).status).toBe(404);
    expect(await (await get("/")).text()).toBe("prototype");
  });
});
