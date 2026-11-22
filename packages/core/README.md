# @khorum/daidal-core

The part of Daidal every client shares: the `.daidal.json` document types, the scene a document turns into
(`model`), edge routing (`geometry`), the node type and icon catalogue (`icons`, `kinds`), the SVG renderer
(`render`), YAML and config reading and writing (`yaml`, `config`), document edits (`edit`), templates and card
summaries. It has no DOM, no framework and no dependencies, so the editor (`app/`), the Worker (`worker/`) and
every integration (the [Claude skill](https://github.com/khorum-tech/daidal/blob/main/skills/daidal-diagram/SKILL.md) today; editor plugins, Confluence and
a static renderer later) all draw the same picture.

Fair source under the Functional Source License (FSL-1.1-ALv2): source-available, not open source. Each version
becomes Apache-2.0 two years after its release. Source: [khorum-tech/daidal](https://github.com/khorum-tech/daidal).

## Use it

```sh
npm install @khorum/daidal-core
```

```ts
import { renderConfig } from '@khorum/daidal-core';

const { svg, width, height } = renderConfig(`
nodes:
  - { id: web, name: Web app, type: service }
  - { id: db, name: Orders, type: database }
edges:
  - { from: web, to: db, label: reads }
`);
```

The published package is one ES module, `daidal-core.js`, with everything bundled in and no dependencies, plus its
type declarations and the licence. It loads from an npm CDN too, so a page that can only fetch scripts from one can
draw a diagram:

```html
<script type="module">
  import { renderConfig } from 'https://cdn.jsdelivr.net/npm/@khorum/daidal-core@0.1.0/daidal-core.js';
  const { svg } = renderConfig(`
nodes:
  - { id: web, name: Web app, type: service }
edges: []
`);
  document.body.innerHTML = svg;
</script>
```

unpkg (`https://unpkg.com/@khorum/daidal-core@0.1.0/daidal-core.js`) and esm.sh serve the same file. Pin a version:
before 1.0.0 a minor version may change the output.

`renderConfig(text, { view, ghosted, edgeStyle })` reads a YAML or JSON config and returns `{ svg, width, height, doc }`;
it throws a `ConfigError` (with a line, for YAML) when the config can't be read. `renderDoc(doc, …)` draws a document
you already have. The entry also exports `readConfig`, `configText`, `toScene`, `tagsOn`, `bounds`, `toSvg`,
`parseYaml` and the document types. The config format is described in the app's docs
([`app/src/lib/docs/config.md`](https://github.com/khorum-tech/daidal/blob/main/app/src/lib/docs/config.md)) and, for drawing, in the Claude skill's
[reference](https://github.com/khorum-tech/daidal/blob/main/skills/daidal-diagram/references/config.md).

Two habits keep its YAML reader from misreading a config: put no `# comment` after a value on the same line, and
double-quote text with an apostrophe, comma or colon in it (`notes: "The bank's system."`).

## Inside this repository

The editor (`app/`) and the Worker (`worker/`) import modules by path, from the TypeScript source:

```ts
import { toScene } from '@khorum/daidal-core/model';
import { toSvg } from '@khorum/daidal-core/render';
import type { DaidalDoc } from '@khorum/daidal-core/types';
```

Those paths exist only here; the published package exports its single entry. The app's Vite build and the Worker's
Wrangler build compile the source.

## Building and publishing

`npm run build:core` (from the root) builds what goes to npm into `packages/core/dist`: the bundle, its source map,
its type declarations, this README and the licence (FSL-1.1-ALv2).

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

Then run `publish-core` with *Publish* ticked to put out the real version. That's done: `0.1.0` is on npm as
`latest`, and the placeholder stays under the `bootstrap` tag. For later versions, move `version` on in this
package's `package.json`, merge, and run the workflow again; the bootstrap steps don't repeat. This version is the
package's own, separate from the app's releases ([`docs/releasing.md`](https://github.com/khorum-tech/daidal/blob/main/docs/releasing.md)).

`npm test` here runs its tests in Node; `npm run typecheck` checks it against ES2022 alone, with no DOM or Node types.
From the repository root, `npm test` and `npm run typecheck` include it.
