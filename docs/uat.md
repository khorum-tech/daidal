# Skope app: user acceptance tests

A hand-run checklist of everything the app at `/app` does, on a desktop and on a phone. Run it:

- before `/app` takes over `/` (the cutover), and before any release that touches the editor;
- after a change to the canvas, saving, following or sign-in, at least for the sections it touches;
- when a bug is fixed: add a case for it under [Regressions](#regressions), so it stays fixed.

The automated tests (`npm test`, `npm run e2e`) cover most of this on Chromium. This list is for what they can't
see: how it looks and feels, Safari on a real iPhone, and the whole flow end to end on stage.

## How to run it

**Where:** stage, https://skope-stage.khorum-oss.org/app/, signed in as the stage owner. Stage resets to the data
below on every push to any PR, so start a run right after a deploy and don't push while it runs. Stage shows
whichever PR pushed last: check the PR's stage comment names the commit you're testing.

**Devices:**

| Code | Device | Browser |
|------|--------|---------|
| **D** | A laptop or desktop, window at least 1280 px wide | Chrome, and Safari for the sections marked *(Safari too)* |
| **P** | iPhone 16 Pro Max | Safari |

A case marked **D** or **P** runs on that device only; **D P** runs on both.

**Recording a run:** copy this file's tables into the PR or issue (or a dated file next to this one), and fill in
the result column: ✅ pass, ❌ fail (with what happened), ➖ not run. A failure gets an issue, and once fixed a line
under [Regressions](#regressions).

**Resetting mid-run:** cases that delete or move things change stage for the cases after them. They're marked ⚠,
and come last in their section where they can. To start over, push to the PR again (or re-run its `stage` job).

## The stage data

What a fresh stage holds, owned by the stage owner (the "you" below) unless it says otherwise.

| Workspace | Diagram | What it's for |
|-----------|---------|---------------|
| Personal | **edge-ingress** | 3 snapshots (First sketch, Add the web firewall, Second region) and a working-copy edit not yet snapshotted |
| Personal | **scratch-token-refresh** | A small freeform diagram |
| Platform team (shared with Priya and Dev) | **ledger-platform** | The main test diagram: 9 nodes, 9 connections, 2 containers, views Full system (default), Write path, Events, On call; snapshots Container view, Add the balance cache |
| Platform team | **edge-ingress (platform copy)** | Follows edge-ingress, synced to "Add the web firewall", so "Second region" waits for review; one change in it already skipped |
| Platform team | **ledger-platform (DR drill)** | Follows ledger-platform, up to date but **paused** |
| Payments (Priya's, shared with you) | **payment-flow**, **fraud-signals** | Someone else's diagrams: you can look and copy, not edit |

**ledger-platform's nodes:** Ledger Console, Edge Router, Postings Service, Journal DB, Identity, Balances
Service, Balance Cache, Collector, Ledger Stream. **Containers:** LEDGER CLUSTER · EU-WEST, and Storage (around
Journal DB and Balance Cache, which doesn't move its contents).

## 1. Signing in and the home page

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| HOME-0 | Open https://skope-stage.khorum-oss.org/ (the bare site), then https://skope-stage.khorum-oss.org/prototype | The bare site lands on the app at `/app/`; `/prototype` opens the old prototype, with whatever it kept in this browser | D P | |
| HOME-1 | Open https://skope-stage.khorum-oss.org/app/ in a fresh private window | Cloudflare Access asks you to sign in; after it, the home page shows your **Personal** workspace | D P | |
| HOME-2 | Look at the workspace list | Your workspaces (Personal, Platform team) and the shared one (Payments, "Shared by priya@example.com") | D P | |
| HOME-3 | Open **Platform team** | Three cards, each with a thumbnail of its layout, its kind, "9 nodes · 9 connections" (or its own counts), tag colour dots and when it was updated | D P | |
| HOME-4 | Look at the two copies' cards | **edge-ingress (platform copy)** says "Follows edge-ingress"; **ledger-platform (DR drill)** says "Follows ledger-platform · paused" | D P | |
| HOME-5 | Type `drill` in the search box | Only the DR drill card stays; the count says "1 diagram with “drill”"; the address has `?q=drill` | D P | |
| HOME-6 | Type `journal` | Both ledger-platform cards stay, each saying **Has Journal DB** | D P | |
| HOME-7 | Reload, then press Escape in the search box | The search survives the reload; Escape clears it and all three cards come back | D | |
| HOME-8 | Search for `nothing like this` | "Nothing matches …" with a note on what search looks through | D P | |
| HOME-9 | Tap the search box on the phone | The page doesn't zoom in | P | |
| HOME-10 | Click a card | The diagram opens | D P | |

## 2. Workspaces

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| WS-1 | **+ New workspace**, name it `UAT` | It opens, empty, with **+ New diagram** | D P | |
| WS-2 | In UAT, **Manage**: rename it `UAT run` | The name changes in the list and the heading | D P | |
| WS-3 | Add `someone@example.com` as a member, then remove them | They appear with the others, then go | D P | |
| WS-4 | **Export a backup** | A `uat-run.skope-backup.json` file downloads | D | |
| WS-5 | **Import a backup…** and pick that file | A new workspace "UAT run" appears, with a notice saying what came in | D | |
| WS-6 | Open **Personal**, then **Manage** | No members to change, and no delete: a personal workspace is only yours | D P | |
| WS-7 | Open **Payments**, then **Members** | You can see who's in it, but not change it; there's no delete | D P | |
| WS-8 ⚠ | In one of the UAT workspaces, **Delete workspace…**, then **Delete for good** | It asks first, then it's gone and you're taken home | D P | |
| WS-9 ⚠ | In **Payments**, **Members**, then **Leave this workspace…**, then **Leave the workspace** | It warns that what you made there stays with Priya, then you're taken home and Payments is gone from the list | D P | |
| WS-10 | In **Manage** on a workspace, **Types** → **+ Add a type**: `Billing Agent`, category `AI`, the **Robot** icon. Open a diagram in it and **+ Add** | **Billing Agent** is under AI in the type picker, drawn with the robot; a member sees it too; a type named `Database` redraws the built-in one in this workspace only | D P | |

## 3. Starting a diagram

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| NEW-1 | In Platform team, **+ New diagram**, name it, leave **Blank**, **Create diagram** | It opens empty, ready for **+ Add** | D P | |
| NEW-2 | Again, pick **Deployment topology**, tick **Include the example nodes** | It opens with four nodes inside a **VPC** container and the **Full system** view on | D P | |
| NEW-3 | Again, pick **C4 Context** without ticking the box | It opens empty, but its views (Full system, Core only) and tags are there | D | |
| NEW-4 | Look at the template picker on the phone | The choices fit the width, two to a row; the example-nodes box shows only once a template is picked | P | |

## 4. Looking around a diagram

Open **ledger-platform** for sections 4 to 14 unless a case says otherwise.

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| VIEW-1 | Open it | The canvas fits the diagram; nodes, connections with their labels, the two containers; the strip says when it was updated | D P | |
| VIEW-2 | Drag empty canvas; scroll; ctrl+scroll (or pinch) | It pans; it zooms around the pointer (or the pinch); the zoom bar shows the percentage | D P | |
| VIEW-3 | Click the percentage | It fits the diagram again | D P | |
| VIEW-4 | Click the canvas, then use the arrow keys, `+`, `-` and `0` | It pans, zooms and fits | D | |
| VIEW-5 | Pick the **Write path** view | Collector fades (ghosted), the rest stay; the view is marked | D P | |
| VIEW-6 | Switch a tag off, then **Everything** | What carries that tag fades; Everything brings it all back | D P | |
| VIEW-7 | Solo a tag (the button at the end of its row, "Solo …"), then press it again | Only that tag shows, then the switches come back as they were | D | |
| VIEW-8 | Rest the mouse on **Journal DB** a moment | Its card appears: type, name, notes, tags, connections. Moving away or pressing hides it | D | |
| VIEW-9 | Tap a node on the phone | It's selected, and the node menu replaces the bottom bar | P | |
| VIEW-10 | Use the minimap in the bottom-left: zoom in, then click its far corner, then drag on it | The canvas looks where you clicked, and follows the drag; the outline shows what's on screen | D | |
| VIEW-11 | Fold both side panels with the tabs at the canvas's edges, reload | Both stay folded; the tabs bring them back | D | |
| VIEW-12 | Check the phone has no minimap, edge tabs or end handles | None show; the bottom bar has the panels | P | |

## 5. Nodes

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| NODE-1 | **+ Add**, search `cach`, pick **Cache** | A new cache is added at a free spot, selected, with its details open | D P | |
| NODE-2 | Change its name, subtitle, notes, type, flags; add a link; add an existing tag and a new one | Each change shows on the card; the strip says Saving…, then Saved | D P | |
| NODE-3 | Reload | Everything from NODE-2 is still there | D P | |
| NODE-4 | Drag a node (on the phone: **Move**, then drag) | It moves, snapping into line with others (guides show); hold Alt to place it freely | D P | |
| NODE-5 | Switch snapping off with the magnet in the zoom bar, drag again, reload | No snapping; the setting is remembered | D | |
| NODE-6 | Drag a selected node's corner handle | It resizes, down to a minimum | D P | |
| NODE-7 | Double-click empty canvas, type a name, Enter | A node is added there with that name | D | |
| NODE-8 | Double-click a node's name, change it, Enter (or Escape to cancel) | It renames in place | D | |
| NODE-9 | Click a one-click type in the toolbar (for example the database icon) | A node of that type is added | D | |
| NODE-10 | ⌘D on a selected node, then Delete | A copy appears beside it; Delete removes the selected node and its connections | D | |
| NODE-11 | **Duplicate** and **Delete node** from its details (on the phone, its sheet) | The same, from the buttons | D P | |
| NODE-12 | **Isolate its tags** on Journal DB | Everything not tagged Data fades | D P | |
| NODE-13 | **+ Add**, open the **AI** group (or search `mcp`), pick **MCP Server**; then change its type to **AI Agent** | Each draws with its own icon (plugs, robot), not the cube; reload keeps the type | D P | |
| NODE-14 | On a node, **Icon** → search `vault` → pick **Vault**; reload; then **Use the type’s** | The card shows the vault; it's still there after the reload; the type's icon comes back | D P | |

## 6. Connections

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| EDGE-1 | Select a node, drag its **+** port onto another node | A connection is made and selected | D | |
| EDGE-2 | Drag the port onto empty canvas | A new node is made there, connected | D | |
| EDGE-3 | **Connect** in the toolbar, click a node, then empty canvas | The same, without the port | D | |
| EDGE-4 | On the phone, a node's menu, **Connect**, then tap another node (or empty space) | A connection (or a new connected node) | P | |
| EDGE-5 | In the connection's details: label, show label, arrows, weight, line, route, each end's side | Each change shows on the canvas and saves | D P | |
| EDGE-6 | **Reverse**, then **Delete** | The ends swap; then it's gone | D P | |
| EDGE-7 | Select the HTTPS connection, drag the end at Edge Router along its side | The end moves there and snaps to the quarters; its handle fills; the details name the side | D | |
| EDGE-8 | Double-click that handle | That end goes back to auto | D | |

## 7. Containers

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| BOX-1 | **+ Add**, then **labelled box** (or the container button) | A container is added | D P | |
| BOX-2 | Drag the LEDGER CLUSTER container by its border (on the phone, its menu's **Move**) | It moves with what's inside | D P | |
| BOX-3 | Drag the Storage container | It moves alone: it's set not to move its contents | D | |
| BOX-4 | Resize a container by its corner (on the phone, **Resize**) | It resizes | D P | |
| BOX-5 | Change its label, label position and border | Each shows on the canvas and saves | D P | |
| BOX-6 | Duplicate and delete a container | A copy, then it's gone; what was inside stays | D | |

## 8. Tags and views

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| TAG-1 | **Manage tags**: rename a tag, recolour it, move it to another group, add one, delete one | Each shows in the panel and on the cards; deleting takes it off its nodes and out of views | D P | |
| TAG-2 | Switch some tags, **+ Save the tags on now as a view**, name it | A new view with those tags | D P | |
| TAG-3 | Edit a view: rename it, re-save it with other tags, make it the default, delete it | Each works; the default opens first after a reload | D | |
| TAG-4 | Lock a view in its editor | It can still be shown, but not renamed, re-saved or deleted; unlocking brings that back | D | |
| TAG-5 | **Manage tags**, **Palette**: pick **Accessible**, then undo | Every tag is recoloured from Okabe–Ito, each keeping its place; the colour pickers now lead with it (**More colours** shows the rest); one ⌘Z puts the old colours back | D P | |

## 9. Many at once and the clipboard

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| MULTI-1 | Shift-click three nodes; or draw a box with **Multi-select** | They're picked together, and the side panel edits them all | D | |
| MULTI-2 | Change their type, add a tag to all, drag them together | Each is one undo step | D | |
| MULTI-3 | ⌘A, then Delete, then ⌘Z | Everything goes, then comes back | D | |
| MULTI-4 | Pick two nodes, ⌘C, open another diagram, ⌘V | They're pasted with the connection between them and the tags they use | D | |
| MULTI-5 | ⌘X, then paste back from **+ Add** | Cut, then pasted | D | |
| MULTI-6 | Press Escape with a sheet open while nodes are picked | The sheet closes; the pick stays | D | |
| MULTI-7 | On the phone: **Select** in the bottom bar, tap nodes, then use its menu to tag, move and delete them | Each works on all of them | P | |

## 10. Undo, history and snapshots

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| HIST-1 | Make three edits, then undo and redo with ⌘Z / ⌘⇧Z and the toolbar | Each steps back and forward; the buttons name the step | D P | |
| HIST-2 | Under History, **Edits this visit**: click the first edit, then the newest, then **As it was when opened** | It rolls back to just after that edit, forward again, then to the start; the current one is marked **Now** | D P | |
| HIST-3 | Pick the snapshot **Container view** | It replays on the canvas, read-only; **Working copy** brings you back | D P | |
| HIST-4 | **+ Take a snapshot**, describe it, save | It's added at the top of the history | D P | |

## 11. Following another diagram

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| FOL-1 | Open **edge-ingress (platform copy)** | It says it follows edge-ingress, with **Second region** to review (on the phone, the History button says "N to review") | D P | |
| FOL-2 | Accept one change and skip another, then take a verdict back | The accepted change lands on the canvas as an undoable edit; skipped ones are marked; taking back clears the mark | D P | |
| FOL-3 | Accept a connection whose node isn't here yet | The node comes with it | D | |
| FOL-4 | **Mark everything reviewed** | It's synced to the lead's latest snapshot; nothing left to review | D P | |
| FOL-5 | Open **ledger-platform (DR drill)**, switch following back on, then off again | It starts paused; the switch turns updates on and off, and saves | D | |
| FOL-6 ⚠ | **Unlink** on a follower, after it asks | It stops following; the card on the home page no longer says it follows | D | |
| FOL-7 | Copy ledger-platform as a **Follow** into Personal, change and snapshot the lead, open the follower | The new snapshot's changes are offered for review | D | |

## 12. Presenting, locking and sharing

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| PRES-1 | **Present** in the strip | Full screen (desktop), read-only, only the canvas and a bar with the name, the view and Exit | D P | |
| PRES-2 | Hover a node (on the phone, tap it) | Its card shows (docked at the bottom on the phone) | D P | |
| PRES-3 | Switch the view from the bar | The canvas follows | D P | |
| PRES-4 | Click the grid button in the bar | Every node becomes its icon and name, in the same places; clicking again brings back the cards | D P | |
| PRES-5 | Escape (or Exit) | Back to editing, with the view you picked | D P | |
| LOCK-1 | Diagram sheet (click the name in the header), **Lock editing on this device** | No editing: picking, views and tags still work; reload keeps the lock; unlock brings editing back | D P | |
| SHARE-1 | Diagram sheet, with the **Events** view on: **Copy link**, with and without **Open on the view** | The link opens the diagram (on the Events view when ticked) | D P | |

## 13. Export and the config

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| EXP-1 | Diagram sheet, **Download PNG**, then **Download SVG**, with and without keeping switched-off parts faintly | Files named after the diagram, drawn as the canvas shows it | D P | |
| CFG-1 | **</>** in the toolbar (on the phone, **Edit as YAML or JSON** in the diagram sheet) | The document as YAML; switch to JSON and back | D P | |
| CFG-2 | Change a node's name in the YAML, keep **Replace the diagram**, **Apply** | The canvas changes; one undo takes it back | D P | |
| CFG-3 | Break the YAML (an unclosed quote), **Apply** | It says what's wrong and on which line, and changes nothing | D | |
| CFG-4 | Drop (or open) a `.skope.json` file, pick **Merge it in**, **Apply** | Its nodes join by id; a summary says what changed | D | |
| CFG-5 | **Copy** and **Download .skope.yaml / .skope.json** | The text is copied; the file downloads | D P | |

## 14. Profile and appearance *(Safari too)*

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| APP-1 | Your name (or initial) in the header, **Profile**: change name and title, **Save profile** | "Saved", and the header shows the new name after it | D P | |
| APP-2 | **Appearance**, **Light**, then **Match system** | The whole app turns light (sheets included); Match system follows the device | D P | |
| APP-3 | Pick **Deuteranopia** | The note says how many colours are left; struck swatches fade; **Manage tags** offers fewer colours, with a note | D P | |
| APP-4 | Tick **Simulate it** | The whole app, sheets included, shows as that condition sees it | D P | |
| APP-5 | Reload | Theme and simulation are kept | D P | |
| APP-6 | Tick **Icon-only cards**, then present | Presenting starts with icon cards | D P | |
| APP-7 | Put everything back: **Full colour**, **Dark**, icon cards off | Back to normal | D P | |
| APP-8 | Your initial → **AI access**: name a token, **Read**, **Only some workspaces** → Payments, **Create token** | The secret shows once with **Copy**; the list shows it as Read, reaching Payments, never used | D P | |
| APP-9 | **Revoke…** on that token, then confirm | It leaves the list; a script using it gets "not valid or was revoked" | D P | |

## 15. Diagrams as a whole

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| DIA-1 | Diagram sheet: rename it | The header and the home card follow | D P | |
| DIA-2 | **Make a duplicate** into Personal | A copy, on its own from now on, opens | D P | |
| DIA-3 | Open **payment-flow** in Payments | Read-only: "Owned by priya@example.com"; no toolbar; you can copy it | D P | |
| DIA-4 ⚠ | **Move** a diagram to Personal from its sheet | The breadcrumb shows Personal; it's gone from the old workspace; its history and follows came with it | D P | |
| DIA-5 ⚠ | **Delete diagram…**, then **Delete for good** | It asks, then it's gone; copies that follow it keep what they have | D P | |

## 16. Saving

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| SAVE-1 | Make an edit and watch the strip | Saving…, then Saved | D P | |
| SAVE-2 | Open the same diagram in two tabs; edit in one, then edit in the other | The second says it changed somewhere else and offers to load the latest; loading it shows the first tab's edit | D | |
| SAVE-3 | Go offline (devtools), edit, come back online, **Try again** | "Couldn't save", then it saves | D | |
| SAVE-4 | Edit, then navigate away straight away | The edit is saved (check by reopening) | D | |

## 17. The phone as a whole

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| PHONE-1 | On every screen above, try to scroll sideways | The page never scrolls sideways | P | |
| PHONE-2 | Open each sheet (diagram, node, connection, container, views, history, workspace, profile) | Each slides up, fits the width, scrolls inside itself, and closes on × or a tap outside | P | |
| PHONE-3 | Tap into a text field in a sheet | The page doesn't zoom; the keyboard doesn't hide the field's button | P | |
| PHONE-4 | Turn the phone sideways | The layout follows | P | |

## 18. Docs

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| DOCS-1 | Your initial → **Docs**; open **Getting started**, follow a link in the text, then **Next** at the bottom | The contents list marks the page open; links and Next move between pages; the tab title names the page | D P | |
| DOCS-2 | On a phone, pick a page from the picker at the top; then open `/app/docs/nope` | The picker opens that page; a missing page says so and links to Getting started | P | |

## 19. The tour

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| TOUR-1 | As someone who's never seen it, open the home screen | A **New to Skope?** offer; **No thanks** hides it for good (reload to check) | D P | |
| TOUR-2 | Your initial → **Tutorial** | A practice diagram “Getting started” opens with the tour's card; each step rings the control it's about and moves on once you've done it (add, name, connect, container, tag, view, present) | D P | |
| TOUR-3 | Mid-tour, reload; then **End tour** | The tour carries on from the same step; after End tour it doesn't come back | D P | |

## 20. AI over MCP

| ID | Do | Expect | On | Result |
|----|----|--------|----|--------|
| MCP-1 | Locally: `npx wrangler dev`, make a Read-and-write token under AI access, run the Claude Code command it gives, then `claude mcp list` | `skope … ✓ Connected` | D | |
| MCP-2 | In Claude Code: “List my Skope diagrams, then add an MCP Server called Tools to <one> and connect <a node> to it” | It names your diagrams, makes the change, and the editor shows it after a reload (or offers to load the latest if open) | D | |
| MCP-3 | With a **Read** token, ask it to change something | It says the token can only read; nothing changes | D | |
| MCP-4 | Online (once Managed OAuth is on, see `docs/mcp.md`): add `https://<site>/mcp` as a claude.ai custom connector and sign in | It lists your workspaces as you | D | |

## Regressions

Bugs that were fixed, so they stay fixed. Add one whenever a bug is fixed: what to do, and what used to go wrong.

| ID | Do | Used to | On | Result |
|----|----|---------|----|--------|
| REG-1 | Open a workspace with hundreds of diagrams | The home page loaded every document and could fail to load at all | D | |
| REG-2 | Search for `100%` or `a_b` | `%` and `_` acted as wildcards | D | |
| REG-3 | Press Escape to close a sheet while nodes are picked | The pick was cleared along with the sheet | D | |
| REG-4 | Review a follower's node edit where the follower changed the notes | Accepting wiped the follower's notes; now only the changed fields are taken | D | |
| REG-5 | On the phone, a follower with updates | The update chip was clipped in the strip; updates now lead the History sheet | P | |
| REG-6 | Resize a node by its handle on the phone | The handle sat under the zoom bar | P | |
| REG-7 | In a node's details, type a link's label and address, then close the sheet (or tap elsewhere) without pressing **Add link** | The typed link was lost; it's now added as focus leaves the link fields | D P | |
| REG-8 | On the phone, add a node | It was only selected, and moving it took another tap on **Move**; it now starts in Move, so a drag places it | P | |
| REG-9 | On the iPhone, drag the canvas starting right at the screen's left or right edge | Safari took it as Back and left the diagram; now the canvas keeps the drag (a node right at the edge still takes a tap) | P | |
| REG-10 | On the phone, tap your initial in the header; on desktop, open your name's menu, then click elsewhere or press Escape | The phone menu didn't work; it's now a sheet from the bottom. The desktop dropdown never closed except from your name; a click elsewhere or Escape now closes it | D P | |
