// The parts of a release that are plain text work: the next version, and the changelog's sections. scripts/release.mjs
// reads and writes the files; the release workflow reads a version's notes from here.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const UNRELEASED = /^## \[Unreleased\][^\n]*$/m;

/** [current] moved on by `major`, `minor` or `patch`, or replaced by an exact version, which must be newer. */
export function nextVersion(current, bump) {
  const at = SEMVER.exec(current);
  if (!at) throw new Error(`the current version "${current}" is not x.y.z`);
  const [major, minor, patch] = at.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  const to = SEMVER.exec(bump ?? "");
  if (!to) throw new Error(`say major, minor, patch or an exact x.y.z, not "${bump ?? ""}"`);
  const newer = to.slice(1).map(Number);
  const older = [major, minor, patch];
  const i = newer.findIndex((n, k) => n !== older[k]);
  if (i < 0 || newer[i] < older[i]) throw new Error(`${bump} is not newer than ${current}`);
  return bump;
}

/** The text under a `## [name]` heading, up to the next `## ` heading; null when there is no such heading. */
export function section(changelog, name) {
  const lines = changelog.split("\n");
  const start = lines.findIndex(l => l.startsWith(`## [${name}]`));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

/**
 * [changelog] with what was under Unreleased filed as [version], dated [date] (YYYY-MM-DD), and a new, empty
 * Unreleased above it. Throws when there is nothing to release: a release with no notes says nothing.
 */
export function rollChangelog(changelog, version, date) {
  const notes = section(changelog, "Unreleased");
  if (notes === null) throw new Error("CHANGELOG.md has no ## [Unreleased] section");
  if (!notes) throw new Error("nothing under ## [Unreleased] in CHANGELOG.md: write what changed first");
  if (section(changelog, version) !== null) throw new Error(`CHANGELOG.md already has a section for ${version}`);
  return changelog.replace(UNRELEASED, `## [Unreleased]\n\n## [${version}] - ${date}`);
}
