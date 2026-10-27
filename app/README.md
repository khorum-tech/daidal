# Skope app (SvelteKit)

The SvelteKit port of the prototype, served under **`/app`** beside the prototype at `/`. It reads everything from
the Worker's API, and on a diagram you own it edits **nodes**: add one (the type picker, placed in free space near the
middle of the view), move, rename, change its type, flags, tags and links, duplicate or delete it (with its
connections). Every edit saves through the API and can be undone (⌘Z, ⇧⌘Z; ⌘D duplicates, Delete removes the
selected node). **Connections** too: drag the port on a selected node to another node (or onto empty canvas
for a new one), or click the port and then the target; on a phone, Connect in the node menu, then tap the target.
Tap a connection to edit its label, arrows, weight, line, route and which side each end leaves from, or to reverse
or delete it. **Containers** as well: add one from the Add menu, pick it by its border or label, drag the border to
move it (with whatever sits wholly inside, unless it is set to move alone) and the corner handle to resize it; on a
phone, Move or Resize in its menu, then drag anywhere. Its inspector sets the label and where it sits, the border,
and whether it carries its contents. **Tags and views** too: the tags panel saves the tags on now as a view, and
the chosen view can be renamed, re-saved with the tags on now, made the one the diagram opens on, or deleted;
**Manage tags** adds, renames, recolours, regroups and deletes tags, and a node's tag picker can make a new one. Solo
(the crosshair by a tag) shows one tag alone without saving anything. **Diagrams themselves** as well: **+ New
diagram** on a workspace starts an empty one; the diagram's name in the header opens what can be done with it
(rename, as its owner; copy it into a workspace of yours as a duplicate or as a follower of its snapshots; delete it,
as its owner); and the History panel takes a snapshot of the working copy, with a description. **Workspaces** too:
**+ New workspace** and **Import a backup…** on the home screen, and **Manage** (or **Members**) by a workspace's
name to rename it, add and remove members by email, export it as a backup, or delete it. The **toolbar** over the
canvas has undo and redo, Select and Connect (click a node, then the other end), one click to add a service,
database, queue, actor, note, free text or container, and **+ Add** for every other type. While a connection waits
for its other end, a click (or tap) on empty canvas makes a new node there for it. With a mouse, a double-click on
empty canvas adds a node with its name ready to type, and on a node renames it in place; the selected node's corner
handle resizes it, for a finger too. The magnet in the zoom bar switches snapping, remembered in this browser. **Many at once** too: shift-click
(or ⌘-click) adds a node or connection to the pick, a drag on empty canvas with shift held (or with the toolbar's
Multi-select on) draws a box that picks what it touches, and ⌘A picks every node. The inspector then changes the type
or tags of every picked node, or the arrows, weight, line and labels of every picked connection, each as one undo
step, and dragging any picked node moves them all. ⌘C, ⌘X and ⌘V copy, cut and paste nodes with the connections
between them and the tags they use, in the same diagram or another; ⌘D duplicates the pick, Delete removes it. On a
phone, **Select** in the bottom bar picks with taps (or a box), and its menu edits, moves or deletes them; Add offers
Paste once something is copied.
A **follower** reviews its lead's updates: each snapshot the lead took since the one it is synced to lists what it
changed (nodes, connections and containers added, removed or updated), and each change can be accepted (an
undoable edit, bringing in a node a connection needs) or skipped, or a whole snapshot at once; a verdict can be taken
back. **Mark everything reviewed** syncs to the lead's latest snapshot, the switch pauses following, and **Unlink**
stops it. The updates sit beside the canvas, and lead the History sheet on a phone. **Presenting** (Present in the strip, or in the
diagram's sheet) shows the canvas alone, full screen where the browser allows and read-only, with a node's notes, tags
and connections on hover (on a tap, on a phone) and the views to switch; Escape ends it. The diagram's sheet copies a
**link** to it, which can open on the view on now (`?view=Name`), and its owner can **lock editing on this device**
(kept in the browser: picking and views still work). A **view** can be locked too, in the document: it can still be
shown, not renamed, re-saved or deleted. The diagram's sheet also **exports an image**: a PNG (at twice the size) or an SVG of
the diagram as it shows now, drawn from the document in the canvas's colours (`src/lib/diagram/render.ts`), with
what the view switches off kept faintly or left out. The **config** (Config in the toolbar, or the diagram's sheet) is the
document as YAML or JSON, written and read as the prototype does (`src/lib/diagram/yaml.ts`): its owner edits it, or
drops or opens a `.skope.yaml` / `.skope.json` file, and applies it, replacing the diagram or merging it in (nodes by
id), as one undo step. A config that can't be read says why, with the line, and changes nothing. Anyone can copy or
download it.
**Profile** and **Appearance** (in the menu under your name) save your name and title to your account, and set how this
browser shows Skope (`src/lib/appearance.svelte.ts`, kept in the browser like the prototype's): a dark, light or
system theme; a colour-vision condition, which strikes the colours that collide under it from the tag colour pickers
and can be simulated over the whole app (an SVG colour matrix, `src/lib/diagram/colour.ts`); and **icon-only cards**
when presenting (also a switch in the presenting bar), each node drawn as its icon and name.

What's left to port, and the order it's planned in: [`docs/superpowers/specs/2026-10-26-skope-app-port-roadmap.md`](../docs/superpowers/specs/2026-10-26-skope-app-port-roadmap.md).

| Route | What it shows |
|-------|---------------|
| `/app/` | Your workspaces (yours and shared with you) and the diagrams in one (`?ws=<id>`, else your personal one), as the prototype's project cards, searched by `?q=` (diagram and node names). Cards come sixty at a time from one list request, drawn from the summary the server keeps for each diagram (`src/lib/diagram/summary.ts`), so no document loads here |
| `/app/d/:id` | One diagram on the canvas: views and tags (switching them only changes what you see), the selected node's details, the history (pick a snapshot to replay it), and where a follower stands against its lead |

The canvas handles every gesture itself, the same for a finger or a mouse: drag to pan, pinch or ctrl+scroll to zoom,
scroll to pan; arrow keys, `+`, `-` and `0` when it has focus. A tap (the browser's own click, which is what works
everywhere, Safari included) selects a node; a tap on empty space clears it. A mouse drags any node to move it. A
finger moves one through **Move** in the node menu: then a drag from anywhere moves the selected node, two fingers
still pan or pinch, and Done (or a tap on empty space) goes back to panning. A dragged node snaps into line with
its neighbours (`src/lib/diagram/snap.ts`, the prototype's rule), with a wider reach for a finger than a mouse;
Alt places it freely. Touch pointers are never captured: WebKit throws on `setPointerCapture` for them, and a
mouse is captured only once its drag has begun, so the click after a plain press still reaches the node. The view is a transform (`src/lib/diagram/zoom.ts`), so it
pans freely even at "fit", within limits that keep the diagram on screen. A move saves through `src/lib/saver.svelte.ts`
with the diagram's revision: moves close together go as one save, and if someone else saved in between the page says
so and offers to load theirs.

On screens 900 px wide or less the canvas gets the full width and the panels move behind a bottom toolbar (View,
History), opening as sheets. While a node is selected the toolbar becomes the node menu: Move, Details (a sheet)
and Done. The e2e `phone` project (`e2e/mobile.spec.ts`) keeps this working.

Components live in `src/lib/components/`. What they draw is worked out in `src/lib/diagram/`: `model.ts` turns a
`.skope.json` document into a scene the way the prototype's config import does, and `geometry.ts` routes
connections the way the prototype's canvas does. `icons.ts` is generated from the prototype's own tables.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server; proxies `/api` to `wrangler dev` on port 8787 (start that from the project root) |
| `npm run build` | Static build into `build/`; the root `npm run build` puts it under `dist/app/` beside the prototype |
| `npm run check` | Svelte and TypeScript checks |
| `npm test` | Unit tests (Node) and component tests (Chromium, via Playwright) |
| `npm run storybook` | Component stories on port 6006, with the accessibility panel |

Notes:

- SvelteKit 3 imports library code through the `#lib` alias (with the `.ts` extension for TypeScript files).
- Styling comes from the Nocturne design system (`src/lib/styles/nocturne.css`, the sheet the prototype uses)
  plus a little layout in `app.css`. Use its classes (`.btn`, `.tag`, `.card`) and tokens rather than new ones.
- The base path is `/app`, except under Vitest, where it would stop the browser test runner loading.
- Stories and tests use the invented `src/lib/fixtures/docs.ts`; the end-to-end tests (`../e2e/`) import the
  stage data (`../stage/diagrams.ts`) through the API. The repository is public: never real architecture.
