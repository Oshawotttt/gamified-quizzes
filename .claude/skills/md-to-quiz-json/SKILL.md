---
name: md-to-quiz-json
description: Convert a quiz answers markdown file (the "<Quiz> - Answers.md" format, with ✔ on correct options and "Answer: ..." paragraphs) into an import JSON file that passes `node scripts/add-quiz.mjs --dry-run`. Use when the user wants to turn a quiz .md into the question-bank import format, or asks to "convert", "format" or "import" a markdown quiz.
argument-hint: <answers .md file> [output .json path]
disable-model-invocation: true
---

# Markdown quiz to import JSON

Turn one answers markdown file into an import file for the gamified-quizzes question bank. This file lists every rule. The validator in the "Validate" section checks them.

## Input

- Argument 1: the answers markdown file. It must mark the correct options (`- **c. ... ✔**`) and hold an `Answer:` paragraph per question.
- A questions-only file (no ✔, no `Answer:`) cannot be converted. If the sibling `<Quiz> - Answers.md` exists, use it. Otherwise stop and tell the user.
- Argument 2 (optional): the output path. Default: next to the input, named from the H1 title with ` - Answers` removed. In the file name, replace spaces with `-` and drop characters other than letters, digits, `.`, `_` and `-`. Example: `Finals Practice Quiz 2 (Short) - Answers.md` becomes `Finals-Practice-Quiz-2-Short.json`.

## Output shape

```json
{ "version": 1, "title": "<H1 title without ' - Answers'>", "questions": [ ... ] }
```

Never set `id`, `quiz` or `addedAt`: the import script assigns them, and the validator rejects them. Allowed question fields: `type`, `points`, `stem`, `options`, `answer`, `shuffle`, `modelAnswer`, `wordLimit`, `explanation`, `source`. Any other field is an error.

Write the file as 2-space indented JSON. Escape quotes, backslashes and newlines correctly (`\n` between markdown lines and `\n\n` between paragraphs).

## Mapping each `**Question N**` block

### Header line

- `(N points)` sets `points: N`. No points given: omit `points` (it defaults to 1).
- `(Select all that apply)` sets `type: "multi"`.
- Options present and no "select all": `type: "single"`.
- No options and a `Model answer:` blockquote: `type: "written"`.
- `(True/False)`: `type: "single"`, options `True` and `False` (keys `a`, `b`), and `shuffle: false`.

### Stem

- The stem is all the text between the header line and the first option line. For a written question, it ends before the `Answer` paragraph.
- Keep the markdown as it is: code fences, tables, numbered lists, bold, italics and inline code.
- Drop the `**Question N**` header line itself.

### Options (single and multi)

- Each `- x. text` line is one option. Strip the `x. ` prefix, the surrounding `**` and the ` ✔` marker.
- Keys must be `a`, `b`, `c`, ... in order with no gaps. Use 2 to 8 options. If the source has more than 8 options or broken letters, stop and report the question.
- `answer` is the list of ✔ keys in order. A `single` question has exactly 1 key, and a `multi` question has at least 1 key. If the ✔ marks and the `Answer: **...**` line disagree, stop and report the question.
- Set `shuffle: false` if any option refers to the position or letter of another option, such as "All of the above", "Both a and b" or "None of these". Omit `shuffle` otherwise.

### Every option needs an `explanation` (non-empty)

- Start with `Correct.` or `Wrong.` on a `single` question. Start with `True.` or `False.` on a `multi` question.
- Take the reason from the `Answer:` paragraph when it names that option, as in "(a) describes interrupt-driven I/O" or "Trap: S waited longest".
- If the paragraph says nothing about an option, write one or two short sentences that say why the option is right or wrong. Base them on the stem and the answer reasoning. Do not add facts the answer paragraph does not support. If you cannot say why, write only `Wrong.` or `False.` with the correct key, such as `Wrong. The answer is c.`

### `explanation` and `source`

- The `Answer:` paragraph has the form `Answer: **<key or value>** (<source tag>). <reasoning>`.
- `source` is the text inside the first parentheses after the answer, without the parentheses. Examples: `from course: Week 02 - Interrupts.pptx slides 33, 37`, `given`, `own answer`.
- `explanation` is the general reasoning: the part that is not about one option. Keep the markdown, including any lists or tables that follow the paragraph before the next question. Remove the sentences that you moved into option explanations, unless they also explain the main answer.

### Written questions

- `modelAnswer` is the blockquote after `Model answer:`, with the leading `> ` or `>` removed from each line. Keep the markdown.
- `source` is the parenthesised tag in `Answer (...)`.
- Set `wordLimit` only when the quiz intro or the question gives a word guide, such as "about 250 words each". Use that number.
- Do not set `options`, `answer` or `shuffle` on a written question.

## Images

- In every markdown field, an image must be `![alt](images/<file>)`. The file name must have no `/`, no spaces and no `..`. Its extension must be one of `.png .jpg .jpeg .gif .webp .svg`.
- Copy each image the markdown refers to into an `images/` folder next to the output JSON. Rename it to fit the rules above, and update the reference to match.
- Give every image a short alt text that describes it.
- If an image file cannot be found, stop and report the question and the path.

## Validate

Run the validator that ships with this skill (in this skill's base directory):

```
node <skill dir>/validate-import.mjs <output .json>
```

- Fix every error it prints and run it again, until it prints `OK: N question(s) valid`.
- A `duplicate stem` line means two questions in the file have the same stem. Tell the user.

If the current directory is the `gamified-quizzes` repo (it has `scripts/add-quiz.mjs`), also run:

```
node scripts/add-quiz.mjs <output .json> --dry-run
```

- A skipped duplicate is not an error. It means the bank already has that stem. Tell the user which questions were skipped.
- Never run it without `--dry-run`. Adding to the bank is the user's step.

Rule source: `docs/CONTRACTS.md` and `js/bank.js` in the repo. In an installed copy they are `lib/bank.js` and `lib/import.js` in this skill's directory.

## Report

Tell the user:

- The output path and the number of questions by type.
- The option explanations that you wrote yourself (the answer paragraph had no reason for them), listed by question number, so they can check them.
- Any question you stopped on, with the reason.
- The command to add it, run in the gamified-quizzes repo: `node scripts/add-quiz.mjs <output .json>`.
