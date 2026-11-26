// DOM wiring for the quiz page. All quiz logic lives in session.js and the
// modules it uses; this file only renders state and forwards clicks.
import { createProgressStore, bankStats } from "./progress.js";
import { pickNext } from "./select.js";
import { createSession, SELF_MARKS } from "./session.js";
import { renderMarkdown, escapeHtml } from "./markdown.js";
import { optionKey } from "./bank.js";
import { questionPoints } from "./marking.js";

const BANK_URL = "banks/cs203/bank.json";
const IMAGE_BASE = "banks/cs203";
const STATUS_LABELS = { unseen: "Unseen", wrong: "Wrong", partial: "Partial", guessed: "Guessed", right: "Right", shown: "Shown" };
const MARK_LABELS = {
  "correct-ticked": "✔ Correct, you ticked it",
  "correct-missed": "✔ Correct, you missed it",
  "wrong-ticked": "✘ Wrong, you ticked it",
  "wrong-unticked": "Wrong, left unticked",
};

const NEXT_BUTTONS = {
  "next-guessed": '<button type="button" id="btnNextGuessed">Next (I guessed)</button>',
  next: '<button type="button" class="primary" id="btnNext">Next</button>',
  "next-right": '<button type="button" class="primary" id="btnNext-right">Next (correct)</button>',
  "next-wrong": '<button type="button" id="btnNext-wrong">Next (wrong)</button>',
  "next-partial": '<button type="button" id="btnNext-partial">Next (partial)</button>',
};

const $ = (sel) => document.querySelector(sel);
const md = (text) => `<div class="md">${renderMarkdown(text, { base: IMAGE_BASE })}</div>`;
const words = (s) => (s.trim().match(/\S+/g) || []).length;
const fmt = (n) => n.toFixed(2);
const wordLimit = (q) => q.wordLimit ?? 250;
const inputKind = (q) => (q.type === "multi" ? "checkbox" : "radio");

