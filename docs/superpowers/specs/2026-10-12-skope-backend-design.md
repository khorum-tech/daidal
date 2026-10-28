# Skope backend: Workers + D1 + Cloudflare Access

Date: 2026-10-12
Status: approved 2026-10-12

## Goal

Skope is a diagram editor that today runs as a static HTML/JS bundle and keeps
everything in one `localStorage` blob. This design gives it a real backend so
that a small group (the owner and some friends) can sign in, keep their
diagrams on a server, and clone and follow each other's diagrams.

Success means:

- A signed-in user's diagrams survive a browser change or a cleared cache.
- The name and email shown in the app are the real signed-in user's.
- A workspace member can view, clone and follow another member's diagram, and
  accept or skip upstream changes, as the prototype already mocks.
- A push to `main` deploys the whole app with no manual steps.

## Decisions already made

| Decision | Choice |
|---|---|
| Hosting | One Cloudflare Worker serving the static bundle and `/api/*` |
| Database | Cloudflare D1 (SQLite) |
| Sign-in | Cloudflare Access in front of the hostname, email allowlist |
| Hostname | `skope.khorum-oss.org` (expected) |
| Storage unit | One JSON document per diagram |
| Permissions | Workspace membership; only the owner edits a diagram |
| Deploy | GitHub Actions; the home lab is not involved |
| Frontend | Step 1 ships the exported prototype bundle. From step 2 the frontend is a SvelteKit app built with `adapter-static`, with Storybook for its components. The prototype becomes the visual and behavioural reference |

## Out of scope

- Live co-editing of one diagram by two people.
- Per-diagram invite lists and public share links. The `shareAccess` and
  `shareRole` controls stay mocked.
- The network module (`networks`, `netDeact`, `curNet`). It keeps using
  `localStorage` until it gets its own design.
- Password login, signup and password reset. Access replaces all three.

## Architecture

```
browser ──▶ Cloudflare Access ──▶ Worker ──▶ D1
            (login, allowlist)    ├─ static assets from web/
                                  └─ /api/* (JSON)
```

Access handles login before a request reaches the Worker and attaches a signed
token in the `Cf-Access-Jwt-Assertion` header. The Worker verifies that token
on every `/api/*` request and takes the user's email from it. The browser never
sends an identity of its own.

### Repo layout

```
web/                      step 1: exported bundle. Step 3 on: replaced by the SvelteKit build output
app/                      step 3 on: SvelteKit source, Storybook, component tests
e2e/                      step 2 on: Playwright behaviour suite
worker/src/index.ts       route table
worker/src/auth.ts        Access token verification, current user
worker/src/db.ts          queries
worker/src/routes/*.ts    one file per resource
worker/test/              Vitest suites
migrations/0001_init.sql
wrangler.jsonc
.github/workflows/deploy.yml
```

## Data model

```sql
CREATE TABLE users (
  email       TEXT PRIMARY KEY,          -- from the Access token, lowercased
  name        TEXT NOT NULL,             -- defaults to the part before '@'
  title       TEXT NOT NULL DEFAULT '',
  settings    TEXT NOT NULL DEFAULT '{}',-- JSON: theme, palette, cvd, ...
  created_at  INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_email TEXT NOT NULL REFERENCES users(email),
  created_at  INTEGER NOT NULL
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,            -- no FK: a friend can be added before first login
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, email)
);

CREATE TABLE diagrams (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_email   TEXT NOT NULL REFERENCES users(email),
  name          TEXT NOT NULL,
  doc           TEXT NOT NULL,           -- working copy, JSON document
  rev           INTEGER NOT NULL DEFAULT 1,
  lead_id       TEXT REFERENCES diagrams(id) ON DELETE SET NULL,
  synced_snapshot_id TEXT,               -- last upstream snapshot merged or reviewed
  decided       TEXT NOT NULL DEFAULT '{}', -- JSON: per-change accept/skip verdicts
  paused        INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX diagrams_by_workspace ON diagrams(workspace_id);
CREATE INDEX diagrams_by_lead ON diagrams(lead_id);

CREATE TABLE snapshots (
  id           TEXT PRIMARY KEY,
  diagram_id   TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  author_email TEXT NOT NULL,
  doc          TEXT NOT NULL,            -- JSON document, never updated
  created_at   INTEGER NOT NULL
);
CREATE INDEX snapshots_by_diagram ON snapshots(diagram_id, created_at);
```

Notes:

- Settings live on the `users` row instead of a separate table, because there
  is exactly one settings object per user.
- Membership is keyed by email so the owner can add a friend who has not
  signed in yet. The owner is also inserted as a member, so one query answers
  "can this user see this workspace".
- Deleting a lead diagram sets `lead_id` to null on its followers. They become
  standalone copies.
- D1 limits a row to 2 MB. A diagram document is a few kilobytes, so this is
  not a practical constraint, but the API rejects documents over 1 MB.

### The diagram document

The document is the JSON form of the existing `.skope.yml` export, version 1:

