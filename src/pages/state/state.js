/**
 * State picker — #/state. Renders the states registry
 * (data/states/index.json): one big touch target per 'available' state,
 * current selection marked; 'draft' states never render (authoring in
 * progress). Picking a state persists the setting and reloads the app —
 * every page caches its bank/config per load, so a reload is the one
 * clean-slate switch (offline-safe: the service worker runtime-caches any
 * state data after its first fetch).
 */
import { t, bilingual, getLangMode } from "../../i18n/i18n.js";
import { getSetting, setSetting } from "../../storage/settings.js";

let registry = null; // {version, states:[{code, name, status}]}
let query = ""; // search filter

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Diacritic-insensitive normalize (đ -> d, strip combining marks, lowercase). */
const normalize = (s) => String(s).toLowerCase().replaceAll("đ", "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

async function loadRegistry() {
  if (registry) return registry;
  const res = await fetch("data/states/index.json");
  if (!res.ok) throw new Error(`states registry: HTTP ${res.status}`);
  registry = await res.json();
  return registry;
}

/** Localized display name for a registry entry under the current language mode. */
function displayName(entry) {
  const tag = getLangMode() === "en" ? "en-US" : "vi-VN";
  return entry.name[tag] ?? entry.name["en-US"];
}

/** Available states, sorted A–Z by localized display name. */
export function availableStates(reg) {
  return reg.states
    .filter((s) => s.status === "available")
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

/** Available states matching the current search query (name or code). */
function filteredStates() {
  const q = normalize(query.trim());
  const all = availableStates(registry);
  if (!q) return all;
  return all.filter((s) => normalize(`${displayName(s)} ${s.code}`).includes(q));
}

function rowsHtml() {
  const current = getSetting("state", "oh");
  const list = filteredStates();
  if (list.length === 0) return `<p style="color:var(--muted)">${bilingual("picker.noResults")}</p>`;
  return list
    .map((s) => {
      const isCurrent = s.code === current;
      return `
      <button type="button" role="radio" aria-checked="${isCurrent}" data-state-pick="${s.code}"
        class="btn ${isCurrent ? "btn-primary" : "btn-secondary"}"
        style="margin-bottom:10px;justify-content:space-between;min-height:56px">
        <span>${esc(displayName(s))}</span>
        <span style="font-size:.85em">${isCurrent ? `✓ ${bilingual("state.current")}` : ""}</span>
      </button>`;
    })
    .join("");
}

function listHtml() {
  return `
  <section class="card">
    <h2>${bilingual("state.title")}</h2>
    <p>${bilingual("state.subtitle")}</p>
    <input id="state-search" type="search" value="${esc(query)}"
      placeholder="${esc(t("picker.search"))}" aria-label="${esc(t("picker.search"))}"
      style="width:100%;min-height:48px;padding:10px 14px;border:2.5px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-family:inherit;font-size:1rem;margin-bottom:12px">
    <div id="state-rows" role="radiogroup" aria-label="${esc(t("state.title"))}">${rowsHtml()}</div>
    <p style="color:var(--muted)">${bilingual("state.comingSoon")}</p>
  </section>`;
}

async function bootState() {
  const root = document.getElementById("state-root");
  if (!root) return;
  try {
    await loadRegistry();
  } catch (err) {
    root.innerHTML = `<section class="card"><h2>⚠️</h2><p>${esc(String(err))}</p></section>`;
    return;
  }
  query = "";
  root.innerHTML = listHtml();

  if (root.dataset.wired) return;
  root.dataset.wired = "1";
  // search input lives outside #state-rows, so re-rendering rows keeps its focus
  root.addEventListener("input", (e) => {
    if (e.target.id !== "state-search") return;
    query = e.target.value;
    const rows = document.getElementById("state-rows");
    if (rows) rows.innerHTML = rowsHtml();
  });
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-state-pick]");
    if (!btn) return;
    const code = btn.dataset.statePick;
    if (code === getSetting("state", "oh")) return; // already current
    await setSetting("state", code);
    location.reload();
  });
}

export function stateView() {
  queueMicrotask(bootState);
  return `<div id="state-root"><section class="card"><p>…</p></section></div>`;
}

/**
 * Fill every [data-state-name] element with the current state's localized
 * name (header route chip, home settings row). Safe to call before the
 * registry has ever loaded — it fetches (SW-cached) and fills when ready.
 */
export async function fillStateLabels(rootEl = document) {
  try {
    await loadRegistry();
  } catch {
    return; // decorative labels — never break the page over them
  }
  const current = getSetting("state", "oh");
  const entry = registry.states.find((s) => s.code === current);
  if (!entry) return;
  for (const el of rootEl.querySelectorAll("[data-state-name]")) {
    el.textContent =
      el.dataset.stateName === "upper" ? displayName(entry).toUpperCase() : displayName(entry);
  }
}
