import assert from "node:assert/strict";

import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const changelog = readText("CHANGELOG.md");
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

const openNoteViewerBody = functionBody(notesScript, "openNoteViewer");
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
  functionBody(notesScript, "createNoteViewDialog"),
  /noteViewBody[\s\S]*label: "Close"[\s\S]*label: "Edit"[\s\S]*noteViewAction = "edit"[\s\S]*view\.createModal\(\{[\s\S]*title: "View Note"[\s\S]*className: "notes-view-dialog"[\s\S]*actions: \[closeAction, editAction\]/,
  "Notes view modal should render a read surface with an explicit Edit footer action",
);
assert.match(
  functionBody(notesScript, "renderNoteViewDialog"),
  /notes-view-rendered-body[\s\S]*body\.innerHTML = note\.body_html \|\| "";[\s\S]*applyExternalMarkdownLinkPreference\(body\)[\s\S]*openNoteViewEditHandoff/,
  "Notes view modal should show the server-rendered Markdown HTML and wire the Edit handoff",
);
assert.doesNotMatch(
  functionBody(notesScript, "renderNoteViewDialog"),
  /body_markdown|MarkdownIt|marked|showdown|markdown-it|DOMParser/,
  "Notes view modal should not expose raw Markdown or add a browser Markdown parser",
);
assert.match(
  functionBody(notesScript, "openNoteViewEditHandoff"),
  /view\.closeModal\(dialog, "edit"\)[\s\S]*openNoteEditor\(\{[\s\S]*mode: "edit"[\s\S]*noteId[\s\S]*\}, hostContext\)/,
  "The Notes view modal Edit action should close the read modal and open the canonical editor for the same note",
);
assert.match(
  functionBody(notesScript, "noteViewErrorMessage"),
  /Secure note is locked[\s\S]*Note is unavailable or you do not have access\./,
  "Unreadable, stale, or secure-error note targets should show safe fixed messages",
);
assert.doesNotMatch(
  functionBody(notesScript, "noteViewErrorMessage"),
  /error\.message|noteId|recordId|body_html|body_markdown/,
  "Unavailable note messages should not echo raw IDs or note bodies",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "createTaskFocusRelatedContextItem"),
  /innerHTML|notes-rendered-body|body_html|body_markdown/,
  "Task Focus Inspector should not embed note preview content inline",
);

assert.match(
  changelog,
  /## Version 0\.33\.6\.12m[\s\S]*linked Note rows through a new Notes-owned `notes\.view` module action[\s\S]*rendering existing server-generated Markdown HTML[\s\S]*explicit `Edit` handoff/,
  "Changelog should preserve the linked-note view modal and edit handoff closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench Task Focus linked-note view regression passed.");

function functionBody(source, name) {
  const starts = [
    `async function ${name}(`,
    `function ${name}(`,
  ];
  const start = starts
    .map((signature) => source.indexOf(signature))
    .find((index) => index >= 0);
  assert.notEqual(start, undefined, `Missing function ${name}`);

  const signatureEnd = source.indexOf(") {", start);
  const openBrace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `Missing body for function ${name}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  throw new Error(`Could not parse function ${name}`);
}
