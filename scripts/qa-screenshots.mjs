import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/operations/screenshots";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push({ width, error: e.message }));
    for (const [name, path] of [
      ["home", "/"],
      ["classes", "/classes"],
      ["detail", "/classes/math-1"],
      ["parent", "/parent"],
      ["learn", "/learn"],
      ["academy", "/academy"],
    ]) {
      await page.goto("http://127.0.0.1:3000" + path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.close();
  }
  await writeFile(
    "docs/operations/browser-errors.json",
    JSON.stringify(errors, null, 2),
  );
  console.log(JSON.stringify({ screenshots: 12, pageErrors: errors }));
} finally {
  await browser.close();
}
