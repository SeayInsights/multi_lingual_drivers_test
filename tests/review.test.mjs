/**
 * Review-deck tests (WO B): deck from missed events, recycle-on-wrong,
 * clear-on-correct, completion + empty states.
 * Run: node --test tests/review.test.mjs
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
const events = await import("../src/storage/events.js");
const { reviewView, buildReviewDeck } = await import("../src/pages/review/review.js");

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 30));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const q = (sel) => view.querySelector(sel);

function clickChoice(correct) {
  // review marks the correct choice green after answering; before answering we
  // need to pick by data-choice index vs the actual question. Find via the
  // rendered question id path: choose by comparing against bank.
  const buttons = [...view.querySelectorAll(".choice")];
  const target = correct ? buttons.find((b) => b.dataset.correct === "1") : buttons.find((b) => b.dataset.correct !== "1");
  click(target);
}

test("empty state when nothing missed (with exit control)", async () => {
  view.innerHTML = reviewView();
  await tick();
  assert.match(q("#review-root").textContent, /Không có câu sai|Nothing to review/);
  assert.ok(q("[data-act=exit]"), "exit visible on empty state");
});

test("deck drills missed questions: wrong recycles, correct clears", async () => {
  const bank = JSON.parse(await readFile(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
  const sessionId = events.newSessionId();
  // seed two missed questions
  for (const id of ["oh-rules-001", "oh-rules-002"]) {
    await events.logAnswer({ state: "oh", mode: "study", questionId: id, choiceIndex: 3, correct: false, sessionId, locale: "vi-VN" });
  }
  const deck = await buildReviewDeck();
  assert.equal(deck.length, 2);

  view.innerHTML = reviewView();
  await tick();
  assert.match(q("#review-root strong").textContent, /2/);

  const answerCurrent = async (right) => {
    const currentId = deck0();
    const question = bank.questions.find((x) => x.id === currentId);
    const btn = [...view.querySelectorAll(".choice")].find(
      (b) => (Number(b.dataset.choice) === question.answerIndex) === right
    );
    click(btn);
    await tick();
    click(q("[data-act=next]"));
    await tick();
  };
  // helper: current first card = the strong count text won't give id; track via DOM question text
  function deck0() {
    const text = q("#review-root h2").textContent;
    return bank.questions.find((x) => text.includes(x.text["vi-VN"]))?.id;
  }

  await answerCurrent(false);  // wrong -> recycles; still 2 remaining
  assert.match(q("#review-root strong").textContent, /2/);
  await answerCurrent(true);   // correct -> clears; 1 remaining
  assert.match(q("#review-root strong").textContent, /1/);
  await answerCurrent(true);   // correct -> done
  assert.match(q("#review-root").textContent, /Hết câu sai|All cleared/);
  assert.ok(q("[data-act=exit]"), "exit visible on done state");

  const reviewEvents = (await events.allEvents()).filter((e) => e.mode === "review");
  assert.equal(reviewEvents.length, 3, "every answer logged with mode=review");
});
