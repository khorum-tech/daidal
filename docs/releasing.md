# Releasing

A release is a version number, a dated entry in [`CHANGELOG.md`](../CHANGELOG.md), a `v<version>` tag and a GitHub
release. Under the license, each release becomes Apache-2.0 two years after it ships, so the tag's date matters.
Releasing does not deploy: prod follows `main` ([stage.md](stage.md)).

The npm package `@khorum/daidal-core` has a version of its own, in `packages/core/package.json`, and its own
hand-run workflow; a release here doesn't touch it. How to publish it is in
[`packages/core/README.md`](../packages/core/README.md#publishing).

## As you work

Add a line under `## [Unreleased]` in `CHANGELOG.md` in the pull request that makes the change, under **Added**,
**Changed**, **Fixed** or **Removed**. Write it for someone using Daidal, not for someone reading the diff.

## Cut a release

```sh
npm run release -- minor     # or: major, patch, or an exact version such as 1.4.0
```

That sets the version in both `package.json` files and their lockfiles, and files everything under Unreleased as
the new version, dated today. It refuses if Unreleased is empty. It changes files only; then:

```sh
git switch -c release/v0.1.0
git commit -am "Release v0.1.0"
git push -u origin release/v0.1.0
```

Open a pull request and merge it. The [`release`](../.github/workflows/release.yml) workflow sees a version on
`main` with no tag, tags the merge commit `v0.1.0`, and publishes a GitHub release: that version's changelog
notes, then GitHub's list of the pull requests merged since the last tag.

Which number: **patch** for fixes, **minor** for new things that break nothing, **major** for a change that breaks
saved diagrams, the config format, the API or self-hosted setups. Before 1.0.0, minor may break.

Prod shows the version it runs in the account menu and at `/version`, as the release and its commit
(`0.1.0+1a2b3c4`). Stage shows a snapshot named after its branch ([stage.md](stage.md#which-branch-is-on-stage)).

## If it goes wrong

- **The workflow failed after the merge.** Fix the cause, then *Actions → release → Run workflow* on `main`. It
  does nothing if the tag already exists.
- **A release went out wrong.** Don't move the tag: cut a patch release with the fix.
- **No tag appeared.** The workflow runs when `package.json` changes on `main`. While the version is `0.0.0`, it
  says so and releases nothing.
