import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../js/markdown.js";

test("images resolve against the bank folder", () => {
  const html = renderMarkdown("![x](images/a.png)", { base: "bank" });
  assert.match(html, /<img [^>]*src="bank\/images\/a\.png"/);
  assert.match(html, /<img [^>]*alt="x"/);
});

test("raw HTML is escaped", () => {
  const html = renderMarkdown("Hi <script>alert(1)</script> & bye", { base: "bank" });
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; bye/);
});

test("image alt text is escaped", () => {
  const html = renderMarkdown('![a"onerror="x](images/a.png)', { base: "bank" });
  assert.ok(!html.includes('"onerror="'));
});

test("tables render, inside a scroll wrapper", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | **2** |", { base: "bank" });
  assert.equal(
    html,
    '<div class="scroll"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div>',
  );
});

test("fenced code blocks render and keep their text escaped", () => {
  const html = renderMarkdown("```c\nif (a < b) x = 1;\n```", { base: "bank" });
  assert.equal(html, "<pre><code>if (a &lt; b) x = 1;</code></pre>");
});

test("paragraphs, emphasis, inline code and lists", () => {
  assert.equal(renderMarkdown("Hello *there* `x<y`"), "<p>Hello <em>there</em> <code>x&lt;y</code></p>");
  assert.equal(renderMarkdown("- one\n- two"), "<ul><li>one</li><li>two</li></ul>");
  assert.equal(renderMarkdown("1. one\n2. two"), "<ol><li>one</li><li>two</li></ol>");
});

test("CRLF line endings render like LF", () => {
  assert.equal(renderMarkdown("- one\r\n- two"), "<ul><li>one</li><li>two</li></ul>");
});
