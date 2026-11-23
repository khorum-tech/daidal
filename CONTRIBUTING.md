# Contributing

Thanks for looking. Daidal is small and opinionated; the fastest way to help is to open an issue first and build
second, so that nobody spends an evening on something that won't merge.

## Before you start

- **Read the specs** in `docs/superpowers/specs/`. They explain what Daidal is trying to be and what it declines to
  be. A change that fits one of them lands easily; one that fights them needs a discussion first.
- **Check the license.** The software is under the Functional Source License (`LICENSE.md`): use it, self-host it,
  change it, but don't offer it as a competing hosted product. Each release becomes Apache-2.0 two years after it
  ships.
- **Contributor License Agreement.** Because of that license, contributions need a short CLA ([`CLA.md`](CLA.md))
  so the project can keep relicensing cleanly. You keep your copyright. On your first pull request a bot asks you
  to sign by commenting *I have read the Daidal CLA and I agree to its terms*; that covers every later one too.

## Setup

```sh
npm ci && npm ci --prefix app
npx wrangler dev --var DEV_USER_EMAIL:you@example.com   # http://localhost:8787, signed in as that email
```

- `npm test` runs the Worker tests (vitest on workerd) and the app's component tests.
- `npm run typecheck` runs tsc for the Worker and e2e, and `svelte-check` for the app.
- `npm run e2e` runs the Playwright end-to-end tests against a local server.
- `npm run docs:shots` regenerates the documentation screenshots.

## Pull requests

- Add a line to `CHANGELOG.md` under **Unreleased** for anything a user would notice. Releases are cut from it
  ([`docs/releasing.md`](docs/releasing.md)).
- One change per PR, with tests. CI must be green; the `stage` job deploys your branch to the shared stage site
  when it is the oldest open PR from this repository (see `docs/stage.md`).
- Describe what changed and why in the description, in plain language. Link the spec section if there is one.
- Keep the document format compatible. Anything that changes `DaidalDoc` needs a note in the roadmap spec and a
  reader that still accepts the previous shape.
- A change to the document format reaches every output in the same pull request: the canvas, the core renderer
  (`packages/core`, which the SVG and PNG exports, the npm package and the Claude skill all draw with), the config
  export and reader, the MCP tools and backups. Give the new field a value in `EVERY_FIELD`
  (`packages/core/src/fixtures.ts`) and a line in the ledgers in `packages/core/src/contract.test.ts` and
  `worker/test/mcp.test.ts`; the typecheck fails until you do.
- A change to what `packages/core/src` ships moves `packages/core/package.json`'s version past the one on npm, with
  the pins that follow it (the script tests say where). CI checks this, and the merge publishes it: after the prod
  deploy succeeds, `publish-core` puts the new version on npm ([`packages/core/README.md`](packages/core/README.md#publishing)).
- Follow the code around you: TypeScript, no default exports, comments that say why rather than what.

## Reporting bugs

Open an issue with what you did, what you expected, what happened, and the diagram config if one is involved
(`get_diagram` with `format: yaml` through MCP, or the app's export). Strip anything private first.

## Security problems

Not in issues, please: see `SECURITY.md`.
