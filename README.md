<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/daidal-mark-dark.svg">
  <img src="docs/brand/daidal-mark-light.svg" alt="" width="56">
</picture>

# Daidal

**The architecture diagram that stays true.** Typed nodes, tags, views and boundaries instead of loose shapes; a
small YAML/JSON format an AI can read and write; and C4 levels that link to each other, one element keeping its
identity from level to level.

![A one-minute tour of one freeform diagram: tags switched off to fade what isn't needed, one tag soloed, saved views a click apart, a new view saved from the tags on, and a node's tags isolated](docs/demo/tour.gif)

<sub>[The same tour as a video](docs/demo/tour.mp4) · [C4 drill-down, in 35 seconds](docs/demo/c4.gif) · [how they are recorded](docs/demo.md)</sub>

Say it *DYE-dal* — after Daidalos, the architect who could still find his way out of the labyrinth.

> **Status:** source-available (fair source), early. The hosted instance is invite-only while sign-in moves off
> Cloudflare Access. Self-hosting works today on a Cloudflare account. The name changed from *Skope* on 2026-11-08.
> The hosted site's address (`skope.khorum-oss.org`) and the Cloudflare Worker and D1 database names still say
> `skope`, by choice; stage answers at `daidal-stage.khorum.org`. Files saved before the rename still open and
> import.

<!-- TODO: hero GIF — a diagram being edited, then Claude adding a node through MCP. docs/media/hero.gif -->

## What it does

- **Opinionated diagrams.** Services, databases, queues, people, AI agents and your own workspace types; connections
  with labels, arrows and routes; containers that carry what sits inside them; tags that colour-code; views that show
  a slice. See [`docs/features.md`](docs/features.md) for the full editor.
- **History and lineage.** Snapshots with descriptions; copy a diagram as a duplicate or as a *follower* that reviews
  its lead's changes one by one.
- **Workspaces.** Personal and shared, with members, import/export as a backup file, and per-workspace node types.
- **C4 and drill-down.** Context, Container and Component diagrams in C4 notation, and Code diagrams of code
  blocks; a node zooms into the level below, and each element keeps one identity across levels (`ref`). The in-app docs page *C4 and drill-down*
  ([`app/src/lib/docs/c4.md`](app/src/lib/docs/c4.md)) walks through it.
- **AI through MCP.** `/mcp` exposes the same API the editor uses, under the same rules, so Claude (or any MCP
  client) lists, reads, creates and edits diagrams as you. [`docs/mcp.md`](docs/mcp.md).
- **Renders anywhere.** The document, scene model and SVG renderer are one dependency-free package on npm,
  [`@khorum/daidal-core`](https://www.npmjs.com/package/@khorum/daidal-core), and a Claude skill uses it to draw a
  diagram inline in the chat. See *Draw a diagram anywhere* below.
- **Coming next:** consistency checks between C4 levels, and a skill so your own AI can draw the diagrams from a
  repository.
  [`docs/superpowers/specs/2026-11-05-daidal-kinds-c4-and-repo-aware-ai.md`](docs/superpowers/specs/2026-11-05-daidal-kinds-c4-and-repo-aware-ai.md).

## Connect an AI

With a personal access token from the app (your initial → **AI access**):

```sh
claude mcp add --transport http daidal https://<your-site>/mcp --header "Authorization: Bearer skt_…"
```

Online, with Cloudflare Access's Managed OAuth on, clients sign in as you instead. Details and the tool list:
[`docs/mcp.md`](docs/mcp.md).

## Draw a diagram anywhere

[`@khorum/daidal-core`](packages/core/README.md) turns a Daidal config into a standalone SVG: no DOM, no framework, no
dependencies. Install it with `npm install @khorum/daidal-core`, or load it from an npm CDN:

```html
<script type="module">
  import { renderConfig } from 'https://cdn.jsdelivr.net/npm/@khorum/daidal-core@0.1.0/daidal-core.js';
  const { svg } = renderConfig(`
nodes:
  - { id: web, name: Web app, type: service }
  - { id: db, name: Orders, type: database }
edges:
  - { from: web, to: db, label: reads }
`);
  document.body.innerHTML = svg;
</script>
```

The [`daidal-diagram`](skills/daidal-diagram/SKILL.md) skill teaches Claude to write a config and draw it inline in
the chat with that renderer; [`skills/README.md`](skills/README.md) says how to install it.

## Run it locally

```sh
npm ci && npm ci --prefix app
npx wrangler dev --var DEV_USER_EMAIL:you@example.com
```

Open http://localhost:8787 — signed in as that email, with a local SQLite database, no Cloudflare account needed.

## Self-host on Cloudflare

Daidal is one Worker, one D1 database and Cloudflare Access in front. Roughly:

1. `npx wrangler d1 create skope` and note the `database_id`.
2. In Cloudflare Zero Trust, add a self-hosted Access application for your hostname, with a policy allowing the people
   who should sign in; copy its **AUD** tag.
3. Set `routes[0].pattern` in `wrangler.jsonc` to your hostname, then generate the deploy config and deploy:
   ```sh
   PROD_D1_ID=<database_id> PROD_ACCESS_AUD=<aud> node scripts/prod-config.mjs
   npx wrangler d1 migrations apply skope --remote -c wrangler.prod.jsonc
   npx wrangler deploy -c wrangler.prod.jsonc --secrets-file wrangler.prod.secrets.json
   ```
4. For MCP clients online, turn on Managed OAuth for the Access application ([`docs/mcp.md`](docs/mcp.md)).

The GitHub Actions workflow in `.github/workflows/deploy.yml` does the same on every push to `main`, with the ids
and tokens in repository environments; [`docs/stage.md`](docs/stage.md) walks through the one-time setup, including a
shared stage site for pull requests.

Running it on the Workers Free plan is fine for a team; Cloudflare Access is free for up to 50 users on your own
account. The security model, limits and what is stored about people are in [`docs/security.md`](docs/security.md).

## Repository layout

| Path | What |
|---|---|
| `worker/` | The Cloudflare Worker: API, auth, limits, MCP server, tests |
| `app/` | The SvelteKit editor, served under `/app` |
| `packages/core/` | The shared core, published as `@khorum/daidal-core`: the document types, scene model, SVG renderer, config and edits (no DOM, no dependencies), used by the app, the Worker and the Claude skill |
| `skills/` | Claude skills: `daidal-diagram` draws a config inline in Claude |
| `migrations/` | D1 schema |
| `docs/` | MCP, security, stage, and design specs under `docs/superpowers/` |
| `e2e/`, `docs-shots/` | Playwright end-to-end tests and documentation screenshots |
| `stage/`, `scripts/` | Stage seed data and the config scripts CI uses |

## Contributing

Issues and pull requests welcome — [`CONTRIBUTING.md`](CONTRIBUTING.md) has the setup, the CLA note and what
merges easily. Security problems go through private vulnerability reporting ([`SECURITY.md`](SECURITY.md)).

## License and trademarks

Fair source (source-available, not open source) under the **Functional Source License, version 1.1, ALv2 Future License**
([`LICENSE.md`](LICENSE.md)): use it, self-host it, change it, contribute to it; don't offer it as a competing hosted
product. Each version becomes Apache-2.0 two years after its release.

*Daidal* and the Daidal logo are trademarks of Violabs Software LLC; forks need a different name
([`TRADEMARKS.md`](TRADEMARKS.md)).
