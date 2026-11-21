#!/usr/bin/env node
// Builds the publishable @khorum/daidal-core into packages/core/dist: one ES module bundle with no dependencies, its type declarations, the README and licence, and a
// package.json made for npm. `npm publish packages/core/dist` then publishes exactly that folder; the source
// package.json stays private and keeps exporting TypeScript to the app and the Worker.
//
// The bundle is what npm CDNs serve to pages that can only load scripts from them (Claude's inline visuals among
// them):
//   https://cdn.jsdelivr.net/npm/@khorum/daidal-core@<version>/daidal-core.js
//   https://unpkg.com/@khorum/daidal-core@<version>/daidal-core.js
//   https://esm.sh/@khorum/daidal-core@<version>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** The name it publishes under. Change it here, and only here, to publish as another. */
export const PACKAGE_NAME = "@khorum/daidal-core";
/** The licence it publishes under (an SPDX id). The full text, LICENSE.md at the repository root, ships with it. */
export const LICENSE = "FSL-1.1-ALv2";
export const BUNDLE = "daidal-core.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(root, "packages/core");

const DIST = join(core, "dist");

/** The folder is emptied first, so it has to be core's own dist, or a folder in the system's temp directory (tests). */
function safeOut(out) {
  const dir = resolve(out);
  const inside = (base) => { const rel = relative(resolve(base), dir); return rel !== "" && !rel.startsWith("..") && !rel.includes(`..${sep}`); };
  if (dir !== DIST && !inside(tmpdir())) throw new Error(`Won't build into ${dir}: only packages/core/dist or a temp folder`);
  return dir;
}

export async function buildCore(target = DIST) {
  const out = safeOut(target);
  const source = JSON.parse(readFileSync(join(core, "package.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(source.version)) throw new Error(`packages/core's version is "${source.version}", not x.y.z`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  await build({
    entryPoints: [join(core, "src/index.ts")],
    outfile: join(out, BUNDLE),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    sourcemap: true,
    legalComments: "none",
    banner: { js: `/*! ${PACKAGE_NAME} ${source.version} | ${LICENSE} | Copyright Violabs Software LLC */` },
    logLevel: "warning"
  });

  // Declarations only; esbuild has already compiled the code.
  execFileSync(
    process.execPath,
    [join(root, "node_modules/typescript/bin/tsc"), "-p", join(core, "tsconfig.build.json"), "--outDir", join(out, "types")],
    { stdio: "inherit" }
  );
  for (const f of ["README.md"]) copyFileSync(join(core, f), join(out, f));
  copyFileSync(join(root, "LICENSE.md"), join(out, "LICENSE.md"));

  const types = "./types/index.d.ts";
  const manifest = {
    name: PACKAGE_NAME,
    version: source.version,
    description: source.description,
    license: LICENSE,
    author: "Violabs Software LLC",
    homepage: "https://github.com/khorum-tech/daidal/tree/main/packages/core#readme",
    repository: { type: "git", url: "git+https://github.com/khorum-tech/daidal.git", directory: "packages/core" },
    bugs: "https://github.com/khorum-tech/daidal/issues",
    keywords: ["daidal", "diagram", "architecture", "svg", "c4"],
    type: "module",
    sideEffects: false,
    main: `./${BUNDLE}`,
    module: `./${BUNDLE}`,
    types,
    browser: `./${BUNDLE}`,
    unpkg: `./${BUNDLE}`,
    jsdelivr: `./${BUNDLE}`,
    exports: { ".": { types, default: `./${BUNDLE}` }, "./package.json": "./package.json" },
    files: [BUNDLE, `${BUNDLE}.map`, "types", "README.md", "LICENSE.md"],
    publishConfig: { access: "public" }
  };
  writeFileSync(join(out, "package.json"), JSON.stringify(manifest, null, "\t") + "\n");
  return { out, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, manifest } = await buildCore();
  console.log(`Built ${manifest.name}@${manifest.version} in ${out}`);
}
