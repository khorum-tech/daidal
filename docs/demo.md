# The product demo

`demos/tour.demo.ts` is a Playwright script that [Argo](https://github.com/shreyaskarnik/argo) records into
`videos/tour.mp4` and `videos/tour.gif`: about 40 seconds, silent, with the captions in `demos/tour.scenes.json`.
It runs against the stage data on your own machine; nothing leaves it, and no voice engine or API key is involved.

**Argo is not one of this project's dependencies.** It is a recording tool that runs shell commands and can reach
the network, so it stays out of `package.json` and the lockfile and is installed only when a new take is wanted:
`--no-save` below puts it in `node_modules` without recording it, and the next `npm ci` removes it. Use 0.42.1,
the version that was read through; read a newer one before moving to it. Don't run `argo add` (it fetches
third-party overlay code) and leave `overlays.allowRawGsap` off.

## Record it

It needs `ffmpeg` on the path, and the app's dependencies (`npm ci && npm ci --prefix app`).

```sh
npx wrangler d1 migrations apply skope --local
STAGE_OWNER_EMAIL=demo@example.com npm run stage-seed && npx wrangler d1 execute skope --local --file seed.sql
npx wrangler dev --port 8790 --var DEV_USER_EMAIL:demo@example.com
```

The second line clears your local database and loads the stage data ([stage.md](stage.md)). Then, in another shell:

```sh
npm i --no-save @argo-video/cli@0.42.1
npm run demo
```

`videos/`, `.argo/` and `test-results/` are not committed. The README shows `docs/demo/tour.gif`, with
`docs/demo/tour.mp4` beside it; after a take you want to keep, refresh both:

```sh
cp videos/tour.mp4 docs/demo/tour.mp4
ffmpeg -y -i videos/tour.mp4 -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" docs/demo/tour.gif
```

(Argo's own `videos/tour.gif` is full size, about 6 MB: too heavy for a README.) `npx argo preview tour` opens an editor for the captions
and timing on 127.0.0.1.

## Change it

- What happens: `demos/tour.demo.ts`. Each `narration.mark('<scene>')` starts a scene; keep `test` imported from
  `@argo-video/cli`.
- What the captions say: `demos/tour.scenes.json`, one entry per scene, same names. Adding `"text"` to a scene
  makes it spoken, which needs a voice engine (`npx argo doctor` lists them).
- The opening and closing cards are Argo's built-in `logo-outro` block, with the mark inlined as a data URI. They
  animate with GSAP, loaded as an inline script, so the recording browser alone runs with `bypassCSP`
  (`argo.config.mjs`); the app's own policy is untouched.
- `zoomTo(..., { narration })` adds its zoom at export by cropping the frame, which cuts off any caption showing
  at the time: show the caption first, then zoom.
- The capture takes a frame when the page paints. A scene that ends on a still screen is cut short, so keep the
  pointer moving under a closing card.
