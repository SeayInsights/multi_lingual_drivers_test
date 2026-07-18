/**
 * Wrong-answer review deck — drills recently-missed questions until each is
 * answered correctly once this session. Wrong answers recycle to the back of
 * the deck; correct answers clear the card.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { logAnswer, newSessionId, recentlyMissedQuestionIds } from "../../storage/events.js";
import { getSetting } from "../../storage/settings.js";

let bank = null;
let queue = [];      // question ids still to clear
let cleared = 0;
let totalStart = 0;
let order = null;    // shuffled choice order for current card
let orderFor = null;
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

const byId = (id) => bank.questions.find((q) => q.id === id);

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build the deck from the event log; ids must exist in the current bank. */
export async function buildReviewDeck() {
  const missed = await recentlyMissedQuestionIds({ limit: 50 });
  return missed.filter((id) => byId(id));
}

function questionHtml() {
  const q = byId(queue[0]);
  if (!order || orderFor !== q.id) {
    order = shuffled(q.choices.map((_, i) => i));
    orderFor = q.id;
  }
  const sign = q.sign
    ? `<div style="display:flex;justify-content:center;margin-bottom:12px"><img src="${q.sign.image}" alt="${esc(q.sign.code)}" style="max-height:150px;max-width:70%"></div>`
    : "";
  return `
  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>${t("review.remaining", { count: queue.length })}</strong>
      <span style="color:var(--muted);font-size:.85em">${cleared}/${totalStart} ✓</span>
    </div>
    ${sign}
    <h2 style="font-size:1.15rem">${L(q.text)}</h2>
    <div id="choices">
      ${order.map((ci, k) => `
        <button class="btn btn-secondary choice" data-act="answer" data-choice="${ci}"
                style="margin-bottom:10px;justify-content:flex-start;text-align:left">
          <span style="flex:none;width:32px;height:32px;border-radius:8px;background:var(--ink);color:var(--card);font-family:var(--font-sign);font-weight:900;display:flex;align-items:center;justify-content:center">${"ABCD"[k]}</span>
          <span>${L(q.choices[ci].text)}</span>
        </button>`).join("")}
    </div>
    <div id="feedback"></div>
  </section>`;
}

function feedbackHtml(q, chosen) {
  const right = chosen === q.answerIndex;
  return `
  <div style="margin-top:12px;border-radius:12px;padding:14px;background:${right ? "#EAF5EE" : "#FFF6DC"};box-shadow:inset 4px 0 0 ${right ? "var(--green)" : "var(--yellow)"};color:#20242A">
    <p style="font-weight:800;margin:0 0 6px">${right ? esc(t("quiz.correct")) : esc(t("review.tryAgainLater"))}</p>
    <p style="margin:6px 0 0"><strong>${bilingual("quiz.explanation")}</strong></p>
    <p style="margin:4px 0 0">${L(q.explanation)}</p>
  </div>
  <button class="btn btn-primary" data-act="next" style="margin-top:12px">${bilingual("action.next")}</button>`;
}

const doneHtml = () => `
  <section class="card card-green" style="text-align:center">
    <h2>${bilingual("review.doneTitle")}</h2>
    <p>${t("review.doneBody", { count: totalStart })}</p>
  </section>`;

const emptyHtml = () => `
  <section class="card" style="text-align:center">
    <h2>${bilingual("review.emptyTitle")}</h2>
    <p>${bilingual("review.emptyBody")}</p>
  </section>`;

export function reviewView() {
  queueMicrotask(bootReview);
  return `<div id="review-root"><section class="card"><p>…</p></section></div>`;
}

async function bootReview() {
  const root = document.getElementById("review-root");
  if (!root) return;
  try {
    await loadBank();
    queue = await buildReviewDeck();
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
    return;
  }
  cleared = 0;
  totalStart = queue.length;
  sessionId = newSessionId();
  root.innerHTML = queue.length ? questionHtml() : emptyHtml();
  if (!root.dataset.wired) {
    root.dataset.wired = "1";
    root.addEventListener("click", onClick);
  }
}

let lastRight = false;
async function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const root = document.getElementById("review-root");

  if (btn.dataset.act === "answer") {
    const q = byId(queue[0]);
    const chosen = Number(btn.dataset.choice);
    lastRight = chosen === q.answerIndex;
    for (const c of root.querySelectorAll(".choice")) {
      c.disabled = true;
      const ci = Number(c.dataset.choice);
      if (ci === q.answerIndex) c.style.boxShadow = "inset 0 0 0 3px var(--green)";
      else if (ci === chosen) c.style.boxShadow = "inset 0 0 0 3px var(--red)";
      else c.style.opacity = ".55";
    }
    document.getElementById("feedback").innerHTML = feedbackHtml(q, chosen);
    navigator.vibrate?.(lastRight ? 30 : [60, 40, 60]);
    await logAnswer({
      state: stateCode, mode: "review", questionId: q.id,
      choiceIndex: chosen, correct: lastRight, sessionId,
      locale: document.documentElement.lang === "en" ? "en-US" : "vi-VN",
    }).catch(() => {});
  }

  if (btn.dataset.act === "next") {
    const id = queue.shift();
    if (lastRight) cleared++;
    else queue.push(id); // recycle to the back
    order = null;
    root.innerHTML = queue.length ? questionHtml() : doneHtml();
  }
}

/** Entry-point badge filler (Home + Study). Decorative — never throws. */
export async function fillReviewBadges() {
  const badges = document.querySelectorAll(".review-missed-badge");
  if (!badges.length) return;
  try {
    await loadBank();
    const n = (await buildReviewDeck()).length;
    for (const b of badges) b.textContent = n ? t("review.missedCount", { count: n }) : "";
  } catch { /* decorative */ }
}
