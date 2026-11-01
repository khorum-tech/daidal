import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Takes the pictures in the in-app docs (app/static/docs-images), from the real app on the stage data. Not a test:
 * run `npm run docs:shots` after changing the UI, look at the pictures, and commit them.
 */
export default defineConfig({
  ...base,
  testDir: "docs-shots",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [
    { name: "desktop", testIgnore: /phone/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark" } },
    { name: "phone", testMatch: /phone/, use: { ...devices["Pixel 7"], deviceScaleFactor: 2, colorScheme: "dark" } },
  ],
});
