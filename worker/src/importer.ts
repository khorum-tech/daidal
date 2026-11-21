import { ensureUserStatements, personalWorkspaceId } from "./db";
import { decidedText, docName, docText, nameOf } from "./docs";
import { HttpError, isPlainObject, json, readJson } from "./http";
import { slug } from "@khorum/daidal-core/model";
import { summaryText } from "./summary";
import { customTypeOf, MAX_TYPES } from "./types";
import { checkDiagramRoom, checkExportSize, checkWorkspaceRoom, historyFits } from "./limits";
import { requireMember } from "./workspaces";

/**
 * A `daidal-backup` holds whole workspaces: their diagrams, each diagram's history, and which diagram follows
 * which. `POST /api/workspaces/import` turns every workspace in it into a new workspace owned by the caller (or,
 * for `personal: true`, fills the caller's personal workspace). Members are not carried over. Ids in the file
 * are local to it: everything gets a new id, and `follows` points at another diagram in the same file.
 *
 *   { "format": "daidal-backup", "version": 1, "workspaces": [
 *       { "name": "Platform team", "personal": false,
 *         "types": [ { "name": "Billing Agent", "category": "AI", "icon": "robot" } ],
 *         "diagrams": [
 *           { "id": "ledger", "name": "…", "doc": { "version": 1, … }, "updated": "2026-10-01T…Z",
 *             "snapshots": [ { "id": "s1", "label": "…", "doc": { … }, "at": "2026-09-01T…Z" } ],
 *             "follows": { "diagram": "<file id>", "synced": "<its snapshot id>" | null, "paused": false, "decided": {} } } ] } ] }
 *
 * Everything is checked before anything is written, and the writes are one batch. The import never reads the
 * database, so the stage seed can run it against a recorder (stage/seed.ts).
 */
export const BACKUP_FORMAT = "daidal-backup";
/** What backups were called before the rename; import still reads them. */
const LEGACY_BACKUP_FORMATS: readonly unknown[] = ["skope-backup"];
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
  summary: string;
  updated_at: number;
}
interface PlannedSnapshot {
  id: string;
  diagram_id: string;
  label: string;
  doc: string;
  created_at: number;
}
interface PlannedType {
  workspace_id: string;
  slug: string;
  name: string;
  category: string;
  icon: string;
}
interface PlannedFollow {
  id: string;
  lead_id: string;
  synced_snapshot_id: string | null;
  paused: number;
  decided: string;
}

/**
 * A time from the file, never later than [latest]: a diagram can't have been saved after the import, nor a snapshot
 * taken after its diagram's last save, so a file can't pin itself to the top of lists with a date in the future.
 */
const time = (value: unknown, latest: number) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? latest : Math.min(parsed, latest);
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

/** The same limits as one change at a time (limits.ts), for everything the file brings, before anything is written. */
async function checkImportRoom(db: D1Database, email: string, diagrams: PlannedDiagram[], snapshots: PlannedSnapshot[], workspaces: number): Promise<void> {
  const history = new Map<string, { n: number; bytes: number }>();
  for (const s of snapshots) {
    const h = history.get(s.diagram_id) ?? { n: 0, bytes: 0 };
    h.n += 1;
    h.bytes += encoder.encode(s.doc).length;
    history.set(s.diagram_id, h);
  }
  for (const d of diagrams) {
    const h = history.get(d.id);
    if (h) historyFits(h.n, h.bytes, `The history of "${d.name}" in the file`);
  }
  await checkDiagramRoom(db, email, diagrams.length);
  if (workspaces) await checkWorkspaceRoom(db, email, personalWorkspaceId(email), workspaces);
}

