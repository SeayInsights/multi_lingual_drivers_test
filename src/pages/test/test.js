/**
 * BMV test simulation — mirrors the real knowledge test:
 * sections and passing thresholds come from the state file (Ohio: 20 signs +
 * 20 rules, 75% required in EACH section, untimed). No instant feedback;
 * answers are changeable until submit; flag-for-review; per-section results.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { logAnswer, newSessionId } from "../../storage/events.js";
import { getSetting, setSetting } from "../../storage/settings.js";

let stateCfg = null;
let bank = null;
let stateCode = "oh";
let sim = null; // {order:[qid], answers:{qid:choiceIdx}, choiceOrders:{qid:[..]}, flags:Set, pos, startedAt, timerOn, submitted, sectionOf:{qid:sectionId}}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = (obj) => `<span class="vi-main" lang="vi">${esc(obj["vi-VN"] ?? obj["en-US"])}</span><span class="en-sub" lang="en">${esc(obj["en-US"])}</span>`;

async function loadData() {
  stateCode = getSetting("state", "oh");
  if (!stateCfg) stateCfg = await (await fetch(`data/states/${stateCode}/state.json`)).json();
  if (!bank) bank = await (await fetch(`data/states/${stateCode}/questions.json`)).json();
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

/* ---------- intro ---------- */
function introHtml() {
  const sections = stateCfg.test.sections;
  const rules = t("test.rules", {
    total: stateCfg.test.totalQuestions,
    signs: sections[0].questionCount,
    rules: sections[1]?.questionCount ?? 0,
    minCorrect: sections[0].minCorrect,
    sectionCount: sections[0].questionCount,
  });
  const rulesEn = t("test.rules", {
    total: stateCfg.test.totalQuestions,
    signs: sections[0].questionCount,
    rules: sections[1]?.questionCount ?? 0,
    minCorrect: sections[0].minCorrect,
    sectionCount: sections[0].questionCount,
  }, "en-US");
  return `
  <section class="card">
    <h2>${bilingual("test.introTitle")}</h2>
    <p><span class="vi-main" lang="vi">${esc(rules)}</span><span class="en-sub" lang="en">${esc(rulesEn)}</span></p>
    <label class="setting-row" style="border:none">
      <span>${bilingual("test.timedOption")}</span>
      <input type="checkbox" id="timer-opt" style="width:26px;height:26px;accent-color:var(--green)">
    </label>
    <button class="btn btn-primary" data-act="begin">${bilingual("test.begin")}</button>
  </section>`;
}

/* ---------- engine ---------- */
function buildSim(timerOn) {
  const order = [];
  const sectionOf = {};
  for (const s of stateCfg.test.sections) {
    const pool = bank.questions.filter((q) => q.section === s.id).map((q) => q.id);
    const picked = shuffled(pool).slice(0, s.questionCount);
    if (picked.length < s.questionCount) {
      throw new Error(`question pool too small for section ${s.id}: ${pool.length} < ${s.questionCount}`);
    }
    for (const id of picked) sectionOf[id] = s.id;
    order.push(...picked);
  }
  sim = {
    order, sectionOf,
    answers: {},
    choiceOrders: Object.fromEntries(order.map((id) => [id, shuffled(byId(id).choices.map((_, i) => i))])),
    flags: new Set(),
    pos: 0,
    startedAt: Date.now(),
    timerOn,
    sessionId: newSessionId(),
    submitted: false,
  };
}

