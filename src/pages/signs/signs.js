/**
 * MUTCD sign gallery — browse all ~1,700 signs by category, search
 * (diacritic-insensitive, code + VI/EN names), "on the test" filter,
 * lazy-loaded images in batches of 60, detail view with a practice deep-link
 * into study mode for quiz-referenced signs.
 */
import { t, bilingual } from "../../i18n/i18n.js";
import { getSetting, setSetting } from "../../storage/settings.js";
import { newSessionId } from "../../storage/events.js";

const BATCH = 60;

let manifest = null;   // {version, count, signs: [{code, category, file, name?}]}
let bank = null;
let quizCodes = null;  // Set of codes referenced by the question bank
let filter = { category: "all", onTest: false, query: "" };
let shown = BATCH;
let detail = null;     // sign entry being viewed

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Diacritic-insensitive normalize (đ -> d, strip combining marks, lowercase). */
export function normalize(s) {
  return s
    .toLowerCase()
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

async function loadData() {
  if (!manifest) {
    const res = await fetch("data/signs/manifest.json");
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
    manifest = await res.json();
  }
  if (!bank) {
    const stateCode = getSetting("state", "oh");
    const res = await fetch(`data/states/${stateCode}/questions.json`);
    if (res.ok) {
      bank = await res.json();
      quizCodes = new Set(bank.questions.filter((q) => q.sign).map((q) => q.sign.code));
    } else {
      bank = { questions: [] };
      quizCodes = new Set();
    }
  }
}

export function filteredSigns() {
  const q = normalize(filter.query.trim());
  return manifest.signs.filter((s) => {
    if (filter.onTest && !quizCodes.has(s.code)) return false;
    if (filter.category !== "all" && s.category !== filter.category) return false;
    if (q) {
      const hay = normalize(`${s.code} ${s.name?.["vi-VN"] ?? ""} ${s.name?.["en-US"] ?? ""}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function categories() {
  return [...new Set(manifest.signs.map((s) => s.category))].sort();
}

function listHtml() {
  const all = filteredSigns();
  const visible = all.slice(0, shown);
  const catChips = ["all", ...categories()].map((c) => `
    <button class="btn btn-secondary" data-cat-filter="${c}"
      style="width:auto;min-height:44px;padding:8px 14px;margin:0 6px 8px 0;display:inline-flex;font-size:.9rem;${filter.category === c ? "box-shadow:inset 0 0 0 3px var(--green)" : ""}">
      ${c === "all" ? esc(t("gallery.all")) : esc(t(`gallery.cat.${c}`))}
    </button>`).join("");
  return `
  <section class="card">
    <input id="sign-search" type="search" value="${esc(filter.query)}"
      placeholder="${esc(t("gallery.search"))}" aria-label="${esc(t("gallery.search"))}"
      style="width:100%;min-height:48px;padding:10px 14px;border:2.5px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-family:inherit;font-size:1rem;margin-bottom:10px">
    <button class="btn btn-secondary" data-act="toggle-ontest"
      style="width:auto;min-height:44px;padding:8px 14px;margin-bottom:8px;display:inline-flex;${filter.onTest ? "box-shadow:inset 0 0 0 3px var(--orange)" : ""}">
      📝 ${bilingual("gallery.onTest")}
    </button>
    <div>${catChips}</div>
    <p style="color:var(--muted);font-size:.9rem">${t("gallery.count", { shown: visible.length, total: all.length })}</p>
  </section>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
    ${visible.map((s) => `
      <button class="btn btn-secondary" data-sign="${esc(s.code)}" data-file="${esc(s.file)}"
        style="flex-direction:column;padding:10px;min-height:130px">
        <img src="${esc(s.file)}" alt="${esc(s.code)}" loading="lazy" style="max-height:76px;max-width:100%">
        <span style="font-family:var(--font-sign);font-weight:700;font-size:.8rem;margin-top:6px">${esc(s.code)}</span>
      </button>`).join("")}
  </div>
  ${all.length > shown ? `<button class="btn btn-primary" data-act="more" style="margin-top:14px">${bilingual("gallery.loadMore")}</button>` : ""}`;
}

function detailHtml() {
  const s = detail;
  const related = bank.questions.filter((q) => q.sign?.code === s.code);
  return `
  <button class="btn btn-secondary" data-act="back" style="width:auto;min-height:44px;padding:8px 16px;margin-bottom:12px">← ${esc(t("action.back"))}</button>
  <section class="card" style="text-align:center">
    <img src="${esc(s.file)}" alt="${esc(s.code)}" style="max-height:220px;max-width:85%">
    <h2 style="margin-top:12px">${s.name ? `<span class="vi-main" lang="vi">${esc(s.name["vi-VN"] ?? s.name["en-US"])}</span><span class="en-sub" lang="en">${esc(s.name["en-US"])}</span>` : esc(s.code)}</h2>
    <p style="font-family:var(--font-sign);font-weight:700;color:var(--muted)">${esc(s.code)} · ${esc(t(`gallery.cat.${s.category}`))}</p>
    ${related.length ? `<button class="btn btn-primary" data-act="practice" style="margin-top:8px">🎯 ${bilingual("gallery.practiceSign")}</button>` : ""}
  </section>`;
}

export function signsView() {
  queueMicrotask(bootSigns);
  return `<div id="signs-root"><section class="card"><p>…</p></section></div>`;
}

async function bootSigns() {
  const root = document.getElementById("signs-root");
  if (!root) return;
  try {
    await loadData();
  } catch (err) {
    root.innerHTML = `<section class="card"><p>⚠️ ${esc(String(err))}</p></section>`;
    return;
  }
  detail = null;
  root.innerHTML = listHtml();
  if (root.dataset.wired) return;
  root.dataset.wired = "1";

  root.addEventListener("input", (e) => {
    if (e.target.id === "sign-search") {
      filter.query = e.target.value;
      shown = BATCH;
      const pos = e.target.selectionStart;
      root.innerHTML = listHtml();
      const box = root.querySelector("#sign-search");
      box.focus();
      box.setSelectionRange(pos, pos);
    }
  });

  root.addEventListener("click", async (e) => {
    const catBtn = e.target.closest("[data-cat-filter]");
    if (catBtn) {
      filter.category = catBtn.dataset.catFilter;
      shown = BATCH;
      root.innerHTML = listHtml();
      return;
    }
    const btn = e.target.closest("[data-act], [data-sign]");
    if (!btn) return;
    if (btn.dataset.sign) {
      detail = manifest.signs.find((s) => s.code === btn.dataset.sign && s.file === btn.dataset.file);
      root.innerHTML = detailHtml();
      window.scrollTo(0, 0);
      return;
    }
    const act = btn.dataset.act;
    if (act === "toggle-ontest") {
      filter.onTest = !filter.onTest;
      shown = BATCH;
      root.innerHTML = listHtml();
    }
    if (act === "more") {
      shown += BATCH;
      root.innerHTML = listHtml();
    }
    if (act === "back") {
      detail = null;
      root.innerHTML = listHtml();
    }
    if (act === "practice") {
      // Deep link: seed a study session with this sign's questions (uses the
      // study page's persisted-session contract), then navigate there.
      const ids = bank.questions.filter((q) => q.sign?.code === detail.code).map((q) => q.id);
      await setSetting("study.session", {
        category: "signs", queue: ids, pos: 0, correct: 0, sessionId: newSessionId(),
      });
      location.hash = "#/study";
    }
  });
}
