import assert from "node:assert/strict";
import fs from "node:fs/promises";

const contract = await readText("docs/markdown-platform-contract.md");
const roadmap = await readText("ROADMAP.md");
const packageJson = JSON.parse(await readText("package.json"));
const packageLock = JSON.parse(await readText("package-lock.json"));
const notesMarkdown = await readText("src/modules/notes/markdown.js");
const helpService = await readText("src/services/help.service.js");
const notesEditor = await readText("public/js/shared/notes-editor.js");
const notesRoutes = await readText("src/modules/notes/notes.routes.js");
const notesJs = await readText("public/js/notes.js");

assert.equal(packageJson.version, "0.33.5.18.11.8", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.11.8", "package-lock root version should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.11.8", "package-lock package metadata should report the current app version");

assert.match(contract, /Longtail Forge will adopt `markdown-it`/, "contract should record the selected parser");
assert.match(contract, /CommonMark mode/, "contract should require CommonMark-compatible parsing");
assert.match(contract, /Tables\./, "contract should approve tables explicitly");
assert.match(contract, /Task lists\./, "contract should approve task lists explicitly");
assert.match(contract, /Safe underline syntax using `\+\+underlined text\+\+`/, "contract should approve safe underline syntax explicitly");
assert.match(contract, /generated plain `<u>` element with no source-provided attributes/, "contract should keep underline output generated and attribute-free");
assert.match(contract, /Raw HTML is disabled by default/, "contract should keep raw HTML disabled");
assert.match(contract, /raw underline HTML|Raw source underline tags/i, "contract should keep raw underline HTML out of scope");
assert.match(contract, /http:`?, `https:`?, `mailto:`?/, "contract should define allowed link schemes");
assert.match(contract, /Render Markdown to safe HTML/, "contract should define safe HTML rendering API");
assert.match(contract, /Convert Markdown to plain text/, "contract should define plain-text conversion API");
assert.match(contract, /Validate or normalize safe links/, "contract should define safe link validation API");
assert.match(contract, /deterministic fixture-based expectations/, "contract should require fixture-based expectations");
assert.match(contract, /Notes owns:[\s\S]*Note body storage[\s\S]*Wiki-style links[\s\S]*Note-specific permissions/, "contract should preserve Notes-owned responsibilities");
assert.match(contract, /Help owns:[\s\S]*Content discovery[\s\S]*Article metadata/, "contract should preserve Help-owned responsibilities");
assert.match(contract, /Future Knowledge Base owns:[\s\S]*Publication status[\s\S]*Article visibility/, "contract should preserve future KB responsibilities");
assert.match(contract, /0\.33\.5\.17\.2 adds the dependency and service/, "contract should record the renderer service implementation");

assert.match(notesMarkdown, /function renderMarkdownToSafeHtml/, "Notes should keep its adapter entry point for safe rendered Markdown");
assert.match(notesMarkdown, /function extractPlainTextFromMarkdown/, "Notes should keep its adapter entry point for Markdown plain text");
assert.match(notesMarkdown, /WIKI_LINK_PATTERN/, "Notes wiki links should remain module-owned");
assert.match(helpService, /markdownToPlainText/, "Help should use the shared Markdown plain-text path after 0.33.5.17.6");
assert.match(helpService, /renderMarkdownToHtml/, "Help should use the shared Markdown renderer after 0.33.5.17.6");
assert.doesNotMatch(helpService, /function extractPlainTextFromHelpMarkdown/, "Help should not keep the old hand-rolled plain-text path");
assert.match(notesEditor, /namespace\.notesEditor/, "browser editor helpers should remain Notes-owned");
assert.match(notesEditor, /continueListMarker/, "Notes editor should include scoped list-continuation helpers");
assert.match(notesEditor, /underline:\s*\{\s*prefix:\s*"\+\+"/, "Notes editor should expose the safe underline authoring command");
assert.match(notesRoutes, /notesRoutes\.post\("\/notes\/preview"/, "Notes should expose a protected preview route after 0.33.5.17.6");
assert.match(notesJs, /api\.postJson\("\/api\/notes\/preview"/, "Notes live preview should use the server preview route");
assert.match(notesJs, /command:\s*"underline",\s*text:\s*"U",\s*label:\s*"Underline"/, "Notes toolbar should expose the safe underline command");

assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.17\.1 - Parser Selection and Markdown Contract/, "completed Markdown platform roadmap slices should be archived out of the live roadmap");

console.log("Markdown platform contract regression passed.");

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

