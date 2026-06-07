import { expect, test } from "@playwright/test";
import sharp from "sharp";

async function meanRgb(png: Buffer) {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    r += data[index] ?? 0;
    g += data[index + 1] ?? 0;
    b += data[index + 2] ?? 0;
    count += 1;
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
}

test("avatar recolor harness visibly changes torso pixels", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/dev/avatar-recolor", { waitUntil: "commit" });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  const before = await page.locator("canvas").screenshot();
  const beforeMean = await meanRgb(before);

  await page.locator("input[type='color']").evaluateAll((inputs) => {
    for (const input of inputs) {
      const element = input as HTMLInputElement;
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      descriptor?.set?.call(element, "#80ff00");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.waitForTimeout(1000);

  const after = await page.locator("canvas").screenshot();
  const afterMean = await meanRgb(after);

  expect(afterMean.g - beforeMean.g).toBeGreaterThan(8);
});
