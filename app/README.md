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
and whether it carries its contents. Tags and views are still edited in the prototype.

| Route | What it shows |
|-------|---------------|
| `/app/` | Your workspaces (yours and shared with you) and the diagrams in one (`?ws=<id>`, else your personal one), as the prototype's project cards |
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
