/**
 * WO 8 offline verification (Playwright): serves the repo locally, loads the
 * app in Chromium, waits for the service worker to precache, then cuts the
 * network and proves a full study flow still works from cache.
 *
 * Usage: node tests/e2e-offline.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8391;
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

const fails = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 460, height: 860 } });
try {
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

  // SW registers ~1.5s after load (idle); wait for active + precache complete
  const swInfo = await page.evaluate(async () => {
    for (let i = 0; i < 90; i++) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        const keys = await caches.keys();
        const name = keys.find((k) => k.startsWith("mldt-"));
        if (name) {
          const cached = await (await caches.open(name)).keys();
          if (cached.some((r) => r.url.includes("questions.json")) &&
              cached.filter((r) => r.url.includes("traffic_signs")).length > 0) {
            return { name, count: cached.length, signs: cached.filter((r) => r.url.includes("traffic_signs")).length };
          }
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  });
  check("service worker precached shell+data+signs", !!swInfo, swInfo ? `${swInfo.count} entries incl. ${swInfo.signs} signs` : "timeout");

  // go fully offline, reload, run a study interaction from cache
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tabbar a", { timeout: 10000 });
  check("offline reload renders the shell", true);

  await page.evaluate(() => { location.hash = "#/study"; });
  await page.waitForSelector("[data-act=topic]", { timeout: 10000 });
  check("offline study topics render (questions.json from cache)", true);

  await page.click("[data-act=topic][data-cat=signs]");
  await page.waitForSelector(".choice", { timeout: 10000 });
  const signOk = await page.evaluate(() => {
    const img = document.querySelector("#study-root img");
    return img ? img.complete && img.naturalWidth > 0 : "no-sign-question-first";
  });
  check("offline question card works, sign image from cache", signOk === true || signOk === "no-sign-question-first", String(signOk));

  await page.click(".choice");
  await page.waitForSelector("[data-act=next]", { timeout: 5000 });
  check("offline answering + explanation works", true);
} finally {
  await browser.close();
  server.close();
}

if (fails.length) { console.error(`\n${fails.length} FAILED: ${fails.join("; ")}`); process.exit(1); }
console.log("\nOffline e2e passed.");
