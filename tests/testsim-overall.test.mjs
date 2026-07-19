/**
 * Overall-passing-rule behavioral test (M4 WO 8c0bed4d): states like WA/FL
 * grade the simulation on one total score (test.overallMinCorrect), not
 * per-section minimums. Uses a 4-question fixture state with sections that
 * carry minCorrect 0 — under the old per-section-only grading every
 * submission passed; the fail case below is the discriminating assertion.
 * Run: node --test tests/testsim-overall.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- environment (mirrors testsim.test.mjs) ----
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
globalThis.indexedDB ??= dom.window.indexedDB;
globalThis.IDBKeyRange ??= dom.window.IDBKeyRange;

// ---- fixture: overall-scored state, 4 questions, need 3 correct ----
const CORRECT = "ĐÚNG ĐÁP ÁN";
const WRONG = "SAI ĐÁP ÁN";
const fixtureQuestion = (id, section) => ({
  id, section, category: section,
  text: { "en-US": `Question ${id}`, "vi-VN": `Câu ${id}` },
  choices: [
    { text: { "en-US": CORRECT, "vi-VN": CORRECT } },
    { text: { "en-US": WRONG, "vi-VN": WRONG }, whyWrong: { "en-US": "wrong", "vi-VN": "sai" } },
  ],
  answerIndex: 0,
  explanation: { "en-US": "because", "vi-VN": "bởi vì" },
  difficulty: 1,
  source: { title: "fixture" },
});
const FIXTURE_STATE = {
  code: "zz",
  name: { "en-US": "Fixture", "vi-VN": "Fixture" },
  agency: { name: { "en-US": "Fixture DMV", "vi-VN": "Fixture DMV" }, abbreviation: "DMV", website: "https://example.com/" },
  test: {
    totalQuestions: 4,
    passingRule: "overall",
    overallMinCorrect: 3,
    timeLimitMinutes: null,
    sections: [
      { id: "signs", name: { "en-US": "Signs", "vi-VN": "Biển báo" }, questionCount: 2, minCorrect: 0 },
      { id: "rules", name: { "en-US": "Rules", "vi-VN": "Luật" }, questionCount: 2, minCorrect: 0 },
    ],
  },
  licensing: { minPermitAge: 16 },
  sources: [{ title: "fixture", url: "https://example.com/", accessed: "2026-07-18" }],
};
const FIXTURE_BANK = {
  stateCode: "zz", version: 1,
  questions: [
    fixtureQuestion("zz-signs-001", "signs"), fixtureQuestion("zz-signs-002", "signs"),
    fixtureQuestion("zz-rules-001", "rules"), fixtureQuestion("zz-rules-002", "rules"),
  ],
};

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "");
  if (rel === "data/states/zz/state.json") return { ok: true, status: 200, json: async () => structuredClone(FIXTURE_STATE) };
  if (rel === "data/states/zz/questions.json") return { ok: true, status: 200, json: async () => structuredClone(FIXTURE_BANK) };
  try {
    const body = await readFile(join(ROOT, rel), "utf-8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  }
};

const { initI18n } = await import("../src/i18n/i18n.js");
await initI18n({ primary: "vi-VN" });
const { initSettings, setSetting } = await import("../src/storage/settings.js");
await initSettings();
await setSetting("state", "zz");
const { testView } = await import("../src/pages/test/test.js");

const view = document.getElementById("view");
const tick = () => new Promise((r) => setTimeout(r, 25));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const q = (sel) => view.querySelector(sel);

/** Answer the current question: pick the correct or a wrong choice by text. */
function answer(correct) {
  const want = correct ? CORRECT : WRONG;
  const btn = [...view.querySelectorAll(".choice")].find((b) => b.textContent.includes(want));
  assert.ok(btn, `choice "${want}" rendered`);
  click(btn);
}

async function runAttempt(pattern) {
  if (!q("[data-act=begin]")) {
    click(q("[data-act=retake]")); // back to the intro screen
    await tick();
  }
  click(q("[data-act=begin]"));
  await tick();
  for (const correct of pattern) {
    answer(correct);
    await tick();
  }
  click(q("[data-act=submit]"));
  await tick();
}

test("intro states the overall rule (3 of 4, no per-section bar)", async () => {
  view.innerHTML = testView();
  await tick();
  const text = q("#test-root").textContent;
  assert.match(text, /3\/4/, "overall threshold shown");
  assert.match(text, /tính chung/, "vi overall wording used");
});

test("2 of 4 correct FAILS an overall state needing 3 (old grading passed everyone)", async () => {
  await runAttempt([true, true, false, false]);
  assert.equal(q(".card-green"), null, "no pass styling");
  const text = q("#test-root").textContent;
  assert.match(text, /2\/4/, "score shown");
  assert.match(text, /Cần đúng 3 câu/, "needed-to-pass line shown");
  assert.ok(!text.includes("(cần 0)"), "no per-section minimum rendered");
});

test("3 of 4 correct PASSES at the overall threshold", async () => {
  await runAttempt([true, true, true, false]);
  assert.ok(q(".card-green"), "pass styling present");
  assert.match(q("#test-root").textContent, /3\/4/, "score shown");
});
