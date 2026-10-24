import { defineConfig, devices } from "@playwright/test";
import { OWNER } from "./e2e/support";

const PORT = 8790;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx wrangler d1 migrations apply skope --local && npx wrangler dev --port ${PORT} --var DEV_USER_EMAIL:${OWNER}`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // wrangler builds the app before it starts serving
  },
});
