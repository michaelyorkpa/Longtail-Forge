import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
// Run alone: each break temporarily edits a source file read by the lifted suites.
// Type-only annotations are verified by the strict ledger, not counted as runtime breaks.
// The real fallback descriptor is executed. No fixture-built copy stands in for its producer.
// Initial fixture corrections: compare arrays across VM realms by value; use the existing
// control-error wording; replace children to prepend a decoy (the fake lacks prepend).
// FakeElement.click is asynchronous and implements once after awaiting the handler;
// awaiting each click fixed the test race. Source inspection ruled out a product defect.
const paths = ["public/js/notes.js", "tests/e2e/support/isolated-workspace.mjs"];
const originals = new Map(paths.map((path) => [path, Buffer.from(readFileSync(path))]));
/** @param {Buffer} bytes */ const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = new Map([...originals].map(([path, bytes]) => [path, hash(bytes)]));
const cases = [
  [
    "fallback label changes",
    "notesWorkflowActionStripDescriptor",
    "label: \"Note actions\"",
    "label: \"Other actions\""
  ],
  [
    "fallback edit metadata changes",
    "notesWorkflowActionStripDescriptor",
    "label: \"Edit\"",
    "label: \"Changed\""
  ],
  [
    "edit action omitted",
    "detailActionButtons",
    "if (editAction)",
    "if (false && editAction)"
  ],
  [
    "archive/restore choice inverted",
    "detailActionButtons",
    "archived ? actionById.get(\"restore-note\") : actionById.get(\"archive-note\")",
    "archived ? actionById.get(\"archive-note\") : actionById.get(\"restore-note\")"
  ],
  [
    "archived edit enabled",
    "detailActionButtons",
    "edit.disabled = true",
    "edit.disabled = false"
  ],
  [
    "archived edit guidance changes",
    "detailActionButtons",
    "Restore archived notes before editing.",
    "Edit archived notes."
  ],
  [
    "action label fallback changes",
    "noteWorkflowActionButton",
    "action.label || action.id",
    "action.label || \"Missing\""
  ],
  [
    "action role changes",
    "noteWorkflowActionButton",
    "role: action.role",
    "role: \"secondary\""
  ],
  [
    "missing behavior dispatched",
    "noteWorkflowActionButton",
    "typeof action.behavior === \"string\"",
    "true"
  ],
  [
    "action identity changes",
    "noteWorkflowActionButton",
    "button.dataset.noteAction = action.id",
    "button.dataset.noteAction = \"wrong\""
  ],
  [
    "activation dispatches twice",
    "noteWorkflowActionButton",
    "? runNoteWorkflow(action.behavior, note) :",
    "? (runNoteWorkflow(action.behavior, note), runNoteWorkflow(action.behavior, note)) :"
  ],
  [
    "menu label omitted",
    "createNoteActionStrip",
    "ariaLabel: label",
    "ariaLabel: \"Actions\""
  ],
  [
    "stale detail retained",
    "renderDetail",
    "requireNotesValue(detailPanel).replaceChildren",
    "requireNotesValue(detailPanel).append"
  ],
  [
    "detail control required too early",
    "renderDetail",
    "const view = requireView();",
    "requireNotesValue(detailPanel);\n    const view = requireView();"
  ],
  [
    "rendered HTML dropped",
    "renderDetail",
    "body.innerHTML = note.body_html || \"\"",
    "body.innerHTML = \"\""
  ],
  [
    "HTML receives empty fallback",
    "renderDetail",
    "!body.textContent.trim() && !note.body_html",
    "!body.textContent.trim()"
  ],
  [
    "secure warning omitted",
    "renderDetail",
    "if (isSecureNote(note))",
    "if (false && isSecureNote(note))"
  ],
  [
    "custom secure warning ignored",
    "renderDetail",
    "note.secure_title_warning ||",
    ""
  ],
  [
    "files and revisions reversed",
    "renderDetail",
    "body, links, files, revisions",
    "body, links, revisions, files"
  ],
  [
    "post-render revisions load omitted",
    "renderDetail",
    "loadRevisions(note, revisions.querySelector(\"[data-note-revisions-list]\"));",
    ""
  ],
  [
    "readable links reversed",
    "linkRecordNodes",
    "...links.map",
    "...links.slice().reverse().map"
  ],
  [
    "unreadable rows retained",
    "linkRecordNodes",
    ".filter((item) => item !== null)",
    ".filter(() => true)"
  ],
  [
    "all rows discarded",
    "linkRecordNodes",
    ".filter((item) => item !== null)",
    ".filter(() => false)"
  ],
  [
    "primary row omitted",
    "linkRecordNodes",
    "const primaryContext = notePrimaryContextItem(note);",
    "const primaryContext = null;"
  ],
  [
    "descriptor empty message ignored",
    "linkRecordNodes",
    "notesLinkedRecordsDescriptor()?.emptyState?.message ||",
    ""
  ],
  [
    "non-button edit marker accepted",
    "noteViewEditAction",
    "querySelectorAll(\"button\")",
    "querySelectorAll(\"*\")"
  ],
  [
    "edit resolves close action",
    "noteViewEditAction",
    "noteViewAction === \"edit\"",
    "noteViewAction === \"close\""
  ],
  [
    "optional dialog rejected",
    "noteViewEditAction",
    "dialog?.querySelectorAll(\"button\") || []",
    "dialog.querySelectorAll(\"button\")"
  ],
  [
    "missing edit refuses readable viewer",
    "renderNoteViewDialog",
    "if (!editAction) return;",
    ""
  ],
  [
    "missing edit refuses error surface",
    "renderNoteViewError",
    "if (!editAction) return;",
    ""
  ],
  [
    "viewer error leaves old content",
    "renderNoteViewError",
    "?.replaceChildren",
    "?.append"
  ],
  [
    "viewer error edit enabled",
    "renderNoteViewError",
    "editAction.disabled = true",
    "editAction.disabled = false"
  ],
  [
    "viewer error title not updated",
    "renderNoteViewError",
    "dialog.viewParts.title.textContent = \"Note unavailable\";",
    ""
  ],
  [
    "secure error misclassified",
    "noteViewErrorMessage",
    "if (isSecureError(error))",
    "if (false && isSecureError(error))"
  ],
  [
    "viewer body lookup lost",
    "noteViewBodyElement",
    "[data-note-view-body]",
    "[data-note-view-missing]"
  ],
  [
    "camelCase fixture id omitted",
    "$fixture",
    " || body.workspace?.workspaceId",
    ""
  ],
  [
    "snake_case fixture fallback omitted",
    "$fixture",
    "body.workspace?.workspace_id || ",
    ""
  ],
  [
    "root fixture fallback omitted",
    "$fixture",
    " || body.workspaceId",
    ""
  ],
  [
    "empty fixture fallback omitted",
    "$fixture",
    " || \"\"",
    ""
  ]
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-detail-display.test.mjs", "tests/unit/notes-note-viewer.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
function restore() {
  for (const [path, bytes] of originals) { writeFileSync(path, bytes); assert.equal(hash(readFileSync(path)), hashes.get(path), `${path}: restoration`); }
}
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    const path = name === "$fixture" ? paths[1] : paths[0];
    const bytes = originals.get(path); assert.ok(bytes);
    const source = bytes.toString("utf8");
    const region = extractFunctionBlock(source, name === "$fixture" ? "createOwnedWorkspace" : name);
    assert.ok(region.includes(from), `${label}: mutation site exists`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax error is not coverage\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else { assert.equal(result.status, 1, output); assert.match(output, /AssertionError/, `${label}: incidental crash is not coverage\n${output}`); caught++; console.log(`CAUGHT: ${label}`); }
    } finally { restore(); }
  }
} finally {
  restore(); for (const [path, sha] of hashes) console.log(`Restored SHA-256 ${path}: ${sha}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
