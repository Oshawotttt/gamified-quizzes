# Architecture

A static site on GitHub Pages (https://oshawotttt.github.io/gamified-quizzes/). Plain HTML, CSS and JS ES modules: no build step, no external CDN, no server, no database, no login. Data is one bank file plus browser storage. The decision to use a JSON bank is in [ADR-0001](adr/0001-json-question-bank.md).

## Folders

- `bank/`: `bank.json` (the one question bank) and `bank/images/` (flat, all images).
- `js/`: browser ES modules, also importable from Node (`package.json` has `"type": "module"`, no dependencies).
- `scripts/`: Node scripts (`validate-bank.mjs`, `add-quiz.mjs`).
- `test/`: `node --test`.
- `examples/sample-import/`: a sample import file and its image.
- `index.html`, `css/app.css`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`: the page.

## Modules (`js/`)

- `bank.js`: validation of the bank and of single questions (shared by the page tooling, `import.js` and `scripts/validate-bank.mjs`).
- `import.js`: `planImport`, pure planning of an import (no file I/O); `scripts/add-quiz.mjs` does the file reading, image copying and writing. `add-quiz.mjs` takes the bank from `bank/` beside its own `scripts/` folder.
- `marking.js`: `markAnswer`, `questionPoints`.
- `progress.js`: progress store over a Storage-like object, `questionStatus`, `statusMap`, `bankStats`.
- `select.js`: `pickNext` and the two strategies.
- `session.js`: DOM-free state machine (`question` -> `feedback`) for one-question-at-a-time practice.
- `markdown.js`: tiny markdown renderer, images resolved against `bank/`.
- `app.js`: DOM wiring for `index.html`.

Data flow: `app.js` fetches `bank/bank.json`, creates a progress store over `localStorage` and a session (`session.js`) that asks `select.js` for the next question, marks with `marking.js`, records the attempt in the store, and renders text with `markdown.js`.

## Progress storage

- Progress lives only in this browser on this device (localStorage of the GitHub Pages origin) and loads automatically on every visit. Import is never part of normal use.
- Clearing site data deletes it. iOS Safari deletes storage of sites unused for 7 days unless the page is on the Home Screen.
- On load the page calls `navigator.storage.persist()` when available and links `manifest.webmanifest` (Add to Home Screen).
- Export/import is a rare backup. The stats screen shows "Last export: N days ago" (or "never"). Import asks for confirmation and replaces the device's progress. Export downloads `gamified-quizzes-progress-YYYY-MM-DD.json`.
- When the browser blocks localStorage (e.g. some private modes), the page falls back to in-memory storage for that visit: the quiz works but progress is not kept.
- The Stats screen (Export, Import, Reset) works even if `bank/bank.json` fails to load, so progress can still be backed up. A failed save on Submit shows an alert instead of doing nothing.
- "recent" (passed to `pickNext`) is the list of questions shown in this page visit only; it starts empty on each load.

## Out of scope

- No server, database or login.
- No syncing of progress between devices, other than manual export/import.
- No offline service worker.
