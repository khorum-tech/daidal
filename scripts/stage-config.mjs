/**
 * Write wrangler.stage.jsonc: the prod config (wrangler.jsonc) pointed at the stage Worker, database, hostname
 * and Access application. The prod config itself is never edited.
 *
 *   STAGE_D1_ID=… STAGE_ACCESS_AUD=… node scripts/stage-config.mjs
 *
 * It also writes wrangler.stage.secrets.json, the Access AUD as a Worker secret: deploy with
 * `wrangler deploy -c wrangler.stage.jsonc --secrets-file wrangler.stage.secrets.json`.
 *
 * The pure parts are exported so the Worker tests can check them; only the command at the bottom touches files.
 */

export const STAGE_NAME = "skope-stage";
// Every hostname stage answers on, the main one first. Wrangler treats `routes` as the Worker's whole set of custom
// domains, so a name left out of this list is detached on the next stage deploy.
export const STAGE_HOSTS = ["daidal-stage.khorum.org", "skope-stage.khorum-oss.org"];
export const STAGE_HOST = STAGE_HOSTS[0];

/**
 * Remove `//` and `/* *\/` comments and trailing commas from JSONC, leaving string contents alone
 * (so "https://…" survives), then parse it.
 */
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  // Trailing commas: a comma followed only by whitespace before a closing bracket. Strings were copied verbatim
  // above, so this pass must skip them too.
  let clean = "";
  for (let k = 0; k < out.length; k += 1) {
    const ch = out[k];
    if (ch === '"') {
      let j = k + 1;
      while (j < out.length && out[j] !== '"') j += out[j] === "\\" ? 2 : 1;
      clean += out.slice(k, j + 1);
      k = j;
    } else if (ch === "," && /^\s*[}\]]/.test(out.slice(k + 1))) {
      continue;
    } else {
      clean += ch;
    }
  }
  return JSON.parse(clean);
}

/**
 * The top-level keys this script knows how to carry to stage. Anything else (a KV namespace, an `env` block, a
 * second binding…) might point stage at a prod resource, so it stops the script until it is taught about it.
 */
export const KNOWN_KEYS = new Set([
  "$schema", "name", "main", "compatibility_date", "compatibility_flags", "workers_dev", "preview_urls",
  "routes", "dev", "assets", "build", "d1_databases", "vars", "observability",
]);

/** The stage config built from the prod one. Throws when a value is missing, or could touch prod. */
export function stageConfig(prod, env) {
  const missing = ["STAGE_D1_ID", "STAGE_ACCESS_AUD"].filter(name => !String(env[name] ?? "").trim());
  if (missing.length) throw new Error(`stage-config: set ${missing.join(" and ")} (see docs/stage.md)`);
  const unknown = Object.keys(prod).filter(key => !KNOWN_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`stage-config: wrangler.jsonc has ${unknown.map(k => `"${k}"`).join(", ")}, which stage-config does not know; teach scripts/stage-config.mjs the new key before stage can deploy`);
  }
  const databases = Array.isArray(prod.d1_databases) ? prod.d1_databases : [];
  if (databases.length !== 1) throw new Error("stage-config: expected exactly one D1 database in wrangler.jsonc");
  const d1Id = env.STAGE_D1_ID.trim();
  const aud = env.STAGE_ACCESS_AUD.trim();
  if (d1Id === databases[0].database_id) throw new Error("stage-config: STAGE_D1_ID is the prod database id; stage would wipe prod");
  if (aud === prod.vars?.ACCESS_AUD) throw new Error("stage-config: STAGE_ACCESS_AUD is the prod Access AUD; stage must have its own Access application");
  return {
    ...prod,
    name: STAGE_NAME,
    // Off on stage too: either would put the Worker on the internet without Access in front of it.
    workers_dev: false,
    preview_urls: false,
    routes: STAGE_HOSTS.map(pattern => ({ pattern, custom_domain: true })),
    d1_databases: [{ ...databases[0], database_name: STAGE_NAME, database_id: d1Id }],
    // Without the AUD: it goes up as a Worker secret (stageSecrets), because `wrangler deploy` prints every
    // variable's value in the deploy log, which anyone can read once the repository is public.
    vars: withoutAud(prod.vars),
  };
}

/** [vars] without ACCESS_AUD, which the generated configs upload as a secret instead. */
export function withoutAud(vars) {
  return Object.fromEntries(Object.entries(vars ?? {}).filter(([name]) => name !== "ACCESS_AUD"));
}

/** What `wrangler deploy --secrets-file` uploads for stage: the Worker reads it as env.ACCESS_AUD all the same. */
export function stageSecrets(env) {
  return { ACCESS_AUD: String(env.STAGE_ACCESS_AUD ?? "").trim() };
}

/** Where the stage secrets go: never committed, like the generated config beside it. */
export const STAGE_SECRETS_FILE = "wrangler.stage.secrets.json";

export function stageConfigText(prodText, env) {
  const config = stageConfig(parseJsonc(prodText), env);
  return `// Generated by scripts/stage-config.mjs from wrangler.jsonc. Do not edit or commit.\n${JSON.stringify(config, null, 2)}\n`;
}

const invokedDirectly = typeof process !== "undefined" && process.argv?.[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  try {
    writeFileSync("wrangler.stage.jsonc", stageConfigText(readFileSync("wrangler.jsonc", "utf8"), process.env));
    writeFileSync(STAGE_SECRETS_FILE, `${JSON.stringify(stageSecrets(process.env))}\n`, { mode: 0o600 });
    console.log(`wrote wrangler.stage.jsonc and ${STAGE_SECRETS_FILE} (${STAGE_NAME} at ${STAGE_HOSTS.join(", ")})`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
