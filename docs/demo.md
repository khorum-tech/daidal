# The product demo

`demos/tour.demo.ts` is a Playwright script that [Argo](https://github.com/shreyaskarnik/argo) records into
`videos/tour.mp4` and `videos/tour.gif`: about 40 seconds, silent, with the captions in `demos/tour.scenes.json`.
It runs against the stage data on your own machine; nothing leaves it, and no voice engine or API key is involved.

Argo is pinned (`@argo-video/cli` 0.42.1, the version that was read through before it was added). Don't run
`argo add` (it fetches third-party overlay code) and leave `overlays.allowRawGsap` off.

## Record it

It needs `ffmpeg` on the path, and the app's dependencies (`npm ci && npm ci --prefix app`).

```sh
npx wrangler d1 migrations apply skope --local
STAGE_OWNER_EMAIL=demo@example.com npm run stage-seed && npx wrangler d1 execute skope --local --file seed.sql
npx wrangler dev --port 8790 --var DEV_USER_EMAIL:demo@example.com
```

The second line clears your local database and loads the stage data ([stage.md](stage.md)). Then, in another shell:

```sh
npm run demo
```

`videos/`, `.argo/` and `test-results/` are not committed. `npx argo preview tour` opens an editor for the captions
and timing on 127.0.0.1.

## Change it

- What happens: `demos/tour.demo.ts`. Each `narration.mark('<scene>')` starts a scene; keep `test` imported from
  `@argo-video/cli`.
- What the captions say: `demos/tour.scenes.json`, one entry per scene, same names. Adding `"text"` to a scene
  makes it spoken, which needs a voice engine (`npx argo doctor` lists them).
- The capture takes a frame when the page paints. A scene that ends on a still screen is cut short, so keep the
  pointer moving under a closing card.
