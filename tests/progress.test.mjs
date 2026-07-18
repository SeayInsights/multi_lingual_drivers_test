/**
 * Progress aggregation + dashboard tests (WO D).
 * Run: node --test tests/progress.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 24 * 60 * 60 * 1000;

const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><body><main id="view"></main></body></html>`, { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};
await import("fake-indexeddb/auto");
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;
globalThis.fetch = async (url) => {
  const p = join(ROOT, String(url).replace(/^\.?\//, ""));
  try {
    const body = await readFile(p, "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};

const { initI18n } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const agg = await import("../src/pages/progress/aggregate.js");
const bank = JSON.parse(await readFile(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
const stateCfg = JSON.parse(await readFile(join(ROOT, "data/states/oh/state.json"), "utf-8"));
const T0 = 1_800_000_000_000;

const ev = (questionId, correct, ts) => ({ questionId, correct, ts, mode: "study" });

test("categoryAccuracy: last-N window per category", () => {
  const events = [];
  // 25 answers on signs questions: first 5 wrong (older), last 20 correct
  const signQ = bank.questions.filter((q) => q.category === "signs").map((q) => q.id);
  for (let i = 0; i < 5; i++) events.push(ev(signQ[i % signQ.length], false, T0 + i));
  for (let i = 0; i < 20; i++) events.push(ev(signQ[i % signQ.length], true, T0 + 100 + i));
  const cats = agg.categoryAccuracy(events, bank, { lastN: 20 });
  const signs = cats.find((c) => c.category === "signs");
  assert.equal(signs.total, 20, "window capped at lastN");
  assert.equal(signs.pct, 100, "old misses aged out of the window");
});

test("streakDays: consecutive days, today/yesterday anchors, gaps break", () => {
  const now = T0 + 10 * DAY + 5000;
  const mk = (daysAgo) => ev("oh-signs-001", true, now - daysAgo * DAY);
  assert.equal(agg.streakDays([], { now }), 0);
  assert.equal(agg.streakDays([mk(0)], { now }), 1, "today only");
  assert.equal(agg.streakDays([mk(1)], { now }), 1, "yesterday anchors too");
  assert.equal(agg.streakDays([mk(0), mk(1), mk(2)], { now }), 3);
  assert.equal(agg.streakDays([mk(0), mk(2), mk(3)], { now }), 1, "gap breaks streak");
  assert.equal(agg.streakDays([mk(3), mk(4)], { now }), 0, "stale streak = 0");
});

test("readiness follows the state file's per-section thresholds", () => {
  const mkSections = (signsPct, rulesPct, total = 20) => ([
    { section: "signs", pct: signsPct, correct: Math.round(signsPct * total / 100), total },
    { section: "rules", pct: rulesPct, correct: Math.round(rulesPct * total / 100), total },
  ]);
  assert.equal(agg.readiness(mkSections(90, 80), stateCfg), "ready");
  assert.equal(agg.readiness(mkSections(90, 65), stateCfg), "almost", "one section below 75 but >=60");
  assert.equal(agg.readiness(mkSections(90, 40), stateCfg), "keepStudying");
  assert.equal(agg.readiness([], stateCfg), "keepStudying", "no data");
  assert.equal(agg.readiness(mkSections(100, 100, 3), stateCfg), "keepStudying", "insufficient sample");
});

test("dashboard renders rings, streak, history and verdict from live stores", async () => {
  const events = await import("../src/storage/events.js");
  const settings = await import("../src/storage/settings.js");
  await settings.initSettings();
  const sessionId = events.newSessionId();
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-rules-001", choiceIndex: 0, correct: true, sessionId, locale: "vi-VN" });
  await settings.setSetting("test.history", [{ ts: Date.now(), state: "oh", passed: true, totalCorrect: 34, total: 40, perSection: {}, elapsedMs: 1 }]);
  await settings.setSetting("bestScore", { score: 34, total: 40, ts: Date.now() });

  const { progressView } = await import("../src/pages/progress/progress.js");
  const view = document.getElementById("view");
  view.innerHTML = progressView();
  await new Promise((r) => setTimeout(r, 80));
  const text = view.textContent;
  assert.ok(view.querySelector("svg circle"), "mastery ring rendered");
  assert.match(text, /34\/40/, "best score + history shown");
  assert.match(text, /Quyền ưu tiên|Right of way/, "category label (oh-rules-001 is category 'rightofway')");
  assert.match(text, /🔥|🌱/, "streak indicator");
});
