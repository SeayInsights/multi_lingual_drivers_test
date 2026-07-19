# US Driver's License Practice

**A free US driver's license knowledge-test practice app — in your language.**

Live app: https://seayinsights.github.io/multi_lingual_drivers_test/

> This README is written in English so it can be machine-translated (right-click
> then Translate in most browsers). The app itself is multilingual — pick your
> language inside it.

## About

This app helps people pass their US state driver's license knowledge test. You
pick your state and your language; the app shows national road-sign content
(federal MUTCD signs, which are the same everywhere) plus that state's specific
test format, passing rules, and questions.

It was built first for Southern Vietnamese speakers and the Ohio BMV test, then
grown to cover all 50 states + DC and additional languages.

### What's included

- All 51 US jurisdictions (50 states + DC). Each shows its real question count,
  passing rule, permit age, and testing agency, sourced from official state
  driver handbooks.
- Languages: the interface is available in Vietnamese, Spanish, and English.
  English is always shown as a second line under your chosen language, and
  choosing English gives an English-only mode to rehearse like the real test.
- Study mode, a realistic test simulation (per-section or overall passing rules,
  matching each state), sign flashcards with spaced repetition, a wrong-answer
  review deck, and a 1,600+ MUTCD sign gallery.
- History and reflection: lifetime accuracy, study streak, activity over time,
  weak-area insights, and past test results.
- Backup: export all your progress and settings to a file and import it on
  another device — no account required.

### Design principles

- Mobile-first, installable PWA — works fully offline after the first visit.
- 100% free: no accounts, no ads, no tracking. Hosted on GitHub Pages, $0 to run.
- Every state is a data file (data/states/<code>/) — adding a state never
  touches app code.
- Every language is a locale file (locales/<tag>.json) plus one registry entry —
  adding a language never touches app code either.
- All progress stays on the user's device (IndexedDB); the only way data leaves
  the device is a backup file the user chooses to create.

## Who it's for

Immigrants and families across the US studying for the knowledge test in their
own language — including older adults with limited English and limited tech
comfort. If you can open a link, you can study.

## Contributing a translation

Adding a language is one locale file plus one registry entry — no code. In
short: copy locales/en-US.json, translate every string (keep the keys and
{placeholders} unchanged), add an entry to locales/index.json, and run
`npm run validate` — it enforces that every language has exactly the same keys
so nothing is left untranslated.

## Development

No build step. The site is plain HTML/CSS/JS served from the repo root.

    npx serve .

Validate all data (state files, question banks, locales, service-worker version):

    npm run validate

Run the test suite:

    python -m pytest tests/

The site must work at a repo subpath, so all asset URLs are relative — never
start a URL with a slash.

## Deployment

Every push to main deploys automatically to GitHub Pages via
.github/workflows/deploy-pages.yml. The service worker version in sw.js is
bumped on every release so users always receive updated content instead of a
stale cache.

## Licensing

This project is licensed under the Apache License 2.0 — see the LICENSE file.

Additional notes on bundled content:

- Traffic sign artwork (traffic_signs/): official MUTCD sign designs by the US
  Federal Highway Administration — US government works in the public domain.
- Question content: written from public state driver handbooks and digests.
  Always confirm the current rules with your state's licensing agency before
  your test. For states whose official test format is not published, the app
  clearly labels its practice format as such.
