import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/notes.js";
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);
const cases = [
  [
    "defaults passes through non-strings",
    "noteDefaultString",
    "return typeof value === \"string\" ? value : \"\";",
    "return value || \"\";"
  ],
  [
    "defaults coerces hostile objects",
    "noteDefaultString",
    "return typeof value === \"string\" ? value : \"\";",
    "return String(value || \"\");"
  ],
  [
    "defaults trims valid content",
    "noteDefaultString",
    "? value : \"\"",
    "? value.trim() : \"\""
  ],
  [
    "defaults accepts top-level arrays",
    "normalizeNoteEditorDefaults",
    "isResponseRecord(params) ? params : {}",
    "params || {}"
  ],
  [
    "defaults accepts non-record context",
    "normalizeNoteEditorDefaults",
    "isResponseRecord(input.context) ? input.context : {}",
    "input.context || {}"
  ],
  [
    "defaults reverses body precedence",
    "normalizeNoteEditorDefaults",
    "noteDefaultString(input.body_markdown) || noteDefaultString(input.bodyMarkdown)",
    "noteDefaultString(input.bodyMarkdown) || noteDefaultString(input.body_markdown)"
  ],
  [
    "defaults omits context client",
    "normalizeNoteEditorDefaults",
    "noteDefaultString(context.clientId)",
    "\"\""
  ],
  [
    "defaults omits context project",
    "normalizeNoteEditorDefaults",
    "noteDefaultString(context.projectId)",
    "\"\""
  ],
  [
    "defaults drops secure mode alias",
    "normalizeNoteEditorDefaults",
    "noteDefaultString(input.securityMode)",
    "\"\""
  ],
  [
    "defaults includes unrelated input",
    "normalizeNoteEditorDefaults",
    "return {",
    "return { ...input,"
  ],
  [
    "add editor receives saved record",
    "openNoteEditor",
    "mode === \"add\" ? null : note",
    "note"
  ],
  [
    "editor drops record alias",
    "openNoteEditor",
    "params.note || params.record || params.noteRecord",
    "params.note || params.noteRecord"
  ],
  [
    "editor loses explicit focus",
    "openNoteEditor",
    "params.returnFocusTo || params.trigger || hostContext?.trigger",
    "hostContext?.trigger"
  ],
  [
    "editor ignores host result",
    "openNoteEditor",
    "return hostContext?.result || result;",
    "return result;"
  ],
  [
    "payload ignores textarea controller",
    "readEditorPayload",
    "editor?.getValue() || requireNotesValue(bodyInput).value",
    "requireNotesValue(bodyInput).value"
  ],
  [
    "payload sends blank collection instead of null",
    "readEditorPayload",
    "requireNotesValue(collectionInput).value || null",
    "requireNotesValue(collectionInput).value"
  ],
  [
    "payload exposes Personal visibility field",
    "readEditorPayload",
    "normalizeWorkspaceType(state.workspaceType) === \"personal\"",
    "false"
  ],
  [
    "payload ignores secure control",
    "readEditorPayload",
    "security_mode: requireNotesValue(securityInput).value",
    "security_mode: \"normal\""
  ],
  [
    "payload invents task context",
    "readEditorPayload",
    "task_id: null",
    "task_id: \"task\""
  ],
  [
    "payload resends staged links on edit",
    "readEditorPayload",
    "!state.editingNoteId ? stagedLinkPayloads() : []",
    "stagedLinkPayloads()"
  ],
  [
    "non-business visibility keeps client-visible",
    "readEditorVisibility",
    "? \"internal\"",
    "? \"client_visible\""
  ],
  [
    "save always creates a new note",
    "saveNoteForm",
    "const result = state.editingNoteId",
    "const result = false"
  ],
  [
    "save fails to encode edited ID",
    "saveNoteForm",
    "encodeURIComponent(state.editingNoteId)",
    "state.editingNoteId"
  ],
  [
    "save skips host refresh",
    "saveNoteForm",
    "await state.editorHostContext.refresh(result);",
    "void result;"
  ],
  [
    "save bypasses checked detail",
    "saveNoteForm",
    "requireNoteFromEnvelope(result)",
    "result.note"
  ],
  [
    "create save skips transition",
    "saveNoteForm",
    "await transitionCreatedNoteToEdit(savedNote);",
    "void savedNote;"
  ],
  [
    "save always closes editor",
    "saveNoteForm",
    "if (closeOnSuccess)",
    "if (true)"
  ],
  [
    "save leaves buttons disabled",
    "saveNoteForm",
    "requireNotesValue(saveCloseButton).disabled = false;",
    "requireNotesValue(saveCloseButton).disabled = true;"
  ],
  [
    "save swallows partial failure",
    "saveNoteForm",
    "throw error;",
    "return null;"
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-editor-defaults.test.mjs"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = name === "types" ? source : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    const broken = source.replace(region, region.replaceAll(from, to));
    try {
      writeFileSync(sourcePath, broken);
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-editor-defaults.test.mjs"],
        { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) {
        inert.push(label);
        console.log(`INERT: ${label} - re-aim before claiming coverage`);
      } else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1;
        console.log(`CAUGHT (syntax valid, assertion failed): ${label}`);
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
