import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const docs = await fs.readFile(path.join(process.cwd(), "docs/notes-module.md"), "utf8");
const importPlanning = await fs.readFile(path.join(process.cwd(), "docs/notes-import-planning.md"), "utf8");
const readme = await fs.readFile(path.join(process.cwd(), "README.md"), "utf8");
const moduleDevelopment = await fs.readFile(path.join(process.cwd(), "docs/module-development.md"), "utf8");

for (const heading of [
  "## Module Boundaries",
  "## Library Model",
  "## Collection Model",
  "## Bucket Behavior",
  "## Bucket Derivation",
  "## Visibility And Permissions",
  "## Note Data Model",
  "## Linking Model",
  "## Resume Context Hooks",
  "## Markdown And Wiki Links",
  "## Revisions And Changelog",
  "## Secure Notes",
  "## Manifest Declarations",
  "## Search, Tags, And Files",
  "## Lifecycle Events",
  "## Import Metadata",
  "## What Notes Should Not Own",
]) {
  assert.match(docs, new RegExp(escapeRegExp(heading)), `${heading} should be documented`);
}

for (const phrase of [
  "Active Work",
  "Ongoing Areas",
  "Reference Library",
  "Archive is a read-mostly state",
  "single-primary membership",
  "Collection counts are calculated from permission-filtered note lists",
  "Moving a note to a different Library bucket clears",
  "Markdown is the canonical editable body format",
  "Restoring a revision creates a new note update",
  "application-managed envelope encryption",
  "not zero-knowledge",
  "Notes must not write directly to `search_index`",
  "Secure notes block framework-managed attachments",
  "sanitizeNoteLifecyclePayload",
  "OneNote/import-friendly metadata",
  "does not grant access",
  "Knowledge Base content",
  "docs/notes-import-planning.md",
  "Note Kind",
  "content-kind metadata only",
  "legacy linked-context values",
  "Client/project/task/ticket/user association belongs in direct context columns and `note_links`",
  "notesService.listResumeContext",
  "Global resume-state storage, ranking, dismissal, Workbench feed behavior",
]) {
  assert.match(docs, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be documented`);
}

assert.match(readme, /docs\/notes-module\.md/, "README should link the Notes developer guide");
assert.match(moduleDevelopment, /docs\/notes-module\.md/, "Module development guide should point to Notes as a first-party module example");
assert.match(importPlanning, /future OneNote import workflow/i, "Import planning should leave room for future OneNote import");
assert.doesNotMatch(docs, /Knowledge Base publishing controls are implemented|user-authored Knowledge Base content is stored in Notes/i);

console.log("Notes developer docs regression passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
