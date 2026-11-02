import type { Locator, Page } from "@playwright/test";

const OUT = "app/static/docs-images";

/** A picture for the docs: the page, or one part of it, saved as app/static/docs-images/<name>.png. */
export async function shot(page: Page, name: string, part?: Locator) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const path = `${OUT}/${name}.png`;
  // A close-up leaves out the minimap, which floats over whatever sits in the canvas's corner.
  if (part) await part.screenshot({ path, animations: "disabled", style: ".minimap { visibility: hidden !important; }" });
  else await page.screenshot({ path, animations: "disabled" });
}
