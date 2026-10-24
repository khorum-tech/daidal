/**
 * Turn the stage data into SQL: clear every app table, then insert the stage diagrams exactly as the import API
 * would.
 *
 * The rows come from the REAL importer (worker/src/importer.ts) run against a fake D1 that records each statement
 * instead of executing it, and renders it with its values written in as SQL literals. So the seed is
 * schema-correct by construction: if the importer or the tables change, the seed follows. Only what the import
 * cannot carry (profiles and members) is written here, through the same renderer.
 *
 * Every statement is one line, so the file can be split on newlines (D1's `exec` and the tests do that).
 * Pure: runs in Node (scripts/stage-seed.ts) and in workerd (the Worker tests).
 */
import { ensureUserStatements } from "../worker/src/db";
import { importWorkspaces } from "../worker/src/importer";
import { DEV, OWNER_PROFILE, PRIYA, TEAMMATES, ownerBackup, priyaBackup } from "./diagrams";

/** Every app table, children first, so deleting in this order never trips a foreign key. `d1_migrations` stays. */
export const APP_TABLES = ["snapshots", "diagrams", "workspace_members", "workspaces", "users"] as const;

/** D1 refuses SQL statements longer than 100 KB; stay well under. */
const MAX_STATEMENT_BYTES = 90_000;
const encoder = new TextEncoder();

type Value = string | number | boolean | null | undefined;

/** A value as an SQL literal. Newlines are spelled with char() so a statement always fits on one line. */
export function literal(value: Value): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot write ${value} as SQL`);
    return String(value);
  }
  if (typeof value === "string") {
    const parts = value.split(/(\r|\n)/).map(part => (part === "\n" ? "char(10)" : part === "\r" ? "char(13)" : `'${part.replaceAll("'", "''")}'`));
    const kept = parts.filter((p, i) => p !== "''" || parts.length === 1 || i === 0);
    return kept.length === 1 ? kept[0] : `(${kept.join(" || ")})`;
  }
  throw new Error(`cannot write ${typeof value} as SQL`);
}

/** [sql] with each `?` / `?N` replaced by its value. Quoted text in the SQL is left alone. */
export function render(sql: string, params: Value[]): string {
  let out = "";
  let next = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") {
      const end = sql.indexOf("'", i + 1);
      if (end === -1) throw new Error(`unterminated quote in: ${sql}`);
      out += sql.slice(i, end + 1);
      i = end;
    } else if (ch === "?") {
      const digits = /^\d+/.exec(sql.slice(i + 1))?.[0] ?? "";
      const index = digits ? Number(digits) - 1 : next;
      if (index >= params.length) throw new Error(`no value for parameter ${index + 1} in: ${sql}`);
      next = Math.max(next, index + 1);
      out += literal(params[index]);
      i += digits.length;
    } else {
      out += ch;
    }
  }
  return out;
}

export interface Recorded {
  sql: string;
  params: Value[];
}

/**
 * The importer writes rows as a JSON array read through `json_each(?N)`, always its last value. A statement that
 * would be too long as text is split into several with the same SQL, each carrying part of the array.
 */
export function lines({ sql, params }: Recorded): string[] {
  const text = render(sql, params);
  if (encoder.encode(text).length <= MAX_STATEMENT_BYTES) return [text];
  const last = params[params.length - 1];
  const rows = sql.includes(`json_each(?${params.length})`) && typeof last === "string" ? (JSON.parse(last) as unknown[]) : null;
  if (!rows || rows.length < 2) throw new Error(`a seed statement is too long for D1 (${text.length} bytes): ${sql.slice(0, 80)}…`);
  const half = Math.ceil(rows.length / 2);
  const lead = params.slice(0, -1);
  return [rows.slice(0, half), rows.slice(half)].flatMap(part => lines({ sql, params: [...lead, JSON.stringify(part)] }));
}

/** Just enough of D1 for the importer: it prepares, binds and batches, and this writes those down. */
class RecordingD1 {
  readonly statements: Recorded[] = [];
  prepare(sql: string) {
    const statement = { sql, params: [] as Value[], bind: (...params: Value[]) => ({ ...statement, params }) };
    return statement;
  }
  async batch(statements: Recorded[]) {
    this.statements.push(...statements.map(({ sql, params }) => ({ sql, params })));
    return [];
  }
}

interface ImportSummary {
  workspaces: { id: string; name: string; personal: boolean; diagrams: number; snapshots: number }[];
}

async function importAs(email: string, backup: unknown, now: number): Promise<{ statements: Recorded[]; summary: ImportSummary }> {
  const db = new RecordingD1();
  const request = new Request("https://stage.invalid/api/workspaces/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(backup),
  });
  const response = await importWorkspaces(db as unknown as D1Database, email, request, now);
  const body = (await response.json()) as ImportSummary;
  if (response.status !== 201) throw new Error(`the importer refused the stage data: ${JSON.stringify(body)}`);
  return { statements: db.statements, summary: body };
}

const workspaceId = (summary: ImportSummary, name: string) => {
  const found = summary.workspaces.find(w => w.name === name);
  if (!found) throw new Error(`the stage data has no workspace named ${name}`);
  return found.id;
};

const profile = (email: string, p: { name: string; title: string; settings: object }) =>
  render("UPDATE users SET name = ?, title = ?, settings = ? WHERE email = ?", [p.name, p.title, JSON.stringify(p.settings), email]);

const member = (workspace: string, email: string, at: number) =>
  render("INSERT INTO workspace_members (workspace_id, email, added_at) VALUES (?, ?, ?)", [workspace, email, at]);

/** The whole seed for [owner], as SQL text: one statement per line. */
export async function buildSeed(owner: string, now: number): Promise<string> {
  const email = owner.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`the stage owner must be an email address, not ${JSON.stringify(owner)}`);
  if (TEAMMATES.some(t => t.email === email)) throw new Error(`the stage owner cannot be ${email}; that address belongs to the stage data`);

  const mine = await importAs(email, ownerBackup(), now);
  const priya = await importAs(PRIYA.email, priyaBackup(), now + 1);
  // Dev imports nothing; give them what a first sign-in would.
  const dev = new RecordingD1();
  await dev.batch(ensureUserStatements(dev as unknown as D1Database, DEV.email, now) as unknown as Recorded[]);
  const platform = workspaceId(mine.summary, "Platform team");
  const payments = workspaceId(priya.summary, "Payments");

  const out = [
    "-- Skope stage seed, generated by scripts/stage-seed.ts from stage/diagrams.ts. Do not edit or commit.",
    ...APP_TABLES.map(table => `DELETE FROM ${table};`),
    ...[...mine.statements, ...priya.statements, ...dev.statements].flatMap(lines).map(s => `${s};`),
    `${profile(email, OWNER_PROFILE)};`,
    ...TEAMMATES.map(t => `${profile(t.email, t)};`),
    ...TEAMMATES.map(t => `${member(platform, t.email, now)};`),
    `${member(payments, email, now + 1)};`,
  ];
  return `${out.join("\n")}\n`;
}

/** The statements of a seed file, for applying it one at a time. */
export const seedStatements = (sql: string) => sql.split("\n").filter(line => line.trim() && !line.startsWith("--"));
