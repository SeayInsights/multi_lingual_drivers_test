/**
 * Lighthouse audit against a local concurrent static server, using
 * Playwright's Chromium over a CDP port. Writes JSON to --out (default
 * lighthouse.json in cwd) and prints category scores.
 *
 * Usage: node tests/run-lighthouse.mjs [--out path.json]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import lighthouse from "lighthouse";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8399;
const CDP = 9333;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "lighthouse.json";
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

const browser = await chromium.launch({ args: [`--remote-debugging-port=${CDP}`] });
try {
  const result = await lighthouse(`http://localhost:${PORT}/`, {
    port: CDP,
    onlyCategories: ["performance", "accessibility", "best-practices"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.6, disabled: false },
    output: "json",
    logLevel: "error",
  });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(OUT, result.report);
  const c = result.lhr.categories;
  console.log(`Performance:    ${Math.round(c.performance.score * 100)}`);
  console.log(`Accessibility:  ${Math.round(c.accessibility.score * 100)}`);
  console.log(`Best practices: ${Math.round(c["best-practices"].score * 100)}`);
  const a = result.lhr.audits;
  console.log(`FCP ${a["first-contentful-paint"].displayValue} | LCP ${a["largest-contentful-paint"].displayValue} | TBT ${a["total-blocking-time"].displayValue} | CLS ${a["cumulative-layout-shift"].displayValue}`);
} finally {
  await browser.close();
  server.close();
}
