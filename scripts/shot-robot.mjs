import { chromium } from "playwright";

const out = process.argv[2] || "/tmp/robot.png";
const state = process.argv[3] || "idle"; // idle | thinking | speaking
const zoom = Number(process.argv[4] ?? 6); // wheel steps toward the head

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR:", m.text()); });

await page.goto("http://localhost:3000/dev/ai-host-hero", { waitUntil: "commit", timeout: 60000 });
await page.waitForSelector("canvas", { timeout: 45000 });
await page.waitForTimeout(3500);

// Stop auto-rotate for a stable front view. (Placement ghost defaults OFF — leave it.)
try { await page.locator('label:has-text("Auto-rotate camera") input[type=checkbox]').click({ timeout: 2000 }); } catch {}

// Pick animation state.
if (state !== "idle") {
  try { await page.getByRole("button", { name: new RegExp(`^${state}$`, "i") }).click({ timeout: 2000 }); } catch {}
}

await page.waitForTimeout(1000);

// Zoom the camera in toward the head so eye detail is legible.
await page.mouse.move(700, 430);
for (let i = 0; i < zoom; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(80); }
await page.waitForTimeout(900);

await page.screenshot({ path: out });
console.log("wrote", out);
await browser.close();
