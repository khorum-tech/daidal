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

interface SavedBox {
  id: string;
  label?: string;
  labelPosition?: string;
  border?: { width?: number; style?: string };
  moveContents?: boolean;
  layout: { x: number; y: number; w: number; h: number };
}

interface SavedEdge {
  from: string;
  to: string;
  label?: string;
  line?: string;
  direction?: string;
  route?: string;
  anchors?: { from?: string; to?: string };
}

/** Wait for the page to finish saving, then read the diagram back from the API. */
/** Drag with the mouse from the middle of [from] to the middle of [to] (or a point). */
async function drag(page: Page, from: string, to: string | { x: number; y: number }) {
  const a = (await page.locator(from).boundingBox())!;
  const b = typeof to === "string" ? (await page.locator(to).boundingBox())! : { ...to, width: 0, height: 0 };
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** The canvas's current zoom. */
const zoom = (page: Page) => page.getByTestId("diagram-sheet").evaluate(el => Number(/scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)![1]));

/** Drag with the mouse from the middle of [from] by ([dx], [dy]) in diagram units. */
async function dragBy(page: Page, from: string, dx: number, dy: number) {
  const s = await zoom(page);
  const a = (await page.locator(from).boundingBox())!;
  await drag(page, from, { x: a.x + a.width / 2 + dx * s, y: a.y + a.height / 2 + dy * s });
}

