import { expect, test, type Page } from "@playwright/test";
import { c4Backup } from "../stage/diagrams";
import { importStageData, sheet, swipe } from "./support";

// Runs in the "phone" project (playwright.config.ts): a touch screen 412 px wide.

/** A two-finger pinch out at the middle of the screen, as raw touch events. */
async function pinchOut(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const at = (s: number) => [{ x: 206 - s, y: 420, id: 1 }, { x: 206 + s, y: 420, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(30) });
  for (let s = 40; s <= 120; s += 10) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(s) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** A point near the top of the canvas with nothing on it (no node, container, connection or control), clear of the toolbar and zoom bar. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.locator(".canvas").evaluate(`(() => {
    const canvas = document.querySelector(".canvas");
    const r = canvas.getBoundingClientRect();
    for (let y = r.top + 160; y < r.bottom - 160; y += 20)
      for (let x = r.left + 100; x < r.right - 100; x += 20) {
        const el = document.elementFromPoint(x, y);
        if (el === canvas || (el && el.matches("[data-testid=diagram-sheet]"))) return { x, y };
      }
    return null;
  })()`);
  expect(spot).not.toBeNull();
  return spot as { x: number; y: number };
}

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

    // One tap selects, and the node menu takes the toolbar's place; no sheet covers the canvas.
    const journal = page.getByRole("button", { name: "Database: Journal DB" });
    await journal.tap();
    await expect(journal).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const menu = page.getByTestId("node-menu");
    await expect(menu).toContainText("Journal DB");
    // Edit leads, as View leads the bar it replaces.
    await expect(menu.getByRole("button").first()).toHaveAccessibleName(/^Edit/);
    // The owner's details are the editable inspector.
    await menu.getByRole("button", { name: /^Edit/ }).tap();
    await expect(page.getByRole("dialog", { name: "Node details" }).getByLabel("Notes")).toHaveValue(/Append-only journal/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await menu.getByRole("button", { name: /^Done/ }).tap();
    await expect(menu).toHaveCount(0);
    await expect(journal).toHaveAttribute("aria-pressed", "false");

    await toolbar.getByRole("button", { name: /History/ }).tap();
    await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: /Container view/ }).tap();
    await expect(page.getByRole("status")).toContainText("Replaying “Container view”");
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toHaveCount(0);
  });

  test("shows a picked node's bar as icons, and its View: every connection and link, read-only", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const postings = page.getByRole("button", { name: "Service: Postings Service" });
    await postings.tap();
    const menu = page.getByTestId("node-menu");
    // Edit, Move, Connect, View, then Done: each an icon over a word, big enough for a thumb.
    const buttons = menu.getByRole("button");
    await expect(buttons).toHaveCount(5);
    for (const [i, label] of ["Edit", "Move", "Connect", "View", "Done"].entries()) {
      await expect(buttons.nth(i)).toHaveAccessibleName(new RegExp(`^${label}`));
      await expect(buttons.nth(i).locator("svg")).toBeVisible();
      expect((await buttons.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await menu.getByRole("button", { name: /^View/ }).tap();
    const view = page.getByRole("dialog", { name: "Postings Service" }).getByRole("region", { name: "About Postings Service" });
    await expect(view).toContainText("Double-entry postings");
    for (const other of ["Edge Router", "Journal DB", "Balances Service"]) await expect(view.getByText(other, { exact: true })).toBeVisible();
    await expect(view.getByRole("textbox")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Replaying history is read-only: the bar is View and Done.
    await menu.getByRole("button", { name: /^Done/ }).tap();
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^History/ }).tap();
    await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: /Container view/ }).tap();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Service: Postings Service" }).tap();
    await expect(menu.getByRole("button")).toHaveCount(2);
    await expect(menu.getByRole("button").first()).toHaveAccessibleName(/^View Postings Service/);
  });

  test("draws a C4 diagram in C4 notation, and a tap still picks a card", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const postings = page.getByRole("button", { name: "Service: Postings Service" });
    await expect(postings).toContainText("[Container: Kotlin · Ktor]");
    await expect(page.getByRole("button", { name: "Database: Journal DB" })).toHaveAttribute("data-role", "store");
    await postings.tap();
    await expect(postings).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("node-menu")).toContainText("Postings Service");
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

  test("keeps a sideways swipe for the canvas, so Safari's swipe-anywhere Back can't take it, and taps still work", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const postings = page.getByRole("button", { name: "Service: Postings Service" });
    await expect(postings).toBeVisible();
    // Whether the page claimed each touch move, as Safari would see it once the canvas has had it.
    await page.evaluate(() => {
      (window as unknown as { claimed: boolean[] }).claimed = [];
      document.addEventListener("touchmove", e => (window as unknown as { claimed: boolean[] }).claimed.push(e.defaultPrevented));
    });
    const url = page.url();
    // From the middle of the screen, on bare canvas and on a node.
    const bare = await emptySpot(page);
    await swipe(page, bare.x, bare.y, 120, 0);
    const node = await middle(page, '[data-node="postings"]');
    await swipe(page, node.x, node.y, -120, 0);
    const claimed = await page.evaluate(() => (window as unknown as { claimed: boolean[] }).claimed);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.every(Boolean)).toBe(true);
    expect(page.url()).toBe(url);
    // A tap is no move: it still selects, and a tap on empty canvas still clears.
    await postings.tap();
    await expect(postings).toHaveAttribute("aria-pressed", "true");
    const empty = await emptySpot(page);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(postings).toHaveAttribute("aria-pressed", "false");
  });

  test("pans with one finger, even at fit and even starting on a node", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    // While replaying history nothing can be moved, so a drag anywhere pans, a node included.
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /History/ }).tap();
    await page.getByRole("dialog", { name: "History" }).getByRole("button", { name: /Container view/ }).tap();
    await expect(page.getByTestId("save-status")).toContainText("Replaying");
    const before = await sheet(page);
    const start = await middle(page, '[data-node="postings"]');
    await swipe(page, start.x, start.y, -90, 60);
    const after = await sheet(page);
    expect(after.tx).toBeCloseTo(before.tx - 90, 0);
    expect(after.ty).toBeCloseTo(before.ty + 60, 0);
    expect(await page.evaluate(() => scrollX + scrollY)).toBe(0);
  });

  test("a swipe that starts on a node pans, selected or not, until Move is chosen", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved\s*$/);
    const postings = page.locator('[data-node="postings"]');
    await postings.tap();
    await expect(postings).toHaveAttribute("aria-pressed", "true");
    const before = await sheet(page);
    const start = await middle(page, '[data-node="postings"]');
    await swipe(page, start.x, start.y, 0, 80);
    expect((await sheet(page)).ty).toBeCloseTo(before.ty + 80, 0);
    expect(await postings.evaluate(el => (el as HTMLElement).style.top)).toBe("150px");
    await expect(postings).toHaveAttribute("aria-pressed", "true"); // the pan didn't deselect it
  });

  test("moves the selected node with a drag from anywhere in Move, and it stays there after a reload", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const { s } = await sheet(page);
    await page.locator('[data-node="collector"]').tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Move/ }).tap();
    await expect(page.getByTestId("mode-hint")).toHaveText("Drag anywhere to move “Collector” · two fingers pan");
    // The drag starts on empty canvas, well away from the node.
    const canvas = (await page.locator(".canvas").boundingBox())!;
    await swipe(page, canvas.x + canvas.width - 40, canvas.y + canvas.height - 60, 40 * s, -30 * s, true);
    // The strip keeps the Move hint while Move is on; the save shows as "Saving…" passing through it.
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    // Collector starts at (60, 480); the swipe was 40 × -30 in diagram units.
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.nodes.find((n: { id: string }) => n.id === "collector").layout).toMatchObject({ x: 100, y: 450 });
    await page.reload();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("left", "100px");
  });

  test("adds a node from the Add sheet and renames it in the Edit sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).tap();
    const add = page.getByRole("dialog", { name: "Add a node" });
    await add.getByRole("button", { name: "Queue" }).first().tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const menu = page.getByTestId("node-menu");
    await expect(menu).toContainText("New Queue");
    await menu.getByRole("button", { name: /^Edit/ }).tap();
    const details = page.getByRole("dialog", { name: "Node details" });
    await details.getByLabel("Name").fill("Settlement Queue");
    await details.getByLabel("Name").blur();
    await page.keyboard.press("Escape");
    await expect(menu).toContainText("Settlement Queue");
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.nodes.some((n: { name: string; type: string }) => n.name === "Settlement Queue" && n.type === "queue")).toBe(true);
  });

  test("connects two nodes from the node menu, edits the connection in a sheet, and deletes it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.locator('[data-node="collector"]').tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Connect/ }).tap();
    await expect(page.getByTestId("mode-hint")).toContainText("Tap the node to connect “Collector” to");
    await page.locator('[data-node="console"]').tap();

    const menu = page.getByTestId("edge-menu");
    await expect(menu).toContainText("Collector → Ledger Console");
    await menu.getByRole("button", { name: /^Edit connection/ }).tap();
    const sheet = page.getByRole("dialog", { name: "Connection" });
    await sheet.getByLabel("Label", { exact: true }).fill("scrapes");
    await sheet.getByLabel("Label", { exact: true }).blur();
    await sheet.getByRole("button", { name: "Thick line" }).tap();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    let saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.edges.at(-1)).toEqual({ from: "collector", to: "console", label: "scrapes", width: 2.6 });

    await menu.getByRole("button", { name: /^Delete/ }).tap();
    await expect(page.getByTestId("edge-menu")).toHaveCount(0);
    await expect(page.locator('path[data-edge="collector>console"]')).toHaveCount(0);
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.edges.some((e: { from: string; to: string }) => e.from === "collector" && e.to === "console")).toBe(false);
  });

  test("resizes and moves a container from its menu, and renames it in a sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const { s } = await sheet(page);
    await page.getByRole("button", { name: "Container: Storage" }).tap();
    const menu = page.getByTestId("box-menu");
    const canvas = (await page.locator(".canvas").boundingBox())!;

    await menu.getByRole("button", { name: /^Resize/ }).tap();
    await expect(page.getByTestId("mode-hint")).toContainText("Drag anywhere to resize “Storage”");
    await swipe(page, canvas.x + 60, canvas.y + canvas.height - 80, 50 * s, 40 * s);
    await menu.getByRole("button", { name: /^Move/ }).tap();
    // The resize grew the diagram, but an edit never rescales the canvas under the finger.
    expect((await sheet(page)).s).toBe(s);
    await swipe(page, canvas.x + 60, canvas.y + canvas.height - 80, -40 * s, 20 * s);
    await menu.getByRole("button", { name: /^Edit/ }).tap();
    const details = page.getByRole("dialog", { name: "Container" });
    await details.getByLabel("Label").fill("Data stores");
    await details.getByLabel("Label").blur();
    await page.keyboard.press("Escape");
    // Move stays on until it is tapped again; the strip shows its hint until then.
    await menu.getByRole("button", { name: /^Moving/ }).tap();

    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    const box = saved.doc.boundaries.find((b: { id: string }) => b.id === "store");
    // Storage starts at (880, 120), 230 × 340.
    expect(box).toMatchObject({ label: "Data stores", layout: { x: 840, y: 140, w: 280, h: 380 } });
  });

  test("keeps the strip on one line, so the canvas never moves as the save status changes", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const strip = page.locator(".strip");
    const canvasTop = async () => (await page.locator(".canvas").boundingBox())!.y;
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved\s*$/);
    const height = (await strip.boundingBox())!.height;
    const top = await canvasTop();
    // One line of text: no taller than its padding and a line.
    expect(height).toBeLessThan(40);

    // A mode's hint floats over the canvas instead of joining the strip.
    await page.locator('[data-node="collector"]').tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Move/ }).tap();
    await expect(page.getByTestId("mode-hint")).toBeVisible();
    expect((await strip.boundingBox())!.height).toBe(height);

    // Saving and saved again: the strip keeps its height and the canvas stays put.
    const { s } = await sheet(page);
    const canvas = (await page.locator(".canvas").boundingBox())!;
    const tops: number[] = [];
    const watch = setInterval(() => void canvasTop().then(t => tops.push(t)).catch(() => {}), 20);
    await swipe(page, canvas.x + canvas.width - 40, canvas.y + canvas.height - 60, 30 * s, -20 * s, true);
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    clearInterval(watch);
    expect((await strip.boundingBox())!.height).toBe(height);
    expect(new Set([top, ...tops, await canvasTop()])).toEqual(new Set([top]));
  });

  test("saves a view and adds a tag from the views sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^View/ }).tap();
    const views = page.getByRole("dialog", { name: "Views and tags" });
    await views.getByRole("checkbox", { name: /Observability/ }).tap();
    await views.getByRole("button", { name: "+ Save the tags on now as a view" }).tap();
    await expect(views.getByRole("button", { name: /^View 5/ })).toHaveAttribute("aria-pressed", "true");
    // Saving a view doesn't spring its editor open.
    await expect(views.getByRole("group", { name: /^Edit view/ })).toHaveCount(0);

    await views.getByRole("button", { name: "Manage tags" }).tap();
    const manager = page.getByRole("dialog", { name: "Manage tags" });
    await manager.getByLabel("New tag name").fill("Hot path");
    await manager.getByRole("button", { name: "Add tag" }).tap();
    await expect(manager.getByLabel("Name of Hot path")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(saved.doc.views.at(-1)).toEqual({ name: "View 5", tags: ["web", "service", "data", "auth", "async"] });
    expect(saved.doc.tags["hot-path"]).toMatchObject({ label: "Hot path" });
  });

  test("renames a diagram from the header and takes a snapshot from the history sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "ledger-platform" }).tap();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByLabel("Name").fill("ledger-core");
    await sheet.getByLabel("Name").blur();
    await page.keyboard.press("Escape");
    await expect(page).toHaveTitle("ledger-core · Daidal");

    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^History/ }).tap();
    const history = page.getByRole("dialog", { name: "History" });
    await history.getByRole("button", { name: "+ Take a snapshot" }).tap();
    await history.getByLabel("Snapshot description").fill("From my phone");
    await history.getByRole("button", { name: "Save snapshot" }).tap();
    await expect(history.getByRole("button", { name: /From my phone/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Diagram panels" })).toContainText("3 snapshots");

    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    expect((await (await request.get(`/api/diagrams/${id}`)).json()).name).toBe("ledger-core");
  });

  test("makes a workspace and adds a member from its sheet", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New workspace" }).tap();
    const name = `Phone crew ${Date.now()}`;
    await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create workspace" }).tap();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.getByRole("button", { name: `Manage ${name}` }).tap();
    const sheet = page.getByRole("dialog", { name });
    await sheet.getByLabel("Email to add").fill("pal@example.com");
    await sheet.getByRole("button", { name: "Add", exact: true }).tap();
    await expect(sheet.getByRole("listitem").filter({ hasText: "pal@example.com" })).toBeVisible();
  });

  test("never scrolls the page sideways", async ({ page, request }) => {
    const { team, diagrams } = await importStageData(request);
    for (const path of [`/app/?ws=${encodeURIComponent(team)}`, `/app/d/${diagrams["edge-ingress (platform copy)"]}`]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
  test("connects from the node menu to empty space for a new node, and resizes it by the corner", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.locator('[data-node="collector"]').tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Connect/ }).tap();
    await expect(page.getByTestId("mode-hint")).toContainText("or empty space for a new one");
    const spot = await emptySpot(page);
    await page.touchscreen.tap(spot.x, spot.y);
    await expect(page.getByTestId("node-menu")).toContainText("New Service");
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    let res = await (await request.get(`/api/diagrams/${id}`)).json();
    const made = res.doc.nodes.find((n: { name: string }) => n.name === "New Service");
    expect(res.doc.edges.at(-1)).toEqual({ from: "collector", to: made.id });

    const { s } = await sheet(page);
    const handle = await middle(page, ".n-resize");
    await swipe(page, handle.x, handle.y, 60 * s, 30 * s);
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    res = await (await request.get(`/api/diagrams/${id}`)).json();
    const resized = res.doc.nodes.find((n: { id: string }) => n.id === made.id);
    expect(resized.layout.w).toBeCloseTo(250, -1);
    expect(resized.layout.h).toBeCloseTo(118, -1);
  });
  test("picks many in Select mode, tags them from a sheet, moves them together and deletes them", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^Select/ }).tap();
    const menu = page.getByTestId("multi-menu");
    await expect(menu).toContainText("Tap to pick");
    await page.locator('[data-node="identity"]').tap();
    await page.locator('[data-node="balances"]').tap();
    await expect(menu).toContainText("2 nodes");

    await menu.getByRole("button", { name: /^Edit/ }).tap();
    const sheetEl = page.getByRole("dialog", { name: "Picked" });
    await sheetEl.getByRole("button", { name: "Put Observability on all" }).tap();
    await page.keyboard.press("Escape");

    await menu.getByRole("button", { name: /^Move/ }).tap();
    await expect(page.getByTestId("mode-hint")).toContainText("Drag anywhere to move 2 nodes");
    const { s } = await sheet(page);
    const spot = await emptySpot(page);
    await swipe(page, spot.x, spot.y, 0, 100 * s);
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    let res = await (await request.get(`/api/diagrams/${id}`)).json();
    const node = (nid: string) => res.doc.nodes.find((n: { id: string }) => n.id === nid);
    expect(node("identity").tags).toEqual(["service", "auth", "obs"]);
    expect(node("identity").layout.y).toBeCloseTo(460, -1);
    expect(node("balances").layout.y).toBeCloseTo(460, -1);

    await menu.getByRole("button", { name: /^Delete/ }).tap();
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    res = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(res.doc.nodes.some((n: { id: string }) => n.id === "identity" || n.id === "balances")).toBe(false);
    await menu.getByRole("button", { name: "Done picking" }).tap();
    await expect(page.getByRole("navigation", { name: "Diagram panels" })).toBeVisible();
  });
  test("opens a follower's updates from History, and accepts a whole snapshot", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["edge-ingress (platform copy)"];
    await page.goto(`/app/d/${id}`);
    const history = page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^History/ });
    await expect(history).toContainText("2 to review");
    await history.tap();
    const sheetEl = page.getByRole("dialog", { name: "History" });
    await sheetEl.getByRole("button", { name: "Accept all from Second region" }).tap();
    await expect(sheetEl.getByText("Accepted")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-node="pool-b"]')).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    const d = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(d.doc.boundaries.map((b: { id: string }) => b.id)).toContain("regions");
    expect(Object.values(d.decided)).toEqual(["accepted", "accepted", "accepted"]);
  });
  test("presents from the diagram sheet, shows a node's detail on a tap, and exits", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("button", { name: "ledger-platform" }).tap();
    await page.getByRole("dialog", { name: "Diagram" }).getByRole("button", { name: "Present" }).tap();
    const bar = page.getByRole("region", { name: "Presenting" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Diagram panels" })).toHaveCount(0);
    await page.locator('[data-node="journal"]').tap();
    await expect(page.getByRole("tooltip", { name: "About Journal DB" })).toBeVisible();
    await expect(page.getByTestId("node-menu")).toHaveCount(0);
    await bar.getByRole("button", { name: "Exit" }).tap();
    await expect(page.getByRole("navigation", { name: "Diagram panels" })).toBeVisible();
  });
  test("opens the config from the diagram sheet, and applies an edit", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "ledger-platform" }).tap();
    await page.getByRole("dialog", { name: "Diagram" }).getByRole("button", { name: "Edit as YAML or JSON" }).tap();
    const sheetEl = page.getByRole("dialog", { name: "Config" });
    const text = sheetEl.getByLabel("Config text");
    await text.fill((await text.inputValue()).replace("name: Collector", "name: OTel Collector"));
    await sheetEl.getByRole("button", { name: "Apply" }).tap();
    await expect(sheetEl.getByRole("status")).toContainText("Replaced with 9 nodes");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-node="collector"]')).toContainText("OTel Collector");
  });
  test("reaches Your data on the profile, with its download and a delete that wants your email", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.locator("header .who").tap();
    await page.getByRole("menuitem", { name: "Profile" }).tap();
    const data = page.getByRole("dialog", { name: "Profile and appearance" }).getByRole("region", { name: "Your data" });
    await data.getByRole("button", { name: "Delete my account…" }).scrollIntoViewIfNeeded();
    await expect(data.getByRole("button", { name: "Download my data" })).toBeVisible();
    await data.getByRole("button", { name: "Delete my account…" }).tap();
    await expect(data.getByRole("button", { name: "Delete everything" })).toBeDisabled();
    await data.getByRole("button", { name: "Keep my account" }).tap();
  });

  test("changes the theme from the menu, and presents with icon-only cards", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.locator("header .who").tap();
    await page.getByRole("menuitem", { name: "Appearance" }).tap();
    const sheet = page.getByRole("dialog", { name: "Profile and appearance" });
    await sheet.getByRole("radio", { name: "Light" }).tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await sheet.getByRole("checkbox", { name: /Icon-only cards:/ }).check();
    await sheet.getByRole("button", { name: "Close Profile and appearance" }).tap();

    await page.getByRole("button", { name: "ledger-platform" }).tap();
    await page.getByRole("dialog", { name: "Diagram" }).getByRole("button", { name: "Present" }).tap();
    const bar = page.getByRole("region", { name: "Presenting" });
    await expect(bar.getByRole("button", { name: "Icon-only cards" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-node="journal"]')).toHaveClass(/icon-only/);
    await page.locator('[data-node="journal"]').tap();
    await expect(page.getByRole("tooltip", { name: "About Journal DB" })).toBeVisible();
    await bar.getByRole("button", { name: "Icon-only cards" }).tap();
    await expect(page.locator('[data-node="journal"]')).not.toHaveClass(/icon-only/);
  });
  test("searches the diagrams of a workspace", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    const search = page.getByRole("searchbox", { name: "Search diagrams" });
    await search.tap();
    await search.fill("collector");
    await expect(page.getByTestId("diagram-count")).toHaveText("2 diagrams with “collector”");
    await expect(page.getByRole("link", { name: /ledger-platform \(DR drill\)/ })).toContainText("Has Collector");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test("starts a diagram from a template, and rolls an edit back from the History sheet", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New diagram" }).tap();
    const dialog = page.getByRole("dialog", { name: "New diagram" });
    await dialog.getByLabel("Name").fill("phone-plan");
    await dialog.getByRole("radio", { name: /C4 Container/ }).tap();
    await dialog.getByRole("checkbox", { name: "Include the example nodes" }).check();
    await dialog.getByRole("button", { name: "Create diagram" }).tap();
    await expect(page).toHaveTitle("phone-plan · Daidal");
    await expect(page.locator("[data-node]")).toHaveCount(4);

    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).tap();
    await page.getByRole("dialog", { name: "Add a node" }).getByRole("button", { name: "Queue" }).first().tap();
    await expect(page.locator("[data-node]")).toHaveCount(5);
    await page.getByRole("button", { name: "Done with New Queue" }).tap();
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /History/ }).tap();
    const history = page.getByRole("dialog", { name: "History" });
    await history.getByRole("button", { name: /As it was when opened/ }).tap();
    await expect(page.locator("[data-node]")).toHaveCount(4);
    await expect(history.getByRole("button", { name: /Add queue/i })).toContainText("Undone");
  });
  test("isolates a node's tags from its sheet, with no minimap or end handles on a phone", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByRole("img", { name: /^Minimap/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Database: Journal DB" }).tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Edit/ }).tap();
    await page.getByRole("dialog", { name: "Node details" }).getByRole("button", { name: "Isolate its tags" }).tap();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("opacity", "0.22");
  });
  test("moves a diagram to another workspace from the diagram sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform (DR drill)"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "ledger-platform (DR drill)" }).tap();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByLabel("Move to").selectOption("Personal");
    await sheet.getByRole("button", { name: "Move the diagram" }).tap();
    await expect(sheet).toHaveCount(0);
    expect((await (await request.get(`/api/diagrams/${id}`)).json()).workspaceId).toBe("personal:e2e-owner@example.com");
  });
  test("switches the tag palette from the views sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("navigation", { name: "Diagram panels" }).getByRole("button", { name: /^View/ }).tap();
    await page.getByRole("dialog", { name: "Views and tags" }).getByRole("button", { name: "Manage tags" }).tap();
    const manager = page.getByRole("dialog", { name: "Manage tags" });
    await manager.getByRole("radio", { name: /Lightness steps/ }).tap();
    await expect(manager.getByRole("radio", { name: /Lightness steps/ })).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test("starts a new node in Move, so a drag places it straight away", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).tap();
    await page.getByRole("dialog", { name: "Add a node" }).getByRole("button", { name: "Queue" }).first().tap();
    const menu = page.getByTestId("node-menu");
    await expect(menu.getByRole("button", { name: /^Moving/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mode-hint")).toHaveText("Drag anywhere to move “New Queue” · two fingers pan");
    await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
    const before = ((await (await request.get(`/api/diagrams/${id}`)).json()).doc.nodes as { name: string; layout: { x: number } }[]).find(n => n.name === "New Queue")!.layout;
    const canvas = (await page.locator(".canvas").boundingBox())!;
    await swipe(page, canvas.x + canvas.width / 2, canvas.y + canvas.height - 60, 60, 0, true);
    await expect(async () => {
      const after = ((await (await request.get(`/api/diagrams/${id}`)).json()).doc.nodes as { name: string; layout: { x: number } }[]).find(n => n.name === "New Queue")!.layout;
      expect(after.x).toBeGreaterThan(before.x);
    }).toPass();
  });

  test("keeps a link typed in the node's sheet but not added, when the sheet is closed", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Database: Journal DB" }).tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Edit/ }).tap();
    const details = page.getByRole("dialog", { name: "Node details" });
    await details.getByLabel("Link label").fill("Runbook");
    await details.getByLabel("Link address").fill("example.com/journal");
    await details.getByRole("button", { name: "Close Node details" }).tap();
    await expect(async () => {
      const saved = (await (await request.get(`/api/diagrams/${id}`)).json()).doc.nodes.find((n: { id: string }) => n.id === "journal");
      expect(saved.links).toEqual([{ label: "Runbook", url: "https://example.com/journal" }]);
    }).toPass();
  });

  test("draws a workspace's own type, and picks a node's own icon from its sheet", async ({ page, request }) => {
    const ws = await (await request.post("/api/workspaces", { data: { name: `Phone types ${Date.now()}` } })).json();
    await request.put(`/api/workspaces/${ws.id}/types/billing-agent`, { data: { name: "Billing Agent", category: "AI", icon: "robot" } });
    const doc = { version: 1, nodes: [{ id: "bill", name: "Biller", type: "billing-agent", layout: { x: 40, y: 120 } }] };
    const made = await (await request.post("/api/diagrams", { data: { workspace: ws.id, name: "phone agents", doc } })).json();
    await page.goto(`/app/d/${made.id}`);
    await page.getByRole("button", { name: "Billing Agent: Biller" }).tap();
    await page.getByTestId("node-menu").getByRole("button", { name: /^Edit/ }).tap();
    const details = page.getByRole("dialog", { name: "Node details" });
    await details.getByRole("button", { name: /^Icon:/ }).tap();
    await details.getByLabel("Search icons").fill("brain");
    await details.getByRole("button", { name: "Brain" }).tap();
    await expect(details.getByRole("button", { name: "Icon: Brain" })).toBeVisible();
    await expect(async () => {
      const saved = (await (await request.get(`/api/diagrams/${made.id}`)).json()).doc.nodes[0];
      expect(saved).toMatchObject({ type: "billing-agent", icon: "brain" });
    }).toPass();
    await request.delete(`/api/workspaces/${ws.id}`);
  });

  test("follows the tour's first steps on a phone, with the card above the bottom bar", async ({ page }) => {
    await page.goto("/app/?tour=start");
    await expect(page).toHaveURL(/\/app\/d\//);
    const tour = (title: string) => page.getByRole("dialog", { name: title });
    await tour("Welcome to Daidal").getByRole("button", { name: "Next" }).tap();
    await expect(tour("Add a node")).toContainText("It starts in Move");
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).tap();
    await page.getByRole("dialog", { name: "Add a node" }).getByRole("button", { name: "Service" }).first().tap();
    await expect(tour("Name it")).toBeVisible();
    const box = (await tour("Name it").boundingBox())!;
    expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
    await tour("Name it").getByRole("button", { name: "End tour" }).tap();
    await expect(page.locator(".tour")).toHaveCount(0);
  });

  test("reads the docs: opens them from the account sheet and moves between pages with the picker", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /^Account:/ }).tap();
    await page.getByRole("dialog", { name: "Account" }).getByRole("menuitem", { name: "Docs" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Daidal docs" })).toBeVisible();
    await page.getByLabel("Go to a page").selectOption({ label: "Connections" });
    await expect(page.getByRole("heading", { level: 1, name: "Connections" })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/docs\/connections$/);

    // A long page scrolls with a finger, down to its Previous and Next links.
    await page.getByLabel("Go to a page").selectOption({ label: "The config format" });
    const scroll = page.getByTestId("docs-scroll");
    const box = (await scroll.boundingBox())!;
    for (let i = 0; i < 6; i++) await swipe(page, box.x + box.width / 2, box.y + box.height - 80, 0, -(box.height - 200));
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
  });

  test("claims a touch on bare canvas at the screen's edge, so the browser can't take it as Back", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const claimed = (x: number, y: number) =>
      page.evaluate(([x, y]) => {
        const target = document.elementFromPoint(x, y)!;
        const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y });
        const e = new TouchEvent("touchstart", { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
        target.dispatchEvent(e);
        return e.defaultPrevented;
      }, [x, y]);
    const canvas = (await page.locator(".canvas").boundingBox())!;
    expect(await claimed(4, canvas.y + 20)).toBe(true);
    expect(await claimed(canvas.width / 2, canvas.y + 20)).toBe(false);
  });
  test("opens the account menu as a sheet from your initial", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.locator("header .who").tap();
    const account = page.getByRole("dialog", { name: "Account" });
    await expect(account).toBeVisible();
    await expect(account).toContainText("e2e-owner@example.com");
    await account.getByRole("menuitem", { name: "Appearance" }).tap();
    await expect(account).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Profile and appearance" }).getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
  });

  test("keeps a C4 breadcrumb to one step up and the diagram's menu, both big enough to tap", async ({ page, request }) => {
    const res = await request.post("/api/workspaces/import", { data: c4Backup() });
    expect(res.status()).toBe(201);
    const ws = ((await res.json()) as { workspaces: { id: string }[] }).workspaces[0].id;
    const list = (await (await request.get(`/api/diagrams?workspace=${encodeURIComponent(ws)}`)).json()) as { id: string; name: string }[];
    const id = (name: string) => list.find(d => d.name === name)!.id;
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });

    await page.goto(`/app/d/${id("postings-components")}`);
    const up = crumbs.getByRole("link", { name: "Up to ledger-containers" });
    await expect(up).toBeVisible();
    // Only the step up and this diagram: the rest of the way waits behind the arrow.
    await expect(crumbs.getByRole("link")).toHaveCount(1);
    const menu = crumbs.getByRole("button", { name: /postings-components/ });
    await expect(menu).toBeVisible();
    for (const target of [up, menu]) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    // Nothing in the bar runs off the screen.
    const width = page.viewportSize()!.width;
    for (const target of [up, menu, page.getByRole("button", { name: /^Account/ })]) {
      const box = (await target.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }

    // Each tap goes up a level.
    await up.tap();
    await expect(page).toHaveURL(new RegExp(`/app/d/${id("ledger-containers")}`));
    await crumbs.getByRole("link", { name: "Up to ledger-context" }).tap();
    await expect(page).toHaveURL(new RegExp(`/app/d/${id("ledger-context")}`));
  });
});
