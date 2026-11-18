# Daidal app: what's left of the port

Date: 2026-10-26
Status: draft

## Goal

The SvelteKit app at `/app` replaces the prototype (`web/index.html`) one slice at a time, each slice a PR that
reads and writes through the D1 API. This doc lists what the prototype still does that the app doesn't, groups it
into slices, and suggests an order. When the last slice ships, `/app` becomes `/` and the prototype retires.

**Status:** every slice has shipped. The site root `/` now redirects to `/app`, and the prototype is retired
(2026-11-03, see `docs/security.md`); it stays in git history under `web/`. Dropping the `/app` prefix comes later.

Each slice keeps the habits of the ones before it:

- Pure document edits in `app/src/lib/diagram/edit.ts`, with unit tests; every edit goes through the History
  (undo and redo) and the Saver.
- Works the same with a finger as with a mouse. Each slice gets checked on an iPhone (WebKit, iPhone 15 Pro Max
  profile) as well as the desktop. Phone gestures go through the node, container or connection menus rather than
  hover or double-click.
- Component tests and stories for new components, and Playwright tests in `e2e/app.spec.ts` and
  `e2e/mobile.spec.ts`.
- The PR body carries a **Try it** list for stage (https://skope-stage.khorum-oss.org/app/), desktop and phone.

## Done so far

| Slice | What it covers |
|-------|----------------|
| Scaffold and reading | Workspaces and diagrams from the API, the canvas (pan, pinch, zoom, keys), views and tags as filters, history replay, follower status |
| Moving | Drag a node (Move in the phone menu), snapping into line, saves by revision with conflict handling |
| Nodes | Add (type picker, free spot), rename, type, flags, tags, links, duplicate, delete; undo and redo; ⌘D, Delete |
| Connections | Drag or click the port, tap the target or empty canvas for a new node; label, arrows, weight, line, route, sides; reverse, delete |
| Containers | Add, move (with contents or alone), resize, label, position, border |
| Tags and views | Save tags as a view, rename, re-save, default view, delete; Manage tags; solo |
| Diagrams | New diagram, rename, duplicate or follow copy, delete, take a snapshot |
| Workspaces | New workspace, import a backup, rename, members, export, delete |
| Toolbar and canvas tools (part of A) | Toolbar with Select, Connect and one-click adds; tap empty canvas to connect to a new node; double-click to add or rename; node resize; snapping toggle |
| Multi-select and the clipboard (B) | Shift-click, box select, ⌘A; bulk type, tags, connection styles, move, delete; ⌘C, ⌘X, ⌘V across diagrams, ⌘D; phone Select mode |
| Viewing and sharing (C) | Presentation mode with icon-only cards; lock editing on a device, or a view in the document; share links (`?view=`); PNG and SVG export; the config editor (YAML or JSON, replace or merge) |
| Profile and appearance (C and part of D) | Name and title; dark, light or system theme; colour-vision condition (thins the tag colour pickers) and its simulation |
| Home page summaries and search (D, E) | Cards drawn from a summary the server keeps with each diagram (one request, no documents), sixty at a time with Show more; search by diagram or node name, kept in the address |
| Templates and the edit list (D) | New diagram from the prototype's four templates, with or without their example nodes; this visit's edits under History, to roll back or forward to any of them |
| Canvas tools (the rest of A) | Drag a connection's end along its box to pin it (double-click for auto); a node's card on hover while editing; isolate a node's tags; a minimap to look around; fold the side panels away |
| Leave and move (E) | A member leaves a workspace (what they made there passes to its owner); a diagram's owner moves it, with its history, to another of their workspaces |
| Palettes (C) | Switch a diagram's tag palette (the prototype's four) in Manage tags, recolouring every tag as one undo step; colour pickers lead with that palette |
| Follow review (part of D) | Accept or skip each change of a lead's newer snapshots, or a whole snapshot; take a verdict back; mark everything reviewed; pause; unlink (server: `leadId: null` on save) |
| Presenting, locks and links (part of C) | Presentation mode with a hover (or tap) card and a view switcher; lock editing on a device; lock a view in the document; copy a link, optionally to a view (`?view=`) |
| Image export (part of C) | PNG and SVG of the diagram as it shows now, drawn client side from the document; ghosted nodes kept or left out |
| Config editor (part of C) | The document as YAML or JSON; edit, open or drop a file, apply by replacing or merging; copy and download `.daidal.yaml` / `.daidal.json` |

## What's left

Each item names the prototype handler to read for the behaviour (search `web/index.html` for `vals.<name>`), any
server work, and what a phone needs.

### A. Toolbar and canvas tools

The prototype's editor has a top toolbar; the app only has the **Add** picker in the strip. Keep the picker (it
works well, on a phone especially) and bring back the rest around it.

