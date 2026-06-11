import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const importPlanning = await fs.readFile(path.join(process.cwd(), "docs/notes-import-planning.md"), "utf8");
const notesDocs = await fs.readFile(path.join(process.cwd(), "docs/notes-module.md"), "utf8");
const roadmap = await fs.readFile(path.join(process.cwd(), "ROADMAP.md"), "utf8");
const roadmapArchive = await fs.readFile(path.join(process.cwd(), "ROADMAP-ARCHIVE.md"), "utf8");
const decisions = await fs.readFile(path.join(process.cwd(), "DECISIONS.md"), "utf8");

for (const heading of [
  "# Notes Import Planning",
  "## Current State",
  "## OneNote Mapping Plan",
  "## Library Suggestions",
  "## Safety Rules",
  "## Verification Expectations",
]) {
  assert.match(importPlanning, new RegExp(escapeRegExp(heading)), `${heading} should be present`);
}

for (const phrase of [
  "not an implemented importer",
  "Notebook",
  "Section group",
  "Section",
  "Page",
  "Subpage",
  "import_source_path",
  "suggest a Library bucket",
  "Do not grant access based on import source",
  "Do not assume imported notes are safe to make client-visible",
  "Do not import secure, private, or sensitive source material into normal notes without a deliberate user choice",
  "Do not create Knowledge Base entries or publication records during Notes import",
  "classification/context metadata",
]) {
  assert.match(importPlanning, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be covered`);
}

for (const metadataField of [
  "import_source",
  "import_source_id",
  "import_source_path",
  "imported_at",
  "import_batch_id",
  "original_notebook",
  "original_section_group",
  "original_section",
  "original_page_id",
]) {
  assert.match(importPlanning, new RegExp(escapeRegExp(metadataField)), `${metadataField} should be in import planning`);
  assert.match(notesDocs, new RegExp(escapeRegExp(metadataField)), `${metadataField} should remain in Notes developer docs`);
}

assert.match(decisions, /0\.33\.3\.4[\s\S]*import planning/i, "Decisions should record the 0.33.3.4 import closeout");
assert.match(`${roadmap}\n${roadmapArchive}`, /Version 0\.33\.3\.4[\s\S]*\[x\] Add migration\/import planning notes/i, "Roadmap or archive should mark import planning complete");
assert.doesNotMatch(importPlanning, /Knowledge Base publishing controls are implemented|import automatically publishes/i);

console.log("Notes import closeout regression passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
