# Security and privacy

How Daidal decides who sees what, what it keeps about people, and the settings outside this repository that it
relies on. Reviewed 2026-11-26; update this page with any change to sign-in, tokens, headers or what is stored.

## Who can reach it

1. **Cloudflare Access** stands in front of the hosted site (`daidal.khorum.org`, the old `skope.khorum-oss.org`, and stage). Nobody reaches the
   Worker without passing its policy; a request without a sign-in, or with only a Daidal access token, gets Access's
   own 401 or login page. There is no `workers.dev` or preview address (`workers_dev` and `preview_urls` are off),
   so nothing gets round Access.
2. **The Worker checks the Access sign-in itself** (`worker/src/auth.ts`): the `Cf-Access-Jwt-Assertion` JWT is
   verified against the team's keys (RS256, issuer, the application's AUD, expiry). A JWT without an email, such as an
   Access service token, is refused. `DEV_USER_EMAIL` signs you in only on `localhost`; never set it as a secret on
   stage or prod.

   A self-hosted Daidal can sign people in other ways too (`docs/sign-in.md`, `worker/src/signin/`): OpenID
   Connect, Google and GitHub through Daidal's own sign-in page, a forward-auth proxy, or a plugin package. Those
   sign-ins always use PKCE (S256), a one-time `state` bound to the browser by a `__Host-` cookie, and (for OpenID
   Connect) a nonce and full ID-token checks; only a verified email is accepted, and only for people
   `DAIDAL_AUTH_ALLOW` lists (unset, nobody). A sign-in returns only to a page of the app. Sessions are a random
   256-bit token in a `__Host-daidal-session` cookie (HttpOnly, Secure, SameSite=Lax, 30 days) with only its SHA-256
   hash stored, so signing out, signing out everywhere and deleting the account end them on the server at once.
   Changes made with that cookie must come from Daidal's own pages (`Origin` or `Sec-Fetch-Site`), or get a 403.
   Forward-auth headers count only from the configured proxy addresses. With nothing configured, the hosted site
   is Access alone, as before.
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
local server with the `DAIDAL_LIMITS` variable (`playwright.config.ts`); never set it on stage or prod.

## What Daidal keeps about people

- Your email (from Access), your name and title if you set them, and your settings (appearance, tour progress).
- Workspace membership; who owns each diagram; who took each snapshot. Only a workspace's owner sees its member
  list (members see the owner and themselves); members see who owns a diagram and took a snapshot, as they need to.
  The MCP tools give the AI none of these emails: owners and authors come back as "you" or "another member".
- Your access tokens' names, scopes and when they were last used (never the token itself).
- Where you sign in through Daidal's own sign-in page: which provider ids your account is linked to and when each was
  last used, and your sessions (provider, start, end, last use; never the token itself).
- No analytics, no third-party requests, no AI calls of its own (an AI client's model runs on the client's side).

**Your data**: Profile → **Download my data** (`GET /api/me/export`) gives one file with everything above that is
yours, its workspaces in the backup format. **Delete my account** (`DELETE /api/me`, confirmed with your email)
deletes your user, tokens, sign-in sessions and linked sign-ins, personal workspace, the workspaces you own (with their diagrams and history) and your
memberships; diagrams you made in someone else's workspace pass to its owner, and your snapshots there say "former
member". Access tokens can do neither.

Personal workspace ids contain the owner's email (`personal:<email>`), so it appears in URLs and Cloudflare's request
logs. Errors are logged without emails.

## Settings outside the repository

Check these when setting up a site, and after any change in Cloudflare:

- **Sign-in page providers** (self-hosted only): each provider's callback registered as exactly
  `https://<site>/auth/callback/<id>`; client secrets as Worker secrets (`DAIDAL_AUTH_SECRET_<ID>`), never in
  `DAIDAL_AUTH_PROVIDERS`; `DAIDAL_AUTH_ALLOW` as narrow as you can.
- **Access application:** the policy allows only the people who should use Daidal; no bypass rule; cookie
  **SameSite** Lax (or Strict) and **HTTP Only** on.
- **Managed OAuth** (for MCP): short access-token lifetime (5–15 minutes); allowed redirect URIs as narrow as you can
  (`https://claude.ai/*` for claude.ai connectors).
- **Zone:** HSTS on (SSL/TLS → Edge Certificates).
- **GitHub:** prod's Cloudflare token is in the `Prod` environment, limited to `main`; stage has its own
  (`STAGE_CLOUDFLARE_*`), ideally in a separate Cloudflare account (`docs/stage.md` → *Tokens*). Actions are pinned
  by commit and kept current by Dependabot (`.github/dependabot.yml`).
