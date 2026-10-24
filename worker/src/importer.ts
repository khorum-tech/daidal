import { ensureUserStatements, personalWorkspaceId } from "./db";
import { decidedText, docName, docText, nameOf } from "./docs";
import { HttpError, isPlainObject, json, readJson } from "./http";
import { requireMember } from "./workspaces";

/**
 * A `skope-backup` holds whole workspaces: their diagrams, each diagram's history, and which diagram follows
 * which. `POST /api/workspaces/import` turns every workspace in it into a new workspace owned by the caller (or,
 * for `personal: true`, fills the caller's personal workspace). Members are not carried over. Ids in the file
 * are local to it: everything gets a new id, and `follows` points at another diagram in the same file.
 *
 *   { "format": "skope-backup", "version": 1, "workspaces": [
 *       { "name": "Platform team", "personal": false, "diagrams": [
 *           { "id": "ledger", "name": "…", "doc": { "version": 1, … }, "updated": "2026-10-01T…Z",
 *             "snapshots": [ { "id": "s1", "label": "…", "doc": { … }, "at": "2026-09-01T…Z" } ],
 *             "follows": { "diagram": "<file id>", "synced": "<its snapshot id>" | null, "paused": false, "decided": {} } } ] } ] }
 *
 * Everything is checked before anything is written, and the writes are one batch. The import never reads the
 * database, so the stage seed can run it against a recorder (stage/seed.ts).
 */
export const BACKUP_FORMAT = "skope-backup";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
// One bound parameter may be at most 2 MB in D1; rows go in as JSON arrays chunked well below that.
const MAX_CHUNK_BYTES = 900_000;
// D1 allows a limited number of statements in one request.
const MAX_STATEMENTS = 45;
const FILE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const encoder = new TextEncoder();

type Row = Record<string, unknown>;

interface PlannedDiagram {
  id: string;
  workspace_id: string;
  name: string;
  doc: string;
  updated_at: number;
}
interface PlannedSnapshot {
  id: string;
  diagram_id: string;
  label: string;
  doc: string;
  created_at: number;
}
interface PlannedFollow {
  id: string;
  lead_id: string;
  synced_snapshot_id: string | null;
  paused: number;
  decided: string;
}

const time = (value: unknown, fallback: number) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
};

const list = (value: unknown, what: string): Row[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isPlainObject)) throw new HttpError(400, `${what} must be a list of objects`);
  return value;
};

const fileId = (value: unknown, what: string): string => {
  if (typeof value !== "string" || !FILE_ID.test(value)) throw new HttpError(400, `${what} has an id the import cannot use: ${JSON.stringify(value)}`);
  return value;
};

/** `INSERT … SELECT … FROM json_each(?N)` over [rows], split so no array passes the chunk size. The array is always the last value. */
function chunked(db: D1Database, sql: string, leading: unknown[], rows: object[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  let chunk: object[] = [];
  let bytes = 0;
  const flush = () => {
    if (chunk.length) statements.push(db.prepare(sql).bind(...leading, JSON.stringify(chunk)));
    chunk = [];
    bytes = 0;
  };
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (size > MAX_CHUNK_BYTES) throw new HttpError(400, "a diagram or snapshot is too large to import");
    if (bytes + size > MAX_CHUNK_BYTES) flush();
    chunk.push(row);
    bytes += size;
  }
  flush();
  return statements;
}

