// Progress store (I4): an append-only list of attempts kept in localStorage,
// one list per bank, plus the per-question status and bank counts derived from it.

// Prefixed: every oshawotttt.github.io project site shares one origin and one localStorage.
export const progressKey = (bankId) => `gamified-quizzes.progress.v1.${bankId}`;
export const corruptKey = (bankId) => `gamified-quizzes.progress.corrupt.${bankId}`;

// Progress from before banks existed belongs to the original bank.
export const LEGACY_PROGRESS_KEY = "gamified-quizzes.progress.v1";
const LEGACY_BANK_ID = "cs203";

export const OUTCOMES = ["right", "partial", "wrong", "shown"];
export const STATUSES = ["unseen", "wrong", "partial", "guessed", "right", "shown"];

const emptyState = () => ({ version: 1, lastExportAt: null, attempts: [] });

function attemptError(a, i) {
  const at = `attempts[${i}]`;
  if (!a || typeof a !== "object" || Array.isArray(a)) return `${at}: must be an object`;
  if (typeof a.qid !== "string" || a.qid === "") return `${at}.qid: must be a non-empty string`;
  if (typeof a.at !== "string" || Number.isNaN(Date.parse(a.at))) return `${at}.at: must be an ISO-8601 string`;
  if (!(a.score === null || (typeof a.score === "number" && Number.isFinite(a.score)))) return `${at}.score: must be a number or null`;
  if (!(typeof a.max === "number" && Number.isFinite(a.max))) return `${at}.max: must be a number`;
  if (!OUTCOMES.includes(a.outcome)) return `${at}.outcome: must be one of ${OUTCOMES.join(", ")}`;
  if (typeof a.guessed !== "boolean") return `${at}.guessed: must be a boolean`;
  if (!a.response || typeof a.response !== "object" || Array.isArray(a.response)) return `${at}.response: must be an object`;
  return null;
}

/** First problem with a progress object, or null when it has the I4 shape. */
export function progressError(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return "progress: must be an object";
  if (json.version !== 1) return `version: must be 1 (got ${JSON.stringify(json.version)})`;
  if (!(json.lastExportAt === null || typeof json.lastExportAt === "string")) return "lastExportAt: must be a string or null";
  if (!Array.isArray(json.attempts)) return "attempts: must be an array";
  for (let i = 0; i < json.attempts.length; i++) {
    const e = attemptError(json.attempts[i], i);
    if (e) return e;
  }
  return null;
}

function parseJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${e.message}`);
  }
  return json;
}

function parseProgress(text) {
  return toState(parseJson(text));
}

function toState(json) {
  const problem = progressError(json);
  if (problem) throw new Error(`Not a progress file: ${problem}`);
  return { version: 1, lastExportAt: json.lastExportAt, attempts: json.attempts };
}

/** Move pre-bank progress to the original bank's key, once. */
function migrateLegacy(storage, key) {
  const legacy = storage.getItem(LEGACY_PROGRESS_KEY);
  if (legacy === null || storage.getItem(key) !== null) return;
  storage.setItem(key, legacy);
  storage.removeItem(LEGACY_PROGRESS_KEY);
}

/**
 * storage: anything with getItem/setItem/removeItem (window.localStorage in the page).
 * bankId: the bank this progress belongs to; each bank has its own key.
 */
export function createProgressStore(storage, bankId) {
  if (typeof bankId !== "string" || bankId === "") throw new Error("createProgressStore needs a bank id");
  const key = progressKey(bankId);
  if (bankId === LEGACY_BANK_ID) migrateLegacy(storage, key);

  let state = emptyState();
  const raw = storage.getItem(key);
  if (raw !== null) {
    try {
      state = parseProgress(raw);
    } catch {
      // Keep the unreadable text so it can be recovered by hand; start empty.
      storage.setItem(corruptKey(bankId), raw);
    }
  }

  const save = () => storage.setItem(key, JSON.stringify(state));

  return {
    all: () => state.attempts.map((a) => ({ ...a })),
    record(attempt) {
      const e = attemptError(attempt, state.attempts.length);
      if (e) throw new Error(e);
      state.attempts.push({ ...attempt });
      save();
      return state.attempts.length - 1;
    },
    setGuessed(index, guessed) {
      if (!state.attempts[index]) throw new Error(`No attempt at index ${index}`);
      state.attempts[index].guessed = Boolean(guessed);
      save();
    },
    exportJson(now) {
      state.lastExportAt = now instanceof Date ? now.toISOString() : String(now);
      save();
      return JSON.stringify({ version: state.version, bank: bankId, lastExportAt: state.lastExportAt, attempts: state.attempts }, null, 2);
    },
    lastExportAt: () => state.lastExportAt,
    importJson(text) {
      const json = parseJson(text);
      // An export from before banks existed has no bank field; it fits any bank.
      if (json && typeof json === "object" && "bank" in json && json.bank !== bankId) {
        throw new Error(`This progress file is for bank ${JSON.stringify(json.bank)}, not ${JSON.stringify(bankId)}`);
      }
      state = toState(json);
      save();
    },
    reset() {
      state = emptyState();
      storage.removeItem(key);
    },
  };
}

function statusOf(latest) {
  if (!latest) return "unseen";
  if (latest.guessed && latest.outcome !== "wrong") return "guessed";
  return latest.outcome;
}

function latestByQid(attempts) {
  const latest = new Map();
  for (const a of attempts) latest.set(a.qid, a); // append-only: later entries are newer
  return latest;
}

export function questionStatus(qid, attempts) {
  return statusOf(latestByQid(attempts).get(qid));
}

/** Status for every id in questionIds, as a Map. Attempts for other qids are ignored. */
export function statusMap(questionIds, attempts) {
  const latest = latestByQid(attempts);
  return new Map(questionIds.map((id) => [id, statusOf(latest.get(id))]));
}

export function bankStats(questionIds, attempts) {
  const stats = { total: questionIds.length, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
  for (const status of statusMap(questionIds, attempts).values()) stats[status]++;
  return stats;
}
