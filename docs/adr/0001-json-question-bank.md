# Store the question bank as one JSON file with markdown strings

The site is static files on GitHub Pages, so there is no SQL server, and SQLite in the browser would need a ~1 MB wasm library plus a binary file in git that cannot be diffed. The bank is one file, `bank/bank.json`, with markdown inside string fields and images as files in `bank/images/`. About 500 questions of JSON is well under 1 MB and loads with one `fetch`; markdown strings keep the quizzer formatting.

Several banks, one folder each, are covered by [ADR-0002](0002-multiple-banks.md); the file is then `banks/<id>/bank.json`.

## Considered options

- Markdown files: rejected, no structured fields (answers, per-option explanations) to validate.
- SQL database or SQLite in the browser: rejected for the reasons above.
