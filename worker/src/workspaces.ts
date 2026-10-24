import { ensureUserStatements, personalWorkspaceId } from "./db";
import { emailOf, nameOf } from "./docs";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";

const MAX_BODY = 16 * 1024;

export interface Workspace {
  id: string;
  name: string;
  ownerEmail: string;
  personal: boolean;
  members: string[];
}

interface Access {
  owner: string;
  member: boolean;
}

/** Who owns [workspace] and whether [email] is in it, or null when it does not exist. */
async function access(db: D1Database, workspace: string, email: string): Promise<Access | null> {
  const row = await db
    .prepare(
      `SELECT w.owner_email AS owner, m.email AS member FROM workspaces w
       LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.email = ?2
       WHERE w.id = ?1`,
    )
    .bind(workspace, email)
    .first<{ owner: string; member: string | null }>();
  return row ? { owner: row.owner, member: row.member !== null } : null;
}

/** 404 unless [email] is a member: a workspace someone cannot see does not exist to them. */
export async function requireMember(db: D1Database, workspace: string, email: string): Promise<Access> {
  let found = await access(db, workspace, email);
  // Someone's personal workspace is made on their first visit; a first request can come before that.
  if (!found && workspace === personalWorkspaceId(email)) {
    await db.batch(ensureUserStatements(db, email));
    found = await access(db, workspace, email);
  }
  if (!found?.member) throw new HttpError(404, "not found");
  return found;
}

async function requireOwner(db: D1Database, workspace: string, email: string): Promise<Access> {
  const found = await requireMember(db, workspace, email);
  if (found.owner !== email) throw new HttpError(403, "only the workspace owner can do that");
  return found;
}

const nameFrom = (body: unknown) => nameOf(isPlainObject(body) ? body.name : undefined);

export async function listWorkspaces(db: D1Database, email: string, now: number): Promise<Response> {
  await db.batch(ensureUserStatements(db, email, now));
  const [workspaces, members] = await db.batch<Record<string, string>>([
    db
      .prepare(
        `SELECT w.id, w.name, w.owner_email FROM workspaces w
         JOIN workspace_members m ON m.workspace_id = w.id AND m.email = ?1
         ORDER BY w.id = ?2 DESC, w.created_at, w.rowid`,
      )
      .bind(email, personalWorkspaceId(email)),
    db
      .prepare(
        `SELECT workspace_id, email FROM workspace_members
         WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE email = ?)
         ORDER BY added_at, rowid`,
      )
      .bind(email),
  ]);
  const byWorkspace = new Map<string, string[]>();
  for (const m of members.results) byWorkspace.set(m.workspace_id, [...(byWorkspace.get(m.workspace_id) ?? []), m.email]);
  return json(
    workspaces.results.map(
      (w): Workspace => ({
        id: w.id,
        name: w.name,
        ownerEmail: w.owner_email,
        personal: w.id === personalWorkspaceId(w.owner_email),
        members: byWorkspace.get(w.id) ?? [],
      }),
    ),
  );
}

export async function createWorkspace(db: D1Database, email: string, request: Request, now: number): Promise<Response> {
  const name = nameFrom(await readJson(request, MAX_BODY));
  const id = crypto.randomUUID();
  await db.batch([
    ...ensureUserStatements(db, email, now),
    db.prepare("INSERT INTO workspaces (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)").bind(id, name, email, now),
    db.prepare("INSERT INTO workspace_members (workspace_id, email, added_at) VALUES (?, ?, ?)").bind(id, email, now),
  ]);
  return json({ id, name, ownerEmail: email, personal: false, members: [email] } satisfies Workspace, 201);
}

export async function renameWorkspace(db: D1Database, workspace: string, email: string, request: Request): Promise<Response> {
  await requireOwner(db, workspace, email);
  const name = nameFrom(await readJson(request, MAX_BODY));
  await db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").bind(name, workspace).run();
  return json({ id: workspace, name });
}

/** Deletes the workspace with its diagrams and their history. Followers elsewhere become standalone copies. */
export async function deleteWorkspace(db: D1Database, workspace: string, email: string): Promise<Response> {
  await requireOwner(db, workspace, email);
  if (workspace === personalWorkspaceId(email)) throw new HttpError(400, "the personal workspace cannot be deleted");
  await db.prepare("DELETE FROM workspaces WHERE id = ?").bind(workspace).run();
  return noContent();
}

/** Adds by email, so a friend can be added before they first sign in. Adding someone twice changes nothing. */
export async function addMember(db: D1Database, workspace: string, email: string, request: Request, now: number): Promise<Response> {
  await requireOwner(db, workspace, email);
  const body = await readJson(request, MAX_BODY);
  const member = emailOf(isPlainObject(body) ? body.email : undefined);
  await db
    .prepare("INSERT OR IGNORE INTO workspace_members (workspace_id, email, added_at) VALUES (?, ?, ?)")
    .bind(workspace, member, now)
    .run();
  return json({ email: member }, 201);
}

export async function removeMember(db: D1Database, workspace: string, email: string, member: string): Promise<Response> {
  const found = await requireOwner(db, workspace, email);
  const target = member.trim().toLowerCase();
  if (target === found.owner) throw new HttpError(400, "the owner cannot be removed");
  await db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND email = ?").bind(workspace, target).run();
  return noContent();
}
