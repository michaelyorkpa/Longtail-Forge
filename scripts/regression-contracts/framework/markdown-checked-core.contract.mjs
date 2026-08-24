export const regressionMeta = Object.freeze({
  id: "framework.markdown-checked-core",
  area: "framework",
  tier: "release-gate",
  tags: ["content-safety", "contracts", "markdown", "security", "typecheck"],
  description: "Proves the shared Markdown core remains checked against explicit parser, token, preference, URL, and safe-output contracts.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { strictCleanOwnerProgram, strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const markdownPath = "src/core/markdown/markdown.service.js";
const markdownSource = await fs.readFile(markdownPath, "utf8");

assert.deepEqual(strictCleanOwnerState(markdownPath), { owned: true, diagnostics: 0 }, "the Markdown service must stay strict-clean in its checked program");
assert.equal(strictCleanOwnerProgram(markdownPath), "server-tests", "the Markdown service must stay in the strict server/tests program");
assert.doesNotMatch(markdownSource, /@ts-(?:ignore|expect-error)|@(?:type|param|returns?)\s*\{any\}|as unknown as/, "the Markdown service must not suppress or guess across its checked boundary");

for (const contract of [
  "MarkdownParser",
  "MarkdownParserOptions",
  "MarkdownRenderer",
  "MarkdownInlineState",
  "MarkdownToken",
  "MarkdownRenderMode",
  "MarkdownRenderPreferences",
  "MarkdownRenderEnvironment",
  "MarkdownRendererRule",
  "SanitizedMarkdownHtml",
]) {
  assert.match(markdownSource, new RegExp(`@typedef \\{[^\\n]+\\} ${contract}`), `the Markdown service must retain ${contract}`);
}

assert.match(markdownSource, /new Set\(\["http:", "https:", "mailto:"\]\)/, "the approved absolute URL schemes must stay bounded");
assert.match(markdownSource, /const SAFE_RELATIVE_PREFIXES = \["\.\/", "\.\.\/", "#"\]/, "the approved relative URL forms must stay bounded");
assert.match(markdownSource, /MarkdownIt\("commonmark", \{[\s\S]*html: false,[\s\S]*linkify: false,[\s\S]*typographer: false,[\s\S]*breaks: softLineBreaks,[\s\S]*\}\)\.enable\(\["table"\]\)/, "CommonMark and the approved parser features must stay explicit");
assert.match(markdownSource, /parser\.disable\(\["strikethrough"\]\)/, "unapproved strikethrough syntax must stay disabled");
assert.match(markdownSource, /parser\.validateLink = \(url\) => isSafeMarkdownUrl\(url\)/, "Markdown-it link validation must use the shared safe URL policy");
assert.match(markdownSource, /!env\?\.allowImages \|\| !isSafeMarkdownUrl\(src\)/, "images must require both consumer opt-in and a safe URL");
assert.match(markdownSource, /mode === MARKDOWN_RENDER_MODES\.USER_AUTHORED[\s\S]*renderMode === MARKDOWN_RENDER_MODES\.USER_AUTHORED/, "the established user-authored preference aliases must stay supported");
assert.match(markdownSource, /state\.md\.inline\.tokenize\(state\)/, "safe underline must continue through the parser token stream");
assert.match(markdownSource, /return applyTaskListMarkup\(html\)/, "safe rendered output must retain generated task-list markup");

console.log("Markdown checked-core regression passed.");
// Consolidated under framework.current-static-contracts by 0.33.33.11.
