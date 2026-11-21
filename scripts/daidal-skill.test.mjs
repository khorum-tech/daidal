// Checks the Claude skill in skills/daidal-diagram against the core package it loads: the widget pins the version
// and name this repository would publish, loads only from the npm CDNs Claude's inline visuals allow, and every
// config the skill shows Claude draws with the built bundle, every node placed where the config says.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUNDLE, PACKAGE_NAME, buildCore } from "./build-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills/daidal-diagram");
const read = (...p) => readFileSync(join(skill, ...p), "utf8");
const version = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")).version;

const widget = read("assets/widget.html");
const skillMd = read("SKILL.md");

/** The configs the skill shows Claude: the widget's own, the examples and the SKILL.md example. */
function configs() {
  const out = [["assets/widget.html", widget.match(/<script type="text\/plain" id="daidal-config">([\s\S]*?)<\/script>/)[1]]];
  for (const f of readdirSync(join(skill, "examples")).filter(f => f.endsWith(".daidal.yaml"))) out.push([`examples/${f}`, read("examples", f)]);
  for (const [i, m] of [...skillMd.matchAll(/```yaml\n([\s\S]*?)```/g)].entries()) out.push([`SKILL.md yaml block ${i + 1}`, m[1]]);
  return out;
}

let out;
let core;
before(async () => {
  out = mkdtempSync(join(tmpdir(), "daidal-skill-"));
  await buildCore(out);
  core = await import(pathToFileURL(join(out, BUNDLE)).href);
});
after(() => rmSync(out, { recursive: true, force: true }));

test("the skill's frontmatter names it", () => {
  const front = skillMd.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  assert.ok(front, "SKILL.md opens with frontmatter");
  assert.match(front, /^name: daidal-diagram$/m);
  const description = front.match(/^description: (.+)$/m)?.[1] ?? "";
  assert.ok(description.length > 0 && description.length <= 1024, "a description of at most 1024 characters");
});

test("the widget pins the package and version this repository publishes", () => {
  assert.match(widget, new RegExp(`const PACKAGE = '${PACKAGE_NAME}';`));
  assert.match(widget, new RegExp(`const VERSION = '${version.replaceAll(".", "\\.")}';`));
  assert.ok(skillMd.includes(`\`${PACKAGE_NAME}\``), "SKILL.md names the package");
  assert.ok(skillMd.includes(`**${version}**`), "SKILL.md names the version");
});

test("the widget loads only from npm CDNs Claude's visuals allow", () => {
  const hosts = [...widget.matchAll(/https:\/\/([^/`'"\s]+)/g)].map(m => m[1]);
  assert.ok(hosts.length > 0);
  for (const h of hosts) assert.ok(["cdn.jsdelivr.net", "unpkg.com", "esm.sh", "cdnjs.cloudflare.com"].includes(h), `${h} is an allowed CDN`);
  assert.doesNotMatch(widget, /<(html|head|body)\b/i, "a fragment, not a page");
});

test("every config the skill shows draws, with every node where it says", () => {
  for (const [where, text] of configs()) {
    assert.doesNotMatch(text, /<\//, `${where}: nothing that would end the script tag`);
    const { svg, doc } = core.renderConfig(text);
    assert.match(svg, /^<svg/, where);
    for (const n of doc.nodes) {
      assert.equal(typeof n.layout?.x, "number", `${where}: node ${n.id} has a numeric x`);
      assert.equal(typeof n.layout?.y, "number", `${where}: node ${n.id} has a numeric y`);
    }
    for (const t of doc.nodes.flatMap(n => [n.name, n.subtitle ?? "", n.notes ?? ""])) assert.doesNotMatch(t, /,\s*\w+:/, `${where}: "${t}" swallowed a field`);
  }
});

test("the examples' views exist", () => {
  for (const [where, text] of configs()) {
    const { doc } = core.renderConfig(text);
    for (const v of doc.views ?? []) assert.ok(core.renderConfig(text, { view: v.name }).svg, `${where}: view ${v.name}`);
  }
});
