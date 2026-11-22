// On a pull request: fails when it changes what @khorum/daidal-core ships without moving packages/core's version
// past the one on npm (see core-version-lib.mjs). Usage: node scripts/core-version-check.mjs <base commit>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "./build-core.mjs";
import { coreVersionProblem, shippedCoreFiles } from "./core-version-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/core-version-check.mjs <base commit>");
  process.exit(2);
}

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
const changed = shippedCoreFiles(run("git", ["diff", "--name-only", base, "HEAD", "--", "packages/core/src"]).split("\n").filter(Boolean));
const local = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")).version;

let published = null;
if (changed.length) {
  try {
    published = run("npm", ["view", PACKAGE_NAME, "version"]) || null;
  } catch (e) {
    // npm says E404 for a package it has never had; anything else (no network, npm down) is a failure to check.
    if (!String(e.stderr ?? e.message).includes("E404")) throw e;
  }
}

const problem = coreVersionProblem({ changed, local, published });
if (problem) {
  console.error(`::error title=Core changed without a new version::${problem}`);
  process.exit(1);
}
console.log(changed.length ? `Core changed; ${PACKAGE_NAME} ${local} is newer than npm's ${published ?? "(none)"}.` : "No change to what core ships.");
