// Argo (https://github.com/shreyaskarnik/argo) records the product demo: `npm run demo` with the app on :8790.
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
  },
  export: { preset: 'slow', crf: 20, formats: ['gif'] },
  overlays: { autoBackground: true },
});
