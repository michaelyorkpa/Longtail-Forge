import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof; never run concurrently with a server or source verification.
const path = "public/js/notes.js";
const original = Buffer.from(readFileSync(path));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = hash(original);
const cases = [
  ["successful selection reports failure", "selectNote", "return true;", "return false;"],
  ["failed refresh reports success", "selectNote", "return false;", "return true;"],
  ["selection loses encoded identity", "selectNote", "encodeURIComponent(noteId)", "noteId"],
  ["selection permits cached detail", "selectNote", 'cache: "no-store"', 'cache: "default"'],
  ["selected record is copied", "selectNote", "state.selectedNote = note;", "state.selectedNote = { ...note };"],
  ["selection omits detail render", "selectNote", "renderDetail(note);", ""],
  ["selection omits list render", "selectNote", "renderNotes();", ""],
  ["selection leaves drawer open", "selectNote", "closeNotesSlideOutDrawer();", ""],
  ["selection loses URL identity", "selectNote", "updateUrl(noteId);", "updateUrl('wrong');"],
  ["selection leaves loading status", "selectNote", 'setStatus("");', ""],
  ["selection exposes secure error", "selectNote", 'safeNoteErrorMessage(error ?? {}, "Note could not be loaded.")', "String(error)"],
  ["selection loses locked prompt", "selectNote", "locked: isSecureError(error ?? {})", "locked: false"],
  ["unreadable prompt replaces detail", "renderDetailPrompt", 'if (typeof message !== "string") return;', ""],
  ["prompt content changes", "renderDetailPrompt", "prompt.textContent = message;", "prompt.textContent = 'wrong';"],
  ["prompt loses lock class", "renderDetailPrompt", "options.locked ?", "false ?"],
  ["blank prompt loses guidance", "renderDetailPrompt", '" sidebar and select a note to view here."', '""'],
  ["blank prompt loses filter icon", "renderDetailPrompt", "inlineFilterIcon(),", ""],
  ["detail mount becomes optional", "renderDetailPrompt", "requireNotesValue(detailPanel).replaceChildren(prompt);", "detailPanel?.replaceChildren(prompt);"],
  ["title required before prompt construction", "renderDetailPrompt", 'const prompt = document.createElement("p");', 'requireNotesValue(detailPanel); const prompt = document.createElement("p");'],
  ["saved editor loses ID", "transitionCreatedNoteToEdit", "state.editingNoteId = note.note_id;", "state.editingNoteId = 'wrong';"],
  ["saved editor copies record", "transitionCreatedNoteToEdit", "state.editorNote = note;", "state.editorNote = { ...note };"],
  ["saved editor loses context", "transitionCreatedNoteToEdit", "note.linked_context || state.editorContextSummaries", "state.editorContextSummaries"],
  ["saved editor loses fallback context", "transitionCreatedNoteToEdit", "note.linked_context || state.editorContextSummaries", "note.linked_context"],
  ["saved editor retains staged targets", "transitionCreatedNoteToEdit", "state.editorStagedTargets = [];", ""],
  ["saved editor retains create title", "transitionCreatedNoteToEdit", '"Edit Note"', '"New Note"'],
  ["saved editor permits security change", "transitionCreatedNoteToEdit", "requireNotesValue(securityInput).disabled = true;", "requireNotesValue(securityInput).disabled = false;"],
  ["saved editor leaves copy hidden", "transitionCreatedNoteToEdit", "copyLinkButton.hidden = false;", "copyLinkButton.hidden = true;"],
  ["saved editor leaves copy disabled", "transitionCreatedNoteToEdit", "copyLinkButton.disabled = false;", "copyLinkButton.disabled = true;"],
  ["saved editor skips follow", "transitionCreatedNoteToEdit", "await writeNoteNotificationFollowFields(note);", ""],
  ["saved editor does not await tags", "transitionCreatedNoteToEdit", "await mountTagEditor(note);", "mountTagEditor(note);"],
  ["saved editor omits files", "transitionCreatedNoteToEdit", "mountNoteEditorFiles(note);", ""],
  ["saved editor omits context paint", "transitionCreatedNoteToEdit", "renderEditorContextSelection();", ""],
  ["revision shell loses heading", "renderRevisionsPanel", 'text: "Revisions"', 'text: "History"'],
  ["revision shell loses loading state", "renderRevisionsPanel", 'text: "Loading revisions..."', 'text: ""'],
  ["revision shell loses archive marker", "renderRevisionsPanel", 'list.dataset.archived = "true";', ""],
  ["unreadable revision throws again", "revisionItem", "if (!isNoteRevisionSummary(revision)) return null;", "if (!isNoteRevisionSummary(revision)) throw new Error('Unreadable revision');"],
  ["unreadable revision creates row", "revisionItem", "if (!isNoteRevisionSummary(revision)) return null;", "if (!isNoteRevisionSummary(revision)) return document.createElement('article');"],
  ["original label lost", "revisionItem", '"Original"', '"Revision 1"'],
  ["revision number wrong", "revisionItem", "`Revision ${revision.revision_number}`", "`Revision ${revision.revision_number + 1}`"],
  ["revision metadata reordered", "revisionItem", '.filter(Boolean).join(" - ")', '.filter(Boolean).reverse().join(" - ")'],
  ["personal revision exposes visibility", "revisionItem", 'normalizeWorkspaceType(state.workspaceType) === "personal"', "false"],
  ["secure history body displayed", "revisionItem", "isSecureNote(revision) ?", "false ?"],
  ["plain revision excerpt ignored", "revisionItem", "revision.body_excerpt || revision.title", "revision.title"],
  ["plain revision title fallback ignored", "revisionItem", 'revision.title || ""', '""'],
  ["archived revision restore visible", "revisionItem", 'restore.hidden = note.status === "archived";', "restore.hidden = false;"],
  ["active revision restore hidden", "revisionItem", 'restore.hidden = note.status === "archived";', "restore.hidden = true;"],
  ["secure restore warning missing", "revisionItem", 'restore.title = "Secure revision restore re-encrypts the restored body.";', ""],
  ["restore uses wrong revision", "revisionItem", "encodeURIComponent(revision.note_revision_id)", "'wrong'"],
  ["restore uses wrong note", "revisionItem", "encodeURIComponent(note.note_id)", "'wrong'"],
  ["restore omits refreshed selection", "revisionItem", "await selectNote(note.note_id);", ""],
  ["restore exposes secure error", "revisionItem", 'safeNoteErrorMessage(error ?? {}, "Revision could not be restored.")', "String(error)"],
  ["history loses encoded note", "loadRevisions", "encodeURIComponent(note.note_id)", "note.note_id"],
  ["history permits cached answer", "loadRevisions", 'cache: "no-store"', 'cache: "default"'],
  ["history refuses readable siblings", "loadRevisions", "const readable = body.revisions.filter(isNoteRevisionSummary);", "const readable = body.revisions;"],
  ["history does not disclose omissions", "loadRevisions", "incomplete = true;", "incomplete = false;"],
  ["unreadable history misreported as empty", "loadRevisions", "Some revisions could not be read. History is incomplete.", "No revisions."],
  ["readable history order reversed", "loadRevisions", "revisions.map(", "revisions.slice().reverse().map("],
  ["empty history state missing", "loadRevisions", 'else if (items.length === 0) items.push(emptyText("No revisions."));', ""],
  ["revision identity guard weakened", "isNoteRevisionSummary", '|| value.note_revision_id === ""', ""],
  ["fractional revisions accepted", "isNoteRevisionSummary", "|| !Number.isInteger(value.revision_number)", ""],
  ["secure excerpt accepted", "isNoteRevisionSummary", "value.body_excerpt === null &&", "true &&"],
  // These mutate the actual source declarations lifted by the fixture, not a
  // fixture-owned duplicate of the collections. Missing runtime checks are observed.
  ["required title table weakened", "REQUIRED_REVISION_COLUMNS", ', "title"', ""],
  ["encrypted payload table weakened", "FORBIDDEN_REVISION_STORAGE_COLUMNS", '"secure_payload", ', ""],
  ["secure body table weakened", "FORBIDDEN_SECURE_REVISION_BODY_MEMBERS", '"body_markdown", ', ""],
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-revisions-selection.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const start = source.indexOf(`const ${name} = Object.freeze([`);
    const region = start === -1 ? extractFunctionBlock(source, name) : source.slice(start, source.indexOf("]);", start) + 3);
    assert.ok(region.includes(from), `${label}: intended mutation site must exist`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax errors are not caught breaks\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: an infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT: ${label}`);
      }
    } finally {
      writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, `${label}: byte restoration`);
    }
  }
} finally {
  writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, "final byte restoration");
  console.log(`Restored SHA-256 ${before}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
