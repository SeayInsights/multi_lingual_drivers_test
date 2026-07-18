/**
 * Back-navigation WO: from inside a study session, the back control returns to
 * the topic list without losing progress; Resume restores the exact position.
 * Run: node --test tests/study-nav.test.mjs
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
const { studyView } = await import("../src/pages/study/study.js");

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 30));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const q = (sel) => view.querySelector(sel);

test("back control returns to topics without losing progress; resume restores position", async () => {
  view.innerHTML = studyView();
  await tick();

  click(q("[data-act=topic][data-cat=rules]"));
  await tick();
  assert.match(q("#study-root strong").textContent, /1\//, "session starts at question 1");
  assert.ok(q("[data-act=back-to-topics]"), "back control visible on question card");

  // answer question 1, advance to question 2
  click(q(".choice"));
  await tick();
  click(q("[data-act=next]"));
  await tick();
  assert.match(q("#study-root strong").textContent, /2\//, "advanced to question 2");
  assert.ok(q("[data-act=back-to-topics]"), "back control still visible mid-session");

  // back to topics — progress must survive
  click(q("[data-act=back-to-topics]"));
  await tick();
  assert.ok(q("[data-act=resume]"), "topic list shows the resume card");
  assert.ok(q("[data-act=topic]"), "topic buttons available again");

  // resume returns exactly where we left off
  click(q("[data-act=resume]"));
  await tick();
  assert.match(q("#study-root strong").textContent, /2\//, "resume restored question 2");
});

test("re-entering study with a saved session ALWAYS shows the topic list (operator decision)", async () => {
  // a session exists from the previous test (we resumed into question 2)
  view.innerHTML = studyView();
  await tick();
  assert.ok(q("[data-act=topic]"), "topic list shown on entry");
  assert.ok(q("[data-act=resume]"), "resume card offered instead of auto-jump");
  assert.equal(q("#study-root .choice"), null, "no question auto-opened");
  // and resume still restores the exact position
  click(q("[data-act=resume]"));
  await tick();
  assert.match(q("#study-root strong").textContent, /2\//, "resume position preserved");
});
