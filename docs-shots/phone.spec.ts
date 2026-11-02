import { expect, test } from "@playwright/test";
import { importStageData } from "../e2e/support";
import { shot } from "./support";

test("the editor on a phone", async ({ page, request }) => {
  const { diagrams } = await importStageData(request);
  await page.goto(`/app/d/${diagrams["ledger-platform"]}`);
  await expect(page.getByTestId("save-status")).toContainText("Saved");
  await shot(page, "phone-editor");
  await page.getByRole("button", { name: "Database: Journal DB" }).tap();
  await expect(page.getByTestId("node-menu")).toBeVisible();
  await shot(page, "phone-node-menu");
});
