#!/usr/bin/env node
/**
 * One-time extraction (M4): derive the national MUTCD signs pool from Ohio's
 * verified sign questions.
 *
 *   data/states/oh/questions.json (section === "signs")
 *     -> data/questions/national-signs.json
 *
 * MUTCD signs are federal — the meaning of R1-1 is the same in every state —
 * so the Ohio sign bank, already verified against the Digest, seeds the pool
 * every OTHER state composes its bank from (Ohio keeps its own bank and ids
 * untouched; answer history keys on ids).
 *
 * Transformations, all explicit and auditable:
 *  - ids:      oh-signs-NNN -> us-signs-NNN (1:1, no renumbering, ever)
 *  - source:   Ohio Digest citation -> MUTCD/FHWA citation (the national
 *              authority for sign meaning); Digest chapter names dropped
 *  - EXCLUDED: questions whose stem is genuinely Ohio-specific
 *  - NEUTRALIZED: explanations with Ohio flavor rewritten state-neutral
 *              (facts like fine amounts / passing distances vary by state)
 *
 * After M4 the pool is its own content line: edits to Ohio sign questions do
 * NOT flow here automatically. Re-running this script overwrites the pool —
 * only do that deliberately.
 *
 * Usage: node scripts/migrate/extract-national-signs.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Stems that only make sense in Ohio — these stay Ohio-only. Other states get
// their own state-specific sign questions in their authoring batches.
const EXCLUDE = new Set([
  "oh-signs-069", // "Exit numbers on Ohio Interstates are based on:" — numbering scheme varies by state
  "oh-signs-091", // "Route markers for Ohio STATE routes are shaped like:" — every state's marker differs
]);

// Explanations that cite Ohio law or Ohio flavor, rewritten state-neutral.
// The correct answers are unchanged — only teaching text is generalized.
const NEUTRAL_EXPLANATIONS = {
  "oh-signs-018": {
    "en-US": "Orange means a work zone. In many states, speeding fines double in work zones when workers are present.",
    "vi-VN": "Màu CAM = khu vực thi công. Ở nhiều tiểu bang, tiền phạt chạy quá tốc độ TĂNG GẤP ĐÔI trong khu công trường khi có công nhân.",
  },
  "oh-signs-035": {
    "en-US": "Deer crossing zones are serious — if one crosses, expect more to follow.",
    "vi-VN": "Khu nai băng đường rất nguy hiểm — thấy một con thì thường còn con khác theo sau.",
  },
  "oh-signs-052": {
    "en-US": "Yellow bicycle warning: expect riders — most states require about 3 feet of clearance when passing a bicycle.",
    "vi-VN": "Biển vàng hình xe đạp: chú ý người đạp xe — đa số tiểu bang bắt buộc vượt cách xe đạp khoảng 3 feet (gần 1 mét).",
  },
  "oh-signs-063": {
    "en-US": "The red-white-blue shield numbers Interstate routes (e.g., I-70, I-75, I-95).",
    "vi-VN": "Khiên đỏ-trắng-xanh là số hiệu xa lộ liên bang (ví dụ I-70, I-75, I-95).",
  },
  "oh-signs-085": {
    "en-US": "Common on rural roads (farm equipment and horse-drawn buggies) — closing speed builds FAST; slow early.",
    "vi-VN": "Thường gặp ở vùng quê (máy cày, xe ngựa) — chênh lệch tốc độ khép lại RẤT nhanh; giảm tốc sớm.",
  },
  "oh-signs-090": {
    "en-US": "The International Symbol of Access — misusing those spaces carries heavy fines in every state.",
    "vi-VN": "Ký hiệu tiếp cận quốc tế — chiếm dụng những chỗ này bị phạt nặng ở mọi tiểu bang.",
  },
};

const NATIONAL_SOURCE = {
  title: "Manual on Uniform Traffic Control Devices (MUTCD), 11th Edition, FHWA",
  url: "https://mutcd.fhwa.dot.gov/",
};

const bank = JSON.parse(readFileSync(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
const signs = bank.questions.filter((q) => q.section === "signs");

const pool = [];
for (const q of signs) {
  if (EXCLUDE.has(q.id)) continue;
  const out = structuredClone(q);
  out.id = q.id.replace(/^oh-/, "us-");
  out.source = { ...NATIONAL_SOURCE };
  if (NEUTRAL_EXPLANATIONS[q.id]) out.explanation = { ...NEUTRAL_EXPLANATIONS[q.id] };
  pool.push(out);
}

// Loud guard: no Ohio references may survive in the national pool.
const leaks = pool.filter((q) => /ohio|bmv|tipic|digest/i.test(JSON.stringify(q)));
if (leaks.length) {
  console.error(`extract-national-signs: Ohio reference leaked into pool: ${leaks.map((q) => q.id).join(", ")}`);
  process.exit(1);
}

const outFile = join(ROOT, "data", "questions", "national-signs.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({ stateCode: "us", version: 1, questions: pool }, null, 2) + "\n",
  "utf-8"
);
console.log(
  `national-signs.json: ${pool.length} questions (${signs.length} Ohio signs, ${EXCLUDE.size} excluded as state-specific, ${Object.keys(NEUTRAL_EXPLANATIONS).length} explanations neutralized)`
);
