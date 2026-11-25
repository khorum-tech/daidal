import { expect, test, type Page } from "@playwright/test";
import { importStageData } from "./support";

// Runs in the "tablet" project (playwright.config.ts): an iPad Pro 11" held sideways, a touch screen 1194 px wide.
// That's wider than the phone layout's breakpoint, so the editor shows its desktop layout, with no Move or Resize
// buttons: a finger drags what is already selected instead.

/** One finger from (x, y) by (dx, dy), in steps, as raw touch events. With [alt], Alt is held (no snapping). */
async function swipe(page: Page, x: number, y: number, dx: number, dy: number, alt = false) {
  const cdp = await page.context().newCDPSession(page);
  const modifiers = alt ? 1 : 0;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }], modifiers });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }], modifiers });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], modifiers });
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

test.describe("the editor on an iPad held sideways", () => {
  test("uses the desktop layout, and a swipe on a node not selected pans", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    await expect(page.getByRole("toolbar", { name: "Edit" })).toBeVisible();
    const before = await sheet(page);
    const start = await middle(page, '[data-node="postings"]');
    await swipe(page, start.x, start.y, 0, 80);
    expect((await sheet(page)).ty).toBeCloseTo(before.ty + 80, 0);
    expect(await page.locator('[data-node="postings"]').evaluate(el => (el as HTMLElement).style.top)).toBe("150px");
  });

  test("drags a node by touch once it's selected, and it stays there after a reload", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const collector = page.locator('[data-node="collector"]');
    await collector.tap();
    await expect(collector).toHaveAttribute("aria-pressed", "true");
    const { s } = await sheet(page);
    const start = await middle(page, '[data-node="collector"]');
    await swipe(page, start.x, start.y, 40 * s, -30 * s, true);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    // Collector starts at (60, 480); the swipe was 40 × -30 in diagram units.
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.nodes.find((n: { id: string }) => n.id === "collector").layout).toMatchObject({ x: 100, y: 450 });
    await page.reload();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("left", "100px");
  });

  test("moves a container by its label and resizes it by its corner, by touch, once it's selected", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const label = page.getByRole("button", { name: "Container: Storage" });
    await label.tap();
    await expect(page.getByRole("region", { name: "Selected container" })).toBeVisible();
    const { s } = await sheet(page);

    let start = await middle(page, 'button[aria-label="Container: Storage"]');
    await swipe(page, start.x, start.y, -40 * s, 20 * s);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    start = await middle(page, ".resize");
    await swipe(page, start.x, start.y, 50 * s, 40 * s);
    await expect(page.getByTestId("save-status")).toContainText("Saved");

    // Storage starts at (880, 120), 230 × 340, and moves alone.
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.boundaries.find((b: { id: string }) => b.id === "store").layout).toMatchObject({ x: 840, y: 140, w: 280, h: 380 });
  });
});
