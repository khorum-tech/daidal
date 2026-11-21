// Builds the publishable core package into a temporary folder and checks what npm and the CDNs would serve: the
// bundle loads on its own, draws a config, and the manifest points at files that are there.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { BUNDLE, PACKAGE_NAME, buildCore } from "./build-core.mjs";

let out;
let manifest;
before(async () => {
  out = mkdtempSync(join(tmpdir(), "daidal-core-"));
  ({ manifest } = await buildCore(out));
});
after(() => rmSync(out, { recursive: true, force: true }));

test("the manifest is publishable and names the bundle", () => {
  assert.equal(manifest.name, PACKAGE_NAME);
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.dependencies, undefined);
  assert.equal(manifest.exports["."].default, `./${BUNDLE}`);
  for (const f of manifest.files) assert.ok(existsSync(join(out, f)), `${f} is in the package`);
  assert.ok(existsSync(join(out, manifest.types)), "the declarations are there");
});

test("the bundle is one self-contained module", () => {
  const code = readFileSync(join(out, BUNDLE), "utf8");
  assert.doesNotMatch(code, /\bimport\s*[\w{*][^;]*from\s*["']/, "no imports left in it");
  assert.match(code, new RegExp(`^/\\*! ${PACKAGE_NAME.replace("/", "\\/")} ${manifest.version} \\|`));
});

test("the bundle draws a config", async () => {
  const core = await import(pathToFileURL(join(out, BUNDLE)).href);
  const { svg, width, height, doc } = core.renderConfig(
    ["nodes:", "  - id: web", "    name: Web app", "    type: service", "  - id: db", "    name: Orders", "    type: database", "edges:", "  - from: web", "    to: db", "    label: reads"].join("\n")
  );
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /Web app/);
  assert.match(svg, /reads/);
  assert.ok(width > 0 && height > 0);
  assert.equal(doc.nodes.length, 2);
  assert.throws(() => core.renderConfig("nodes: []"), core.ConfigError);
});
