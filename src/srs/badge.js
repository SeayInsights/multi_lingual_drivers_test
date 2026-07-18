/**
 * Fills every .flash-due-badge element with the current due-card count.
 * Shared by Home and Study entry points.
 */
import { t } from "../i18n/i18n.js";
import { getSetting } from "../storage/settings.js";
import { getDueCount } from "./leitner.js";

export async function fillDueBadges() {
  const badges = document.querySelectorAll(".flash-due-badge");
  if (!badges.length) return;
  try {
    const stateCode = getSetting("state", "oh");
    const res = await fetch(`data/states/${stateCode}/questions.json`);
    if (!res.ok) return;
    const bank = await res.json();
    const n = await getDueCount(bank);
    for (const b of badges) b.textContent = t("flash.due", { count: n });
  } catch {
    /* badge is decorative — never break the page for it */
  }
}
