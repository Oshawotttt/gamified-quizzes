# gamified-quizzes

General practice quizzes.

## Play

**https://oshawotttt.github.io/gamified-quizzes/**

One question is shown at a time, from one question bank (`bank/bank.json`).

- The header shows the bank total and the count per status: unseen, wrong, partial, guessed, right, shown. Each question shows its type tag, points and id (the id helps when reporting a bad question).
- Submit stays disabled until an option is picked (single/multi). Written questions have a "Review answer" button instead, always enabled: writing is optional and the text is never saved. After Submit, inputs lock and feedback shows: per-option correct-ticked / correct-missed / wrong-ticked / wrong-unticked marks, each option's explanation under it, the score `x / max` to 2 decimals, the overall explanation and the source.
- For single/multi questions there are two buttons after Submit: "Next (I guessed)" and "Next", to record whether you actually answered or guessed.
- Written questions are self-marked: your text and the model answer are shown side by side (stacked on a phone), then "Next (correct)", "Next (wrong)" and "Next (partial)". Partial is recorded as guessed, so it comes back for review like a guessed question.
- The Stats screen shows the counts, "Last export: N days ago" (or "never"), Export progress, Import progress and Reset progress (with a confirm dialog). Progress is saved automatically in the browser; export/import is a rare backup. Add the page to the Home Screen to keep its storage.

## Develop

- `node --test`: run the tests.
- `node scripts/validate-bank.mjs [bank file]`: validate the bank (default `bank/bank.json`).

### Add a quiz

1. Write the import file (format: `docs/CONTRACTS.md`, "Import file"), with images beside it in an `images/` folder.
2. `node scripts/add-quiz.mjs <import file> --dry-run`
3. `node scripts/add-quiz.mjs <import file>`, then commit `bank/`.

`examples/sample-import/` holds a sample import, added as `q0001`-`q0006`. Its image is an SVG (`five-state-model.svg`, a five-state process diagram drawn for the sample); its true/false and image questions were written for the sample (sources are given in the file).

The import file can also be written by the `md-to-quiz-json` Claude Code skill (see below).

## Claude Code skill: md-to-quiz-json

The skill converts a quiz answers markdown file (`<Quiz> - Answers.md`, with ✔ on the correct options and an `Answer:` paragraph per question) into an import file. It checks the result with the same rules as the bank. Inside this repo it is already available. To use it in other projects, install it.

### Install

Needs Node.js 18 or later.

```
npx -y github:Oshawotttt/gamified-quizzes
```

| Option | Installs to | Use for |
|---|---|---|
| (none) | `~/.claude/skills/md-to-quiz-json` | Every project on this computer |
| `--project` | `./.claude/skills/md-to-quiz-json` | The current project only |
| `--dir <skills dir>` | `<skills dir>/md-to-quiz-json` | Any other skills folder |

Restart Claude Code after installing. Then run:

```
/md-to-quiz-json "<path to Answers .md file>"
```

The skill writes `<Quiz-title>.json` next to the markdown file, with any images in an `images/` folder beside it. Add it to the bank from this repo with `node scripts/add-quiz.mjs <file>`.

### Update and versions

- Run the install command again to update. It replaces the whole installed folder and prints `installed`, `reinstalled` or `updated <old> -> <new>`.
- The installed version is in the `VERSION` file inside the skill folder.
- To install a fixed version, add its tag: `npx -y github:Oshawotttt/gamified-quizzes#v1.0.0`.
- Nothing updates on its own. Run the command again to get a new version.

### Release a new version (maintainers)

1. Edit the skill in `.claude/skills/md-to-quiz-json/`.
2. Bump `version` in `package.json`.
3. Merge to `main`, then tag the commit: `git tag v<version>` and `git push origin v<version>`.

The installer is `scripts/install-skill.mjs`. It copies the skill folder, plus `js/bank.js` and `js/import.js` into the skill's `lib/` folder, so the skill's validator uses the same rules as the bank. The `files` list in `package.json` limits the npx download to those files.

Docs: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/adr/`.

## Out of scope

- Generating questions and answers (done by the user).
- Changing the quizzer skills so the generated question bank md and the import file carry question ids and per-option explanations. That is work in the sibling `quizzer` workspace; this repo only defines the import-file contract.
