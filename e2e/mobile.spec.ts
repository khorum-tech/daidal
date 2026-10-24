import { expect, test, type Page } from "@playwright/test";
import { importStageData } from "./support";

// Runs in the "phone" project (playwright.config.ts): a touch screen 412 px wide.

/** A two-finger pinch out at the middle of the screen, as raw touch events. */
async function pinchOut(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const at = (s: number) => [{ x: 206 - s, y: 420, id: 1 }, { x: 206 + s, y: 420, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(30) });
  for (let s = 40; s <= 120; s += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(s) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("the app on a phone", () => {
  test("puts the panels behind a toolbar, and opens them as sheets", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByRole("button", { name: "Service: Postings Service" })).toBeVisible();
    // The side panels give the canvas their room.
    await expect(page.getByRole("complementary", { name: "Views and tags" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);

    const toolbar = page.getByRole("navigation", { name: "Diagram panels" });
    await toolbar.getByRole("button", { name: /View/ }).tap();
    await page.getByRole("dialog", { name: "Views and tags" }).getByRole("button", { name: "Write path" }).tap();
    await page.getByRole("button", { name: "Close Views and tags" }).tap();
    await expect(toolbar).toContainText("Write path");
    await expect(page.getByRole("button", { name: "Telemetry: Collector" })).toHaveCSS("opacity", "0.22");

    // Tapping a node brings its details up.
    await page.getByRole("button", { name: "Database: Journal DB" }).tap();
    await expect(page.getByRole("dialog", { name: "Node details" })).toContainText("Append-only journal");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await toolbar.getByRole("button", { name: /History/ }).tap();
    await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: /Container view/ }).tap();
    await expect(page.getByRole("status")).toContainText("Replaying “Container view”");
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toHaveCount(0);
  });

  test("pinches the canvas without zooming the page, and fits back without stray scroll", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const pct = page.getByRole("button", { name: /Fit to view/ });
    const fitted = parseInt((await pct.textContent()) ?? "0", 10);
    await pinchOut(page);
    await expect.poll(async () => parseInt((await pct.textContent()) ?? "0", 10)).toBeGreaterThan(fitted * 2);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);

    await pct.tap();
    await expect(pct).toHaveText(`${fitted}%`);
    // At fit the drawing fills the view exactly, so there is nothing left to scroll to.
    expect(await page.locator(".scroll").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("never scrolls the page sideways", async ({ page, request }) => {
    const { team, diagrams } = await importStageData(request);
    for (const path of [`/app/?ws=${encodeURIComponent(team)}`, `/app/d/${diagrams["edge-ingress (platform copy)"]}`]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
});
