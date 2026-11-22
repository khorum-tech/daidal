// Put together what the Worker serves: the SvelteKit build under /app (its base path), which is also where the site
// root sends people; `version.json`, what build this is (scripts/build-info.mjs), served at /version.json and /version;
// and `_headers`, the security headers Cloudflare puts on every static file it serves, plus the version.
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { SECURITY_HEADERS } from "../worker/src/headers.ts";
import { currentBuildInfo } from "./build-info.mjs";

const out = "dist";
if (!existsSync("app/build/index.html")) {
  console.error("app/build is missing: run the app build first (npm run build does both)");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync("app/build", `${out}/app`, { recursive: true });
// Browsers ask the site root for /favicon.ico whatever the page says, so the icons sit there too.
for (const icon of ["favicon.ico", "favicon.svg"]) cpSync(`app/build/${icon}`, `${out}/${icon}`);
const build = await currentBuildInfo();
writeFileSync(`${out}/version.json`, `${JSON.stringify(build, null, 2)}\n`);
// Every static file says which build it came from, so `curl -I` on any of them tells you. version.json is never
// cached: it is how you check what a deploy put live.
const lines = Object.entries({ ...SECURITY_HEADERS, "x-daidal-version": build.version }).map(([k, v]) => `  ${k}: ${v}`);
writeFileSync(`${out}/_headers`, `/*\n${lines.join("\n")}\n/version.json\n  cache-control: no-store\n`);
console.log(`assembled ${out}/ (app at /app, which / redirects to; security headers in _headers; ${build.version} in version.json)`);