```json
{
  "version": 1,
  "diagram": { "id": "...", "name": "...", "kind": "freeform", "view": "custom" },
  "tags": { "<tagId>": { "label": "...", "color": "#...", "group": "..." } },
  "views": [ { "name": "...", "tags": ["..."] } ],
  "nodes": [ { "id": "...", "name": "...", "type": "...", "tags": [], "layout": {} } ],
  "edges": [ { "from": "...", "to": "...", "label": "..." } ],
  "boundaries": []
}
```

The server treats the document as opaque apart from checking that it parses,
has `version: 1`, and is under the size limit. Diffing stays in the browser
(`diffSnaps`).

## Authentication and the current user

`auth.ts` does the following for every `/api/*` request:

1. Read `Cf-Access-Jwt-Assertion`. If it is missing, return `401`.
2. Verify the signature against the team's public keys
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), and check the
   issuer and that the audience matches the Access application's AUD tag.
   A failure returns `401`.
3. Lowercase the `email` claim and use it as the user id.

The team domain and AUD tag are plain Worker variables in `wrangler.jsonc`.
They are identifiers, not secrets.

For local development there is no Access. When the variable `DEV_USER_EMAIL`
is set, `auth.ts` skips verification and uses that email. It is set only in
`.dev.vars`, which is not committed and is not read in production.

`GET /api/me` creates the user on first sight, along with a personal workspace
named "Personal", and returns the user row.

"Sign out" in the user menu links to `/cdn-cgi/access/logout`.

## API

All bodies are JSON. Errors are `{ "error": "<message>" }`.

| Route | Who | Behaviour |
|---|---|---|
| `GET /api/me` | anyone signed in | Create on first visit; return `{email, name, title, settings}` |
| `PUT /api/me` | self | Update `name`, `title`, `settings` |
| `GET /api/workspaces` | self | Workspaces the user is a member of, with members |
| `POST /api/workspaces` | self | Create; caller becomes owner and member |
| `PATCH /api/workspaces/:id` | owner | Rename |
| `DELETE /api/workspaces/:id` | owner | Delete with its diagrams; the personal workspace cannot be deleted |
| `POST /api/workspaces/:id/members` | owner | Add by email |
| `DELETE /api/workspaces/:id/members/:email` | owner, or the member themselves | Remove, or leave; the owner cannot be removed or leave. The diagrams the member made there pass to the workspace's owner |
| `GET /api/diagrams?workspace=:id[&q=&limit=&offset=]` | member | List without documents, newest first: each with its card summary (`diagrams.summary`, kept on every write) and its lead's name if the caller can see the lead. `q` searches names and node names; `limit` is at most 200 |
| `POST /api/diagrams` | member of target | Create from a document, or clone with `{from, follow}` |
| `GET /api/diagrams/:id` | member | Full row including `doc` |
| `PUT /api/diagrams/:id` | diagram owner | Save `{doc, name, rev, synced_snapshot_id, decided, paused}` |
| `PATCH /api/diagrams/:id` | diagram owner, a member of the target | Move `{workspace}`: with its snapshots, keeping what follows it and what it follows |
| `DELETE /api/diagrams/:id` | diagram owner | Delete with its snapshots |
| `GET /api/diagrams/:id/snapshots` | member | History, newest last; documents included |
| `POST /api/diagrams/:id/snapshots` | diagram owner | Append `{label, doc}` |
| `POST /api/workspaces/import` | self | Create workspaces from a `skope-backup` file (added 2026-10-24) |
| `GET /api/workspaces/:id/export` | member | The workspace as a `skope-backup` file (added 2026-10-24) |

Rules:

- A diagram the caller cannot see returns `404`, not `403`, so ids do not leak.
- `PUT /api/diagrams/:id` must send the `rev` it loaded. If it does not match
  the stored `rev`, the server returns `409` with the current row, and the
  client tells the user the diagram changed in another tab. On success `rev`
  increases by one.
- Cloning copies the source's latest snapshot (or its working copy when it has
  no snapshots) into a new diagram owned by the caller. The caller must be a
  member of both the source's workspace and the target workspace. With
  `follow: true` the new row gets `lead_id` and `synced_snapshot_id`.
- A follower reads upstream changes by calling the lead's snapshots route.
  This works only while the follower is still a member of the lead's
  workspace; otherwise the route returns `404` and the client shows the
  diagram as no longer following.

## Client changes

The prototype saves edits as overlays on built-in demo data (`addedNodes`,
`deletedNodes`, `nodeOv`, and similar). The main client change is to make a
diagram document the unit that is loaded and saved.

| Prototype state | Where it goes |
|---|---|
| `profile` | `GET/PUT /api/me` |
| `theme`, `palette`, `cvd`, `cvdSim`, `iconMode` | `users.settings` |
| Node, edge, tag, boundary and view overlays; `createdDiags`; `names` | `diagrams.doc` |
| `history` | `snapshots` |
| `lead`, `synced`, `decided`, `paused` | columns on `diagrams` |
| `newWs`, `wsNames`, `wsMembers`, `diagWs` | `workspaces`, `workspace_members`, `diagrams.workspace_id` |
| `zoom`, panel open state, `screen`, `diagId`, `tool`, `filter` | stay in `localStorage` (per device) |
| `networks`, `netDeact`, `curNet`, `netSel` | stay in `localStorage` (out of scope) |
| `screen:'auth'`, `authEmail`, `authPass` | removed |