export async function importWorkspaces(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const file = await readJson(request, MAX_IMPORT_BYTES);
  if (!isPlainObject(file) || file.format !== BACKUP_FORMAT) throw new HttpError(400, "this isn't a Skope backup file");
  if (file.version !== 1) throw new HttpError(400, "this Skope backup is from a newer version");
  const workspaces = list(file.workspaces, "workspaces");
  if (workspaces.length === 0) throw new HttpError(400, "the file has no workspaces to import");

  const statements: D1PreparedStatement[] = [...ensureUserStatements(db, email, now)];
  const diagrams: PlannedDiagram[] = [];
  const snapshots: PlannedSnapshot[] = [];
  const follows: { from: string; spec: Row }[] = [];
  const newId = new Map<string, string>(); // file diagram id -> new id
  const snapshotIds = new Map<string, Map<string, string>>(); // file diagram id -> file snapshot id -> new id
  const summary: { id: string; name: string; personal: boolean; diagrams: number; snapshots: number }[] = [];

  workspaces.forEach((ws, w) => {
    const personal = ws.personal === true;
    const name = personal ? "Personal" : nameOf(ws.name, `workspace ${w + 1}'s name`);
    const workspaceId = personal ? personalWorkspaceId(email) : crypto.randomUUID();
    if (!personal) {
      statements.push(
        db.prepare("INSERT INTO workspaces (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)").bind(workspaceId, name, email, now),
        db.prepare("INSERT INTO workspace_members (workspace_id, email, added_at) VALUES (?, ?, ?)").bind(workspaceId, email, now),
      );
    }
    const entry = { id: workspaceId, name, personal, diagrams: 0, snapshots: 0 };
    summary.push(entry);

    for (const d of list(ws.diagrams, `workspace "${name}"'s diagrams`)) {
      const local = fileId(d.id, "a diagram");
      if (newId.has(local)) throw new HttpError(400, `two diagrams in the file share the id ${local}`);
      const id = crypto.randomUUID();
      newId.set(local, id);
      const where = `diagram ${local}`;
      const updated = time(d.updated, now);
      diagrams.push({ id, workspace_id: workspaceId, name: nameOf(d.name ?? docName(d.doc), `${where}'s name`), doc: docText(d.doc, `${where}'s doc`), updated_at: updated });
      entry.diagrams += 1;

      const ids = new Map<string, string>();
      snapshotIds.set(local, ids);
      for (const s of list(d.snapshots, `${where}'s snapshots`)) {
        const snap = fileId(s.id, `a snapshot of ${where}`);
        if (ids.has(snap)) throw new HttpError(400, `${where} has two snapshots with the id ${snap}`);
        ids.set(snap, crypto.randomUUID());
        snapshots.push({
          id: ids.get(snap)!,
          diagram_id: id,
          label: nameOf(s.label, `snapshot ${snap}'s label`),
          doc: docText(s.doc, `snapshot ${snap}'s doc`),
          created_at: time(s.at, updated),
        });
        entry.snapshots += 1;
      }
      if (d.follows !== undefined) {
        if (!isPlainObject(d.follows)) throw new HttpError(400, `${where}'s follows must be an object`);
        follows.push({ from: local, spec: d.follows });
      }
    }
  });

  // Follows can point anywhere in the file, so they are resolved once every diagram has its new id.
  const leadOf = new Map(follows.map(f => [f.from, f.spec.diagram]));
  const planned: PlannedFollow[] = follows.map(({ from, spec }) => {
    const where = `diagram ${from}`;
    const lead = typeof spec.diagram === "string" ? spec.diagram : "";
    if (!newId.has(lead)) throw new HttpError(400, `${where} follows ${JSON.stringify(spec.diagram)}, which is not in the file`);
    // A clone can only follow something that existed before it, so a loop means the file is wrong.
    const seen = new Set([from]);
    for (let at: unknown = lead; typeof at === "string"; at = leadOf.get(at)) {
      if (seen.has(at)) throw new HttpError(400, `${where} follows itself through a loop`);
      seen.add(at);
    }
    let synced: string | null = null;
    if (spec.synced !== undefined && spec.synced !== null) {
      synced = snapshotIds.get(lead)!.get(spec.synced as string) ?? null;
      if (!synced) throw new HttpError(400, `${where} is synced to ${JSON.stringify(spec.synced)}, which is not a snapshot of ${lead}`);
    }
    if (spec.paused !== undefined && typeof spec.paused !== "boolean") throw new HttpError(400, `${where}'s paused must be true or false`);
    // A verdict is keyed "<lead snapshot id>:<change>", so it follows that snapshot to its new id.
    const decided = JSON.parse(decidedText(spec.decided ?? {})) as Row;
    const leadSnapshots = snapshotIds.get(lead)!;
    const remapped = Object.fromEntries(
      Object.entries(decided).map(([key, verdict]) => {
        const cut = key.indexOf(":");
        const renamed = cut > 0 ? leadSnapshots.get(key.slice(0, cut)) : undefined;
        return [renamed ? renamed + key.slice(cut) : key, verdict];
      }),
    );
    return { id: newId.get(from)!, lead_id: newId.get(lead)!, synced_snapshot_id: synced, paused: spec.paused ? 1 : 0, decided: decidedText(remapped) };
  });

  const cols = (names: string[]) => names.map(n => `json_extract(value, '$.${n}')`).join(", ");
  statements.push(
    ...chunked(
      db,
      `INSERT INTO diagrams (id, workspace_id, owner_email, name, doc, updated_at) SELECT ${cols(["id", "workspace_id"])}, ?1, ${cols(["name", "doc", "updated_at"])} FROM json_each(?2)`,
      [email],
      diagrams,
    ),
    // Every diagram exists by now, so a follower's lead_id always has a row to point at.
    ...chunked(
      db,
      `UPDATE diagrams SET lead_id = json_extract(j.value, '$.lead_id'), synced_snapshot_id = json_extract(j.value, '$.synced_snapshot_id'), ` +
        `paused = json_extract(j.value, '$.paused'), decided = json_extract(j.value, '$.decided') ` +
        `FROM json_each(?1) AS j WHERE diagrams.id = json_extract(j.value, '$.id')`,
      [],
      planned,
    ),
    ...chunked(
      db,
      `INSERT INTO snapshots (id, diagram_id, label, author_email, doc, created_at) SELECT ${cols(["id", "diagram_id", "label"])}, ?1, ${cols(["doc", "created_at"])} FROM json_each(?2)`,
      [email],
      snapshots,
    ),
  );
  if (statements.length > MAX_STATEMENTS) throw new HttpError(400, "the file is too large to import in one request; import one workspace at a time");

  await db.batch(statements);
  return json({ workspaces: summary }, 201);
}

