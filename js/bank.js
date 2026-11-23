// Question bank contract (I1): validation shared by the page, the import script
// and the bank validation script. Every function returns a list of error
// strings; an empty list means valid.

export const QUESTION_TYPES = ["single", "multi", "written"];
export const ID_PATTERN = /^q[0-9]{4,}$/;
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

const CHOICE_FIELDS = ["options", "answer", "shuffle"];
const WRITTEN_FIELDS = ["modelAnswer", "wordLimit"];
const PROVENANCE_FIELDS = ["id", "quiz", "addedAt"];
const KNOWN_FIELDS = new Set([
  "id", "type", "points", "stem", "options", "answer", "shuffle",
  "modelAnswer", "wordLimit", "explanation", "source", "quiz", "addedAt",
]);
const OPTION_FIELDS = new Set(["key", "text", "explanation"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const IMAGE_REF = /!\[[^\]]*\]\(([^)]*)\)/g;

/** Option key for a 0-based position: 0 -> "a", 1 -> "b", ... */
export function optionKey(index) {
  return String.fromCharCode(97 + index);
}

/** Every image path referenced by a markdown string, in order. */
export function imagePaths(markdown) {
  return [...String(markdown).matchAll(IMAGE_REF)].map((m) => m[1].trim());
}

/** Every markdown field of a question, as [fieldPath, text] pairs. */
export function markdownFields(q, path = "") {
  const fields = [];
  const add = (name, value) => {
    if (typeof value === "string") fields.push([`${path}.${name}`, value]);
  };
  add("stem", q.stem);
  if (Array.isArray(q.options)) {
    q.options.forEach((o, i) => {
      if (o && typeof o === "object") {
        add(`options[${i}].text`, o.text);
        add(`options[${i}].explanation`, o.explanation);
      }
    });
  }
  add("explanation", q.explanation);
  add("modelAnswer", q.modelAnswer);
  return fields;
}

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isPositiveInteger = (v) => Number.isInteger(v) && v > 0;

/**
 * Validate one question.
 * ctx.path: prefix for error messages, e.g. "questions[3]".
 * ctx.imageExists(path): whether an `images/<file>` path exists.
 * ctx.mode: "bank" (id, quiz, addedAt required) or "import" (they are forbidden).
 */
export function validateQuestion(q, ctx = {}) {
  const path = ctx.path ?? "question";
  const mode = ctx.mode ?? "bank";
  const errors = [];
  const err = (field, msg) => errors.push(`${path}.${field}: ${msg}`);

  if (!q || typeof q !== "object" || Array.isArray(q)) {
    return [`${path}: must be an object`];
  }

  for (const k of Object.keys(q)) {
    if (!KNOWN_FIELDS.has(k)) err(k, "unknown field");
  }

  if (mode === "import") {
    for (const f of PROVENANCE_FIELDS) {
      if (f in q) err(f, "must not be set in an import file (assigned when added to the bank)");
    }
  } else {
    if (!("id" in q)) err("id", "is required");
    else if (typeof q.id !== "string" || !ID_PATTERN.test(q.id)) err("id", `must match ${ID_PATTERN} (got ${JSON.stringify(q.id)})`);
    if (!isNonEmptyString(q.quiz)) err("quiz", "is required (non-empty string)");
    if (!("addedAt" in q)) err("addedAt", "is required");
    else if (typeof q.addedAt !== "string" || !ISO_DATE.test(q.addedAt) || Number.isNaN(Date.parse(q.addedAt))) {
      err("addedAt", `must be an ISO-8601 date string (got ${JSON.stringify(q.addedAt)})`);
    }
  }

  if (!QUESTION_TYPES.includes(q.type)) {
    err("type", `must be one of ${QUESTION_TYPES.join(", ")} (got ${JSON.stringify(q.type)})`);
  }
  if ("points" in q && !(typeof q.points === "number" && Number.isFinite(q.points) && q.points > 0)) {
    err("points", "must be a number > 0");
  }
  if (!isNonEmptyString(q.stem)) err("stem", "is required (non-empty string)");
  for (const f of ["explanation", "source"]) {
    if (f in q && typeof q[f] !== "string") err(f, "must be a string");
  }

  if (q.type === "single" || q.type === "multi") {
    for (const f of WRITTEN_FIELDS) if (f in q) err(f, `is not allowed on ${q.type} questions`);
    errors.push(...validateChoices(q, path));
  } else if (q.type === "written") {
    for (const f of CHOICE_FIELDS) if (f in q) err(f, "is not allowed on written questions");
    if (!isNonEmptyString(q.modelAnswer)) err("modelAnswer", "is required on written questions (non-empty string)");
    if ("wordLimit" in q && !isPositiveInteger(q.wordLimit)) err("wordLimit", "must be an integer > 0");
  }

  errors.push(...validateImages(q, path, ctx.imageExists));
  return errors;
}

