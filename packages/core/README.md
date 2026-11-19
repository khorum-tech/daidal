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

The package ships its TypeScript source; the app's Vite build and the Worker's Wrangler build compile it. It is
private for now: publishing (the npm scope, a build to ESM) is a later step of the integration roadmap.

`npm test` here runs its tests in Node; `npm run typecheck` checks it against ES2022 alone, with no DOM or Node types.
From the repository root, `npm test` and `npm run typecheck` include it.
