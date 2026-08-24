import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionBody } from "../../test-support/source-scan.mjs";
// Consolidated under workbench.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const moduleActionsSource = readText("public/js/shared/module-actions.js");
const notesScript = readText("public/js/notes.js");
const relatedContextService = readText("src/services/workbench-task-focus-related-context.service.js");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  relatedContextService,
  /reason: "linked_note"[\s\S]*action: moduleAction\("notes\.view", \{ noteId: note\.note_id \|\| note\.id \}/,
  "Task Focus linked-note related context should open the Notes view action, not the editor",
);
assert.match(
  relatedContextService,
  /reason: "shared_direct_tag"[\s\S]*action: moduleAction\("notes\.view", \{ noteId: note\.note_id \|\| note\.id \}/,
  "Task Focus note context from shared tags should also open the Notes view action",
);

assert.match(
  moduleActionsSource,
  /id: "notes\.view"[\s\S]*label: "View Note"[\s\S]*mode: "view"[\s\S]*requiredPermissions: \["notes\.view"\][\s\S]*open: \(params, hostContext\) => namespace\.notesDialog\.openNoteViewer\(params, hostContext\)/,
  "Shared module actions should expose a Notes-owned read action",
);
assert.match(
  notesScript,
  /openNoteViewer[\s\S]*openView: openNoteViewer[\s\S]*actionId: "notes\.view"[\s\S]*open: \(params, hostContext\) => openNoteViewer\(params, hostContext\)/,
  "Notes should register its reusable read modal action",
);
assert.match(
  workbenchScript,
  /"notes\.view": \[[\s\S]*js\/notes\.js[\s\S]*openNoteViewer/,
  "Workbench should lazy-load Notes only for the Notes-owned read action",
);

const openNoteViewerBody = extractFunctionBody(notesScript, "openNoteViewer");
assert.match(
  openNoteViewerBody,
  /api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}`,\s*\{ cache: "no-store" \}\)/,
  "Notes view modal should read the canonical Notes detail route",
);
assert.match(
  openNoteViewerBody,
  /renderNoteViewDialog\(dialog, result\.note, params, hostContext\)/,
  "Notes view modal should render the returned note detail payload",
);
assert.match(
  openNoteViewerBody,
  /renderNoteViewError\(dialog, error\)[\s\S]*noteViewErrorMessage\(error\)/,
  "Notes view modal should use a safe unavailable-state path",
);

assert.match(
  extractFunctionBody(notesScript, "createNoteViewDialog"),
  /noteViewBody[\s\S]*label: "Close"[\s\S]*label: "Edit"[\s\S]*noteViewAction = "edit"[\s\S]*view\.createModal\(\{[\s\S]*title: "View Note"[\s\S]*className: "notes-view-dialog"[\s\S]*actions: \[closeAction, editAction\]/,
  "Notes view modal should render a read surface with an explicit Edit footer action",
);
assert.match(
  extractFunctionBody(notesScript, "renderNoteViewDialog"),
  /notes-view-rendered-body[\s\S]*body\.innerHTML = note\.body_html \|\| "";[\s\S]*applyExternalMarkdownLinkPreference\(body\)[\s\S]*openNoteViewEditHandoff/,
  "Notes view modal should show the server-rendered Markdown HTML and wire the Edit handoff",
);
assert.doesNotMatch(
  extractFunctionBody(notesScript, "renderNoteViewDialog"),
  /body_markdown|MarkdownIt|marked|showdown|markdown-it|DOMParser/,
  "Notes view modal should not expose raw Markdown or add a browser Markdown parser",
);
assert.match(
  extractFunctionBody(notesScript, "openNoteViewEditHandoff"),
  /view\.closeModal\(dialog, "edit"\)[\s\S]*openNoteEditor\(\{[\s\S]*mode: "edit"[\s\S]*noteId[\s\S]*\}, hostContext\)/,
  "The Notes view modal Edit action should close the read modal and open the canonical editor for the same note",
);
assert.match(
  extractFunctionBody(notesScript, "noteViewErrorMessage"),
  /Secure note is locked[\s\S]*Note is unavailable or you do not have access\./,
  "Unreadable, stale, or secure-error note targets should show safe fixed messages",
);
assert.doesNotMatch(
  extractFunctionBody(notesScript, "noteViewErrorMessage"),
  /error\.message|noteId|recordId|body_html|body_markdown/,
  "Unavailable note messages should not echo raw IDs or note bodies",
);
assert.doesNotMatch(
  extractFunctionBody(workbenchScript, "createTaskFocusRelatedContextItem"),
  /innerHTML|notes-rendered-body|body_html|body_markdown/,
  "Task Focus Inspector should not embed note preview content inline",
);

console.log("Workbench Task Focus linked-note view regression passed.");