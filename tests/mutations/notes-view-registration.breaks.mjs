import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof. Never run while a server or another check reads notes.js.
const sourcePath = "public/js/notes.js";
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);
const cases = [
  ["required view silently missing", "requireView", "throw new Error(\"Notes requires LongtailForge.view.\");", "return undefined;"],
  ["view identity copied", "requireView", "return factory;", "return { ...factory };"],
  ["missing view error changed", "requireView", "Notes requires LongtailForge.view.", "Missing view."],
  ["unavailable registration throws", "registerNotesViewBehaviors", "      return;", "      throw new Error(\"Unavailable\");"],
  ["registration guard accepts nonfunctions", "registerNotesViewBehaviors", "typeof view.registerBehavior !== \"function\"", "!view.registerBehavior"],
  ["registration bypasses full renderer checks", "registerNotesViewBehaviors", "requireDescriptorRenderers().registerBehavior", "view.registerBehavior"],
  ["create behavior renamed", "registerNotesViewBehaviors", "\"notes.create\"", "\"notes.new\""],
  ["create passes selected note", "registerNotesViewBehaviors", "() => openEditor()", "() => openEditor(state.selectedNote)"],
  ["create result swallowed", "registerNotesViewBehaviors", "() => openEditor()", "() => { openEditor(); }"],
  ["library mount appends stale children", "registerNotesViewBehaviors", "container.replaceChildren(createNotesLibraryChrome())", "container.appendChild(createNotesLibraryChrome())"],
  ["footer order reversed", "registerNotesViewBehaviors", "createNotesListSortControl(), createNotesPagination()", "createNotesPagination(), createNotesListSortControl()"],
  ["footer omits pagination", "registerNotesViewBehaviors", "createNotesListSortControl(), createNotesPagination()", "createNotesListSortControl()"],
  ["tag callback wrapped", "registerNotesViewBehaviors", "\"notes.filters.tags\", hydrateNoteTagFilterOptions", "\"notes.filters.tags\", () => hydrateNoteTagFilterOptions()"],
  ["workflow registration order reversed", "registerNotesViewBehaviors", "Object.keys(NOTE_WORKFLOW_HANDLERS).forEach", "Object.keys(NOTE_WORKFLOW_HANDLERS).reverse().forEach"],
  ["renderer record ignored", "registerNotesViewBehaviors", "record || state.selectedNote", "state.selectedNote"],
  ["selected fallback omitted", "registerNotesViewBehaviors", "record || state.selectedNote", "record"],
  ["fallback only handles nullish", "registerNotesViewBehaviors", "record || state.selectedNote", "record ?? state.selectedNote"],
  ["workflow ignores behavior id", "runNoteWorkflow", "NOTE_WORKFLOW_HANDLERS[behaviorId]", "NOTE_WORKFLOW_HANDLERS[\"notes.workflow.edit\"]"],
  ["workflow copies record", "runNoteWorkflow", "handler(note)", "handler({ ...note })"],
  ["workflow drops result", "runNoteWorkflow", "return handler(note);", "handler(note);"],
  ["workflow changes empty result", "runNoteWorkflow", "return undefined;", "return null;"],
  ["workflow loses falsy guard", "runNoteWorkflow", "!handler || !note", "!handler"],
  ["workflow changes inherited lookup", "runNoteWorkflow", "NOTE_WORKFLOW_HANDLERS[behaviorId]", "Object.hasOwn(NOTE_WORKFLOW_HANDLERS, behaviorId) ? NOTE_WORKFLOW_HANDLERS[behaviorId] : undefined"],
  ["dialog title changed", "createNoteViewDialog", "title: \"View Note\"", "title: \"Edit Note\""],
  ["dialog width changed", "createNoteViewDialog", "size: \"wide\"", "size: \"default\""],
  ["dialog live region changed", "createNoteViewDialog", "\"aria-live\": \"polite\"", "\"aria-live\": \"off\""],
  ["dialog loading state lost", "createNoteViewDialog", "emptyText(\"Loading note...\")", "emptyText(\"\")"],
  ["dialog body omitted", "createNoteViewDialog", "body: [body]", "body: []"],
  ["dialog action order reversed", "createNoteViewDialog", "actions: [closeAction, editAction]", "actions: [editAction, closeAction]"],
  ["dialog edit prematurely enabled", "createNoteViewDialog", "disabled: true", "disabled: false"],
  ["dialog close becomes primary", "createNoteViewDialog", "role: \"secondary\"", "role: \"primary\""],
  ["dialog footer class removed", "createNoteViewDialog", "className: \"surface-modal-footer-action\"", "className: \"\""],
  ["dialog closes wrong object", "createNoteViewDialog", "view.closeModal(dialog, \"close\")", "view.closeModal(null, \"close\")"],
  ["dialog close reason changed", "createNoteViewDialog", "view.closeModal(dialog, \"close\")", "view.closeModal(dialog, \"cancel\")"],
  ["dialog identity trimmed", "createNoteViewDialog", "dialog.dataset.noteId = noteId", "dialog.dataset.noteId = noteId.trim()"],
  ["mutation accepts non-record envelope", "requireNoteMutationId", "isResponseRecord(result) ? result.note : null", "{ note_id: 'note_1' }"],
  ["identity accepts empty text", "hasNoteIdentity", 'note.note_id.trim() !== ""', 'true'],
  ["identity accepts arrays", "hasNoteIdentity", 'isResponseRecord(note)', 'note !== null && typeof note === "object"'],
  ["mutation bypasses identity validation", "requireNoteMutationId", "!hasNoteIdentity(note)", "false"],
  ["mutation coerces identity", "requireNoteMutationId", "return note.note_id;", "return String(note.note_id).trim();"],
  ["mutation demands full detail again", "mutateNote", "requireNoteMutationId(result)", "requireNoteFromEnvelope(result).note_id"],
  ["mutation forgets collections refresh", "mutateNote", "loadCollections(), loadNotes()", "loadNotes()"],
  ["mutation forgets list refresh", "mutateNote", "loadCollections(), loadNotes()", "loadCollections()"],
  ["mutation reads identity before refresh", "mutateNote", "await Promise.all([loadCollections(), loadNotes()]);", "requireNoteMutationId(result); await Promise.all([loadCollections(), loadNotes()]);"],
  ["mutation does not await refresh", "mutateNote", "await Promise.all", "void Promise.all"],
  ["mutation selects another identity", "mutateNote", "selectNote(requireNoteMutationId(result))", "selectNote('wrong-note')"],
  ["mutation replays POST after committing", "mutateNote", "writeCompleted = true;", "writeCompleted = true; await api.postJson(url, {});"],
  ["mutation claims failed write succeeded", "mutateNote", "let writeCompleted = false;", "let writeCompleted = true;"],
  ["mutation reports committed write as failed", "mutateNote", "writeCompleted = true;", "writeCompleted = false;"],
  ["mutation clears failed detail status", "mutateNote", "if (!selected)", "if (false)"],
  ["selection reports read failure as success", "selectNote", "return false;", "return true;"],
  ["selection skips full detail validation", "selectNote", "requireNoteFromEnvelope(result)", "result.note"],
  ["full detail accepts missing tags", "isNoteListItem", 'hasArrayMembers(value, ["tags"])', "true"],
  ["full detail accepts missing links", "isNoteRecord", 'hasArrayMembers(value, ["links"])', "true"],
  ["full detail accepts missing owner", "isNoteRecord", "hasTextColumns(value, REQUIRED_NOTE_DETAIL_COLUMNS)", "true"],
  ["edit adapter bypasses seed validation", "workflowMap", "openEditor(requireNoteWorkflowEditorSeed(note))", "openEditor(note)"],
  ["archive adapter bypasses identity validation", "workflowMap", "archiveNote(requireNoteWorkflowIdentity(note))", "archiveNote(note)"],
  ["restore adapter bypasses identity validation", "workflowMap", "restoreNote(requireNoteWorkflowIdentity(note))", "restoreNote(note)"],
  ["workflow seed requires full detail", "isNoteWorkflowEditorSeed", "return isResponseRecord(note)", "return isResponseRecord(note) && Array.isArray(note.tags)"],
  ["workflow seed rejects nullable context", "isNoteWorkflowEditorSeed", "note[key] === null || ", ""],
  ["workflow seed ignores text field types", "isNoteWorkflowEditorSeed", 'typeof note[key] === "string"', "true"],
  ["workflow seed copies caller context", "requireNoteWorkflowEditorSeed", "return note;", "return { ...note };"],
  ["workflow identity copies record", "requireNoteWorkflowIdentity", "return note;", "return { ...note };"],

  ["regression rejects edit routed to archive", "workflowMap", "openEditor(requireNoteWorkflowEditorSeed(note))", "archiveNote(requireNoteWorkflowEditorSeed(note))", "regression"],
  ["regression rejects archive routed to restore", "workflowMap", "archiveNote(requireNoteWorkflowIdentity(note))", "restoreNote(requireNoteWorkflowIdentity(note))", "regression"],
  ["regression rejects restore routed to archive", "workflowMap", "restoreNote(requireNoteWorkflowIdentity(note))", "archiveNote(requireNoteWorkflowIdentity(note))", "regression"],

  ["peer guards reject unchecked mutation identity", "mutateNote", "requireNoteMutationId(result)", "result.note.note_id", "peers"],

  ["regression rejects copied workflow identity", "requireNoteWorkflowIdentity", "return note;", "return { ...note };", "regression"],

];

