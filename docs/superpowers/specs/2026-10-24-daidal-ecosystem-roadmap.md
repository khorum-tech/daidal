# Daidal ecosystem: from app to format

Date: 2026-10-24
Status: draft

Progress (2026-11-22): step 1 has landed as `packages/core` and is published on npm as `@khorum/daidal-core`
(0.1.0), one dependency-free ES module that also loads from jsDelivr, unpkg and esm.sh. It reads YAML with its own
small reader rather than the `yaml` package, and has no auto-layout yet: unplaced nodes fall into a grid. The first
integration on it is a Claude skill, `skills/daidal-diagram`, that draws a config inline in the chat. Step 6's links
and refs have landed with the C4 work (`2026-11-05-daidal-kinds-c4-and-repo-aware-ai.md`).

## Goal

Daidal today is a diagram editor with a backend (see
`2026-10-12-daidal-backend-design.md`). This roadmap turns it into something
closer to Mermaid: a format with meaning that renders anywhere, with the app
as one client among several.

The positioning: **opinionated diagramming**. draw.io, Miro and Lucid store
shapes; Daidal stores typed nodes, tags, views and boundaries. That is why
Daidal documents can render inside Confluence, a README or a docs site from a
code fence, and theirs cannot. The closest existing players are Structurizr
and IcePanel. Daidal's wedge against them:

- tag-driven views instead of hand-declared ones
- a small, hand-writable format (YAML or JSON)
- a renderer that looks current
- clone / follow / snapshot between diagrams, which neither has
- source-available (fair source, FSL-1.1-ALv2) and self-hostable with one Docker
  Compose file

Success means:

- `renderSvg(doc, { view })` runs in Node, a Worker and a browser with no DOM
  and produces an identical picture to the editor.
- A `.daidal.yaml` written by hand in a code fence renders; the same file opened
  in the editor, dragged around and saved still renders, with positions kept.
- A node can link to another diagram, and the static render carries that link.
- A node can declare itself the same entity as a node in another diagram, so a
  flow can be traced across diagrams.
- Someone outside the project can run Daidal from a tutorial in under an hour.

## Out of scope for this roadmap

- Live co-editing.
- Replacing Cloudflare for the hosted instance. The hosted deploy keeps Workers,
  D1 and Access; self-hosting adds alternatives beside them, not instead.
- A new DSL. YAML in a code fence is the hand-authoring surface.

## The format is the product

Everything below hangs off `.daidal.yaml` / `.daidal.json` version 1 (defined in
`app/src/lib/types.ts`, `DaidalDoc`). Two rules keep it fit for every client:

1. **The format is the only contract.** The editor, the static renderer, the
   CLI, the Confluence macro and every export read and write this document and
   nothing else. No client gets a private field.
2. **Positions are optional.** `layout` on nodes and boundaries becomes
   optional. A document without it renders through a deterministic auto-layout;
   a document with it renders exactly as placed. The editor always writes
   positions; hand-authored files usually omit them. This is the round trip
   neither Mermaid (no visual editing) nor Lucid (no hand authoring) offers.

Changes to the document in this roadmap are additive and stay at version 1
until something breaks an existing reader:

| Field | Where | Meaning |
|---|---|---|
| `layout` | node, boundary | now optional; absent means auto-layout |
| `links[].diagram`, `links[].view` | node | a typed link to another diagram (and optionally one of its views) in the same workspace |
| `ref` | node | `"<diagram id>#<node id>"`: this node is the same entity as that one |
| `kind` | diagram | already present; starts to drive the type palette and the Structurizr export mapping |

## Architecture

```
                  .daidal.yaml / .daidal.json
                           │
                 ┌─────────┴──────────┐
                 │   @daidal/core      │   parse · validate · toScene · layout · renderSvg
                 │   (no DOM, no fw)  │   themes · type/icon catalogue · export
                 └─────────┬──────────┘
      ┌──────────┬─────────┼──────────┬──────────────┬──────────────┐
   SvelteKit   Worker    CLI      web component   markdown        Confluence
   editor     /r/:id.svg  svg/png  <daidal-diagram>  plugins        Forge macro
                /render
```

`@daidal/core` is the whole bet. Every integration is a thin wrapper around it,
which is exactly how Mermaid reaches GitHub, Confluence, VS Code and every
docs generator with one library.

## Steps

