import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { importStageData, sheet, swipe } from "./support";

// Runs in the "tablet" project (playwright.config.ts): an iPad Pro 11" held sideways, a touch screen 1194 px wide.
// That's wider than the phone layout's breakpoint, so the editor shows its desktop layout, with no Move or Resize
// buttons: a finger drags what is already selected instead.

/** The middle of [selector]'s box on screen. */
const middle = async (page: Page, selector: string) => {
  const b = (await page.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Opens a fresh copy of the stage data's ledger-platform diagram and waits for it to load; its id. */
async function openLedger(page: Page, request: APIRequestContext) {
  const { diagrams } = await importStageData(request);
  const id = diagrams["ledger-platform"];
  await page.goto(`/app/d/${id}`);
  await expect(page.getByTestId("save-status")).toContainText("Saved");
  return id;
}

/** The layout saved for diagram [id]'s [list] entry [key]. */
async function savedLayout(request: APIRequestContext, id: string, list: "nodes" | "boundaries", key: string) {
  const saved = await (await request.get(`/api/diagrams/${id}`)).json();
  return saved.doc[list].find((x: { id: string }) => x.id === key).layout;
}

/** Where diagram [id]'s first connection's far end is pinned, if it is. */
async function savedEndTo(request: APIRequestContext, id: string): Promise<string | undefined> {
  const saved = await (await request.get(`/api/diagrams/${id}`)).json();
  return saved.doc.edges[0].anchors?.to;
}

test.describe("the editor on an iPad held sideways", () => {
  test("uses the desktop layout, and a swipe on a node not selected pans", async ({ page, request }) => {
    await openLedger(page, request);
    await expect(page.getByRole("toolbar", { name: "Edit" })).toBeVisible();
    const before = await sheet(page);
    const start = await middle(page, '[data-node="postings"]');
    await swipe(page, start.x, start.y, 0, 80);
    expect((await sheet(page)).ty).toBeCloseTo(before.ty + 80, 0);
    expect(await page.locator('[data-node="postings"]').evaluate(el => (el as HTMLElement).style.top)).toBe("150px");
  });

  test("drags a node by touch once it's selected, and it stays there after a reload", async ({ page, request }) => {
    const id = await openLedger(page, request);
    const collector = page.locator('[data-node="collector"]');
    await collector.tap();
    await expect(collector).toHaveAttribute("aria-pressed", "true");
    const { s } = await sheet(page);
    const start = await middle(page, '[data-node="collector"]');
    await swipe(page, start.x, start.y, 40 * s, -30 * s, true);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    // Collector starts at (60, 480); the swipe was 40 × -30 in diagram units.
    expect(await savedLayout(request, id, "nodes", "collector")).toMatchObject({ x: 100, y: 450 });
    await page.reload();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("left", "100px");
  });

  test("moves a container by its label and resizes it by its corner, by touch, once it's selected", async ({ page, request }) => {
    const id = await openLedger(page, request);
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
    expect(await savedLayout(request, id, "boundaries", "store")).toMatchObject({ x: 840, y: 140, w: 280, h: 380 });
  });

  test("locks what's inside a container by touch from the button by its corner, so a drag carries it", async ({ page, request }) => {
    const id = await openLedger(page, request);
    await page.getByRole("button", { name: "Container: Storage" }).tap();
    const lock = page.getByRole("button", { name: "Lock what's inside Storage" });
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await lock.tap();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await (await request.get(`/api/diagrams/${id}`)).json()).doc.boundaries.find((b: { id: string }) => b.id === "store").moveContents).toBeUndefined();

    const { s } = await sheet(page);
    const start = await middle(page, 'button[aria-label="Container: Storage"]');
    await swipe(page, start.x, start.y, 0, 40 * s);
    // Storage starts at (880, 120) and Journal DB inside it at (900, 150).
    await expect.poll(() => savedLayout(request, id, "nodes", "journal")).toMatchObject({ x: 900, y: 190 });
    expect(await savedLayout(request, id, "boundaries", "store")).toMatchObject({ x: 880, y: 160 });
  });

  test("moves a connection's end along its box by touch, and a double tap puts it back on auto", async ({ page, request }) => {
    const id = await openLedger(page, request);
    await page.getByRole("button", { name: "Web App: Ledger Console" }).tap();
    await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: /Edge Router/ }).tap();
    await expect(page.getByRole("region", { name: "Selected connection" }).getByRole("heading", { level: 2 })).toHaveText("Ledger Console → Edge Router");
    const end = page.locator('.end-handle[data-end="to"]');
    await expect(end).toBeVisible();
    await expect(end).not.toHaveClass(/pinned/);

    const start = await middle(page, '.end-handle[data-end="to"]');
    await swipe(page, start.x, start.y, 0, 34);
    await expect(end).toHaveClass(/pinned/);
    await expect.poll(() => savedEndTo(request, id)).toMatch(/^(left|bottom):/);

    const at = await middle(page, '.end-handle[data-end="to"]');
    await page.touchscreen.tap(at.x, at.y);
    await page.touchscreen.tap(at.x, at.y);
    await expect(end).not.toHaveClass(/pinned/);
    await expect.poll(() => savedEndTo(request, id)).toBeUndefined();
  });

  test("widens the side panel by touch from its edge, keeps the width after a reload, and a double tap resets it", async ({ page, request }) => {
    await openLedger(page, request);
    const panel = page.locator("aside.right");
    const handle = page.getByRole("separator", { name: "Resize the side panel" });
    await expect(handle).toHaveAttribute("aria-valuenow", "288");
    const width = async () => Math.round((await panel.boundingBox())!.width);
    expect(await width()).toBe(288);

    const edge = await middle(page, "aside.right");
    const x = (await panel.boundingBox())!.x;
    await swipe(page, x + 6, edge.y, -200, 0);
    await expect(handle).toHaveAttribute("aria-valuenow", "488");
    expect(await width()).toBe(488);
    // At least half of the iPad's width is there to take.
    expect(Number(await handle.getAttribute("aria-valuemax"))).toBeGreaterThanOrEqual(1194 / 2);

    await page.reload();
    await expect(handle).toHaveAttribute("aria-valuenow", "488");

    const at = (await panel.boundingBox())!.x + 6;
    await page.touchscreen.tap(at, edge.y);
    await page.touchscreen.tap(at, edge.y);
    await expect(handle).toHaveAttribute("aria-valuenow", "288");
    expect(await width()).toBe(288);
  });
});
