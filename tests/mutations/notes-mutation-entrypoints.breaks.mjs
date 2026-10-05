import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
// Run alone: each child lifts the temporarily changed Notes controller.
// This uses the retained-backup and bounded suite form from .40.27 unchanged.
// Shared mutation-runner maintenance belongs to Claude; this is only this surface's case table.
// No declaration-line mutation credit: fixtures do not establish runtime state declarations.
// Every inert case must be diagnosed here before delivery; none has been withdrawn.
const path = "public/js/notes.js", original = readFileSync(path);
/** @param {Buffer} bytes */ const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = hash(original), backup = join(mkdtempSync(join(tmpdir(), "ltf-notes-mutation-entrypoints-")), "notes.js");
writeFileSync(backup, original); assert.equal(hash(readFileSync(backup)), sha);
console.log(`Source byte backup: ${backup}`);
const cases = [
  [
    "add identity is not encoded",
    "addNoteLink",
    "encodeURIComponent(note.note_id)",
    "note.note_id"
  ],
  [
    "add loses payload identity",
    "addNoteLink",
    "/links`, payload",
    "/links`, {}"
  ],
  [
    "add refresh runs before write completes",
    "addNoteLink",
    "await api.postJson",
    "api.postJson"
  ],
  [
    "add no longer awaits selection",
    "addNoteLink",
    "await selectNote",
    "selectNote"
  ],
  [
    "add selects a different note",
    "addNoteLink",
    "selectNote(note.note_id)",
    "selectNote(\"other\")"
  ],
  [
    "remove prefers legacy over camel identity",
    "removeNoteLink",
    "link.noteLinkId || link.note_link_id",
    "link.note_link_id || link.noteLinkId"
  ],
  [
    "remove drops legacy identity",
    "removeNoteLink",
    "link.noteLinkId || link.note_link_id",
    "link.noteLinkId"
  ],
  [
    "remove omits link identity encoding",
    "removeNoteLink",
    "encodeURIComponent(String(noteLinkId))",
    "String(noteLinkId)"
  ],
  [
    "remove starts selection before write completion",
    "removeNoteLink",
    "await api.postJson",
    "api.postJson"
  ],
  [
    "remove loses selection refresh",
    "removeNoteLink",
    "await selectNote(note.note_id);",
    ""
  ],
  [
    "remove changes empty payload",
    "removeNoteLink",
    "/remove`, {}",
    "/remove`, { changed: true }"
  ],
  [
    "archive no longer awaits mutation",
    "archiveNote",
    "await mutateNote",
    "mutateNote"
  ],
  [
    "restore no longer awaits mutation",
    "restoreNote",
    "await mutateNote",
    "mutateNote"
  ],
  [
    "archive loses identity encoding",
    "archiveNote",
    "encodeURIComponent(note.note_id)",
    "note.note_id"
  ],
  [
    "restore invokes archive",
    "restoreNote",
    "}/restore",
    "}/archive"
  ],
  [
    "archive forwards mutation boolean as its own result",
    "archiveNote",
    "await mutateNote",
    "return await mutateNote"
  ],
  [
    "refresh loses no-store request",
    "refreshEditorNote",
    "{ cache: \"no-store\" }",
    "{}"
  ],
  [
    "refresh omits identity encoding",
    "refreshEditorNote",
    "encodeURIComponent(noteId)",
    "noteId"
  ],
  [
    "refresh publishes unreadable response",
    "refreshEditorNote",
    "requireNoteFromEnvelope(result)",
    "result.note"
  ],
  [
    "refresh loses editor publication",
    "refreshEditorNote",
    "state.editorNote = refreshed;",
    ""
  ],
  [
    "refresh overwrites unrelated selection",
    "refreshEditorNote",
    "state.selectedNote?.note_id === noteId",
    "true"
  ],
  [
    "refresh omits matching selection",
    "refreshEditorNote",
    "state.selectedNote?.note_id === noteId",
    "false"
  ],
  [
    "refresh loses detail render",
    "refreshEditorNote",
    "renderDetail(refreshed);",
    ""
  ],
  [
    "refresh loses selected state publication",
    "refreshEditorNote",
    "state.selectedNote = refreshed;",
    ""
  ],
  [
    "refresh draws before list read completes",
    "refreshEditorNote",
    "await loadNotes();",
    "loadNotes();"
  ],
  [
    "refresh omits list reload",
    "refreshEditorNote",
    "await loadNotes();",
    ""
  ],
  [
    "refresh omits list render",
    "refreshEditorNote",
    "renderNotes();",
    ""
  ],
  [
    "refresh omits context render",
    "refreshEditorNote",
    "renderEditorContextSelection();",
    ""
  ],
  [
    "refresh returns a copy instead of the checked record",
    "refreshEditorNote",
    "return refreshed;",
    "return { ...refreshed };"
  ],
  [
    "refresh loses return identity",
    "refreshEditorNote",
    "return refreshed;",
    "return;"
  ]
];
const suiteTimeoutMs = 30000;
const command = ["node_modules/vitest/vitest.mjs", "run", "--pool=threads", "--maxWorkers=1", "tests/unit/notes-mutation-entrypoints.test.mjs"];
function runSuite() { return spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true, timeout: suiteTimeoutMs, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 }); }
/** @param {ReturnType<typeof runSuite>} result */
function timedOut(result) { return result.error instanceof Error && "code" in result.error && result.error.code === "ETIMEDOUT"; }
function restore() { writeFileSync(path, original); assert.equal(hash(readFileSync(path)), sha, "restored Notes bytes"); }
let caught = 0, timeouts = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = runSuite();
  assert.equal(timedOut(baseline), false, "Baseline suite did not terminate within 30000ms; no mutation credit.");
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    const source = original.toString("utf8"), region = extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation site exists`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true, timeout: 10000, killSignal: "SIGKILL" });
      assert.equal(syntax.status, 0, `${label}: syntax refusal is not coverage\n${syntax.stderr}`);
      const result = runSuite(), output = result.stdout + result.stderr;
      if (timedOut(result)) { caught++; timeouts++; console.log(`REFUSED (suite did not terminate within ${suiteTimeoutMs}ms): ${label}`); }
      else if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else { assert.equal(result.status, 1, output); assert.match(output, /AssertionError/, `${label}: incidental crash is not coverage\n${output}`); caught++; console.log(`CAUGHT (assertion failed): ${label}`); }
    } finally { restore(); }
  }
} finally { restore(); assert.equal(hash(readFileSync(backup)), sha); console.log(`Restored SHA-256: ${sha}`); }
console.log(`${caught}/${cases.length} caught; ${timeouts} timeout refusals; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
