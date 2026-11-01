import library from "../../app/src/lib/diagram/icon-library.json";
import { slug } from "../../app/src/lib/diagram/model";
import { HttpError, isPlainObject, json, noContent, readJson } from "./http";
import { requireMember } from "./workspaces";

/**
 * A workspace's own node types (`workspace_types`): a name, the type picker category it sits in, and an icon from
 * the app's library. Any member can add, change or remove one; a type named like a built-in one changes that
 * type's icon or category for everyone in the workspace.
 */
export interface CustomType {
  name: string;
  category: string;
  icon: string;
}

const MAX_BODY = 4 * 1024;
export const MAX_TYPE_NAME = 60;
export const MAX_CATEGORY = 40;
export const MAX_TYPES = 200;

const ICONS: Record<string, { path: string; ui?: boolean }> = library;
const isNodeIcon = (name: string) => Object.hasOwn(ICONS, name) && !ICONS[name].ui;

function text(value: unknown, what: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new HttpError(400, `${what} is required`);
  if (s.length > max) throw new HttpError(400, `${what} must be ${max} characters or fewer`);
  return s;
}

/** A type as the body gives it, checked: a name and a category, and an icon the library offers for nodes. */
export function customTypeOf(body: unknown): CustomType {
  const b = isPlainObject(body) ? body : {};
  const name = text(b.name, "name", MAX_TYPE_NAME);
  if (slug(name) === "unspecified") throw new HttpError(400, "name needs a letter or a digit");
  const icon = typeof b.icon === "string" ? b.icon : "";
  if (!isNodeIcon(icon)) throw new HttpError(400, "icon must be one of the library's node icons");
  return { name, category: text(b.category, "category", MAX_CATEGORY), icon };
}

/** Every workspace's types, for the workspaces [email] is in, by workspace id. */
export function typesStatement(db: D1Database, email: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT workspace_id, name, category, icon FROM workspace_types
       WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE email = ?)
       ORDER BY category, name`,
    )
    .bind(email);
}

/**
 * `PUT /api/workspaces/:id/types/:slug`: adds the type, or changes the one stored under [key]. A new name renames
 * it; the name may not be taken by another of the workspace's types.
 */
export async function putType(db: D1Database, workspace: string, email: string, key: string, request: Request, now: number): Promise<Response> {
  await requireMember(db, workspace, email);
  const type = customTypeOf(await readJson(request, MAX_BODY));
  const next = slug(type.name);
  const [taken, count] = await db.batch<{ n: number }>([
    db.prepare("SELECT COUNT(*) AS n FROM workspace_types WHERE workspace_id = ? AND slug = ? AND slug <> ?").bind(workspace, next, key),
    db.prepare("SELECT COUNT(*) AS n FROM workspace_types WHERE workspace_id = ? AND slug <> ?").bind(workspace, key),
  ]);
  if (taken.results[0].n > 0) throw new HttpError(409, `this workspace already has a type called ${type.name}`);
  if (count.results[0].n >= MAX_TYPES) throw new HttpError(400, `a workspace can have up to ${MAX_TYPES} types`);
  await db.batch([
    db.prepare("DELETE FROM workspace_types WHERE workspace_id = ? AND slug = ?").bind(workspace, key),
    db
      .prepare("INSERT INTO workspace_types (workspace_id, slug, name, category, icon, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(workspace, next, type.name, type.category, type.icon, now),
  ]);
  return json(type);
}

/** `DELETE /api/workspaces/:id/types/:slug`. Nodes of that type keep it, drawn with the built-in icon or the cube. */
export async function deleteType(db: D1Database, workspace: string, email: string, key: string): Promise<Response> {
  await requireMember(db, workspace, email);
  await db.prepare("DELETE FROM workspace_types WHERE workspace_id = ? AND slug = ?").bind(workspace, key).run();
  return noContent();
}
