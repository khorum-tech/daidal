---
title: Nodes
summary: Add, move, resize, rename and describe the boxes on the canvas.
order: 2
---

# Nodes

A node is one thing in your system: a web app, a service, a database, a queue, a person. Every node has a **type**, which picks its icon and the label above its name.

## Adding nodes

- **+ Add** in the toolbar opens the type picker: the common types first, then every type by category, with a search box. The new node lands in free space near the middle of the view.
- The toolbar's one-click buttons add a service, database, queue, actor, note, free text or container straight away.
- With a mouse, **double-click empty canvas** to add a node there with its name ready to type.
- While a connection waits for its other end, a click on empty canvas makes a new node there for it.

On a phone a new node starts in **Move**, so a drag places it straight away.

## Moving and resizing

- With a mouse, drag a node. It snaps into line with its neighbours (guides show where); hold **Alt** to place it freely. The magnet in the zoom bar turns snapping off.
- With a finger, select the node, tap **Move**, then drag from anywhere. **Done**, or a tap on empty space, goes back to panning.
- A selected node's corner handle resizes it.

## Details

Select a node to open its details (on a phone: the node, then **Edit**):

- **Name**, **subtitle** (owner, replicas, region…) and **notes**. Double-click a node's name on the canvas to rename it in place.
- **Type**: change it at any time. **Icon**: give this one node its own icon from the library, or go back to the type's. See [Types and icons](/app/docs/types-and-icons).
- **Flags**: small badges for a database, a cache or a message queue.
- **Tags**: which tags it carries. See [Tags and views](/app/docs/tags-and-views).
- **Links**: a label and an address, opened from the node's card.
- **Duplicate** (⌘D) and **Delete node** (Delete), which also removes its connections.

A mouse resting on a node shows its card: notes, tags and connections.

## Many at once

Shift-click (or ⌘-click) adds nodes and connections to the pick; a drag on empty canvas with Shift held draws a box that picks what it touches; ⌘A picks every node. The details then change the type or tags of every picked node at once, and dragging any of them moves them all. ⌘C, ⌘X and ⌘V copy, cut and paste nodes with the connections between them, in the same diagram or another.
