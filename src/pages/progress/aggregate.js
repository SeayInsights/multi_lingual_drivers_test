/**
 * Progress aggregation — pure functions over the answer-event log.
 * All functions take plain arrays/objects (injectable, deterministic).
 */
const DAY = 24 * 60 * 60 * 1000;

/** Per-category accuracy over each category's most recent `lastN` answers. */
export function categoryAccuracy(events, bank, { lastN = 20 } = {}) {
  const catOf = new Map(bank.questions.map((q) => [q.id, q.category]));
  const byCat = new Map();
  // events assumed appended chronologically; walk newest-first
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const cat = catOf.get(e.questionId);
    if (!cat) continue;
    let bucket = byCat.get(cat);
    if (!bucket) byCat.set(cat, (bucket = { category: cat, correct: 0, total: 0 }));
    if (bucket.total < lastN) {
      bucket.total++;
      if (e.correct) bucket.correct++;
    }
  }
  return [...byCat.values()].map((b) => ({ ...b, pct: b.total ? Math.round((100 * b.correct) / b.total) : 0 }));
}

/** Per-section accuracy (for readiness vs the state file's thresholds). */
export function sectionAccuracy(events, bank, { lastN = 40 } = {}) {
  const secOf = new Map(bank.questions.map((q) => [q.id, q.section]));
  const bySec = new Map();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const sec = secOf.get(e.questionId);
    if (!sec) continue;
    let bucket = bySec.get(sec);
    if (!bucket) bySec.set(sec, (bucket = { section: sec, correct: 0, total: 0 }));
    if (bucket.total < lastN) {
      bucket.total++;
      if (e.correct) bucket.correct++;
    }
  }
  return [...bySec.values()].map((b) => ({ ...b, pct: b.total ? (100 * b.correct) / b.total : 0 }));
}

/** Consecutive-day study streak ending today or yesterday. */
export function streakDays(events, { now = Date.now() } = {}) {
  const days = new Set(events.map((e) => Math.floor(e.ts / DAY)));
  const today = Math.floor(now / DAY);
  let start = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (start === null) return 0;
  let n = 0;
  while (days.has(start - n)) n++;
  return n;
}

export function totals(events) {
  return {
    answered: events.length,
    correct: events.filter((e) => e.correct).length,
  };
}

/**
 * Readiness verdict against the state file's per-section thresholds.
 * 'ready' needs every section at/above its passing ratio with at least
 * `minSample` recent answers in that section; 'almost' at >=60%.
 */
export function readiness(sections, stateCfg, { minSample = 10 } = {}) {
  const cfg = new Map(stateCfg.test.sections.map((s) => [s.id, (100 * s.minCorrect) / s.questionCount]));
  let allReady = cfg.size > 0;
  let anyData = false;
  for (const [id, needPct] of cfg) {
    const s = sections.find((x) => x.section === id);
    if (!s || s.total < minSample) { allReady = false; continue; }
    anyData = true;
    if (s.pct < needPct) allReady = false;
  }
  if (allReady) return "ready";
  if (anyData && sections.every((s) => s.total < minSample || s.pct >= 60)) return "almost";
  return "keepStudying";
}
