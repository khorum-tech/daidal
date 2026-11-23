import { ensureUserStatements } from "./db";
import { decidedText, docName, docText, groupOf, MAX_DOC_BYTES, nameOf } from "./docs";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";
import { summaryText } from "./summary";
import { checkDiagramRoom, checkHistoryRoom } from "./limits";
import { requireMember } from "./workspaces";

// A document plus the few fields around it; the document limit is checked on its own.
const MAX_BODY = MAX_DOC_BYTES + 128 * 1024;

interface DiagramRow {
  id: string;
  workspace_id: string;
  owner_email: string;
  name: string;
  group_name: string | null;
  doc: string;
  rev: number;
  lead_id: string | null;
  synced_snapshot_id: string | null;
  decided: string;
  paused: number;
  updated_at: number;
}

interface SnapshotRow {
  id: string;
  label: string;
  author_email: string;
  doc: string;
  created_at: number;
}

const COLUMNS = "id, workspace_id, owner_email, name, group_name, doc, rev, lead_id, synced_snapshot_id, decided, paused, updated_at";

export function diagramOut(row: DiagramRow, withDoc = true) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerEmail: row.owner_email,
    name: row.name,
    group: row.group_name,
    ...(withDoc ? { doc: JSON.parse(row.doc) } : {}),
    rev: row.rev,
    leadId: row.lead_id,
    syncedSnapshotId: row.synced_snapshot_id,
    decided: JSON.parse(row.decided),
    paused: row.paused === 1,
    updatedAt: row.updated_at,
  };
}

const snapshotOut = (row: SnapshotRow) => ({
  id: row.id,
  label: row.label,
  authorEmail: row.author_email,
  doc: JSON.parse(row.doc),
  createdAt: row.created_at,
});

