/**
 * Answer-event log — every answered question, from day one.
 * Record shape (see .planning/PROJECT.md and questions schema):
 *   { id, ts, state, mode, questionId, choiceIndex, correct, sessionId, locale }
 */
import { withStore, getAllFrom } from "./db.js";

const MODES = new Set(["study", "test", "flashcard", "review"]);

export function newSessionId() {
  return crypto.randomUUID();
}

/** Validate + append one answer event. Returns the stored record. */
export async function logAnswer({ state, mode, questionId, choiceIndex, correct, sessionId, locale }) {
  if (!MODES.has(mode)) throw new Error(`invalid mode: ${mode}`);
  if (typeof questionId !== "string" || !questionId) throw new Error("questionId required");
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0) throw new Error("choiceIndex must be a non-negative integer");
  if (typeof correct !== "boolean") throw new Error("correct must be boolean");
  if (typeof sessionId !== "string" || !sessionId) throw new Error("sessionId required");
  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    state: String(state ?? ""),
    mode,
    questionId,
    choiceIndex,
    correct,
    sessionId,
    locale: String(locale ?? ""),
  };
  await withStore("answer_events", "readwrite", (store) => store.add(record));
  return record;
}

export const eventsByQuestion = (questionId) =>
  getAllFrom("answer_events", { index: "by_question", range: IDBKeyRange.only(questionId) });

export const eventsBySession = (sessionId) =>
  getAllFrom("answer_events", { index: "by_session", range: IDBKeyRange.only(sessionId) });

export const eventsByDateRange = (fromTs, toTs) =>
  getAllFrom("answer_events", { index: "by_ts", range: IDBKeyRange.bound(fromTs, toTs) });

export const allEvents = () => getAllFrom("answer_events");

/** Most-recently missed question ids (for the milestone-2 review deck). */
export async function recentlyMissedQuestionIds({ limit = 50 } = {}) {
  const events = await getAllFrom("answer_events", { index: "by_ts" });
  const missed = [];
  const seen = new Set();
  for (let i = events.length - 1; i >= 0 && missed.length < limit; i--) {
    const e = events[i];
    if (!e.correct && !seen.has(e.questionId)) {
      seen.add(e.questionId);
      missed.push(e.questionId);
    }
  }
  return missed;
}
