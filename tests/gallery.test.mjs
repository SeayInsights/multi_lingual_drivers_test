/**
 * Sign gallery tests (WO E).
 * Run: node --test tests/gallery.test.mjs
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
const { signsView, normalize } = await import("../src/pages/signs/signs.js");
const settings = await import("../src/storage/settings.js");
await settings.initSettings();

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 40));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const q = (sel) => view.querySelector(sel);
const qa = (sel) => [...view.querySelectorAll(sel)];

test("normalize is diacritic-insensitive incl. đ", () => {
  assert.equal(normalize("Đường TRƠN trượt"), "duong tron truot");
  assert.equal(normalize("bien bao"), normalize("Biển Báo"));
});

test("gallery renders first batch of 60 with lazy images and categories", async () => {
  view.innerHTML = signsView();
  await tick();
  const cards = qa("[data-sign]");
  assert.equal(cards.length, 60, "first batch of 60");
  assert.ok(cards.every((c) => c.querySelector("img")?.getAttribute("loading") === "lazy"));
  assert.ok(qa("[data-cat-filter]").length >= 10, "category chips render");
});

test("load more increments the batch", async () => {
  click(q("[data-act=more]"));
  await tick();
  assert.equal(qa("[data-sign]").length, 120);
});

test("search finds by Vietnamese name without diacritics", async () => {
  const box = q("#sign-search");
  box.value = "duong mot chieu"; // "Đường một chiều" (one way)
  box.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await tick();
  const codes = qa("[data-sign]").map((c) => c.dataset.sign);
  assert.ok(codes.some((c) => c.startsWith("R6-")), `one-way sign found (${codes.join(",")})`);
});

test("on-the-test filter matches the quiz sign set exactly", async () => {
  const bank = JSON.parse(await readFile(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
  const quiz = new Set(bank.questions.filter((x) => x.sign).map((x) => x.sign.code));
  // clear search, toggle on-test
  const box = q("#sign-search");
  box.value = "";
  box.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await tick();
  click(q("[data-act=toggle-ontest]"));
  await tick();
  const codes = new Set(qa("[data-sign]").map((c) => c.dataset.sign));
  assert.deepEqual([...codes].sort(), [...quiz].sort());
});

test("detail view + practice deep-link seeds a study session", async () => {
  click(q('[data-sign="R1-1"]'));
  await tick();
  assert.match(q("#signs-root").textContent, /R1-1/);
  const practice = q("[data-act=practice]");
  assert.ok(practice, "practice button for quiz sign");
  click(practice);
  await tick();
  const session = settings.getSetting("study.session");
  assert.ok(session && session.queue.length >= 1, "session seeded");
  assert.ok(session.queue.every((id) => id.startsWith("oh-signs-")), "sign questions only");
  assert.equal(location.hash, "#/study");
});
