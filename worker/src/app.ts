import { currentEmail, type KeySource } from "./auth";
import { ensureUser, updateUser } from "./db";
import * as diagrams from "./diagrams";
import type { Env } from "./env";
import { HttpError, json, readJson } from "./http";
import { exportWorkspace, importWorkspaces } from "./importer";
import { parseProfilePatch } from "./profile";
import * as workspaces from "./workspaces";

const MAX_PROFILE_BODY = 64 * 1024;
const WORKSPACE_PATH = /^\/api\/workspaces(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/;
const DIAGRAM_PATH = /^\/api\/diagrams(?:\/([^/]+)(?:\/(snapshots))?)?$/;

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
  throw new HttpError(404, "not found");
}

function diagramRoute(request: Request, db: D1Database, email: string, url: URL, parts: RegExpMatchArray, now: number): Promise<Response> {
  const [id, snapshots] = segments(parts);
  const method = request.method;
  if (!id) {
    if (method === "GET") return diagrams.listDiagrams(db, email, url);
    if (method === "POST") return diagrams.createDiagram(db, email, request, now);
    return notAllowed();
  }
  if (snapshots) {
    if (method === "GET") return diagrams.listSnapshots(db, id, email);
    if (method === "POST") return diagrams.createSnapshot(db, id, email, request, now);
    return notAllowed();
  }
  if (method === "GET") return diagrams.getDiagram(db, id, email);
  if (method === "PUT") return diagrams.saveDiagram(db, id, email, request, now);
  if (method === "DELETE") return diagrams.deleteDiagram(db, id, email);
  return notAllowed();
}

export async function handleRequest(
  request: Request,
  env: Env,
  getKeys: () => KeySource,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  try {
    const email = await currentEmail(request, env, getKeys);
    if (!email) return json({ error: "not signed in" }, 401);

    const now = Date.now();
    if (url.pathname === "/api/me") return await me(request, env, email);
    const workspace = WORKSPACE_PATH.exec(url.pathname);
    if (workspace) return await workspaceRoute(request, env.DB, email, workspace, now);
    const diagram = DIAGRAM_PATH.exec(url.pathname);
    if (diagram) return await diagramRoute(request, env.DB, email, url, diagram, now);
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.body }, e.status);
    console.error("API request failed:", e);
    return json({ error: "internal error" }, 500);
  }
}
