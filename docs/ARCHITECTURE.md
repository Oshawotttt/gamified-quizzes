# Architecture

A static site on GitHub Pages (https://oshawotttt.github.io/gamified-quizzes/). Plain HTML, CSS and JS ES modules: no build step, no external CDN, no server, no database, no login. Data is several bank files plus browser storage. The decision to use a JSON bank is in [ADR-0001](adr/0001-json-question-bank.md); the several-banks layout is in [ADR-0002](adr/0002-multiple-banks.md).

## Folders

- `banks/`: `index.json` (the bank list: id and display name, in picker order), `banks/<id>/bank.json` (one question bank) and `banks/<id>/images/` (flat, that bank's images only).
- `js/`: browser ES modules, also importable from Node (`package.json` has `"type": "module"`, no dependencies).
- `scripts/`: Node scripts (`validate-bank.mjs`, `add-quiz.mjs`).
- `test/`: `node --test`.
- `examples/sample-import/`: a sample import file and its image.
- `index.html`, `css/app.css`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`: the page.

## Modules (`js/`)

- `bank.js`: validation of the bank and of single questions (shared by the page tooling, `import.js` and `scripts/validate-bank.mjs`).
- `import.js`: `planImport`, pure planning of an import (no file I/O); `scripts/add-quiz.mjs` does the file reading, image copying and writing. `add-quiz.mjs` takes `banks/` beside its own `scripts/` folder.
- `banks.js`: DOM-free bank list for the picker: `INDEX_URL`, `bankDir(id)` (the one place `app.js` builds bank and image paths from), `loadIndex` (never rejects), `bankFromUrl`.
- `marking.js`: `markAnswer`, `questionPoints`.
- `progress.js`: progress store over a Storage-like object, `questionStatus`, `statusMap`, `bankStats`.
- `select.js`: `pickNext` and the two strategies.
- `session.js`: DOM-free state machine (`question` -> `feedback`) for one-question-at-a-time practice.
- `markdown.js`: tiny markdown renderer, images resolved against `banks/<id>`.
- `app.js`: DOM wiring for `index.html`: the picker screen, the header Banks button and history handling.

Data flow: `app.js` fetches `banks/index.json` (via `banks.js`) and shows the picker, or goes straight to a bank named by `?bank=<id>`. For the chosen bank it fetches `banks/<id>/bank.json`, creates a progress store for that bank over `localStorage` and a session (`session.js`) that asks `select.js` for the next question, marks with `marking.js`, records the attempt in the store, and renders text with `markdown.js`.

## Progress storage

- Progress is per bank (one localStorage key per bank id; see CONTRACTS "Progress store"). One session uses one bank only; switching banks starts a fresh session.
- Progress lives only in this browser on this device (localStorage of the GitHub Pages origin) and loads automatically on every visit. Import is never part of normal use.
- Clearing site data deletes it. iOS Safari deletes storage of sites unused for 7 days unless the page is on the Home Screen.
- On load the page calls `navigator.storage.persist()` when available and links `manifest.webmanifest` (Add to Home Screen).
- Export/import is a rare backup. The stats screen shows "Last export: N days ago" (or "never"). Import asks for confirmation and replaces the device's progress. Export downloads `gamified-quizzes-<bankId>-progress-YYYY-MM-DD.json`.
- When the browser blocks localStorage (e.g. some private modes), the page falls back to in-memory storage for that visit: the quiz works but progress is not kept.
- The Stats screen (Export, Import, Reset) works even if the chosen bank's `bank.json` fails to load, so progress can still be backed up. The Stats button is hidden before a bank is chosen. A failed save on Submit (or on a written self-mark button) shows an alert instead of doing nothing.
- "recent" (passed to `pickNext`) is the list of questions shown in this page visit only; it starts empty on each load.

## Out of scope

- No server, database or login.
- No syncing of progress between devices, other than manual export/import.
- No offline service worker.
- No mixing of questions from several banks in one session.
- No moving of questions between banks, and no script to rename or delete a bank (edit the files by hand).
