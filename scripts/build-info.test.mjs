import assert from "node:assert/strict";
import { test } from "node:test";
import { branchSlug, buildInfo, versionString } from "./build-info.mjs";

const SHA = "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d";
const NOW = new Date("2026-11-22T05:00:00Z");

test("a build of main is the release, with its commit", () => {
  assert.equal(versionString("0.4.0", "main", "1a2b3c4"), "0.4.0+1a2b3c4");
  assert.equal(versionString("0.4.0", "main", ""), "0.4.0");
});

test("any other branch is a snapshot named after its branch", () => {
  assert.equal(versionString("0.4.0", "fix/card-text", "1a2b3c4"), "0.4.0-SNAPSHOT+fix-card-text.1a2b3c4");
  assert.equal(versionString("0.4.0", "local", ""), "0.4.0-SNAPSHOT+local");
});

test("a branch name becomes a semver build identifier", () => {
  assert.equal(branchSlug("feat/version_display"), "feat-version-display");
  assert.equal(branchSlug("/odd//name/"), "odd-name");
  assert.equal(branchSlug("é<script>"), "script");
  assert.equal(branchSlug(""), "unknown");
  assert.ok(branchSlug("x".repeat(200)).length <= 60);
});

test("prod: the deploy workflow names main, its commit and the channel", () => {
  const info = buildInfo({
    env: { DAIDAL_BRANCH: "main", DAIDAL_COMMIT: SHA, DAIDAL_CHANNEL: "prod" },
    git: { branch: "", commit: "" },
    release: "0.4.0",
    now: NOW,
  });
  assert.deepEqual(info, {
    name: "daidal",
    version: "0.4.0+1a2b3c4",
    release: "0.4.0",
    snapshot: false,
    channel: "prod",
    branch: "main",
    commit: SHA,
    shortCommit: "1a2b3c4",
    pr: null,
    builtAt: "2026-11-22T05:00:00.000Z",
  });
});

test("stage: a PR branch on a bare checkout, named by the workflow", () => {
  const info = buildInfo({
    env: { DAIDAL_BRANCH: "fix/card-text-fills-card", DAIDAL_COMMIT: SHA, DAIDAL_CHANNEL: "stage", DAIDAL_PR: "86" },
    git: { branch: "", commit: SHA },
    release: "0.0.0",
    now: NOW,
  });
  assert.equal(info.version, "0.0.0-SNAPSHOT+fix-card-text-fills-card.1a2b3c4");
  assert.equal(info.branch, "fix/card-text-fills-card");
  assert.equal(info.snapshot, true);
  assert.equal(info.channel, "stage");
  assert.equal(info.pr, 86);
});

test("in Actions without the workflow's names, a PR's own branch and git's commit, not the merge commit", () => {
  const info = buildInfo({
    env: { CI: "true", GITHUB_HEAD_REF: "feat/x", GITHUB_REF_NAME: "87/merge", GITHUB_REF_TYPE: "branch", GITHUB_SHA: "f".repeat(40) },
    git: { branch: "", commit: SHA },
  });
  assert.equal(info.branch, "feat/x");
  assert.equal(info.commit, SHA);
  assert.equal(info.channel, "local");
});

test("locally: git's branch and commit; with no git at all, still a version", () => {
  assert.equal(buildInfo({ git: { branch: "main", commit: SHA }, release: "1.0.0" }).version, "1.0.0+1a2b3c4");
  const bare = buildInfo({ release: "1.0.0" });
  assert.equal(bare.version, "1.0.0-SNAPSHOT+local");
  assert.equal(bare.commit, "");
});

test("only a commit id, a known channel and a number get through from the environment", () => {
  const info = buildInfo({ env: { DAIDAL_BRANCH: "main", DAIDAL_COMMIT: "not a sha", DAIDAL_CHANNEL: "evil", DAIDAL_PR: "86; x" } });
  assert.equal(info.commit, "");
  assert.equal(info.channel, "local");
  assert.equal(info.pr, null);
});
