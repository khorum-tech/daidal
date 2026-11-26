import type { Locator, Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "app/static/docs-images";
/** Each picture's width and height, which the docs give its <img> so the page keeps room for it while it loads. */
const SIZES = "app/src/lib/docs/image-sizes.json";

/** Writes [name]'s width and height, read from the PNG it was saved as, into image-sizes.json. */
function recordSize(name: string, path: string) {
  const png = readFileSync(path);
  const sizes = JSON.parse(readFileSync(SIZES, "utf8")) as Record<string, [number, number]>;
  sizes[`${name}.png`] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  const lines = Object.keys(sizes)
    .sort()
    .map(k => `  ${JSON.stringify(k)}: [${sizes[k][0]}, ${sizes[k][1]}]`);
  writeFileSync(SIZES, `{\n${lines.join(",\n")}\n}\n`);
}

/** A picture for the docs: the page, or one part of it, saved as app/static/docs-images/<name>.png. */
export async function shot(page: Page, name: string, part?: Locator) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const path = `${OUT}/${name}.png`;
  // A close-up leaves out the minimap, which floats over whatever sits in the canvas's corner.
  if (part) await part.screenshot({ path, animations: "disabled", style: ".minimap { visibility: hidden !important; }" });
  else await page.screenshot({ path, animations: "disabled" });
  recordSize(name, path);
}
