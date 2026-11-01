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
  layout: { x: number; y: number; w?: number; h?: number };
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

/** A point on the canvas with nothing on it (no node, container, connection or control), on screen. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.locator(".canvas").evaluate(`(() => {
    const canvas = document.querySelector(".canvas");
    const r = canvas.getBoundingClientRect();
    for (let y = r.bottom - 60; y > r.top + 60; y -= 20)
      for (let x = r.right - 60; x > r.left + 60; x -= 20) {
        const el = document.elementFromPoint(x, y);
        if (el === canvas || (el && el.matches("[data-testid=diagram-sheet]"))) return { x, y };
      }
    return null;
  })()`);
  expect(spot).not.toBeNull();
  return spot as { x: number; y: number };
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
    views: { name: string; tags: string[]; locked?: boolean }[];
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

  test("draws the cards from one list request, without loading any diagram", async ({ page, request }) => {
    const { team } = await importStageData(request);
    const calls: string[] = [];
    page.on("request", r => {
      if (new URL(r.url()).pathname.startsWith("/api/diagrams")) calls.push(new URL(r.url()).pathname);
    });
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await expect(page.getByRole("link", { name: /ledger-platform \(DR drill\)/ })).toContainText("9 nodes");
    await expect(page.getByRole("link", { name: /^ledger-platform/ }).first().locator("rect")).not.toHaveCount(0);
    expect(calls).toEqual(["/api/diagrams"]);
  });

  test("searches a workspace's diagrams by name and by their nodes' names, and keeps the search in the address", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    const search = page.getByRole("searchbox", { name: "Search diagrams" });
    await search.fill("drill");
    await expect(page.getByTestId("diagram-count")).toHaveText("1 diagram with “drill”");
    await expect(page).toHaveURL(/[?&]q=drill/);
    await expect(search).toBeFocused();

    await search.fill("journal");
    await expect(page.getByRole("link", { name: /^ledger-platform/ })).toHaveCount(2);
    await expect(page.getByRole("link", { name: /ledger-platform \(DR drill\)/ })).toContainText("Has Journal DB");

    await search.fill("no such thing");
    await expect(page.getByRole("heading", { name: "Nothing matches “no such thing”" })).toBeVisible();
    await page.reload();
    await expect(search).toHaveValue("no such thing");
    await search.press("Escape");
    await expect(page.getByTestId("diagram-count")).toHaveText("3 diagrams");
  });

  test("shows the first sixty cards, and more on asking", async ({ page, request }) => {
    const diagrams = Array.from({ length: 65 }, (_, i) => ({ id: `d${i}`, doc: { version: 1, diagram: { name: `Diagram ${i}` } }, updated: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    const res = await request.post("/api/workspaces/import", { data: { format: "skope-backup", version: 1, workspaces: [{ name: "Many", diagrams }] } });
    const many = ((await res.json()) as { workspaces: { id: string }[] }).workspaces[0].id;
    await page.goto(`/app/?ws=${encodeURIComponent(many)}`);
    await expect(page.getByTestId("diagram-count")).toHaveText("60+ diagrams");
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(60);
    await expect(page.getByRole("link", { name: /Diagram 64/ })).toBeVisible();
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(65);
    await expect(page.getByRole("link", { name: /^Diagram 0/ })).toBeVisible();
    await expect(page.getByTestId("diagram-count")).toHaveText("65 diagrams");
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
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
    await expect(page.getByTestId("follow")).toContainText("synced to “Add the web firewall” · 2 changes to review");
    await page.getByTestId("follow").getByRole("link", { name: "edge-ingress" }).click();
    await expect(page).toHaveTitle("edge-ingress · Skope");
    await expect(page.getByRole("region", { name: "History" }).getByRole("button", { name: /Second region/ })).toBeVisible();
  });

  test("opens a deep link directly, and says when a diagram can't be found", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}?from=bookmark`);
    await expect(page.getByRole("button", { name: "Service: Edge Router" })).toBeVisible();
    await page.goto("/app/d/no-such-diagram");
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  });

  test("sends the site root to the app, and keeps the prototype at /prototype", async ({ page, request }) => {
    const root = await request.get("/", { maxRedirects: 0 });
    expect(root.status()).toBe(302);
    expect(root.headers().location).toMatch(/\/app\/$/);
    const prototype = await request.get("/prototype/");
    expect(prototype.status()).toBe(200);
    expect(await prototype.text()).toContain("Loading Skope");

    const { team } = await importStageData(request);
    await page.goto(`/?ws=${encodeURIComponent(team)}`);
    await expect(page).toHaveURL(/\/app\/\?ws=/);
    await expect(page.getByRole("heading", { name: "Platform team" })).toBeVisible();
    await page.locator("header .who").click();
    await expect(page.getByRole("menuitem", { name: "Open the prototype" })).toHaveAttribute("href", "/prototype/");
  });

  test("moves a node with the mouse and saves it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await expect(page.getByTestId("save-status")).toContainText("Saved · double-click the canvas to add a node");
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
    await expect(page.getByTestId("save-status")).toContainText("Saved · double-click the canvas to add a node");
    await expect(page).toHaveTitle("renamed elsewhere · Skope");
  });

  test("makes an access token under AI access, which then reads and writes as you until it's revoked", async ({ page, request }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "AI access" }).click();
    const sheet = page.getByRole("region", { name: "AI access" });
    await expect(sheet.getByText("http://localhost:8790/mcp").first()).toBeVisible();
    const name = `e2e ${Date.now()}`;
    await sheet.getByLabel("Name").fill(name);
    await sheet.getByRole("button", { name: "Create token" }).click();
    const token = await sheet.getByLabel("Your new token").inputValue();
    expect(token).toMatch(/^skt_/);
    await expect(sheet.getByLabel("Claude Code command")).toHaveValue(new RegExp(`Bearer ${token}`));

    const auth = { authorization: `Bearer ${token}` };
    const made = await request.post("/api/diagrams", { headers: auth, data: { workspace: "personal:e2e-owner@example.com", name: "made with a token", doc: { version: 1 } } });
    expect(made.status()).toBe(201);
    const { id } = await made.json();
    expect((await request.delete(`/api/diagrams/${id}`, { headers: auth })).status()).toBe(403);

    await sheet.getByRole("button", { name: "Done" }).click();
    await sheet.getByRole("button", { name: `Revoke ${name}…` }).click();
    await sheet.getByRole("button", { name: `Revoke “${name}”` }).click();
    await expect(sheet.getByText(name)).toHaveCount(0);
    expect((await request.get("/api/workspaces", { headers: auth })).status()).toBe(401);
    await request.delete(`/api/diagrams/${id}`);
  });

  test("lets an MCP client with a token from AI access add a node, which the editor shows", async ({ page, request }) => {
    const made = await (await request.post("/api/diagrams", { data: { workspace: "personal:e2e-owner@example.com", name: `mcp ${Date.now()}`, doc: { version: 1 } } })).json();
    const { token } = await (await request.post("/api/me/tokens", { data: { name: "e2e mcp", scope: "write" } })).json();
    const rpc = async (method: string, params: unknown) =>
      (await request.post("/mcp", { headers: { authorization: `Bearer ${token}` }, data: { jsonrpc: "2.0", id: 1, method, params } })).json();
    expect((await rpc("initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name).toBe("skope");
    const added = await rpc("tools/call", { name: "add_node", arguments: { diagram: made.id, name: "Billing Agent", type: "AI Agent" } });
    expect(added.result.structuredContent).toMatchObject({ nodes: 1 });

    await page.goto(`/app/d/${made.id}`);
    await expect(page.getByRole("button", { name: "AI Agent: Billing Agent" })).toBeVisible();
    await request.delete(`/api/diagrams/${made.id}`);
  });

  test("adds an AI Agent from the AI types, drawn with its own icon, and saves its type", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Add a node" });
    await menu.getByPlaceholder("Search all types…").fill("agent");
    await menu.getByRole("button", { name: "AI Agent" }).click();
    await expect(page.getByRole("button", { name: "AI Agent: New AI Agent" })).toBeVisible();
    const { doc } = await saved(page, request, id);
    expect(doc.nodes.find(n => n.name === "New AI Agent")).toMatchObject({ type: "ai-agent" });
  });

  test("adds a node, edits it in the inspector, and saves every field", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
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
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
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
    await manager.getByRole("button", { name: "More colours" }).click();
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

  test("starts a diagram from a template, with or without its example nodes", async ({ page, request }) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New diagram" }).click();
    let dialog = page.getByRole("dialog", { name: "New diagram" });
    await dialog.getByLabel("Name").fill("edge-plan");
    await dialog.getByRole("radio", { name: /Deployment topology/ }).click();
    await dialog.getByRole("checkbox", { name: "Include the example nodes" }).check();
    await dialog.getByRole("button", { name: "Create diagram" }).click();
    await expect(page).toHaveTitle("edge-plan · Skope");
    await expect(page.locator("[data-node]")).toHaveCount(4);
    await expect(page.getByText("VPC")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Full system/ })).toHaveAttribute("aria-pressed", "true");

    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New diagram" }).click();
    dialog = page.getByRole("dialog", { name: "New diagram" });
    await dialog.getByLabel("Name").fill("context-only");
    await dialog.getByRole("radio", { name: /C4 Context/ }).click();
    await dialog.getByRole("button", { name: "Create diagram" }).click();
    await expect(page).toHaveTitle("context-only · Skope");
    await expect(page.locator("[data-node]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Core only" })).toBeVisible();
    const made = await (await request.get(`/api/diagrams/${page.url().split("/d/")[1]}`)).json();
    expect(made.doc).toMatchObject({ diagram: { name: "context-only", kind: "C4" }, nodes: [], tags: { core: { label: "Core" } } });
  });

  test("rolls back to any edit of the visit from the edit list, and forward again", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const tools = page.getByRole("toolbar", { name: "Edit" });
    await tools.getByRole("button", { name: "Add database" }).click();
    await tools.getByRole("button", { name: "Add service" }).click();
    const edits = page.getByRole("region", { name: "Edits" });
    await expect(edits.getByRole("button", { name: /Add service/ })).toHaveAttribute("aria-current", "step");

    await edits.getByRole("button", { name: /As it was when opened/ }).click();
    await expect(page.getByRole("button", { name: /New (Database|Service)$/ })).toHaveCount(0);
    expect((await saved(page, request, id)).doc.nodes).toHaveLength(9);

    await edits.getByRole("button", { name: /Add database/ }).click();
    await expect(page.getByRole("button", { name: "Database: New Database" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Service: New Service" })).toHaveCount(0);
    await expect(edits.getByRole("button", { name: /Add service/ })).toContainText("Undone");
    await expect(tools.getByRole("button", { name: "Redo Add service" })).toBeVisible();
    expect((await saved(page, request, id)).doc.nodes).toHaveLength(10);
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

  test("makes a workspace, renames it, adds and removes a member, then deletes it", async ({ page, request }) => {
    // Start from a small workspace: the test user's personal one collects a copy of the stage data per test.
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "+ New workspace" }).click();
    const dialog = page.getByRole("dialog", { name: "New workspace" });
    const name = `Crew ${Date.now()}`;
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    const id = new URL(page.url()).searchParams.get("ws")!;

    await page.getByRole("button", { name: `Manage ${name}` }).click();
    let sheet = page.getByRole("dialog", { name });
    await sheet.getByLabel("Name").fill(`${name} renamed`);
    await sheet.getByLabel("Name").press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${name} renamed`);

    sheet = page.getByRole("dialog", { name: `${name} renamed` });
    await sheet.getByLabel("Email to add").fill("Friend@Example.com");
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sheet.getByRole("listitem").filter({ hasText: "friend@example.com" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspaces" }).getByRole("link", { name: new RegExp(`${name} renamed`) })).toContainText("2");
    await sheet.getByRole("button", { name: "Remove friend@example.com" }).click();
    await expect(sheet.getByRole("listitem").filter({ hasText: "friend@example.com" })).toHaveCount(0);

    await sheet.getByRole("button", { name: "Delete workspace…" }).click();
    await sheet.getByRole("button", { name: "Delete for good" }).click();
    // Deleting lands on the personal workspace, which is large for the test user (see above).
    await expect(page).toHaveURL(url => url.pathname === "/app/" && !url.searchParams.has("ws"), { timeout: 20_000 });
    await expect(page.getByRole("navigation", { name: "Workspaces" }).getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
    const left = (await (await page.request.get("/api/workspaces")).json()) as { id: string }[];
    expect(left.some(w => w.id === id)).toBe(false);
  });

  test("adds a workspace type with a library icon, uses it in a diagram, and gives one node its own icon", async ({ page, request }) => {
    const ws = await (await request.post("/api/workspaces", { data: { name: `Types ${Date.now()}` } })).json();
    await page.goto(`/app/?ws=${encodeURIComponent(ws.id)}`);
    await page.getByRole("button", { name: `Manage ${ws.name}` }).click();
    const types = page.getByRole("dialog", { name: ws.name }).getByRole("region", { name: "Types" });
    await types.getByRole("button", { name: "+ Add a type" }).click();
    await types.getByLabel("Name").fill("Billing Agent");
    await types.getByLabel("Category").fill("AI");
    await types.getByLabel("Search icons").fill("robot");
    await types.getByRole("button", { name: "Robot" }).click();
    await types.getByRole("button", { name: "Add type" }).click();
    await expect(types.getByRole("listitem").filter({ hasText: "Billing Agent" })).toBeVisible();
    await page.keyboard.press("Escape");

    const made = await (await request.post("/api/diagrams", { data: { workspace: ws.id, name: "agents", doc: { version: 1 } } })).json();
    await page.goto(`/app/d/${made.id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Add a node" });
    await menu.getByPlaceholder("Search all types…").fill("billing");
    await menu.getByRole("button", { name: "Billing Agent" }).click();
    await expect(page.getByRole("button", { name: "Billing Agent: New Billing Agent" })).toBeVisible();

    const inspector = page.getByRole("region", { name: "Selected node" });
    await inspector.getByRole("button", { name: /^Icon:/ }).click();
    await inspector.getByLabel("Search icons").fill("vault");
    await inspector.getByRole("button", { name: "Vault" }).click();
    await expect(inspector.getByRole("button", { name: "Icon: Vault" })).toBeVisible();
    const { doc } = await saved(page, request, made.id);
    expect(doc.nodes[0]).toMatchObject({ name: "New Billing Agent", type: "billing-agent", icon: "vault" });

    await page.reload();
    await page.getByRole("button", { name: "Billing Agent: New Billing Agent" }).click();
    await expect(page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: "Icon: Vault" })).toBeVisible();
    await request.delete(`/api/workspaces/${ws.id}`);
  });

  test("exports a workspace as a backup, and imports it back as a new workspace", async ({ page, request }, info) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    await page.getByRole("button", { name: "Manage Platform team" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("dialog", { name: "Platform team" }).getByRole("button", { name: "Export a backup" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("platform-team.skope-backup.json");
    const path = info.outputPath("backup.json");
    await file.saveAs(path);
    await page.keyboard.press("Escape");

    await page.getByLabel("Backup file to import").setInputFiles(path);
    await expect(page.getByRole("status")).toContainText("Imported “Platform team”: 3 diagrams.");
    await expect(page).not.toHaveURL(new RegExp(encodeURIComponent(team)));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Platform team");
    await expect(page.locator(".heading .n")).toHaveText("3 diagrams");
    await expect(page.getByRole("link", { name: /ledger-platform \(DR drill\)/ })).toContainText("Follows ledger-platform · paused");
  });

  test("says so when a file to import isn't a backup", async ({ page, request }, info) => {
    const { team } = await importStageData(request);
    await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
    const path = info.outputPath("notes.json");
    await import("node:fs/promises").then(fs => fs.writeFile(path, "not json"));
    await page.getByLabel("Backup file to import").setInputFiles(path);
    await expect(page.getByRole("alert")).toContainText("“notes.json” isn't a Skope backup");
  });
  test("adds a type in one click from the toolbar, undoes and redoes it, and connects with the Connect tool to empty canvas", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const tools = page.getByRole("toolbar", { name: "Edit" });
    const inspector = page.getByRole("region", { name: "Selected node" });
    await tools.getByRole("button", { name: "Add database" }).click();
    await expect(inspector.getByLabel("Name")).toHaveValue("New Database");
    await tools.getByRole("button", { name: "Undo Add database" }).click();
    await expect(page.getByRole("button", { name: "Database: New Database" })).toHaveCount(0);
    await tools.getByRole("button", { name: "Redo Add database" }).click();
    await expect(page.getByRole("button", { name: "Database: New Database" })).toHaveCount(1);

    const connectTool = tools.getByRole("button", { name: "Connect", exact: true });
    await connectTool.click();
    await expect(connectTool).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("save-status")).toContainText("Click the node to connect from");
    await page.getByRole("button", { name: "Service: Edge Router" }).click();
    await expect(page.getByTestId("save-status")).toContainText("Click the node to connect “Edge Router” to, or empty space for a new one");
    const spot = await emptySpot(page);
    await page.mouse.click(spot.x, spot.y);
    await expect(inspector.getByLabel("Name")).toHaveValue("New Service");
    await expect(connectTool).toHaveAttribute("aria-pressed", "false");
    const { doc } = await saved(page, request, id);
    const made = doc.nodes.filter(n => n.name === "New Service");
    expect(made).toHaveLength(1);
    expect(doc.edges.at(-1)).toEqual({ from: "edge", to: made[0].id });
  });

  test("makes a new node when a connection started from the port ends on empty canvas", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await page.locator(".port").click();
    const spot = await emptySpot(page);
    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByRole("region", { name: "Selected node" }).getByLabel("Name")).toHaveValue("New Service");
    const { doc } = await saved(page, request, id);
    expect(doc.edges.at(-1)!.from).toBe("journal");
  });

  test("double-click adds a node and names it, renames another in place, and the corner handle resizes it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const spot = await emptySpot(page);
    await page.mouse.dblclick(spot.x, spot.y);
    const name = page.getByRole("textbox", { name: "Name of New Service" });
    await expect(name).toBeFocused();
    await page.keyboard.type("Billing");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Service: Billing" })).toBeVisible();

    await page.getByRole("button", { name: "Database: Journal DB" }).dblclick();
    await page.getByRole("textbox", { name: "Name of Journal DB" }).fill("Ledger DB");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Telemetry: Collector" }).dblclick();
    await page.keyboard.type("Not this");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Telemetry: Collector" })).toBeVisible();

    await page.getByRole("button", { name: "Database: Ledger DB" }).click();
    await dragBy(page, ".n-resize", 60, 30);
    await expect(page.getByRole("button", { name: "Undo Resize “Ledger DB”" })).toBeVisible();
    const { doc } = await saved(page, request, id);
    expect(doc.nodes.find(n => n.name === "Billing")?.type).toBe("service");
    expect(doc.nodes.some(n => n.name === "Not this")).toBe(false);
    const journal = doc.nodes.find(n => n.id === "journal")!;
    expect(journal.name).toBe("Ledger DB");
    expect(journal.layout).toEqual({ x: 900, y: 150, w: 250, h: 118 });
  });

  test("switches snapping off from the zoom bar, and remembers it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const snap = page.getByRole("button", { name: "Snap nodes into line" });
    await expect(snap).toHaveAttribute("aria-pressed", "true");
    await snap.click();
    await expect(snap).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: "Snap nodes into line" })).toHaveAttribute("aria-pressed", "false");
  });
  test("picks many with shift-click, retags and moves them together, and deletes them", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Service: Edge Router" }).click();
    await page.getByRole("button", { name: "Service: Identity" }).click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Service: Postings Service" }).click({ modifiers: ["Shift"] });
    const picked = page.getByRole("region", { name: "Picked" });
    await expect(picked.getByRole("heading", { level: 2 })).toHaveText("3 nodes");
    await picked.getByRole("button", { name: "Put Async on all" }).click();
    await expect(picked.getByRole("button", { name: "Take Async off all" })).toBeVisible();

    await dragBy(page, '[data-node="edge"]', 0, 400);
    await expect(page.getByRole("button", { name: "Undo Move 3 nodes" })).toBeVisible();
    let { doc } = await saved(page, request, id);
    const at = (nid: string) => doc.nodes.find(n => n.id === nid)!;
    expect([at("edge").layout, at("identity").layout, at("postings").layout]).toEqual([
      { x: 340, y: 550, w: 190 },
      { x: 340, y: 760, w: 190 },
      { x: 620, y: 550, w: 190 }
    ]);
    expect(at("identity").tags).toEqual(["service", "auth", "async"]);

    await page.keyboard.press("Delete");
    await expect(picked).toHaveCount(0);
    ({ doc } = await saved(page, request, id));
    expect(doc.nodes.some(n => ["edge", "identity", "postings"].includes(n.id))).toBe(false);
    expect(doc.edges.some(e => ["edge", "identity", "postings"].includes(e.from) || ["edge", "identity", "postings"].includes(e.to))).toBe(false);
  });

  test("draws a box with Multi-select to pick, and Escape lets go", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const tool = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Multi-select" });
    await tool.click();
    await expect(page.getByTestId("save-status")).toContainText("Click to pick, or drag a box");
    const identity = (await page.locator('[data-node="identity"]').boundingBox())!;
    const balances = (await page.locator('[data-node="balances"]').boundingBox())!;
    await page.mouse.move(identity.x - 12, identity.y - 12);
    await page.mouse.down();
    await page.mouse.move(balances.x + balances.width / 2, balances.y + balances.height / 2, { steps: 8 });
    await page.mouse.up();
    const picked = page.getByRole("region", { name: "Picked" });
    await expect(picked.getByRole("heading", { level: 2 })).toContainText("2 nodes");
    await expect(page.getByRole("button", { name: "Service: Identity" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(picked).toHaveCount(0);
    await expect(tool).toHaveAttribute("aria-pressed", "false");
  });

  test("picks all with ⌘A, and copies and pastes in the diagram and into another one", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.locator(".canvas").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.getByRole("region", { name: "Picked" }).getByRole("heading", { level: 2 })).toHaveText("9 nodes");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("save-status")).toContainText("Copied 1 node");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.getByRole("button", { name: "Database: Journal DB" })).toHaveCount(2);
    let { doc } = await saved(page, request, id);
    const copies = doc.nodes.filter(n => n.name === "Journal DB");
    expect(copies.map(n => n.layout)).toEqual([
      { x: 900, y: 150, w: 190 },
      { x: 928, y: 178, w: 190 }
    ]);

    await page.getByRole("button", { name: "Service: Edge Router" }).click();
    await page.getByRole("button", { name: "Service: Postings Service" }).click({ modifiers: ["Shift"] });
    await page.keyboard.press("ControlOrMeta+c");
    await expect(page.getByTestId("save-status")).toContainText("Copied 2 nodes");

    const other = diagrams["edge-ingress (platform copy)"];
    await page.goto(`/app/d/${other}`);
    await page.locator(".canvas").focus();
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.getByRole("region", { name: "Picked" }).getByRole("heading", { level: 2 })).toHaveText("2 nodes");
    ({ doc } = await saved(page, request, other));
    const router = doc.nodes.find(n => n.name === "Edge Router")!;
    const postings = doc.nodes.find(n => n.name === "Postings Service")!;
    expect(doc.edges).toContainEqual({ from: router.id, to: postings.id, label: "gRPC", route: "straight" });
    expect(doc.tags.service).toEqual(expect.objectContaining({ label: "Service" }));
  });

  test("cuts with ⌘X and pastes back from the Add menu", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Database: Balance Cache" }).click();
    await page.keyboard.press("ControlOrMeta+x");
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toHaveCount(0);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("dialog", { name: "Add a node" }).getByRole("button", { name: /Paste 1 node/ }).click();
    await expect(page.getByRole("button", { name: "Database: Balance Cache" })).toHaveCount(1);
    const { doc } = await saved(page, request, id);
    // Cut leaves nothing behind to nudge from, so it lands around the middle of the view.
    expect(doc.nodes.filter(n => n.name === "Balance Cache")).toHaveLength(1);
  });
  test("reviews a followed diagram's updates: accepts one with what it needs, skips one, takes a verdict back, and catches up", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["edge-ingress (platform copy)"];
    await page.goto(`/app/d/${id}`);
    const panel = page.getByRole("region", { name: "Updates" });
    await expect(panel.getByRole("heading", { name: "Updates · 2" })).toBeVisible();
    const group = panel.getByRole("group", { name: "Snapshot Second region" });
    await expect(group.getByText("Skipped")).toBeVisible(); // Web Pool B, skipped before

    // Accepting the connection brings in Web Pool B too, which it needs.
    await group.getByRole("button", { name: "Accept Connect Load Balancer → Web Pool B" }).click();
    await expect(page.getByRole("button", { name: "Compute: Web Pool B" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Undo Accept/ })).toBeVisible();
    await group.getByRole("button", { name: "Skip Add container “TWO REGIONS”" }).click();
    await group.getByRole("button", { name: "Take back accepting Connect Load Balancer → Web Pool B" }).click();
    let { doc } = await saved(page, request, id);
    expect(doc.nodes.some(n => n.id === "pool-b")).toBe(true);
    expect(doc.edges).toContainEqual({ from: "lb", to: "pool-b", label: "HTTP" });
    let d = (await (await request.get(`/api/diagrams/${id}`)).json()) as { decided: Record<string, string>; syncedSnapshotId: string };
    expect(Object.entries(d.decided).map(([k, v]) => [k.split(":").slice(1).join(":"), v]).sort()).toEqual([
      ["ba:regions", "skipped"],
      ["na:pool-b", "accepted"]
    ]);

    await panel.getByRole("button", { name: "Mark everything reviewed" }).click();
    await expect(panel.getByText("Up to date with edge-ingress.")).toBeVisible();
    await expect(page.getByTestId("follow")).toContainText("synced to “Second region” · up to date");
    await saved(page, request, id);
    d = await (await request.get(`/api/diagrams/${id}`)).json();
    const lead = (await (await request.get(`/api/diagrams/${diagrams["edge-ingress (platform copy)"]}`)).json()) as { leadId: string };
    const snaps = (await (await request.get(`/api/diagrams/${lead.leadId}/snapshots`)).json()) as { id: string }[];
    expect(d.syncedSnapshotId).toBe(snaps.at(-1)!.id);
  });

  test("pauses following, and unlinks after asking", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["edge-ingress (platform copy)"];
    await page.goto(`/app/d/${id}`);
    const panel = page.getByRole("region", { name: "Updates" });
    await panel.getByLabel("Keep pulling in future updates").uncheck();
    await expect(page.getByTestId("follow")).toContainText("paused");
    await panel.getByRole("button", { name: "Unlink" }).click();
    await panel.getByRole("group", { name: "Stop following" }).getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByTestId("follow")).toHaveCount(0);
    await expect(panel).toHaveCount(0);
    await saved(page, request, id);
    const d = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(d).toMatchObject({ leadId: null, syncedSnapshotId: null, paused: false, decided: {} });
    await page.reload();
    await expect(page.getByTestId("follow")).toHaveCount(0);
  });
  test("presents a diagram: the canvas alone, a node's detail on hover, views to switch, and Escape to come back", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    const bar = page.getByRole("region", { name: "Presenting" });
    await expect(bar).toContainText("ledger-platform");
    await expect(page.getByTestId("save-status")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Views and tags" })).toHaveCount(0);

    await page.locator('[data-node="journal"]').hover();
    const tip = page.getByRole("tooltip", { name: "About Journal DB" });
    await expect(tip).toContainText("Append-only journal");
    await expect(tip).toContainText("Postings Service");
    await page.locator('[data-node="collector"]').hover();
    await expect(page.getByRole("tooltip", { name: "About Collector" })).toBeVisible();
    await expect(tip).toHaveCount(0);

    await bar.getByLabel("View").selectOption("On call");
    await expect(page.locator('[data-node="journal"]')).toHaveCSS("opacity", "0.22");
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "On call", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("opens on the view a link names, and copies such a link from the diagram sheet", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}?view=Events`);
    await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "ledger-platform" }).click();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await expect(sheet.getByLabel("Link to this diagram")).toHaveValue(new RegExp(`/app/d/${id}\\?view=Events$`));
    await sheet.getByLabel("Open on the view “Events”").uncheck();
    await expect(sheet.getByLabel("Link to this diagram")).toHaveValue(new RegExp(`/app/d/${id}$`));
  });

  test("locks editing on this device until unlocked, picking and views still working", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "ledger-platform" }).click();
    await page.getByRole("dialog", { name: "Diagram" }).getByLabel("Lock editing on this device").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("save-status")).toContainText("Locked on this device");
    await expect(page.getByRole("toolbar", { name: "Edit" })).toHaveCount(0);

    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    const inspector = page.getByRole("region", { name: "Selected node" });
    await expect(inspector).toBeVisible();
    await expect(inspector.getByLabel("Name")).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("button", { name: "Database: Journal DB" })).toBeVisible();
    await page.getByRole("button", { name: "Events", exact: true }).click();
    await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByTestId("save-status")).toContainText("Locked on this device");
    await page.getByTestId("save-status").getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("toolbar", { name: "Edit" })).toBeVisible();
  });

  test("locks a view, so it can be shown but not renamed or deleted, and unlocks it", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Write path", exact: true }).click();
    await page.getByRole("button", { name: "Edit view Write path" }).click();
    const editor = page.getByRole("group", { name: "Edit view Write path" });
    await editor.getByLabel("Lock this view").check();
    await expect(editor.getByLabel("View name")).toBeDisabled();
    await expect(editor.getByRole("button", { name: "Delete view" })).toHaveCount(0);
    let { doc } = await saved(page, request, id);
    expect(doc.views.find(v => v.name === "Write path")).toEqual({ name: "Write path", tags: ["web", "service", "data", "auth"], locked: true });
    await editor.getByLabel("Lock this view").uncheck();
    await expect(editor.getByRole("button", { name: "Delete view" })).toBeVisible();
    ({ doc } = await saved(page, request, id));
    expect(doc.views.find(v => v.name === "Write path")).toEqual({ name: "Write path", tags: ["web", "service", "data", "auth"] });
  });
  test("exports the diagram as it shows now, as a PNG and an SVG", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}?view=On%20call`);
    await page.getByRole("button", { name: "ledger-platform" }).click();
    const sheet = page.getByRole("dialog", { name: "Diagram" });

    const [png] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Download PNG" }).click()]);
    expect(png.suggestedFilename()).toBe("ledger-platform-On-call.png");
    const bytes = await import("node:fs/promises").then(fs => png.path().then(p => fs.readFile(p)));
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // a PNG
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(1000); // drawn at twice the diagram's size

    await sheet.getByLabel("Keep what the view switches off, faintly").uncheck();
    const [svg] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Download SVG" }).click()]);
    const text = await import("node:fs/promises").then(fs => svg.path().then(p => fs.readFile(p, "utf8")));
    const parsed = await page.evaluate(src => {
      const d = new DOMParser().parseFromString(src, "image/svg+xml");
      return { ok: !d.querySelector("parsererror"), texts: [...d.querySelectorAll("text")].map(t => t.textContent) };
    }, text);
    expect(parsed.ok).toBe(true);
    expect(parsed.texts).toEqual(expect.arrayContaining(["Edge Router", "Collector", "gRPC"]));
    expect(parsed.texts).not.toContain("Journal DB"); // switched off by On call, and left out
    await expect(page.getByTestId("save-status")).toContainText("Downloaded ledger-platform-On-call.svg");
  });
  test("edits the diagram as YAML from the toolbar, undoes it, merges in a JSON file, and downloads the config", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Config" }).click();
    const config = page.getByRole("region", { name: "Config" });
    const text = config.getByLabel("Config text");
    await expect(text).toHaveValue(/# ledger-platform: a Skope diagram config/);
    await text.fill((await text.inputValue()).replace("name: Journal DB", "name: Ledger Journal"));
    await config.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("button", { name: "Database: Ledger Journal" })).toBeVisible();
    await page.getByRole("button", { name: "Undo Replace from the config" }).click();
    await expect(page.getByRole("button", { name: "Database: Journal DB" })).toBeVisible();

    await config.getByLabel("Merge it in").check();
    await config.getByLabel("Config file to open").setInputFiles({
      name: "audit.skope.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ nodes: [{ id: "audit", name: "Audit Log", type: "log-sink", layout: { x: 900, y: 600 } }], edges: [{ from: "journal", to: "audit", label: "copies" }] }))
    });
    await expect(config.getByRole("status")).toContainText("Loaded audit.skope.json");
    await config.getByRole("button", { name: "Apply" }).click();
    await expect(config.getByRole("status")).toContainText("Merged in: 1 new node, 1 new connection");
    await expect(page.getByRole("button", { name: "Log Sink: Audit Log" })).toBeVisible();
    const { doc } = await saved(page, request, id);
    expect(doc.nodes).toHaveLength(10);
    expect(doc.edges.at(-1)).toEqual({ from: "journal", to: "audit", label: "copies" });

    await config.getByRole("radio", { name: "JSON" }).click();
    const [file] = await Promise.all([page.waitForEvent("download"), config.getByRole("button", { name: "Download .skope.json" }).click()]);
    expect(file.suggestedFilename()).toBe("ledger-platform.skope.json");
    const body = JSON.parse(await import("node:fs/promises").then(fs => file.path().then(p => fs.readFile(p, "utf8"))));
    expect(body.nodes.map((n: { id: string }) => n.id)).toContain("audit");
  });
  test("saves a name and title from the profile in the menu", async ({ page, request }) => {
    const before = (await (await request.get("/api/me")).json()) as { name: string; title: string };
    // A diagram page rather than home: the personal workspace collects a copy of the stage data per test.
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.locator("header .who").click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    const sheet = page.getByRole("dialog", { name: "Profile and appearance" });
    await expect(sheet.getByLabel("Email")).toHaveValue("e2e-owner@example.com");
    await sheet.getByLabel("Name").fill("Ada Tester");
    await sheet.getByLabel("Title").fill("Platform engineer");
    await sheet.getByRole("button", { name: "Save profile" }).click();
    await expect(sheet.getByRole("status")).toHaveText("Saved");
    await expect(page.getByRole("button", { name: "Ada Tester" })).toBeVisible();
    expect(await (await request.get("/api/me")).json()).toMatchObject({ name: "Ada Tester", title: "Platform engineer" });
    await request.put("/api/me", { data: { name: before.name || "e2e-owner", title: before.title } });
  });

  test("switches to the light theme and simulates a colour-vision condition, which also thins the tag colours", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.getByRole("button", { name: "Manage tags" }).click();
    const manager = page.getByRole("dialog", { name: "Manage tags" });
    await manager.getByRole("button", { name: /^Colour of/ }).first().click();
    const all = await manager.getByRole("group", { name: /^Colours for/ }).getByRole("button").count();
    await manager.getByRole("button", { name: "Close Manage tags" }).click();

    await page.locator("header .who").click();
    await page.getByRole("menuitem", { name: "Appearance" }).click();
    const sheet = page.getByRole("dialog", { name: "Profile and appearance" });
    await sheet.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(242, 243, 249)");

    const simulate = sheet.getByRole("checkbox", { name: /Simulate it/ });
    await expect(simulate).toBeDisabled();
    await sheet.getByRole("radio", { name: "Deuteranopia" }).click();
    await expect(sheet).toContainText("struck from the tag colour pickers");
    await simulate.check();
    await expect(page.locator("html")).toHaveAttribute("data-cvd", "deuter");
    await expect(page.locator(".app")).toHaveCSS("filter", /url\("?#cvd-deuter"?\)/);
    await sheet.getByRole("button", { name: "Close Profile and appearance" }).click();

    // Kept by this browser.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-cvd", "deuter");

    await page.getByRole("button", { name: "Manage tags" }).click();
    await manager.getByRole("button", { name: /^Colour of/ }).first().click();
    const kept = await manager.getByRole("group", { name: /^Colours for/ }).getByRole("button").count();
    expect(kept).toBeLessThan(all);
    await expect(manager).toContainText("hard to tell apart");
  });

  test("presents with icon-only cards, switched from the presenting bar", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const journal = page.locator('[data-node="journal"]');
    await page.getByRole("button", { name: "Present", exact: true }).click();
    const bar = page.getByRole("region", { name: "Presenting" });
    const icons = bar.getByRole("button", { name: "Icon-only cards" });
    await expect(icons).toHaveAttribute("aria-pressed", "false");
    const full = (await journal.boundingBox())!;
    await icons.click();
    await expect(bar).toContainText("Presenting · icon cards");
    await expect(journal).toHaveClass(/icon-only/);
    const small = (await journal.boundingBox())!;
    expect(small.width).toBeLessThan(full.width);
    expect(Math.abs(small.x + small.width / 2 - (full.x + full.width / 2))).toBeLessThan(2);
    await journal.hover();
    await expect(page.getByRole("tooltip", { name: "About Journal DB" })).toBeVisible();

    // Editing keeps full cards; presenting again remembers the choice.
    await page.keyboard.press("Escape");
    await expect(journal).not.toHaveClass(/icon-only/);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(journal).toHaveClass(/icon-only/);
  });

  test("drags a connection's end along its box to pin it, and double-clicks it back to auto", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "Web App: Ledger Console" }).click();
    await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: /Edge Router/ }).click();
    const inspector = page.getByRole("region", { name: "Selected connection" });
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Ledger Console → Edge Router");
    const end = page.locator('.end-handle[data-end="to"]');
    await expect(end).not.toHaveClass(/pinned/);
    const at = (await end.boundingBox())!;
    await page.mouse.move(at.x + 6, at.y + 6);
    await page.mouse.down();
    await page.mouse.move(at.x + 6, at.y + 40, { steps: 6 });
    await page.mouse.up();
    await expect(end).toHaveClass(/pinned/);
    let { doc } = await saved(page, request, id);
    expect(doc.edges[0].anchors?.to).toMatch(/^(left|bottom):/);

    await end.dblclick();
    await expect(end).not.toHaveClass(/pinned/);
    ({ doc } = await saved(page, request, id));
    expect(doc.edges[0].anchors?.to).toBeUndefined();
    await expect(page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Undo Connection end back to auto" })).toBeVisible();
  });

  test("shows a node's card on a mouse resting over it while editing, and isolates its tags", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    await page.locator('[data-node="journal"]').hover();
    await expect(page.getByRole("tooltip", { name: "About Journal DB" })).toBeVisible();
    await page.mouse.move(5, 300);
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    await page.getByRole("button", { name: "Database: Journal DB" }).click();
    await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: "Isolate its tags" }).click();
    await expect(page.locator('[data-node="collector"]')).toHaveCSS("opacity", "0.22");
    await expect(page.locator('[data-node="journal"]')).toHaveCSS("opacity", "1");
  });

  test("looks around from the minimap, and folds the side panels away until shown again", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const zoom = page.getByRole("group", { name: "Zoom" });
    for (let i = 0; i < 4; i++) await zoom.getByRole("button", { name: "Zoom in" }).click();
    const console_ = page.locator('[data-node="console"]');
    const before = (await console_.boundingBox())!;
    const mini = page.getByRole("img", { name: /^Minimap/ });
    const m = (await mini.boundingBox())!;
    await page.mouse.click(m.x + m.width - 4, m.y + m.height - 4);
    const after = (await console_.boundingBox())!;
    expect(after.x).toBeLessThan(before.x - 100);

    await page.getByRole("button", { name: "Hide views and tags" }).click();
    await page.getByRole("button", { name: "Hide the side panel" }).click();
    await expect(page.getByRole("complementary", { name: "Views and tags" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Show views and tags" })).toBeVisible();
    await expect(page.getByRole("region", { name: "History" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show views and tags" }).click();
    await page.getByRole("button", { name: "Show the side panel" }).click();
    await expect(page.getByRole("complementary", { name: "Views and tags" })).toBeVisible();
    await expect(page.getByRole("region", { name: "History" })).toBeVisible();
  });

  test("moves a diagram with its history to another workspace from its sheet", async ({ page, request }) => {
    const { diagrams, team } = await importStageData(request);
    const id = diagrams["edge-ingress (platform copy)"];
    await page.goto(`/app/d/${id}`);
    await page.getByRole("button", { name: "edge-ingress (platform copy)" }).click();
    const sheet = page.getByRole("dialog", { name: "Diagram" });
    await sheet.getByLabel("Move to").selectOption("Personal");
    await sheet.getByRole("button", { name: "Move the diagram" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Personal" })).toBeVisible();
    const moved = await (await request.get(`/api/diagrams/${id}`)).json();
    expect(moved.workspaceId).toBe("personal:e2e-owner@example.com");
    expect(moved.leadId).toBeTruthy();
    const left = (await (await request.get(`/api/diagrams?workspace=${encodeURIComponent(team)}`)).json()) as { id: string }[];
    expect(left.map(d => d.id)).not.toContain(id);
  });

  test("switches the tag palette from Manage tags, recolouring every tag as one undo step", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    const id = diagrams["ledger-platform"];
    await page.goto(`/app/d/${id}`);
    const before = (await saved(page, request, id)).doc.tags;
    await page.getByRole("button", { name: "Manage tags" }).click();
    const manager = page.getByRole("dialog", { name: "Manage tags" });
    await expect(manager.getByRole("radio", { name: /Nocturne/ })).toHaveAttribute("aria-checked", "true");
    await manager.getByRole("radio", { name: /Accessible/ }).click();
    await expect(manager.getByRole("radio", { name: /Accessible/ })).toHaveAttribute("aria-checked", "true");
    const after = (await saved(page, request, id)).doc.tags;
    const okabe = ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#3d8fd1", "#e06c2f", "#cc79a7", "#adb3c2"];
    expect(Object.values(after).every(t => okabe.includes(t.color))).toBe(true);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    await manager.getByRole("button", { name: "Close Manage tags" }).click();
    await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Undo Switch to the Accessible palette" }).click();
    expect((await saved(page, request, id)).doc.tags).toEqual(before);
  });

  test("opens the account menu from your name, and closes it on a click elsewhere or Escape", async ({ page, request }) => {
    const { diagrams } = await importStageData(request);
    await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
    const who = page.locator("header .who");
    await who.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("main", { name: "Diagram" }).click({ position: { x: 400, y: 500 } });
    await expect(page.getByRole("menu")).toHaveCount(0);
    await who.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await who.click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await expect(page.getByRole("dialog", { name: "Profile and appearance" })).toBeVisible();
  });
});
