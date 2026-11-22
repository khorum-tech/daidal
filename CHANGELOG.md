# Changelog

All notable changes to Daidal. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Functions on code blocks.** A code block's functions have their own fields: a name, parameters on one line
  (`batch: Batch, strict: Boolean`), what it returns and a note, added with **+ Add function**. The card draws them as
  signatures (`check(batch: Batch): Verdict`) under their own rule, below the members, the two sharing its six lines.
  Documents keep them as `functions: [{ name, params: [{ name, type }], returns, notes }]`; a config may also give a
  function as a signature, which reads into the same entry, and exports always write the entry. Members now stand
  for what a block holds (fields, columns, exports). A box that lists functions as text in its members, subtitle or
  notes offers to move them into fields. The MCP tools (`add_node`, `update_node`, `get_diagram`), the SVG and PNG
  exports, the hover card, change review, the C4 Code template and the stage data carry them. Older diagrams load
  as they were. `@khorum/daidal-core` moves to 0.2.0 to carry them, and the Claude skill pins 0.2.0 and documents
  `functions`; publish 0.2.0 before handing out the updated skill.
- **Functions read in their code's language.** A code block can say what it is written in (Java, Kotlin,
  TypeScript, JavaScript, Python, Ruby, Go, Rust, C# or Swift) with **Written in**, and its functions then read as
  that language writes them: `Verdict check(Batch batch)` in Java, `fun check(batch: Batch): Verdict` in Kotlin,
  `func check(batch Batch) Verdict` in Go. With no language they read in a neutral form,
  `check(batch: Batch) → Verdict`, in place of the TypeScript-looking one. Documents keep each function the same
  whatever the language, as `language` on the node; the config format, the MCP tools, the exports and the Claude
  skill carry it. Each parameter now has its own name and type fields, stacked so a function's fields fit a phone or
  a tablet held upright without scrolling sideways.
- **Core and exports stay in step with the document format.** A contract test sets every field of the format and
  checks that the config export reads back unchanged, that the SVG shows what a field-by-field ledger says it shows,
  and that the npm bundle draws an exported config exactly as the app does; the MCP outline and backups get the same
  check. A field added to the format fails the typecheck until the ledgers say what each output does with it. CI
  refuses a pull request that changes what core ships without moving core's version past npm's.
- **Code blocks.** A node with `members` (what a class, file or table exposes, a line each) or a `path` (where it
  lives) draws as a code block: the name in monospace, the subtitle as one line of purpose, the path, then the
  members under a rule. The block grows to fit, and shows six lines or five and a count of the rest. The node's
  details edit both in a C4 Code diagram; the config format, the MCP tools (`add_node`, `update_node`,
  `get_diagram`) and the SVG and PNG exports carry them. The C4 Code template and the stage data use them.
- **Colours** in Appearance: five dark palettes (Nocturne, Midnight, Plum, Graphite, Ink) and four light ones
  (Paper, Lilac, Sand, Mist). Each theme keeps its own, picking one
  switches to its theme, and every accent stays in the logo's purple family.
- Each build says what it is. The account menu ends with the version: the release and its commit on prod
  (`0.1.0 · 1a2b3c4`), a snapshot with its branch anywhere else (`0.1.0-SNAPSHOT · fix/card-text · 1a2b3c4`).
  `/version` answers with the build as JSON, and every static file carries an `x-daidal-version` header.
- An in-app docs page, **C4 and drill-down**: the four levels, linking them, moving between them, and what the
  header shows.
- `@khorum/daidal-core` is on npm (0.1.0, published 2026-11-22): `npm run build:core` builds a single ES module
  browser bundle with its types, and the hand-run `publish-core` workflow publishes it as an npm trusted publisher,
  with no npm token (a dry run unless ticked). It loads from jsDelivr, unpkg and esm.sh too.
- A Claude skill, `skills/daidal-diagram`, that draws a Daidal config inline in Claude with the core bundle from an
  npm CDN, and shows a diagram from your workspace through the Daidal connector.
- Public source release under the Functional Source License (FSL-1.1-ALv2).
- Root README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT and TRADEMARKS.
- A Contributor License Agreement (`CLA.md`), signed with a comment on your first pull request.
- The Daidal mark: the header logo and a favicon, both following light or dark.
- A product tour and a C4 walk-through on the README, recorded from scripts (`docs/demo.md`).
- Versioned releases: `npm run release` moves the version on and files these notes; merging that tags the release
  on GitHub (`docs/releasing.md`).
- A shared core package (`packages/core`, `@khorum/daidal-core`): the document types, the scene model, the SVG
  renderer, config reading and document edits, with no DOM and no dependencies. The editor and the Worker both use
  it, so later integrations draw the same picture.

### Changed
- Stage deploys every push to a code owner's PR, drafts included, so it shows the last PR pushed; there is no line to wait in. A hold by hand is off by default and ends by itself after 12 hours or when its branch merges, and a push that doesn't deploy says why on the run and the PR. The PR's stage comment names the version the account menu shows.
- Connections draw heavier: every weight scales up by 1.4 (Medium goes from 1.4 to about 2), dashes and arrowheads with it. Container borders scale the same way and draw in a stronger colour, so they read on the light theme too.
  Saved weights don't change.
- The header drops the **Preview** tag, leaving the breadcrumbs and the account menu.
- The header fits the width it has instead of cutting off: on a tablet or a narrow window it drops your name (the initial stays), shows the C4 level by its pips, folds the levels between the workspace and the one above into a **⋯** menu, and on a phone keeps only a back arrow one level up and the diagram you're on. Every way in the bar is big enough to tap with a finger.
- **Present** moved out of the strip above the canvas; it stays in the diagram's sheet (press the diagram's name).
- The product is now called **Daidal** (formerly Skope), everywhere a person reads it: the app, its docs, error
  messages and what the MCP server tells an AI.
- The rest of the rename: diagrams download as `.daidal.yaml` / `.daidal.json`, workspace backups as `daidal-backup`
  and your data as `daidal-account`, and the MCP server introduces itself as `daidal`. Backups saved as
  `skope-backup` still import. The Cloudflare Worker and D1 database names keep `skope` for now.
- The hosted site moves to **daidal.khorum.org** (stage to daidal-stage.khorum.org). The old addresses,
  skope.khorum-oss.org and skope-stage.khorum-oss.org, still answer.

### Fixed
- A node card no longer lets long text spill out of it: the type keeps to one line, and the name and subtitle wrap
  over as many lines as the card's height leaves, then end in an ellipsis (hover shows it in full).
