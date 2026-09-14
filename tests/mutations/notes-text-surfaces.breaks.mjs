import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
// Run alone: each child lifts the temporarily mutated Notes source.
// The real shared view builder executes; no fixture-generated option/label answer is asserted.
// Type-only declarations have no runtime mutation credit; the strict ledger measures them.
// The first optional-page-status mutant used an invalid optional-chain assignment.
// node --check rejected it with no coverage credit; re-aimed as a valid early no-op guard.
// No inert mutation has been withdrawn. The required-control timing test records actual
// construction and replacement, rather than checking a spelling or merely building a prompt.
const path = "public/js/notes.js", original = readFileSync(path);
/** @param {Buffer} bytes */ const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = hash(original);
const cases = [
  [
    "option element kind",
    "notesOptionElement",
    "createElement(\"option\"",
    "createElement(\"span\""
  ],
  [
    "option label discarded",
    "notesOptionElement",
    "text: label",
    "text: \"\""
  ],
  [
    "option value discarded",
    "notesOptionElement",
    "attrs: { value }",
    "attrs: { value: \"\" }"
  ],
  [
    "label kind",
    "noteFieldLabel",
    "createElement(\"label\"",
    "createElement(\"div\""
  ],
  [
    "label order",
    "noteFieldLabel",
    "[labelText, control]",
    "[control, labelText]"
  ],
  [
    "label text omitted",
    "noteFieldLabel",
    "[labelText, control]",
    "[control]"
  ],
  [
    "control omitted",
    "noteFieldLabel",
    "[labelText, control]",
    "[labelText]"
  ],
  [
    "control identity stringified",
    "noteFieldLabel",
    "[labelText, control]",
    "[labelText, String(control)]"
  ],
  [
    "empty list appends stale rows",
    "renderEmptyList",
    "replaceChildren(empty)",
    "appendChild(empty)"
  ],
  [
    "empty list replacement omitted",
    "renderEmptyList",
    "requireNotesValue(notesList).replaceChildren(empty);",
    ""
  ],
  [
    "empty list toolbar omitted",
    "renderEmptyList",
    "syncNotesBulkToolbar();",
    ""
  ],
  [
    "empty list synchronization reordered",
    "renderEmptyList",
    "requireNotesValue(notesList).replaceChildren(empty);\n    syncNotesBulkToolbar();",
    "syncNotesBulkToolbar();\n    requireNotesValue(notesList).replaceChildren(empty);"
  ],
  [
    "empty list refusal becomes optional",
    "renderEmptyList",
    "requireNotesValue(notesList).replaceChildren(empty);",
    "notesList?.replaceChildren(empty);"
  ],
  [
    "empty list refusal moved before construction",
    "renderEmptyList",
    "const empty = document.createElement(\"p\");",
    "requireNotesValue(notesList);\n    const empty = document.createElement(\"p\");"
  ],
  [
    "page status refusal becomes optional",
    "setStatus",
    "requireNotesValue(statusMessage).textContent = message;",
    "if (!statusMessage) return;\n    requireNotesValue(statusMessage).textContent = message;"
  ],
  [
    "editor fallback omitted",
    "setEditorFormStatus",
    "setStatus(message, isError);",
    ""
  ],
  [
    "editor fallback loses error flag",
    "setEditorFormStatus",
    "setStatus(message, isError);",
    "setStatus(message);"
  ],
  [
    "editor status always redirects",
    "setEditorFormStatus",
    "if (!formStatus)",
    "if (true)"
  ],
  [
    "absent bulk status redirects",
    "setBulkFormStatus",
    "return;",
    "setStatus(message, isError);\n      return;"
  ],
  [
    "emptyText element kind",
    "emptyText",
    "createElement(\"p\")",
    "createElement(\"div\")"
  ],
  [
    "emptyText class",
    "emptyText",
    "\"notes-empty-state\"",
    "\"other\""
  ],
  [
    "emptyText text omitted",
    "emptyText",
    "empty.textContent = message;",
    "empty.textContent = \"\";"
  ],
  [
    "lockedNotice element kind",
    "lockedNotice",
    "createElement(\"p\")",
    "createElement(\"div\")"
  ],
  [
    "lockedNotice class",
    "lockedNotice",
    "\"notes-locked-state\"",
    "\"other\""
  ],
  [
    "lockedNotice text omitted",
    "lockedNotice",
    "notice.textContent = message;",
    "notice.textContent = \"\";"
  ],
  [
    "statusBadge element kind",
    "statusBadge",
    "createElement(\"span\")",
    "createElement(\"div\")"
  ],
  [
    "statusBadge class",
    "statusBadge",
    "\"notes-status-badge\"",
    "\"other\""
  ],
  [
    "statusBadge text omitted",
    "statusBadge",
    "badge.textContent = label;",
    "badge.textContent = \"\";"
  ],
  [
    "renderEmptyList element kind",
    "renderEmptyList",
    "createElement(\"p\")",
    "createElement(\"div\")"
  ],
  [
    "renderEmptyList class",
    "renderEmptyList",
    "\"notes-empty-state\"",
    "\"other\""
  ],
  [
    "renderEmptyList text omitted",
    "renderEmptyList",
    "empty.textContent = message;",
    "empty.textContent = \"\";"
  ],
  [
    "setStatus text omitted",
    "setStatus",
    "requireNotesValue(statusMessage).textContent = message;",
    "requireNotesValue(statusMessage).textContent = \"\";"
  ],
  [
    "setStatus error flag inverted",
    "setStatus",
    "toggle(\"error-text\", isError)",
    "toggle(\"error-text\", !isError)"
  ],
  [
    "setStatus error not cleared",
    "setStatus",
    "requireNotesValue(statusMessage).classList.toggle(\"error-text\", isError);",
    "if (isError) requireNotesValue(statusMessage).classList.add(\"error-text\");"
  ],
  [
    "setEditorFormStatus text omitted",
    "setEditorFormStatus",
    "formStatus.textContent = message;",
    "formStatus.textContent = \"\";"
  ],
  [
    "setEditorFormStatus error flag inverted",
    "setEditorFormStatus",
    "toggle(\"error-text\", isError)",
    "toggle(\"error-text\", !isError)"
  ],
  [
    "setEditorFormStatus error not cleared",
    "setEditorFormStatus",
    "formStatus.classList.toggle(\"error-text\", isError);",
    "if (isError) formStatus.classList.add(\"error-text\");"
  ],
  [
    "setBulkFormStatus text omitted",
    "setBulkFormStatus",
    "bulkFormStatus.textContent = message;",
    "bulkFormStatus.textContent = \"\";"
  ],
  [
    "setBulkFormStatus error flag inverted",
    "setBulkFormStatus",
    "toggle(\"error-text\", isError)",
    "toggle(\"error-text\", !isError)"
  ],
  [
    "setBulkFormStatus error not cleared",
    "setBulkFormStatus",
    "bulkFormStatus.classList.toggle(\"error-text\", isError);",
    "if (isError) bulkFormStatus.classList.add(\"error-text\");"
  ]
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-text-surfaces.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
function restore() { writeFileSync(path, original); assert.equal(hash(readFileSync(path)), sha, "restored Notes bytes"); }
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    const source = original.toString("utf8");
    const region = extractFunctionBlock(source, name);
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
