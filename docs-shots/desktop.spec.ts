import { expect, test } from "@playwright/test";
import { importStageData } from "../e2e/support";
import { shot } from "./support";

test.describe.configure({ mode: "serial" });

test("the editor and its panels", async ({ page, request }) => {
  const { team, diagrams } = await importStageData(request);
  const id = diagrams["ledger-platform"];
  await page.goto(`/app/d/${id}`);
  await expect(page.getByTestId("save-status")).toContainText("Saved");
  await shot(page, "editor");

  // Presenting.
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.getByRole("region", { name: "Presenting" })).toBeVisible();
  await page.locator('[data-node="journal"]').hover();
  await expect(page.getByRole("tooltip", { name: "About Journal DB" })).toContainText("Append-only journal");
  await page.screenshot({ path: "app/static/docs-images/presenting.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Presenting" })).toHaveCount(0);

  // Adding a node: the type picker.
  await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();
  await shot(page, "add-node", page.getByRole("dialog", { name: "Add a node" }));
  await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Add", exact: true }).click();

  // A node's details.
  await page.getByRole("button", { name: "Database: Journal DB" }).click();
  await shot(page, "node-details", page.locator("aside.right"));

  // A connection's details, picked from the node's list.
  await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: /Postings Service/ }).click();
  await shot(page, "connection-details", page.getByRole("region", { name: "Selected connection" }));
  await page.keyboard.press("Escape");

  // A container's details.
  await page.locator("[data-box].b-hit.l").first().click();
  await expect(page.getByRole("region", { name: "Selected container" })).toBeVisible();
  await shot(page, "container-selected");
  await page.locator(".canvas").click({ position: { x: 30, y: 600 } });

  // Tags and views, with one tag off.
  await shot(page, "tags-panel", page.getByRole("complementary", { name: "Views and tags" }));

  // The icon picker in a node's details.
  await page.getByRole("button", { name: "Database: Journal DB" }).click();
  await page.getByRole("region", { name: "Selected node" }).getByRole("button", { name: /^Icon:/ }).click();
  await shot(page, "icon-picker", page.locator("aside.right"));
  await page.locator(".canvas").click({ position: { x: 30, y: 600 } });

  // History, with snapshots.
  await shot(page, "history", page.locator("aside.right"));

  // The config.
  await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Config" }).click();
  await shot(page, "config", page.getByRole("region", { name: "Config" }));
  await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Config" }).click();


  // Home: the workspace's diagrams.
  await page.goto(`/app/?ws=${encodeURIComponent(team)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Platform team");
  await shot(page, "home");

  // The workspace sheet, with a type of its own.
  await request.put(`/api/workspaces/${encodeURIComponent(team)}/types/billing-agent`, { data: { name: "Billing Agent", category: "AI", icon: "robot" } });
  await page.reload();
  await page.getByRole("button", { name: "Manage Platform team" }).click();
  const sheet = page.getByRole("dialog", { name: "Platform team" });
  await sheet.getByRole("region", { name: "Types" }).scrollIntoViewIfNeeded();
  await shot(page, "workspace-sheet", sheet);
});
