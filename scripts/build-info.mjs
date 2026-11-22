/**
 * What build this is: the version, the branch and commit it came from, and where it was built for. scripts/assemble.mjs
 * writes it to dist/version.json, which the site serves at /version.json and /version, and the app shows (the
 * account menu, and a badge in the header on stage).
 *
 * The version is package.json's, the release, plus the commit as semver build metadata:
 *
 *   main:          0.4.0+1a2b3c4
 *   other branch:  0.4.0-SNAPSHOT+fix-card-text.1a2b3c4     (a snapshot, named after its branch)
 *
 * The deploy workflow says which branch and commit it deploys, and where, through DAIDAL_BRANCH, DAIDAL_COMMIT,
 * DAIDAL_CHANNEL (prod or stage) and DAIDAL_PR: on stage the checkout is a bare commit, with no branch git could
 * name. Without them it asks git, and the channel is "local".
 *
 * The pure parts are exported for the tests; only the command at the bottom runs git or touches files.
 */

/** The branch that releases come from: a build of it is the release itself, not a snapshot. */
export const RELEASE_BRANCH = "main";

/** [branch] as a semver build identifier: letters, digits and hyphens only, so `fix/card-text` reads `fix-card-text`. */
export function branchSlug(branch) {
  return (
    String(branch ?? "")
      .replace(/[^0-9A-Za-z-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "unknown"
  );
}

/** The version string: the release on [RELEASE_BRANCH], a snapshot named after its branch anywhere else. */
export function versionString(release, branch, shortCommit) {
  const snapshot = branch !== RELEASE_BRANCH;
  const meta = [snapshot ? branchSlug(branch) : "", shortCommit].filter(Boolean).join(".");
  return `${release}${snapshot ? "-SNAPSHOT" : ""}${meta ? `+${meta}` : ""}`;
}

/** Only what a commit id can be, so nothing else from the environment reaches the page. */
const commitOf = value => (/^[0-9a-f]{7,40}$/i.test(String(value ?? "").trim()) ? String(value).trim().toLowerCase() : "");

/**
 * The build's description. [env] is the process environment; [git] answers `branch` and `commit` (or empty when
 * there is no repository); [release] is package.json's version; [now] the build time.
 */
export function buildInfo({ env = {}, git = {}, event = {}, release = "0.0.0", now = new Date() } = {}) {
  // Started by hand (Actions → deploy → Run workflow), the branch is the one asked for, not main that the workflow
  // runs from. Then a PR's own branch (GITHUB_REF_NAME there is "123/merge"), then the pushed branch.
  const dispatched = env.GITHUB_EVENT_NAME === "workflow_dispatch" ? String(event?.inputs?.branch ?? "") : "";
  const fromActions = dispatched || env.GITHUB_HEAD_REF || (env.GITHUB_REF_TYPE === "branch" ? env.GITHUB_REF_NAME : "");
  const branch = String(env.DAIDAL_BRANCH || fromActions || git.branch || "").trim() || "local";
  // git's HEAD before GITHUB_SHA: on a pull request GitHub's sha is a merge commit nobody pushed.
  const commit = commitOf(env.DAIDAL_COMMIT) || commitOf(git.commit) || commitOf(env.GITHUB_SHA);
  const shortCommit = commit.slice(0, 7);
  // The deploy workflow names the channel. A stage deploy started by hand runs main's copy of the workflow, which
  // may be older than this build and not name it, so the stage job itself also counts as stage.
  const channel = ["prod", "stage"].includes(env.DAIDAL_CHANNEL)
    ? env.DAIDAL_CHANNEL
    : env.GITHUB_ACTIONS === "true" && env.GITHUB_JOB === "stage"
      ? "stage"
      : "local";
  const pr = /^\d+$/.test(String(env.DAIDAL_PR ?? "")) ? Number(env.DAIDAL_PR) : null;
  return {
    name: "daidal",
    version: versionString(release, branch, shortCommit),
    release,
    snapshot: branch !== RELEASE_BRANCH,
    channel,
    branch,
    commit,
    shortCommit,
    pr,
    builtAt: now.toISOString(),
  };
}

/** Ask git for the branch and commit; empty when git or the repository isn't there. A detached HEAD has no branch. */
export async function readGit() {
  const { execFileSync } = await import("node:child_process");
  const run = args => {
    try {
      return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
  return { branch: branch === "HEAD" ? "" : branch, commit: run(["rev-parse", "HEAD"]) };
}

/** The Actions event that started this run (GITHUB_EVENT_PATH), or {} outside Actions or when it can't be read. */
function readEvent(readFileSync, path) {
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** This build's description, read from the environment, the Actions event, git and package.json. */
export async function currentBuildInfo() {
  const { readFileSync } = await import("node:fs");
  const release = JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0";
  return buildInfo({ env: process.env, git: await readGit(), event: readEvent(readFileSync, process.env.GITHUB_EVENT_PATH), release });
}

const invokedDirectly = typeof process !== "undefined" && process.argv?.[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;
if (invokedDirectly) console.log(JSON.stringify(await currentBuildInfo(), null, 2));
