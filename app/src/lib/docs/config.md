---
title: The config format
summary: A whole diagram as YAML or JSON, to write by hand, generate, or merge in.
order: 10
---

# The config format

Every diagram is a document, and **Config** (in the toolbar, or the diagram's sheet) shows it as YAML or JSON. Its owner can edit it there, or drop or open a `.daidal.yaml` / `.daidal.json` file, and apply it:

- **Replace** makes the diagram exactly what the config says.
- **Merge** adds and updates: nodes and containers by `id`, tags by key, views by name, and connections that aren't there yet. Fields the config leaves out stay as they are.

Applying is one undo step. A config that can't be read says why, with the line, and changes nothing. This is also the format an [AI connected to Daidal](/app/docs/connecting-ai) uses for bigger changes.

![The config panel: the diagram as YAML, with Apply, Replace or Merge, and download](/app/docs-images/config.png)


## An example

```yaml
version: 1
diagram:
  name: checkout
  kind: C4
  view: Request path
tags:
  public: { label: Public, color: "#968ae0", group: Exposure }
  data: { label: Data, color: "#5fb3a1", group: Layer }
views:
  - name: Request path
    tags: [public]
nodes:
  - id: web
    name: Storefront
    type: web-app
    tags: [public]
    layout: { x: 60, y: 80 }
  - id: api
    name: Checkout API
    type: service
    subtitle: Kotlin · 3 replicas
    notes: Owns carts and orders.
    links:
      - { label: Runbook, url: "https://example.com/runbook" }
  - id: db
    name: Orders DB
    type: database
    tags: [data]
    flags: [db]
edges:
  - { from: web, to: api, label: HTTPS }
  - { from: api, to: db, line: dashed }
boundaries:
  - id: vpc
    label: Production VPC
    layout: { x: 280, y: 40, w: 520, h: 260 }
```

## Fields

**`diagram`**: `name`, `kind` (`freeform`, `c4-context`, `c4-container`, `c4-component`, `c4-code` or `deployment`; see [Types and icons](/app/docs/types-and-icons)), `view` (the view it opens on).

**`tags`**: a map from a key to `{ label, color, group }`. Tags a node uses that aren't defined here are made up for you.

**`views`**: a list of `{ name, tags, locked }`.

**`nodes`**: a list. Each needs an `id`; the rest are optional:

| Field | What it is |
|-------|------------|
| `name` | The label (defaults to the id for a new node) |
| `type` | A type, written slugged: `web-app`, `api-gateway`, `ai-agent`, or one of your workspace's |
| `icon` | An icon from the library, in place of the type's |
| `subtitle`, `notes` | Text |
| `members` | A list of what it holds, one a line on its card: a class's fields, a file's exports. Makes the card a code block |
| `columns` | A table's columns, each a map of `name`, `type` (its data type) and `key` (`pk`, `fk` or `unique`), or a line such as `PK id: uuid`. On a Table, makes the card a table block |
| `functions` | A list of what it can do, each a map of `name`, `params` (a list of `{ name, type }`), `returns` and `notes`, or a signature such as `check(batch: Batch): Verdict`. Drawn as signatures under the members. Makes the card a code block |
| `language` | What a code block is written in: `java`, `kotlin`, `typescript`, `javascript`, `python`, `ruby`, `go`, `rust`, `csharp` or `swift`. Its functions read as that language writes them; without one, in a neutral form (`check(batch: Batch) → Verdict`) |
| `path` | Where it lives: a file path, or a link to the source. Also makes the card a code block |
| `flags` | Any of `db`, `cache`, `mq` |
| `tags` | Tag keys |
| `links` | A list of `{ label, url }` |
| `layout` | `{ x, y, w, h }`; plain `x` and `y` on the node work too. Left out, the node is placed in a grid |

**`edges`** (or `connections`): a list of `{ from, to }` (node or container ids), with optional `label`, `showLabel`, `line` (`solid`, `dashed`, `dotted`), `direction` (`forward`, `back`, `both`, `none`), `width`, `route` (`curved`, `straight`, `angled`) and `anchors` (`{ from: "left:0.25", to: "top" }`).

**`boundaries`** (or `containers`): a list of `{ id, label, layout: { x, y, w, h } }`, with optional `border: { width, style }`, `moveContents` and `labelPosition`.

Any other section is refused, so a misspelt one doesn't go missing without a word.
