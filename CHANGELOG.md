# Changelog

All notable changes to Daidal. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Your own addresses in the docs.** The in-app docs no longer hard-code `daidal.khorum.org`: the MCP addresses on
  Connecting AI, the Claude Code commands and the skill's repository link come from `DAIDAL_URL`, `DAIDAL_STAGE_URL`,
  `DAIDAL_LOCAL_URL` and `DAIDAL_REPO_URL`, read from a `.env` at the repository root (or the build's environment)
  when the app is built, so a copy run for another organisation points its docs at itself. `.env.example` lists
  them with Daidal's own as the defaults; an empty `DAIDAL_STAGE_URL` leaves stage out, and anything that isn't a
  plain http(s) address stops the build with the variable's name. The app's dev server sends `/api` to
  `DAIDAL_LOCAL_URL`. Core is unchanged.
- **Groups for a workspace's diagrams.** A diagram can be filed under a group in its workspace (a C4 set, a service,
  a team) from the folder button on its card or **Group** in its sheet, or when it's made. The workspace's page then
  shows the cards under a heading per group, the ones in no group last, with a row of groups under the search that
  keeps the list to one (`?g=`; it scrolls sideways on a phone). A new C4 level from Zoom in or Zoom out, and a
  duplicate beside the diagram, join its group. Groups are flat and belong to the workspace, not the document
  (migration 0007, `diagrams.group_name`): they aren't in its history or config, a move to another workspace leaves
  it in none, and only the owner files it. `GET /api/diagrams` takes `group` (empty for none), `PUT
  /api/diagrams/:id/group` files one (write tokens may too), workspaces list their groups with counts, and backups
  carry each diagram's group. The MCP tools gain `group_diagram`, `create_diagram` takes `group`, and
  `list_diagrams`/`list_workspaces` show groups. Core is unchanged: nothing a diagram draws depends on its group.
- **Core publishes with the app.** After every successful prod deploy from main, `publish-core` puts the core
  that commit shipped on npm when npm doesn't have its version yet, and stops cleanly when it does. A pull request
  that changes core still has to move its version, so merging it deploys the app and publishes the package
  together, with no manual run. Running `publish-core` by hand still works.
- **Table blocks for database tables.** A node of type Table with columns draws as a table card: its name, then a
  row per column with a key badge (PK, FK or UQ), the column's name and its data type at the right, so every table
  in a workspace reads the same way. Past ten columns the last row counts the rest. The details panel edits columns
  as cards (name, key, data type with the usual types offered as you type), stacked so they fit a phone or a tablet
  held upright. Documents keep them as `columns: [{ id, name, type, key }]`; a config may also give a column as a line
  (`"PK id: uuid"`). Each column keeps an id through renames, ready for relationships between tables later. A Table
  that lists its columns as members still draws as before and offers to turn them into columns. The SVG and PNG
  exports, config export, MCP tools (`add_node`, `update_node`, `get_diagram`), backups, hover card, change review,
  the C4 Code template, the Claude skill and the stage data carry them. `@khorum/daidal-core` moves to 0.3.0 to
  carry them and the skill pins 0.3.0; publish 0.3.0 (0.2.0 too, if it never went out) before handing out the skill.
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
- **A finger or Apple Pencil can drag on an iPad held sideways** (issue #100). Wider than 900 px the editor uses
  its desktop layout, which has no Move or Resize buttons, and every touch or pen press panned. Now a press on what is
  already selected drags it: the selected node, the picked nodes, or the selected container by its border or label
  (moved) or its corner handle (resized). A first tap selects and a second press drags, so a stray finger on
  anything else still pans. Phones keep Move and Resize in their menus. A new e2e `tablet` project (iPad Pro 11"
  sideways) keeps this working.
- **Connection ends can be moved with a finger or Apple Pencil** (issue #102). On a touch screen the handles on the
  selected connection's ends were hidden, so an end could only be pinned to the middle of a side from the connection's
  sheet. The handles now show there too, a little bigger: drag one along its box to pin it to that spot, and double tap
  it to put it back on auto, as a mouse does with a double-click. Core is unchanged.
- **A link's address stays as typed on a phone or iPad** (issue #103). The keyboard capitalised its first letter, and
  again whenever the box was emptied, so an address could be saved as `Example.com/Path` and break on a
  case-sensitive path. The link address box, and a code node's **Path**, now ask the keyboard not to capitalise,
  correct or spell-check; a link's label keeps normal capitals. Core is unchanged.
- A node card no longer lets long text spill out of it: the type keeps to one line, and the name and subtitle wrap
  over as many lines as the card's height leaves, then end in an ellipsis (hover shows it in full).
