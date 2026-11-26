import { ensureUserStatements } from "./db";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";

/**
 * Personal access tokens (`skt_` and 43 base64url characters), as Storybild has them: made in the app, shown once,
 * kept only as a SHA-256 hash. A token acts for its person and never beyond what they may do, and is narrower
 * still: read, or read and write; optionally only some workspaces; at most WRITES_PER_MINUTE writes a minute; and
 * none of the account, membership, deleting, moving or backup routes.
 */
export interface TokenGrant {
  id: string;
  name: string;
  scope: "read" | "write";
  /** The workspaces it may reach, or null for all of the person's. */
  workspaces: string[] | null;
}

export interface Actor {
  email: string;
  /** Set when the request came with a token rather than a browser sign-in. */
  token: TokenGrant | null;
}

export const WRITES_PER_MINUTE = 120;
export const MAX_TOKENS = 20;
const SHAPE = /^skt_[A-Za-z0-9_-]{43}$/;
const LAST_USED_EVERY = 60_000;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const hashOf = async (token: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `skt_${btoa(String.fromCodePoint(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

/** The bearer token on [request], or null when there is none. One not shaped like ours is refused here, before any lookup. */
export function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !SHAPE.test(match[1])) throw new HttpError(401, "not a valid access token");
  return match[1];
}

interface TokenRow {
  id: string;
  email: string;
  name: string;
  scope: "read" | "write";
  workspaces: string;
  created_at: number;
  last_used_at: number | null;
}

const listOf = (text: string): string[] | null => (text ? (JSON.parse(text) as string[]) : null);
const grantOf = (r: TokenRow): TokenGrant => ({ id: r.id, name: r.name, scope: r.scope, workspaces: listOf(r.workspaces) });

/** Who [token] acts for, or a 401. Its last use is noted at most once a minute. */
export async function actorFor(db: D1Database, token: string, now: number): Promise<Actor> {
  const row = await db.prepare("SELECT * FROM access_tokens WHERE hash = ?").bind(await hashOf(token)).first<TokenRow>();
  if (!row) throw new HttpError(401, "this access token is not valid or was revoked");
  if (!row.last_used_at || row.last_used_at < now - LAST_USED_EVERY) {
    await db.prepare("UPDATE access_tokens SET last_used_at = ? WHERE id = ?").bind(now, row.id).run();
  }
  return { email: row.email, token: grantOf(row) };
}

const WRITES: [method: string, path: RegExp][] = [
  ["POST", /^\/api\/diagrams$/],
  ["PUT", /^\/api\/diagrams\/[^/]+$/],
  ["POST", /^\/api\/diagrams\/[^/]+\/snapshots$/],
  ["PUT", /^\/api\/diagrams\/[^/]+\/group$/],
  ["PUT", /^\/api\/workspaces\/[^/]+\/types\/[^/]+$/],
];

/**
 * What a token may do, decided before the route runs: read anything its person may (but not its own tokens), and
 * with write scope only make and save diagrams, file them under groups, take snapshots and save workspace types.
 */
export function checkToken(grant: TokenGrant, method: string, path: string): void {
  if (path.startsWith("/api/me/tokens")) throw new HttpError(403, "access tokens cannot manage access tokens");
  if (path === "/api/me/sessions") throw new HttpError(403, "access tokens cannot end sign-in sessions; use the app");
  if (path === "/api/me/export") throw new HttpError(403, "access tokens cannot download your account; use the app");
  if (path.startsWith("/api/workspaces/import") || /^\/api\/workspaces\/[^/]+\/export$/.test(path)) {
    throw new HttpError(403, "access tokens cannot import or export backups; use the app");
  }
  if (method === "GET" || method === "HEAD") return;
  if (grant.scope === "read") throw new HttpError(403, "this access token can only read");
  if (WRITES.some(([m, p]) => m === method && p.test(path))) return;
  throw new HttpError(403, "access tokens cannot do this; use the app");
}

const WORKSPACE_PATH = /^\/api\/workspaces\/([^/]+)(?:\/|$)/;
const DIAGRAM_PATH = /^\/api\/diagrams\/([^/]+)(?:\/|$)/;

const decoded = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new HttpError(404, "not found");
  }
};

/**
 * For a token limited to some workspaces: a 404 for anything in another one, as if it didn't exist. A diagram's
 * workspace is looked up; a new diagram (or a copy) names its workspace, and the copy's source, in its body.
 */
export async function checkWorkspaces(db: D1Database, grant: TokenGrant, request: Request, url: URL): Promise<void> {
  const allowed = grant.workspaces;
  if (!allowed) return;
  const reach = (workspace: unknown) => {
    if (typeof workspace === "string" && !allowed.includes(workspace)) throw new HttpError(404, "not found");
  };
  const diagramReach = async (id: string) => {
    const row = await db.prepare("SELECT workspace_id FROM diagrams WHERE id = ?").bind(id).first<{ workspace_id: string }>();
    if (row) reach(row.workspace_id);
  };
  const path = url.pathname;
  const ws = WORKSPACE_PATH.exec(path);
  if (ws) return reach(decoded(ws[1]));
  const diagram = DIAGRAM_PATH.exec(path);
  if (diagram) return diagramReach(decoded(diagram[1]));
  if (path !== "/api/diagrams") return;
  if (request.method === "GET") return reach(url.searchParams.get("workspace") ?? "");
  if (request.method === "POST") {
    const body = await readJson(request.clone(), 2 * 1024 * 1024).catch(() => null);
    if (!isPlainObject(body)) return;
    reach(body.workspace);
    if (typeof body.from === "string") await diagramReach(body.from);
  }
}

/** Counts a write against the token's minute; a 429 past WRITES_PER_MINUTE. */
export async function countWrite(db: D1Database, grant: TokenGrant, now: number): Promise<void> {
  const fresh = now - 60_000;
  const row = await db
    .prepare(
      `UPDATE access_tokens SET
         window_writes = CASE WHEN window_start <= ?1 THEN 1 ELSE window_writes + 1 END,
         window_start = CASE WHEN window_start <= ?1 THEN ?2 ELSE window_start END
       WHERE id = ?3 RETURNING window_writes`,
    )
    .bind(fresh, now, grant.id)
    .first<{ window_writes: number }>();
  if (row && row.window_writes > WRITES_PER_MINUTE) throw new HttpError(429, `at most ${WRITES_PER_MINUTE} changes a minute through an access token; wait a moment`);
}

const tokenOut = (r: TokenRow) => ({
  id: r.id,
  name: r.name,
  scope: r.scope,
  workspaces: listOf(r.workspaces),
  createdAt: new Date(r.created_at).toISOString(),
  lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
});

async function createToken(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const body = await readJson(request, 16 * 1024);
  if (!isPlainObject(body)) throw new HttpError(400, "body must be a JSON object");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) throw new HttpError(400, "give the token a name");
  if (body.scope !== "read" && body.scope !== "write") throw new HttpError(400, "scope must be read or write");
  let workspaces: string[] | null = null;
  if (body.workspaces != null) {
    const list = body.workspaces;
    if (!Array.isArray(list) || list.length === 0 || list.length > 50 || !list.every(w => typeof w === "string")) {
      throw new HttpError(400, "workspaces must be a list of workspace ids, or left out for all");
    }
    workspaces = [...new Set(list as string[])];
    const reachable = await db
      .prepare(`SELECT COUNT(*) AS n FROM workspace_members WHERE email = ? AND workspace_id IN (${workspaces.map(() => "?").join(", ")})`)
      .bind(email, ...workspaces)
      .first<{ n: number }>();
    if ((reachable?.n ?? 0) !== workspaces.length) throw new HttpError(400, "a workspace in the list is not one of yours");
  }
  const count = await db.prepare("SELECT COUNT(*) AS n FROM access_tokens WHERE email = ?").bind(email).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TOKENS) throw new HttpError(409, `at most ${MAX_TOKENS} access tokens; revoke one first`);

  const token = newToken();
  const row: TokenRow = { id: crypto.randomUUID(), email, name, scope: body.scope, workspaces: workspaces ? JSON.stringify(workspaces) : "", created_at: now, last_used_at: null };
  await db.batch([
    ...ensureUserStatements(db, email, now),
    db
      .prepare("INSERT INTO access_tokens (id, email, name, hash, scope, workspaces, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(row.id, email, name, await hashOf(token), row.scope, row.workspaces, now),
  ]);
  return json({ ...tokenOut(row), token }, 201);
}

/** `/api/me/tokens` (GET list, POST create) and `/api/me/tokens/:id` (DELETE revoke), for a browser sign-in only. */
export async function tokensRoute(db: D1Database, email: string, request: Request, id: string | undefined, now: number): Promise<Response> {
  const method = request.method;
  if (id) {
    if (method !== "DELETE") throw new HttpError(405, "method not allowed");
    const gone = await db.prepare("DELETE FROM access_tokens WHERE id = ? AND email = ?").bind(id, email).run();
    if (!gone.meta.changes) throw new HttpError(404, "not found");
    return noContent();
  }
  if (method === "GET") {
    const rows = await db.prepare("SELECT * FROM access_tokens WHERE email = ? ORDER BY created_at DESC, rowid DESC").bind(email).all<TokenRow>();
    return json(rows.results.map(tokenOut));
  }
  if (method === "POST") return createToken(db, email, request, now);
  throw new HttpError(405, "method not allowed");
}