const verificationEnv = { ...process.env };
for (const key of ["LONGTAIL_LOCAL_STORAGE_ROOT", "LONGTAIL_PUBLIC_URL", "SUPER_ADMIN_PASSWORD", "SECURE_NOTES_MASTER_KEY"]) delete verificationEnv[key];
let caught = 0;
/** @type {string[]} */ const inert = [];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-view-registration.test.mjs", "tests/unit/note-mutation-identity-contracts.test.mjs"];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  const regressionBaseline = spawnSync(process.execPath, ["scripts/notes-ui-workflow-regression.mjs"], { encoding: "utf8", windowsHide: true, env: verificationEnv });
  assert.equal(regressionBaseline.status, 0, regressionBaseline.stdout + regressionBaseline.stderr);
  const peerBaseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/markdown-preview-contracts.test.mjs", "tests/unit/note-link-target-contracts.test.mjs"], { encoding: "utf8", windowsHide: true });
  assert.equal(peerBaseline.status, 0, peerBaseline.stdout + peerBaseline.stderr);
  for (const [label, name, from, to, proof] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = name === "workflowMap"
      ? source.slice(source.indexOf("const NOTE_WORKFLOW_HANDLERS ="), source.indexOf("const NOTE_EDITOR_TOOLBAR_ACTIONS ="))
      : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    try {
      writeFileSync(sourcePath, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, proof === "regression" ? ["scripts/notes-ui-workflow-regression.mjs"]
        : proof === "peers" ? ["node_modules/vitest/vitest.mjs", "run", "tests/unit/markdown-preview-contracts.test.mjs", "tests/unit/note-link-target-contracts.test.mjs"] : command,
        { encoding: "utf8", windowsHide: true, env: verificationEnv });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label} - re-aim before claiming coverage`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT (${proof || "unit"}; syntax valid, assertion failed): ${label}`);
      }
    } finally {
      writeFileSync(sourcePath, original);
      assert.equal(hash(readFileSync(sourcePath)), beforeHash, `${label}: byte restoration failed`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  assert.equal(hash(readFileSync(sourcePath)), beforeHash, "final byte restoration failed");
  console.log(`Restored SHA-256 ${beforeHash}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Re-aim inert breaks: ${inert.join(", ")}`);
