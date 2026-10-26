import { ensureUserStatements } from "./db";
import { decidedText, docName, docText, MAX_DOC_BYTES, nameOf } from "./docs";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";
import { requireMember } from "./workspaces";

// A document plus the few fields around it; the document limit is checked on its own.
const MAX_BODY = MAX_DOC_BYTES + 128 * 1024;

interface DiagramRow {
  id: string;
  workspace_id: string;
  owner_email: string;
  name: string;
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

const COLUMNS = "id, workspace_id, owner_email, name, doc, rev, lead_id, synced_snapshot_id, decided, paused, updated_at";

export function diagramOut(row: DiagramRow, withDoc = true) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerEmail: row.owner_email,
    name: row.name,
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

export async function listDiagrams(db: D1Database, email: string, url: URL): Promise<Response> {
  const workspace = url.searchParams.get("workspace");
  if (!workspace) throw new HttpError(400, "say which workspace: ?workspace=<id>");
  await requireMember(db, workspace, email);
  const { results } = await db
    .prepare(`SELECT ${COLUMNS.replace("doc, ", "'{}' AS doc, ")} FROM diagrams WHERE workspace_id = ? ORDER BY updated_at DESC, id`)
    .bind(workspace)
    .all<DiagramRow>();
  return json(results.map(row => diagramOut(row, false)));
}

/**
 * Create a diagram in a workspace the caller belongs to: from a document (`{workspace, doc, name?}`), or as a
 * clone of a diagram they can see (`{workspace, from, follow?, name?}`). A clone copies the source's latest
 * snapshot, or its working copy when it has none; with `follow` it remembers the source and that snapshot.
 */
export async function createDiagram(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const body = await readJson(request, MAX_BODY);
  if (!isPlainObject(body)) throw new HttpError(400, "body must be a JSON object");
  const workspace = typeof body.workspace === "string" ? body.workspace : "";
  if (!workspace) throw new HttpError(400, "workspace is required");
  await requireMember(db, workspace, email);

  let doc: string;
  let name: string;
  let lead: string | null = null;
  let synced: string | null = null;
  if (body.from !== undefined) {
    if (typeof body.from !== "string") throw new HttpError(400, "from must be a diagram id");
    if (body.doc !== undefined) throw new HttpError(400, "send either doc or from, not both");
    const source = await visibleDiagram(db, body.from, email);
    const latest = await db
      .prepare("SELECT id, doc FROM snapshots WHERE diagram_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .bind(source.id)
      .first<{ id: string; doc: string }>();
    doc = latest?.doc ?? source.doc;
    name = body.name === undefined ? source.name : nameOf(body.name);
    if (body.follow === true) {
      lead = source.id;
      synced = latest?.id ?? null;
    } else if (body.follow !== undefined && body.follow !== false) {
      throw new HttpError(400, "follow must be true or false");
    }
  } else {
    doc = docText(body.doc);
    name = nameOf(body.name ?? docName(body.doc));
  }

  const id = crypto.randomUUID();
  await db.batch([
    ...ensureUserStatements(db, email, now),
    db
      .prepare(`INSERT INTO diagrams (id, workspace_id, owner_email, name, doc, lead_id, synced_snapshot_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, workspace, email, name, doc, lead, synced, now),
  ]);
  return json(diagramOut(await visibleDiagram(db, id, email)), 201);
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
  if (body.doc !== undefined) set("doc", docText(body.doc));
  if (body.name !== undefined) set("name", nameOf(body.name));
  if (body.syncedSnapshotId !== undefined) set("synced_snapshot_id", stringOrNull(body.syncedSnapshotId, "syncedSnapshotId"));
  if (body.decided !== undefined) set("decided", decidedText(body.decided));
  if (body.leadId !== undefined) {
    if (body.leadId !== null) throw new HttpError(400, "leadId can only be cleared (null), to stop following");
    set("lead_id", null);
    set("synced_snapshot_id", null);
    set("decided", "{}");
    set("paused", 0);
  }
  if (body.paused !== undefined && body.leadId === undefined) {
    if (typeof body.paused !== "boolean") throw new HttpError(400, "paused must be true or false");
    set("paused", body.paused ? 1 : 0);
  }

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
  const snapshot = crypto.randomUUID();
  await db
    .prepare("INSERT INTO snapshots (id, diagram_id, label, author_email, doc, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(snapshot, id, label, email, doc, now)
    .run();
  return json(snapshotOut({ id: snapshot, label, author_email: email, doc, created_at: now }), 201);
}