/** localStorage, or an in-memory stand-in when the browser blocks it (e.g. private mode). */
function pageStorage() {
  try {
    const probe = "gamified-quizzes.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  }
}

const store = createProgressStore(pageStorage());
let session = null;

// Ask the browser not to evict our storage (helps on iOS when added to the Home Screen).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Before the bank loads (or if it fails to load), counts cover no questions.
const stats = () => (session ? session.stats() : bankStats([], store.all()));

function renderCounts() {
  const s = stats();
  $("#counts").innerHTML =
    `<span><b>${s.total}</b> questions</span>` +
    Object.entries(STATUS_LABELS).map(([k, label]) => `<span>${label} <b>${s[k]}</b></span>`).join("");
}

function typeTag(q) {
  if (q.type === "multi") return '<span class="tag multi">Select all that apply</span>';
  if (q.type === "single") return '<span class="tag">Choose one</span>';
  return `<span class="tag">Written · about ${wordLimit(q)} words</span>`;
}

function header(q) {
  const pts = questionPoints(q);
  return `<div class="meta">${typeTag(q)}<span>${pts} ${pts === 1 ? "pt" : "pts"}</span><span>${escapeHtml(q.id)}</span></div>${md(q.stem)}`;
}

function renderQuestion(view) {
  const q = view.question;
  const root = $("#quiz");
  const byKey = new Map((q.options ?? []).map((o) => [o.key, o]));
  let body;
  if (q.type === "written") {
    body = `<textarea id="answer" placeholder="Type your answer (optional, not saved)…" aria-label="Your answer"></textarea><div class="wc" id="wc"></div>`;
  } else {
    body = `<div class="opts">${view.shownOptions
      .map((key, i) => `<label class="opt"><input type="${inputKind(q)}" name="opt" value="${escapeHtml(key)}"><span class="l">${optionKey(i)}.</span><span class="body">${md(byKey.get(key).text)}</span></label>`)
      .join("")}</div>`;
  }
  const submitLabel = q.type === "written" ? "Review answer" : "Submit";
  root.innerHTML = `${header(q)}${body}<div class="actions"><button type="button" class="primary" id="btnSubmit" disabled>${submitLabel}</button></div>`;

  const submit = $("#btnSubmit");
  let response;
  if (q.type === "written") {
    const ta = $("#answer");
    const limit = wordLimit(q);
    const update = () => {
      const n = words(ta.value);
      $("#wc").textContent = `${n} / ${limit} words${n > limit ? " (over the guide)" : ""}`;
      $("#wc").classList.toggle("over", n > limit);
      submit.disabled = false; // writing is optional: the model answer can be revealed straight away
      response = { text: ta.value };
    };
    ta.addEventListener("input", update);
    update();
  } else {
    const inputs = [...root.querySelectorAll(".opt input")];
    const update = () => {
      for (const inp of inputs) inp.closest(".opt").classList.toggle("sel", inp.checked);
      const selected = inputs.filter((i) => i.checked).map((i) => i.value);
      submit.disabled = selected.length === 0;
      response = { selected };
    };
    for (const inp of inputs) inp.addEventListener("change", update);
    update();
  }
  submit.addEventListener("click", () => {
    if (submit.disabled) return;
    try {
      session.submit(response);
    } catch (err) {
      // e.g. storage full: say so instead of silently doing nothing.
      alert(`Could not save this answer: ${err.message}`);
      return;
    }
    render();
  });
}

function renderFeedback(view) {
  const q = view.question;
  const r = view.result;
  const byKey = new Map((q.options ?? []).map((o) => [o.key, o]));
  let body;
  if (q.type === "written") {
    body =
      `<div class="compare"><div><h3>Your answer</h3><div class="yours">${view.response.text.trim() ? escapeHtml(view.response.text) : '<span class="muted">(nothing written)</span>'}</div></div>` +
      `<div><h3>Model answer</h3>${md(q.modelAnswer)}</div></div>`;
  } else {
    const ticked = new Set(view.response.selected);
    body =
      `<div class="opts locked">${view.shownOptions
        .map((key, i) => {
          const o = byKey.get(key);
          const state = r.options[key];
          return `<div class="opt ${state}"><input type="${inputKind(q)}" disabled ${ticked.has(key) ? "checked" : ""} aria-hidden="true"><span class="l">${optionKey(i)}.</span><span class="body">${md(o.text)}<span class="mark ${state}">${MARK_LABELS[state]}</span><div class="why">${md(o.explanation)}</div></span></div>`;
        })
        .join("")}</div>` +
      `<div class="result ${r.outcome}">Score <strong>${fmt(r.score)} / ${fmt(r.max)}</strong> · ${r.outcome}</div>`;
  }
  const extra =
    (q.explanation ? `<h3>Explanation</h3>${md(q.explanation)}` : "") +
    (q.source ? `<h3>Source</h3><p class="source">${escapeHtml(q.source)}</p>` : "");
  const buttons = session
    .buttons()
    .map((b) => NEXT_BUTTONS[b])
    .join("");
  $("#quiz").innerHTML = `${header(q)}${body}${extra ? `<div class="extra">${extra}</div>` : ""}<div class="actions">${buttons}</div>`;

  const go = (opts) => {
    try {
      session.next(opts);
    } catch (err) {
      alert(`Could not save this answer: ${err.message}`);
      return;
    }
    render();
    window.scrollTo(0, 0);
  };
  $("#btnNext")?.addEventListener("click", () => go({ guessed: false }));
  $("#btnNextGuessed")?.addEventListener("click", () => go({ guessed: true }));
  for (const mark of SELF_MARKS) $(`#btnNext-${mark}`)?.addEventListener("click", () => go({ mark }));
}

function render() {
  renderCounts();
  const view = session.current();
  if (view.state === "empty") $("#quiz").innerHTML = '<p class="muted">The question bank is empty.</p>';
  else if (view.state === "question") renderQuestion(view);
  else renderFeedback(view);
}

/* ---------- stats screen ---------- */

function daysAgo(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function renderStats(message = "", isError = false) {
  const s = stats();
  $("#statTable").innerHTML =
    `<tbody><tr><td>Questions in bank</td><td>${s.total}</td></tr>` +
    Object.entries(STATUS_LABELS).map(([k, label]) => `<tr><td>${label}</td><td>${s[k]}</td></tr>`).join("") +
    `<tr><td>Attempts recorded</td><td>${store.all().length}</td></tr></tbody>`;
  $("#lastExport").textContent = `Last export: ${daysAgo(store.lastExportAt())}`;
  $("#statsMsg").textContent = message;
  $("#statsMsg").classList.toggle("error", isError);
}

function showStats(show) {
  $("#stats").hidden = !show;
  $("#quiz").hidden = show;
  $("#btnStats").setAttribute("aria-expanded", String(show));
  $("#btnStats").textContent = show ? "Quiz" : "Stats";
  if (show) renderStats();
  else if (session) render();
  window.scrollTo(0, 0);
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireStats() {
  $("#btnStats").addEventListener("click", () => showStats($("#stats").hidden));
  $("#btnBack").addEventListener("click", () => showStats(false));
  $("#btnExport").addEventListener("click", () => {
    const now = new Date();
    download(`gamified-quizzes-progress-${now.toISOString().slice(0, 10)}.json`, store.exportJson(now));
    renderStats("Progress exported.");
  });
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("Replace the progress on this device with the progress in this file?")) return;
    try {
      store.importJson(await file.text());
      session?.restart();
      renderCounts();
      renderStats(`Imported ${store.all().length} attempts.`);
    } catch (err) {
      renderStats(`Import failed: ${err.message}`, true);
    }
  });
  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Delete all progress on this device? Export first if you want a backup.")) return;
    store.reset();
    session?.restart();
    renderCounts();
    renderStats("Progress reset.");
  });
}

async function start() {
  wireStats(); // Export/Import/Reset stay usable even if the bank fails to load.
  let bank;
  try {
    const res = await fetch(BANK_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bank = await res.json();
  } catch (err) {
    $("#quiz").innerHTML = `<p class="msg error">Could not load the question bank (${escapeHtml(err.message)}).</p>`;
    return;
  }
  session = createSession({ questions: bank.questions, store, pick: pickNext, now: () => new Date(), rng: Math.random });
  render();
}

start();
