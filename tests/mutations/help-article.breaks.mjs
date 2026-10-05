import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/help.js";
const suites = ["tests/unit/help-article-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "function helpRecord(value) {",
    "// @ts-expect-error deliberately added\nfunction helpRecord(value) {"],
  ["a fourth document query appears",
    "function helpRecord(value) {",
    'function helpNode(selector) {\n  return document.querySelector(selector);\n}\n\nfunction helpRecord(value) {'],
  ["a server payload type is restated in the browser program",
    " * @typedef {Record<string, unknown>} HelpRecord",
    ' * @typedef {import("../../src/types/help-static-contracts.js").HelpSectionPayload} HelpRecord'],

  // --- the wire-record readers ----------------------------------------------------------------------
  ["a primitive is taken as a record",
    '  return typeof value === "object" && value !== null && !Array.isArray(value)',
    "  return value !== null && value !== undefined"],
  ["an array is taken as a record",
    'typeof value === "object" && value !== null && !Array.isArray(value)',
    'typeof value === "object" && value !== null'],
  ["a malformed list entry is dropped instead of left for the normalizers",
    "  return entries.map((entry) => helpRecord(entry) || {});",
    "  return entries.map((entry) => helpRecord(entry)).filter(Boolean);"],
  ["a value that is not a list becomes a one-entry list",
    "  const entries = Array.isArray(value) ? value : [];\n  return entries.map((entry) => helpRecord(entry) || {});",
    "  const entries = Array.isArray(value) ? value : [value];\n  return entries.map((entry) => helpRecord(entry) || {});"],
  ["a falsy member reaches its own spelling rather than the empty string",
    '  return String(value || "");',
    '  return String(value ?? "");'],
  ["a member stops being read as text at all",
    '  return String(value || "");',
    "  return value;"],

  // --- section and article normalization ------------------------------------------------------------------
  ["an entry with no title survives normalization",
    "    .filter((section) => section.id && section.title)",
    "    .filter((section) => section.id)"],
  ["an entry with no id survives normalization",
    "    .filter((article) => article.id && article.title)",
    "    .filter((article) => article.title)"],
  ["sections stop being ordered by their declared order",
    "    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||\n      left.title.localeCompare(right.title));\n}\n\n/** @param {unknown} [articles] @returns {HelpArticle[]} */",
    "    .sort((left, right) => left.title.localeCompare(right.title));\n}\n\n/** @param {unknown} [articles] @returns {HelpArticle[]} */"],
  ["sections with the same order stop being ordered by title",
    "Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||\n      left.title.localeCompare(right.title));\n}\n\n/** @param {unknown} [articles] @returns {HelpArticle[]} */",
    "Number(left.sortOrder || 0) - Number(right.sortOrder || 0));\n}\n\n/** @param {unknown} [articles] @returns {HelpArticle[]} */"],
  ["articles stop being ordered at all",
    "    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||\n      left.title.localeCompare(right.title));\n}\n\n/**\n * **The entries are passed on raw",
    "    .sort(() => 0);\n}\n\n/**\n * **The entries are passed on raw"],
  ["an absent owner stops defaulting to module",
    '      ownerType: helpText(section.ownerType) || "module",',
    "      ownerType: helpText(section.ownerType),"],
  ["an article summary stops falling back to its description",
    "      summary: helpText(article.summary || article.description),",
    "      summary: helpText(article.summary),"],
  ["a description is taken as the summary even when one was sent",
    "      summary: helpText(article.summary || article.description),",
    "      summary: helpText(article.description || article.summary),"],
  ["a tag list that is not a list is carried anyway",
    "      tags: /** @type {readonly unknown[]} */ (Array.isArray(article.tags) ? article.tags : []),",
    "      tags: /** @type {readonly unknown[]} */ (article.tags || []),"],
  ["a sort order that is not a number becomes one anyway",
    "      sortOrder: Number(section.sortOrder || 0),",
    "      sortOrder: 0,"],

  // --- navigation normalization -------------------------------------------------------------------------------
  ["a malformed navigation entry becomes an untitled group instead of being dropped",
    "  const entries = Array.isArray(items) ? items : [];",
    "  const entries = helpRecordList(items);"],
  ["a malformed entry stops being refused at the item reader",
    "  const entry = helpRecord(item);\n\n  if (!entry) {\n    return null;\n  }",
    "  const entry = helpRecord(item) || {};\n\n  if (!entry) {\n    return null;\n  }"],
  ["an article entry naming no known article is kept",
    "    if (!article) {\n      return null;\n    }",
    "    if (!article) {\n      return navigationArticle({ id: String(entry.id || \"\") });\n    }"],
  ["an article entry stops being resolved by its slug",
    '    const article = findArticle(entry.id || entry.slug || "");',
    '    const article = findArticle(entry.id || "");'],
  ["the entry's own title stops overriding the article's",
    "      title: helpText(entry.title) || article.title,",
    "      title: article.title,"],
  ["an entry with no title of its own loses the article's",
    "      title: helpText(entry.title) || article.title,",
    "      title: helpText(entry.title),"],
  ["an unrecognised type is taken as an article",
    '  const type = entry.type === "article" ? "article" : "group";',
    '  const type = entry.type === "group" ? "group" : "article";'],
  ["an untitled group loses its fallback title",
    '    title: helpText(entry.title) || "Help",',
    "    title: helpText(entry.title),"],
  ["a group stops normalizing its children",
    "  const children = normalizeNavigation(entry.children);",
    "  const children = [];"],
  ["an article entry loses its title fallback",
    '    title: article.title || "Untitled article",',
    "    title: article.title,"],
  ["an article entry loses its owner default",
    '    ownerType: article.ownerType || "module",',
    "    ownerType: article.ownerType,"],

  // --- the section fallback navigation ------------------------------------------------------------------------------
  ["an article whose section is unknown is lost instead of collected",
    "    const section = sectionsById.get(article.sectionId) || fallbackSection;",
    "    const section = sectionsById.get(article.sectionId);\n    if (!section) continue;"],
  ["a section with no articles is still offered",
    "    .filter((section) => section.articles.length > 0)",
    "    .filter(() => true)"],
  ["the fallback groups stop being ordered",
    "    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||\n      String(left.title || \"\").localeCompare(String(right.title || \"\")))",
    "    .sort(() => 0)"],
  ["the fallback group loses its title",
    '      title: section.title || "Help",',
    "      title: section.title,"],

  // --- group expansion -------------------------------------------------------------------------------------------------------
  ["a group holding the selected article starts collapsed",
    "  if (navigationItemContainsArticle(item, state.selectedArticleId)) {\n    return true;\n  }",
    "  if (false) {\n    return true;\n  }"],
  ["every nested group starts collapsed",
    "  if (depth !== 1) {\n    return true;\n  }",
    "  if (depth !== 1) {\n    return false;\n  }"],
  ["every top-level group starts expanded",
    "  if (depth !== 1) {\n    return true;\n  }",
    "  return true;\n  if (depth !== 1) {\n    return true;\n  }"],
  ["the framework group is matched case-sensitively",
    '  return normalizeNavigationTitle(item.title) === "longtail forge";',
    '  return String(item.title || "") === "longtail forge";'],
  ["the framework group title stops being trimmed",
    "  return helpText(title).trim().toLowerCase();",
    "  return helpText(title).toLowerCase();"],
  ["a containing entry stops being matched by slug",
    "  if (item.id === articleId || item.slug === articleId) {",
    "  if (item.id === articleId) {"],
  ["the search stops descending into children",
    '  return (item.type === "group" ? item.children || [] : []).some((child) => navigationItemContainsArticle(child, articleId));',
    "  return false;"],
  ["an empty selection matches the first entry",
    "  if (!articleId || !item) {\n    return false;\n  }",
    "  if (!item) {\n    return false;\n  }"],

  // --- source labels -------------------------------------------------------------------------------------------------------
  ["a framework article is labelled by its module id",
    '  if (article.ownerType === "framework") {\n    return "Framework";\n  }\n\n  return helpText(article.moduleId) || "Module";',
    '  return helpText(article.moduleId) || "Module";'],
  ["an unowned article loses its fallback label",
    '  return helpText(article.moduleId) || "Module";',
    "  return helpText(article.moduleId);"],
  ["the label the response carried stops being preferred",
    "  const source = helpText(article.sourceLabel) || sourceLabel(article);",
    "  const source = sourceLabel(article);"],
  ["a framework article stops being marked as framework help",
    '  if (article.ownerType === "framework") {\n    parts.push("Framework help");\n  } else if (article.moduleId) {\n    parts.push("Module help");\n  }',
    '  if (article.moduleId) {\n    parts.push("Module help");\n  }'],
  // **Withdrawn, and inert for a real reason.** `sourceLabel` cannot answer an empty string: it
  // returns "Framework", or the module id, or "Module". So `source` is always truthy and the
  // guard can never skip a push. It states the intent and ships unchanged.

  // --- markdown blocks -------------------------------------------------------------------------------------------------------
  ["carriage returns survive into the line split",
    '    .replace(/\\r\\n?/g, "\\n")',
    "    .replace(/\\r/g, \"\\r\")"],
  ["trailing whitespace survives normalization",
    '    .replace(/[ \\t]+$/gm, "")',
    '    .replace(/[ \\t]+$/m, "")'],
  ["a heading renders at the markdown level rather than one below",
    "      const level = Math.min(6, Math.max(2, heading[1].length + 1));",
    "      const level = Math.min(6, Math.max(2, heading[1].length));"],
  // **Withdrawn, and inert for a real reason.** The `Math.max(2, ...)` floor can never apply:
  // the heading pattern is `#{1,6}`, so `heading[1].length + 1` is at least 2 already. Dropping
  // the floor changes no level the parser can produce. It ships unchanged.
  ["a deep heading stops being bounded at h6",
    "      const level = Math.min(6, Math.max(2, heading[1].length + 1));",
    "      const level = Math.max(2, heading[1].length + 1);"],
  ["fenced code is interpreted as markdown",
    '    if (trimmed.startsWith("```")) {',
    "    if (false) {"],
  ["an unterminated fence loses its final line",
    "      nodes.push(codeBlockElement(codeLines.join(\"\\n\")));",
    "      nodes.push(codeBlockElement(codeLines.slice(0, -1).join(\"\\n\")));"],
  ["an ordered list renders as an unordered one",
    '      const listType = unordered ? "ul" : "ol";',
    '      const listType = "ul";'],
  ["a list swallows the block that follows it",
    "        if (!itemMatch) {\n          break;\n        }",
    "        if (!itemMatch) {\n          index += 1;\n          continue;\n        }"],
  ["wrapped paragraph lines stop being joined",
    '    paragraph.replaceChildren(...inlineMarkdownNodes(paragraphLines.join(" ")));',
    '    paragraph.replaceChildren(...inlineMarkdownNodes(paragraphLines.join("")));'],
  ["an empty article renders nothing at all",
    '  return nodes.length > 0 ? nodes : [emptyElement("This article is empty.")];\n}\n\n/** @param {unknown} html @returns {Node[]} */',
    "  return nodes;\n}\n\n/** @param {unknown} html @returns {Node[]} */"],

  // --- markdown tables -------------------------------------------------------------------------------------------------------
  ["a header row with no divider is taken as a table",
    "  return isTableRow(lines[index]) && isTableDivider(lines[index + 1] || \"\");",
    "  return isTableRow(lines[index]);"],
  ["a divider of fewer than three dashes is accepted",
    "  return /^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$/.test(line || \"\");",
    "  return /^\\s*\\|?\\s*:?-{1,}:?\\s*(\\|\\s*:?-{1,}:?\\s*)+\\|?\\s*$/.test(line || \"\");"],
  ["a divider stops being anchored at the end of the line",
    "  return /^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$/.test(line || \"\");",
    "  return /^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*/.test(line || \"\");"],
  ["cells stop being trimmed",
    "    .map((cell) => cell.trim());",
    "    .map((cell) => cell);"],
  ["the leading pipe is kept as an empty first cell",
    '    .replace(/^\\|/, "")',
    '    .replace(/^x/, "")'],
  ["the header row is rendered as body cells",
    '    const cell = document.createElement("th");',
    '    const cell = document.createElement("td");'],
  ["the header row is repeated as a body row",
    "  for (const line of lines.slice(1)) {",
    "  for (const line of lines) {"],

  // --- inline markdown -------------------------------------------------------------------------------------------------------
  ["markdown inside a code span is interpreted",
    "    if (match[2]) {\n      const code = document.createElement(\"code\");\n      code.textContent = match[2];",
    "    if (match[2]) {\n      const code = document.createElement(\"code\");\n      code.replaceChildren(...inlineMarkdownNodes(match[2]));"],
  ["strong stops rendering its nested markdown",
    "      strong.replaceChildren(...inlineMarkdownNodes(match[4]));",
    "      strong.textContent = match[4];"],
  ["emphasis renders as strong",
    '      const emphasis = document.createElement("em");',
    '      const emphasis = document.createElement("strong");'],
  ["the text between two spans is dropped",
    "    appendTextNode(nodes, String(value || \"\").slice(cursor, match.index));",
    "    appendTextNode(nodes, \"\");"],
  ["the text after the last span is dropped",
    "  appendTextNode(nodes, String(value || \"\").slice(cursor));\n  return nodes;",
    "  return nodes;"],
  ["an empty run of text becomes a node",
    "  if (value) {\n    nodes.push(document.createTextNode(value));\n  }",
    "  nodes.push(document.createTextNode(value));"],
  ["a link loses its label markdown",
    "  anchor.replaceChildren(...inlineMarkdownNodes(label));",
    "  anchor.textContent = label;"],

  // --- link safety -------------------------------------------------------------------------------------------------------
  // **Four breaks withdrawn here, and they are the most interesting inerts in this harness.**
  // Removing the executable-scheme denylist entirely - or narrowing it to any subset, or making
  // it case-sensitive - changes nothing this page does, because the *allowlist* that follows
  // independently refuses every one of those values. Its permissive alternative is
  // `[a-z0-9._/-]+(?:[?#].*)?$`, a character class holding no colon, so no scheme-bearing URL
  // can ever match it; and `https?://` and `mailto:` are the only schemes named explicitly.
  // Verified against `javascript:`, `JavaScript:`, `jAvAsCrIpT:`, `vbscript:`, `data:` and
  // `DATA:`, padded and unpadded: every one still refused with the denylist gone.
  //
  // **The denylist is therefore defense in depth, and ships unchanged.** It is the guard a
  // reader looks for first, and it becomes load-bearing the moment the allowlist is loosened.
  // No assertion can separate the two spellings, so none is invented to pretend it can.
  ["a padded href stops being trimmed, so a legitimate one is refused",
    '  const value = String(href || "").trim();',
    '  const value = String(href || "");'],
  ["an unrecognised scheme is allowed through",
    '  if (/^(https?:\\/\\/|mailto:|#|\\/(?!\\/)|[a-z0-9._/-]+(?:[?#].*)?$)/i.test(value)) {\n    return value;\n  }\n\n  return "";',
    "  return value;"],
  ["an outbound link stops being marked",
    "  if (safeHref) {\n    anchor.href = safeHref;\n    if (/^https?:\\/\\//i.test(safeHref)) {\n      anchor.rel = \"noopener noreferrer\";\n    }\n  }",
    "  if (safeHref) {\n    anchor.href = safeHref;\n  }"],
  ["a refused href is written to the anchor anyway",
    "  anchor.replaceChildren(...inlineMarkdownNodes(label));\n  if (safeHref) {\n    anchor.href = safeHref;",
    "  anchor.replaceChildren(...inlineMarkdownNodes(label));\n  if (true) {\n    anchor.href = String(href);"],

  // --- the rendered-HTML sanitizer -------------------------------------------------------------------------------------------------------
  ["a disallowed tag is kept as an element",
    "  if (!allowedTags.has(tagName)) {\n    return document.createTextNode(node.textContent || \"\");\n  }",
    "  if (false) {\n    return document.createTextNode(node.textContent || \"\");\n  }"],
  ["script joins the allowed tags",
    '    "a",\n    "blockquote",',
    '    "a",\n    "script",\n    "blockquote",'],
  ["a comment node is imported rather than dropped",
    "  if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {\n    return null;\n  }",
    "  if (false) {\n    return null;\n  }"],
  ["a text node stops being copied through",
    "  if (node.nodeType === Node.TEXT_NODE) {\n    return document.createTextNode(node.textContent || \"\");\n  }",
    "  if (false) {\n    return document.createTextNode(node.textContent || \"\");\n  }"],
  ["an imported anchor's href stops being sanitized",
    '    const safeHref = safeHelpHref(node.getAttribute("href") || "");',
    '    const safeHref = node.getAttribute("href") || "";'],
  ["an imported outbound anchor stops being marked",
    '      if (/^https?:\\/\\//i.test(safeHref)) {\n        element.rel = "noopener noreferrer";\n      }',
    "      element.rel = element.rel;"],
  ["any class survives on an imported code element",
    "    if (/^language-[a-z0-9_-]+$/i.test(className)) {\n      element.className = className;\n    }",
    "    element.className = className;"],
  ["a class list survives on an imported code element",
    "/^language-[a-z0-9_-]+$/i.test(className)",
    "/^language-[a-z0-9_-]+/i.test(className)"],
  ["an imported checkbox is left editable",
    "    element.disabled = true;",
    "    element.disabled = false;"],
  ["an imported checkbox is always checked",
    '    element.checked = node.hasAttribute("checked");',
    "    element.checked = true;"],
  ["a text input is treated as a checkbox",
    '  if (tagName === "input" && element instanceof HTMLInputElement && node.getAttribute("type") === "checkbox") {',
    '  if (tagName === "input" && element instanceof HTMLInputElement) {'],
  ["imported children stop being sanitized",
    "  element.replaceChildren(...Array.from(node.childNodes)\n    .map((child) => importSafeHelpNode(child))\n    .filter((child) => child !== null));",
    "  element.replaceChildren(...Array.from(node.childNodes));"],
  ["a parsed body's top-level nodes stop being sanitized",
    "  const nodes = Array.from(documentNode.body.childNodes)\n    .map((node) => importSafeHelpNode(node))\n    .filter((node) => node !== null);",
    "  const nodes = Array.from(documentNode.body.childNodes);"],
  ["an empty rendered body renders nothing at all",
    '  return nodes.length > 0 ? nodes : [emptyElement("This article is empty.")];\n}\n\n/** @param {Node} node @returns {Node | null} */',
    "  return nodes;\n}\n\n/** @param {Node} node @returns {Node | null} */"],

  // --- the status line -------------------------------------------------------------------------------------------------------
  ["an error stops being marked",
    '  statusMessage.classList.toggle("is-error", isError);',
    '  statusMessage.classList.toggle("is-error", false);'],
  ["the error mark is never cleared",
    '  statusMessage.classList.toggle("is-error", isError);',
    '  if (isError) statusMessage.classList.toggle("is-error", true);'],
  ["the missing status line stops being tolerated",
    "  if (!statusMessage) {\n    return;\n  }",
    "  if (false) {\n    return;\n  }"],

  // --- the page's own narrowings -------------------------------------------------------------------------------------------------------
  ["the element behind a query result stops being narrowed",
    "    if (!(button instanceof HTMLElement)) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  ["the declared navigation stops being preferred over the section fallback",
    "  const navigation = state.navigation.length > 0 ? state.navigation : sectionsWithArticles();",
    "  const navigation = sectionsWithArticles();"],
  ["the response body is narrowed before the failure branch reads it",
    "      throw new Error(errorMessage(body) || \"Help is unavailable.\");",
    "      throw new Error(errorMessage(helpRecord(body) || {}) || \"Help is unavailable.\");"],
  ["the detail response stops falling back to the list entry",
    "    renderArticle(helpRecord(helpRecord(body)?.article) || article);",
    "    renderArticle(helpRecord(helpRecord(body)?.article) || {});"],
  ["the id restated after the spread is taken from somewhere else",
    '    ...(item.id ? [createArticleLink({ ...item, id: item.id, type: "article" }, depth + 1)] : []),',
    '    ...(item.id ? [createArticleLink({ ...item, id: item.slug || "", type: "article" }, depth + 1)] : []),'],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
