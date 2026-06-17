import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  createMarkdownExcerpt,
  isSafeMarkdownUrl,
  markdownService,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
} from "../src/core/markdown/markdown.service.js";

const packageJson = JSON.parse(await readText("package.json"));
const packageLock = JSON.parse(await readText("package-lock.json"));
const roadmap = await readText("ROADMAP.md");
const changelog = await readText("CHANGELOG.md");
const contract = await readText("docs/markdown-platform-contract.md");
const regressionSuite = await readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.5.5", "package.json should carry the Markdown renderer slice version");
assert.equal(packageLock.version, "0.33.5.18.5.5", "package-lock root version should carry the Markdown renderer slice version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.5.5", "package-lock package metadata should carry the Markdown renderer slice version");
assert.equal(packageJson.dependencies["markdown-it"], "^14.2.0", "markdown-it should be installed as the selected Markdown dependency");

assert.equal(typeof markdownService.renderMarkdownToHtml, "function", "service should expose safe HTML rendering");
assert.equal(typeof markdownService.markdownToPlainText, "function", "service should expose plain-text conversion");
assert.equal(typeof markdownService.isSafeMarkdownUrl, "function", "service should expose safe URL validation");
assert.equal(normalizeMarkdownSource(" A \r\n B  "), "A\n B", "source normalization should preserve content while normalizing line endings");

const markdown = normalizeMarkdownSource(`
# Heading

Paragraph with **strong**, *emphasis*, [safe link](https://example.com/path), and \`inline code\`.

> Quote

- Parent
  - Child
    1. Ordered child
- [ ] Open task
- [x] Done task

1. First
   - Nested unordered

| Name | Status |
| --- | --- |
| Alpha | Ready |

\`\`\`js
const value = 1;
\`\`\`
`);

const html = renderMarkdownToHtml(markdown);
assert.match(html, /<h1>Heading<\/h1>/, "headings should render");
assert.match(html, /<strong>strong<\/strong>/, "strong text should render");
assert.match(html, /<em>emphasis<\/em>/, "emphasis should render");
assert.match(html, /<a href="https:\/\/example\.com\/path">safe link<\/a>/, "safe links should render");
assert.match(html, /<blockquote>\s*<p>Quote<\/p>\s*<\/blockquote>/, "blockquotes should render");
assert.match(html, /<ul>\s*<li>Parent\s*<ul>\s*<li>Child\s*<ol>\s*<li>Ordered child<\/li>/, "nested mixed lists should render");
assert.match(html, /<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled> Open task<\/li>/, "open task-list items should render disabled checkboxes without the regular list marker");
assert.match(html, /<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled checked> Done task<\/li>/, "checked task-list items should render disabled checked checkboxes without the regular list marker");
assert.match(html, /<table>[\s\S]*<th>Name<\/th>[\s\S]*<td>Alpha<\/td>[\s\S]*<\/table>/, "tables should render");
assert.match(html, /<pre><code class="language-js">const value = 1;\n<\/code><\/pre>/, "fenced code blocks should render");

const unsafe = renderMarkdownToHtml(`
<script>alert(1)</script>
[bad](javascript:alert(1))
![bad](data:text/html,evil)
<img src=x onerror=alert(1)>
~~not enabled~~
`);
assert.doesNotMatch(unsafe, /<script|<img|href="javascript:|src="data:|<[^>]+\son[a-z]+=/i, "unsafe input should not render active HTML, event handlers, scriptable links, or unsafe images");
assert.match(unsafe, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "raw HTML should be escaped rather than executed");
assert.match(unsafe, /<p>[\s\S]*bad[\s\S]*bad[\s\S]*<\/p>/, "unsafe links and images should degrade to plain text");
assert.doesNotMatch(unsafe, /\[bad\]\(|!\[bad\]\(/, "unsafe links and images should not preserve Markdown URL syntax");
assert.match(unsafe, /bad/, "unsafe images should degrade to alt text");
assert.match(unsafe, /~~not enabled~~/, "unapproved strikethrough should remain plain text");

const imageHtml = renderMarkdownToHtml("![Logo](/assets/logo.png)", { allowImages: true });
assert.match(imageHtml, /<img src="\/assets\/logo\.png" alt="Logo">/, "safe images should render only when explicitly allowed");
assert.equal(isSafeMarkdownUrl("https://example.com"), true);
assert.equal(isSafeMarkdownUrl("mailto:user@example.com"), true);
assert.equal(isSafeMarkdownUrl("/safe/path"), true);
assert.equal(isSafeMarkdownUrl("#section"), true);
assert.equal(isSafeMarkdownUrl("javascript:alert(1)"), false);
assert.equal(isSafeMarkdownUrl("data:text/html,evil"), false);

const plain = markdownToPlainText(markdown);
for (const expected of ["Heading", "strong", "emphasis", "safe link", "inline code", "Quote", "Parent", "Child", "Ordered child", "Open task", "Done task", "Alpha", "Ready", "const value = 1;"]) {
  assert.match(plain, new RegExp(escapeRegExp(expected)), `plain text should include ${expected}`);
}
assert.doesNotMatch(plain, /[#*_`|]|\[x\]|\[ \]/, "plain text should not expose Markdown control syntax");
assert.equal(createMarkdownExcerpt(markdown, 30), "Heading Paragraph with strong...", "excerpts should come from the parser-backed plain text path");

for (const item of [
  "Add the selected Markdown dependency and wire it through a framework-owned service, for example",
  "Render Markdown to sanitized HTML using the approved syntax contract.",
  "Raw HTML.",
  "Script/event attributes.",
  "`javascript:` and other unsafe URLs.",
  "Unsafe image sources if images are allowed.",
  "Add a plain-text/excerpt conversion path that uses the same parser contract instead of",
  "Nested ordered and unordered lists.",
  "Mixed ordered/unordered list nesting.",
  "Two-space and four-space indentation behavior.",
  "Task lists if approved.",
  "Tables if approved.",
  "Code fences, inline code, blockquotes, links, and unsafe input.",
  "Keep the service independent of Notes, Help, and future Knowledge Base business rules.",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(item)}`), `Roadmap item should be checked: ${item}`);
}

assert.match(changelog, /## Version 0\.33\.5\.17\.2 - /, "changelog should include the renderer service slice");
assert.match(contract, /0\.33\.5\.17\.2 adds the dependency and service/, "contract should note the renderer service implementation");
assert.match(regressionSuite, /scripts\/markdown-renderer-service-regression\.mjs/, "regression suite should include the Markdown renderer service regression");

console.log("Markdown renderer service regression passed.");

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
