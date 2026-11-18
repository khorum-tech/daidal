# Daidal kinds: C4 drill-down, cross-level identity and repo-aware AI

Date: 2026-11-05
Status: draft

## Goal

A diagram's `kind` today is a template choice that the summary records and
nothing else reads. This spec makes kinds change behaviour, starting with C4.

A **C4 set** becomes a navigable stack: Context → Containers → Components →
Code. A node at one level opens the diagram beneath it; the same element keeps
one identity across levels; and because it does, Daidal can notice when the
levels disagree (a container with no diagram beneath it, a dependency drawn in
Components that Containers never declared). At the lower levels a repository
can stand behind a diagram, and an AI builds and refreshes the diagram from the
code and from the other diagrams it links to.

Positioning: **the architecture diagram that stays true.** IcePanel sells C4
zoom. Structurizr sells model-as-code. CodeSee sold code-to-diagram and shut
down. Nobody sells linked C4 plus drift detection against the repository plus
bring-your-own AI through MCP.

Success means:

- From a Context diagram a reader reaches the Code diagram of any component in
  three clicks, and back, without knowing which diagrams exist.
- A C4 set with an undocumented container, an orphaned child or an undeclared
  dependency says so, in the editor and through MCP, before anyone reviews it.
- Claude Code (or any MCP client) run inside a repository produces a Containers
  diagram and one Components diagram per service, into an existing workspace,
  with a snapshot that names the commit, using only a skill and the existing
  MCP tools.
- Later: a push to a linked repository marks the diagrams behind it stale,
  visible from the Context level.

## Builds on

- `2026-10-24-daidal-ecosystem-roadmap.md`, step 6: `links` on a node
  (drill-down) and `ref` on a node (same entity as a node in another diagram).
  This spec uses those two fields and adds no parallel ones.
- `diagram.kind` in `DaidalDoc` (`app/src/lib/types.ts`), already written by
  templates and read by `summary.ts`.
- The MCP server (`worker/src/mcp/`) and personal access tokens
  (`docs/mcp.md`), which already let an AI write diagrams as the person.
- Follower/lead snapshots, which stay orthogonal: a child diagram may follow a
  lead, and nothing here reads or changes that.

## Out of scope

- A single workspace-wide model file. Identity stays per node (`ref`), as the
  roadmap decided; a derived model can come later if refs make one useful.
- Live co-editing.
- Daidal calling a model itself. Phases 1–3 use the client's AI through MCP;
  phase 5 (in-app AI) is sketched for sequencing only.
- Hosted billing, auth and tenancy. Nothing here depends on them; the paid
  parts land when a paid tier exists.

## Kinds

`diagram.kind` becomes an enumerated string with behaviour:

| kind | Level | Default palette | Children of its nodes |
|---|---|---|---|
| `freeform` (default, also `""`) | — | everything | any kind |
| `c4-context` | 1 | person, software system, external system | `c4-container` |
| `c4-container` | 2 | container types: service, web app, database, queue, … | `c4-component` |
| `c4-component` | 3 | component, module, library | `c4-code` |
| `c4-code` | 4 | class, function, table, file | — |
| `deployment` | — | nodes, regions, zones, infrastructure | `deployment` |

Kind drives three things and no more: which node types the Add menu shows
first (all remain reachable), which checks run (below), and what "Zoom in →
New diagram" creates. A kind can be changed on an existing diagram; nothing is
lost, only the defaults move.

The kind list and the type→level table live in `core/src/catalogue.ts` once
step 1 of the roadmap lands, beside the type list and the Structurizr mapping
(roadmap step 7), since all three are the same opinion written down. Until
then they live in `app/src/lib/diagram/` next to the templates.

Custom kinds per workspace are not in this spec. Workspace types already
exist; a workspace that needs its own level structure can use `freeform` with
its types and `links`.

## Drill-down

`links` (roadmap step 6) is the drill-down. This spec fixes its editor and MCP
behaviour:

- **Zoom in.** A node with a `links[].diagram` the viewer can see shows a
  zoom-in affordance (double-click, the node menu on a phone, ⌘↓). It opens the
  linked diagram at `links[].view` if given. A link to a diagram the viewer
  cannot see hides, as if absent — the same 404 rule as the API.
- **Breadcrumb.** The header shows the stack the reader came down:
  Context › Payments › Ledger API. Zoom out (⌘↑, the breadcrumb, the browser's
  back) returns to the parent with the originating node selected. The route
  carries the trail: `/app/d/<id>?from=<parentId>[,<grandparentId>…]`.
