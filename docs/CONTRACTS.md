# Contracts

All modules are browser ES modules under `js/`, importable from Node.

## Bank file (`bank/bank.json`, `js/bank.js`)

One file, fetched by the page. There is one bank only: no several banks, quiz filters or topic tags.

```json
{ "version": 1, "nextId": 18, "questions": [ /* Question */ ] }
```

`nextId` is greater than every numeric id in `questions`.

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
- `node scripts/validate-bank.mjs [bank file]` validates the bank, including that every image exists; the bank path defaults to `bank/bank.json`. Exit 1 on any error.

Options are shuffled per showing unless `shuffle: false`. Display letters follow the shown order; responses and attempts store option keys, not shown positions.

Markdown subset (all markdown fields): paragraphs, bold, italic, inline code, fenced code blocks, ordered/unordered lists, tables, images `![alt](images/<file>)`. Images may appear in stems, options, explanations and model answers.

- In `bank.json`, image paths are relative to `bank/`; files are in `bank/images/`. Extensions: `.png .jpg .jpeg .gif .webp .svg`. File names contain no spaces.
- Image paths must be exactly `images/<file>` (no sub-folders, no `..`); all images live flat in `bank/images/`, so the page resolves them with one base path.

`renderMarkdown(md, { base })` (`js/markdown.js`): resolves images against `base` (`bank/images/...` in the page), wraps tables in `<div class="scroll">` so wide tables scroll inside their box instead of widening the page, escapes `& < > " '` (raw HTML is escaped), and accepts CRLF line endings.

## Import file (`js/import.js`, `scripts/add-quiz.mjs`)

The file written for each generated or formatted quiz. Anywhere on disk; images beside it in an `images/` folder.

```json
{ "version": 1, "title": "CS205 Finals Practice Quiz 2 (Short)", "questions": [ /* Question without id, quiz, addedAt */ ] }
```

- Needs `version: 1`, a non-empty `title` and at least one question; an empty `questions` list is an error.
- Every option already has its `explanation`, written at generation time. An `id` in an import question is an error. Image paths are `images/<file>`, relative to the import file's folder.

```
node scripts/add-quiz.mjs <import file> [--dry-run]
```

- Validates the import file against the bank rules (minus `id`, `quiz`, `addedAt`). Any error: prints every error with question index and field, exits 1, writes nothing.
- Skips questions whose stem matches an existing stem (whitespace collapsed, case ignored) and lists them. Duplicate stems inside one import file are also detected (the second copy is skipped). A bank stem is compared with its `images/<id>-` prefix removed, so re-importing a question with an image is still skipped.
- Assigns ids from `nextId` (never reused), sets `quiz` = `title` and `addedAt` = the local date (`YYYY-MM-DD`) on the machine running the script, copies each image to `bank/images/<id>-<file name>` and rewrites its path, appends to `bank/bank.json`, bumps `nextId`.
- Runs the bank validation on the result before writing; writes `bank.json` only if it passes. Errors from that check are prefixed `bank after import:`.
- `bank.json` is written as 2-space indented JSON with a trailing newline.
- `--dry-run`: validates and reports, writes nothing.
- Prints: added count, skipped duplicates, new id range. With no new questions (all duplicates) it exits 0 and writes nothing.
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
- Written: no score, outcome `shown`; status `shown` counts like `right` in selection.

## Progress store (`js/progress.js`)

localStorage key `gamified-quizzes.progress.v1` (prefixed because every `oshawotttt.github.io/*` site shares one origin and one localStorage):

```json
{ "version": 1, "lastExportAt": null, "attempts": [ Attempt ] }
```

Attempt: `{ "qid": string, "at": ISO-8601 string, "score": number | null, "max": number, "outcome": "right"|"partial"|"wrong"|"shown", "guessed": boolean, "response": object }`.

```js
createProgressStore(storage /* getItem/setItem/removeItem */) => {
  all(): Attempt[],
  record(attempt): number,            // returns index; throws on a bad attempt shape
  setGuessed(index, guessed): void,   // throws on an index with no attempt
  exportJson(now): string,            // also sets lastExportAt = now
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
- `exportJson(now)` accepts a `Date` or an ISO string and stores the ISO string; the exported text is 2-space indented JSON of the whole store.
- `reset()` removes the progress key; the corrupt-copy key is left alone.
- Corrupt or wrong-version stored JSON: the store starts empty and keeps the raw text under `gamified-quizzes.progress.corrupt`.

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
- `buttons()`: `["submit"]`, then `["next-guessed", "next"]` for `single`/`multi` or `["next"]` for `written`.
- `submit(response)`: records one attempt with `guessed: false`; throws outside the `question` state and on an empty response (no selected option, or blank text).
- `next({ guessed })`: throws before `submit`. `guessed: true` is ignored for `written` questions (attempts are `shown`, not marked) and flags the attempt only if the store still holds the exact attempt this session recorded, so a restored backup is never changed.
- `pick` receives all bank ids and, as `recent`, the ids shown in this visit, most recent last.
- `restart()` drops the current question or feedback and shows a new question; the page calls it after Import or Reset.
- `stats()` returns `bankStats` for the bank.
