// Whether a change to the core package carries a version npm doesn't have yet. Everything that draws a diagram lives
// in packages/core, and the Claude skill and other integrations load it from npm, so a change there reaches them only
// once a new version is published. scripts/core-version-check.mjs runs this on every pull request.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** The core files a pull request touched that end up in the published package: not its tests or test fixtures. */
export function shippedCoreFiles(paths) {
  return paths.filter(p => p.startsWith("packages/core/src/") && !/\.test\.ts$/.test(p) && !p.endsWith("/fixtures.ts"));
}

/** -1, 0 or 1 as [a] is older than, the same as or newer than [b] (both x.y.z). */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map(v => {
    const m = SEMVER.exec(v);
    if (!m) throw new Error(`"${v}" is not an x.y.z version`);
    return m.slice(1).map(Number);
  });
  const i = x.findIndex((n, k) => n !== y[k]);
  return i < 0 ? 0 : x[i] < y[i] ? -1 : 1;
}

/**
 * Why this change can't go in as it is, or null when it can: it changes what core ships while packages/core's
 * version is one npm already has (or older), so the next publish would be refused or would leave the change out.
 * [published] is npm's latest version, or null when npm has none.
 */
export function coreVersionProblem({ changed, local, published }) {
  if (!changed.length || published === null) return null;
  if (compareVersions(local, published) > 0) return null;
  return [
    `This changes what @khorum/daidal-core ships (${changed.join(", ")}), but packages/core/package.json is still ${local} and npm already has ${published}.`,
    "Move packages/core's version on in this pull request (and the pins that follow it: skills/daidal-diagram, the READMEs; the script tests say where),",
    "so the next publish-core run carries the change to the Claude skill and anything else that loads core from npm.",
  ].join(" ");
}
