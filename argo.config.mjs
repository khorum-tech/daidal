// Argo (https://github.com/shreyaskarnik/argo) records the product demo: `npm run demo` with the app on :8790.
// Argo is not a dependency here: install it first, unsaved (`npm i --no-save @argo-video/cli@0.42.1`).
// Silent by design (captions only), so it needs no voice engine and no API key. See docs/demo.md.
import { defineConfig } from '@argo-video/cli';

export default defineConfig({
  baseURL: process.env.BASE_URL || 'http://localhost:8790',
  demosDir: 'demos',
  outputDir: 'videos',
  video: {
    width: 1440,
    height: 900,
    fps: 30,
    browser: 'chromium',
    captureMode: 'jpeg-stitch',
    deviceScaleFactor: 2,
    cursorHighlight: { mode: 'click', color: '#9585dc', radius: 22, opacity: 0.9 },
    // The animated cards load GSAP as an inline script, which the app's Content-Security-Policy rightly refuses.
    // Only this recording browser sets the policy aside; the app's own headers don't change.
    contextOptions: { bypassCSP: true },
  },
  export: {
    preset: 'slow',
    crf: 20,
    formats: ['gif'],
    // The recording sits in a rounded frame on a ground taken from its own colours.
    frame: { padding: 36, borderRadius: 14, shadow: 0.5, background: { type: 'auto' } },
    // Page loads between scenes play at double speed.
    speedRamp: { gapSpeed: 2.0, minGapMs: 500 },
  },
  overlays: { autoBackground: true },
});
