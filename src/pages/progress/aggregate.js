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

/** Per-day activity for the last `days` days (oldest→newest), each
 * {day (epoch-day int), ts (day start ms), answered, correct}. */
export function dailyActivity(events, { days = 30, now = Date.now() } = {}) {
  const today = Math.floor(now / DAY);
  const from = today - days + 1;
  const byDay = new Map();
  for (const e of events) {
    const d = Math.floor(e.ts / DAY);
    if (d < from) continue;
    let b = byDay.get(d);
    if (!b) byDay.set(d, (b = { answered: 0, correct: 0 }));
    b.answered++;
    if (e.correct) b.correct++;
  }
  const out = [];
  for (let d = from; d <= today; d++) {
    const b = byDay.get(d) ?? { answered: 0, correct: 0 };
    out.push({ day: d, ts: d * DAY, answered: b.answered, correct: b.correct });
  }
  return out;
}

/** Rolling accuracy over chronological buckets of `size` answers (oldest→newest). */
export function accuracyTrend(events, { size = 20 } = {}) {
  const out = [];
  for (let i = 0; i < events.length; i += size) {
    const chunk = events.slice(i, i + size);
    const correct = chunk.filter((e) => e.correct).length;
    out.push({ from: i, count: chunk.length, correct, pct: Math.round((100 * correct) / chunk.length) });
  }
  return out;
}

/** All-time accuracy per category, worst-first, for categories with >= minSample answers. */
export function allTimeWeakAreas(events, bank, { minSample = 5 } = {}) {
  const catOf = new Map(bank.questions.map((q) => [q.id, q.category]));
  const byCat = new Map();
  for (const e of events) {
    const cat = catOf.get(e.questionId);
    if (!cat) continue;
    let b = byCat.get(cat);
    if (!b) byCat.set(cat, (b = { category: cat, correct: 0, total: 0 }));
    b.total++;
    if (e.correct) b.correct++;
  }
  return [...byCat.values()]
    .filter((b) => b.total >= minSample)
    .map((b) => ({ ...b, pct: Math.round((100 * b.correct) / b.total) }))
    .sort((a, b) => a.pct - b.pct);
}

/** Summary of the saved practice-test history array. */
export function testHistorySummary(history = []) {
  const taken = history.length;
  const passed = history.filter((h) => h.passed).length;
  const best = history.reduce((m, h) => Math.max(m, h.totalCorrect ?? 0), 0);
  const lastTs = taken ? history[history.length - 1].ts ?? null : null;
  return { taken, passed, failed: taken - passed, best, lastTs };
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
