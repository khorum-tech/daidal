# The Daidal config, for drawing

A config is a YAML (or JSON) map with up to seven sections. Only `nodes` is required.

Two habits keep Daidal's YAML reader from misreading a config:

- **No trailing comments.** It keeps a `# comment` after a value as part of it, so `x: 60 # left` reads as the text
  "60", and a `{ … }` map followed by a comment reads as text. A comment on a line of its own is fine.
- **Double-quote text with punctuation in it.** An unquoted apostrophe inside `{ … }` swallows the rest of the map
  (`notes: The bank's system, x: 900` reads as one long note and loses `x`), and a comma or colon splits it. Write
  `notes: "The bank's system of record."`.

```text
version      optional; Daidal reads version 1
diagram      optional: { kind, view }
tags         optional: colour-coded labels for nodes
views        optional: named sets of tags
nodes        required, at least one
edges        optional: connections (also accepted as `connections`)
boundaries   optional: containers that group nodes (also accepted as `containers`)
```

Any other top-level key is an error, and so is giving both `edges` and `connections`.

## Nodes

```yaml
- id: api
  name: Orders API
  type: service
  subtitle: Node 22
  notes: Takes and tracks orders.
  tags: [core]
  x: 340
  y: 80
```

- `id` (required, unique): what connections refer to.
- `name`: shown on the card; the id if there's none.
- `type`: one of the types below; `service` if there's none.
- `subtitle`: an optional second line (in C4, the technology).
- `notes`: optional; a C4 card shows it as its description, a note as its body.
- `tags`: optional, keys from `tags`.
- `x`, `y`: where the card's top-left corner goes. `w` and `h` are optional (190 and 88 by default).

`x`, `y`, `w` and `h` may also go under `layout:`. A card is 190 wide and 88 tall unless you say otherwise.

### Types

Write a type in lower case with dashes (`web-app`, `api-gateway`, `third-party-api`); the label works too. The icon
comes from the type.

- **Client:** web-app, mobile-app, desktop-app, cli, ide-extension, actor
- **AI:** ai-agent, llm, mcp-server, agent-tool, vector-store, embeddings, knowledge-base, prompt, guardrail, evaluation
- **Compute:** service, system, function, worker, scheduled-job, container, cluster
- **Data:** database, cache, object-storage, storage, data-warehouse, search-index, stream, feature-store
- **Messaging:** queue, topic, event-bus, relay, notification, email
- **Network:** edge, cdn, load-balancer, proxy, api-gateway, firewall, dns, vpn
- **Transfer:** ftp, sftp, file-share, webhook
- **External:** external, third-party-api, identity-provider, payment-provider
- **Operations:** telemetry, monitoring, log-sink, alerting, feature-flags, secrets-manager, ci-cd-pipeline
- **Code:** component, module, class, table, file
- **Annotation:** note (a sticky note: `name` is its heading, `notes` its body), text (a free label)

A type that isn't in the list still draws, with a generic icon, under the name you gave it.

## Placing nodes

Put cards on a grid so lines stay short and nothing overlaps:

- **Columns** at x = 60, 340, 620, 900, 1180 (280 apart).
- **Rows** at y = 80, 240, 400, 560 (160 apart).

Let the main flow run left to right along a row: who or what starts it on the left, stores and external systems on
the right. Put supporting pieces (queues, caches, workers, monitoring) on the row below the thing they serve. Keep a
diagram to five columns at most, so it stays readable at chat width. A node with no `x` and `y` falls into a plain
four-wide grid in the order listed.

## Connections

```yaml
- { from: api, to: db, label: writes }
- { from: api, to: q, label: publishes, line: dashed, route: angled, anchors: { from: bottom, to: top } }
```

- `from`, `to` (required): a node or container id.
- `label`: optional; keep it to a verb or two.
- `line`: solid (the default), dashed or dotted.
- `direction`: forward (the default), back, both or none.
- `width`: line width, 1.4 by default.
- `route`: curved (the default), straight or angled.
- `anchors`: optional `from` and `to` sides (left, right, top or bottom), with `:0.25` to pick a point along it.

Use `dashed` for something asynchronous (events, queues) and `dotted` for something optional or rare.

## Containers

A container is a box that groups nodes. It doesn't size itself, so give it a place that wraps its nodes: 30 to the
left of and above the first card, and 30 beyond the last card's right edge and 50 below its bottom edge, which leaves
room for the label.

```yaml
- id: cloud
  label: AWS us-east-1
  x: 310
  y: 50
  w: 530
  h: 168
  border: { style: dashed, width: 1 }
  labelPosition: inside-bl
```

That box wraps cards at (340, 80) and (620, 80): x is 340 - 30, y is 80 - 30, w runs to 620 + 190 + 30, and h to
80 + 88 + 50. `border.style` is dashed (the default), solid or dotted. `labelPosition` is `inside-` or `outside-`,
then `tl`, `tr`, `bl` or `br`; `inside-bl` by default.

With containers, leave a little more room between cards on either side of a container's edge.

## Tags and views

Tags colour-code nodes (a dot on the card). Views name a set of tags; showing a view leaves out the nodes with none
of its tags.

```yaml
tags:
  core: { label: Core, color: "#9184d9" }
  data: { label: Data, color: "#4fb3a9" }
views:
  - { name: Data, tags: [data] }
diagram: { view: Data }
```

`diagram.view` is the view to open on; the widget's `data-view` does the same.

A colour is `#rrggbb` (or `rgb()`/`hsl()` with plain numbers). A tag a node uses but `tags` doesn't define is made up
with a colour of its own.

## Kinds

`diagram.kind` changes how cards look:

- **freeform** (default): cards with an icon, type, name and subtitle.
- **c4-context**, **c4-container**, **c4-component**, **c4-code**: C4 notation. Cards show the name, the element line
  ("Container: Node 22", from `subtitle`) and the `notes` as a description, filled by role (person, system, container,
  store, component, external).
- **deployment**: where things run; cards look as in freeform.

For a C4 diagram, give each card `notes` of a sentence, and leave more room between rows (y 200 apart), since C4 cards
grow to fit their text.
