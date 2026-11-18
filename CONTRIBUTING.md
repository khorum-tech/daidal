# Contributing

Thanks for looking. Daidal is small and opinionated; the fastest way to help is to open an issue first and build
second, so that nobody spends an evening on something that won't merge.

## Before you start

- **Read the specs** in `docs/superpowers/specs/`. They explain what Daidal is trying to be and what it declines to
  be. A change that fits one of them lands easily; one that fights them needs a discussion first.
- **Check the license.** The software is under the Functional Source License (`LICENSE.md`): use it, self-host it,
  change it, but don't offer it as a competing hosted product. Each release becomes Apache-2.0 two years after it
  ships.
- **Contributor License Agreement.** Because of that license, contributions need a short CLA so the project can
  keep relicensing cleanly. A bot asks you to sign on your first pull request; it takes a minute.

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
- Follow the code around you: TypeScript, no default exports, comments that say why rather than what.

## Reporting bugs

Open an issue with what you did, what you expected, what happened, and the diagram config if one is involved
(`get_diagram` with `format: yaml` through MCP, or the app's export). Strip anything private first.

## Security problems

Not in issues, please: see `SECURITY.md`.
