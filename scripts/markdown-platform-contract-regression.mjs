import assert from "node:assert/strict";
import fs from "node:fs/promises";

const contract = await readText("docs/markdown-platform-contract.md");
const roadmap = await readText("ROADMAP.md");
const decisions = await readText("DECISIONS.md");
const packageJson = JSON.parse(await readText("package.json"));
const packageLock = JSON.parse(await readText("package-lock.json"));
const notesMarkdown = await readText("src/modules/notes/markdown.js");
const helpService = await readText("src/services/help.service.js");
const notesEditor = await readText("public/js/shared/notes-editor.js");

assert.equal(packageJson.version, "0.33.5.17.1", "package.json should carry the Markdown contract slice version");
assert.equal(packageLock.version, "0.33.5.17.1", "package-lock root version should carry the Markdown contract slice version");
assert.equal(packageLock.packages[""].version, "0.33.5.17.1", "package-lock package metadata should carry the Markdown contract slice version");

assert.match(contract, /Longtail Forge will adopt `markdown-it`/, "contract should record the selected parser");
assert.match(contract, /CommonMark mode/, "contract should require CommonMark-compatible parsing");
assert.match(contract, /Tables\./, "contract should approve tables explicitly");
assert.match(contract, /Task lists\./, "contract should approve task lists explicitly");
assert.match(contract, /Raw HTML is disabled by default/, "contract should keep raw HTML disabled");
assert.match(contract, /http:`?, `https:`?, `mailto:`?/, "contract should define allowed link schemes");
assert.match(contract, /Render Markdown to safe HTML/, "contract should define safe HTML rendering API");
assert.match(contract, /Convert Markdown to plain text/, "contract should define plain-text conversion API");
assert.match(contract, /Validate or normalize safe links/, "contract should define safe link validation API");
assert.match(contract, /deterministic fixture-based expectations/, "contract should require fixture-based expectations");
assert.match(contract, /Notes owns:[\s\S]*Note body storage[\s\S]*Wiki-style links[\s\S]*Note-specific permissions/, "contract should preserve Notes-owned responsibilities");
assert.match(contract, /Help owns:[\s\S]*Content discovery[\s\S]*Article metadata/, "contract should preserve Help-owned responsibilities");
assert.match(contract, /Future Knowledge Base owns:[\s\S]*Publication status[\s\S]*Article visibility/, "contract should preserve future KB responsibilities");
assert.match(contract, /0\.33\.5\.17\.2 should add the dependency and service/, "contract should leave dependency installation for the next slice");

assert.match(notesMarkdown, /function renderMarkdownToSafeHtml/, "Notes currently has a hand-rolled render path to migrate later");
assert.match(notesMarkdown, /function extractPlainTextFromMarkdown/, "Notes currently has a hand-rolled plain-text path to migrate later");
assert.match(notesMarkdown, /WIKI_LINK_PATTERN/, "Notes wiki links should remain module-owned");
assert.match(helpService, /function extractPlainTextFromHelpMarkdown/, "Help currently has a hand-rolled plain-text path to migrate later");
assert.match(notesEditor, /namespace\.notesEditor/, "browser editor helpers should remain a preview-parity target");

assert.match(decisions, /## Version 0\.33\.5\.17\.1/, "decisions should include the parser-selection slice");
assert.match(decisions, /`markdown-it` is the selected parser/, "decisions should record the parser choice");
assert.match(roadmap, /### Version 0\.33\.5\.17\.1 - Parser Selection and Markdown Contract[\s\S]*- \[x\] Review current Markdown rendering paths/, "roadmap should mark 0.33.5.17.1 complete");

console.log("Markdown platform contract regression passed.");

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}
