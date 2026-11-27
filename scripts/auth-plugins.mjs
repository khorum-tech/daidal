// Bundles sign-in provider plugins into the Worker (worker/src/signin/plugins.ts, docs/sign-in.md). Workers can't
// import code at run time, so a self-hosted build names its plugin packages in DAIDAL_AUTH_PLUGINS (separated by
// commas or spaces), installs them, and this writes worker/src/signin/plugins.generated.ts to import each one's
// default export. With DAIDAL_AUTH_PLUGINS unset it changes nothing. `npm run build` runs it first.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const GENERATED = join(root, "worker/src/signin/plugins.generated.ts");
// An npm package name, optionally scoped, with nothing that could break out of an import string.
const PACKAGE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** The package names in [raw]; throws on one that isn't a package name. */
export function pluginNames(raw) {
  const names = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  for (const n of names) if (!PACKAGE.test(n)) throw new Error(`DAIDAL_AUTH_PLUGINS: "${n}" is not an npm package name`);
  return [...new Set(names)];
}

/** The generated module for [names]. */
export function renderPlugins(names) {
  const idents = names.map((_, i) => "plugin" + i);
  return [
    "// Written by scripts/auth-plugins.mjs from DAIDAL_AUTH_PLUGINS. With none set, there are no plugin providers.",
    ...names.map((n, i) => `import ${idents[i]} from ${JSON.stringify(n)};`),
    'import type { ProviderPlugin } from "./provider";',
    "",
    `export const GENERATED: ProviderPlugin[] = [${idents.join(", ")}];`,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw = process.env.DAIDAL_AUTH_PLUGINS;
  if (raw?.trim()) {
    const names = pluginNames(raw);
    const next = renderPlugins(names);
    if (readFileSync(GENERATED, "utf8") !== next) writeFileSync(GENERATED, next);
    console.log(`sign-in plugins bundled: ${names.join(", ")}`);
  }
}
