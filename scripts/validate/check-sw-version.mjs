#!/usr/bin/env node
/**
 * Guard: the service worker VERSION must change whenever precached content
 * changes, or shipped fixes never reach users (cache-first serves stale files
 * forever — the exact failure the operator hit on 2026-07-18).
 *
 * Hashes every file in sw.js's CORE list plus the quiz-referenced sign images
 * into data/sw-version-lock.json {contentHash, version}.
 *
 *   node scripts/validate/check-sw-version.mjs           # verify (exit 1 on drift)
 *   node scripts/validate/check-sw-version.mjs --update  # rewrite the lock
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCK = join(ROOT, "data", "sw-version-lock.json");
const UPDATE = process.argv.includes("--update");

const sw = readFileSync(join(ROOT, "sw.js"), "utf-8");
const version = sw.match(/const VERSION = "([^"]+)"/)?.[1];
if (!version) {
  console.error("check-sw-version: could not read VERSION from sw.js");
  process.exit(1);
}

// CORE list from sw.js
const coreMatch = sw.match(/const CORE = \[([\s\S]*?)\];/);
const core = [...coreMatch[1].matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "");

// plus quiz-referenced sign images (precached at install)
const bank = JSON.parse(readFileSync(join(ROOT, "data/states/oh/questions.json"), "utf-8"));
const signs = [...new Set(bank.questions.filter((q) => q.sign).map((q) => q.sign.image))];

const hash = createHash("sha256");
for (const rel of [...core, ...signs].sort()) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    console.error(`check-sw-version: precached file missing on disk: ${rel}`);
    process.exit(1);
  }
  hash.update(rel);
  hash.update(readFileSync(p));
}
const contentHash = hash.digest("hex");

if (UPDATE) {
  writeFileSync(LOCK, JSON.stringify({ contentHash, version }, null, 2) + "\n");
  console.log(`sw-version-lock updated: ${version} / ${contentHash.slice(0, 12)}…`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  console.error("check-sw-version: lock missing. Run with --update after setting VERSION.");
  process.exit(1);
}
const lock = JSON.parse(readFileSync(LOCK, "utf-8"));
if (lock.contentHash !== contentHash && lock.version === version) {
  console.error(
    `check-sw-version: precached content changed but sw.js VERSION is still '${version}'.\n` +
    "Bump VERSION in sw.js, then run: node scripts/validate/check-sw-version.mjs --update"
  );
  process.exit(1);
}
if (lock.contentHash === contentHash && lock.version !== version) {
  console.error("check-sw-version: VERSION bumped but lock not regenerated. Run with --update.");
  process.exit(1);
}
if (lock.contentHash !== contentHash && lock.version !== version) {
  console.error("check-sw-version: content and VERSION changed — regenerate the lock with --update.");
  process.exit(1);
}
console.log(`sw-version ok: ${version}`);