function validateChoices(q, path) {
  const errors = [];
  const err = (field, msg) => errors.push(`${path}.${field}: ${msg}`);

  if ("shuffle" in q && typeof q.shuffle !== "boolean") err("shuffle", "must be a boolean");

  const keys = [];
  if (!Array.isArray(q.options)) {
    err("options", `is required on ${q.type} questions (array)`);
  } else {
    if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
      err("options", `must have ${MIN_OPTIONS}-${MAX_OPTIONS} options (got ${q.options.length})`);
    }
    q.options.forEach((o, i) => {
      const op = `options[${i}]`;
      if (!o || typeof o !== "object" || Array.isArray(o)) {
        err(op, "must be an object");
        return;
      }
      for (const k of Object.keys(o)) if (!OPTION_FIELDS.has(k)) err(`${op}.${k}`, "unknown field");
      const expected = optionKey(i);
      if (o.key !== expected) err(`${op}.key`, `must be "${expected}" (keys a, b, ... in order, no gaps; got ${JSON.stringify(o.key)})`);
      if (!isNonEmptyString(o.text)) err(`${op}.text`, "is required (non-empty string)");
      if (!isNonEmptyString(o.explanation)) err(`${op}.explanation`, "is required (non-empty string)");
      keys.push(o.key);
    });
  }

  if (!Array.isArray(q.answer)) {
    err("answer", `is required on ${q.type} questions (array of option keys)`);
  } else {
    if (q.type === "single" && q.answer.length !== 1) err("answer", `single questions need exactly 1 key (got ${q.answer.length})`);
    if (q.type === "multi" && q.answer.length < 1) err("answer", "multi questions need at least 1 key");
    if (new Set(q.answer).size !== q.answer.length) err("answer", "has duplicate keys");
    for (const k of q.answer) {
      if (!keys.includes(k)) err("answer", `key ${JSON.stringify(k)} is not an option key`);
    }
  }
  return errors;
}

function validateImages(q, path, imageExists) {
  const errors = [];
  for (const [field, text] of markdownFields(q, path)) {
    for (const p of imagePaths(text)) {
      const where = `${field}: image ${JSON.stringify(p)}`;
      if (!p.startsWith("images/") || p.slice("images/".length).includes("/") || p.includes("..")) {
        errors.push(`${where} must be images/<file>`);
        continue;
      }
      const file = p.slice("images/".length);
      if (/\s/.test(file)) {
        errors.push(`${where} file name contains a space`);
        continue;
      }
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      if (!file.includes(".") || !IMAGE_EXTENSIONS.includes(ext)) {
        errors.push(`${where} must have one of the extensions ${IMAGE_EXTENSIONS.join(" ")}`);
        continue;
      }
      if (imageExists && !imageExists(p)) errors.push(`${where} file not found`);
    }
  }
  return errors;
}

/**
 * Validate a whole bank file (I1).
 * opts.imageExists(path): whether `bank/<path>` exists.
 */
export function validateBank(json, { imageExists } = {}) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return ["bank: must be an object"];
  const errors = [];
  if (json.version !== 1) errors.push(`version: must be 1 (got ${JSON.stringify(json.version)})`);
  if (!isPositiveInteger(json.nextId)) errors.push(`nextId: must be an integer >= 1 (got ${JSON.stringify(json.nextId)})`);
  if (!Array.isArray(json.questions)) {
    errors.push("questions: must be an array");
    return errors;
  }

  const seen = new Map();
  let maxId = 0;
  json.questions.forEach((q, i) => {
    const path = `questions[${i}]`;
    errors.push(...validateQuestion(q, { path, imageExists, mode: "bank" }));
    if (q && typeof q.id === "string" && ID_PATTERN.test(q.id)) {
      if (seen.has(q.id)) errors.push(`${path}.id: duplicate id ${q.id} (also questions[${seen.get(q.id)}])`);
      else seen.set(q.id, i);
      maxId = Math.max(maxId, Number(q.id.slice(1)));
    }
  });
  if (isPositiveInteger(json.nextId) && json.nextId <= maxId) {
    errors.push(`nextId: must be greater than every question id number (${maxId}; got ${json.nextId})`);
  }
  return errors;
}
