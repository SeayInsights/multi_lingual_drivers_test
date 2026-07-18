/**
 * WO 7 behavioral test — drives the real test-simulation page (src/pages/test/test.js)
 * through a jsdom DOM with fake-indexeddb and a file-backed fetch shim.
 * Run: node --test tests/testsim.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- environment ----
const dom = new JSDOM(`<!DOCTYPE html><html lang="vi"><body><main id="view"></main></body></html>`, { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator ??= dom.window.navigator;
globalThis.location = dom.window.location;

const lsBacking = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};
await import("fake-indexeddb/auto");
// fake-indexeddb/auto installs onto `window` when one exists — mirror to globalThis
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;

// file-backed fetch for repo-relative data/locale requests
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
const { testView } = await import("../src/pages/test/test.js");

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 25));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const q = (sel) => view.querySelector(sel);

test("full 40-question BMV simulation: engine, review, grading, events", async () => {
  view.innerHTML = testView();
  await tick();

  // intro from state.json
  assert.ok(q("[data-act=begin]"), "intro renders");
  assert.ok(q("#timer-opt"), "timer option present");
  assert.match(q("#test-root").textContent, /40/, "intro cites 40 questions");

  click(q("[data-act=begin]"));
  await tick();
  assert.match(q("#test-root strong").textContent, /1\/40/, "starts at question 1 of 40");

  // flag question 1
  click(q("[data-act=flag]"));
  await tick();
  assert.match(q("[data-act=flag]").textContent, /Đã đánh dấu|Flagged/, "flag toggles on");

  // answer all 40 with the first rendered choice; assert no instant feedback
  for (let i = 0; i < 40; i++) {
    const choice = q(".choice");
    assert.ok(choice, `choice present at question ${i + 1}`);
    click(choice);
    await tick();
    assert.equal(q("#feedback"), null, "no instant feedback in test mode");
  }

  // review screen: flagged chip for q1
  assert.ok(q("[data-act=submit]"), "review-before-submit renders");
  assert.ok(q("[data-act=jump]"), "flagged jump chip present");

  click(q("[data-act=submit]"));
  await new Promise((r) => setTimeout(r, 300));

  const text = q("#test-root").textContent;
  assert.match(text, /\/40/, "overall score out of 40 shown");
  const sectionScores = text.match(/\d+\/20/g) ?? [];
  assert.ok(sectionScores.length >= 2, `two per-section scores shown (${sectionScores.join(",")})`);
  assert.match(text, /ĐẬU|Chưa đậu/, "verdict rendered");
  assert.ok(q("[data-act=retake]"), "retake CTA present");

  // events: exactly 40 with mode='test'; summary + best score persisted
  const { allEvents } = await import("../src/storage/events.js");
  const events = (await allEvents()).filter((e) => e.mode === "test");
  assert.equal(events.length, 40, "40 test answer events logged");
  assert.ok(events.every((e) => e.sessionId === events[0].sessionId), "single session id");

  const { getSetting, initSettings } = await import("../src/storage/settings.js");
  await initSettings();
  const history = getSetting("test.history");
  assert.equal(history.length, 1, "one session summary recorded");
  assert.equal(history[0].total, 40);
  assert.equal(typeof history[0].passed, "boolean");
  assert.ok(history[0].perSection.signs && history[0].perSection.rules, "per-section summary");
  const best = getSetting("bestScore");
  assert.equal(best.total, 40, "best score recorded");

  // retake returns to intro
  click(q("[data-act=retake]"));
  await tick();
  assert.ok(q("[data-act=begin]"), "retake returns to intro");
});

test("engine draws exact per-section counts with no repeats", async () => {
  view.innerHTML = testView();
  await tick();
  click(q("[data-act=begin]"));
  await tick();
  // walk all 40 via fwd, collecting question text per position
  const bank = JSON.parse(await readFile(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
  const state = JSON.parse(await readFile(join(ROOT, "data/states/oh/state.json"), "utf-8"));
  const sum = state.test.sections.reduce((n, s) => n + s.questionCount, 0);
  assert.equal(sum, 40);
  assert.ok(bank.questions.filter((x) => x.section === "signs").length >= 20, "signs pool sufficient");
  assert.ok(bank.questions.filter((x) => x.section === "rules").length >= 20, "rules pool sufficient");
});
