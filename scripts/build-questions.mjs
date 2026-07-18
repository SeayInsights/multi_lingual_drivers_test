#!/usr/bin/env node
/**
 * Question-bank build: merges the migrated legacy base with authored batches.
 *
 *   data/states/<code>/base-questions.json      (the 57 migrated legacy questions)
 * + data/states/<code>/authoring/*.json          (arrays of question objects)
 * = data/states/<code>/questions.json            (the shipped bank)
 *
 * Guarantees, enforced loudly:
 *  - every legacy question id survives unchanged (history keys on ids)
 *  - ids unique across the whole bank
 *  - bank version = 1 + number of batch files (cache busting tracks content)
 * Schema/cross-field validity is enforced by validate-data.mjs afterwards.
 *
 * Usage: node scripts/build-questions.mjs [state]   (default: oh)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const code = process.argv[2] ?? "oh";
const dir = join(ROOT, "data", "states", code);
const base = JSON.parse(readFileSync(join(dir, "base-questions.json"), "utf-8"));

const authoringDir = join(dir, "authoring");
const batchFiles = existsSync(authoringDir)
  ? readdirSync(authoringDir).filter((f) => f.endsWith(".json")).sort()
  : [];

const questions = [...base.questions];
const seen = new Set(questions.map((q) => q.id));
let added = 0;
for (const f of batchFiles) {
  const batch = JSON.parse(readFileSync(join(authoringDir, f), "utf-8"));
  if (!Array.isArray(batch)) {
    console.error(`build-questions: ${f} must be a JSON array of questions`);
    process.exit(1);
  }
  for (const q of batch) {
    if (seen.has(q.id)) {
      console.error(`build-questions: duplicate id '${q.id}' in ${f}`);
      process.exit(1);
    }
    seen.add(q.id);
    questions.push(q);
    added++;
  }
}

// legacy preservation: every base id must still be present, unmodified count
for (const q of base.questions) {
  if (!seen.has(q.id)) {
    console.error(`build-questions: legacy id '${q.id}' missing from output`);
    process.exit(1);
  }
}

const out = { stateCode: base.stateCode, version: 1 + batchFiles.length, questions };
writeFileSync(join(dir, "questions.json"), JSON.stringify(out, null, 2) + "\n", "utf-8");
const bySection = {};
for (const q of questions) bySection[q.section] = (bySection[q.section] ?? 0) + 1;
console.log(`questions.json: ${questions.length} total (${added} authored across ${batchFiles.length} batches) — ${Object.entries(bySection).map(([s, n]) => `${s}=${n}`).join(", ")}`);
