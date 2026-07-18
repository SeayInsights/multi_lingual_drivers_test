/**
 * Language-mode tests (operator-reported defect): t() must follow EN-only
 * mode, and the active view must re-render on switch.
 * Run: node --test tests/i18n-mode.test.mjs
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
globalThis.fetch = async (url) => {
  const p = join(ROOT, String(url).replace(/^\.?\//, ""));
  try {
    const body = await readFile(p, "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};

const { initI18n, t, applyLangMode, bilingual } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { register, startRouter, rerender } = await import("../src/app/router.js");

test("t() follows the language mode", () => {
  applyLangMode("both");
  assert.equal(t("tab.home"), "Trang chính", "both mode: primary is Vietnamese");
  applyLangMode("en");
  assert.equal(t("tab.home"), "Home", "en mode: t() resolves English");
  assert.equal(document.documentElement.lang, "en", "document lang follows");
  applyLangMode("vi");
  assert.equal(t("tab.home"), "Trang chính");
  applyLangMode("both");
});

test("bilingual() always renders both languages regardless of mode", () => {
  applyLangMode("en");
  const html = bilingual("tab.home");
  assert.match(html, /lang="vi">Trang chính/);
  assert.match(html, /lang="en">Home/);
  applyLangMode("both");
});

test("rerender() rebuilds the active view so t() strings switch in place", () => {
  const viewEl = document.getElementById("view");
  register("/home", () => `<p id="probe">${t("quiz.correct")}</p>`);
  location.hash = "#/home";
  startRouter(viewEl);
  assert.equal(viewEl.querySelector("#probe").textContent, "Chính xác!");
  applyLangMode("en");
  rerender();
  assert.equal(viewEl.querySelector("#probe").textContent, "Correct!", "view re-rendered in English");
  applyLangMode("both");
  rerender();
  assert.equal(viewEl.querySelector("#probe").textContent, "Chính xác!");
});
