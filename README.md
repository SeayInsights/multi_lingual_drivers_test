# Luyện Thi Bằng Lái Xe · US Driver's License Practice

**Ứng dụng luyện thi bằng lái xe Mỹ miễn phí — tiếng Việt và tiếng Anh.**
*A free US driver's license knowledge-test practice app — Vietnamese and English.*

🌐 **Live app:** https://seayinsights.github.io/multi_lingual_drivers_test/

## About · Giới thiệu

This app helps people pass their US state driver's license knowledge test,
starting with **Southern Vietnamese speakers** and the **Ohio BMV test**. The
user picks their state; the app shows national (MUTCD) road-sign content that
applies everywhere, plus that state's specific test format, passing rules, and
questions.

Ứng dụng này giúp mọi người thi đậu bằng lái xe ở Mỹ. Bắt đầu với tiểu bang
Ohio và tiếng Việt — sẽ mở rộng ra tất cả 50 tiểu bang và nhiều ngôn ngữ khác.

**Key design principles:**
- 📱 Mobile-first, installable PWA — works fully offline after the first visit
- 🆓 100% free: no accounts, no ads, no tracking, hosted on GitHub Pages
- 🗺️ Every state is a data file (`data/states/<code>/`) — adding a state never
  touches app code
- 🌏 Every language is a set of locale files (`locales/<tag>.json`) — Southern
  Vietnamese (`vi-VN`) and English (`en-US`) first
- 📝 Realistic test simulation (e.g., Ohio: 40 questions, 20 signs + 20 rules,
  75% required in each section)
- 🔒 All progress stays on the user's device (IndexedDB) with export/import
  backup

## Who it's for · Dành cho ai

Immigrants and families across the US studying for the knowledge test in their
own language — including older adults with limited English and limited tech
comfort. If you can open a link, you can study.

## Development

No build step. The site is plain HTML/CSS/JS served from the repo root.

```bash
# Option 1: open index.html directly in a browser
# Option 2: serve locally (recommended, matches Pages behavior)
npx serve .
```

Data validation (once `scripts/validate/` lands):

```bash
node scripts/validate/validate-data.mjs
```

## Deployment

Every push to `main` deploys automatically to GitHub Pages via
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
(`configure-pages → upload-pages-artifact → deploy-pages`). The site must work
at a repo subpath, so **all asset URLs are relative** — never start a URL
with `/`.

## Licensing

- **Traffic sign artwork** (`traffic_signs/`): official MUTCD sign designs by
  the US Federal Highway Administration — US government works in the
  **public domain** (served originally via Wikimedia Commons).
- **App content** (questions, translations, explanations): free for personal,
  educational use. Question content is written from public state driver
  handbooks/digests; always confirm current rules with your state's licensing
  agency (e.g., Ohio BMV) before your test.
