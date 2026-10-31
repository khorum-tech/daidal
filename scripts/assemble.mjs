// Put together what the Worker serves: the SvelteKit build under /app (its base path), which is also where the site
// root sends people, and the prototype from web/ under /prototype, kept for now.
import { cpSync, existsSync, rmSync } from "node:fs";

const out = "dist";
if (!existsSync("app/build/index.html")) {
  console.error("app/build is missing: run the app build first (npm run build does both)");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync("app/build", `${out}/app`, { recursive: true });
cpSync("web", `${out}/prototype`, { recursive: true });
console.log(`assembled ${out}/ (app at /app, which / redirects to; prototype at /prototype)`);
