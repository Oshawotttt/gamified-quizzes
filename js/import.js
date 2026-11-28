// Import file (I2) -> bank (I1). Pure planning step: no file I/O.
// scripts/add-quiz.mjs does the reading, image copying and writing.

import { validateBank, validateQuestion } from "./bank.js";

const IMAGE_REF = /(!\[[^\]]*\]\()images\/([^)\s]+)(\))/g;

/** Question id for a counter value: 5 -> "q0005". */
export function formatId(n) {
  return `q${String(n).padStart(4, "0")}`;
}

/** Stem key for duplicate detection: whitespace collapsed, case ignored. */
export function stemKey(stem) {
  return String(stem).replace(/\s+/g, " ").trim().toLowerCase();
}

function validateImportFile(importJson, imageExists) {
  if (!importJson || typeof importJson !== "object" || Array.isArray(importJson)) return ["import: must be an object"];
  const errors = [];
  if (importJson.version !== 1) errors.push(`version: must be 1 (got ${JSON.stringify(importJson.version)})`);
  if (typeof importJson.title !== "string" || importJson.title.trim() === "") errors.push("title: is required (non-empty string)");
  if (!Array.isArray(importJson.questions)) {
    errors.push("questions: must be an array");
  } else if (importJson.questions.length === 0) {
    errors.push("questions: must not be empty");
  } else {
    importJson.questions.forEach((q, i) => {
      errors.push(...validateQuestion(q, { path: `questions[${i}]`, imageExists, mode: "import" }));
    });
  }
  return errors;
}

/** Rewrite `images/<file>` to `images/<id>-<file>` in every markdown field. */
function rewriteImages(q, id, copies) {
  const rewrite = (text) =>
    text.replace(IMAGE_REF, (_, open, file, close) => {
      const from = `images/${file}`;
      const to = `images/${id}-${file}`;
      if (!copies.some((c) => c.to === to)) copies.push({ from, to });
      return `${open}${to}${close}`;
    });
  const out = structuredClone(q);
  for (const field of ["stem", "explanation", "modelAnswer"]) {
    if (typeof out[field] === "string") out[field] = rewrite(out[field]);
  }
  if (Array.isArray(out.options)) {
    for (const o of out.options) {
      o.text = rewrite(o.text);
      o.explanation = rewrite(o.explanation);
    }
  }
  return out;
}

/**
 * Plan adding an import file to the bank.
 * opts.imageExists(path): whether `images/<file>` exists beside the import file.
 * opts.bankImageExists(path): whether `images/<file>` exists in the bank folder (optional;
 *   when omitted, images already in the bank are not checked).
 * opts.today: the `addedAt` value, e.g. "2026-11-24".
 * Returns { errors, added, skipped, newBank, imageCopies }. On any error,
 * newBank is null and nothing should be written.
 */
export function planImport(bank, importJson, { imageExists, bankImageExists, today }) {
  const fail = (errors) => ({ errors, added: [], skipped: [], newBank: null, imageCopies: [] });

  const errors = validateImportFile(importJson, imageExists);
  if (errors.length) return fail(errors);

  // Bank stems carry id-prefixed image paths; strip the prefix so a re-imported
  // question with an image still matches its earlier copy.
  const known = new Map(bank.questions.map((q) => [stemKey(q.stem.replaceAll(`images/${q.id}-`, "images/")), q.id]));
  const added = [];
  const skipped = [];
  const imageCopies = [];
  let nextId = bank.nextId;

  importJson.questions.forEach((q, index) => {
    const key = stemKey(q.stem);
    if (known.has(key)) {
      skipped.push({ index, stem: q.stem, duplicateOf: known.get(key) });
      return;
    }
    const id = formatId(nextId++);
    const { stem, ...rest } = rewriteImages(q, id, imageCopies);
    added.push({ id, type: rest.type, stem, ...rest, quiz: importJson.title, addedAt: today });
    known.set(key, id);
  });

  const newBank = { ...bank, nextId, questions: [...bank.questions, ...added] };
  const newImages = new Set(imageCopies.map((c) => c.to));
  const bankErrors = validateBank(newBank, {
    imageExists: (p) => newImages.has(p) || (bankImageExists ? bankImageExists(p) : true),
  });
  if (bankErrors.length) return fail(bankErrors.map((e) => `bank after import: ${e}`));

  return { errors: [], added, skipped, newBank, imageCopies };
}

