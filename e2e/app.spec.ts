import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { importStageData } from "./support";

interface SavedNode {
  id: string;
  name: string;
  type: string;
  subtitle?: string;
  notes?: string;
  flags?: string[];
  tags?: string[];
  links?: { label?: string; url: string }[];
  layout: { x: number; y: number };
}

/** Wait for the page to finish saving, then read the diagram back from the API. */
async function saved(page: Page, request: APIRequestContext, id: string): Promise<{ rev: number; doc: { nodes: SavedNode[]; edges: { from: string; to: string }[] } }> {
  await expect(page.getByTestId("save-status")).toHaveText(/^\s*Saved/);
  return (await request.get(`/api/diagrams/${id}`)).json();
}

test.describe("the app at /app", () => {
  test("lists a workspace's diagrams, with what each one follows", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await expect(page.getByRole("heading", { name: "Platform team" })).toBeVisible();
    await expect(page.getByText("3 diagrams")).toBeVisible();
    await expect(page.getByRole("link", { name: /ledger-platform \(DR drill\)/ })).toContainText("Follows ledger-platform · paused");
    await expect(page.getByRole("link", { name: /edge-ingress \(platform copy\)/ })).toContainText("Follows edge-ingress");
    await expect(page.getByRole("navigation", { name: "Workspaces" }).getByRole("link", { name: /Platform team/ }).first()).toBeVisible();
  });

  test("draws a diagram, switches views and opens a node", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByRole("button", { name: "Service: Postings Service" })).toBeVisible();
    await expect(page.getByText("LEDGER CLUSTER · EU-WEST")).toBeVisible();
    await expect(page.locator("path[data-edge]")).toHaveCount(9);

    // The saved view is "Full system"; "Write path" leaves observability out, so the collector is ghosted.
    await expect(page.getByRole("button", { name: "Full system" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Write path" }).click();
    await expect(page.getByRole("button", { name: "Telemetry: Collector" })).toHaveCSS("opacity", "0.22");

    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await expect(page.getByRole("region", { name: "Selected node" }).getByLabel("Notes")).toHaveValue(/Append-only journal/);
  });

  test("replays a snapshot and comes back to the working copy", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toBeVisible();
    await page.getByRole("button", { name: /Container view/ }).click();
    await expect(page.getByRole("status")).toContainText("Replaying “Container view”");
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to the working copy" }).click();
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toBeVisible();
  });

  test("shows where a follower stands, and links to its lead", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["edge-ingress (platform copy)"]}`);
    await expect(page.getByTestId("follow")).toContainText("synced to “Add the web firewall” · 1 newer snapshot to review");
    await page.getByTestId("follow").getByRole("link", { name: "edge-ingress" }).click();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Second region/ })).toBeVisible();
    await expect(page).toHaveTitle("edge-ingress · Skope");
  });

  test("opens a deep link directly, and says when a diagram can't be found", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}?from=bookmark`);
    await expect(page.getByRole("button", { name: "Service: Edge Router" })).toBeVisible();
    await page.goto("/app/d/no-such-diagram");
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  });

  test("leaves the prototype where it was", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Loading Skope");
  });

  test("moves a node with the mouse and saves it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved · drag a node to move it");
    const box = (await page.locator('[data-node="journal"]').boundingBox())!;
    const scale = await page.getByTestId("diagram-sheet").evaluate(el => Number(/scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)![1]));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50 * scale, box.y + box.height / 2 + 20 * scale, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    const saved = await (await request.get(`/api/diagrams/${id}`)).json();
    // Journal DB starts at (900, 150).
    expect(saved.doc.nodes.find((n: { id: string }) => n.id === "journal").layout).toMatchObject({ x: 950, y: 170 });
    expect(saved.rev).toBe(2);
  });

  test("stops saving when someone else saved first, and picks up again after loading theirs", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved");
    // Another tab saves first.
    const theirs = await (await request.get(`/api/diagrams/${id}`)).json();
    expect((await request.put(`/api/diagrams/${id}`, { data: { rev: theirs.rev, name: "renamed elsewhere" } })).status()).toBe(200);

    const box = (await page.locator('[data-node="edge"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId("save-status")).toContainText("This diagram changed somewhere else");
    await page.getByRole("button", { name: "Load the latest" }).click();
    await expect(page.getByTestId("save-status")).toContainText("Saved · drag a node to move it");
    await expect(page).toHaveTitle("renamed elsewhere · Skope");
  });

  test("adds a node, edits it in the inspector, and saves every field", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add" }).click();
    const menu = page.getByRole("dialog", { name: "Add a node" });
    await menu.getByPlaceholder("Search all types…").fill("cach");
    await menu.getByRole("button", { name: "Cache" }).click();
    await expect(menu).toHaveCount(0);

    const inspector = page.getByRole("region", { name: "Selected node" });
    await expect(inspector.getByLabel("Name")).toHaveValue("New Cache");
    await expect(page.getByRole("button", { name: "Cache: New Cache" })).toHaveAttribute("aria-pressed", "true");
    await inspector.getByLabel("Name").fill("Hot Balances");
    await inspector.getByLabel("Subtitle").fill("Redis · 3 shards");
    await inspector.getByLabel("Notes").fill("Read-through; evicted on every posting.");
    await inspector.getByRole("button", { name: "Message queue" }).click();
    await inspector.getByLabel("Add a tag").selectOption({ label: "Data" });
    await inspector.getByLabel("Link label").fill("Dashboard");
    await inspector.getByLabel("Link address").fill("grafana.example.com/d/cache");
    await inspector.getByRole("button", { name: "Add link" }).click();
    await inspector.getByRole("button", { name: /^Cache/, expanded: false }).click();
    await inspector.getByRole("button", { name: "Data Warehouse" }).click();

    await expect(page.getByRole("button", { name: "Data Warehouse: Hot Balances" })).toBeVisible();
    const { doc } = await saved(page, request, id);
    const node = doc.nodes.find(n => n.name === "Hot Balances")!;
    expect(node).toMatchObject({
      type: "data-warehouse",
      subtitle: "Redis · 3 shards",
      notes: "Read-through; evicted on every posting.",
      flags: ["mq"],
      tags: ["data"],
      links: [{ label: "Dashboard", url: "https://grafana.example.com/d/cache" }],
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Data Warehouse: Hot Balances" })).toBeVisible();
  });

  test("deletes a node with its connections, and undoes and redoes it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: "Delete node" }).click();
    await expect(page.locator('[data-node="journal"]')).toHaveCount(0);
    await expect(page.locator("path[data-edge]")).toHaveCount(8);
    let { doc } = await saved(page, request, id);
    expect(doc.nodes.some(n => n.id === "journal")).toBe(false);
    expect(doc.edges.some(e => e.to === "journal")).toBe(false);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator('[data-node="journal"]')).toBeVisible();
    await expect(page.locator("path[data-edge]")).toHaveCount(9);
    ({ doc } = await saved(page, request, id));
    expect(doc.nodes.some(n => n.id === "journal")).toBe(true);

    await page.getByRole("button", { name: "Redo Delete “Journal DB”" }).click();
    await expect(page.locator('[data-node="journal"]')).toHaveCount(0);
    ({ doc } = await saved(page, request, id));
    expect(doc.nodes.some(n => n.id === "journal")).toBe(false);
  });

  test("duplicates the selected node and deletes it from the keyboard", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Service: Edge Router" }).click();
    await page.keyboard.press("ControlOrMeta+d");
    await expect(page.getByRole("button", { name: "Service: Edge Router" })).toHaveCount(2);
    let { doc } = await saved(page, request, id);
    const copy = doc.nodes.filter(n => n.name === "Edge Router").find(n => n.id !== "edge")!;
    // Edge Router sits at (340, 150); the copy lands 28 down and right.
    expect(copy.layout).toMatchObject({ x: 368, y: 178 });

    // The copy is selected; Backspace takes it away again, but not while typing in a field.
    const inspector = page.getByRole("region", { name: "Selected node" });
    await inspector.getByLabel("Name").press("End");
    await inspector.getByLabel("Name").press("Backspace");
    await expect(page.getByRole("button", { name: /: Edge Route$/ })).toBeVisible();
    await page.locator(`[data-node="${copy.id}"]`).click();
    await page.keyboard.press("Backspace");
    await expect(page.locator(`[data-node="${copy.id}"]`)).toHaveCount(0);
    ({ doc } = await saved(page, request, id));
    expect(doc.nodes.filter(n => n.name.startsWith("Edge Rout"))).toHaveLength(1);
  });
});
