/**
 * History & reflection — #/history. Reads the day-one answer-event log plus
 * the saved practice-test history and reflects it back: lifetime totals,
 * study streak, per-day activity, an accuracy trend, weak areas, and recent
 * test results. Pure reads — no logging here.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { getSetting } from "../../storage/settings.js";
import { allEvents } from "../../storage/events.js";
import { exportBackup, backupToBlob, backupFilename, importBackup, parseBackupText } from "../../storage/backup.js";
import {
  totals, streakDays, dailyActivity, accuracyTrend, allTimeWeakAreas, testHistorySummary,
} from "../progress/aggregate.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catLabel = (cat) => t(`topic.${cat}`);

async function loadBank() {
  const stateCode = getSetting("state", "oh");
  const res = await fetch(`data/states/${stateCode}/questions.json`);
  return res.ok ? res.json() : { questions: [] };
}

function activityBars(days) {
  const max = Math.max(1, ...days.map((d) => d.answered));
  return `<div style="display:flex;align-items:flex-end;gap:2px;height:64px;margin:6px 0">${days
    .map((d) => {
      const h = Math.round((d.answered / max) * 100);
      const acc = d.answered ? Math.round((100 * d.correct) / d.answered) : 0;
      const color = d.answered === 0 ? "var(--line)" : acc >= 80 ? "var(--green)" : acc >= 60 ? "var(--orange, #d97706)" : "var(--red)";
      const date = new Date(d.ts).toISOString().slice(5, 10);
      return `<div title="${date}: ${d.answered} (${acc}%)" style="flex:1;min-width:3px;height:${Math.max(2, h)}%;background:${color};border-radius:2px"></div>`;
    })
    .join("")}</div>`;
}

function trendRow(points) {
  if (points.length < 2) return "";
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:48px;margin:6px 0">${points
    .map((p) => {
      const color = p.pct >= 80 ? "var(--green)" : p.pct >= 60 ? "var(--orange, #d97706)" : "var(--red)";
      return `<div title="${p.pct}%" style="flex:1;height:${Math.max(4, p.pct)}%;background:${color};border-radius:2px"></div>`;
    })
    .join("")}</div>`;
}

const backupCard = () => `
  <section class="card">
    <h2>${bilingual("backup.title")}</h2>
    <p style="color:var(--muted)">${bilingual("backup.subtitle")}</p>
    <button type="button" class="btn btn-secondary" data-act="export" style="margin-bottom:10px">⬇️ ${bilingual("backup.export")}</button>
    <label class="btn btn-secondary" style="cursor:pointer">⬆️ ${bilingual("backup.import")}
      <input type="file" accept="application/json,.json" data-act="import" style="display:none">
    </label>
    <p id="backup-status" role="status" style="margin-top:8px;color:var(--muted)"></p>
  </section>`;

async function bootHistory() {
  const root = document.getElementById("history-root");
  if (!root) return;
  const [events, bank] = await Promise.all([allEvents(), loadBank()]);
  const history = getSetting("test.history", []);

  if (events.length === 0 && history.length === 0) {
    root.innerHTML = `<section class="card"><h2>${bilingual("history.title")}</h2>
      <p>${bilingual("history.empty")}</p>
      <a class="btn btn-primary" href="#/study" style="text-decoration:none;margin-bottom:10px">${bilingual("tab.study")}</a></section>
      ${backupCard()}`;
    wireBackup(root);
    return;
  }

  const tot = totals(events);
  const acc = tot.answered ? Math.round((100 * tot.correct) / tot.answered) : 0;
  const streak = streakDays(events);
  const days = dailyActivity(events, { days: 30 });
  const trend = accuracyTrend(events, { size: 20 });
  const weak = allTimeWeakAreas(events, bank, { minSample: 5 }).slice(0, 5);
  const th = testHistorySummary(history);

  const weakHtml = weak.length
    ? weak
        .map(
          (w) => `<a href="#/study" style="text-decoration:none" class="setting-row">
            <span>${esc(catLabel(w.category))}</span>
            <strong style="color:${w.pct >= 80 ? "var(--green)" : w.pct >= 60 ? "var(--orange, #d97706)" : "var(--red)"}">${w.pct}% <span style="color:var(--muted);font-weight:400">(${w.correct}/${w.total})</span></strong>
          </a>`
        )
        .join("")
    : `<p style="color:var(--muted)">${bilingual("history.needMore")}</p>`;

  const testRows = history
    .slice(-5)
    .reverse()
    .map((h) => {
      const d = h.ts ? new Date(h.ts).toISOString().slice(0, 10) : "";
      return `<div class="setting-row"><span>${esc(d)}</span>
        <strong style="color:${h.passed ? "var(--green)" : "var(--red)"}">${h.totalCorrect}/${h.total} ${h.passed ? "✓" : "✗"}</strong></div>`;
    })
    .join("");

  root.innerHTML = `
  <section class="card card-green" style="text-align:center">
    <h2>${bilingual("history.title")}</h2>
    <p style="font-family:var(--font-sign);font-weight:900;font-size:1.6rem">${acc}%</p>
    <p>${t("history.lifetime", { answered: tot.answered, correct: tot.correct })}</p>
    ${streak > 0 ? `<p>${t("home.streak", { days: streak })}</p>` : ""}
  </section>
  <section class="card">
    <h2>${bilingual("history.activity")}</h2>
    ${activityBars(days)}
    <p style="color:var(--muted);font-size:.85rem">${bilingual("history.activityHint")}</p>
  </section>
  ${trend.length >= 2 ? `<section class="card"><h2>${bilingual("history.trend")}</h2>${trendRow(trend)}
    <p style="color:var(--muted);font-size:.85rem">${bilingual("history.trendHint")}</p></section>` : ""}
  <section class="card">
    <h2>${bilingual("history.weakAreas")}</h2>
    ${weakHtml}
  </section>
  ${th.taken ? `<section class="card"><h2>${bilingual("history.tests")}</h2>
    <p>${t("history.testsSummary", { taken: th.taken, passed: th.passed, best: th.best })}</p>
    ${testRows}</section>` : ""}
  ${backupCard()}`;
  wireBackup(root);
}

/** Wire the export (download) and import (file) controls. Idempotent per render. */
export function wireBackup(root, { doc = document, win = window } = {}) {
  if (root.dataset.backupWired) return;
  root.dataset.backupWired = "1";
  const setStatus = (msg) => {
    const el = doc.getElementById("backup-status");
    if (el) el.textContent = msg;
  };
  root.addEventListener("click", async (e) => {
    if (!e.target.closest('[data-act="export"]')) return;
    try {
      const backup = await exportBackup();
      const url = URL.createObjectURL(backupToBlob(backup));
      const a = doc.createElement("a");
      a.href = url;
      a.download = backupFilename(backup);
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(t("backup.exported", { count: backup.stores.answer_events.length }));
    } catch {
      setStatus(t("backup.error"));
    }
  });
  root.addEventListener("change", async (e) => {
    const input = e.target.closest('[data-act="import"]');
    if (!input || !input.files || !input.files[0]) return;
    try {
      const text = await input.files[0].text();
      const counts = await importBackup(await parseBackupText(text));
      setStatus(t("backup.imported", { count: counts.answer_events }));
      setTimeout(() => win.location.reload(), 800);
    } catch {
      setStatus(t("backup.invalid"));
    }
  });
}

export function historyView() {
  queueMicrotask(bootHistory);
  return `<div id="history-root"><section class="card"><p>…</p></section></div>`;
}
