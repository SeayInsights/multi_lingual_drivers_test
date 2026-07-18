/**
 * Study mode — topic list -> question cards with instant feedback,
 * explanations, answer-event logging, and mid-topic resume.
 *
 * Data-driven: topics come from the question bank's categories; nothing here
 * is Ohio-specific (the state code comes from settings, default 'oh').
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { logAnswer, newSessionId } from "../../storage/events.js";
import { getSetting, setSetting } from "../../storage/settings.js";
import { fillDueBadges } from "../../srs/badge.js";
import { fillReviewBadges } from "../review/review.js";
import { speakerButton, wireSpeech } from "../../audio/tts.js";

/** Question + lettered choices as one speakable text in the display language. */
function speechText(q, order) {
  const lang = document.documentElement.lang === "en" ? "en-US" : "vi-VN";
  const parts = [q.text[lang] ?? q.text["en-US"]];
  order.forEach((ci, k) => parts.push(`${"ABCD"[k]}. ${q.choices[ci].text[lang] ?? q.choices[ci].text["en-US"]}`));
  return { text: parts.join(". "), lang };
}

let bank = null;          // loaded questions.json
let stateCode = "oh";
let session = null;       // {category, queue: [questionId...], pos, correct, sessionId}

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

/* ---------- topic list ---------- */
function topicListHtml() {
  const counts = {};
  for (const q of bank.questions) counts[q.category] = (counts[q.category] ?? 0) + 1;
  const saved = getSetting("study.session");
  const resumeCard = saved
    ? `<button class="btn btn-primary" data-act="resume" style="margin-bottom:14px">
         ${bilingual("study.resume")}</button>`
    : "";
  queueMicrotask(fillDueBadges);
  queueMicrotask(fillReviewBadges);
  return `
  <a class="btn btn-secondary" href="#/flashcards" style="margin-bottom:10px;text-decoration:none;justify-content:space-between">
    <span>🃏 ${bilingual("flash.entry")}</span>
    <span class="flash-due-badge" style="font-weight:600;font-size:.85em;color:var(--muted)"></span>
  </a>
  <a class="btn btn-secondary" href="#/review" style="margin-bottom:14px;text-decoration:none;justify-content:space-between">
    <span>🔁 ${bilingual("review.entry")}</span>
    <span class="review-missed-badge" style="font-weight:600;font-size:.85em;color:var(--orange)"></span>
  </a>
  <section class="card">
    <h2>${bilingual("study.chooseTopic")}</h2>
    ${resumeCard}
    ${Object.entries(counts).map(([cat, n]) => `
      <button class="btn btn-secondary" data-act="topic" data-cat="${cat}" style="margin-bottom:10px; justify-content:space-between">
        <span style="text-align:left">${bilingual(`topic.${cat}`)}</span>
        <span style="font-weight:600; font-size:.85em">${t("study.questionsCount", { count: n })}</span>
      </button>`).join("")}
  </section>`;
}

/* ---------- question card ---------- */
function questionHtml() {
  const q = byId(session.queue[session.pos]);
  // shuffle choices once per question; remember mapping on the session
  if (!session.order || session.orderFor !== q.id) {
    session.order = shuffled(q.choices.map((_, i) => i));
    session.orderFor = q.id;
    saveSession();
  }
  const total = session.queue.length;
  const sign = q.sign
    ? `<div style="display:flex;justify-content:center;margin-bottom:12px">
         <img src="${q.sign.image}" alt="${esc(q.sign.code)}" style="max-height:150px;max-width:70%"
              onerror="this.outerHTML='<div style=&quot;padding:20px;border:3px solid var(--ink);border-radius:12px;font-family:var(--font-sign);font-weight:900&quot;>${esc(q.sign.code)}</div>'">
       </div>`
    : "";
  return `
  <section class="card">
    <button class="btn btn-secondary" data-act="back-to-topics"
            style="width:auto;min-height:40px;padding:6px 14px;margin-bottom:10px">
      ← ${esc(t("action.back"))}
    </button>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>${t("quiz.questionOf", { current: session.pos + 1, total })}</strong>
      <span style="color:var(--muted);font-size:.85em">${session.correct}✓</span>
    </div>
    <div class="bar-track" style="height:7px;background:var(--bg);border-radius:99px;overflow:hidden;margin-bottom:12px">
      <div style="height:100%;width:${(session.pos / total) * 100}%;background:var(--green);border-radius:99px"></div>
    </div>
    ${sign}
    <div style="display:flex;gap:10px;align-items:flex-start">
      <h2 style="font-size:1.15rem;flex:1;margin-top:0">${L(q.text)}</h2>
      ${(() => { const s = speechText(q, session.order); return speakerButton(s.text, s.lang); })()}
    </div>
    <div id="choices">
      ${session.order.map((ci, k) => `
        <button class="btn btn-secondary choice" data-act="answer" data-choice="${ci}"
                style="margin-bottom:10px;justify-content:flex-start;text-align:left">
          <span style="flex:none;width:32px;height:32px;border-radius:8px;background:var(--ink);color:var(--card);font-family:var(--font-sign);font-weight:900;display:flex;align-items:center;justify-content:center">${"ABCD"[k]}</span>
          <span>${L(q.choices[ci].text)}</span>
        </button>`).join("")}
    </div>
    <div id="feedback"></div>
  </section>`;
}

