import { currentEmail, type KeySource } from "./auth";
import { ensureUser, updateUser } from "./db";
import * as diagrams from "./diagrams";
import type { Env } from "./env";
import { deleteAccount, exportAccount } from "./account";
import { secured } from "./headers";
import { authRoute } from "./signin/routes";
import { endAllSessions } from "./signin/sessions";
import { applyLimitOverrides, countSessionWrite } from "./limits";
import { HttpError, json, readJson } from "./http";
import { exportWorkspace, importWorkspaces } from "./importer";
import { parseProfilePatch } from "./profile";
import { mcpRoute } from "./mcp/server";
import { ToolError, type Api } from "./mcp/tools";
import { actorFor, bearerOf, checkToken, checkWorkspaces, countWrite, tokensRoute, type Actor, type TokenGrant } from "./tokens";
import { deleteType, putType } from "./types";
import * as workspaces from "./workspaces";

const MAX_PROFILE_BODY = 64 * 1024;
const WORKSPACE_PATH = /^\/api\/workspaces(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/;
const DIAGRAM_PATH = /^\/api\/diagrams(?:\/([^/]+)(?:\/(snapshots|group))?)?$/;
const TOKENS_PATH = /^\/api\/me\/tokens(?:\/([^/]+))?$/;

const notAllowed = (): never => {
  throw new HttpError(405, "method not allowed");
};

/** The path's captured segments, decoded; malformed percent-encoding is a 404. */
function segments(parts: RegExpMatchArray): (string | undefined)[] {
  try {
    return parts.slice(1).map(p => (p === undefined ? undefined : decodeURIComponent(p)));
  } catch {
    throw new HttpError(404, "not found");
  }
}

async function me(request: Request, env: Env, email: string): Promise<Response> {
  if (request.method === "GET") return json(await ensureUser(env.DB, email));
  if (request.method === "DELETE") return deleteAccount(env.DB, email, request);
  if (request.method === "PUT") {
    const parsed = parseProfilePatch(await readJson(request, MAX_PROFILE_BODY));
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    await ensureUser(env.DB, email);
    return json(await updateUser(env.DB, email, parsed.patch));
  }
  return notAllowed();
}

function workspaceRoute(request: Request, db: D1Database, email: string, parts: RegExpMatchArray, now: number): Promise<Response> {
  const [id, section, member] = segments(parts);
  const method = request.method;
  if (!id) {
    if (method === "GET") return workspaces.listWorkspaces(db, email, now);
    if (method === "POST") return workspaces.createWorkspace(db, email, request, now);
    return notAllowed();
  }
  if (!section) {
    if (id === "import") return method === "POST" ? importWorkspaces(db, email, request, now) : notAllowed();
    if (method === "PATCH") return workspaces.renameWorkspace(db, id, email, request);
    if (method === "DELETE") return workspaces.deleteWorkspace(db, id, email);
    return notAllowed();
  }
  if (section === "export" && !member) return method === "GET" ? exportWorkspace(db, id, email) : notAllowed();
  if (section === "members") {
    if (!member) return method === "POST" ? workspaces.addMember(db, id, email, request, now) : notAllowed();
    return method === "DELETE" ? workspaces.removeMember(db, id, email, member) : notAllowed();
  }
  if (section === "types" && member) {
    if (method === "PUT") return putType(db, id, email, member, request, now);
    if (method === "DELETE") return deleteType(db, id, email, member);
    return notAllowed();
  }
  throw new HttpError(404, "not found");
}

type Handler = () => Promise<Response>;

/** Runs the handler for the request's method, or answers 405 when the route has none. */
function byMethod(method: string, handlers: Partial<Record<string, Handler>>): Promise<Response> {
  const handler = handlers[method];
  return handler ? handler() : notAllowed();
}

function diagramRoute(request: Request, db: D1Database, email: string, url: URL, parts: RegExpMatchArray, now: number): Promise<Response> {
  const [id, section] = segments(parts);
  const method = request.method;
  if (!id) {
    return byMethod(method, {
      GET: () => diagrams.listDiagrams(db, email, url),
      POST: () => diagrams.createDiagram(db, email, request, now),
    });
  }
  if (section === "snapshots") {
    return byMethod(method, {
      GET: () => diagrams.listSnapshots(db, id, email),
      POST: () => diagrams.createSnapshot(db, id, email, request, now),
    });
  }
  if (section === "group") return byMethod(method, { PUT: () => diagrams.groupDiagram(db, id, email, request) });
  return byMethod(method, {
    GET: () => diagrams.getDiagram(db, id, email),
    PUT: () => diagrams.saveDiagram(db, id, email, request, now),
    PATCH: () => diagrams.moveDiagram(db, id, email, request, now),
    DELETE: () => diagrams.deleteDiagram(db, id, email),
  });
}

/**
 * Static files come first; a request reaches the Worker only when no file matches. The site root goes to the app,
 * and /version to version.json, what build is live (scripts/build-info.mjs), never cached. Under /app that is one of the SvelteKit app's routes, so it gets the app's page, unless it looks like a file (an
 * extension, or the app's `_app/` build folder), which stays a 404. Anything else is a 404.
 */
async function siteFile(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/" || url.pathname === "/index.html") return Response.redirect(new URL(`/app/${url.search}`, url).href, 302);
  if (url.pathname === "/version") {
    const build = await env.ASSETS.fetch(new Request(new URL("/version.json", url), request));
    const out = new Response(build.body, build);
    out.headers.set("cache-control", "no-store");
    return out;
  }
  const file = await env.ASSETS.fetch(request);
  if (file.status !== 404 || !(url.pathname === "/app" || url.pathname.startsWith("/app/"))) return file;
  const last = url.pathname.split("/").pop() ?? "";
  if (url.pathname.startsWith("/app/_app/") || /\.[A-Za-z0-9]+$/.test(last)) return file;
  // "/app/" rather than "/app/index.html": the assets binding answers the latter with a redirect to the former.
  return env.ASSETS.fetch(new Request(new URL("/app/", url), request));
}

/** What went wrong, for the log: the error's kind and message only, never its data (which can hold an email). */
const errorName = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message.split(" ").map(word => (word.includes("@") ? "<email>" : word)).join(" ")}` : typeof e;

/** A 401 an MCP client understands: it needs to sign in, or a bearer token. */
function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": 'Bearer realm="daidal"' },
  });
}

/**
 * `/mcp`: the MCP server. A client signs in with a personal access token (local work, scripts) or through
 * Cloudflare Access, whose Managed OAuth lets MCP clients sign in as the person (claude.ai, Claude Desktop, Claude
 * Code online). Without either, a 401 comes before any database read. Its tools call this API in-process as that
 * person, so every rule the API applies to them, and to a token, applies to the tools.
 */
async function mcpEndpoint(request: Request, env: Env, getKeys: () => KeySource): Promise<Response> {
  let actor: Actor | null;
  try {
    actor = await actorOf(request, env, getKeys, Date.now());
  } catch (e) {
    return unauthorized(e instanceof HttpError ? e.message : "not signed in");
  }
  if (!actor) return unauthorized("sign in, or send a personal access token (your initial → AI access)");
  const signedIn = actor;
  const headers = new Headers({ "content-type": "application/json" });
  const api: Api = async (method, path, body) => {
    const init: RequestInit = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
    const res = await handleRequest(new Request(new URL(path, request.url), init), env, getKeys, signedIn);
    if (res.status === 204) return null;
    const data = (await res.json().catch(() => null)) as { error?: string; diagram?: never } | null;
    if (!res.ok) throw new ToolError(data?.error ?? `the request failed (${res.status})`, res.status, data?.diagram);
    return data;
  };
  try {
    return await mcpRoute(request, api);
  } catch (e) {
    console.error("MCP request failed:", errorName(e));
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal error" } }, 500);
  }
}

/** What a token may do, checked before its request runs: the route, the workspace, and its writes this minute. */
async function guardToken(db: D1Database, token: TokenGrant, request: Request, url: URL, now: number): Promise<void> {
  // The routes match decoded segments, so the policy does too: `/%65xport` is the export route.
  checkToken(token, request.method, decodedPath(url.pathname));
  await checkWorkspaces(db, token, request, url);
  if (request.method !== "GET" && request.method !== "HEAD") await countWrite(db, token, now);
}

/** The workspace list as a token limited to some workspaces may see it: only those. */
async function limitList(response: Response, token: TokenGrant | null, isList: boolean): Promise<Response> {
  const allowed = token?.workspaces;
  if (!allowed || !isList || !response.ok) return response;
  return json(((await response.json()) as { id: string }[]).filter(w => allowed.includes(w.id)));
}

/** Who is asking: [as] when the MCP server calls in for its client, else an access token, else the browser's sign-in. */
async function actorOf(request: Request, env: Env, getKeys: () => KeySource, now: number, as?: Actor): Promise<Actor | null> {
  if (as) return as;
  // A token not shaped like ours is refused before any lookup, so a stranger's guess costs no database read.
  const bearer = bearerOf(request);
  if (bearer) return actorFor(env.DB, bearer, now);
  const email = await currentEmail(request, env, getKeys);
  return email ? { email, token: null } : null;
}

/** [path] with each segment percent-decoded; one that can't be decoded is a 404. */
function decodedPath(path: string): string {
  try {
    return path.split("/").map(decodeURIComponent).join("/");
  } catch {
    throw new HttpError(404, "not found");
  }
}

/** Every response, with the site's security headers (worker/src/headers.ts). */
export async function handleRequest(
  request: Request,
  env: Env,
  getKeys: () => KeySource,
  /** Who is asking, already decided: the MCP server's own calls into the API, as the client it signed in. */
  as?: Actor,
): Promise<Response> {
  return secured(await route(request, env, getKeys, as));
}

async function route(request: Request, env: Env, getKeys: () => KeySource, as?: Actor): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/mcp") return mcpEndpoint(request, env, getKeys);
  const signIn = await authRoute(request, env, url, getKeys).catch(e => {
    console.error("sign-in request failed:", errorName(e));
    return json({ error: "internal error" }, 500);
  });
  if (signIn) return signIn;
  if (!url.pathname.startsWith("/api/")) return siteFile(request, env, url);

  applyLimitOverrides(env.DAIDAL_LIMITS);
  try {
    const now = Date.now();
    const actor = await actorOf(request, env, getKeys, now, as);
    if (!actor) return json({ error: "not signed in" }, 401);
    const { email, token } = actor;
    if (token) await guardToken(env.DB, token, request, url, now);
    else if (request.method !== "GET" && request.method !== "HEAD") await countSessionWrite(env.DB, email, now);

    const tokens = TOKENS_PATH.exec(url.pathname);
    if (tokens) return await tokensRoute(env.DB, email, request, segments(tokens)[0], now);
    if (url.pathname === "/api/me") return await me(request, env, email);
    if (url.pathname === "/api/me/sessions") {
      return request.method === "DELETE" ? json({ ended: await endAllSessions(env.DB, email) }) : notAllowed();
    }
    if (url.pathname === "/api/me/export") return request.method === "GET" ? await exportAccount(env.DB, email, now) : notAllowed();
    const workspace = WORKSPACE_PATH.exec(url.pathname);
    if (workspace) return limitList(await workspaceRoute(request, env.DB, email, workspace, now), token, !workspace[1] && request.method === "GET");
    const diagram = DIAGRAM_PATH.exec(url.pathname);
    if (diagram) return await diagramRoute(request, env.DB, email, url, diagram, now);
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.body }, e.status);
    console.error("API request failed:", errorName(e));
    return json({ error: "internal error" }, 500);
  }
}
