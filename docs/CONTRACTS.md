# Contracts

All modules are browser ES modules under `js/`, importable from Node.

## Bank index and bank file (`banks/index.json`, `banks/<id>/bank.json`, `js/bank.js`)

Several banks, each in its own folder `banks/<id>/` holding `bank.json` and `images/`. `banks/index.json` lists them. There are no quiz filters or topic tags inside a bank.

```json
{ "version": 1, "banks": [ { "id": "cs203", "name": "CS203" } ] }
```

- `id`: `^[a-z0-9][a-z0-9-]*$`, unique in the list; names the folder `banks/<id>/`.
- `name`: required, non-empty string; the display name on the picker and in the page header. The name lives only in the index: `bank.json` has no `name` field.
- List order is the picker order.
- `validateIndex(json) => string[]` (empty = valid) catches a bad version, `banks` not an array, bad or duplicate ids and a missing or empty name; it does not check that folders exist.

Bank file `banks/<id>/bank.json`, fetched by the page:

```json
{ "version": 1, "nextId": 18, "questions": [ /* Question */ ] }
```

`nextId` is greater than every numeric id in `questions`. Ids are unique per bank: `q0001` can exist in two banks. Images are not shared between banks; each bank holds its own copies.

`js/banks.js` (DOM-free, used by the page): `INDEX_URL` (`banks/index.json`), `bankDir(id)` (`banks/<id>`), `loadIndex(fetchJson) => Promise<{ banks: [{ id, name }], error: string | null }>` (index order; never rejects: a failed fetch or an index that fails `validateIndex` gives `banks: []` and an error message), `bankFromUrl(search, banks) => { id, name } | null` (reads `?bank=<id>`; null when missing, empty or not listed).

Question:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string, `^q[0-9]{4,}$` | yes | Assigned by `add-quiz.mjs` from `nextId`: `q0001`, `q0002`, ... Unique. Never reused or renamed: progress is keyed on it. |
| `type` | `"single"` \| `"multi"` \| `"written"` | yes | True/false is `single` with options `a. True`, `b. False` (quizzer format). Short answer is `written`. |
| `points` | number > 0 | no | Default 1. |
| `stem` | string (markdown) | yes | |
| `options` | `[{ "key": "a", "text": "<markdown>", "explanation": "<markdown>" }]` | `single`/`multi` only | 2-8 options, keys `a`, `b`, ... in order, no gaps. `explanation` is required on every option: why this option is correct or wrong, without referring to other options by letter. Forbidden on `written`. |
| `answer` | string[] of option keys | `single`/`multi` only | `single`: exactly 1 key. `multi`: 1 or more keys. Every key exists in `options`. Duplicate keys are an error. Forbidden on `written`. |
| `shuffle` | boolean | no, `single`/`multi` only | Default `true`. `false` keeps source order (for True/False, or options such as "All of the above"). |
| `modelAnswer` | string (markdown) | `written` only | |
| `wordLimit` | integer > 0 | no, `written` only | Default 250. Shown as a guide, not enforced. |
| `explanation` | string (markdown) | no | Overall explanation, shown after Submit below the options. Must not refer to options by letter (letters change when shuffled). |
| `source` | string | no | e.g. `from course: Week 02 - Interrupts.pptx slides 33, 37`, `own answer`, `given`. Shown after Submit. |
| `quiz` | string | yes | Title of the import file the question came from. Provenance only. |
| `addedAt` | ISO-8601 date string | yes | Accepts `YYYY-MM-DD` or a full ISO-8601 date-time; `add-quiz.mjs` writes the date form. |

Validation rules:

