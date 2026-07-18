/**
 * Sign flashcards — front: the sign image; flip: name + explanation.
 * Swipe right (or ✓ button) = "biết rồi" -> promote; swipe left (or ↻ button)
 * = "chưa thuộc" -> demote. Buttons are the accessible path; swipe is sugar.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { logAnswer, newSessionId } from "../../storage/events.js";
import { getSetting } from "../../storage/settings.js";
import { buildDeck, promote, demote } from "../../srs/leitner.js";

let bank = null;
let deck = [];
let pos = 0;
let flipped = false;
let known = 0;
let sessionId = null;
let stateCode = "oh";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = (obj) => `<span class="vi-main" lang="vi">${esc(obj["vi-VN"] ?? obj["en-US"])}</span><span class="en-sub" lang="en">${esc(obj["en-US"])}</span>`;

async function loadBank() {
  if (bank) return bank;
  stateCode = getSetting("state", "oh");
  const res = await fetch(`data/states/${stateCode}/questions.json`);
  if (!res.ok) throw new Error(`questions: HTTP ${res.status}`);
  bank = await res.json();
  return bank;
}

function cardHtml() {
  const q = deck[pos];
  const front = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:220px">
      <img src="${q.sign.image}" alt="${esc(q.sign.code)}" style="max-height:200px;max-width:80%">
    </div>
    <p style="text-align:center;color:var(--muted)">${bilingual("flash.tapToFlip")}</p>`;
  const back = `
    <div style="min-height:220px">
      <p style="font-weight:800;font-size:1.15rem">${L(q.choices[q.answerIndex].text)}</p>
      <p>${L(q.explanation)}</p>
    </div>
    <p style="text-align:center;color:var(--muted);font-family:var(--font-sign);font-weight:700">${esc(q.sign.code)}</p>`;
  return `
  <section class="card" id="flashcard" data-flipped="${flipped}" style="cursor:pointer;touch-action:pan-y">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <strong>${t("flash.cardOf", { current: pos + 1, total: deck.length })}</strong>
      <span style="color:var(--muted);font-size:.85em">${known}✓</span>
    </div>
    ${flipped ? back : front}
  </section>
  <div style="display:flex;gap:10px">
    <button class="btn btn-secondary" data-act="learning" style="flex:1">↻ ${bilingual("flash.stillLearning")}</button>
    <button class="btn btn-primary" data-act="know" style="flex:1">✓ ${bilingual("flash.know")}</button>
  </div>`;
}

function doneHtml() {
  return `
  <section class="card card-green" style="text-align:center">
    <h2>${bilingual("flash.doneTitle")}</h2>
    <p>${t("flash.doneSummary", { known, total: deck.length })}</p>
    <button class="btn btn-secondary" data-act="again" style="margin-top:10px">${bilingual("action.retry")}</button>
  </section>`;
}

function emptyHtml() {
  return `
  <section class="card" style="text-align:center">
    <h2>${bilingual("flash.emptyTitle")}</h2>
    <p>${bilingual("flash.emptyBody")}</p>
  </section>`;
}

export function flashcardsView() {
  queueMicrotask(bootFlashcards);
  return `<div id="flash-root"><section class="card"><p>…</p></section></div>`;
}

async function startSession(root) {
  deck = await buildDeck(bank);
  pos = 0; known = 0; flipped = false;
  sessionId = newSessionId();
  root.innerHTML = deck.length ? cardHtml() : emptyHtml();
}

async function bootFlashcards() {
  const root = document.getElementById("flash-root");
  if (!root) return;
  try {
    await loadBank();
    await startSession(root);
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
    return;
  }
  if (root.dataset.wired) return;
  root.dataset.wired = "1";
  root.addEventListener("click", onClick);
  // swipe: pointer horizontal delta on the card
  let startX = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#flashcard")) startX = e.clientX;
  });
  root.addEventListener("pointerup", async (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) >= 60) await resolveCard(dx > 0);
  });
}

async function resolveCard(knewIt) {
  const root = document.getElementById("flash-root");
  const q = deck[pos];
  if (!q) return;
  if (knewIt) { known++; await promote(q.id); } else { await demote(q.id); }
  navigator.vibrate?.(knewIt ? 25 : [50, 30, 50]);
  await logAnswer({
    state: stateCode, mode: "flashcard", questionId: q.id,
    choiceIndex: q.answerIndex, correct: knewIt, sessionId,
    locale: document.documentElement.lang === "en" ? "en-US" : "vi-VN",
  }).catch(() => {});
  pos++;
  flipped = false;
  root.innerHTML = pos < deck.length ? cardHtml() : doneHtml();
}

async function onClick(e) {
  const root = document.getElementById("flash-root");
  const btn = e.target.closest("[data-act]");
  if (btn) {
    const act = btn.dataset.act;
    if (act === "know") await resolveCard(true);
    if (act === "learning") await resolveCard(false);
    if (act === "again") await startSession(root);
    return;
  }
  if (e.target.closest("#flashcard") && deck[pos]) {
    flipped = !flipped;
    root.innerHTML = pos < deck.length ? cardHtml() : doneHtml();
  }
}
