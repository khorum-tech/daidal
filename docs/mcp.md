# The Daidal MCP server

> Connecting Claude or another assistant? The in-app docs page **Connecting AI** (`/app/docs/connecting-ai`) is the
> user guide. This page covers how the server works and how to turn it on for a site.

`/mcp` lets an AI client read and edit your diagrams as you, through the same rules as the app. It is built the
way Storybild's is (its `docs/mcp.md`): MCP's Streamable HTTP, answering each request with plain JSON (no event
stream, no session), in `worker/src/mcp/`. A client signs in one of two ways:

- **Through Cloudflare Access (online).** `/mcp` stays behind the site's Access application, like the rest of
  Daidal. With **Managed OAuth** turned on for that application, MCP clients (claude.ai, Claude Desktop, Claude
  Code) sign in the same way you do in a browser and act as you. Strangers are stopped at Cloudflare's edge.
- **With a personal access token (locally, and scripts).** Make one in Daidal under your initial → **AI access**.
  **Read** tokens only look; **Read and write** tokens can also make and change diagrams. A token can be limited to
  some workspaces. Tokens are kept only as a hash (`access_tokens`, migration 0005; `worker/src/tokens.ts`).

## Tools

| Read | Write |
|---|---|
| `list_workspaces`: yours, with members and their own types | `create_diagram`: blank, from a config, or from a template |
| `list_types`: the node types a workspace offers | `apply_config`: merge or replace from a YAML/JSON config |
| `list_diagrams`: a workspace's diagrams, searchable | `add_node`, `update_node`, `remove_node` |
| `get_diagram`: an outline, or the whole config | `connect`, `update_connection`, `remove_connection` |
| `list_snapshots` | `add_container` (sized round nodes), `update_container` |
| | `tag_nodes`, `save_view`, `take_snapshot` |

A tool acts as you, through the same API as the app:

- It never does more than you may: only a diagram's owner changes it; a workspace you're not in doesn't exist to it.
- Edits use the app's own edit functions (`packages/core/src/edit.ts`), so a node an AI adds is placed and named
  as the editor would place it. Each change loads the diagram, applies the edit and saves with the revision it
  loaded; if someone saved in between, it applies the same edit once more to what they saved.
- No tool deletes a diagram, moves one, changes members, imports or exports, or touches tokens or your profile.
- With a personal token: a Read token's writes are refused; a token limited to some workspaces sees only those; at
  most 120 changes a minute.
- Requests are capped at a little over 1 MB, the size of the largest diagram.

Someone with the diagram open in the editor is told it changed somewhere else and can load the latest.

## Connecting a client

**Online (stage or prod, once Managed OAuth is on; see below).** The address is `https://<site>/mcp`, which the AI
access tab shows.

- **Claude Code:** `claude mcp add --transport http daidal https://<site>/mcp`, then `/mcp` in Claude Code and
  authenticate `daidal`: a browser opens on the Cloudflare Access sign-in.
- **claude.ai, Claude Desktop, Claude mobile:** add a custom connector with the same address and sign in when it
  asks.
- Stage's data resets on every push to any PR.

**Locally:** `npx wrangler dev --var DEV_USER_EMAIL:you@example.com` serves `http://localhost:8787`, signed in as
that email, with no Access. Make a token under AI access there; it shows the command:

```sh
claude mcp add --transport http daidal http://localhost:8787/mcp --header "Authorization: Bearer skt_…"
```

`claude mcp list` should then say `daidal: … - ✓ Connected`.

## Turning it on (Cloudflare dashboard, once per site)

Do stage first (`daidal-stage.khorum.org`), try the clients there, then prod (`skope.khorum-oss.org`).

1. In Zero Trust, **Access controls → Applications**, find the site's existing self-hosted application, **⋯ → Edit**.
   Don't create a new one, and don't add a bypass.
2. On **Advanced settings**, turn on **Managed OAuth**, then:
   - **Allow localhost clients:** on (Claude Code signs in through a `localhost` callback).
   - **Allow loopback clients:** on, for clients that use `127.0.0.1`.
   - **Allowed redirect URIs:** `https://claude.ai/*`, for connectors added in claude.ai (Desktop and mobile use
     them too).
   - **Access token lifetime** 5–15 minutes and **Grant session duration** 1–2 weeks, as Cloudflare suggests for
     agents.
3. **Save**, then re-open the application to check Managed OAuth stayed on.
4. Keep the application's policy as it is. Managed OAuth signs clients in as a person, so the same policy decides
   who may.

**Check it from a terminal:**

```sh
curl -si -X POST https://<site>/mcp | head -5
```

- Working: `401` with a `WWW-Authenticate: Bearer realm="OAuth", …, resource_metadata="https://<site>/.well-known/…"`
  header. That 401 comes from Cloudflare Access, before the Worker: a request without a sign-in never reaches Daidal.
  (Locally, with no Access, the Worker answers `realm="daidal"` itself.)
- A `302` to `…cloudflareaccess.com/cdn-cgi/access/login/…` means Managed OAuth isn't in effect; Claude Code then
  reports "Unexpected content type: text/html".
- `https://<site>/.well-known/oauth-authorization-server` returns JSON once it's on.

## Cost

Daidal makes no AI calls: the client's own model does the work, under the client's plan. The outline keeps that
model's context small; the whole config only comes when asked for.
