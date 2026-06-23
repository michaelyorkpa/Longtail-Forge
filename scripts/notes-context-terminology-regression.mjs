import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const [
  workflowContext,
  notesDocs,
  notesJs,
  notesModule,
  notesService,
  notesHtml,
  viewBuilder,
] = await Promise.all([
  fs.readFile(path.join(process.cwd(), "docs/workflow-context-contract.md"), "utf8"),
  fs.readFile(path.join(process.cwd(), "docs/notes-module.md"), "utf8"),
  fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8"),
  fs.readFile(path.join(process.cwd(), "src/modules/notes/module.js"), "utf8"),
  fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8"),
  fs.readFile(path.join(process.cwd(), "views/protected/notes.html"), "utf8"),
  fs.readFile(path.join(process.cwd(), "public/js/shared/view-builder.js"), "utf8"),
]);

for (const phrase of [
  "Primary Context",
  "Linked Context",
  "notes.client_id",
  "notes.project_id",
  "note_links",
  "Normal app UI must not display raw UUIDs",
  "Audit Logs may display raw IDs",
  "Unavailable client",
  "Unavailable project",
  "Unavailable task",
  "Unavailable note",
  "Unavailable list",
  "Unavailable linked context",
]) {
  assert.match(workflowContext, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be in the workflow context contract`);
}

assert.match(notesDocs, /Direct nullable `notes\.client_id` and `notes\.project_id` fields are Primary Context/);
assert.match(notesDocs, /`note_links` rows are Linked Context/);
assert.match(notesDocs, /Normal Notes UI must not display raw target IDs or UUIDs/);
assert.match(notesDocs, /Audit Logs may still display raw IDs/);

assert.match(notesModule, /linkedRecords:\s*\{[\s\S]*title:\s*"Linked Context"[\s\S]*No linked context\./);
assert.match(notesJs, /title:\s*"Linked Context"/);
assert.match(viewBuilder, /placeholder:\s*options\.searchPlaceholder \|\| "Search linked context"/);
assert.match(notesJs, /searchInput\.dataset\.noteContextSearch = ""/);
assert.match(notesJs, /function unavailableTargetLabel/);
assert.match(notesJs, /\["Owner", note\.owner_display_name \|\| "Unavailable owner"\]/);
assert.match(notesJs, /targetType !== "client" \|\| usesBusinessScope\(\)/);
assert.doesNotMatch(notesModule, /title:\s*"Linked Records"|No linked records\./);
assert.doesNotMatch(notesJs, /title:\s*"Linked Records"|No linked records\.|Search linked records/);
assert.doesNotMatch(notesJs, /target\.label \|\| target\.targetId|note\.owner_display_name \|\| note\.owner_user_id|text:\s*link\.label \|\| targetId/);

for (const label of [
  "Unavailable client",
  "Unavailable project",
  "Unavailable task",
  "Unavailable note",
  "Unavailable list",
  "Unavailable linked context",
]) {
  assert.match(notesService, new RegExp(escapeRegExp(label)), `${label} should be a service fallback`);
  assert.match(notesJs, new RegExp(escapeRegExp(label)), `${label} should be a browser fallback`);
}

assert.match(notesService, /function clientTargetPlainLabel\(client = \{\}\)[\s\S]*readableTargetLabel\(client\.name \|\| client\.label, "client"\)/);
assert.match(notesService, /function clientTargetDisplayLabel\(client = \{\}\)[\s\S]*readProviderDisplayLabel\(client\.display_label \|\| client\.displayLabel\)/);
assert.match(notesService, /function projectTargetPlainLabel\(project = \{\}\)[\s\S]*readableTargetLabel\(project\.name \|\| project\.label, "project"\)/);
assert.match(notesService, /function taskTargetPlainLabel\(task = \{\}\)[\s\S]*readableTargetLabel\(task\.title \|\| task\.label, "task"\)/);
assert.match(notesService, /readableTargetLabel\(user\.display_name \|\| user\.displayName \|\| user\.username, "user"\)/);
assert.doesNotMatch(notesService, /client\.name \|\| client\.id|project\.name \|\| project\.id|task\.title \|\| task\.task_id|user\.display_name \|\| user\.username \|\| user\.user_id|user\.displayName \|\| user\.username \|\| user\.user_id/);
assert.match(notesHtml, /js\/notes\.js\?v=64/);

console.log("Notes context terminology regression passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