export async function importWorkspaces(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const file = await readJson(request, MAX_IMPORT_BYTES);
  if (!isPlainObject(file) || (file.format !== BACKUP_FORMAT && !LEGACY_BACKUP_FORMATS.includes(file.format))) throw new HttpError(400, "this isn't a Daidal backup file");
  if (file.version !== 1) throw new HttpError(400, "this Daidal backup is from a newer version");
  const workspaces = list(file.workspaces, "workspaces");
  if (workspaces.length === 0) throw new HttpError(400, "the file has no workspaces to import");

  const statements: D1PreparedStatement[] = [...ensureUserStatements(db, email, now)];
  const diagrams: PlannedDiagram[] = [];
  const snapshots: PlannedSnapshot[] = [];
  const follows: { from: string; spec: Row }[] = [];
  const types: PlannedType[] = [];
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

    // The workspace's own types; a later one with the same name wins, as it would saving them one by one.
    const ownTypes = new Map<string, PlannedType>();
    for (const t of list(ws.types, `workspace "${name}"'s types`)) {
      const type = customTypeOf(t);
      ownTypes.set(slug(type.name), { workspace_id: workspaceId, slug: slug(type.name), ...type });
    }
    if (ownTypes.size > MAX_TYPES) throw new HttpError(400, `workspace "${name}" has more than ${MAX_TYPES} types`);
    types.push(...ownTypes.values());

    for (const d of list(ws.diagrams, `workspace "${name}"'s diagrams`)) {
      const local = fileId(d.id, "a diagram");
      if (newId.has(local)) throw new HttpError(400, `two diagrams in the file share the id ${local}`);
      const id = crypto.randomUUID();
      newId.set(local, id);
      const where = `diagram ${local}`;
      const updated = time(d.updated, now);
      const doc = docText(d.doc, `${where}'s doc`);
      diagrams.push({ id, workspace_id: workspaceId, name: nameOf(d.name ?? docName(d.doc), `${where}'s name`), doc, summary: "", updated_at: updated });
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

  // A node's links to other diagrams (links[].diagram) and its ref ("<diagram>#<node>") name diagrams by their id in
  // the file; once every diagram has its new id, they follow. One pointing outside the file is left as it is.
  for (const row of [...diagrams, ...snapshots]) row.doc = withNewDiagramIds(row.doc, newId);
  // The card summary lists the diagrams a diagram zooms into, so it is worked out from the renamed document: from the
  // file's ids it would name diagrams that don't exist, and nothing would know what sits above an imported diagram.
  for (const row of diagrams) row.summary = summaryText(row.doc);

  const cols = (names: string[]) => names.map(n => `json_extract(value, '$.${n}')`).join(", ");
  statements.push(
    ...chunked(
      db,
      `INSERT INTO diagrams (id, workspace_id, owner_email, name, doc, summary, updated_at) SELECT ${cols(["id", "workspace_id"])}, ?1, ${cols(["name", "doc", "summary", "updated_at"])} FROM json_each(?2)`,
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
    // A personal workspace may have types already; the file's take their place.
    ...chunked(
      db,
      `INSERT OR REPLACE INTO workspace_types (workspace_id, slug, name, category, icon, updated_at) SELECT ${cols(["workspace_id", "slug", "name", "category", "icon"])}, ?1 FROM json_each(?2)`,
      [now],
      types,
    ),
  );
  if (statements.length > MAX_STATEMENTS) throw new HttpError(400, "the file is too large to import in one request; import one workspace at a time");
  await checkImportRoom(db, email, diagrams, snapshots, summary.filter(w => !w.personal).length);

  await db.batch(statements);
  return json({ workspaces: summary }, 201);
}

/** `GET /api/workspaces/:id/export`: the workspace as a `daidal-backup` that import reads back. */
export async function exportWorkspace(db: D1Database, workspace: string, email: string): Promise<Response> {
  await requireMember(db, workspace, email);
  await checkExportSize(db, workspace);
  return json({ format: BACKUP_FORMAT, version: 1, workspaces: [await workspaceBackup(db, workspace, email)] });
}

/** One workspace as a `daidal-backup` file holds it: its diagrams, their history, who follows whom, and its types. */
export async function workspaceBackup(db: D1Database, workspace: string, email: string): Promise<Record<string, unknown>> {
  const [ws, rows, snaps, types] = await db.batch<Record<string, string | number | null>>([
    db.prepare("SELECT id, name, owner_email FROM workspaces WHERE id = ?").bind(workspace),
    db.prepare("SELECT id, name, doc, updated_at, lead_id, synced_snapshot_id, paused, decided FROM diagrams WHERE workspace_id = ? ORDER BY updated_at, rowid").bind(workspace),
    db
      .prepare(
        `SELECT s.id, s.diagram_id, s.label, s.doc, s.created_at FROM snapshots s JOIN diagrams d ON d.id = s.diagram_id
         WHERE d.workspace_id = ? ORDER BY s.created_at, s.rowid`,
      )
      .bind(workspace),
    db.prepare("SELECT name, category, icon FROM workspace_types WHERE workspace_id = ? ORDER BY category, name").bind(workspace),
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
  return {
    name: info.name,
    personal: info.id === personalWorkspaceId(String(info.owner_email)) && info.owner_email === email,
    ...(types.results.length ? { types: types.results } : {}),
    diagrams,
  };
}

/** "<diagram>#<node>" with the diagram renamed by [newId]; anything else as it is. */
function renamedRef(v: unknown, newId: Map<string, string>): unknown {
  if (typeof v !== "string") return v;
  const cut = v.indexOf("#");
  const to = cut > 0 ? newId.get(v.slice(0, cut)) : undefined;
  return to ? to + v.slice(cut) : v;
}

/** [links] with each diagram they zoom into renamed by [newId]. */
function renamedLinks(links: unknown, newId: Map<string, string>): unknown {
  if (!Array.isArray(links)) return links;
  return links.map(l => (isPlainObject(l) && typeof l.diagram === "string" && newId.has(l.diagram) ? { ...l, diagram: newId.get(l.diagram) } : l));
}

/** [docJson] with the diagram ids in its nodes' links and refs (and its boundaries' refs) renamed by [newId]. */
export function withNewDiagramIds(docJson: string, newId: Map<string, string>): string {
  const doc = JSON.parse(docJson) as Row;
  const renamed = (items: unknown, node: boolean) =>
    Array.isArray(items)
      ? items.map(item => {
          if (!isPlainObject(item)) return item;
          const out: Row = { ...item };
          if ("ref" in item) out.ref = renamedRef(item.ref, newId);
          if (node && "links" in item) out.links = renamedLinks(item.links, newId);
          return out;
        })
      : items;
  const next = { ...doc, ...("nodes" in doc ? { nodes: renamed(doc.nodes, true) } : {}), ...("boundaries" in doc ? { boundaries: renamed(doc.boundaries, false) } : {}) };
  const text = JSON.stringify(next);
  return text === JSON.stringify(doc) ? docJson : text;
}
