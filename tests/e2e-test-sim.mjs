/**
 * Local e2e: drives the full BMV test simulation in a real (headless) browser
 * against a local static server — verifies WO 7 end-to-end without depending
 * on GitHub Pages availability.
 *
 * Usage: node tests/e2e-test-sim.mjs [--serve-port 8377]
 * Requires: puppeteer-core (dev dep) + installed Edge/Chrome.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[process.argv.indexOf("--serve-port") + 1]) || 8377;
const BROWSER = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT + sep) && file !== join(ROOT, "index.html")) throw new Error("traversal");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(PORT, r));

const fails = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: [
    "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(process.env.TEMP ?? "/tmp", "mldt-e2e-profile")}`,
  ],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => fails.push(`pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/#/test`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-act=begin]", { timeout: 10000 });

  check("intro renders with timer option", await page.$("#timer-opt") !== null);

  // begin (timer off)
  await page.click("[data-act=begin]");
  await page.waitForSelector(".choice");
  const counter1 = await page.$eval("#test-root strong", (el) => el.innerText);
  check("test starts at question 1/40", counter1.includes("1/40"), counter1);

  // flag q1, then answer all 40 (first choice; auto-advances)
  await page.click("[data-act=flag]");
  check("flag toggles", (await page.$eval("[data-act=flag]", (el) => el.innerText)).includes("🚩"));

  let sawNoFeedback = true;
  for (let i = 0; i < 40; i++) {
    await page.waitForSelector(".choice");
    await page.click(".choice");
    // no instant feedback allowed in test mode
    if (await page.$("#feedback *")) sawNoFeedback = false;
    await new Promise((r) => setTimeout(r, 30));
  }
  check("no instant feedback during test", sawNoFeedback);

  // review screen (flagged chip present), then submit
  await page.waitForSelector("[data-act=submit]", { timeout: 5000 });
  check("review-before-submit renders", true);
  await page.click("[data-act=submit]");
  await page.waitForFunction(() => document.querySelector("#test-root .card h2") !== null, { timeout: 10000 });

  const results = await page.evaluate(() => document.getElementById("test-root").innerText);
  check("results show overall score /40", /\/\s*40|\/40/.test(results), results.slice(0, 80).replace(/\n/g, " "));
  const sectionLines = results.match(/1?\d\/20/g) ?? [];
  check("results show two per-section scores /20", sectionLines.length >= 2, sectionLines.join(", "));
  check("verdict shown (pass or fail)", /ĐẬU|Chưa đậu|PASSED|Not yet/i.test(results));

  // events + summary persisted
  const stored = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("mldt"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const count = await new Promise((res) => { const tx = db.transaction("answer_events", "readonly"); const rq = tx.objectStore("answer_events").index("by_mode").count(IDBKeyRange.only("test")); rq.onsuccess = () => res(rq.result); });
    const hist = await new Promise((res) => { const tx = db.transaction("settings", "readonly"); const rq = tx.objectStore("settings").get("test.history"); rq.onsuccess = () => res(rq.result?.value ?? null); });
    return { count, historyLen: Array.isArray(hist) ? hist.length : 0, last: Array.isArray(hist) ? hist[hist.length - 1] : null };
  });
  check("40 test answer events logged", stored.count === 40, `count=${stored.count}`);
  check("session summary persisted", stored.historyLen >= 1 && stored.last?.perSection && typeof stored.last.passed === "boolean");

  // retake returns to intro
  await page.click("[data-act=retake]");
  await page.waitForSelector("[data-act=begin]");
  check("retake returns to intro", true);
} finally {
  await browser.close();
  server.close();
}

if (fails.length) {
  console.error(`\n${fails.length} FAILED: ${fails.join("; ")}`);
  process.exit(1);
}
console.log("\nAll e2e checks passed.");