/** The diagram, or 404 when it does not exist or [email] is not in its workspace. */
async function visibleDiagram(db: D1Database, id: string, email: string): Promise<DiagramRow> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM diagrams d
       WHERE d.id = ?1 AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = d.workspace_id AND m.email = ?2)`,
    )
    .bind(id, email)
    .first<DiagramRow>();
  if (!row) throw new HttpError(404, "not found");
  return row;
}

/** Members can read and clone a diagram; only its owner changes it. */
async function ownDiagram(db: D1Database, id: string, email: string): Promise<DiagramRow> {
  const row = await visibleDiagram(db, id, email);
  if (row.owner_email !== email) throw new HttpError(403, "only the diagram's owner can change it");
  return row;
}

const stringOrNull = (value: unknown, what: string): string | null => {
  if (value === null) return null;
  if (typeof value === "string" && value.length <= 100) return value;
  throw new HttpError(400, `${what} must be a string or null`);
};

/** The most a list returns at once, and how many when `limit` isn't given. */
const MAX_LIST = 200;

/**
 * `GET /api/diagrams?workspace=<id>[&q=<text>][&limit=<n>&offset=<n>]`: the workspace's diagrams, newest first,
 * without their documents. Each carries its summary (what a card draws; see summary.ts) and, for a follower, its
 * lead's name when the caller can see the lead. `q` keeps the diagrams whose name or a node's name contains it;
 * `group=<name>` keeps that group's diagrams, and `group=` (empty) those in no group.
 */
export async function listDiagrams(db: D1Database, email: string, url: URL): Promise<Response> {
  const workspace = url.searchParams.get("workspace");
  if (!workspace) throw new HttpError(400, "say which workspace: ?workspace=<id>");
  await requireMember(db, workspace, email);
  await fillSummaries(db, workspace);

  const limit = boundedInt(url.searchParams.get("limit"), 1, MAX_LIST, MAX_LIST);
  const offset = boundedInt(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER, 0);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  // `!` escapes LIKE's wildcards, so a search for "100%" or "a_b" means just that.
  const like = `%${q.replaceAll(/[!%_]/g, "!$&")}%`;
  // No `group` lists every diagram; an empty one, those in no group.
  const grouped = url.searchParams.has("group") ? 1 : 0;
  const group = groupOf(url.searchParams.get("group"));
  const columns = COLUMNS.split(", ")
    .map(c => (c === "doc" ? "'{}' AS doc" : `d.${c}`))
    .join(", ");
  const { results } = await db
    .prepare(
      `SELECT ${columns}, d.summary, l.name AS lead_name FROM diagrams d ` +
        // A lead's name only when the caller is in the lead's workspace.
        `LEFT JOIN diagrams l ON l.id = d.lead_id AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = l.workspace_id AND m.email = ?2) ` +
        `WHERE d.workspace_id = ?1 AND (?3 = '' OR d.name LIKE ?4 ESCAPE '!' OR EXISTS (SELECT 1 FROM json_each(d.summary, '$.names') WHERE value LIKE ?4 ESCAPE '!')) ` +
        `AND (?7 = 0 OR d.group_name IS ?8) ` +
        `ORDER BY d.updated_at DESC, d.id LIMIT ?5 OFFSET ?6`,
    )
    .bind(workspace, email, q, like, limit, offset, grouped, group)
    .all<DiagramRow & { summary: string; lead_name: string | null }>();
  return json(results.map(row => ({ ...diagramOut(row, false), summary: JSON.parse(row.summary), leadName: row.lead_name })));
}

const boundedInt = (raw: string | null, min: number, max: number, fallback: number): number => {
  const n = raw === null || raw === "" ? Number.NaN : Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** How many missing summaries one list works out; a workspace with more fills in over the next few lists. */
const FILL_AT_ONCE = 200;

/**
 * Works out summaries a workspace's diagrams are missing, or that were kept before they listed the diagrams their
 * nodes zoom into: so this finds nothing once a workspace has been listed.
 */
async function fillSummaries(db: D1Database, workspace: string): Promise<void> {
  const { results } = await db
    .prepare("SELECT id, doc FROM diagrams WHERE workspace_id = ? AND (summary IS NULL OR json_type(summary, '$.zooms') IS NULL) LIMIT ?")
    .bind(workspace, FILL_AT_ONCE)
    .all<{ id: string; doc: string }>();
  if (results.length) await db.batch(results.map(r => db.prepare("UPDATE diagrams SET summary = ? WHERE id = ?").bind(summaryText(r.doc), r.id)));
}

/** What a clone of `body.from` starts as: the source's latest snapshot (or working copy), its name and, in its own workspace, its group. */
async function cloneOf(db: D1Database, body: Record<string, unknown>, email: string, workspace: string) {
  if (typeof body.from !== "string") throw new HttpError(400, "from must be a diagram id");
  if (body.doc !== undefined) throw new HttpError(400, "send either doc or from, not both");
  if (body.follow !== undefined && typeof body.follow !== "boolean") throw new HttpError(400, "follow must be true or false");
  const source = await visibleDiagram(db, body.from, email);
  const latest = await db
    .prepare("SELECT id, doc FROM snapshots WHERE diagram_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(source.id)
    .first<{ id: string; doc: string }>();
  const sameWorkspace = body.group === undefined && source.workspace_id === workspace;
  return {
    doc: latest?.doc ?? source.doc,
    name: body.name === undefined ? source.name : nameOf(body.name),
    group: sameWorkspace ? source.group_name : groupOf(body.group),
    lead: body.follow === true ? source.id : null,
    synced: body.follow === true ? (latest?.id ?? null) : null,
  };
}

/**
 * Create a diagram in a workspace the caller belongs to: from a document (`{workspace, doc, name?, group?}`), or as a
 * clone of a diagram they can see (`{workspace, from, follow?, name?, group?}`). A clone copies the source's latest
 * snapshot, or its working copy when it has none; with `follow` it remembers the source and that snapshot. A clone
 * in the source's own workspace joins the source's group unless `group` says otherwise.
 */
export async function createDiagram(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const body = await readJson(request, MAX_BODY);
  if (!isPlainObject(body)) throw new HttpError(400, "body must be a JSON object");
  const workspace = typeof body.workspace === "string" ? body.workspace : "";
  if (!workspace) throw new HttpError(400, "workspace is required");
  await requireMember(db, workspace, email);
  await checkDiagramRoom(db, email);

  const { doc, name, group, lead, synced } =
    body.from === undefined
      ? { doc: docText(body.doc), name: nameOf(body.name ?? docName(body.doc)), group: groupOf(body.group), lead: null, synced: null }
      : await cloneOf(db, body, email, workspace);

  const id = crypto.randomUUID();
  await db.batch([
    ...ensureUserStatements(db, email, now),
    db
      .prepare(`INSERT INTO diagrams (id, workspace_id, owner_email, name, group_name, doc, summary, lead_id, synced_snapshot_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, workspace, email, name, group, doc, summaryText(doc), lead, synced, now),
  ]);
  return json(diagramOut(await visibleDiagram(db, id, email)), 201);
}

/**
 * `PATCH /api/diagrams/:id` with `{workspace}`: its owner moves it, with its history, into another workspace they
 * belong to. Who follows it, and what it follows, stay as they are; who can see it is now that workspace's members.
 * Groups belong to a workspace, so a moved diagram is in no group there.
 */
export async function moveDiagram(db: D1Database, id: string, email: string, request: Request, now: number): Promise<Response> {
  const row = await ownDiagram(db, id, email);
  const body = await readJson(request, 4 * 1024);
  if (!isPlainObject(body) || typeof body.workspace !== "string" || !body.workspace) throw new HttpError(400, "say where to: {workspace}");
  if (body.workspace === row.workspace_id) return json(diagramOut(row));
  await requireMember(db, body.workspace, email);
  await db.prepare("UPDATE diagrams SET workspace_id = ?, group_name = NULL, updated_at = ? WHERE id = ?").bind(body.workspace, now, id).run();
  return json(diagramOut(await visibleDiagram(db, id, email)));
}

