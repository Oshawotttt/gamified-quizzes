# Question bank and one-at-a-time phone quiz

**Status:** approved
**Base commit:** `b90b95d29ed7f2bc10263ab964e8a9455cf8c1a2`
**Repo:** `d:\SMU\gamified\gamified-quizzes` (GitHub Pages: https://oshawotttt.github.io/gamified-quizzes/)
**Context file to update:** none named

**Commands:**
- Full test suite: `node --test`
- Single test file: `node --test test/<name>.test.mjs`
- Bank validation: `node scripts/validate-bank.mjs`
- Add a quiz to the bank: `node scripts/add-quiz.mjs <import file> [--dry-run]`
- Typecheck: none
- Lint: none

Repo docs at planning time: `README.md` only. No `CLAUDE.md`, `docs/`, ADRs or glossary. Question formats and the marking scheme come from the sibling workspace `d:\SMU\quizzer` (`elearn-html-quiz/docs/specs/2026-11-23-build-quiz-html-skill.md` S1 format decision, `example/Finals Practice Quiz 2 (Short) Attempt.md` marker instructions, `CLAUDE.md` file-name rule).

## Dependencies and blockers

| Subtask | Blocked by |
|---|---|
| S1 | none |
| S2 | S1 |
| S3 | S1 |
| S4 | S1, S3 |
| S5 | S1, S3, S4 |
| S6 | S1, S2, S3, S4, S5 |

Run order: S1, S2, S3, S4, S5, S6.

External blockers:
- Working tree on `main` has a staged deletion of `index.html` (the old test quiz). The user must commit or unstage it before the run (transient).

## Branch plan

Starting branch: `main`

| Order | Branch | Based on | Subtasks |
|---|---|---|---|
| 1 | `feat/question-bank-quiz` | `main` | S1, S2, S3, S4, S5, S6 |

## Out of scope

- Generating questions or answers (user). Recorded by S1 in `README.md`.
- Changing the quizzer skills so the generated question bank md and the import file carry question ids and per-option explanations. That is work in `d:\SMU\quizzer`; this repo only defines the import-file contract (I2) they target. Recorded by S2 in `README.md`.
- Server, database or login. Everything is static files on GitHub Pages plus browser storage. Recorded by S1 in `docs/ARCHITECTURE.md`.
- Syncing progress between devices, other than manual export/import. Recorded by S4 in `docs/ARCHITECTURE.md`.
- Several banks, quiz filters or topic tags (user: "just one question/answer bank"). Recorded by S1 in `docs/CONTRACTS.md`.
- Offline service worker. Recorded by S6 in `docs/ARCHITECTURE.md`.

## Interfaces

All modules are browser ES modules under `js/`, importable from Node (`package.json` has `"type": "module"`). Each is recorded in `docs/CONTRACTS.md` by the subtask that introduces it.

### I1 Bank file (S1)

One file, `bank/bank.json`, fetched by the page:
```json
{ "version": 1, "nextId": 18, "questions": [ /* Question */ ] }
```

Question:
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string, `^q[0-9]{4,}$` | yes | Assigned by `add-quiz.mjs` from `nextId`: `q0001`, `q0002`, ... Unique. Never reused or renamed: progress is keyed on it. |
| `type` | `"single"` \| `"multi"` \| `"written"` | yes | True/false is `single` with options `a. True`, `b. False` (quizzer format). Short answer is `written`. |
| `points` | number > 0 | no | Default 1. |
| `stem` | string (markdown) | yes | |
| `options` | `[{ "key": "a", "text": "<markdown>", "explanation": "<markdown>" }]` | `single`/`multi` only | 2-8 options, keys `a`, `b`, ... in order, no gaps. `explanation` is required on every option: why this option is correct or wrong, without referring to other options by letter. Forbidden on `written`. |
| `answer` | string[] of option keys | `single`/`multi` only | `single`: exactly 1 key. `multi`: 1 or more keys. Every key exists in `options`. Forbidden on `written`. |
| `shuffle` | boolean | no, `single`/`multi` only | Default `true`. `false` keeps source order (for True/False, or options such as "All of the above"). |
| `modelAnswer` | string (markdown) | `written` only | |
| `wordLimit` | integer > 0 | no, `written` only | Default 250. Shown as a guide, not enforced. |
| `explanation` | string (markdown) | no | Overall explanation, shown after Submit below the options. Must not refer to options by letter (letters change when shuffled). |
| `source` | string | no | e.g. `from course: Week 02 - Interrupts.pptx slides 33, 37`, `own answer`, `given`. Shown after Submit. |
| `quiz` | string | yes | Title of the import file the question came from. Provenance only. |
| `addedAt` | ISO-8601 date string | yes | Set by `add-quiz.mjs`. |

`nextId` is greater than every numeric id in `questions`.

Markdown subset (all markdown fields): paragraphs, bold, italic, inline code, fenced code blocks, ordered/unordered lists, tables, images `![alt](images/<file>)`. In `bank.json`, image paths are relative to `bank/`, and the files are in `bank/images/`. Extensions: `.png .jpg .jpeg .gif .webp .svg`. File names contain no spaces (quizzer `CLAUDE.md` rule). Images may appear in stems, options, explanations and model answers.

### I2 Import file (S2)

The file Claude writes for each generated or formatted quiz. Anywhere on disk; images beside it in an `images/` folder.
```json
{ "version": 1, "title": "CS205 Finals Practice Quiz 2 (Short)", "questions": [ /* Question without id, quiz, addedAt */ ] }
```
Every option already has its `explanation`, written at generation time (the generated question bank md has it too). An `id` in an import question is an error. Image paths are `images/<file>`, relative to the import file's folder.

```
node scripts/add-quiz.mjs <import file> [--dry-run]
```
- Validates the import file against I1 (minus `id`, `quiz`, `addedAt`). Any error: prints every error with question index and field, exits 1, writes nothing.
- Skips questions whose stem matches an existing stem (whitespace collapsed, case ignored) and lists them.
- Assigns ids from `nextId`, sets `quiz` = `title` and `addedAt` = today, copies each image to `bank/images/<id>-<file name>` and rewrites its path, appends to `bank/bank.json`, bumps `nextId`.
- Runs the bank validation on the result before writing; writes `bank.json` only if it passes.
- `--dry-run`: validates and reports, writes nothing.
- Prints: added count, skipped duplicates, new id range.
- The import file is not deleted or moved.

### I3 Marking (S3)

```js
// js/marking.js
markAnswer(question, response) => MarkResult
// response: { selected: string[] } for single/multi; { text: string } for written
// MarkResult (single/multi): { score: number, max: number, allOrNothing: number,
//   outcome: "right" | "partial" | "wrong",
//   options: { [key]: "correct-ticked" | "correct-missed" | "wrong-ticked" | "wrong-unticked" } }
// MarkResult (written): { score: null, max: number, outcome: "shown" }
```

### I4 Progress store (S4)

localStorage key `gamified-quizzes.progress.v1` (prefixed because every `oshawotttt.github.io/*` site shares one origin and one localStorage):
```json
{ "version": 1, "lastExportAt": null, "attempts": [ Attempt ] }
```
Attempt: `{ "qid": string, "at": ISO-8601 string, "score": number | null, "max": number, "outcome": "right"|"partial"|"wrong"|"shown", "guessed": boolean, "response": object }`.

```js
// js/progress.js
createProgressStore(storage /* Storage-like: getItem/setItem/removeItem */) => {
  all(): Attempt[],
  record(attempt): number,            // returns index
  setGuessed(index, guessed): void,
  exportJson(now): string,            // also sets lastExportAt = now
  lastExportAt(): string | null,
  importJson(text): void,             // throws Error on invalid shape; leaves store unchanged
  reset(): void,
}
questionStatus(qid, attempts) => "unseen" | "wrong" | "partial" | "guessed" | "right" | "shown"
// from the latest attempt for qid: none = unseen; guessed && outcome != "wrong" = guessed; else outcome
bankStats(questionIds, attempts) => { total, unseen, wrong, partial, guessed, right, shown }
```
Attempts for qids not in the bank are kept but ignored by stats and selection.

### I5 Selection (S5)

```js
// js/select.js
export const LARGE_BANK = 100;
export const WEIGHTS = { unseen: 3, wrong: 6, partial: 4, guessed: 4, right: 1, shown: 1 };
export const BUCKETS = { review: 0.5, unseen: 0.35, known: 0.15 };
// WEIGHTS: relative chance of one question being picked, by its status.
//   A question with weight 6 is 6x as likely as one with weight 1.
//   Used by pickWeighted for every question, and by pickBuckets inside the review bucket.
// BUCKETS: share of picks that come from each group, in pickBuckets only.
//   0.5 = half of all questions shown come from review (wrong, partial, guessed),
//   whatever the size of each group.
pickNext(questionIds, attempts, { recent: string[], rng: () => number }) => string | null
// questionIds.length < LARGE_BANK  -> pickWeighted
// questionIds.length >= LARGE_BANK -> pickBuckets
// null only when questionIds is empty
pickWeighted(questionIds, attempts, { recent, rng })
// weighted random per question by status (WEIGHTS); excludes the last 3 of recent
pickBuckets(questionIds, attempts, { recent, rng })
// excludes the last 10 of recent; buckets: review = wrong|partial|guessed, unseen, known = right|shown
// picks a bucket by BUCKETS, re-normalised over non-empty buckets; then
//   review: weighted random by WEIGHTS; unseen: uniform random; known: the one with the oldest latest attempt
```
If exclusion empties the candidate set, the exclusion is dropped for that pick.

## Subtasks

### S1 — Bank contract, validator, test harness

- **Goal:** The bank format (I1) is documented and enforced by `node scripts/validate-bank.mjs`. `bank/bank.json` exists (empty: `nextId` 1, no questions). `node --test` runs.
- **Blocked by:** none
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 1
- **Files:** `package.json` (new, `"type": "module"`, no dependencies), `js/bank.js` (new: `validateQuestion(q, ctx)`, `validateBank(json, { imageExists })`, each returning `string[]` errors), `scripts/validate-bank.mjs` (new), `bank/bank.json` (new), `bank/images/.gitkeep`, `test/bank.test.mjs` (new), `docs/CONTRACTS.md` (new), `docs/ARCHITECTURE.md` (new), `docs/adr/0001-json-question-bank.md` (new), `README.md`.
- **Seams:**
  - `validateBank(json, { imageExists })`: catches every I1 rule; misses whether markdown renders well.
  - `node scripts/validate-bank.mjs`: catches file reading, real image lookup, exit code; misses UI.
- **Decisions:**
  - Store the bank as one JSON file in the repo, markdown inside string fields, images as files in `bank/images/` (user asked "md, json, sql db?", then "still dk which to use"). Reasons: GitHub Pages serves static files only, so no SQL server; SQLite in the browser needs a ~1 MB wasm library and a binary file in git that cannot be diffed; 500 questions of JSON is well under 1 MB and loads with one `fetch`; markdown strings keep the quizzer formatting. Doc delta: ADR `docs/adr/0001-json-question-bank.md`.
  - "i'm thinking just one question/answer bank" (user): one file `bank/bank.json`, no quiz filters or topic tags. Doc delta: `docs/CONTRACTS.md`.
  - "need to have support for the type of questions and answers mentioned in ../../quizzer" (user): single choice, multi-select, true/false, short answer, written, mapped per the I1 `type` row. Doc delta: `docs/CONTRACTS.md`.
  - "should also support photos" (user): markdown images per I1. Doc delta: `docs/CONTRACTS.md`.
  - "generation is not in scope" (user). Doc delta: `README.md`.
  - "have it randomise options also" (user): options are shuffled per showing unless `shuffle: false`. Doc delta: `docs/CONTRACTS.md`.
  - "upon marking should have explaination for each option (should be done on generation with answers and the internal question id ...)" and "means the question bank md file should have it alr. and should be present in the json that is being appeneded" (user): `options[].explanation` is required and comes from generation, not from this repo. Doc delta: `docs/CONTRACTS.md`.
  - "add quiz assigns" (user): `add-quiz.mjs` assigns the question `id` (`q0001`, ...) when appending. Doc delta: `docs/CONTRACTS.md`.
  - Question `id` is permanent and never reused; progress is keyed on it. Doc delta: `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [x] `node scripts/validate-bank.mjs` exits 0 on the committed bank.
  - [x] `test/bank.test.mjs`: `validateBank` returns no errors for a bank with one question of each type, including one with an image in a stem and one in an option.
  - [x] `test/bank.test.mjs`: `validateBank` returns an error for each of: missing `id`, bad `id` pattern, duplicate `id`, `nextId` not greater than every id, unknown `type`, `options` on `written`, `answer` key not in `options`, `single` with 2 answer keys, `multi` with 0 answer keys, `written` without `modelAnswer`, option keys with a gap, option without `explanation`, `shuffle` on `written`, image path whose file is missing, image file name with a space, missing `quiz`, missing `addedAt`.
  - [x] `node --test` exits 0.
- **Doc deltas:** `docs/CONTRACTS.md` (new): I1 in full. `docs/ARCHITECTURE.md` (new): static site on GitHub Pages, no build step, no server or DB, folders `bank/`, `js/`, `scripts/`, `test/`. `docs/adr/0001-json-question-bank.md` (new). `README.md`: generation out of scope; `node scripts/validate-bank.mjs`.
  - `docs/CONTRACTS.md`: unknown question and option fields are errors, so a typo such as `explaination` fails validation instead of being silently ignored.
  - `docs/CONTRACTS.md`: image paths must be exactly `images/<file>` (no sub-folders, no `..`); all images live flat in `bank/images/`, so the page resolves them with one base path.
  - `docs/CONTRACTS.md`: `addedAt` accepts `YYYY-MM-DD` or a full ISO-8601 date-time; `add-quiz.mjs` writes the date form.
  - `docs/CONTRACTS.md`: `answer` with duplicate keys is an error; empty-string `stem`, option `text`, option `explanation`, `quiz` and `modelAnswer` count as missing.
  - `docs/CONTRACTS.md`: the rule that explanations must not refer to options by letter is not checked by the validator (it cannot tell a letter reference from ordinary text); it is a rule for the generator.
  - `README.md`: `node scripts/validate-bank.mjs [bank file]` takes an optional bank path (default `bank/bank.json`), so tests and the import script can validate a temp copy.
  - No doc: `validateQuestion(q, { path, imageExists, mode })` takes `mode: "bank" | "import"` so S2 reuses it for import questions (where `id`, `quiz`, `addedAt` are forbidden); recorded in the code's doc comment.

### S2 — Import script

- **Goal:** `node scripts/add-quiz.mjs <import file>` validates an import file (I2) and appends its questions to `bank/bank.json`. The bank holds a sample quiz added this way.
- **Blocked by:** S1
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 2
- **Files:** `js/import.js` (new: `planImport(bank, importJson, { imageExists, today })` returning `{ errors, added, skipped, newBank, imageCopies }`, no file I/O), `scripts/add-quiz.mjs` (new: file I/O around `planImport`), `examples/sample-import/sample-import.json` and `examples/sample-import/images/<one image>` (new: Q1, Q2, Q3 and Q16 of `d:\SMU\quizzer\example\Finals Practice Quiz 2 (Short) - Answers.md` with a per-option explanation written for every option from that file's answer text, one true/false question with `shuffle: false`, one question with the image), `bank/bank.json`, `bank/images/`, `test/import.test.mjs` (new), `docs/CONTRACTS.md`, `README.md`.
- **Seams:**
  - `planImport(...)`: catches validation, id assignment, dedupe, image path rewrite, `nextId`; misses real file copy.
  - `node scripts/add-quiz.mjs` on a temp copy of the repo bank: catches files written, exit codes, `--dry-run`; misses nothing important beyond that.
- **Decisions:**
  - "claude writes each quiz generated into one json file. then code to validate + appened to json" (user). Doc delta: `docs/CONTRACTS.md` (I2), `README.md` (how to add a quiz).
  - "add quiz assigns" (user): ids `q0001`, `q0002`, ... from the `nextId` counter in `bank/bank.json`, never reused. A question whose stem matches an existing stem (whitespace collapsed, case ignored) is skipped and reported. Images are copied to `bank/images/<id>-<file name>` (user: "okay to 2-4"). Doc delta: `docs/CONTRACTS.md`.
  - The import file is not deleted or moved by the script. Doc delta: `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [x] `test/import.test.mjs`: importing 3 valid questions into a bank with `nextId` 5 gives ids `q0005`-`q0007`, `nextId` 8, `quiz` = import title, `addedAt` = the `today` passed in.
  - [x] `test/import.test.mjs`: one invalid question (including one that carries an `id`, and one option without `explanation`) gives errors naming its index and field, and `newBank` is null.
  - [x] `test/import.test.mjs`: a question whose stem equals an existing stem except for case and whitespace is in `skipped`, not `added`.
  - [x] `test/import.test.mjs`: `![p](images/cat.png)` in an option becomes `![p](images/q0005-cat.png)` and `imageCopies` lists the source and target.
  - [x] `test/import.test.mjs`: running the script with `--dry-run` against a temp folder leaves `bank.json` byte-identical and exits 0; running it on an invalid file exits 1.
  - [x] `node scripts/validate-bank.mjs` exits 0 after the sample import is committed; `bank/bank.json` holds 6 questions.
  - [x] `node --test` exits 0.
- **Doc deltas:** `docs/CONTRACTS.md`: I2. `README.md`: how to add a quiz (write the import file, `node scripts/add-quiz.mjs <file> --dry-run`, then without `--dry-run`, commit `bank/`); quizzer skill changes are out of scope.
  - `docs/CONTRACTS.md`: an import file needs `version: 1`, a non-empty `title` and at least one question; an empty `questions` list is an error.
  - `docs/CONTRACTS.md`: duplicate stems are also detected inside one import file (the second copy is skipped), and a bank stem is compared with its `images/<id>-` prefix removed, so re-importing a question with an image is still skipped.
  - `docs/CONTRACTS.md`: `addedAt` is the local date (`YYYY-MM-DD`) on the machine running the script.
  - `docs/CONTRACTS.md`: errors from the bank check after planning are prefixed `bank after import:`; with no new questions (all duplicates) the script exits 0 and writes nothing.
  - `docs/CONTRACTS.md`: `bank.json` is written as 2-space indented JSON with a trailing newline, so diffs stay readable.
  - `README.md`: the sample import lives in `examples/sample-import/` and was added as `q0001`-`q0006`; its image is an SVG (`five-state-model.svg`, a five-state process diagram drawn for the sample), and its true/false and image questions were written for the sample (sources given in the file).
  - No doc: `add-quiz.mjs` takes the bank from `bank/` beside its own `scripts/` folder, so tests copy `js/`, `scripts/` and `bank/` to a temp folder instead of passing a bank path.

### S3 — Marking

- **Goal:** `markAnswer` (I3) marks single and multi questions with the per-option scheme, and returns `shown` for written questions.
- **Blocked by:** S1
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 3
- **Files:** `js/marking.js` (new), `test/marking.test.mjs` (new), `docs/CONTRACTS.md`.
- **Seams:**
  - `markAnswer(question, response)`: catches scores, outcome, per-option states, floor at 0; misses display.
- **Decisions:**
  - "a correct choice is either choose the correct option or not choose a wrong option. so u get + 1/num_options for correct choice and - 1/num_options for wrong choice" (user). Each option is one choice. Score = `max(0, (correctChoices - wrongChoices) / numOptions * points)`. The same formula applies to `single` and `multi`; for `single` it gives full points for the right key and 0 for any wrong key. Doc delta: `docs/CONTRACTS.md`.
  - Floor 0 (quizzer `Attempt.md`: "floor 0"). Doc delta: `docs/CONTRACTS.md`.
  - `allOrNothing` = `max` only when the selected set equals the answer set, else 0. Kept in the result for reference; `score` is what counts. Doc delta: `docs/CONTRACTS.md`.
  - `outcome`: `right` when `score == max`, `wrong` when `score == 0`, else `partial`. Doc delta: `docs/CONTRACTS.md`.
  - Written: "just flash the model answer if cannot" (user): no score, outcome `shown`; status `shown` counts like `right` in selection (user: "okay to 2-4"). Doc delta: `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [x] `test/marking.test.mjs`, multi, options `a`-`e`, answer `b,c,e`, points 2 (within 1e-9): `b,c,e` gives 2 `right`; `b,c` gives 1.2 `partial`; `b,c,a` gives 0.4 `partial`; `a,b,c,d,e` gives 0.4 `partial` with `allOrNothing` 0; `a,d` gives 0 `wrong`.
  - [x] `test/marking.test.mjs`, single, 4 options, points 2: right key gives 2 `right`; any wrong key gives 0 `wrong`.
  - [x] `test/marking.test.mjs`: per-option states for `b,c,a` on answer `b,c,e` are a `wrong-ticked`, b `correct-ticked`, c `correct-ticked`, d `wrong-unticked`, e `correct-missed`.
  - [x] `test/marking.test.mjs`: written gives `{ score: null, max: points, outcome: "shown" }`.
  - [x] `node --test` exits 0.
- **Doc deltas:** `docs/CONTRACTS.md`: I3 and the marking rules above.
  - `docs/CONTRACTS.md`: `outcome` compares `score` with `max` and 0 within 1e-9, so floating-point results such as `0.4 * 5` still count as `right`.
  - `docs/CONTRACTS.md`: selected keys that are not option keys are ignored by the score (they are neither a correct nor a wrong choice) but make `allOrNothing` 0.
  - No doc: `questionPoints(question)` (default 1) is exported from `js/marking.js` so the page and the session use one default.

### S4 — Progress store

- **Goal:** Attempts persist on the phone in localStorage (I4), with export, import and reset as backup tools, and per-question status and bank counts derived from them.
- **Blocked by:** S1
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 4
- **Files:** `js/progress.js` (new), `test/progress.test.mjs` (new), `docs/CONTRACTS.md`, `docs/ARCHITECTURE.md`.
- **Seams:**
  - `createProgressStore(storage)` with an in-memory Storage fake: catches persistence round trip, guessed patching, import validation, reset, `lastExportAt`; misses real browser eviction.
  - `questionStatus`, `bankStats`: catches status rules and counts; misses UI.
- **Decisions:**
  - Progress is stored in the browser's localStorage for the GitHub Pages origin, per browser and per device (user: "these info is stored local on phone right?"). Doc delta: `docs/ARCHITECTURE.md`.
  - "i get for long term need. but it's v troublesome to import everytime i want to use it" (user): progress loads automatically on every visit; import is never part of normal use; the page calls `navigator.storage.persist()`, ships `manifest.webmanifest` for Add to Home Screen, and shows "Last export: N days ago" (user: "okay to 2-4"). Doc delta: `docs/ARCHITECTURE.md`.
  - The storage key has the prefix `gamified-quizzes.` because all `oshawotttt.github.io` project sites share one origin. Doc delta: `docs/CONTRACTS.md`.
  - Attempts are an append-only history; status uses the latest attempt per question. Doc delta: `docs/CONTRACTS.md`.
  - The attempt is recorded at Submit with `guessed: false`; pressing "Next (I guessed)" sets it to `true`. Doc delta: `docs/CONTRACTS.md`.
  - Corrupt or wrong-version stored JSON: the store starts empty and keeps the raw text under `gamified-quizzes.progress.corrupt`. Doc delta: `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [x] `test/progress.test.mjs`: `record`, then a new store on the same storage returns the same attempts.
  - [x] `test/progress.test.mjs`: `setGuessed(i, true)` persists.
  - [x] `test/progress.test.mjs`: `importJson` with invalid JSON or a wrong shape throws and leaves attempts unchanged; `exportJson` text round-trips through `importJson`; `exportJson(now)` sets `lastExportAt()` to `now`.
  - [x] `test/progress.test.mjs`: corrupt stored text gives an empty store and the raw text under the corrupt key.
  - [x] `test/progress.test.mjs`: `questionStatus` returns each of `unseen`, `wrong`, `partial`, `guessed`, `right`, `shown` per I4, using only the latest attempt; a guessed wrong attempt is `wrong`.
  - [x] `test/progress.test.mjs`: `bankStats` counts match, and attempts for unknown qids are ignored.
  - [x] `node --test` exits 0.
- **Doc deltas:** `docs/CONTRACTS.md`: I4, storage key, status rules. `docs/ARCHITECTURE.md`: progress lives only in this browser on this device and loads automatically; clearing site data deletes it; iOS Safari deletes storage of sites unused for 7 days unless the page is on the Home Screen; export/import is a rare backup; no cross-device sync.
  - `docs/CONTRACTS.md`: "latest attempt" means the last one in `attempts` array order (the list is append-only), not the largest `at`, so clock changes on the phone cannot reorder history.
  - `docs/CONTRACTS.md`: `importJson` replaces the whole store (attempts and `lastExportAt`) with the file's contents; it does not merge, so importing an export restores exactly that snapshot.
  - `docs/CONTRACTS.md`: `record` checks the attempt shape and throws on a bad one; `setGuessed` throws on an index with no attempt.
  - `docs/CONTRACTS.md`: `exportJson(now)` accepts a `Date` or an ISO string and stores the ISO string; the exported text is 2-space indented JSON of the whole store.
  - `docs/CONTRACTS.md`: `reset()` removes the progress key; the corrupt-copy key is left alone.
  - `docs/CONTRACTS.md`: `statusMap(questionIds, attempts)` (status per id, one pass) is exported for selection and the page, so status rules live in one place.

### S5 — Question selection

- **Goal:** `pickNext` (I5) picks the next question, with a strategy chosen by bank size.
- **Blocked by:** S1, S4
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 5
- **Files:** `js/select.js` (new), `test/select.test.mjs` (new), `docs/CONTRACTS.md`.
- **Seams:**
  - `pickNext`, `pickWeighted`, `pickBuckets` with a seeded `rng`: catches the size switch, weights, bucket shares, recent exclusion, edge cases; misses how the mix feels in use.
- **Decisions:**
  - "selection function to choose a question based on whether it has done before, whether got it right before, whether guessed, how many undone questions in question bank" (user). Statuses come from `questionStatus` (I4). Doc delta: `docs/CONTRACTS.md`.
  - "have different selection functions depending on number of questions in the question bank. i'm hoping for around 200 questions. but mayb 500 is possible?" (user). Strategies, `LARGE_BANK = 100` threshold and constants per I5 (user: "1) ok"). Doc delta: `docs/CONTRACTS.md`.
  - Tuning constants are exported (`LARGE_BANK`, `WEIGHTS`, `BUCKETS`) in one place. Doc delta: `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [x] `test/select.test.mjs`: empty `questionIds` returns `null`; one question returns it even if it is in `recent`.
  - [x] `test/select.test.mjs`: 99 ids use `pickWeighted` and 100 ids use `pickBuckets` (checked by the different recent window: with 100 ids, none of the last 10 of `recent` is returned in 1000 picks; with 99 ids an id 4th-from-last in `recent` can be returned).
  - [x] `test/select.test.mjs`: `pickWeighted`, 10 000 seeded picks over a known status mix: frequency per status within 2 percentage points of its `WEIGHTS` share; the last 3 of `recent` are never returned.
  - [x] `test/select.test.mjs`: `pickBuckets`, 10 000 seeded picks over 200 ids with all three buckets non-empty: bucket frequencies within 2 percentage points of `BUCKETS`; with the unseen bucket empty, review and known split 0.5 : 0.15 re-normalised.
  - [x] `test/select.test.mjs`: `pickBuckets` known-bucket pick is the question with the oldest latest attempt.
  - [x] `test/select.test.mjs`: when every candidate is in `recent`, a question is still returned.
  - [x] `node --test` exits 0.
- **Doc deltas:** `docs/CONTRACTS.md`: I5 with the constants and both strategies.
  - `docs/CONTRACTS.md`: in the known bucket, "oldest latest attempt" compares positions in the `attempts` array (append-only, so lower index = older), matching the S4 rule that "latest" is by array order, not by `at`.
  - `docs/CONTRACTS.md`: `pickWeighted` and `pickBuckets` also return `null` for an empty `questionIds`; `recent` defaults to `[]` and `rng` to `Math.random`.
  - No doc: the recent windows (3 and 10) are module constants next to `LARGE_BANK`, `WEIGHTS` and `BUCKETS`, but not exported, since I5 fixes them.

### S6 — One-question-at-a-time quiz page

- **Goal:** `index.html` on GitHub Pages loads `bank/bank.json`, shows one question at a time, marks on Submit, shows feedback, and records progress automatically, on a phone-width screen.
- **Blocked by:** S1, S2, S3, S4, S5
- **Branch:** `feat/question-bank-quiz`
- **Order on branch:** 6
- **Files:** `index.html` (new), `manifest.webmanifest` (new), `icon-192.png`, `icon-512.png` (new), `css/app.css` (new), `js/markdown.js` (new: ported from the `tiny markdown renderer` in `d:\SMU\quizzer\example\Finals Practice Quiz 2 (Short).html`, plus image support with paths resolved against `bank/`), `js/session.js` (new: DOM-free state machine), `js/app.js` (new: DOM wiring), `test/session.test.mjs`, `test/markdown.test.mjs`, `README.md`, `docs/ARCHITECTURE.md`.
- **Seams:**
  - `createSession({ questions, store, pick, now, rng })` in `js/session.js`: states `question` then `feedback`; `submit(response)`, `next({ guessed })`, `current()` (includes `shownOptions`: option keys in shown order), `buttons()`. Catches the flow, what is recorded, the guessed flag, the button set per type, shuffle; misses layout and touch behaviour.
  - `renderMarkdown(md, { base })`: catches images resolved to `bank/images/...`, tables, code, escaping of raw HTML; misses visual styling.
- **Decisions:**
  - "show one question at a time" (user). Doc delta: `README.md`.
  - "should mark after submit" (user): Submit is disabled until at least one option is selected (single/multi) or the text is non-empty (written). After Submit, inputs lock and feedback shows: per-option correct-ticked / correct-missed / wrong-ticked / wrong-unticked marks, each option's `explanation` under it, score `x / max` to 2 decimals, the overall explanation, source. Doc delta: `README.md`.
  - "have it randomise options also" (user): when a question is shown, its options are put in a random order (via the session `rng`) unless `shuffle: false`. Display letters `a`, `b`, ... follow the shown order; responses and attempts store option keys, not shown positions. Doc delta: `docs/CONTRACTS.md`.
  - Written: "just flash the model answer if cannot" (user): after Submit, the user's text and the model answer are shown side by side (stacked on a phone), then one "Next" button. Doc delta: `README.md`.
  - "after showing the button should have a next (i guessed) and next button to indicate whether i actually answered or just guess cos it's MCQ" (user): for `single`/`multi`, the feedback state shows two buttons, "Next (I guessed)" and "Next". Doc delta: `README.md`.
  - The header shows bank counts from `bankStats`: unseen, wrong, partial, guessed, right, shown. Doc delta: `README.md`.
  - Stats screen: counts, "Last export: N days ago" (or "never"), Export progress, Import progress, Reset progress (with a confirm dialog). Doc delta: `README.md`.
  - On load the page calls `navigator.storage.persist()` when available, and links `manifest.webmanifest` (user: "okay to 2-4"). Doc delta: `docs/ARCHITECTURE.md`.
  - Plain HTML/CSS/JS ES modules, no build step, no external CDN. Doc delta: `docs/ARCHITECTURE.md`.
  - Layout works at 360px width, 16px side gutter, no horizontal page scroll (wide code and tables scroll inside their box), light and dark via `prefers-color-scheme` (style carried over from the quizzer template). Transient.
- **Acceptance criteria:**
  - [ ] `test/session.test.mjs`: `submit` on a `multi` question records one attempt with the S3 score and `guessed: false`; `buttons()` is `["next-guessed", "next"]`; `next({ guessed: true })` sets `guessed: true` on that attempt and moves to a new `question` state.
  - [ ] `test/session.test.mjs`: `next` before `submit` throws; `submit` twice throws.
  - [ ] `test/session.test.mjs`: with a seeded `rng`, a 5-option question's `shownOptions` is a permutation of its keys and differs from source order for at least one of 20 showings; with `shuffle: false` it equals source order every time; the recorded attempt's `response.selected` holds option keys.
  - [ ] `test/session.test.mjs`: on a `written` question, `submit` records an attempt with outcome `shown`, `score: null`, and `buttons()` is `["next"]`.
  - [ ] `test/session.test.mjs`: `pick` receives all bank ids and the shown ids, most recent last, as `recent`.
  - [ ] `test/markdown.test.mjs`: `![x](images/a.png)` renders `<img` with `src="bank/images/a.png"` and `alt="x"`; `<script>` in input is escaped; a table and a fenced code block render.
  - [ ] `node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest','utf8'))"` exits 0.
  - [ ] `node --test` exits 0 and `node scripts/validate-bank.mjs` exits 0.
- **Doc deltas:** `README.md`: how to use the quiz (flow, buttons, counts, Add to Home Screen, export/import as rare backup). `docs/ARCHITECTURE.md`: module map (`bank.js`, `import.js`, `marking.js`, `progress.js`, `select.js`, `session.js`, `markdown.js`, `app.js`); storage persistence request and manifest; offline service worker out of scope.

## Human checks

- [ ] S6: Merge to `main`, open https://oshawotttt.github.io/gamified-quizzes/ on the phone. Expected: one question shows, text and options readable without zoom, no horizontal page scroll.
- [ ] S6: Answer the multi-select sample partly right, tap Submit. Expected: options marked, an explanation under each option, partial score shown (e.g. 0.40 / 2), overall explanation and source, buttons "Next (I guessed)" and "Next".
- [ ] S6: Show the same multi-select question several times. Expected: option order changes; the True/False sample always shows True first.
- [ ] S6: Open the image sample. Expected: the photo shows and fits the screen width.
- [ ] S6: Answer the written sample, Submit. Expected: your text and the model answer, one "Next" button.
- [ ] S4/S6: Add the page to the Home Screen, answer 3 questions, close it, reopen it from the Home Screen. Expected: header counts include those 3, no import needed.
- [ ] S4/S6: Export progress, Reset, Import the exported file. Expected: counts return to the pre-reset values; "Last export" shows today.
- [ ] S6: Switch the phone to dark mode. Expected: page readable in dark colours.
