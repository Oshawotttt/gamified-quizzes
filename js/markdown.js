// Small markdown renderer for bank text, ported from the quizzer quiz template.
// Supports: paragraphs, **bold**, *italic*, `code`, fenced code blocks,
// - / 1. lists, | tables |, and images ![alt](images/<file>) resolved against `base`.
// All other text, including raw HTML, is escaped.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function resolve(src, base) {
  if (!base || /^([a-z]+:|\/)/i.test(src)) return src;
  return `${base.replace(/\/$/, "")}/${src}`;
}

function inline(s, base) {
  return s
    .split(/(`[^`]*`)/)
    .map((part) => {
      if (/^`[^`]*`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      // Pull images out first so emphasis rules never touch their attributes.
      const images = [];
      const text = part.replace(IMAGE, (_, alt, src) => {
        images.push(`<img src="${escapeHtml(resolve(src, base))}" alt="${escapeHtml(alt)}" loading="lazy">`);
        return `\u0000${images.length - 1}\u0000`;
      });
      return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\u0000(\d+)\u0000/g, (_, i) => images[Number(i)]);
    })
    .join("");
}

const isBlockStart = (l) => /^(```|- |\d+\. |\|)/.test(l);
const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function renderMarkdown(src, { base = "" } = {}) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
    } else if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, ...body] = rows.filter((r) => !/^\|[\s:|-]+\|\s*$/.test(r));
      const th = cells(head).map((c) => `<th>${inline(c, base)}</th>`).join("");
      const trs = body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, base)}</td>`).join("")}</tr>`).join("");
      out.push(`<div class="scroll"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`);
    } else if (l.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((t) => `<li>${inline(t, base)}</li>`).join("")}</ul>`);
    } else if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ""));
      out.push(`<ol>${items.map((t) => `<li>${inline(t, base)}</li>`).join("")}</ol>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(" "), base)}</p>`);
    }
  }
  return out.join("");
}
