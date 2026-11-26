# Multiple question banks

**Status:** approved
**Base commit:** `0ea0d44c96a129d74d751c2f022abf977332af5f`
**Repo:** `d:\SMU\gamified\gamified-quizzes`
**Context file to update:** none named

**Commands**

- Full test suite: `node --test`
- Single test file: `node --test test/<name>.test.mjs`
- Typecheck: none
- Lint: none
- Bank validation: `node scripts/validate-bank.mjs`

## Dependencies and blockers

| Subtask | Blocked by |
|---|---|
| S1 | none |
| S2 | S1 |
| S3 | S1 |
| S4 | S1, S3 |

Run order: S1, S2, S3, S4.

External blockers: none.

## Branch plan

Starting branch: `main` (updated to `origin/main`)

| Order | Branch | Based on | Subtasks |
|---|---|---|---|
| 1 | `feat/multiple-banks` | `main` | S1, S2, S3, S4 |

`feat/written-question-feedback` is already merged into `origin/main` (PR #4), so the work starts from `origin/main` (user). Transient.

## Out of scope

- Moving questions between banks, renaming or deleting a bank with a script (edit the files by hand). Recorded by S2 (README).
- Images shared between banks: each bank holds its own copies. Recorded by S1 (CONTRACTS).
- Quiz filters or topic tags inside a bank. Recorded by S1 (CONTRACTS, already stated).
- Changing the `md-to-quiz-json` import-file format: it stays bank-agnostic. Recorded by S2 (CONTRACTS).
- Mixing questions from several banks in one session. Recorded by S4 (README).

## Interfaces

**I-index** `banks/index.json` (S1 defines the format and validator; S2 appends to it; S4 reads it):

```json
{ "version": 1, "banks": [ { "id": "cs203", "name": "CS203" } ] }
```

- `id`: `^[a-z0-9][a-z0-9-]*$`, unique in the list. Names the folder `banks/<id>/`, which holds `bank.json` and `images/`.
- `name`: required, non-empty string. The display name shown on the picker and in the page header. The name lives only here; `bank.json` has no `name` field.
- List order is the picker order.
- `validateIndex(json) => string[]` in `js/bank.js` (empty = valid).

**I-bank** `banks/<id>/bank.json`: format unchanged (`{ version: 1, nextId, questions }`).

- Image paths stay `images/<file>`, relative to `banks/<id>/`; files are in `banks/<id>/images/`.
- Ids are per bank: `q0001` can exist in two banks.

**I-progress** (S3 provides, S4 uses):

```js
createProgressStore(storage, bankId) => { /* same methods as today */ }
// key:         "gamified-quizzes.progress.v1.<bankId>"
// corrupt key: "gamified-quizzes.progress.corrupt.<bankId>"
// exportJson(now) text: { version: 1, bank: "<bankId>", lastExportAt, attempts }
```

## Subtasks

### S1: Bank folders and index

- **Goal:** banks live in `banks/<id>/` with `bank.json` and `images/`; `banks/index.json` lists each bank's id and display name; the existing bank is moved to `banks/cs203/`; validation covers the index and every bank.
- **Blocked by:** none
- **Branch:** `feat/multiple-banks`
- **Order on branch:** 1
- **Files:** `js/bank.js`, `scripts/validate-bank.mjs`, `bank/` moved to `banks/cs203/`, new `banks/index.json`, `test/bank.test.mjs`, `test/import.test.mjs` (temp repo copies `banks/`), `docs/CONTRACTS.md`, `docs/ARCHITECTURE.md`, new `docs/adr/0002-multiple-banks.md`, `docs/adr/0001-json-question-bank.md`, `README.md`. `scripts/add-quiz.mjs` gets only the minimal path change (bank at `banks/cs203/`) needed to keep its tests green until S2. `js/app.js` gets only the minimal path change (`BANK_URL`/`IMAGE_BASE` at `banks/cs203`) so the page keeps working until S4; `js/import.js` comment wording only.
- **Seams:**
  - `validateIndex(json)`: catches bad version, bad/duplicate ids, missing/empty names; misses whether folders exist.
  - `node scripts/validate-bank.mjs [bank file]`: catches a listed bank with no `bank.json`, an invalid index, invalid banks, missing images across all banks; misses page loading.
- **Decisions:**
  - Each bank has its own folder holding the bank and its images (user).
  - Each bank has a display name, stored only in the list in `banks/index.json`; `bank.json` has no `name` field (user).
  - The existing bank becomes id `cs203`, name `CS203` (user).
  - Bank file `version` stays 1 (user).
  - ADR-0001 says "The bank is one file, `bank/bank.json`". New ADR-0002 records "several banks, one folder each, listed with their display names in `banks/index.json`"; ADR-0001 keeps its JSON-vs-SQL decision and gets one line pointing to ADR-0002 (user).
  - Move with `git mv` so image history is kept (transient).
- **Acceptance criteria:**
  - [x] `validateIndex` returns `[]` for `{ version: 1, banks: [{ id: "a", name: "A" }, { id: "b-2", name: "B" }] }` and an error for each of: wrong version, `banks` not an array, id `"Bad Id"`, duplicate id, missing `name`, `name: ""` (`node --test test/bank.test.mjs`).
  - [x] `node scripts/validate-bank.mjs` with no argument exits 0 on the committed repo and prints one `OK` line per bank (`test/bank.test.mjs`).
  - [x] With no argument, it exits 1 when the index lists an id with no `banks/<id>/bank.json`, and when the index is invalid (temp repo tests in `test/bank.test.mjs`).
  - [x] With a bank file argument it validates that one file, as today (existing tests pass).
  - [x] `bank/` no longer exists; `banks/cs203/bank.json` holds all 88 existing questions with unchanged ids and content; `banks/cs203/images/` holds the 5 existing images; `banks/index.json` is `{ "version": 1, "banks": [ { "id": "cs203", "name": "CS203" } ] }` (`node scripts/validate-bank.mjs`, `git status`).
  - [x] `node --test` passes.
- **Doc deltas:**
  - `docs/CONTRACTS.md` "Bank file": replace "one bank only" with the I-index format (display name only in the index, not in `bank.json`) and the bank folder layout; ids unique per bank; "Images are not shared between banks; each bank holds its own copies."; keep "no quiz filters or topic tags".
  - `docs/CONTRACTS.md`: `validate-bank.mjs` with no argument validates the index and every bank in it.
  - `docs/ARCHITECTURE.md` "Folders": `banks/index.json`, `banks/<id>/bank.json`, `banks/<id>/images/`.
  - `docs/adr/0002-multiple-banks.md` (new) and the pointer line in ADR-0001.
  - `README.md`: "one question bank (`bank/bank.json`)" replaced by the banks folder description.
  - `docs/CONTRACTS.md`: `validate-bank.mjs` with no argument prints `OK <id>: N question(s), nextId N` per bank and checks every bank before exiting (so one run reports all broken banks); with a file argument the output stays `OK: ...`. Why: per-bank lines name which bank passed.
  - No doc: `js/app.js` points at `banks/cs203` as a stopgap until the picker replaces it; why: keeps the page loading between commits.

### S2: add-quiz targets an existing bank or creates a new one

- **Goal:** `add-quiz.mjs` adds an import file into a named existing bank, or creates a new bank (folder, index entry with display name) and adds into it.
- **Blocked by:** S1
- **Branch:** `feat/multiple-banks`
- **Order on branch:** 2
- **Files:** `scripts/add-quiz.mjs`, `test/import.test.mjs`, `.claude/skills/md-to-quiz-json/SKILL.md`, `docs/CONTRACTS.md`, `README.md`.
- **Seams:**
  - `node scripts/add-quiz.mjs <import file> --bank <id> [--dry-run]`: catches target bank, image copy location, index untouched; misses page.
  - `node scripts/add-quiz.mjs <import file> --new <id> --name "<display name>" [--dry-run]`: catches folder creation, index append with name, ids from `q0001`; misses page.
  - `planImport(bank, importJson, opts)`: contract unchanged; catches per-bank dedup and id assignment.
- **Decisions:**
  - "parse should have an argument to put into an existing bank json, or create a new one" (user).
  - Exactly one of `--bank <id>` or `--new <id> --name "<display name>"` is required; neither is an error (no default bank) (user).
  - `--new` with an id already in the index or an existing `banks/<id>/` folder: error, exit 1, nothing written.
  - `--new` without `--name`, `--name` with `--bank`, or both `--bank` and `--new`: usage error, exit 1.
  - `--bank` with an id not in the index: error, exit 1, lists the known ids.
  - `--new` id must match `^[a-z0-9][a-z0-9-]*$`.
  - New bank: `banks/<id>/bank.json` = `{ "version": 1, "nextId": 1, "questions": [...] }` (first id `q0001`); `banks/<id>/images/` created even with no images; `{ id, name }` appended to the end of `banks/index.json`.
  - `--new` writes nothing (no folder, no index change) on import errors or with `--dry-run`.
  - Duplicate-stem check is within the target bank only.
  - Image handling is unchanged apart from the folder: each `images/<file>` beside the import file is copied to `banks/<id>/images/<qid>-<file>` and its markdown path rewritten to `images/<qid>-<file>`.
  - The import file format does not change.
- **Acceptance criteria:**
  - [x] `--bank cs203 --dry-run` leaves that `bank.json` and `banks/index.json` byte-identical, exits 0, prints `added N` (`test/import.test.mjs`).
  - [x] `--bank <id>` appends questions, copies an image to `banks/<id>/images/<qid>-cat.png`, leaves other banks and the index unchanged; `validate-bank.mjs` exits 0 after (`test/import.test.mjs`).
  - [x] `--new demo --name "Demo Bank"` creates `banks/demo/bank.json` with first id `q0001`, creates `banks/demo/images/`, appends `{ "id": "demo", "name": "Demo Bank" }` to the index; `validate-bank.mjs` exits 0 after (`test/import.test.mjs`).
  - [x] `--new demo --name "Demo Bank" --dry-run`, and `--new` with an invalid import, create no folder and leave the index byte-identical (`test/import.test.mjs`).
  - [x] Exit 1 with nothing written for: neither flag; both flags; `--new` without `--name`; `--new` with an existing id; `--bank` with an unknown id; `--new` with id `Bad Id` (`test/import.test.mjs`).
  - [x] A stem that exists in bank A is added, not skipped, when importing into bank B (`test/import.test.mjs`).
  - [x] `node --test` passes.
- **Doc deltas:**
  - `docs/CONTRACTS.md` "Import file": new usage line, `--bank`/`--new`/`--name` rules and errors, new bank shape, image copy target `banks/<id>/images/<qid>-<file>`, duplicate check per bank, import file stays bank-agnostic.
  - `README.md` "Add a quiz": commands with `--bank` and `--new`; renaming, deleting or moving questions between banks is done by hand.
  - `.claude/skills/md-to-quiz-json/SKILL.md`: dry-run and add commands include `--bank <id>`.
  - `docs/CONTRACTS.md` "Import file": also exit 1 for an unknown option, a flag without a value, a flag given twice, or `--new` with an empty `--name`. Why: a typo must not write to the wrong place.
  - `docs/CONTRACTS.md` "Import file": the summary line names the bank (`added N (qA-qB) to <id>, skipped M duplicate(s)`). Why: shows which bank was written.
  - `docs/CONTRACTS.md` "Import file": with `--new`, the index is rewritten as 2-space indented JSON when the bank is appended. Why: same writer as `bank.json`; the content is unchanged apart from the new entry.
  - `docs/CONTRACTS.md` "Import file": add-quiz checks `banks/index.json` with `validateIndex` first and exits 1 with nothing written if it is invalid; it creates `banks/<id>/images/` when missing for `--bank` too. Why: git drops the empty `images/` of a bank created without images.
  - `.claude/skills/md-to-quiz-json/SKILL.md` updated in this subtask (not left to the docs pass) because the skill runs the command and the old one now fails; it also tells the agent to ask which bank and to use `--new ... --dry-run` for a new bank.

### S3: Progress per bank

- **Goal:** each bank has its own progress store; existing progress moves to `cs203`; exports name their bank.
- **Blocked by:** S1
- **Branch:** `feat/multiple-banks`
- **Order on branch:** 3
- **Files:** `js/progress.js`, `test/progress.test.mjs`, `test/session.test.mjs` (passes a bank id), `js/app.js` (passes `"cs203"` until S4), `docs/CONTRACTS.md`, `docs/ARCHITECTURE.md`.
- **Seams:**
  - `createProgressStore(storage, bankId)` with an in-memory storage: catches per-bank keys, isolation, migration, export/import bank check; misses real localStorage quirks.
- **Decisions:**
  - Progress is kept per bank under its own key (user).
  - The legacy key `gamified-quizzes.progress.v1` is moved (copied, then removed) to `gamified-quizzes.progress.v1.cs203` the first time the `cs203` store is created and its own key is absent; other banks never read the legacy key (user).
  - An export carries `bank: "<bankId>"`. Importing an export of a different bank throws (message names both ids) and leaves the store unchanged. An export with no `bank` field is accepted into whichever bank is open (user).
- **Acceptance criteria:**
  - [x] Two stores on one storage with ids `a` and `b`: attempts recorded in `a` are not in `b.all()` (`node --test test/progress.test.mjs`).
  - [x] Legacy key present, `cs203` key absent: the `cs203` store returns the legacy attempts and the legacy key is removed; a store for another id starts empty (`test/progress.test.mjs`).
  - [x] Export of bank `a` has `bank: "a"`; importing it into `b` throws and leaves `b` unchanged; an export with no `bank` field imports into `b` (`test/progress.test.mjs`).
  - [x] Corrupt stored JSON for bank `a` is kept under `gamified-quizzes.progress.corrupt.a` (`test/progress.test.mjs`).
  - [x] `node --test` passes.
- **Doc deltas:**
  - `docs/CONTRACTS.md` "Progress store": I-progress keys, export `bank` field, import refusal rule, legacy migration to `cs203`.
  - `docs/ARCHITECTURE.md` "Progress storage": progress is per bank; export file name includes the bank id.
  - `docs/CONTRACTS.md` "Progress store": `PROGRESS_KEY`/`CORRUPT_KEY` constants replaced by `progressKey(bankId)`, `corruptKey(bankId)` and `LEGACY_PROGRESS_KEY`; `createProgressStore` throws without a non-empty bank id. Why: keys depend on the bank; a missing id would silently share one key.
  - `docs/CONTRACTS.md` "Progress store": the stored value keeps the old shape (no `bank` field); only `exportJson` text adds `bank`. Why: the key already names the bank.
  - `docs/CONTRACTS.md` "Progress store": an import whose `bank` field is present but not equal to the open bank id (any value, including non-strings) is refused. Why: the spec rule, applied without type special-cases.
  - No doc: legacy migration copies the raw text even if it is corrupt, so it then lands in `gamified-quizzes.progress.corrupt.cs203`; the old `gamified-quizzes.progress.corrupt` key is left alone. Why: nothing is lost either way.

### S4: Bank picker screen

- **Goal:** the page opens on a screen listing the banks by display name; choosing one starts its quiz; the user can go back to the picker.
- **Blocked by:** S1, S3
- **Branch:** `feat/multiple-banks`
- **Order on branch:** 4
- **Files:** `js/app.js`, `index.html`, `css/app.css`, new `js/banks.js` (DOM-free), new `test/banks.test.mjs`, `manifest.webmanifest` (description text only), `README.md`, `docs/ARCHITECTURE.md`.
- **Seams:**
  - `loadIndex(fetchJson) => Promise<{ banks: [{ id, name }], error: string | null }>` in `js/banks.js`, with a fake `fetchJson(url)`: catches index order, names from the index, a failed or invalid index; misses rendering.
  - `bankFromUrl(search, banks) => { id, name } | null`: catches `?bank=` parsing and unknown ids; misses history handling.
- **Decisions:**
  - "should have a loading screen to choose which bank" (user).
  - The picker shows each bank's name from the list in `banks/index.json` (user). The picker fetches only the index, not the banks.
  - The chosen bank goes in the URL as `?bank=<id>`; a load with a listed `?bank=` skips the picker (reload and bookmarks keep the bank); a load without it, or with an unlisted id, shows the picker (user).
  - The home link is the picker: `manifest.webmanifest` `start_url` stays `./` (no `?bank=`), so the Home Screen icon opens the picker (user).
  - After choosing: the header shows the bank's name; a "Banks" header button returns to the picker and removes `?bank=` from the URL; the session, progress store (S3) and image base `banks/<id>` belong to the chosen bank; switching banks starts a fresh session (`recent` empty).
  - Before a bank is chosen the Stats button is hidden.
  - Export file name: `gamified-quizzes-<bankId>-progress-YYYY-MM-DD.json`.
  - Index fails to load or is invalid: the picker shows an error message. The chosen bank fails to load: error message plus the Banks button.
  - One session uses one bank only.
- **Acceptance criteria:**
  - [ ] `loadIndex` returns `{ id, name }` entries in index order and `error: null` (`node --test test/banks.test.mjs`).
  - [ ] `loadIndex` returns no banks and an error when the fetch fails and when the index fails `validateIndex` (`test/banks.test.mjs`).
  - [ ] `bankFromUrl("?bank=cs203", banks)` returns the `cs203` entry; `""`, `"?bank="` and `"?bank=nope"` return null (`test/banks.test.mjs`).
  - [ ] `manifest.webmanifest` `start_url` is `./` (`test/banks.test.mjs` reads the file).
  - [ ] `node --test` passes.
- **Doc deltas:**
  - `README.md` "Play": picker screen listing banks by name, Banks button, one bank per session, `?bank=<id>` keeps the bank on reload/bookmark, Home Screen icon opens the picker.
  - `docs/ARCHITECTURE.md` "Modules": `banks.js`; data flow starts at `banks/index.json`; markdown image base is `banks/<id>`.

## Human checks

- [ ] S4: serve the repo locally (e.g. `npx serve .`) and open it. Expected: the picker lists every bank by name in index order.
- [ ] S4: pick a bank, answer a question, press Banks, pick another bank. Expected: header shows each bank's name; counts and progress are separate per bank; images load in both.
- [ ] S4: reload while in a bank. Expected: same bank, no picker. Open `./` with no query. Expected: picker.
- [ ] S4: on a phone, Add to Home Screen from inside a bank, then open the icon. Expected: picker.
- [ ] S3/S4: on a browser that has progress from before this change, open CS203. Expected: the old progress is there.
- [ ] S3/S4: Stats, Export in bank A, then Import that file while in bank B. Expected: import refused with a message naming both banks.
- [ ] S4: phone width. Expected: picker readable and tappable, no horizontal scroll.
