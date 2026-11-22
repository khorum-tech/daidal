// The READMEs show the core package loading from an npm CDN at a pinned version. Keep those pins on the version
// packages/core publishes, so a copied snippet loads the package the docs describe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "./build-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")).version;
const pinned = new RegExp(`${PACKAGE_NAME.replace("/", "\\/")}@([^/\\s'"\`)]+)`, "g");

for (const file of ["README.md", "packages/core/README.md"]) {
  test(`${file} pins the version packages/core publishes`, () => {
    const pins = [...readFileSync(join(root, file), "utf8").matchAll(pinned)].map((m) => m[1]);
    assert.ok(pins.length > 0, `${file} shows a pinned CDN address`);
    for (const pin of pins) assert.equal(pin, version, `${file} pins ${PACKAGE_NAME}@${pin}, not ${version}`);
  });
}
