import { env } from "cloudflare:test";
import { handleRequest } from "../src/app";
import { makeSigner } from "./tokens";

export type Signer = Awaited<ReturnType<typeof makeSigner>>;

/** A signed-in API caller. Tests in a file share one database, so each test uses its own emails. */
export function api(signer: Signer) {
  async function call(email: string, method: string, path: string, body?: unknown) {
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": await signer.sign({ email }) });
    if (body !== undefined) headers.set("content-type", "application/json");
    const init: RequestInit = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
    const res = await handleRequest(new Request(`https://skope.khorum-oss.org${path}`, init), env, signer.getKeys);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  return {
    get: (email: string, path: string) => call(email, "GET", path),
    post: (email: string, path: string, body: unknown) => call(email, "POST", path, body),
    put: (email: string, path: string, body: unknown) => call(email, "PUT", path, body),
    patch: (email: string, path: string, body: unknown) => call(email, "PATCH", path, body),
    del: (email: string, path: string) => call(email, "DELETE", path),
  };
}

/** A small version 1 document, as the prototype's .daidal.json export writes it. */
export function doc(name = "checkout", extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    diagram: { id: name, name, kind: "c4", view: "Full system" },
    tags: { api: { label: "API", color: "#968ae0", group: "Layer" } },
    views: [{ name: "Full system", tags: ["api"] }],
    nodes: [{ id: "gw", name: "Gateway", type: "service", tags: ["api"], layout: { x: 10, y: 20, w: 190 } }],
    edges: [],
    ...extra,
  };
}
