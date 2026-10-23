/**
 * Write seed.sql: clear the app tables and insert the stage data (below), owned by STAGE_OWNER_EMAIL.
 *
 *   STAGE_OWNER_EMAIL=you@example.com node scripts/stage-seed.mjs
 *
 * Every statement is one line, so the file can be split on newlines. The pure parts are exported so the Worker
 * tests can apply the seed to a real D1 and read it back through the API; only the command at the bottom
 * touches files.
 */

/** Every app table, children first, so deleting in this order never trips a foreign key. `d1_migrations` stays. */
export const APP_TABLES = ["workspace_members", "workspaces", "users"];

/** Invented teammates. Names are original; addresses use example.com, which can never be a real sign-in. */
export const TEAMMATES = [
  { email: "priya@example.com", name: "Priya Okafor", title: "Payments engineer", settings: {} },
  { email: "dev@example.com", name: "Dev Marsh", title: "SRE", settings: {} },
];

/** A value as an SQL literal. */
export function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot write ${value} as SQL`);
    return String(value);
  }
  if (typeof value === "string") {
    if (/[\r\n]/.test(value)) throw new Error("stage seed values must be one line");
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new Error(`cannot write ${typeof value} as SQL`);
}

const insert = (table, row) =>
  `INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(literal).join(", ")});`;

/** Matches personalWorkspaceId in worker/src/db.ts, so the API treats these as the users' own workspaces. */
const personal = email => `personal:${email}`;

/** The stage data: the owner, two teammates, everyone's personal workspace, one team the owner runs and one
 *  workspace a teammate shares with the owner. */
export function stageRows(ownerEmail, now) {
  const owner = { email: ownerEmail.trim().toLowerCase(), name: "Rowan Ellery", title: "Platform lead", settings: { theme: "dark" } };
  const people = [owner, ...TEAMMATES];
  const users = people.map(p => ({ email: p.email, name: p.name, title: p.title, settings: JSON.stringify(p.settings), created_at: now }));
  const workspaces = [
    ...people.map(p => ({ id: personal(p.email), name: "Personal", owner_email: p.email, created_at: now })),
    { id: "stage:platform", name: "Platform team", owner_email: owner.email, created_at: now },
    { id: "stage:payments", name: "Payments", owner_email: TEAMMATES[0].email, created_at: now },
  ];
  const members = [
    ...people.map(p => ({ workspace_id: personal(p.email), email: p.email, added_at: now })),
    ...people.map(p => ({ workspace_id: "stage:platform", email: p.email, added_at: now })),
    { workspace_id: "stage:payments", email: TEAMMATES[0].email, added_at: now },
    { workspace_id: "stage:payments", email: owner.email, added_at: now },
  ];
  return { users, workspaces, workspace_members: members };
}

/** seed.sql: delete every app table's rows, then insert the stage data, parents first. */
export function buildSeed(ownerEmail, now) {
  if (!String(ownerEmail ?? "").includes("@")) throw new Error("the stage owner must be an email address");
  const rows = stageRows(ownerEmail, now);
  const lines = [
    ...APP_TABLES.map(table => `DELETE FROM ${table};`),
    ...rows.users.map(r => insert("users", r)),
    ...rows.workspaces.map(r => insert("workspaces", r)),
    ...rows.workspace_members.map(r => insert("workspace_members", r)),
  ];
  return `${lines.join("\n")}\n`;
}

const invokedDirectly = typeof process !== "undefined" && process.argv?.[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { writeFileSync } = await import("node:fs");
  const owner = process.env.STAGE_OWNER_EMAIL?.trim();
  if (!owner) {
    console.error("stage-seed: set STAGE_OWNER_EMAIL to the email the stage owner signs in with (see docs/stage.md)");
    process.exit(1);
  }
  try {
    const sql = buildSeed(owner, Date.now());
    writeFileSync("seed.sql", sql);
    console.log(`wrote seed.sql (${sql.split("\n").length - 1} statements)`);
  } catch (e) {
    console.error(`stage-seed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
