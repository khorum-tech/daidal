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

/** One finger from (x, y) by (dx, dy), in steps, as raw touch events. */
async function swipe(page: Page, x: number, y: number, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** The canvas's current offset and scale. */
const sheet = (page: Page) =>
  page.getByTestId("diagram-sheet").evaluate(el => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)!;
    return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
  });

/** The middle of [selector]'s box on screen. */
const middle = async (page: Page, selector: string) => {
  const b = (await page.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

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

  test("pinches the canvas without zooming the page, and fits back", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const pct = page.getByRole("button", { name: /Fit to view/ });
    await expect(page.getByRole("button", { name: "Service: Postings Service" })).toBeVisible();
    const fitted = await sheet(page);
    await pinchOut(page);
    await expect.poll(async () => (await sheet(page)).s).toBeGreaterThan(fitted.s * 2);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
    await pct.tap();
    expect(await sheet(page)).toEqual(fitted);
  });

  test("pans with one finger, even at fit and even starting on a node", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    // While replaying history nothing can be moved, so a drag anywhere pans, a node included.
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /History/ }).tap();
    await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: /Container view/ }).tap();
    await expect(page.getByTestId("save-status")).toContainText("go back to the working copy to move nodes");
    const before = await sheet(page);
    const start = await middle(page, '[data-node="postings"]');
    await swipe(page, start.x, start.y, -90, 60);
    const after = await sheet(page);
    expect(after.tx).toBeCloseTo(before.tx - 90, 0);
    expect(after.ty).toBeCloseTo(before.ty + 60, 0);
    expect(await page.evaluate(() => scrollX + scrollY)).toBe(0);
  });

  test("drags a node with a finger, and it stays there after a reload", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const { s } = await sheet(page);
    const start = await middle(page, '[data-node="collector"]');
    await swipe(page, start.x, start.y, 40 * s, -30 * s);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    // Collector starts at (60, 480); the swipe was 40 × -30 in diagram units.
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.nodes.find((n: { id: string }) => n.id === "collector").layout).toMatchObject({ x: 100, y: 450 });
    await page.reload();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("left", "100px");
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
