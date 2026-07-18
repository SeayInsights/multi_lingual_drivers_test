/**
 * Leitner spaced-repetition engine over the srs_state store (reserved for this
 * in the WO-5 schema).
 *
 * Five boxes. A card you know moves up a box (longer interval); a card you
 * miss drops back to box 1 (due immediately). Intervals in days per box:
 *   box 1: 0 (same day) · box 2: 1 · box 3: 3 · box 4: 7 · box 5: 14
 *
 * All functions accept an optional `now` (ms) so tests control the clock.
 */
import { withStore, getAllFrom } from "../storage/db.js";

const DAY = 24 * 60 * 60 * 1000;
export const INTERVALS_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
export const MAX_BOX = 5;
export const SESSION_CAP = 20;

export async function getStates() {
  const rows = await getAllFrom("srs_state");
  return new Map(rows.map((r) => [r.questionId, r]));
}

async function put(record) {
  await withStore("srs_state", "readwrite", (store) => store.put(record));
  return record;
}

/** Card marked "know it": up a box, due after that box's interval. */
export async function promote(questionId, { now = Date.now() } = {}) {
  const states = await getStates();
  const prev = states.get(questionId);
  const box = Math.min((prev?.box ?? 0) + 1, MAX_BOX);
  return put({ questionId, box, dueTs: now + INTERVALS_DAYS[box] * DAY, lastTs: now });
}

/** Card marked "still learning": back to box 1, due immediately. */
export async function demote(questionId, { now = Date.now() } = {}) {
  return put({ questionId, box: 1, dueTs: now, lastTs: now });
}

/**
 * Deck builder: due sign-cards first (oldest due first), then unseen signs,
 * then not-yet-due (soonest first) to fill up to `limit`.
 */
export async function buildDeck(bank, { now = Date.now(), limit = SESSION_CAP } = {}) {
  const signQs = bank.questions.filter((q) => q.sign);
  const states = await getStates();
  const due = [];
  const unseen = [];
  const later = [];
  for (const q of signQs) {
    const s = states.get(q.id);
    if (!s) unseen.push(q);
    else if (s.dueTs <= now) due.push(q);
    else later.push(q);
  }
  due.sort((a, b) => states.get(a.id).dueTs - states.get(b.id).dueTs);
  later.sort((a, b) => states.get(a.id).dueTs - states.get(b.id).dueTs);
  return [...due, ...unseen, ...later].slice(0, limit);
}

/** Count shown on entry-point badges: due now + never seen. */
export async function getDueCount(bank, { now = Date.now() } = {}) {
  const signQs = bank.questions.filter((q) => q.sign);
  const states = await getStates();
  let n = 0;
  for (const q of signQs) {
    const s = states.get(q.id);
    if (!s || s.dueTs <= now) n++;
  }
  return n;
}
