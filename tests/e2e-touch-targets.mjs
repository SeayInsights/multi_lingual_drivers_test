/**
 * Touch-target regression check (Playwright): every interactive element on
 * every surface must render at >= 40px in both dimensions (brief target 48px
 * for primary controls; 40px floor accounts for inline text links inside
 * cards that carry padding).
 *
 * Usage: node tests/e2e-touch-targets.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8412;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep)) throw new Error("traversal");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(PORT, r));

const MIN = 40;
const offenders = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 412, height: 850 } })).newPage();

async function sweep(name) {
  await page.waitForTimeout(300);
  const small = await page.evaluate((min) => {
    const out = [];
    for (const el of document.querySelectorAll("button, a, input")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.height < min || r.width < min)) {
        out.push(`${el.tagName}:${(el.textContent || el.id || el.className || "").trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  }, MIN);
  console.log(`${name}: ${small.length ? "✗ " + small.join("; ") : "✓ all targets >= " + MIN + "px"}`);
  offenders.push(...small.map((s) => `${name}: ${s}`));
}

await page.goto(`http://localhost:${PORT}/#/home`, { waitUntil: "networkidle" });
await sweep("home");
await page.evaluate(() => { location.hash = "#/study"; });
await page.waitForSelector("[data-act=topic]");
await sweep("study-topics");
await page.click("[data-act=topic][data-cat=signs]");
await page.waitForSelector(".choice");
await sweep("study-question");
await page.evaluate(() => { location.hash = "#/test"; });
await page.waitForSelector("[data-act=begin]");
await sweep("test-intro");
await page.goto(`http://localhost:${PORT}/404.html`, { waitUntil: "networkidle" });
await sweep("404");

await browser.close();
server.close();
if (offenders.length) { console.error(`\n${offenders.length} sub-${MIN}px targets`); process.exit(1); }
console.log("\nTouch-target check passed.");
