/**
 * History browser tests (M7): the reflection page reads the answer-event log
 * and renders lifetime totals, weak areas (worst-first), and an empty state.
 * Also unit-tests the new aggregation functions.
 * Run: node --test tests/history.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><body><main id="view"></main></body></html>`, { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};

const FIXTURE_BANK = {
  questions: [
    { id: "oh-signs-001", section: "signs", category: "signs" },
    { id: "oh-rules-001", section: "rules", category: "rightofway" },
    { id: "oh-rules-002", section: "rules", category: "alcohol" },
  ],
};
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "");
  if (/data\/states\/.+\/questions\.json/.test(rel)) return { ok: true, status: 200, json: async () => structuredClone(FIXTURE_BANK) };
  try {
    const body = await readFile(join(ROOT, rel), "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};
await import("fake-indexeddb/auto");
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;

const agg = await import("../src/pages/progress/aggregate.js");
const { initI18n } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { initSettings, setSetting } = await import("../src/storage/settings.js");
await initSettings();
const events = await import("../src/storage/events.js");
const { historyView } = await import("../src/pages/history/history.js");

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 25));

test("aggregation: allTimeWeakAreas ranks worst category first", () => {
  const evs = [
    { questionId: "oh-rules-001", correct: false, ts: 1 }, { questionId: "oh-rules-001", correct: false, ts: 2 },
    { questionId: "oh-rules-001", correct: false, ts: 3 }, { questionId: "oh-rules-001", correct: false, ts: 4 },
    { questionId: "oh-rules-001", correct: true, ts: 5 },
    { questionId: "oh-signs-001", correct: true, ts: 6 }, { questionId: "oh-signs-001", correct: true, ts: 7 },
    { questionId: "oh-signs-001", correct: true, ts: 8 }, { questionId: "oh-signs-001", correct: true, ts: 9 },
    { questionId: "oh-signs-001", correct: false, ts: 10 },
  ];
  const weak = agg.allTimeWeakAreas(evs, FIXTURE_BANK, { minSample: 5 });
  assert.equal(weak[0].category, "rightofway", "20% category ranks before 80%");
  assert.equal(weak[0].pct, 20);
});

test("aggregation: dailyActivity buckets per day and testHistorySummary counts", () => {
  const now = 100 * 24 * 60 * 60 * 1000; // day 100
  const evs = [{ questionId: "x", correct: true, ts: now }, { questionId: "y", correct: false, ts: now }];
  const days = agg.dailyActivity(evs, { days: 3, now });
  assert.equal(days.length, 3);
  assert.equal(days[2].answered, 2);
  assert.equal(days[2].correct, 1);
  const th = agg.testHistorySummary([{ passed: true, totalCorrect: 38 }, { passed: false, totalCorrect: 30 }]);
  assert.deepEqual([th.taken, th.passed, th.failed, th.best], [2, 1, 1, 38]);
});

test("history page shows empty state with no data", async () => {
  view.innerHTML = historyView();
  await tick();
  const root = document.getElementById("history-root");
  assert.match(root.textContent, /Chưa có lịch sử|No history/);
});

test("history page renders totals and weak areas from the event log", async () => {
  const sid = events.newSessionId();
  // 5 wrong right-of-way (weak), 5 correct signs
  for (let i = 0; i < 5; i++) await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-rules-001", choiceIndex: 1, correct: false, sessionId: sid, locale: "vi-VN" });
  for (let i = 0; i < 5; i++) await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-signs-001", choiceIndex: 0, correct: true, sessionId: sid, locale: "vi-VN" });
  await setSetting("test.history", [{ ts: Date.now(), passed: true, totalCorrect: 38, total: 40 }]);
  view.innerHTML = historyView();
  await tick();
  const root = document.getElementById("history-root");
  assert.match(root.textContent, /50%/, "10 answered, 5 correct = 50%");
  assert.match(root.textContent, /Right of way|Quyền ưu tiên/i, "weak right-of-way category shown");
  assert.match(root.textContent, /38\/40/, "practice test result shown");
});