/* ---------- test question ---------- */
function testQHtml() {
  const qid = sim.order[sim.pos];
  const q = byId(qid);
  const total = sim.order.length;
  const answered = Object.keys(sim.answers).length;
  const flagged = sim.flags.has(qid);
  const sign = q.sign
    ? `<div style="display:flex;justify-content:center;margin-bottom:12px"><img src="${q.sign.image}" alt="${esc(q.sign.code)}" style="max-height:140px;max-width:65%"></div>`
    : "";
  const timer = sim.timerOn
    ? `<span id="test-timer" style="font-family:var(--font-sign);font-weight:900"></span>` : "";
  return `
  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>${t("quiz.questionOf", { current: sim.pos + 1, total })}</strong>
      ${timer}
      <span style="color:var(--muted);font-size:.85em">${answered}/${total}</span>
    </div>
    ${sign}
    <h2 style="font-size:1.12rem">${L(q.text)}</h2>
    ${sim.choiceOrders[qid].map((ci, k) => `
      <button class="btn btn-secondary choice" data-act="pick" data-choice="${ci}"
        style="margin-bottom:10px;justify-content:flex-start;text-align:left;${sim.answers[qid] === ci ? "box-shadow:inset 0 0 0 3px var(--blue)" : ""}">
        <span style="flex:none;width:32px;height:32px;border-radius:8px;background:${sim.answers[qid] === ci ? "var(--blue)" : "var(--ink)"};color:var(--card);font-family:var(--font-sign);font-weight:900;display:flex;align-items:center;justify-content:center">${"ABCD"[k]}</span>
        <span>${L(q.choices[ci].text)}</span>
      </button>`).join("")}
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-secondary" data-act="prev" ${sim.pos === 0 ? "disabled" : ""} style="flex:1">←</button>
      <button class="btn btn-secondary" data-act="flag" style="flex:2;${flagged ? "box-shadow:inset 0 0 0 3px var(--orange)" : ""}">${flagged ? esc(t("quiz.flagged")) : esc(t("quiz.flag"))} 🚩</button>
      <button class="btn btn-primary" data-act="fwd" style="flex:1">→</button>
    </div>
  </section>`;
}

/* ---------- review-before-submit ---------- */
function reviewHtml() {
  const unanswered = sim.order.filter((id) => sim.answers[id] === undefined);
  const flagged = [...sim.flags];
  const chip = (id) => `<button class="btn btn-secondary" data-act="jump" data-qid="${id}" style="width:auto;min-height:40px;padding:6px 12px;margin:0 6px 6px 0;display:inline-flex">#${sim.order.indexOf(id) + 1}</button>`;
  return `
  <section class="card">
    <h2>${bilingual("test.reviewTitle")}</h2>
    ${unanswered.length ? `<p><strong>${t("test.unanswered", { count: unanswered.length })}</strong></p><div>${unanswered.map(chip).join("")}</div>` : ""}
    ${flagged.length ? `<p><strong>${esc(t("quiz.flagged"))} 🚩</strong></p><div>${flagged.map(chip).join("")}</div>` : ""}
    <button class="btn btn-primary" data-act="submit" style="margin-top:12px">${bilingual("test.submit")}</button>
  </section>`;
}

/* ---------- grade + results ---------- */
async function grade() {
  sim.submitted = true;
  const perSection = {};
  for (const s of stateCfg.test.sections) perSection[s.id] = { correct: 0, total: s.questionCount, min: s.minCorrect };
  const missed = [];
  for (const qid of sim.order) {
    const q = byId(qid);
    const chosen = sim.answers[qid];
    const right = chosen === q.answerIndex;
    if (right) perSection[sim.sectionOf[qid]].correct++;
    else missed.push(qid);
    // unanswered questions count as wrong but produce no answer event
    if (chosen !== undefined) {
      await logAnswer({
        state: stateCode, mode: "test", questionId: qid,
        choiceIndex: chosen, correct: right,
        sessionId: sim.sessionId,
        locale: document.documentElement.lang === "en" ? "en-US" : "vi-VN",
      }).catch(() => {});
    }
  }
  const passed = Object.values(perSection).every((s) => s.correct >= s.min);
  const totalCorrect = Object.values(perSection).reduce((n, s) => n + s.correct, 0);
  const summary = {
    ts: Date.now(), state: stateCode, sessionId: sim.sessionId,
    passed, totalCorrect, total: sim.order.length,
    perSection, elapsedMs: Date.now() - sim.startedAt, timerOn: sim.timerOn,
  };
  const history = getSetting("test.history", []);
  history.push(summary);
  await setSetting("test.history", history);
  const best = getSetting("bestScore");
  if (!best || totalCorrect > best.score) await setSetting("bestScore", { score: totalCorrect, total: sim.order.length, ts: summary.ts });
  return { perSection, passed, totalCorrect, missed };
}