- **Zoom in → New diagram.** On a node with no link, in a C4 diagram, "Zoom in"
  offers to create the level below: a new diagram of the child kind in the same
  workspace, named after the node, seeded with the node as a boundary and its
  connected neighbours as external nodes (each with a `ref` back to the parent
  diagram's node), and the node gains the `links` entry. One affordance teaches
  the C4 levels to a reader who never read the C4 site.
- **Several links.** A node may link to more than one diagram (a system with a
  Containers diagram and a Deployment diagram). The affordance shows a chooser
  when there is more than one.

## Cross-level identity

`ref: "<diagram>#<node>"` (roadmap step 6) marks a node as the same entity as a
node elsewhere. Core's `resolve(docs)` gives, for an element: every diagram it
appears in, every edge into or out of it anywhere, and flow traces across
diagrams. This spec adds the C4 reading of it:

- A child diagram's boundary carries a `ref` to the parent node it expands.
  "Zoom in → New diagram" writes it; by hand it is settable in the inspector.
- The inspector gains **Appears in**: the diagrams that carry this element,
  each a link.
- `ref` targets are diagram id plus node id. The editor shows names; the
  document stores ids, so renames never break identity.

## Checks

Checks run on save for every diagram in a C4 set the saved diagram belongs to
(parent, children, siblings through `ref`), and on demand. Each check yields a
finding with a kind, the nodes involved and a suggested fix. The UX follows
Storybild's contradictions: propose, let the person decide, remember a
dismissal (per finding key) so it does not return unchanged.

| Check | Finding | Suggested fix |
|---|---|---|
| Container without a child | A `c4-container` node has no `links` to a `c4-component` diagram | Zoom in → New diagram |
| Orphaned child | A diagram's boundary `ref` points at a node that no longer exists | Re-point the ref, or unlink |
| Undeclared dependency | Components in two different containers connect, and their containers do not connect in the parent | Add the connection in the parent, or remove it here |
| Declared, unused | Two containers connect in the parent, and no component of either connects to the other | Remove, or mark the connection as declared-only (tag) |
| Name drift | Two nodes with the same identity (via `ref`) have different names | Rename one |
| Stale against code (phase 4) | The linked repository moved since the snapshot the diagram was last synced to | Ask the AI to refresh (phase 3 procedure) |

Findings are stored on the diagram (`decided`-style, as the follower review
already does for verdicts) so dismissals survive reloads, and summarised in the
list card and the breadcrumb (a count). MCP exposes them as `check_set`.

## Repo-aware AI

### Phase 3: the client's AI, through a skill

Claude Code and similar clients already run inside the person's repository
with read access, and Daidal already has a write-capable MCP. What is missing
is knowledge. A **skill** supplies it, shipped in this repository under
`skills/daidal/SKILL.md` and linked from the README and the in-app
*Connecting AI* page:

- The document format, as `get_diagram(format: yaml)` returns it, with one
  example per kind.
- The C4 conventions Daidal holds: what belongs at each level, how to name,
  what to leave out, when a thing is a container versus a component.
- The procedure: `list_workspaces` → choose or `create_diagram` the set →
  read the repository's build and deploy files (`package.json`,
  `build.gradle*`, `pom.xml`, `wrangler.jsonc`, compose files, Terraform,
  Kubernetes manifests) → emit the Containers diagram → for each container
  with a source folder, emit a Components diagram with a boundary `ref` to the
  container node and a `links` entry back → `apply_config` with `merge` →
  `take_snapshot("Generated from <sha>")`.
- The refresh procedure: compare the code to the current outline, propose the
  difference as a merge config, never `replace`, snapshot with the new sha.
- Limits it must respect: 1 MB per document, 120 writes a minute on a token.

Quality depends on the client's model and the repository's hygiene; the docs
say so. Cost to Daidal: none. This phase needs no new server code beyond the
MCP additions below.

### Phase 4: the repository linked in the app

- A **GitHub App** (installation-based, `contents: read`, `metadata: read`,
  webhook on `push` to the default branch), never a user's OAuth token. The
  installation id is stored per workspace; tokens are minted on demand from
  the app's private key, a Worker secret. Gitea follows the same shape
  (webhooks and API) and is tested against the homelab first.