| Item | Prototype | Notes |
|------|-----------|-------|
| **Toolbar**: Undo, Redo, Select, Multi-select, Connect, one-click add for the common types, snapping on or off | the editor header | Undo and redo exist (⌘Z); this gives them buttons. On a phone the toolbar folds into the strip: Undo, Redo, Add, and an overflow menu |
| **Tap empty canvas while connecting** creates a node there and connects it | `canvasDown` with a connection pending | Dropping a port drag on empty canvas already does this; a click-the-port-then-click-empty currently cancels. Same on a phone after Connect |
| **Double-click empty canvas** adds a node with its name ready to type | `canvasDbl` | Phone: Add stays the way in; maybe a long press later |
| **Rename on the canvas**: double-click a node edits its name in place | `startRename`, `commitName` | Phone: Edit in the node menu stays the way in |
| **Resize a node** by a handle | node resize grab | Needs `w`/`h` on the node, left out when default. Phone: Resize in the node menu, as containers do |

### B. Multi-select and the clipboard

| Item | Prototype | Notes |
|------|-----------|-------|
| **Select many**: marquee drag, shift-click, ⌘A, Escape to clear | `mClear`, the multi panel | Phone: Multi-select in the toolbar, then tap to add or remove |
| **Bulk edits**: type, tags, delete, move; connection direction, weight, line and labels | `mTypeBtns`, `mTagChips`, `mDirBtns`, `mWidthBtns`, `mStyleBtns`, `toggleMLabels`, `deleteSel` | One undo step each. Moving many uses the same snapping as one |
| **Copy, cut and paste**: ⌘C, ⌘X, ⌘V, between diagrams too | the editor's key handler | Pasted nodes get new ids and keep the connections between them; tags that don't exist in the target get made. Phone: Copy and Paste in the menus |

### C. Viewing and sharing

| Item | Prototype | Notes |
|------|-----------|-------|
| **Presentation mode**: full screen, read-only, detail on hover | `enterPresent`, `exitPresent` | Phone: full screen with a tap for detail |
| **Lock**: a diagram or a view that can't be edited by mistake | `toggleLock`, `veToggleLock` | A lock in the document, so it applies to everyone |
| **Config editor**: the document as JSON or YAML, edit and apply; upload, drop or download a `.daidal.json` / `.daidal.yaml` | `toggleCfg`, `cfgApply`, `cfgUpload`, `cfgDrop`, `copyCfg` | Validate before applying; one undo step. Lines up with the format work in `2026-10-24-daidal-ecosystem-roadmap.md` |
| **Image export** (PNG and SVG) | `doExport` | Client side first; the ecosystem roadmap's render endpoints can take over later |
| **Share link**: copy a link to the diagram (or a view of it) | `openShare`, `copyLink`, `setAccess` | Copying a link for people already in the workspace needs nothing new. Public or embedded access needs server work (see the ecosystem roadmap's embedding step) |

### D. Diagrams and workspaces

| Item | Prototype | Notes |
|------|-----------|-------|
| **Follow review**: go through a lead's changes, accept or skip each, mark as synced, pause, unlink | `goTabUpdates`, `markSeen`, `togglePause`, `unlink` | The server already takes `decided`, `syncedSnapshotId` and `paused` on save. This retires the "Preview" badge's last caveat |

### E. Smaller gaps and server work

- **Networks** (the prototype's `Daidal-Network-Module`: shared workspaces across organisations, people search).
  Out of scope for the port; it needs its own design.
- **Hub docs.** `hestia-systems` `ops/mission-control/cloudflare-apps.md` still says the Daidal UI keeps diagrams in
  the browser.

## Suggested order

1. **Toolbar and canvas tools** (A). The most-used gap. Do tap-empty-while-connecting first, as it's small and
   people already hit it. Try it: connect by clicking the port and then empty canvas; double-click to add and type
   a name; rename in place; resize a node; toolbar undo and redo; on a phone, Connect then tap empty space.
2. **Multi-select and the clipboard** (B). Builds on the toolbar's Select and Multi-select. Try it: marquee a group
   and retag it; shift-click to add one; ⌘A and delete, then undo; copy into another diagram and paste.
3. **Follow review** (D). Closes the last thing only the prototype can do. Try it: follow a diagram, change and
   snapshot the lead, review the change on the follower, accept one and skip another, mark as synced.
4. **Viewing and sharing** (C), in the order presentation, lock, image export, config editor, then the viewer
   settings.
5. **The rest of D and E**: templates, search, profile, home page summaries, then the two server routes.

After step 3 the app does everything a person needs day to day, and `/app` can take over `/` with the prototype
kept at `/prototype` until step 5 lands.