Each step ships on its own and leaves `main` deployable.

### Step 1: `packages/core`

Move the already pure code out of the app and into a workspace package:

- `app/src/lib/types.ts` → `core/src/doc.ts` (the document types, plus a
  validator that returns readable errors with a path)
- `app/src/lib/diagram/model.ts` → `core/src/scene.ts` (`toScene`, `tagsOn`,
  `isHidden`, `bounds`)
- `app/src/lib/diagram/geometry.ts` → `core/src/geometry.ts` (edge routing)
- `app/src/lib/diagram/icons.ts` → `core/src/catalogue.ts` (types, flags,
  Phosphor paths)

Add:

- `parse(text: string): DaidalDoc` — YAML or JSON, detected by first
  non-blank character. YAML via the `yaml` package (no eval, no custom tags).
- `layout(scene): Scene` — fills missing positions. First version: a layered
  pass (dagre-style ranking over edges, boundaries kept as groups), falling
  back to the current grid when there are no edges. Deterministic for the same
  input.
- `renderSvg(doc, opts): string` — `opts = { view?, theme?: 'nocturne-dark' |
  'nocturne-light', width?, embedFonts?: false }`. Boundaries, edges with
  markers and labels, then node cards as `<g>` with `<rect>`, `<text>` and the
  icon paths. The Nocturne CSS variables resolve to literal colours per theme
  so the SVG stands alone. Ghosted nodes (tags off in the chosen view) render
  at the same opacity the editor uses. Text that does not fit truncates with an
  ellipsis using a width estimate; exact metrics are not needed for cards of a
  known size.
- Snapshot tests: every fixture in `app/src/lib/fixtures/docs.ts` and
  `stage/diagrams.ts` rendered per view, committed as `.svg`.

Then make `app/` and `worker/` depend on the package. The Svelte canvas keeps
its HTML nodes for interaction but takes scene, geometry and catalogue from
core, so the picture cannot drift between editor and renderer.

Publish as `@khorum/daidal-core` (or `daidal-core`), ESM, no dependencies
beyond `yaml`.

### Step 2: render endpoints on the Worker

- `GET /r/:diagramId.svg?view=Ops&theme=light` — the working copy of a
  diagram, rendered. Access still fronts the hostname, so this is for members;
  a signed share token for public image embeds can come later.
- `GET /r/:diagramId/:snapshotId.svg` — a snapshot, cacheable forever.
- `POST /render` with a YAML or JSON body → SVG. Stateless; the Confluence
  macro and the web component use it when they do not bundle core.

No headless browser anywhere: core produces the SVG string directly.

### Step 3: CLI

`daidal render diagram.daidal.yaml -o diagram.svg [--view Ops] [--theme light]`,
plus `--png` through `@resvg/resvg-js` (still no browser). `daidal validate`
and `daidal export --to mermaid|structurizr` (step 6) live in the same binary.
This is the docs-as-code and CI entry point, and the pre-commit hook that keeps
rendered SVGs next to their sources.

### Step 4: embedding

- `<daidal-diagram src="…" view="…">` and inline `<daidal-diagram>…yaml…</daidal-diagram>`
  as a web component bundling core. One `<script type="module">` tag.
