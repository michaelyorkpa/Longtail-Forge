import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const roadmap = await read("ROADMAP.md");
const changelog = await read("CHANGELOG.md");
const moduleContract = await read("docs/module-contract.md");
const moduleDevelopment = await read("docs/module-development.md");
const notesModule = await read("docs/notes-module.md");
const markdownContract = await read("docs/markdown-platform-contract.md");
const notesHelp = await read("help/modules/notes/markdown.md");
const packageJson = JSON.parse(await read("package.json"));
const packageLock = JSON.parse(await read("package-lock.json"));

assert.equal(packageJson.version, "0.33.5.18.6.3", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.6.3", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.6.3", "package-lock package entry should report the current app version");

assert.match(
  roadmap,
  /### Version 0\.33\.5\.17\.6 - Documentation and Closeout[\s\S]*- \[x\] Update `docs\/module-contract\.md`[\s\S]*- \[x\] Verify `\/api\/app-info` reports the expected version/,
  "0.33.5.17.6 roadmap closeout checklist should be complete",
);
assert.match(changelog, /## Version 0\.33\.5\.17\.6/, "changelog should record the closeout slice");

for (const phrase of [
  "Markdown rendering is a framework-owned content service",
  "CommonMark plus explicitly enabled tables and task lists",
  "broad extension bundles, raw HTML, unsafe links, unsafe image sources",
  "Notes owns note body storage, revisions, wiki-link behavior",
  "Help owns article discovery, metadata, ToC navigation",
  "Future Knowledge Base records will own publication status",
]) {
  assert.match(moduleContract, new RegExp(escapeRegExp(phrase)), `module contract should document ${phrase}`);
}

for (const phrase of [
  "## Markdown Rendering",
  "Use `src/core/markdown/markdown.service.js`",
  "Saved Markdown should remain unchanged",
  "draft preview uses the protected `POST /api/notes/preview` route",
  "Repo-authored Help files live under `help/`",
]) {
  assert.match(moduleDevelopment, new RegExp(escapeRegExp(phrase)), `module development guide should document ${phrase}`);
}

for (const phrase of [
  "current Notes implementation as of 0.33.5.18.6.3",
  "CommonMark paragraphs",
  "approved tables and task lists",
  "Draft preview uses the protected `POST /api/notes/preview` route",
  "Tab indentation, Shift+Tab outdent, predictable Enter list continuation",
]) {
  assert.match(notesModule, new RegExp(escapeRegExp(phrase)), `Notes developer guide should document ${phrase}`);
}

for (const phrase of [
  "task lists, and tables are supported",
  "Pressing Enter after a predictable list item continues the same list style",
  "Preview button renders the draft through the same safe Markdown path used after saving",
  "does not auto-create notes",
]) {
  assert.match(notesHelp, new RegExp(escapeRegExp(phrase)), `Notes Help should document ${phrase}`);
}

assert.match(markdownContract, /0\.33\.5\.17\.6 closes the branch with current documentation/, "Markdown contract should mention closeout docs");
assert.doesNotMatch(notesHelp, /WYSIWYG|Knowledge Base publishing|future roadmap/i, "Notes Markdown Help should stay current-state and not promise future behavior");

console.log("Markdown closeout regression passed.");

async function read(filePath) {
  return fs.readFile(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
