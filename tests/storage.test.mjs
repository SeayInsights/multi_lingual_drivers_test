/**
 * Storage-layer tests (WO 5) — run the real modules against fake-indexeddb.
 * Executed by: node --test tests/storage.test.mjs (pytest wraps this for gates).
 */
import test from "node:test";
import assert from "node:assert/strict";

// Node has no localStorage: minimal polyfill (settings.js mirrors boot keys to it)
const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};

await import("fake-indexeddb/auto");

const { openDb } = await import("../src/storage/db.js");
const events = await import("../src/storage/events.js");
const settings = await import("../src/storage/settings.js");

test("db opens with all three stores", async () => {
  const db = await openDb();
  assert.deepEqual([...db.objectStoreNames].sort(), ["answer_events", "settings", "srs_state"]);
});

test("logAnswer stores and queries by question/session/range", async () => {
  const sessionId = events.newSessionId();
  const before = Date.now() - 1;
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-signs-001", choiceIndex: 2, correct: true, sessionId, locale: "vi-VN" });
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-signs-001", choiceIndex: 1, correct: false, sessionId, locale: "vi-VN" });
  await events.logAnswer({ state: "oh", mode: "test", questionId: "oh-rules-001", choiceIndex: 0, correct: true, sessionId, locale: "vi-VN" });

  const byQ = await events.eventsByQuestion("oh-signs-001");
  assert.equal(byQ.length, 2);
  const byS = await events.eventsBySession(sessionId);
  assert.equal(byS.length, 3);
  const byRange = await events.eventsByDateRange(before, Date.now() + 1);
  assert.ok(byRange.length >= 3);
  assert.ok(byQ.every((e) => e.id && e.ts && e.mode === "study"));
});

test("logAnswer validates its input", async () => {
  const sessionId = events.newSessionId();
  await assert.rejects(() => events.logAnswer({ mode: "nope", questionId: "x", choiceIndex: 0, correct: true, sessionId }), /invalid mode/);
  await assert.rejects(() => events.logAnswer({ mode: "study", questionId: "", choiceIndex: 0, correct: true, sessionId }), /questionId/);
  await assert.rejects(() => events.logAnswer({ mode: "study", questionId: "x", choiceIndex: -1, correct: true, sessionId }), /choiceIndex/);
  await assert.rejects(() => events.logAnswer({ mode: "study", questionId: "x", choiceIndex: 0, correct: "yes", sessionId }), /correct/);
});

test("recentlyMissedQuestionIds returns unique wrong answers, newest first", async () => {
  // Self-seeded (not order-coupled): two misses on one question, one on another
  const sessionId = events.newSessionId();
  await events.logAnswer({ state: "oh", mode: "review", questionId: "oh-seed-miss-1", choiceIndex: 0, correct: false, sessionId, locale: "vi-VN" });
  await events.logAnswer({ state: "oh", mode: "review", questionId: "oh-seed-miss-1", choiceIndex: 1, correct: false, sessionId, locale: "vi-VN" });
  await events.logAnswer({ state: "oh", mode: "review", questionId: "oh-seed-miss-2", choiceIndex: 0, correct: false, sessionId, locale: "vi-VN" });
  const missed = await events.recentlyMissedQuestionIds();
  assert.ok(missed.includes("oh-seed-miss-1"));
  assert.ok(missed.includes("oh-seed-miss-2"));
  assert.equal(new Set(missed).size, missed.length, "ids must be unique");
});

test("allEvents returns every stored record", async () => {
  const sessionId = events.newSessionId();
  const countBefore = (await events.allEvents()).length;
  await events.logAnswer({ state: "oh", mode: "study", questionId: "oh-seed-all-1", choiceIndex: 0, correct: true, sessionId, locale: "vi-VN" });
  const all = await events.allEvents();
  assert.equal(all.length, countBefore + 1);
  assert.ok(all.some((e) => e.questionId === "oh-seed-all-1"));
});

test("app boot wires storage init and legacy migration (source-level)", async () => {
  // Behavioral boot test needs a DOM (covered by WO-6 browser integration);
  // this guards the wiring the WO-5 review found missing.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/app.js", import.meta.url), "utf-8");
  assert.match(src, /import\s*\{[^}]*initSettings[^}]*migrateLegacyBestScore[^}]*\}\s*from\s*"\.\.\/storage\/settings\.js"/);
  assert.match(src, /await\s+initSettings\(\)/);
  assert.match(src, /await\s+migrateLegacyBestScore\(\)/);
});

test("settings persist, broadcast, and mirror boot keys to localStorage", async () => {
  await settings.initSettings();
  let observed = null;
  const off = settings.onSettingChange((key, value) => (observed = { key, value }));
  await settings.setSetting("textSize", "3");
  assert.equal(settings.getSetting("textSize"), "3");
  assert.deepEqual(observed, { key: "textSize", value: "3" });
  assert.equal(localStorage.getItem("mldt.settings.textSize"), "3");
  await settings.setSetting("soundOn", true);
  assert.equal(localStorage.getItem("mldt.settings.soundOn"), null, "non-boot keys stay out of localStorage");
  off();
});

test("legacy ohioBest migrates once and only once", async () => {
  localStorage.setItem("ohioBest", JSON.stringify({ score: 34, total: 40 }));
  const first = await settings.migrateLegacyBestScore();
  assert.equal(first, true);
  assert.deepEqual(settings.getSetting("legacyBestScore"), { score: 34, total: 40 });
  const second = await settings.migrateLegacyBestScore();
  assert.equal(second, false, "second run must be a no-op");
  assert.ok(localStorage.getItem("ohioBest"), "legacy key left intact");
});
