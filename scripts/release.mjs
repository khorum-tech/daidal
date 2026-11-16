// Prepare a release: `npm run release -- minor` (or major, patch, or an exact x.y.z).
//
// It moves the version on in both package.json files and their lockfiles, and files what CHANGELOG.md has under
// Unreleased as that version, dated today. It changes files only: commit them on a branch and open a pull request.
// When that merges, the `release` workflow tags the merge `v<version>` and publishes a GitHub release with those
// notes (docs/releasing.md).
//
// `node scripts/release.mjs --notes <version>` prints one version's notes; the workflow uses it.
import { readFileSync, writeFileSync } from "node:fs";
import { nextVersion, rollChangelog, section } from "./release-lib.mjs";

const read = path => readFileSync(path, "utf8");
const [arg, value] = process.argv.slice(2);

try {
  if (arg === "--notes") {
    const notes = section(read("CHANGELOG.md"), value ?? "");
    if (!notes) throw new Error(`CHANGELOG.md has no notes for ${value ?? "(no version given)"}`);
    console.log(notes);
  } else {
    const current = JSON.parse(read("package.json")).version ?? "0.0.0";
    const version = nextVersion(current, arg);
    const today = new Date().toISOString().slice(0, 10);
    // The changelog first: if there is nothing to release, no file has been touched yet.
    const changelog = rollChangelog(read("CHANGELOG.md"), version, today);

    // Only the version line changes, so each file keeps its own indentation and key order. In a lockfile the first
    // "version" at each depth is the package's own: the top-level one, and the one in packages[""].
    const writes = [];
    for (const path of ["package.json", "app/package.json", "package-lock.json", "app/package-lock.json"]) {
      const text = read(path);
      const lock = path.endsWith("package-lock.json");
      let left = lock ? 2 : 1;
      const next = text.replace(/^(\s*"version":\s*")[^"]*(")/gm, (line, before, after) => (left-- > 0 ? `${before}${version}${after}` : line));
      // Checked as JSON before anything is written: the lines changed must be the package's own version.
      const now = JSON.parse(next);
      const own = lock ? [now.version, now.packages?.[""]?.version] : [now.version];
      if (own.some(v => v !== version)) throw new Error(`${path}: could not set its "version" (is the field there, before any dependency's?)`);
      writes.push([path, next]);
    }
    for (const [path, text] of writes) writeFileSync(path, text);
    writeFileSync("CHANGELOG.md", changelog);
    console.log(`${current} → ${version}

Next:
  git switch -c release/v${version}
  git commit -am "Release v${version}"
  git push -u origin release/v${version}      # then open a pull request

Merging it tags v${version} and publishes the GitHub release.`);
  }
} catch (err) {
  console.error(`release: ${err.message}`);
  process.exit(1);
}
