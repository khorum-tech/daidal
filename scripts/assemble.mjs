// Put together what the Worker serves: the prototype from web/ at the site root, and the SvelteKit build under
// /app (its base path). web/ must not have an app/ of its own, so an overlap stops the build.
import { cpSync, existsSync, rmSync } from "node:fs";

const out = "dist";
if (!existsSync("app/build/index.html")) {
  console.error("app/build is missing: run the app build first (npm run build does both)");
  process.exit(1);
}
if (existsSync("web/app")) {
  console.error("web/app exists, but /app belongs to the SvelteKit build");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync("web", out, { recursive: true });
cpSync("app/build", `${out}/app`, { recursive: true });
console.log(`assembled ${out}/ (prototype at /, app at /app)`);
