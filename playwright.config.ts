import { defineConfig, devices } from "@playwright/test";
import { OWNER } from "./e2e/support";

const PORT = 8790;
const E2E_LIMITS = "workspacesPerPerson=1000000,diagramsPerPerson=1000000,writesPerMinute=1000000";

/**
 * End-to-end tests of the SvelteKit app at /app. They run against the real Worker under `wrangler dev`, signed in
 * as OWNER through the localhost-only dev sign-in, and each test imports its own data through the API.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // A touch phone on Chromium (Pixel 7: 412 px wide), for the layout and gestures phones get.
    { name: "phone", testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // One signed-in person runs every test, importing the stage data each time, so the per-person limits are
    // raised for this server only (worker/src/limits.ts).
    command: `npx wrangler d1 migrations apply skope --local && npx wrangler dev --port ${PORT} --var DEV_USER_EMAIL:${OWNER} --var DAIDAL_LIMITS:${E2E_LIMITS}`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // wrangler builds the app before it starts serving
  },
});
