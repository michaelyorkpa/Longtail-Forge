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
    "task priority lost",
    "deriveSuggestedLibraryBucket",
    "if (requireNotesValue(taskInput).value)",
    "if (false)"
  ],
  [
    "client link ignored",
    "deriveSuggestedLibraryBucket",
    "requireNotesValue(clientInput).value ||",
    ""
  ],
  [
    "project link ignored",
    "deriveSuggestedLibraryBucket",
    "requireNotesValue(projectInput).value ||",
    ""
  ],
  [
    "user link ignored",
    "deriveSuggestedLibraryBucket",
    "|| requireNotesValue(userInput).value",
    ""
  ],
  [
    "empty inputs suggest work",
    "deriveSuggestedLibraryBucket",
    "return \"reference\"",
    "return \"active_work\""
  ],
  [
    "task missing control ignored",
    "deriveSuggestedLibraryBucket",
    "requireNotesValue(taskInput).value",
    "taskInput?.value"
  ],
  [
    "preferred suggestion ignored",
    "updateLibrarySuggestion",
    "(\"preferredSuggestion\" in options ? options.preferredSuggestion : undefined)",
    "undefined"
  ],
  [
    "nontext preferred value accepted",
    "updateLibrarySuggestion",
    "typeof suggestion !== \"string\"",
    "false"
  ],
  [
    "empty preference stops fallback",
    "updateLibrarySuggestion",
    "|| deriveSuggestedLibraryBucket()",
    "?? deriveSuggestedLibraryBucket()"
  ],
  [
    "manual library overwritten",
    "updateLibrarySuggestion",
    "!state.libraryManuallyChanged &&",
    ""
  ],
  [
    "saved library overwritten",
    "updateLibrarySuggestion",
    "!state.editingNoteId &&",
    ""
  ],
  [
    "already suggested library refreshed",
    "updateLibrarySuggestion",
    "current !== suggestion &&",
    ""
  ],
  [
    "nondefault library overwritten",
    "updateLibrarySuggestion",
    "&& current === defaultLibraryForCreate()",
    ""
  ],
  [
    "suggestion display omitted",
    "updateLibrarySuggestion",
    "`Suggested Library: ${libraryLabel(suggestion)}`",
    "\"\""
  ],
  [
    "suggestion library not updated",
    "updateLibrarySuggestion",
    "requireNotesValue(libraryInput).value = suggestion;",
    ";"
  ],
  [
    "suggestion collections not refreshed",
    "updateLibrarySuggestion",
    "populateNoteCollectionOptions(suggestion);",
    ";"
  ],
  [
    "suggestion absent message silently skipped",
    "updateLibrarySuggestion",
    "requireNotesValue(suggestionMessage).textContent =",
    "if (suggestionMessage) suggestionMessage.textContent ="
  ],
  [
    "active bucket default ignored",
    "defaultLibraryForCreate",
    "? state.activeBucket",
    "? \"reference\""
  ],
  [
    "archived collections offered",
    "populateNoteCollectionOptions",
    "&& collection.status !== \"archived\"",
    ""
  ],
  [
    "wrong bucket collections offered",
    "populateNoteCollectionOptions",
    "collection.library_bucket === libraryBucket &&",
    ""
  ],
  [
    "collection selected value discarded",
    "populateNoteCollectionOptions",
    "? previousValue : \"\"",
    "? \"\" : \"\""
  ],
  [
    "saved link dispatch skipped",
    "handleEditorLinkedContextRemove",
    "if (item.link)",
    "if (false)"
  ],
  [
    "saved link loses current note",
    "handleEditorLinkedContextRemove",
    "state.editorNote || {}",
    "{}"
  ],
  [
    "saved link payload substituted",
    "handleEditorLinkedContextRemove",
    "{}, item.link",
    "{}, item.target"
  ],
  [
    "staged dispatch skipped",
    "handleEditorLinkedContextRemove",
    "else if (item.target)",
    "else if (false)"
  ],
  [
    "both removal paths dispatch",
    "handleEditorLinkedContextRemove",
    "} else if (item.target)",
    "} if (item.target)"
  ],
  [
    "dispatch returns owner promise",
    "handleEditorLinkedContextRemove",
    "      removeEditorNoteLink(",
    "      return removeEditorNoteLink("
  ],
  [
    "staged matching inverted",
    "removeEditorStagedTarget",
    "!editorLinkTargetMatches(stagedTarget, target)",
    "editorLinkTargetMatches(stagedTarget, target)"
  ],
  [
    "selected staged target retained",
    "removeEditorStagedTarget",
    "state.editorSelectedTarget = null;",
    ";"
  ],
  [
    "staged removal render omitted",
    "removeEditorStagedTarget",
    "renderEditorContextSelection();",
    ";"
  ],
  [
    "staged removal suggestion omitted",
    "removeEditorStagedTarget",
    "updateLibrarySuggestion();",
    ";"
  ],
  [
    "saved removal loses id precedence",
    "removeEditorNoteLink",
    "note?.note_id || state.editingNoteId",
    "state.editingNoteId || note?.note_id"
  ],
  [
    "saved removal loses legacy link id",
    "removeEditorNoteLink",
    "link.noteLinkId || link.note_link_id",
    "link.noteLinkId"
  ],
  [
    "saved removal refresh omitted",
    "removeEditorNoteLink",
    "await refreshEditorNote(noteId);",
    ";"
  ],
  [
    "saved removal error message lost",
    "removeEditorNoteLink",
    "\"Linked context could not be removed.\"",
    "\"\""
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-linked-context.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-linked-context.test.mjs"],
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