- Unknown question and option fields are errors, so a typo such as `explaination` fails validation instead of being silently ignored.
- Empty-string `stem`, option `text`, option `explanation`, `quiz` and `modelAnswer` count as missing.
- The rule that explanations must not refer to options by letter is not checked by the validator (it cannot tell a letter reference from ordinary text); it is a rule for the generator.
- `validateQuestion(q, { path, imageExists, mode })` and `validateBank(json, { imageExists })` return `string[]` errors (empty = valid). `mode` is `"bank"` (`id`, `quiz`, `addedAt` required) or `"import"` (they are forbidden).
- `node scripts/validate-bank.mjs [bank file]` validates that one bank file, including that every image exists (images relative to the file's folder); prints `OK: N question(s), nextId N`. Exit 1 on any error.
- `node scripts/validate-bank.mjs` with no argument validates `banks/index.json` and every bank it lists, including a listed bank with no `bank.json`. An invalid index exits 1 at once; otherwise every bank is checked before exiting (one run reports all broken banks) and each passing bank prints `OK <id>: N question(s), nextId N`. Exit 1 if any fails.

Options are shuffled per showing unless `shuffle: false`. Display letters follow the shown order; responses and attempts store option keys, not shown positions.

Markdown subset (all markdown fields): paragraphs, bold, italic, inline code, fenced code blocks, ordered/unordered lists, tables, images `![alt](images/<file>)`. Images may appear in stems, options, explanations and model answers.

- In `bank.json`, image paths are relative to `banks/<id>/`; files are in `banks/<id>/images/`. Extensions: `.png .jpg .jpeg .gif .webp .svg`. File names contain no spaces.
- Image paths must be exactly `images/<file>` (no sub-folders, no `..`); all images of a bank live flat in `banks/<id>/images/`, so the page resolves them with one base path (`banks/<id>`).

`renderMarkdown(md, { base })` (`js/markdown.js`): resolves images against `base` (`banks/<id>/images/...` in the page), wraps tables in `<div class="scroll">` so wide tables scroll inside their box instead of widening the page, escapes `& < > " '` (raw HTML is escaped), and accepts CRLF line endings.

## Import file (`js/import.js`, `scripts/add-quiz.mjs`)

The file written for each generated or formatted quiz. Anywhere on disk; images beside it in an `images/` folder.

```json
{ "version": 1, "title": "CS205 Finals Practice Quiz 2 (Short)", "questions": [ /* Question without id, quiz, addedAt */ ] }
```

- Needs `version: 1`, a non-empty `title` and at least one question; an empty `questions` list is an error.
- Every option already has its `explanation`, written at generation time. An `id` in an import question is an error. Image paths are `images/<file>`, relative to the import file's folder.

The import file format is bank-agnostic: it does not name a bank.

```
node scripts/add-quiz.mjs <import file> --bank <id> [--dry-run]
node scripts/add-quiz.mjs <import file> --new <id> --name "<display name>" [--dry-run]
```

- Exactly one of `--bank <id>` or `--new <id> --name "<display name>"` is required; there is no default bank. Exit 1 with nothing written for: neither flag, both flags, `--new` without `--name`, `--name` with `--bank`, `--new` with an empty `--name`, an unknown option, a flag without a value, a flag given twice. (A typo must not write to the wrong place.)
- `--bank` with an id not in the index: exit 1, lists the known ids. `--new` with an id not matching `^[a-z0-9][a-z0-9-]*$`, already in the index or with an existing `banks/<id>/` folder: exit 1, nothing written.
- First it checks `banks/index.json` with `validateIndex`; if invalid, exit 1 with nothing written.
- `--new` creates `banks/<id>/bank.json` = `{ "version": 1, "nextId": 1, "questions": [...] }` (first id `q0001`) and `banks/<id>/images/` (even with no images), and appends `{ id, name }` to the end of `banks/index.json`, rewritten as 2-space indented JSON (same writer as `bank.json`; content unchanged apart from the new entry). `--new` writes nothing (no folder, no index change) on import errors or with `--dry-run`.
- `banks/<id>/images/` is also created when missing for `--bank` (git drops the empty `images/` of a bank created without images).
- Validates the import file against the bank rules (minus `id`, `quiz`, `addedAt`). Any error: prints every error with question index and field, exits 1, writes nothing.
- Skips questions whose stem matches an existing stem in the target bank only (whitespace collapsed, case ignored; a stem in another bank does not count) and lists them. Duplicate stems inside one import file are also detected (the second copy is skipped). A bank stem is compared with its `images/<id>-` prefix removed, so re-importing a question with an image is still skipped.
- Assigns ids from `nextId` (never reused), sets `quiz` = `title` and `addedAt` = the local date (`YYYY-MM-DD`) on the machine running the script, copies each image beside the import file's `images/<file>` to `banks/<id>/images/<qid>-<file name>` and rewrites its path to `images/<qid>-<file name>`, appends to `banks/<id>/bank.json`, bumps `nextId`.
- Runs the bank validation on the result before writing; writes `bank.json` only if it passes. Errors from that check are prefixed `bank after import:`.
- `bank.json` is written as 2-space indented JSON with a trailing newline.
- `--dry-run`: validates and reports, writes nothing.
- Prints skipped duplicates and the summary line `added N (qA-qB) to <id>, skipped M duplicate(s)`. With no new questions (all duplicates) it exits 0 and writes nothing.
- The import file is not deleted or moved.
- `planImport(bank, importJson, { imageExists, bankImageExists, today })` returns `{ errors, added, skipped, newBank, imageCopies }`; `newBank` is null on any error.

## Marking (`js/marking.js`)

```js
markAnswer(question, response) => MarkResult
// response: { selected: string[] } for single/multi; { text: string } for written
// MarkResult (single/multi): { score, max, allOrNothing,
//   outcome: "right" | "partial" | "wrong",
//   options: { [key]: "correct-ticked" | "correct-missed" | "wrong-ticked" | "wrong-unticked" } }
// MarkResult (written): { score: null, max, outcome: "shown" }
questionPoints(question) // points, default 1
```

- Each option is one choice: ticking a correct option or leaving a wrong option unticked is a correct choice, anything else a wrong choice. `score = max(0, (correctChoices - wrongChoices) / numOptions * points)`. Same formula for `single` and `multi`; for `single` it gives full points for the right key and 0 for any wrong key. Floor 0.
- `allOrNothing` = `max` only when the selected set equals the answer set, else 0. Kept for reference; `score` is what counts.
- `outcome`: `right` when `score == max`, `wrong` when `score == 0`, else `partial`. Compared within 1e-9, so floating-point results such as `0.4 * 5` still count as `right`.
- Selected keys that are not option keys are ignored by the score (neither a correct nor a wrong choice) but make `allOrNothing` 0.
- Written: `markAnswer` gives no score, outcome `shown`. The session does not record that result: the user self-marks (see Session). Status `shown` (older attempts only) counts like `right` in selection.

## Progress store (`js/progress.js`)

Progress is kept per bank. localStorage key `gamified-quizzes.progress.v1.<bankId>` (prefixed because every `oshawotttt.github.io/*` site shares one origin and one localStorage). The stored value (no `bank` field; the key names the bank):

```json
{ "version": 1, "lastExportAt": null, "attempts": [ Attempt ] }
```

Attempt: `{ "qid": string, "at": ISO-8601 string, "score": number | null, "max": number, "outcome": "right"|"partial"|"wrong"|"shown", "guessed": boolean, "response": object }`.

```js
progressKey(bankId)  // "gamified-quizzes.progress.v1.<bankId>"
corruptKey(bankId)   // "gamified-quizzes.progress.corrupt.<bankId>"
LEGACY_PROGRESS_KEY  // "gamified-quizzes.progress.v1"
createProgressStore(storage /* getItem/setItem/removeItem */, bankId) => {  // throws without a non-empty bank id
  all(): Attempt[],
  record(attempt): number,            // returns index; throws on a bad attempt shape
  setGuessed(index, guessed): void,   // throws on an index with no attempt
  exportJson(now): string,            // also sets lastExportAt = now; text: { version: 1, bank: "<bankId>", lastExportAt, attempts }
  lastExportAt(): string | null,
  importJson(text): void,             // throws Error on invalid shape; leaves store unchanged
  reset(): void,
}
questionStatus(qid, attempts) => "unseen" | "wrong" | "partial" | "guessed" | "right" | "shown"
statusMap(questionIds, attempts) => Map<id, status>   // one pass; status rules live here
bankStats(questionIds, attempts) => { total, unseen, wrong, partial, guessed, right, shown }
```

- Attempts are an append-only history. Status uses the latest attempt per question: none = `unseen`; `guessed` and outcome not `wrong` = `guessed`; else the outcome (a guessed wrong attempt is `wrong`).
- "Latest" means last in `attempts` array order, not the largest `at`, so clock changes cannot reorder history.
- Attempts for qids not in the bank are kept but ignored by stats and selection.
- The attempt is recorded at Submit with `guessed: false`; "Next (I guessed)" sets it to `true`.
- `importJson` replaces the whole store (attempts and `lastExportAt`) with the file's contents; it does not merge, so importing an export restores exactly that snapshot.
- `importJson` throws (message names both bank ids) and leaves the store unchanged when the file has a `bank` field that is not equal to the open bank id (any value, including non-strings). A file with no `bank` field is accepted into whichever bank is open.
- Legacy migration: the first time the `cs203` store is created and its own key is absent, the raw text under `gamified-quizzes.progress.v1` is copied to `gamified-quizzes.progress.v1.cs203` and the legacy key removed. Other banks never read the legacy key.
- `exportJson(now)` accepts a `Date` or an ISO string and stores the ISO string; the exported text is 2-space indented JSON of the whole store.
- `reset()` removes the bank's progress key; the corrupt-copy key is left alone.
- Corrupt or wrong-version stored JSON: the store starts empty and keeps the raw text under `gamified-quizzes.progress.corrupt.<bankId>`.

## Selection (`js/select.js`)

```js
export const LARGE_BANK = 100;
export const WEIGHTS = { unseen: 3, wrong: 6, partial: 4, guessed: 4, right: 1, shown: 1 };
export const BUCKETS = { review: 0.5, unseen: 0.35, known: 0.15 };
pickNext(questionIds, attempts, { recent: string[], rng: () => number }) => string | null
pickWeighted(questionIds, attempts, { recent, rng })
pickBuckets(questionIds, attempts, { recent, rng })
```

- `WEIGHTS`: relative chance of one question being picked, by status (weight 6 = 6x as likely as weight 1). Used by `pickWeighted` for every question and by `pickBuckets` inside the review bucket.
- `BUCKETS`: share of picks from each group, in `pickBuckets` only (0.5 = half of all questions shown come from review, whatever the size of each group).
- Statuses come from `questionStatus`.
- `pickNext`: fewer than `LARGE_BANK` ids use `pickWeighted`; `LARGE_BANK` or more use `pickBuckets`. Returns null only when `questionIds` is empty (so do the other two). `recent` defaults to `[]`, `rng` to `Math.random`.
- `pickWeighted`: weighted random per question by status; excludes the last 3 of `recent`.
- `pickBuckets`: excludes the last 10 of `recent`. Buckets: review = wrong|partial|guessed, unseen, known = right|shown. Picks a bucket by `BUCKETS`, re-normalised over non-empty buckets; then review: weighted random by `WEIGHTS`; unseen: uniform random; known: the one with the oldest latest attempt (compares positions in the `attempts` array, lower index = older, matching the "latest" rule above).
- If exclusion empties the candidate set, the exclusion is dropped for that pick.
- The recent windows (3 and 10) are module constants, not exported.

## Session (`js/session.js`)

`createSession({ questions, store, pick, now, rng })`: states `question` then `feedback` (`empty` when the bank has no questions).

- `current()` includes `shownOptions`: option keys in shown order (shuffled via `rng` unless `shuffle: false`).
- `buttons()`: `["submit"]`, then `["next-guessed", "next"]` for `single`/`multi` or `["next-right", "next-wrong", "next-partial"]` for `written`.
- `submit(response)`: for `single`/`multi`, records one attempt with `guessed: false`; throws on no selected option. For `written`, records nothing; blank text is allowed (it reveals the model answer). Throws outside the `question` state.
- `next({ guessed })` (`single`/`multi`): throws before `submit`. `guessed: true` flags the attempt only if the store still holds the exact attempt this session recorded, so a restored backup is never changed.
- `next({ mark })` (`written`): `mark` is one of `SELF_MARKS` (`"right"`, `"partial"`, `"wrong"`), else throws. Records `{ score: null, max, outcome: mark, guessed: mark === "partial", response: {} }`, so partial shows as status `guessed`. The written text is never stored.
- `pick` receives all bank ids and, as `recent`, the ids shown in this visit, most recent last.
- `restart()` drops the current question or feedback and shows a new question; the page calls it after Import or Reset.
- `stats()` returns `bankStats` for the bank.
