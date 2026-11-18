import { describe, expect, it } from "vitest";
import { STAGE_HOST, STAGE_NAME, parseJsonc, stageConfig, stageConfigText, stageSecrets } from "../../scripts/stage-config.mjs";

// The shape of wrangler.jsonc, comments and all.
const PROD = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "skope",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "skope.khorum-oss.org", "custom_domain": true }],
  // a comment with "quotes" and a URL: https://example.com/x
  "dev": { "host": "localhost" },
  /* a block comment */
  "assets": { "directory": "./web", "binding": "ASSETS" },
  "d1_databases": [
    // database_id: the id printed by \`wrangler d1 create skope\`
    { "binding": "DB", "database_name": "skope", "database_id": "prod-db-id", "migrations_dir": "migrations" },
  ],
  "vars": {
    "ACCESS_TEAM_DOMAIN": "https://khorum.cloudflareaccess.com",
    "ACCESS_AUD": "prod-aud"
  }
}`;
const STAGE_ENV = { STAGE_D1_ID: "stage-db-id", STAGE_ACCESS_AUD: "stage-aud" };

describe("stage-config", () => {
  it("reads JSONC without touching // inside strings", () => {
    expect(parseJsonc(`{ "a": "https://x.example//y", // note\n "b": [1, 2,], /* c */ "c": "/* not a comment */" }`)).toEqual({
      a: "https://x.example//y",
      b: [1, 2],
      c: "/* not a comment */",
    });
  });

  it("points the prod config at the stage Worker, database, hostname and Access application", () => {
    const prod = parseJsonc(PROD);
    expect(stageConfig(prod, STAGE_ENV)).toEqual({
      ...prod,
      name: STAGE_NAME,
      routes: [{ pattern: STAGE_HOST, custom_domain: true }],
      d1_databases: [{ binding: "DB", database_name: STAGE_NAME, database_id: "stage-db-id", migrations_dir: "migrations" }],
      // The AUD is not a variable (wrangler prints those in the deploy log): it goes up as a secret.
      vars: { ACCESS_TEAM_DOMAIN: "https://khorum.cloudflareaccess.com" },
      workers_dev: false,
      preview_urls: false,
    });
    expect(stageSecrets({ STAGE_ACCESS_AUD: " stage-aud " })).toEqual({ ACCESS_AUD: "stage-aud" });
    expect(JSON.stringify(stageConfig(prod, STAGE_ENV))).not.toContain("stage-aud");
    expect(STAGE_HOST).toBe("skope-stage.khorum-oss.org");
  });

  it("never carries a prod name, hostname, database or AUD over, and keeps workers.dev and previews off", () => {
    const text = stageConfigText(PROD.replace('"workers_dev": false', '"workers_dev": true'), STAGE_ENV);
    for (const prodValue of ['"skope"', "skope.khorum-oss.org", "prod-db-id", "prod-aud"]) expect(text).not.toContain(prodValue);
    const config = parseJsonc(text);
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.dev).toEqual({ host: "localhost" });
    expect(config.assets).toEqual({ directory: "./web", binding: "ASSETS" });
    expect(config.compatibility_date).toBe("2026-10-01");
  });

  it("refuses the prod database id or the prod AUD, so a wrong variable cannot wipe prod", () => {
    const prod = parseJsonc(PROD);
    expect(() => stageConfig(prod, { ...STAGE_ENV, STAGE_D1_ID: "prod-db-id" })).toThrow(/prod database id/);
    expect(() => stageConfig(prod, { ...STAGE_ENV, STAGE_D1_ID: " prod-db-id " })).toThrow(/prod database id/);
    expect(() => stageConfig(prod, { ...STAGE_ENV, STAGE_ACCESS_AUD: "prod-aud" })).toThrow(/prod Access AUD/);
  });

  it("fails closed on a config key it does not know, or more than one database", () => {
    const prod = parseJsonc(PROD);
    expect(() => stageConfig({ ...prod, kv_namespaces: [{ binding: "KV", id: "prod-kv" }] }, STAGE_ENV)).toThrow(/"kv_namespaces".*teach scripts\/stage-config.mjs/);
    expect(() => stageConfig({ ...prod, env: { staging: {} } }, STAGE_ENV)).toThrow(/"env"/);
    expect(() => stageConfig({ ...prod, d1_databases: [...prod.d1_databases, { binding: "OTHER", database_id: "x" }] }, STAGE_ENV)).toThrow(/exactly one D1/);
    expect(() => stageConfig({ ...prod, observability: { enabled: true }, compatibility_flags: ["nodejs_compat"] }, STAGE_ENV)).not.toThrow();
  });

  it("refuses to run without the stage database id or AUD", () => {
    const prod = parseJsonc(PROD);
    expect(() => stageConfig(prod, {})).toThrow(/STAGE_D1_ID and STAGE_ACCESS_AUD/);
    expect(() => stageConfig(prod, { STAGE_D1_ID: "x", STAGE_ACCESS_AUD: " " })).toThrow(/STAGE_ACCESS_AUD/);
    expect(() => stageConfig(prod, { STAGE_ACCESS_AUD: "x" })).toThrow(/STAGE_D1_ID/);
  });
});
