# @khorum-oss/daidal-core

The part of Daidal every client shares: the `.daidal.json` document types, the scene a document turns into
(`model`), edge routing (`geometry`), the node type and icon catalogue (`icons`, `kinds`), the SVG renderer
(`render`), YAML and config reading and writing (`yaml`, `config`), document edits (`edit`), templates and card
summaries. It has no DOM, no framework and no dependencies, so the editor (`app/`), the Worker (`worker/`) and
later integrations (inline render in Claude, editor plugins, Confluence, a static renderer) all draw the same picture.

Import a module by its path:

```ts
import { toScene } from '@khorum-oss/daidal-core/model';
import { toSvg } from '@khorum-oss/daidal-core/render';
import type { DaidalDoc } from '@khorum-oss/daidal-core/types';
```

Inside this repository the package ships its TypeScript source; the app's Vite build and the Worker's Wrangler
build compile it.

## The published package

`npm run build:core` (from the root) builds what goes to npm into `packages/core/dist`: one ES module,
`daidal-core.js`, with everything above bundled in and no dependencies, its type declarations, this README and the
licence (FSL-1.1-ALv2). It loads from an npm CDN, so a page that can only fetch scripts from one can draw a diagram:

```html
<script type="module">
  import { renderConfig } from 'https://cdn.jsdelivr.net/npm/@khorum-oss/daidal-core@0.1.0/daidal-core.js';
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

`renderConfig(text, { view, ghosted, edgeStyle })` reads a YAML or JSON config and returns `{ svg, width, height, doc }`;
`renderDoc(doc, …)` draws a document you already have. The entry also exports `readConfig`, `toScene`, `toSvg`,
`parseYaml` and the document types.

The name it publishes under is set in one place, `PACKAGE_NAME` in `scripts/build-core.mjs`. Its version is this
package's `version`; move it on before each publish.

### Publishing

The `publish-core` workflow publishes it, run by hand from main (Actions > publish-core > Run workflow). It is a dry run
unless *Publish* is ticked, and it refuses a version npm already has. Before the first run:

1. Create the npm scope (an npm organisation) on npmjs.com, if it doesn't exist yet.
2. Make an npm granular access token that can publish to it, and save it as the repository secret `NPM_TOKEN`.

`npm test` here runs its tests in Node; `npm run typecheck` checks it against ES2022 alone, with no DOM or Node types.
From the repository root, `npm test` and `npm run typecheck` include it.