function feedbackHtml(q, chosenIndex) {
  const right = chosenIndex === q.answerIndex;
  const whyWrong = !right && q.choices[chosenIndex].whyWrong
    ? `<p><strong>${bilingual("quiz.whyWrong")}</strong></p><p>${L(q.choices[chosenIndex].whyWrong)}</p>`
    : "";
  return `
  <div style="margin-top:12px;border-radius:12px;padding:14px;background:${right ? "#EAF5EE" : "#FFF6DC"};box-shadow:inset 4px 0 0 ${right ? "var(--green)" : "var(--yellow)"};color:#20242A">
    <p style="font-weight:800;margin:0 0 6px">${right ? `${esc(t("quiz.correct"))} ${esc(t("encourage.correct"))}` : esc(t("quiz.incorrect"))}</p>
    ${whyWrong}
    <p style="margin:6px 0 0"><strong>${bilingual("quiz.explanation")}</strong></p>
    <p style="margin:4px 0 0">${L(q.explanation)}</p>
  </div>
  <button class="btn btn-primary" data-act="next" style="margin-top:12px">${bilingual("action.next")}</button>`;
}

/* ---------- session persistence (mid-topic resume) ---------- */
function saveSession() {
  setSetting("study.session", session);
}
async function clearSession() {
  session = null;
  await setSetting("study.session", null);
}

/* ---------- done screen ---------- */
function doneHtml() {
  const total = session.queue.length;
  return `
  <section class="card card-green" style="text-align:center">
    <h2>${t("test.result.score", { correct: session.correct, total })}</h2>
    <p>${bilingual("progress.keepStudying")}</p>
    <button class="btn btn-secondary" data-act="back-to-topics" style="margin-top:10px">${bilingual("action.back")}</button>
  </section>`;
}

/* ---------- view + interactions ---------- */
export function studyView() {
  // render skeleton; boot() fills it after data loads
  queueMicrotask(bootStudy);
  return `<div id="study-root"><section class="card"><p>…</p></section></div>`;
}

async function bootStudy() {
  const root = document.getElementById("study-root");
  if (!root) return;
  try {
    await loadBank();
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
    return;
  }
  // Entering Study ALWAYS shows the topic list (operator decision 2026-07-18):
  // a saved session appears as the Resume card, never as an auto-jump.
  const saved = getSetting("study.session");
  session = saved && byId(saved.queue?.[saved.pos]) ? saved : null;
  root.innerHTML = topicListHtml();
  if (!root.dataset.wired) {
    root.dataset.wired = "1";
    root.addEventListener("click", onClick);
  }
  wireSpeech(root);
}

async function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const root = document.getElementById("study-root");
  const act = btn.dataset.act;

  if (act === "topic") {
    const cat = btn.dataset.cat;
    session = {
      category: cat,
      queue: shuffled(bank.questions.filter((q) => q.category === cat).map((q) => q.id)),
      pos: 0,
      correct: 0,
      sessionId: newSessionId(),
    };
    saveSession();
    root.innerHTML = questionHtml();
  }

  if (act === "resume") {
    root.innerHTML = questionHtml();
  }

  if (act === "answer") {
    const q = byId(session.queue[session.pos]);
    const chosen = Number(btn.dataset.choice);
    const right = chosen === q.answerIndex;
    if (right) session.correct++;
    saveSession();
    // lock choices, mark right/wrong
    for (const c of root.querySelectorAll(".choice")) {
      c.disabled = true;
      const ci = Number(c.dataset.choice);
      if (ci === q.answerIndex) c.style.boxShadow = "inset 0 0 0 3px var(--green)";
      else if (ci === chosen) c.style.boxShadow = "inset 0 0 0 3px var(--red)";
      else c.style.opacity = ".55";
    }
    document.getElementById("feedback").innerHTML = feedbackHtml(q, chosen);
    navigator.vibrate?.(right ? 30 : [60, 40, 60]);
    // the day-one answer log
    await logAnswer({
      state: stateCode,
      mode: "study",
      questionId: q.id,
      choiceIndex: chosen,
      correct: right,
      sessionId: session.sessionId,
      locale: document.documentElement.lang === "en" ? "en-US" : "vi-VN",
    });
  }

  if (act === "next") {
    session.pos++;
    if (session.pos >= session.queue.length) {
      root.innerHTML = doneHtml();
      await clearSession();
    } else {
      saveSession();
      root.innerHTML = questionHtml();
    }
  }

  if (act === "back-to-topics") {
    root.innerHTML = topicListHtml();
  }
}
