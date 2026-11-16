import { ensureUser, personalWorkspaceId } from "./db";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";
import { BACKUP_FORMAT, workspaceBackup } from "./importer";
import { LIMITS } from "./limits";

/** What a deleted person's snapshots in other people's workspaces say took them. */
export const FORMER_MEMBER = "former member";

/**
 * `GET /api/me/export`: everything Daidal keeps about you, in one file. Your profile and settings; every workspace you
 * own (your personal one included) as the same `skope-backup` content an import reads; the names of the workspaces
 * you're a member of; and your access tokens' names, scopes and dates (never the tokens, which aren't kept).
 */
export async function exportAccount(db: D1Database, email: string, now: number): Promise<Response> {
  const user = await ensureUser(db, email, now);
  const [created, owned, memberOf, tokens, size] = await db.batch<Record<string, string | number | null>>([
    db.prepare("SELECT created_at FROM users WHERE email = ?").bind(email),
    db.prepare("SELECT id FROM workspaces WHERE owner_email = ? ORDER BY id = ? DESC, created_at, rowid").bind(email, personalWorkspaceId(email)),
    db
      .prepare(
        `SELECT w.name FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.email = ?1
         WHERE w.owner_email != ?1 ORDER BY w.created_at, w.rowid`,
      )
      .bind(email),
    db.prepare("SELECT name, scope, workspaces, created_at, last_used_at FROM access_tokens WHERE email = ? ORDER BY created_at").bind(email),
    db
      .prepare(
        `SELECT (SELECT COALESCE(SUM(LENGTH(CAST(d.doc AS BLOB))), 0) FROM diagrams d JOIN workspaces w ON w.id = d.workspace_id WHERE w.owner_email = ?1)
              + (SELECT COALESCE(SUM(LENGTH(CAST(s.doc AS BLOB))), 0) FROM snapshots s JOIN diagrams d ON d.id = s.diagram_id
                 JOIN workspaces w ON w.id = d.workspace_id WHERE w.owner_email = ?1) AS n`,
      )
      .bind(email),
  ]);
  if (Number(size.results[0]?.n ?? 0) > LIMITS.exportBytes) {
    throw new HttpError(413, "Your workspaces are too large for one file; export each workspace from its Manage sheet instead.");
  }
  const iso = (ms: unknown) => (ms == null ? null : new Date(Number(ms)).toISOString());
  const workspaces = [];
  for (const w of owned.results) workspaces.push(await workspaceBackup(db, String(w.id), email));
  return json({
    format: "skope-account",
    version: 1,
    exportedAt: iso(now),
    profile: { email: user.email, name: user.name, title: user.title, settings: user.settings, createdAt: iso(created.results[0]?.created_at) },
    // The same shape as a workspace backup, so this part can be imported as it is.
    backup: { format: BACKUP_FORMAT, version: 1, workspaces },
    memberOf: memberOf.results.map(w => w.name),
    accessTokens: tokens.results.map(t => ({
      name: t.name,
      scope: t.scope,
      workspaces: t.workspaces ? JSON.parse(String(t.workspaces)) : "all",
      createdAt: iso(t.created_at),
      lastUsedAt: iso(t.last_used_at),
    })),
  });
}

/**
 * `DELETE /api/me` with `{ confirm: <your email> }`: deletes your account. Workspaces you own go, with their diagrams
 * and history (your personal one included); so do your access tokens and your memberships. Diagrams you made in
 * someone else's workspace pass to its owner, as when you leave it, so nothing there breaks; your snapshots there
 * say "former member". Signing in again later starts a new, empty account.
 */
export async function deleteAccount(db: D1Database, email: string, request: Request): Promise<Response> {
  const body = await readJson(request, 4 * 1024);
  const confirm = isPlainObject(body) && typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  if (confirm !== email) throw new HttpError(400, "to delete your account, send your email address as confirm");
  await db.batch([
    db
      .prepare(
        `UPDATE diagrams SET owner_email = (SELECT w.owner_email FROM workspaces w WHERE w.id = diagrams.workspace_id)
         WHERE owner_email = ?1 AND workspace_id IN (SELECT id FROM workspaces WHERE owner_email != ?1)`,
      )
      .bind(email),
    db.prepare("UPDATE snapshots SET author_email = ? WHERE author_email = ?").bind(FORMER_MEMBER, email),
    db.prepare("DELETE FROM workspace_members WHERE email = ?").bind(email),
    db.prepare("DELETE FROM workspaces WHERE owner_email = ?").bind(email),
    db.prepare("DELETE FROM access_tokens WHERE email = ?").bind(email),
    db.prepare("DELETE FROM rate_windows WHERE email = ?").bind(email),
    db.prepare("DELETE FROM users WHERE email = ?").bind(email),
  ]);
  return noContent();
}
