# Skope app (SvelteKit)

The SvelteKit port of the prototype, served under **`/app`** beside the prototype at `/`. For now it is
**read-only** and reads everything from the Worker's API:

| Route | What it shows |
|-------|---------------|
| `/app/` | Your workspaces (yours and shared with you) and the diagrams in one (`?ws=<id>`, else your personal one), as the prototype's project cards |
| `/app/d/:id` | One diagram on the canvas: views and tags (switching them only changes what you see), the selected node's details, the history (pick a snapshot to replay it), and where a follower stands against its lead |

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