async function saved(page: Page, request: APIRequestContext, id: string): Promise<{
  rev: number;
  doc: {
    nodes: SavedNode[];
    edges: SavedEdge[];
    boundaries: SavedBox[];
    tags: Record<string, { label: string; color: string; group?: string }>;
    views: { name: string; tags: string[] }[];
    diagram: { view?: string };
  };
}> {
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
    await expect(page.getByRole("button", { name: /^Full system/ })).toHaveAttribute("aria-pressed", "true");
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

  test("connects two nodes by dragging the port, then labels and styles the connection", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.locator("path[data-edge]")).toHaveCount(9);
    await page.getByRole("button", { name: "Telemetry: Collector" }).click();
    await drag(page, ".port", '[data-node="console"]');
    await expect(page.locator('path[data-edge="collector>console"]')).toHaveCount(1);

    const inspector = page.getByRole("region", { name: "Selected connection" });
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Collector → Ledger Console");
    await inspector.getByLabel("Label", { exact: true }).fill("scrapes");
    await inspector.getByRole("button", { name: "Dashed line" }).click();
    await inspector.getByRole("button", { name: "Arrows at both ends" }).click();
    await inspector.getByRole("button", { name: "Angled route" }).click();
    await inspector.getByLabel("Side it leaves Collector").selectOption("top");
    await expect(page.locator(".e-label", { hasText: "scrapes" })).toBeVisible();

    const { doc } = await saved(page, request, id);
    expect(doc.edges.at(-1)).toEqual({ from: "collector", to: "console", label: "scrapes", line: "dashed", direction: "both", route: "angled", anchors: { from: "top:0.5" } });
  });

  test("connects with a click on the port then the target, and drops a connection on empty canvas for a new node", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Service: Edge Router" }).click();
    await page.locator(".port").click();
    await expect(page.getByTestId("save-status")).toContainText("Click the node to connect “Edge Router” to");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("save-status")).not.toContainText("Click the node");

    await page.locator(".port").click();
    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await expect(page.getByRole("region", { name: "Selected connection" }).getByRole("heading", { level: 2 })).toHaveText("Edge Router → Journal DB");

    // From Journal DB out to empty canvas, below the diagram.
    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    const canvas = (await page.locator(".canvas").boundingBox())!;
    await drag(page, ".port", { x: canvas.x + canvas.width - 120, y: canvas.y + canvas.height - 80 });
    const inspector = page.getByRole("region", { name: "Selected node" });
    await expect(inspector.getByLabel("Name")).toHaveValue("New Service");
    await expect(inspector.getByRole("button", { name: /Journal DB/ })).toBeVisible();

    const { doc } = await saved(page, request, id);
    const made = doc.nodes.find(n => n.name === "New Service")!;
    expect(doc.edges.slice(-2)).toEqual([{ from: "edge", to: "journal" }, { from: "journal", to: made.id }]);
  });

  test("picks a connection, reverses it, deletes it from the keyboard, and undoes that", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    // Picked on the canvas: the label sits on the connection's middle and lets taps through to it.
    const label = (await page.locator(".e-label", { hasText: "SQL" }).boundingBox())!;
    await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
    const inspector = page.getByRole("region", { name: "Selected connection" });
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Postings Service → Journal DB");
    await inspector.getByRole("button", { name: "Reverse" }).click();
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Journal DB → Postings Service");

    await page.locator(".canvas").focus();
    await page.keyboard.press("Delete");
    await expect(page.locator("path[data-edge]")).toHaveCount(8);
    let { doc } = await saved(page, request, id);
    expect(doc.edges.some(e => e.from === "journal" || e.to === "journal")).toBe(false);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator('path[data-edge="journal>postings"]')).toHaveCount(1);

    // Picked from the node's own list of connections.
    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: /Postings Service/ }).click();
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Journal DB → Postings Service");
    ({ doc } = await saved(page, request, id));
    expect(doc.edges.find(e => e.from === "journal")).toMatchObject({ to: "postings", label: "SQL" });
  });

  test("adds a container, then labels, styles, resizes and moves it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add" }).click();
    await page.getByRole("dialog", { name: "Add a node" }).getByRole("button", { name: /labelled box/ }).click();

    const inspector = page.getByRole("region", { name: "Selected container" });
    await expect(inspector.getByLabel("Label")).toHaveValue("NEW CONTAINER");
    await inspector.getByLabel("Label").fill("PAYMENTS");
    await inspector.getByRole("button", { name: "Outside" }).click();
    await inspector.getByRole("button", { name: "Top right" }).click();
    await inspector.getByRole("button", { name: "Heavy" }).click();
    await inspector.getByRole("button", { name: "Solid border" }).click();
    await expect(page.getByRole("button", { name: "Container: PAYMENTS" })).toBeVisible();

    await dragBy(page, ".resize", 100, 60);
    await dragBy(page, '[data-box]:is(.b-hit.l)[data-box^="bx"]', -30, 20);
    await expect(inspector).toContainText("620 × 400");

    const { doc } = await saved(page, request, id);
    const box = doc.boundaries.find(b => b.label === "PAYMENTS")!;
    expect(box).toMatchObject({ labelPosition: "outside-tr", border: { width: 3, style: "solid" }, moveContents: false });
    expect(box.layout).toMatchObject({ w: 620, h: 400 });
  });

  test("moves a container with what sits inside it, and one that moves alone", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    // The cluster carries its nodes and the Storage container: Postings Service (620, 150) moves with it.
    await dragBy(page, 'button[aria-label="Container: LEDGER CLUSTER · EU-WEST"]', 40, 30);
    let { doc } = await saved(page, request, id);
    expect(doc.boundaries.find(b => b.id === "platform")!.layout).toMatchObject({ x: 356, y: 142 });
    expect(doc.boundaries.find(b => b.id === "store")!.layout).toMatchObject({ x: 920, y: 150 });
    expect(doc.nodes.find(n => n.id === "postings")!.layout).toMatchObject({ x: 660, y: 180 });

    // Storage moves alone, so Journal DB stays put; the inspector says so.
    await page.getByRole("button", { name: "Container: Storage" }).click();
    await expect(page.getByRole("region", { name: "Selected container" }).getByRole("checkbox", { name: /moves what's inside/ })).not.toBeChecked();
    await dragBy(page, 'button[aria-label="Container: Storage"]', 0, 60);
    ({ doc } = await saved(page, request, id));
    expect(doc.boundaries.find(b => b.id === "store")!.layout).toMatchObject({ x: 920, y: 210 });
    expect(doc.nodes.find(n => n.id === "journal")!.layout).toMatchObject({ x: 940, y: 180 });
  });

  test("connects a node to a container, and deleting the container takes the connection with it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Telemetry: Collector" }).click();
    await page.locator(".port").click();
    await page.getByRole("button", { name: "Container: Storage" }).click();
    await expect(page.getByRole("region", { name: "Selected connection" }).getByRole("heading", { level: 2 })).toHaveText("Collector → Storage");

    await page.getByRole("button", { name: "Container: Storage" }).click();
    await page.getByRole("region", { name: "Selected container" }).getByRole("button", { name: "Delete container" }).click();
    await expect(page.getByRole("button", { name: "Container: Storage" })).toHaveCount(0);
    let { doc } = await saved(page, request, id);
    expect(doc.boundaries.some(b => b.id === "store")).toBe(false);
    expect(doc.edges.some(e => e.to === "store")).toBe(false);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("button", { name: "Container: Storage" })).toBeVisible();
    ({ doc } = await saved(page, request, id));
    expect(doc.edges.some(e => e.from === "collector" && e.to === "store")).toBe(true);
  });

  test("saves the tags on now as a view, then renames it, opens on it, re-saves it and deletes it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const panel = page.getByRole("complementary", { name: "Views and tags" });
    await panel.getByRole("checkbox", { name: /Observability/ }).uncheck();
    // Full system stays chosen, marked as changed.
    await expect(panel.getByRole("button", { name: /^Full system/ })).toContainText("changed");
    await panel.getByRole("button", { name: "+ Save the tags on now as a view" }).click();
    await expect(panel.getByRole("button", { name: /^View 5/ })).toHaveAttribute("aria-pressed", "true");

    // The editor waits to be asked for.
    await expect(panel.getByRole("group", { name: "Edit view View 5" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Edit view View 5" }).click();
    const editor = panel.getByRole("group", { name: "Edit view View 5" });
    await editor.getByLabel("View name").fill("Quiet");
    await editor.getByLabel("View name").press("Enter");
    await panel.getByRole("group", { name: "Edit view Quiet" }).getByRole("checkbox", { name: /opens on this view/ }).check();
    await expect(panel.getByRole("button", { name: /^Quiet/ })).toContainText("default");
    let { doc } = await saved(page, request, id);
    expect(doc.views.at(-1)).toEqual({ name: "Quiet", tags: ["web", "service", "data", "auth", "async"] });
    expect(doc.diagram.view).toBe("Quiet");

    // A name already in use is refused.
    await panel.getByRole("group", { name: "Edit view Quiet" }).getByLabel("View name").fill("Events");
    await panel.getByRole("group", { name: "Edit view Quiet" }).getByLabel("View name").press("Enter");
    await expect(panel.getByRole("alert")).toContainText("Another view has that name");

    await panel.getByRole("checkbox", { name: /Async/ }).uncheck();
    await panel.getByRole("button", { name: "Save the tags on now", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Matches the tags on now" })).toBeDisabled();
    ({ doc } = await saved(page, request, id));
    expect(doc.views.find(v => v.name === "Quiet")!.tags).toEqual(["web", "service", "data", "auth"]);

    await page.reload();
    await expect(panel.getByRole("button", { name: /^Quiet/ })).toHaveAttribute("aria-pressed", "true");
    await panel.getByRole("button", { name: "Edit view Quiet" }).click();
    await panel.getByRole("button", { name: "Delete view" }).click();
    await expect(panel.getByRole("button", { name: /^Quiet/ })).toHaveCount(0);
    ({ doc } = await saved(page, request, id));
    expect(doc.views.some(v => v.name === "Quiet")).toBe(false);
    expect(doc.diagram.view).toBeUndefined();
  });

  test("manages tags: adds, renames, recolours, regroups and deletes them", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Manage tags" }).click();
    const manager = page.getByRole("dialog", { name: "Manage tags" });

    await manager.getByLabel("New tag name").fill("Hot path");
    await manager.getByLabel("New tag group").fill("Concern");
    await manager.getByRole("button", { name: "Add tag" }).click();
    await expect(manager.getByLabel("Name of Hot path")).toBeVisible();

    await manager.getByLabel("Name of Async").fill("Event bus");
    await manager.getByLabel("Colour of Event bus").click();
    await manager.getByRole("button", { name: "Colour #e0707c" }).click();
    await manager.getByLabel("Group of Auth").fill("Security");
    await manager.getByLabel("Group of Auth").press("Enter");
    await manager.getByRole("button", { name: "Delete tag Observability" }).click();
    await page.keyboard.press("Escape");

    const panel = page.getByRole("complementary", { name: "Views and tags" });
    await expect(panel.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: /Observability/ })).toHaveCount(0);
    const { doc } = await saved(page, request, id);
    expect(doc.tags["hot-path"]).toMatchObject({ label: "Hot path", group: "Concern" });
    expect(doc.tags.async).toMatchObject({ label: "Event bus", color: "#e0707c" });
    expect(doc.tags.auth.group).toBe("Security");
    expect(doc.tags.obs).toBeUndefined();
    expect(doc.nodes.find(n => n.id === "collector")!.tags ?? []).not.toContain("obs");
    expect(doc.views.every(v => !v.tags.includes("obs"))).toBe(true);
  });

  test("tags a node with a new tag, and solos a tag without saving anything", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Telemetry: Collector" }).click();
    const inspector = page.getByRole("region", { name: "Selected node" });
    await inspector.getByLabel("Add a tag").selectOption("New tag…");
    await inspector.getByLabel("New tag name").fill("Legacy");
    await inspector.getByRole("button", { name: "Add", exact: true }).click();
    await expect(inspector.getByRole("button", { name: "Remove tag Legacy" })).toBeVisible();
    let { doc } = await saved(page, request, id);
    expect(doc.tags.legacy).toMatchObject({ label: "Legacy", group: "Unlabelled" });
    expect(doc.nodes.find(n => n.id === "collector")!.tags).toContain("legacy");
    const rev = (await saved(page, request, id)).rev;

    const panel = page.getByRole("complementary", { name: "Views and tags" });
    await panel.getByRole("button", { name: "Solo Legacy" }).click();
    await expect(page.getByRole("button", { name: "Service: Edge Router" })).toHaveCSS("opacity", "0.22");
    await expect(page.getByRole("button", { name: "Telemetry: Collector" })).toHaveCSS("opacity", "1");
    await panel.getByRole("button", { name: "Stop soloing Legacy" }).click();
    await expect(page.getByRole("button", { name: "Service: Edge Router" })).toHaveCSS("opacity", "1");
    // Soloing only changes what this browser shows.
    ({ doc } = await saved(page, request, id));
    expect((await saved(page, request, id)).rev).toBe(rev);
  });

  test("starts a new, empty diagram from a workspace", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New diagram" }).click();
    const dialog = page.getByRole("dialog", { name: "New diagram" });
    await dialog.getByLabel("Name").fill("release-plan");
    await dialog.getByRole("button", { name: "Create diagram" }).click();
    await expect(page).toHaveTitle("release-plan · Skope");
    await expect(page.locator("[data-node]")).toHaveCount(0);
    const id = page.url().split("/d/")[1];
    const made = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(made).toMatchObject({ name: "release-plan", workspaceId: team, doc: { version: 1, diagram: { name: "release-plan" } } });
  });

  test("renames a diagram from its name in the header, and takes a snapshot", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "ledger-platform" }).click();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByLabel("Name").fill("ledger-core");
    await sheet.getByLabel("Name").press("Enter");
    await page.keyboard.press("Escape");
    await expect(page).toHaveTitle("ledger-core · Skope");
    await expect(page.getByRole("button", { name: "ledger-core" })).toBeVisible();
    let { doc } = await saved(page, request, id);
    expect((await (await request.get(`/api/diagrams/${id}`)).json()).name).toBe("ledger-core");

    const history = page.getByRole("region", { name: "History" });
    await history.getByRole("button", { name: "+ Take a snapshot" }).click();
    await history.getByLabel("Snapshot description").fill("Before the cut-over");
    await history.getByRole("button", { name: "Save snapshot" }).click();
    // Newest first, under the working copy.
    await expect(history.getByRole("listitem").nth(1)).toContainText("Before the cut-over");
    const snapshots = await (await request.get(`/api/diagrams/${id}/snapshots`)).json();
    expect(snapshots.at(-1)).toMatchObject({ label: "Before the cut-over", doc: { nodes: doc.nodes } });
    await page.reload();
    await expect(page).toHaveTitle("ledger-core · Skope");
    await expect(page.getByRole("region", { name: "History" }).getByRole("button", { name: /Before the cut-over/ })).toBeVisible();
  });

  test("duplicates a diagram into another workspace, and makes a follower of it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await expect(page.locator("[data-node]")).toHaveCount(9);
    await page.getByRole("button", { name: "ledger-platform" }).click();
    let sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByLabel("Into").selectOption({ label: "Personal" });
    await sheet.getByLabel("Called").fill("ledger sandbox");
    await sheet.getByRole("button", { name: "Make a duplicate" }).click();
    await expect(page).toHaveTitle("ledger sandbox · Skope");
    await expect(page.locator("[data-node]")).toHaveCount(9);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Personal");
    await expect(page.getByTestId("follow")).toHaveCount(0);

    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("button", { name: "ledger-platform" }).click();
    sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByRole("radio", { name: /Follow/ }).check();
    await sheet.getByLabel("Called").fill("ledger follower");
    await sheet.getByRole("button", { name: "Make a follower" }).click();
    await expect(page).toHaveTitle("ledger follower · Skope");
    await expect(page.getByTestId("follow")).toContainText("Follows ledger-platform");
  });

  test("deletes a diagram after asking, and lands back on its workspace", async ({ page, request }) => {
    const { team } = await importStageData(request);
    const made = await (await request.post("/api/diagrams", { data: { workspace: team, name: "scratch", doc: { version: 1 } } })).json();
    await page.goto(`/app/d/${made.id}`);
    await page.getByRole("button", { name: "scratch" }).click();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByRole("button", { name: "Delete diagram…" }).click();
    await expect(sheet).toContainText("Delete “scratch” and its history for good?");
    await sheet.getByRole("button", { name: "Delete for good" }).click();
    await expect(page).toHaveURL(url => url.pathname === "/app/" && url.searchParams.get("ws") === team);
    await expect(page.getByRole("link", { name: /scratch/ })).toHaveCount(0);
    expect((await request.get(`/api/diagrams/${made.id}`)).status()).toBe(404);
  });
});
