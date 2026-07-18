/**
 * SRS engine + flashcards flow tests (WO A).
 * Run: node --test tests/srs.test.mjs
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
const srs = await import("../src/srs/leitner.js");
const bank = JSON.parse(await readFile(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
const T0 = 1_800_000_000_000; // fixed clock for determinism

test("promote climbs boxes with correct intervals; demote resets to box 1", async () => {
  let s = await srs.promote("oh-signs-001", { now: T0 });
  assert.equal(s.box, 1);
  assert.equal(s.dueTs, T0); // box 1: due same day
  s = await srs.promote("oh-signs-001", { now: T0 });
  assert.equal(s.box, 2);
  assert.equal(s.dueTs, T0 + 1 * DAY);
  s = await srs.promote("oh-signs-001", { now: T0 });
  assert.equal(s.box, 3);
  assert.equal(s.dueTs, T0 + 3 * DAY);
  for (let i = 0; i < 5; i++) s = await srs.promote("oh-signs-001", { now: T0 });
  assert.equal(s.box, 5, "box caps at 5");
  assert.equal(s.dueTs, T0 + 14 * DAY);
  s = await srs.demote("oh-signs-001", { now: T0 + 5 * DAY });
  assert.equal(s.box, 1);
  assert.equal(s.dueTs, T0 + 5 * DAY, "demoted card due immediately");
});

test("buildDeck orders due -> unseen -> later, capped", async () => {
  // oh-signs-001 is in box 1 due at T0+5d (from previous test)
  await srs.promote("oh-signs-002", { now: T0 });           // box1 due T0 (due)
  await srs.promote("oh-signs-003", { now: T0 });           // box1 due T0
  await srs.promote("oh-signs-003", { now: T0 });           // box2 due T0+1d (later at T0)
  const signCount = bank.questions.filter((q) => q.sign).length;
  const deck = await srs.buildDeck(bank, { now: T0 + 6 * DAY, limit: 20 });
  assert.equal(deck.length, Math.min(20, signCount), "session capped at min(20, sign cards)");
  assert.ok(signCount >= 15, `sanity: bank has ${signCount} sign-image cards`);
  const ids = deck.map((q) => q.id);
  // all three tracked cards are due by T0+6d; oldest due first among due
  assert.ok(ids.indexOf("oh-signs-002") < ids.indexOf("oh-signs-001"), "older due first");
  assert.ok(deck.every((q) => q.sign), "deck contains only sign cards");
});

test("getDueCount counts due + unseen", async () => {
  const n = await srs.getDueCount(bank, { now: T0 - DAY }); // before any dueTs
  const signCount = bank.questions.filter((q) => q.sign).length;
  // 3 tracked cards: 001 due T0+5d (not due), 002 due T0 (not due yet at T0-1d), 003 due T0+1d (not due)
  assert.equal(n, signCount - 3);
});

test("flashcards flow: flip, know, still-learning, done; events logged", async () => {
  const { flashcardsView } = await import("../src/pages/flashcards/flashcards.js");
  const view = document.getElementById("view");
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  view.innerHTML = flashcardsView();
  await tick();
  assert.ok(view.querySelector("#flashcard"), "card renders");
  assert.ok(view.querySelector("img"), "front shows the sign image");

  click(view.querySelector("#flashcard"));
  await tick();
  assert.ok(!view.querySelector("#flashcard img"), "flip hides image, shows answer");

  const total = Number(view.querySelector("#flash-root strong").textContent.match(/\/(\d+)/)[1]);
  click(view.querySelector("[data-act=know]"));
  await tick();
  click(view.querySelector("[data-act=learning]"));
  await tick();
  for (let i = 2; i < total; i++) {
    click(view.querySelector("[data-act=know]"));
    await tick();
  }
  assert.match(view.querySelector("#flash-root").textContent, /Xong phiên|Session complete/, "done screen");

  const { allEvents } = await import("../src/storage/events.js");
  const flashEvents = (await allEvents()).filter((e) => e.mode === "flashcard");
  assert.equal(flashEvents.length, total, "one event per card");
  assert.equal(flashEvents.filter((e) => !e.correct).length, 1, "one still-learning event");
});
