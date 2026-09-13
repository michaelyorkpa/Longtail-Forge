import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
// Run alone: the lifted suites read the temporarily changed Notes source.
// The actual state initializer is executed, so its three initializer breaks are observable.
// Type annotations are governed by the strict ledger, never counted as runtime mutations.
// Fixture limitation: fake HTMLElement and Element share one stand-in. The constructor-only
// breaks are caught by narrow source-fact pins, backed by the rendered SVG case.
// The first unit setup used replaceWith, which the fake does not implement; source inspection
// led to remove/append in the fixture. No product defect or reduced assertion was inferred.
// The first campaign hit the child output bound while printing a cyclic DOM diff.
// No catch was credited for that failure; empty-call assertions now compare the exact count,
// preserving their claim without serializing the DOM, and every case is rerun.
const path = "public/js/notes.js", original = readFileSync(path);
/** @param {Buffer} bytes */ const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = hash(original);
const cases = [
  [
    "detail controller initializer changes",
    "$state",
    "attachmentController: null",
    "attachmentController: {}"
  ],
  [
    "editor controller initializer changes",
    "$state",
    "editorAttachmentController: null",
    "editorAttachmentController: {}"
  ],
  [
    "dialog id initializer changes",
    "$state",
    "filesDialogNoteId: \"\"",
    "filesDialogNoteId: \"stale\""
  ],
  [
    "toggle reader accepts another HTML tag",
    "cacheNotesElements",
    "findNotesControl(\"[data-note-files-toggle]\", HTMLButtonElement)",
    "findNotesControl(\"[data-note-files-toggle]\", HTMLElement)"
  ],
  [
    "warning reader widens to non-HTML",
    "cacheNotesElements",
    "findNotesControl(\"[data-note-files-save-first-warning]\", HTMLElement)",
    "findNotesControl(\"[data-note-files-save-first-warning]\", Element)"
  ],
  [
    "client visibility falls through",
    "fileVisibilityForNote",
    "note.visibility === \"client_visible\"",
    "note.visibility === \"other\""
  ],
  [
    "private visibility falls through",
    "fileVisibilityForNote",
    "note.visibility === \"private\"",
    "note.visibility === \"other\""
  ],
  [
    "default visibility becomes public",
    "fileVisibilityForNote",
    "return \"workspace\"",
    "return \"public\""
  ],
  [
    "secure detail mounts attachments",
    "mountFilesPanel",
    "!mount || isSecureNote(note)",
    "!mount"
  ],
  [
    "missing surface no longer tolerated",
    "mountFilesPanel",
    "if (!fileAttachments)",
    "if (false)"
  ],
  [
    "detail teardown omitted",
    "mountFilesPanel",
    "state.attachmentController?.destroy?.();",
    ""
  ],
  [
    "detail controller not retained",
    "mountFilesPanel",
    "state.attachmentController = fileAttachments.mount",
    "fileAttachments.mount"
  ],
  [
    "archived detail upload enabled",
    "mountFilesPanel",
    "canUpload: note.status !== \"archived\"",
    "canUpload: true"
  ],
  [
    "archived detail removal enabled",
    "mountFilesPanel",
    "canRemove: note.status !== \"archived\"",
    "canRemove: true"
  ],
  [
    "detail client identity omitted",
    "mountFilesPanel",
    "clientId: note.client_id || \"\"",
    "clientId: \"\""
  ],
  [
    "detail project identity omitted",
    "mountFilesPanel",
    "projectId: note.project_id || \"\"",
    "projectId: \"\""
  ],
  [
    "detail target identity omitted",
    "mountFilesPanel",
    "targetId: note.note_id",
    "targetId: \"\""
  ],
  [
    "editor teardown omitted",
    "mountNoteEditorFiles",
    "state.editorAttachmentController?.destroy?.();",
    ""
  ],
  [
    "editor controller not cleared",
    "mountNoteEditorFiles",
    "state.editorAttachmentController = null;",
    ""
  ],
  [
    "editor dialog identity stale",
    "mountNoteEditorFiles",
    "state.filesDialogNoteId = note?.note_id || \"\"",
    "state.filesDialogNoteId = \"stale\""
  ],
  [
    "save-first warning inverted",
    "mountNoteEditorFiles",
    "filesSaveFirstWarning.hidden = Boolean(note?.note_id)",
    "filesSaveFirstWarning.hidden = !Boolean(note?.note_id)"
  ],
  [
    "unavailable editor mount not cleared",
    "mountNoteEditorFiles",
    "filesEditor?.replaceChildren?.();",
    ""
  ],
  [
    "secure editor mounts attachments",
    "mountNoteEditorFiles",
    " || secure || ",
    " || "
  ],
  [
    "unsaved editor mounts attachments",
    "mountNoteEditorFiles",
    " || !note?.note_id",
    ""
  ],
  [
    "editor controller result discarded",
    "mountNoteEditorFiles",
    "state.editorAttachmentController = fileAttachments.mount",
    "fileAttachments.mount"
  ],
  [
    "archived editor upload enabled",
    "mountNoteEditorFiles",
    "canUpload: Boolean(note?.note_id) && note?.status !== \"archived\"",
    "canUpload: true"
  ],
  [
    "archived editor removal enabled",
    "mountNoteEditorFiles",
    "canRemove: Boolean(note?.note_id) && note?.status !== \"archived\"",
    "canRemove: true"
  ],
  [
    "partial seed loses empty client default",
    "mountNoteEditorFiles",
    "clientId: note?.client_id || \"\"",
    "clientId: note?.client_id"
  ],
  [
    "partial seed loses empty project default",
    "mountNoteEditorFiles",
    "projectId: note?.project_id || \"\"",
    "projectId: note?.project_id"
  ],
  [
    "editor file visibility bypassed",
    "mountNoteEditorFiles",
    "visibility: fileVisibilityForNote(note || {})",
    "visibility: \"workspace\""
  ],
  [
    "secure utility remains visible",
    "updateFilesUtilityState",
    "filesToggle.hidden = secure || !filesAvailable",
    "filesToggle.hidden = !filesAvailable"
  ],
  [
    "missing utility remains expanded",
    "updateFilesUtilityState",
    "filesToggle.setAttribute(\"aria-expanded\", \"false\");",
    ""
  ],
  [
    "unavailable utility is not closed",
    "updateFilesUtilityState",
    "closeFilesDialog();",
    ""
  ],
  [
    "missing toggle is dereferenced",
    "updateFilesUtilityState",
    "if (!filesToggle)",
    "if (false)"
  ],
  [
    "hidden utility can open",
    "openFilesDialog",
    " || filesToggle?.hidden",
    ""
  ],
  [
    "Tags remains open before Files",
    "openFilesDialog",
    "closeTagsDialog();",
    ""
  ],
  [
    "child dialog parent identity changes",
    "openFilesDialog",
    "parent: dialog",
    "parent: filesDialog"
  ],
  [
    "Files is not shown",
    "openFilesDialog",
    "view.showModal(filesDialog, { parent: dialog, trigger: filesToggle });",
    ""
  ],
  [
    "saved focus chooses warning",
    "openFilesDialog",
    "state.filesDialogNoteId\n      ?",
    "!state.filesDialogNoteId\n      ?"
  ],
  [
    "focus narrowing removed",
    "openFilesDialog",
    "candidate instanceof HTMLElement ? candidate : null",
    "candidate"
  ],
  [
    "focus narrowing widens to Element",
    "openFilesDialog",
    "candidate instanceof HTMLElement",
    "candidate instanceof Element"
  ],
  [
    "focus omitted",
    "openFilesDialog",
    "focusTarget?.focus();",
    ""
  ]
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-files-utility.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
function restore() { writeFileSync(path, original); assert.equal(hash(readFileSync(path)), sha, "restored Notes bytes"); }
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    const source = original.toString("utf8");
    const start = source.indexOf("let state = {");
    const region = name === "$state" ? source.slice(start, source.indexOf("\n  };", start) + 5) : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation site exists`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not coverage\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else { assert.equal(result.status, 1, output); assert.match(output, /AssertionError/, `${label}: incidental crash is not coverage\n${output}`); caught++; console.log(`CAUGHT: ${label}`); }
    } finally { restore(); }
  }
} finally { restore(); console.log(`Restored SHA-256: ${sha}`); }
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
