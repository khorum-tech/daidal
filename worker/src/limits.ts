import { HttpError } from "./http";

/**
 * How much one person can keep, and how fast anyone can change things. They keep one person, or one runaway script,
 * from filling the database or making a shared workspace's history and export too big to load for everyone else.
 * Each is well above what anyone uses by hand; docs/security.md lists them.
 */
export const LIMITS = {
  /** Snapshots one diagram's history may hold. */
  snapshotsPerDiagram: 200,
  /** Their documents together, in bytes: the history list returns every one, so this bounds that response. */
  historyBytes: 20 * 1024 * 1024,
  /** Diagrams one person may own. */
  diagramsPerPerson: 1000,
  /** Workspaces one person may own, besides their personal one. */
  workspacesPerPerson: 50,
  /** People in one workspace, its owner included. */
  membersPerWorkspace: 100,
  /** The most a workspace export builds in memory, in bytes (a Worker has 128 MB). */
  exportBytes: 64 * 1024 * 1024,
  /** Changes a minute through a browser or OAuth sign-in (tokens have their own 120, in tokens.ts). */
  writesPerMinute: 300,
};

let overridden = "";

/**
 * Raises (or lowers) limits from the `SKOPE_LIMITS` variable, `name=number` pairs separated by commas, such as
 * `workspacesPerPerson=100000`. Only the end-to-end tests set it, because their one signed-in person makes hundreds
 * of workspaces in a run; prod and stage leave it unset. Unknown names and non-numbers are ignored.
 */
export function applyLimitOverrides(raw: string | undefined): void {
  if (!raw || raw === overridden) return;
  overridden = raw;
  for (const pair of raw.split(",")) {
    const [name, value] = pair.split("=").map(s => s.trim());
    const n = Number(value);
    if (Object.hasOwn(LIMITS, name) && Number.isFinite(n) && n >= 0) LIMITS[name as keyof typeof LIMITS] = n;
  }
}

const MB = 1024 * 1024;
const mb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

async function count(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number | null }>();
  return row?.n ?? 0;
}

/** Room in [diagram]'s history for [adding] more snapshots of [bytes] in all, or a 409 that says what to do. */
export async function checkHistoryRoom(db: D1Database, diagram: string, adding: number, bytes: number): Promise<void> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(CAST(doc AS BLOB))), 0) AS size FROM snapshots WHERE diagram_id = ?")
    .bind(diagram)
    .first<{ n: number; size: number }>();
  historyFits((row?.n ?? 0) + adding, (row?.size ?? 0) + bytes);
}

/** A 409 when a history of [snapshots] snapshots and [bytes] bytes would be over the limits. */
export function historyFits(snapshots: number, bytes: number, what = "This diagram's history"): void {
  if (snapshots > LIMITS.snapshotsPerDiagram || bytes > LIMITS.historyBytes) {
    throw new HttpError(
      409,
      `${what} is full (at most ${LIMITS.snapshotsPerDiagram} snapshots and ${mb(LIMITS.historyBytes)}). Make a copy of the diagram to start a fresh history.`,
    );
  }
}

/** Room for [email] to own [adding] more diagrams. */
export async function checkDiagramRoom(db: D1Database, email: string, adding = 1): Promise<void> {
  const owned = await count(db, "SELECT COUNT(*) AS n FROM diagrams WHERE owner_email = ?", email);
  if (owned + adding > LIMITS.diagramsPerPerson) {
    throw new HttpError(409, `You can own at most ${LIMITS.diagramsPerPerson} diagrams; delete some you no longer need first.`);
  }
}

/** Room for [email] to own [adding] more workspaces (the personal one isn't counted). */
export async function checkWorkspaceRoom(db: D1Database, email: string, personal: string, adding = 1): Promise<void> {
  const owned = await count(db, "SELECT COUNT(*) AS n FROM workspaces WHERE owner_email = ? AND id != ?", email, personal);
  if (owned + adding > LIMITS.workspacesPerPerson) {
    throw new HttpError(409, `You can own at most ${LIMITS.workspacesPerPerson} workspaces; delete one you no longer need first.`);
  }
}

/** Room in [workspace] for one more member. */
export async function checkMemberRoom(db: D1Database, workspace: string): Promise<void> {
  const members = await count(db, "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ?", workspace);
  if (members >= LIMITS.membersPerWorkspace) throw new HttpError(409, `A workspace can have at most ${LIMITS.membersPerWorkspace} members.`);
}

/** A 413 when [workspace]'s diagrams and history are too big to export in one file. */
export async function checkExportSize(db: D1Database, workspace: string): Promise<void> {
  const size = await count(
    db,
    `SELECT (SELECT COALESCE(SUM(LENGTH(CAST(doc AS BLOB))), 0) FROM diagrams WHERE workspace_id = ?1)
          + (SELECT COALESCE(SUM(LENGTH(CAST(s.doc AS BLOB))), 0) FROM snapshots s JOIN diagrams d ON d.id = s.diagram_id WHERE d.workspace_id = ?1) AS n`,
    workspace,
  );
  if (size > LIMITS.exportBytes) {
    throw new HttpError(413, `This workspace is too large to export in one file (${mb(size)}); move some diagrams to another workspace first.`);
  }
}

/**
 * Counts one change by [email] signed in through the browser or OAuth, in a one-minute window, and refuses the one
 * over the limit with a 429. One statement, so changes arriving together can't both slip under it.
 */
export async function countSessionWrite(db: D1Database, email: string, now: number): Promise<void> {
  const row = await db
    .prepare(
      `INSERT INTO rate_windows (email, window_start, window_writes) VALUES (?1, ?2, 1)
       ON CONFLICT(email) DO UPDATE SET
         window_writes = CASE WHEN window_start <= ?2 - 60000 THEN 1 ELSE window_writes + 1 END,
         window_start = CASE WHEN window_start <= ?2 - 60000 THEN ?2 ELSE window_start END
       RETURNING window_writes`,
    )
    .bind(email, now)
    .first<{ window_writes: number }>();
  if ((row?.window_writes ?? 0) > LIMITS.writesPerMinute) throw new HttpError(429, "Too many changes at once; wait a moment and try again.");
}
