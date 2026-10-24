import { expect, test } from "@playwright/test";
import { importStageData } from "./support";

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
    await expect(page.getByRole("region", { name: "Selected node" })).toContainText("Append-only journal");
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
});