- `markdown-it-daidal` and `remark-daidal`: a ```` ```daidal ```` fence becomes an
  inline SVG at build time. That covers Docusaurus, MkDocs, Astro, VitePress
  and Obsidian with little code each.
- A `<img src="https://…/r/<id>.svg">` already works anywhere HTML works once
  step 2 ships; this step is for people who want the source in the page.

### Step 5: Confluence

Cloud first, as a Forge app with a custom macro:

- Macro body: a `.daidal.yaml` document. Config fields: view, theme.
- v0 renders by `<img>` against `POST /render` on a Daidal instance the admin
  configures. Zero client code.
- v1 bundles core in the macro's Custom UI and renders client-side, so the
  macro works with no Daidal backend at all.

Data Center needs a Java plugin; the cheaper route there is the Kroki step
below.

### Step 6: linking diagrams and cross-diagram identity

Two additions to the document, both small:

- `links: [{ diagram: ledger, view: Ops }]` on a node. The editor shows a
  drill-down affordance; `renderSvg` wraps the card in `<a href>` pointing at
  the sibling render, so drill-down works in Confluence and READMEs with no
  runtime. The URL base comes from `opts.linkBase`.
- `ref: "ledger#payments-api"` on a node: this node is the same entity as that
  node. Core resolves refs across a set of documents (`resolve(docs)`), which
  gives: every diagram a node appears in, every edge into or out of it
  anywhere, and a flow trace that follows an edge through a `ref` into another
  diagram. The editor's inspector lists those; the hosted app can search them.

This is the increment that beats IcePanel's and Structurizr's
one-model-many-views without forcing a single model file. A later step can
derive a workspace-wide model from the refs if that ever becomes useful.

### Step 7: export and import

- **Structurizr DSL / workspace JSON.** Boundaries map to groups or software
  systems, tags to tags, a Daidal view to a Structurizr view with a tag-filtered
  include, and positions into the workspace JSON so layout survives. One table
  maps Daidal node types to C4 levels. That table is Daidal's opinion written
  down, so it lives in `core/src/catalogue.ts` beside the type list.
- **Mermaid.** One `flowchart` per view, boundaries as `subgraph`. Layout, tags
  and the view machinery do not survive; exporting per view is the honest
  version of that loss.
- **Import** from both formats matters at least as much as export: it is the
  migration path for anyone already on them. Structurizr import keeps
  positions when the workspace JSON has them; Mermaid import gets auto-layout.

### Step 8: Kroki backend

Contribute a Daidal companion service to Kroki once core is stable. That
inherits Kroki's Confluence Data Center, GitLab and docs integrations in one
move.

## Fair source and self-hosting

Publishing the source of core, the app and the Worker costs nothing
strategically: the format and renderer are the moat, and public source plus a
hosted instance is the shape Mermaid and Structurizr both run on.

All of it, core included, is under the Functional Source License with the
Apache 2.0 future license (FSL-1.1-ALv2, see `LICENSE.md`). Anyone can read,
use, change and self-host it; nobody can offer it as a competing hosted
product. Each release becomes Apache-2.0 two years after it ships. FSL is not
an OSI-approved license, so Daidal is fair source, or source-available, rather
than open source, and the docs say so.

Two changes make self-hosting a one-hour tutorial instead of a Cloudflare
account:

1. **Storage behind a small driver.** D1 is SQLite, so the queries already
   port. Put them behind an interface with a D1 driver (hosted) and a
   `better-sqlite3` / libsql driver (self-hosted). Postgres can come if anyone
   asks.
2. **Identity from a header, not from Access specifically.** Today the Worker
   verifies the `Cf-Access-Jwt-Assertion` token. Generalise to: a configured
   forward-auth proxy sets an identity header (`Remote-Email` or
   `X-Forwarded-Email`), and the server trusts it from the proxy's address
   only. Access, Authelia, Authentik and oauth2-proxy all fit that shape.

Then the self-host story is one `docker-compose.yml`: the Daidal image, a
volume for SQLite, and any forward-auth proxy of the user's choice. Tutorials
cover Access, Authelia and "no auth, single user on a LAN".

## Order and sizing

| Step | Depends on | Rough size |
|---|---|---|
| 1 core + renderSvg + auto-layout | — | the big one; renderSvg and layout are most of it |
| 2 render endpoints | 1 | small |
| 3 CLI | 1 | small |
| 4 embedding | 1 | medium (three small packages) |
| 5 Confluence v0 | 2 | small; v1 medium |
| 6 links + refs | 1 | medium (format, core resolve, editor UI, render) |
| 7 export / import | 1, 6 for refs | medium per format |
| 8 Kroki | 1, 3 | small, mostly process |
| self-host | — | medium; can run in parallel with any of the above |

Steps 2 and 3 can ship the same week as step 1. Step 6 is the first feature
step that changes what Daidal *is* rather than where it runs, and is worth
doing before export so the export carries refs.

## Risks

- **renderSvg drifting from the editor.** Mitigated by both reading scene,
  geometry and catalogue from core, and by snapshot tests on shared fixtures.
- **Auto-layout producing ugly diagrams.** Acceptable for v1: the point is
  that hand-written files render at all. Anyone who cares opens the editor,
  drags, and saves positions.
- **Text metrics in SVG.** Cards have fixed sizes; an estimate with ellipsis
  truncation is enough. Embedding a font is opt-in to keep SVGs small.
- **Confluence Cloud app review.** Forge apps for a private site need no
  Marketplace listing; a public listing can wait.
