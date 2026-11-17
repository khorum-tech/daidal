import assert from "node:assert/strict";
import { test } from "node:test";
import { nextVersion, rollChangelog, section } from "./release-lib.mjs";

const DAY = "2026-03-04";
const LOG = `# Changelog

Intro.

## [Unreleased]

### Added
- A thing.

## [0.1.0] - 2026-01-02

### Fixed
- An old thing.
`;

test("moves a version on by part, or to an exact newer one", () => {
  assert.equal(nextVersion("0.0.0", "minor"), "0.1.0");
  assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  assert.equal(nextVersion("1.2.3", "1.10.0"), "1.10.0");
  assert.throws(() => nextVersion("1.2.3", "1.2.3"), /not newer/);
  assert.throws(() => nextVersion("1.2.3", "1.1.9"), /not newer/);
  assert.throws(() => nextVersion("1.2.3", "soon"), /major, minor, patch/);
  assert.throws(() => nextVersion("1.2.3", undefined), /major, minor, patch/);
});

test("reads one version's notes", () => {
  assert.equal(section(LOG, "Unreleased"), "### Added\n- A thing.");
  assert.equal(section(LOG, "0.1.0"), "### Fixed\n- An old thing.");
  assert.equal(section(LOG, "9.9.9"), null);
});

test("files Unreleased as the new version and leaves an empty Unreleased above it", () => {
  const rolled = rollChangelog(LOG, "0.2.0", DAY);
  assert.equal(section(rolled, "Unreleased"), "");
  assert.equal(section(rolled, "0.2.0"), "### Added\n- A thing.");
  assert.equal(section(rolled, "0.1.0"), "### Fixed\n- An old thing.");
  assert.match(rolled, /## \[0\.2\.0\] - 2026-03-04/);
});

test("refuses a release with no notes, or a version already filed", () => {
  assert.throws(() => rollChangelog(rollChangelog(LOG, "0.2.0", DAY), "0.3.0", "2026-03-05"), /nothing under/);
  assert.throws(() => rollChangelog(LOG, "0.1.0", DAY), /already has a section/);
  assert.throws(() => rollChangelog("# Changelog\n", "0.1.0", DAY), /no ## \[Unreleased\]/);
});