- **Linked repository** on a `c4-component` or `c4-code` diagram: repository,
  path, branch. A snapshot records the commit sha it describes.
- **Drift.** A push marks the linked diagrams *moved since `<sha>`*. The list
  card, the breadcrumb and `list_diagrams` (`stale: true`) show it; the
  Context diagram aggregates the count from its children. The fix stays with
  the AI (the person's, by the phase 3 procedure).
- This is the paid part: it carries webhooks, repository metadata, ongoing
  operations, and it maps to the team buyer, who pays for staleness alerts,
  not for boxes.

### Phase 5: Daidal's own AI (sketch)

On drift, Daidal proposes the refresh itself, as a follower-style review the
owner accepts or skips. Prepaid credits; provider behind an interface. Not
designed here.

## MCP additions

| Tool | Does |
|---|---|
| `get_diagram` | outline gains `kind`, each node's `links` and `ref`, and the set's open findings count |
| `zoom_in(diagram, node[, which])` | the linked diagram's outline (chooser index when several) |
| `create_child_diagram(diagram, node, kind?)` | what "Zoom in → New diagram" does; returns the child's outline |
| `check_set(diagram)` | findings for the C4 set this diagram belongs to |
| `dismiss_finding(diagram, key)` | records a dismissal, as the person would |
| `list_diagrams` | gains `kind` (already) and, phase 4, `stale` |

All go through the same API as the app, under the same rules: owner-only
writes, 404 for what the person cannot see, token scopes as today.

## Data and API changes

- `DaidalDoc.diagram.kind`: unchanged shape, enumerated values above; `""` and
  unknown values read as `freeform`.
- `links` and `ref` on nodes: as the roadmap defines them. A boundary may also
  carry `ref`.
- `diagrams` table: no new columns for phases 1–3; findings and dismissals
  ride in the document (`findings`, `dismissed`) so exports carry them.
  Phase 4 adds `repo_links` (workspace_id, diagram_id, provider, repo, path,
  branch, installation_id, synced_sha, moved_at) and a `webhooks` route.
- `summary.ts`: `kind`, `childCount`, `findings` (count), later `stale`.

## Build order

| Step | Depends on | Size |
|---|---|---|
| 1 kinds: enum, palette defaults, kind switch in the inspector | — | small |
| 2 drill-down: `links` affordance, breadcrumb, route trail, zoom out | roadmap step 6 format | medium |
| 3 Zoom in → New diagram, with boundary `ref` and back-link | 1, 2 | small |
| 4 Appears in (inspector), from `resolve(docs)` | roadmap step 6 core | small |
| 5 checks 1–5 + findings panel + dismissals | 3, 4 | medium |
| 6 MCP: `zoom_in`, `create_child_diagram`, `check_set`, `dismiss_finding`; outline fields | 2, 5 | small |
| 7 skill: `skills/daidal/SKILL.md`, examples, docs page section | 6 | small (writing, not code) |
| 8 phase 4: GitHub App, linked repo, drift, Gitea | 5, a paid tier | large |

Steps 1–7 need nothing from auth, billing or tenancy and can run beside that
work. Step 7 is the launch demo for the public release: *an AI drew our
architecture from the repository in two minutes, then Daidal pointed at a
database nobody had documented.* Theming (Leyline) and the node design pass
slot after step 5, since kinds define what a theme must style.

## Risks

- **Checks that nag.** False positives make people dismiss everything. Start
  with the five above, all structural and cheap to verify by eye; add
  heuristics only with a dismissal rate to look at.
- **`ref` by hand is tedious.** Mitigated by "Zoom in → New diagram" writing
  refs automatically; hand-set refs are the exception.
- **Skill output quality.** Varies by model and repository. Examples in the
  skill, `merge` never `replace`, and a snapshot per generation keep a bad run
  reversible.
- **GitHub App review and key handling (phase 4).** Private key as a Worker
  secret, token minted per request, installation scoped to the org. Private
  apps need no Marketplace listing.

## Open questions

1. Should `deployment` diagrams link *up* to a `c4-container` set (a container
   deployed on a node) through `ref`, or stay a separate kind with `links`
   only?
2. Findings in the document versus a table: the document keeps exports whole;
   a table makes "all findings in this workspace" one query. Document first,
   table if the query is wanted.
3. Dismissal key: finding kind plus sorted node ids, or kind plus `ref`
   identity? The latter survives a node being redrawn.