/** `GET /api/workspaces/:id/export`: the workspace as a `skope-backup` that import reads back. */
export async function exportWorkspace(db: D1Database, workspace: string, email: string): Promise<Response> {
  await requireMember(db, workspace, email);
  const [ws, rows, snaps] = await db.batch<Record<string, string | number | null>>([
    db.prepare("SELECT id, name, owner_email FROM workspaces WHERE id = ?").bind(workspace),
    db.prepare("SELECT id, name, doc, updated_at, lead_id, synced_snapshot_id, paused, decided FROM diagrams WHERE workspace_id = ? ORDER BY updated_at, rowid").bind(workspace),
    db
      .prepare(
        `SELECT s.id, s.diagram_id, s.label, s.doc, s.created_at FROM snapshots s JOIN diagrams d ON d.id = s.diagram_id
         WHERE d.workspace_id = ? ORDER BY s.created_at, s.rowid`,
      )
      .bind(workspace),
  ]);
  const info = ws.results[0];
  const here = new Set(rows.results.map(r => r.id));
  const snapshotOf = new Map(snaps.results.map(s => [s.id, s.diagram_id]));
  const iso = (ms: unknown) => new Date(Number(ms)).toISOString();
  const diagrams = rows.results.map(r => ({
    id: r.id,
    name: r.name,
    doc: JSON.parse(String(r.doc)),
    updated: iso(r.updated_at),
    snapshots: snaps.results
      .filter(s => s.diagram_id === r.id)
      .map(s => ({ id: s.id, label: s.label, doc: JSON.parse(String(s.doc)), at: iso(s.created_at) })),
    // A lead in another workspace is not in this file, so that diagram comes back as a standalone copy.
    ...(r.lead_id && here.has(r.lead_id)
      ? {
          follows: {
            diagram: r.lead_id,
            synced: r.synced_snapshot_id && snapshotOf.get(r.synced_snapshot_id) === r.lead_id ? r.synced_snapshot_id : null,
            paused: r.paused === 1,
            decided: JSON.parse(String(r.decided)),
          },
        }
      : {}),
  }));
  return json({
    format: BACKUP_FORMAT,
    version: 1,
    workspaces: [{ name: info.name, personal: info.id === personalWorkspaceId(String(info.owner_email)) && info.owner_email === email, diagrams }],
  });
}
