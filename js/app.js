// DOM wiring for the quiz page. All quiz logic lives in session.js and the
// modules it uses; this file only renders state and forwards clicks.
import { createProgressStore } from "./progress.js";
import { pickNext } from "./select.js";
import { createSession } from "./session.js";
import { renderMarkdown, escapeHtml } from "./markdown.js";

const BANK_URL = "bank/bank.json";
const IMAGE_BASE = "bank";
const STATUS_LABELS = { unseen: "Unseen", wrong: "Wrong", partial: "Partial", guessed: "Guessed", right: "Right", shown: "Shown" };
const MARK_LABELS = {
  "correct-ticked": "✔ Correct, you ticked it",
  "correct-missed": "✔ Correct, you missed it",
  "wrong-ticked": "✘ Wrong, you ticked it",
  "wrong-unticked": "Wrong, left unticked",
};

const $ = (sel) => document.querySelector(sel);
const md = (text) => `<div class="md">${renderMarkdown(text, { base: IMAGE_BASE })}</div>`;
const letter = (i) => String.fromCharCode(97 + i);
const words = (s) => (s.trim().match(/\S+/g) || []).length;
const fmt = (n) => n.toFixed(2);

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

function renderCounts() {
  const s = session.stats();
  $("#counts").innerHTML =
    `<span><b>${s.total}</b> questions</span>` +
    Object.entries(STATUS_LABELS).map(([k, label]) => `<span>${label} <b>${s[k]}</b></span>`).join("");
}

function typeTag(q) {
  if (q.type === "multi") return '<span class="tag multi">Select all that apply</span>';
  if (q.type === "single") return '<span class="tag">Choose one</span>';
  return `<span class="tag">Written · about ${q.wordLimit ?? 250} words</span>`;
}

function header(q) {
  const pts = q.points ?? 1;
  return `<div class="meta">${typeTag(q)}<span>${pts} ${pts === 1 ? "pt" : "pts"}</span><span>${escapeHtml(q.id)}</span></div>${md(q.stem)}`;
}

function renderQuestion(view) {
  const q = view.question;
  const root = $("#quiz");
  const byKey = new Map((q.options ?? []).map((o) => [o.key, o]));
  let body;
  if (q.type === "written") {
    body = `<textarea id="answer" placeholder="Type your answer…" aria-label="Your answer"></textarea><div class="wc" id="wc"></div>`;
  } else {
    const kind = q.type === "multi" ? "checkbox" : "radio";
    body = `<div class="opts">${view.shownOptions
      .map((key, i) => `<label class="opt"><input type="${kind}" name="opt" value="${escapeHtml(key)}"><span class="l">${letter(i)}.</span><span class="body">${md(byKey.get(key).text)}</span></label>`)
      .join("")}</div>`;
  }
  root.innerHTML = `${header(q)}${body}<div class="actions"><button type="button" class="primary" id="btnSubmit" disabled>Submit</button></div>`;

  const submit = $("#btnSubmit");
  let response;
  if (q.type === "written") {
    const ta = $("#answer");
    const limit = q.wordLimit ?? 250;
    const update = () => {
      const n = words(ta.value);
      $("#wc").textContent = `${n} / ${limit} words${n > limit ? " (over the guide)" : ""}`;
      $("#wc").classList.toggle("over", n > limit);
      submit.disabled = !ta.value.trim();
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
    session.submit(response);
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
      `<div class="compare"><div><h3>Your answer</h3><div class="yours">${escapeHtml(view.response.text)}</div></div>` +
      `<div><h3>Model answer</h3>${md(q.modelAnswer)}</div></div>`;
  } else {
    const kind = q.type === "multi" ? "checkbox" : "radio";
    const ticked = new Set(view.response.selected);
    body =
      `<div class="opts locked">${view.shownOptions
        .map((key, i) => {
          const o = byKey.get(key);
          const state = r.options[key];
          return `<div class="opt ${state}"><input type="${kind}" disabled ${ticked.has(key) ? "checked" : ""} aria-hidden="true"><span class="l">${letter(i)}.</span><span class="body">${md(o.text)}<span class="mark ${state}">${MARK_LABELS[state]}</span><div class="why">${md(o.explanation)}</div></span></div>`;
        })
        .join("")}</div>` +
      `<div class="result ${r.outcome}">Score <strong>${fmt(r.score)} / ${fmt(r.max)}</strong> · ${r.outcome}</div>`;
  }
  const extra =
    (q.explanation ? `<h3>Explanation</h3>${md(q.explanation)}` : "") +
    (q.source ? `<h3>Source</h3><p class="source">${escapeHtml(q.source)}</p>` : "");
  const buttons = session
    .buttons()
    .map((b) =>
      b === "next-guessed"
        ? '<button type="button" id="btnNextGuessed">Next (I guessed)</button>'
        : '<button type="button" class="primary" id="btnNext">Next</button>',
    )
    .join("");
  $("#quiz").innerHTML = `${header(q)}${body}${extra ? `<div class="extra">${extra}</div>` : ""}<div class="actions">${buttons}</div>`;

  const go = (guessed) => {
    session.next({ guessed });
    render();
    window.scrollTo(0, 0);
  };
  $("#btnNext").addEventListener("click", () => go(false));
  $("#btnNextGuessed")?.addEventListener("click", () => go(true));
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
  const s = session.stats();
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
  else render();
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
      renderCounts();
      renderStats(`Imported ${store.all().length} attempts.`);
    } catch (err) {
      renderStats(`Import failed: ${err.message}`, true);
    }
  });
  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Delete all progress on this device? Export first if you want a backup.")) return;
    store.reset();
    renderCounts();
    renderStats("Progress reset.");
  });
}

async function start() {
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
  wireStats();
  render();
}

start();
