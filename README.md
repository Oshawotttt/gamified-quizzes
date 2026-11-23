# gamified-quizzes

Practice quizzes for CS205 finals.

## Play

**https://oshawotttt.github.io/gamified-quizzes/**

One question is shown at a time, from one question bank (`bank/bank.json`).

- The header shows the bank total and the count per status: unseen, wrong, partial, guessed, right, shown. Each question shows its type tag, points and id (the id helps when reporting a bad question).
- Submit stays disabled until an option is picked (single/multi) or the text is non-empty (written). After Submit, inputs lock and feedback shows: per-option correct-ticked / correct-missed / wrong-ticked / wrong-unticked marks, each option's explanation under it, the score `x / max` to 2 decimals, the overall explanation and the source.
- For single/multi questions there are two buttons after Submit: "Next (I guessed)" and "Next", to record whether you actually answered or guessed.
- Written questions are not marked: your text and the model answer are shown side by side (stacked on a phone), then one "Next". A written answer is never marked guessed.
- The Stats screen shows the counts, "Last export: N days ago" (or "never"), Export progress, Import progress and Reset progress (with a confirm dialog). Progress is saved automatically in the browser; export/import is a rare backup. Add the page to the Home Screen to keep its storage.

## Develop

- `node --test`: run the tests.
- `node scripts/validate-bank.mjs [bank file]`: validate the bank (default `bank/bank.json`).

### Add a quiz

1. Write the import file (format: `docs/CONTRACTS.md`, "Import file"), with images beside it in an `images/` folder.
2. `node scripts/add-quiz.mjs <import file> --dry-run`
3. `node scripts/add-quiz.mjs <import file>`, then commit `bank/`.

`examples/sample-import/` holds a sample import, added as `q0001`-`q0006`. Its image is an SVG (`five-state-model.svg`, a five-state process diagram drawn for the sample); its true/false and image questions were written for the sample (sources are given in the file).

Docs: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/adr/`.

## Out of scope

- Generating questions and answers (done by the user).
- Changing the quizzer skills so the generated question bank md and the import file carry question ids and per-option explanations. That is work in the sibling `quizzer` workspace; this repo only defines the import-file contract.
