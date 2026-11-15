// Put together what the Worker serves: the SvelteKit build under /app (its base path), which is also where the site
// root sends people, and `_headers`, the security headers Cloudflare puts on every static file it serves.
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { SECURITY_HEADERS } from "../worker/src/headers.ts";

const out = "dist";
if (!existsSync("app/build/index.html")) {
  console.error("app/build is missing: run the app build first (npm run build does both)");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync("app/build", `${out}/app`, { recursive: true });
// Browsers ask the site root for /favicon.ico whatever the page says, so the icons sit there too.
for (const icon of ["favicon.ico", "favicon.svg"]) cpSync(`app/build/${icon}`, `${out}/${icon}`);
const lines = Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`);
writeFileSync(`${out}/_headers`, `/*\n${lines.join("\n")}\n`);
console.log(`assembled ${out}/ (app at /app, which / redirects to; security headers in _headers)`);
