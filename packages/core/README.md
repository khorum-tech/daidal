# @khorum/daidal-core

The part of Daidal every client shares: the `.daidal.json` document types, the scene a document turns into
(`model`), edge routing (`geometry`), the node type and icon catalogue (`icons`, `kinds`), the SVG renderer
(`render`), YAML and config reading and writing (`yaml`, `config`), document edits (`edit`), templates and card
summaries. It has no DOM, no framework and no dependencies, so the editor (`app/`), the Worker (`worker/`) and
later integrations (inline render in Claude, editor plugins, Confluence, a static renderer) all draw the same picture.

Import a module by its path:

```ts
import { toScene } from '@khorum/daidal-core/model';
import { toSvg } from '@khorum/daidal-core/render';
import type { DaidalDoc } from '@khorum/daidal-core/types';
```

Inside this repository the package ships its TypeScript source; the app's Vite build and the Worker's Wrangler
build compile it.

## The published package

`npm run build:core` (from the root) builds what goes to npm into `packages/core/dist`: one ES module,
`daidal-core.js`, with everything above bundled in and no dependencies, its type declarations, this README and the
licence (FSL-1.1-ALv2). It loads from an npm CDN, so a page that can only fetch scripts from one can draw a diagram:

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

`renderConfig(text, { view, ghosted, edgeStyle })` reads a YAML or JSON config and returns `{ svg, width, height, doc }`;
`renderDoc(doc, …)` draws a document you already have. The entry also exports `readConfig`, `toScene`, `toSvg`,
`parseYaml` and the document types.

The name it publishes under is set in one place, `PACKAGE_NAME` in `scripts/build-core.mjs`. Its version is this
package's `version`; move it on before each publish.

### Publishing

The `publish-core` workflow publishes it, run by hand from main (Actions > publish-core > Run workflow). It is a dry run
unless *Publish* is ticked, and it refuses a version npm already has. It holds no npm token: npm lets it publish as a
[trusted publisher](https://docs.npmjs.com/trusted-publishers), with an OIDC token GitHub mints for this repository and
this workflow file alone.

npm only attaches a trusted publisher to a package it already knows, so before the first run, once, from a laptop:

1. The `khorum` npm organisation has to exist, and your npm account needs two-factor authentication on.
2. Install npm 11.15 or later (`npm install -g npm@^11.15.0`) and sign in with `npm login`.
3. From the repository root, run `bash scripts/bootstrap-core.sh`. It publishes a placeholder `0.0.1` under the
   `bootstrap` tag, so npm knows the name, then names `publish-core.yml` in this repository as the package's trusted
   publisher. It is the one version with no provenance; run it again if it stops partway.
4. On npmjs.com, in the package's Settings, choose **Require two-factor authentication and disallow tokens**, so only
   the workflow can publish.

Then run `publish-core` with *Publish* ticked to put out the real version. Until then `npm install` resolves to the
placeholder, since npm points `latest` at the first version a package publishes.

`npm test` here runs its tests in Node; `npm run typecheck` checks it against ES2022 alone, with no DOM or Node types.
From the repository root, `npm test` and `npm run typecheck` include it.