function resultsHtml({ perSection, passed, totalCorrect, missed }) {
  const sectionRows = stateCfg.test.sections.map((s) => {
    const r = perSection[s.id];
    const ok = r.correct >= r.min;
    return `<div class="setting-row"><span>${L(s.name)}</span>
      <strong style="color:${ok ? "var(--green)" : "var(--red)"}">${r.correct}/${r.total} ${ok ? "✓" : `(cần ${r.min})`}</strong></div>`;
  }).join("");
  return `
  <section class="card ${passed ? "card-green" : ""}" style="text-align:center">
    <h2 style="font-size:1.6rem">${bilingual(passed ? "test.result.pass" : "test.result.fail")}</h2>
    <p style="font-family:var(--font-sign);font-weight:900;font-size:1.4rem">${t("test.result.score", { correct: totalCorrect, total: sim.order.length })}</p>
  </section>
  <section class="card">${sectionRows}</section>
  ${missed.length ? `
  <section class="card">
    <h2>${bilingual("test.result.review")}</h2>
    ${missed.map((qid) => {
      const q = byId(qid);
      return `<details style="margin-bottom:10px"><summary style="font-weight:700;min-height:40px;cursor:pointer">${L(q.text)}</summary>
        <p style="margin:8px 0 2px"><strong>✓</strong> ${L(q.choices[q.answerIndex].text)}</p>
        <p style="color:var(--muted)">${L(q.explanation)}</p></details>`;
    }).join("")}
  </section>` : ""}
  <button class="btn btn-primary" data-act="retake">${bilingual("test.result.retake")}</button>`;
}

/* ---------- view ---------- */
export function testView() {
  queueMicrotask(bootTest);
  return `<div id="test-root"><section class="card"><p>…</p></section></div>`;
}

let timerInterval = null;
function tickTimer() {
  const el = document.getElementById("test-timer");
  if (!el || !sim) return;
  const s = Math.floor((Date.now() - sim.startedAt) / 1000);
  el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function bootTest() {
  const root = document.getElementById("test-root");
  if (!root) return;
  try {
    await loadData();
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
    return;
  }
  sim = null;
  root.innerHTML = introHtml();
  if (!root.dataset.wired) {
    root.dataset.wired = "1";
    root.addEventListener("click", onClick);
  }
}

async function onClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const root = document.getElementById("test-root");
  const act = btn.dataset.act;

  if (act === "begin") {
    buildSim(document.getElementById("timer-opt")?.checked ?? false);
    root.innerHTML = testQHtml();
    clearInterval(timerInterval);
    if (sim.timerOn) { timerInterval = setInterval(tickTimer, 1000); tickTimer(); }
  }
  if (act === "pick") {
    sim.answers[sim.order[sim.pos]] = Number(btn.dataset.choice);
    root.innerHTML = sim.pos + 1 < sim.order.length ? (sim.pos++, testQHtml()) : reviewHtml();
  }
  if (act === "prev") { sim.pos = Math.max(0, sim.pos - 1); root.innerHTML = testQHtml(); }
  if (act === "fwd") {
    if (sim.pos + 1 < sim.order.length) { sim.pos++; root.innerHTML = testQHtml(); }
    else root.innerHTML = reviewHtml();
  }
  if (act === "flag") {
    const qid = sim.order[sim.pos];
    sim.flags.has(qid) ? sim.flags.delete(qid) : sim.flags.add(qid);
    root.innerHTML = testQHtml();
  }
  if (act === "jump") {
    sim.pos = sim.order.indexOf(btn.dataset.qid);
    root.innerHTML = testQHtml();
  }
  if (act === "submit") {
    clearInterval(timerInterval);
    root.innerHTML = `<section class="card"><p>…</p></section>`;
    root.innerHTML = resultsHtml(await grade());
    window.scrollTo(0, 0);
  }
  if (act === "retake") { root.innerHTML = introHtml(); sim = null; }
}
