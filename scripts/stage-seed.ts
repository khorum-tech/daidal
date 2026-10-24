/**
 * Write seed.sql: clear the app tables and insert the stage diagrams (stage/diagrams.ts) owned by STAGE_OWNER_EMAIL.
 *
 *   STAGE_OWNER_EMAIL=you@example.com npx tsx scripts/stage-seed.ts
 *
 * Run with tsx (a devDependency): the Worker sources it imports use extensionless imports and TypeScript
 * syntax that Node's own type stripping does not accept.
 */
import { writeFileSync } from "node:fs";
import { buildSeed } from "../stage/seed";

const owner = process.env.STAGE_OWNER_EMAIL?.trim();
if (!owner) {
  console.error("stage-seed: set STAGE_OWNER_EMAIL to the email the stage owner signs in with (see docs/stage.md)");
  process.exit(1);
}

try {
  const sql = await buildSeed(owner, Date.now());
  writeFileSync("seed.sql", sql);
  console.log(`wrote seed.sql (${sql.split("\n").length - 1} lines, ${(sql.length / 1024).toFixed(0)} KB)`);
} catch (e) {
  console.error(`stage-seed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