/**
 * `PUT /api/diagrams/:id/group` with `{group}`: its owner files it under a group in its workspace (a name, new or
 * one in use), or takes it out of one (`null` or ""). It changes neither the document, its revision, nor where the
 * diagram sits in "newest first".
 */
export async function groupDiagram(db: D1Database, id: string, email: string, request: Request): Promise<Response> {
  const row = await ownDiagram(db, id, email);
  const body = await readJson(request, 4 * 1024);
  if (!isPlainObject(body) || !("group" in body)) throw new HttpError(400, "say which group: {group}, or null for none");
  const group = groupOf(body.group);
  if (group !== row.group_name) await db.prepare("UPDATE diagrams SET group_name = ? WHERE id = ?").bind(group, id).run();
  return json(diagramOut({ ...row, group_name: group }));
}

export async function getDiagram(db: D1Database, id: string, email: string): Promise<Response> {
  return json(diagramOut(await visibleDiagram(db, id, email)));
}

/**
 * Save `{rev, doc?, name?, syncedSnapshotId?, decided?, paused?, leadId?}`. `rev` must be the one the client
 * loaded; when the diagram has moved on since, nothing changes and the answer is 409 with the current diagram.
 * `leadId: null` stops following (unlinks), clearing where it was synced to and its verdicts; a lead can't be set here.
 */
export async function saveDiagram(db: D1Database, id: string, email: string, request: Request, now: number): Promise<Response> {
  await ownDiagram(db, id, email);
  const body = await readJson(request, MAX_BODY);
  if (!isPlainObject(body)) throw new HttpError(400, "body must be a JSON object");
  if (!Number.isInteger(body.rev)) throw new HttpError(400, "rev must be the revision you loaded");

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (body.doc !== undefined) {
    const doc = docText(body.doc);
    set("doc", doc);
    set("summary", summaryText(doc));
  }
  if (body.name !== undefined) set("name", nameOf(body.name));
  followSets(body, set);

  const result = await db
    .prepare(`UPDATE diagrams SET ${[...sets, "rev = rev + 1", "updated_at = ?"].join(", ")} WHERE id = ? AND rev = ?`)
    .bind(...values, now, id, body.rev)
    .run();
  const current = await visibleDiagram(db, id, email);
  if (result.meta.changes === 0) {
    throw new HttpError(409, "the diagram changed since you loaded it", { diagram: diagramOut(current) });
  }
  return json(diagramOut(current));
}

/** The follow fields of a save: where it is synced to, verdicts and pause, or `leadId: null` to stop following. */
function followSets(body: Record<string, unknown>, set: (column: string, value: unknown) => void): void {
  if (body.leadId !== undefined) {
    if (body.leadId !== null) throw new HttpError(400, "leadId can only be cleared (null), to stop following");
    set("lead_id", null);
    set("synced_snapshot_id", null);
    set("decided", "{}");
    set("paused", 0);
    return;
  }
  if (body.syncedSnapshotId !== undefined) set("synced_snapshot_id", stringOrNull(body.syncedSnapshotId, "syncedSnapshotId"));
  if (body.decided !== undefined) set("decided", decidedText(body.decided));
  if (body.paused !== undefined) {
    if (typeof body.paused !== "boolean") throw new HttpError(400, "paused must be true or false");
    set("paused", body.paused ? 1 : 0);
  }
}

/** Deletes the diagram with its history. Its followers keep their copies and stop following. */
export async function deleteDiagram(db: D1Database, id: string, email: string): Promise<Response> {
  await ownDiagram(db, id, email);
  await db.prepare("DELETE FROM diagrams WHERE id = ?").bind(id).run();
  return noContent();
}

/** History, oldest first, documents included. A follower reads its lead's changes here. */
export async function listSnapshots(db: D1Database, id: string, email: string): Promise<Response> {
  await visibleDiagram(db, id, email);
  const { results } = await db
    .prepare("SELECT id, label, author_email, doc, created_at FROM snapshots WHERE diagram_id = ? ORDER BY created_at, rowid")
    .bind(id)
    .all<SnapshotRow>();
  return json(results.map(snapshotOut));
}

export async function createSnapshot(db: D1Database, id: string, email: string, request: Request, now: number): Promise<Response> {
  await ownDiagram(db, id, email);
  const body = await readJson(request, MAX_BODY);
  if (!isPlainObject(body)) throw new HttpError(400, "body must be a JSON object");
  const label = nameOf(body.label, "label");
  const doc = docText(body.doc);
  await checkHistoryRoom(db, id, 1, new TextEncoder().encode(doc).length);
  const snapshot = crypto.randomUUID();
  await db
    .prepare("INSERT INTO snapshots (id, diagram_id, label, author_email, doc, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(snapshot, id, label, email, doc, now)
    .run();
  return json(snapshotOut({ id: snapshot, label, author_email: email, doc, created_at: now }), 201);
}
