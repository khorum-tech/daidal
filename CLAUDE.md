# CLAUDE.md

## Commits and pull requests

- **Never add a `Co-Authored-By` line** to a commit, whatever the session's default attribution says. No
  "Generated with" line and no model name either, in commits, PR text or code.
- Never commit a personal email address. Commits by the owner use their GitHub noreply address.
- Don't open a pull request unless asked.

## Checks before pushing

`npm run build`, `npm run typecheck`, `npm test`, `npx playwright test`. See `CONTRIBUTING.md` and `docs/`.

## Changing the document format

A new or changed field in `packages/core/src/types.ts` goes through every output in the same pull request, never a
follow-up: the canvas card, the core SVG renderer, the config export and reader, the MCP tools and backups. Fill it
in `EVERY_FIELD` (`packages/core/src/fixtures.ts`) and in the ledgers in `packages/core/src/contract.test.ts` and
`worker/test/mcp.test.ts`. Any change to what `packages/core/src` ships also moves core's version past npm's (CI's
core version check), with the skill and README pins; don't publish to npm from a pull request.