Behaviour:

- **Startup:** the app shows a short loading state, calls `/api/me` and
  `/api/workspaces`, then lists diagrams for the current workspace.
- **Saving:** the existing 400 ms debounce stays, but it sends
  `PUT /api/diagrams/:id` for the open diagram only.
- **Save failure:** the app shows a persistent "not saved" indicator and
  retries on the next edit. It does not discard the in-memory document.
- **Expired session:** a `401` from the API reloads the page, which sends the
  user through Access again.
- **Demo data:** a new user starts with an empty personal workspace. The
  template gallery stays client-side; creating from a template posts a new
  diagram.

## Build order

Each step is deployed before the next starts. Each gets its own plan.

> **Changed 2026-10-24:** the server's data layer was built ahead of the port, as a step of its own, matching
> Storybild's order ("Server data"). Migration `0002_diagrams.sql`, the workspace, diagram, snapshot, clone and
> follow routes in the API table, and an import/export of whole workspaces (`skope-backup`, see
> `worker/src/importer.ts`) are live; the stage seed runs that importer (`docs/stage.md`). Steps 4 and 5 below
> are therefore done on the server and remain for the client. The prototype still keeps diagrams in
> `localStorage`; the SvelteKit port wires each screen to the API.
>
> **Step 3 started 2026-10-24:** the SvelteKit app and Storybook (`app/`) are served at `/app` beside the
> prototype, read-only: the workspace and diagram lists, the canvas with views and tags, node details, history
> replay and follow status, all from the API. Editing, and moving the prototype off `/`, come next. Step 2's
> behaviour suite was not written first; the app has its own end-to-end tests (`e2e/`) instead.

1. **Pipeline and login.** Deploy the prototype bundle behind Access.
   `/api/me` replaces the mock login screen and the hard-coded profile.
2. **Pin the prototype's behaviour.** Write browser tests (Playwright) against
   the prototype that cover what the port must preserve: creating and editing
   diagrams, tags and views, export, snapshots, clone and follow, accept and
   skip. These tests are written to run against either frontend.
3. **SvelteKit app and Storybook.** Scaffold the SvelteKit project
   (`adapter-static`, output served by the Worker in place of `web/`), set up
   Storybook, and port the prototype screen by screen. Each ported screen
   reads and writes through the API from the start and must pass the step 2
   tests for that screen. The diagram API (create, list, load, save, delete)
   is built alongside the first screens that need it.
4. **Snapshots, clone and follow** on the server.
5. **Workspaces and members.**

The prototype is not restructured to store documents. That work happens once,
in the SvelteKit app. The "Client changes" table above still describes where
each piece of prototype state ends up; it is the port's data map.

The one-time import of an existing `skope.prototype.v1` blob is dropped unless
there is prototype data worth keeping when step 3 starts. The `.skope.yml`
export and import already move a diagram between the two.

## Deploy

`.github/workflows/deploy.yml`, on push to `main`:

1. Install dependencies and run the Worker tests.
2. `wrangler d1 migrations apply skope --remote`
3. `wrangler deploy`

Repo secrets: `CLOUDFLARE_API_TOKEN` (permission to edit Workers and D1 for
the account) and `CLOUDFLARE_ACCOUNT_ID`.

One-time manual setup in the Cloudflare dashboard:

- Create the D1 database and put its id in `wrangler.jsonc`.
- Add `skope.khorum-oss.org` as the Worker's custom domain.
- Create an Access application for that hostname with an email allowlist, and
  copy its AUD tag and the team domain into `wrangler.jsonc`.
- Turn off the Worker's `workers.dev` URL so there is no route around Access.

Migrations are forward-only and additive, because the deploy applies them
before the new Worker code goes live.

## Testing

Worker tests run with Vitest against a local D1:

- A request with no token, a bad signature, or the wrong audience gets `401`.
- A non-member gets `404` for a workspace's diagrams and snapshots.
- A member who is not the owner can read and clone a diagram but cannot save,
  snapshot or delete it.
- A stale `rev` gets `409` and does not change the row.
- Cloning with `follow` sets `lead_id` and `synced_snapshot_id`; deleting the
  lead clears `lead_id`.
- An oversized or unparsable document gets `400`.

Step 1's small prototype edits are checked by hand. From step 2 the frontend
has three layers of tests: the Playwright behaviour suite, component tests and
stories in Storybook, and unit tests for pure logic such as snapshot diffing.

## Resolved questions

- `khorum-oss.org` is already a zone in the Cloudflare account. The `skope`
  subdomain may already be set up; check for an existing DNS record or route
  on `skope.khorum-oss.org` before adding the Worker's custom domain, because
  an existing record blocks it.
- Any signed-in user can create their own workspaces.
