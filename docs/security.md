# Security and privacy

How Skope decides who sees what, what it keeps about people, and the settings outside this repository that it
relies on. Reviewed 2026-11-03; update this page with any change to sign-in, tokens, headers or what is stored.

## Who can reach it

1. **Cloudflare Access** stands in front of the whole site (`skope.khorum-oss.org`, and stage). Nobody reaches the
   Worker without passing its policy; a request without a sign-in, or with only a Skope access token, gets Access's
   own 401 or login page. There is no `workers.dev` or preview address (`workers_dev` and `preview_urls` are off),
   so nothing gets round Access.
2. **The Worker checks the Access sign-in itself** (`worker/src/auth.ts`): the `Cf-Access-Jwt-Assertion` JWT is
   verified against the team's keys (RS256, issuer, the application's AUD, expiry). A JWT without an email, such as an
   Access service token, is refused. `DEV_USER_EMAIL` signs you in only on `localhost`; never set it as a secret on
   stage or prod.
3. **Inside, the rules are the API's** (`workspaces.ts`, `diagrams.ts`): you see a workspace only as a member (any
   other is a 404); only a diagram's owner saves, snapshots, moves or deletes it; only a workspace's owner renames
   or deletes it and adds members. The MCP tools call the same API as the person, so the same rules hold for an AI.

## Personal access tokens

For AI clients and scripts on your own computer (`worker/src/tokens.ts`). `skt_` plus 256 random bits; only a
SHA-256 hash is stored; shown once. A token acts as its person, never more: **Read** tokens only read; **Read and
write** tokens may only make and save diagrams, take snapshots and save workspace types, never delete, move, change
members, import or export, or manage tokens. A token can be limited to some workspaces. 120 writes a minute.
Revoking works at once. Online, Access stops a request that carries only a token, so tokens matter only locally;
online clients sign in through Access (Managed OAuth, `docs/mcp.md`).

## In the browser

- **Headers** (`worker/src/headers.ts`, on every response; `dist/_headers` for static files): the page can't be
  framed by another site, content types aren't sniffed, referrers stay on the site, and camera, microphone and the
  like are off.
- **Content-Security-Policy** (the app page's own meta tag, from `kit.csp` in `app/vite.config.ts`): scripts only
  from the site and SvelteKit's one inline script by hash; nothing loads from anywhere else. The font is served with
  the app (`@fontsource/inter`), not from Google Fonts, so a page view tells no third party anything.
- **Diagram content is text**: names, notes and labels are never rendered as HTML; links get `https://` unless they
  have it, so a `javascript:` link can't run; tag colours must be colours (`isColor` in `model.ts`, checked on the
  server too), since they go into styles and exported SVG.
- **Kept in the browser**: appearance and panel settings in localStorage; the last copy (⌘C) for the tab only, in
  sessionStorage. No token, email or diagram is kept beyond that.
- The old prototype (`/prototype`) is retired: it ran older code on the same site, with the same sign-in.

## Limits

So that one person, or one runaway script, can't fill the database or make a shared workspace too big to load
(`worker/src/limits.ts`; each refusal says what to do):

| What | Limit |
|------|-------|
| Snapshots in one diagram's history | 200, and 20 MB in all (copy the diagram to start a fresh history) |
| Diagrams one person owns | 1000 |
| Workspaces one person owns | 50, besides the personal one |
| People in one workspace | 100 |
| A workspace export | 64 MB (move diagrams to another workspace) |
| Changes through a browser or OAuth sign-in | 300 a minute (autosave waits and carries on) |
| Changes through a personal access token | 120 a minute |
| One document | 1 MB; an import file 10 MB; an MCP request about 1 MB and 20 messages |

Import counts what a file brings against the same limits before writing anything. The end-to-end tests raise the per-person limits for their
local server with the `SKOPE_LIMITS` variable (`playwright.config.ts`); never set it on stage or prod.

## What Skope keeps about people

- Your email (from Access), your name and title if you set them, and your settings (appearance, tour progress).
- Workspace membership; who owns each diagram; who took each snapshot. Only a workspace's owner sees its member
  list (members see the owner and themselves); members see who owns a diagram and took a snapshot, as they need to.
  The MCP tools give the AI none of these emails: owners and authors come back as "you" or "another member".
- Your access tokens' names, scopes and when they were last used (never the token itself).
- No analytics, no third-party requests, no AI calls of its own (an AI client's model runs on the client's side).

**Your data**: Profile → **Download my data** (`GET /api/me/export`) gives one file with everything above that is
yours, its workspaces in the backup format. **Delete my account** (`DELETE /api/me`, confirmed with your email)
deletes your user, tokens, personal workspace, the workspaces you own (with their diagrams and history) and your
memberships; diagrams you made in someone else's workspace pass to its owner, and your snapshots there say "former
member". Access tokens can do neither.

Personal workspace ids contain the owner's email (`personal:<email>`), so it appears in URLs and Cloudflare's request
logs. Errors are logged without emails.

## Settings outside the repository

Check these when setting up a site, and after any change in Cloudflare:

- **Access application:** the policy allows only the people who should use Skope; no bypass rule; cookie
  **SameSite** Lax (or Strict) and **HTTP Only** on.
- **Managed OAuth** (for MCP): short access-token lifetime (5–15 minutes); allowed redirect URIs as narrow as you can
  (`https://claude.ai/*` for claude.ai connectors).
- **Zone:** HSTS on (SSL/TLS → Edge Certificates).
- **GitHub:** the Cloudflare API token is a secret; stage's deploy runs pull-request code, so it should use its own
  token (see the CI notes in `.github/workflows/deploy.yml`).
