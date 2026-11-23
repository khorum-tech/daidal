---
name: daidal-diagram
description: Draws an architecture or system diagram inline in the chat as a Daidal diagram, from a Daidal YAML config, using Daidal's core renderer loaded from an npm CDN. Use when someone asks to draw, sketch, diagram or visualise a system, service map, data flow, C4 view or deployment, when they paste a Daidal config (.daidal.yaml or .daidal.json) and want to see it, or when they want to look at a diagram from their Daidal workspace without opening the app.
---

# Daidal diagrams, inline

Daidal draws architecture diagrams: nodes (services, databases, queues, people, AI agents…), connections between
them, containers that group them, and tags and views that colour and slice them. A diagram is a small YAML (or JSON)
config. This skill writes that config and draws it in the chat with Daidal's own renderer, so what the person sees is
the same picture the Daidal app would draw, and they can paste the config straight into Daidal.

The renderer is `@khorum/daidal-core`, version **0.3.0**: one dependency-free ES module that exports
`renderConfig(text, options)` and returns `{ svg, width, height, doc }`. It loads from jsDelivr (unpkg as the
fallback), the npm CDNs an inline visual may load scripts from. Daidal is fair source (FSL-1.1-ALv2); call it that,
or source-available, never open source.

## How to draw one

1. **Work out what to show.** One diagram answers one question ("how does an order reach the warehouse?"). Aim for
   3 to 15 nodes. With more than that, split it into two diagrams or use tags and views.
2. **Write the config.** Read [references/config.md](references/config.md) for the format: node types, how to place
   nodes so the picture reads well, containers, connections, tags, views and C4 kinds. Give every node an `x` and `y`
   on the grid it describes. Unplaced nodes fall into a plain four-wide grid in the order they're listed, which
   rarely reads well. Put no trailing `# comments` in it, and double-quote any text with an apostrophe, comma or
   colon in it: Daidal's YAML reader trips on both (the reference says how).
3. **Fill in the widget.** Copy [assets/widget.html](assets/widget.html) exactly, then change only three things:
   - the config, between the `<script type="text/plain" id="daidal-config">` tags;
   - `data-label`, to a short description of the diagram (screen readers read it out as the picture's name);
   - `data-view`, to a view's name if you want one shown (leave it empty for everything).

   Don't change the version, the CDN addresses, the styles or the script. The config must never contain `</`,
   which would end the script tag early. The picture keeps Daidal's own dark canvas in light and dark mode alike;
   that's expected, so don't restyle it.
4. **Show it** with the inline visual tool (the widget's HTML goes in as the widget code; its title is a short
   snake_case name such as `checkout_flow`). Put one diagram in each widget: the SVG's arrowheads use fixed ids.
5. **Offer the config.** After the picture, give the config in a fenced `yaml` block so the person can paste it into
   Daidal (the config dock, or `apply_config` through the Daidal connector). Keep the reply to a line or two plus the
   block; the picture is the answer.

If the widget shows an error instead of a picture, it names the problem and the line (for example `edges[2]: no node
or container with the id "cache"`). Fix the config and show it again.

If it says the renderer couldn't be loaded, the package isn't reachable from the CDN (not yet published at this
version, or the CDN is down). The widget then shows the config as text. Say so in one line and give the config
anyway; don't try another CDN or draw the diagram some other way.

## A diagram already in Daidal

With the Daidal connector (its tools are `list_workspaces`, `list_diagrams`, `get_diagram`…), read the diagram with
`get_diagram` asking for the whole config, and draw that config exactly as it comes back, without re-placing nodes.
Its layout is the person's own. To change it, draw the changed config and offer to apply it with `apply_config`
(mode `merge`); only apply it when they say so, since it saves straight to their diagram.

## Where there are no inline visuals

Where you can't show an inline visual but can publish an HTML page or write a file, put the same widget HTML in a
full page (add `<!doctype html>`, a `<meta charset="utf-8">` and a background) and offer that instead.

## A small example

```yaml
diagram:
  kind: freeform
nodes:
  - { id: web, name: Storefront, type: web-app, subtitle: SvelteKit, x: 60, y: 80 }
  - { id: api, name: Orders API, type: service, subtitle: Node, x: 340, y: 80 }
  - { id: db, name: Orders, type: database, subtitle: Postgres, x: 620, y: 80 }
  - { id: q, name: Order events, type: queue, x: 340, y: 240 }
  - { id: ship, name: Fulfilment, type: worker, x: 620, y: 240 }
edges:
  - { from: web, to: api, label: places order }
  - { from: api, to: db, label: writes }
  - { from: api, to: q, label: publishes }
  - { from: q, to: ship, label: consumes, line: dashed }
```
