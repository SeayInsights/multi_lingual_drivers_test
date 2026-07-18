/**
 * Progress dashboard — mastery rings per topic, study streak, test history,
 * best score, and a readiness verdict driven by the state file's thresholds.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { allEvents } from "../../storage/events.js";
import { getSetting } from "../../storage/settings.js";
import { categoryAccuracy, sectionAccuracy, streakDays, totals, readiness } from "./aggregate.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ring(pct, label, sub) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--yellow)" : "var(--orange)";
  return `
  <div style="text-align:center;min-width:104px">
    <svg viewBox="0 0 88 88" width="88" height="88" role="img" aria-label="${esc(label)}: ${pct}%">
      <circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/>
      <circle cx="44" cy="44" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 44 44)"/>
      <text x="44" y="50" text-anchor="middle" font-family="var(--font-sign)" font-weight="900" font-size="20" fill="var(--ink)">${pct}%</text>
    </svg>
    <div style="font-weight:700;font-size:.85rem">${label}</div>
    <div style="color:var(--muted);font-size:.75rem">${sub}</div>
  </div>`;
}

export function progressView() {
  queueMicrotask(bootProgress);
  return `<div id="progress-root"><section class="card"><p>…</p></section></div>`;
}

async function bootProgress() {
  const root = document.getElementById("progress-root");
  if (!root) return;
  try {
    const stateCode = getSetting("state", "oh");
    const [events, bankRes, cfgRes] = await Promise.all([
      allEvents(),
      fetch(`data/states/${stateCode}/questions.json`),
      fetch(`data/states/${stateCode}/state.json`),
    ]);
    const bank = await bankRes.json();
    const stateCfg = await cfgRes.json();
    events.sort((a, b) => a.ts - b.ts);

    const cats = categoryAccuracy(events, bank);
    const secs = sectionAccuracy(events, bank);
    const verdictKey = { ready: "progress.ready", almost: "progress.almostReady", keepStudying: "progress.keepStudying" }[readiness(secs, stateCfg)];
    const streak = streakDays(events);
    const sums = totals(events);
    const history = (getSetting("test.history", []) ?? []).slice(-5).reverse();
    const best = getSetting("bestScore") ?? getSetting("legacyBestScore");

    root.innerHTML = `
    <section class="card ${verdictKey === "progress.ready" ? "card-green" : ""}" style="text-align:center">
      <h2>${bilingual(verdictKey)}</h2>
      <p style="color:${verdictKey === "progress.ready" ? "inherit" : "var(--muted)"}">${t("progress.answeredTotal", { count: sums.answered, correct: sums.correct })}</p>
    </section>
    <section class="card">
      <h2>${bilingual("home.streak", { days: streak })}</h2>
      <p style="font-size:2rem;margin:4px 0;font-family:var(--font-sign);font-weight:900">${streak > 0 ? "🔥".repeat(Math.min(streak, 7)) : "🌱"} ${streak}</p>
      <p style="color:var(--muted)">${bilingual("progress.keepStudying")}</p>
    </section>
    <section class="card">
      <h2>${bilingual("progress.mastery")}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
        ${cats.length ? cats.map((c) => ring(c.pct, t(`topic.${c.category}`), `${c.correct}/${c.total}`)).join("") : `<p style="color:var(--muted)">${esc(t("progress.noData"))}</p>`}
      </div>
    </section>
    <section class="card">
      <h2>${bilingual("progress.testHistory")}</h2>
      ${best ? `<div class="setting-row"><span>${bilingual("home.bestScore", { score: `${best.score}/${best.total}` })}</span><strong>${best.score}/${best.total}</strong></div>` : ""}
      ${history.length ? history.map((h) => `
        <div class="setting-row">
          <span>${new Date(h.ts).toLocaleDateString(document.documentElement.lang === "en" ? "en-US" : "vi-VN")}</span>
          <strong style="color:${h.passed ? "var(--green)" : "var(--red)"}">${h.totalCorrect}/${h.total} ${h.passed ? "✓" : "✗"}</strong>
        </div>`).join("") : `<p style="color:var(--muted)">${esc(t("progress.noTests"))}</p>`}
    </section>`;
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
  }
}
