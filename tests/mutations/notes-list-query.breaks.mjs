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
    "query page size changes",
    "buildNotesListQuery",
    "String(PAGE_SIZE)",
    "\"99\""
  ],
  [
    "query sort ignored",
    "buildNotesListQuery",
    "sortSelect?.value || DEFAULT_NOTE_SORT",
    "DEFAULT_NOTE_SORT"
  ],
  [
    "query cursor omitted",
    "buildNotesListQuery",
    "if (cursor)",
    "if (false)"
  ],
  [
    "query library omitted",
    "buildNotesListQuery",
    "activeLibraryBucketFilter()",
    "\"\""
  ],
  [
    "query archive status ignored",
    "buildNotesListQuery",
    "activeStatusFilter()",
    "\"active\""
  ],
  [
    "query personal visibility sent",
    "buildNotesListQuery",
    "normalizeWorkspaceType(state.workspaceType) !== \"personal\"",
    "true"
  ],
  [
    "query security receiver key misspelled",
    "buildNotesListQuery",
    "\"security\", securityFilter",
    "\"unreadSecurity\", securityFilter"
  ],
  [
    "query note kind omitted",
    "buildNotesListQuery",
    "typeFilter?.value",
    "\"all\""
  ],
  [
    "query context omitted",
    "buildNotesListQuery",
    "normalizeText(contextFilter?.value)",
    "\"\""
  ],
  [
    "query owner omitted",
    "buildNotesListQuery",
    "normalizeText(ownerFilter?.value)",
    "\"\""
  ],
  [
    "query tags omitted",
    "buildNotesListQuery",
    "normalizeText(tagFilter?.value)",
    "\"\""
  ],
  [
    "query date omitted",
    "buildNotesListQuery",
    "updatedFilter?.value || \"\"",
    "\"\""
  ],
  [
    "query collection precedence reversed",
    "buildNotesListQuery",
    "state.selectedCollectionId || collectionFilter?.value",
    "collectionFilter?.value || state.selectedCollectionId"
  ],
  [
    "query invents a required search term",
    "buildNotesListQuery",
    "const params = new URLSearchParams();",
    "const params = new URLSearchParams({ q: \"required\" });"
  ],
  [
    "render page label wrong",
    "renderNotes",
    "`Page ${state.page}`",
    "`Page ${state.page + 1}`"
  ],
  [
    "render previous page ignored",
    "renderNotes",
    "state.notesCursorStack.length === 0",
    "true"
  ],
  [
    "render next page ignored",
    "renderNotes",
    "!state.notesNextCursor",
    "true"
  ],
  [
    "render empty message changed",
    "renderNotes",
    "No notes match the current filters.",
    "No records."
  ],
  [
    "render truncates server page",
    "renderNotes",
    "pageNotes.map(noteListItem)",
    "pageNotes.slice(0, 12).map(noteListItem)"
  ],
  [
    "render reorders server page",
    "renderNotes",
    "pageNotes.map(noteListItem)",
    "pageNotes.reverse().map(noteListItem)"
  ],
  [
    "render bulk toolbar not synchronized",
    "renderNotes",
    "syncNotesBulkToolbar();",
    "void 0;"
  ],
  [
    "render required list silently skipped",
    "renderNotes",
    "requireNotesValue(notesList);",
    "void 0;"
  ],
  [
    "preview hidden gate ignored",
    "renderPreview",
    "if (requireNotesValue(preview).hidden)",
    "if (false)"
  ],
  [
    "preview ignores editor body",
    "renderPreview",
    "editor?.getValue() || requireNotesValue(bodyInput).value",
    "requireNotesValue(bodyInput).value"
  ],
  [
    "preview truncates input",
    "renderPreview",
    "{ body_markdown: markdown }",
    "{ body_markdown: markdown.slice(0, 12) }"
  ],
  [
    "preview request generation frozen",
    "renderPreview",
    "state.previewRequestId + 1",
    "state.previewRequestId"
  ],
  [
    "preview loading state missing",
    "renderPreview",
    "\"Loading preview...\"",
    "\"\""
  ],
  [
    "preview accepts raw envelope",
    "renderPreview",
    "readMarkdownPreview(await api.postJson(\"/api/notes/preview\", { body_markdown: markdown }))",
    "await api.postJson(\"/api/notes/preview\", { body_markdown: markdown })"
  ],
  [
    "preview stale responses overwrite latest",
    "renderPreview",
    "if (requestId !== state.previewRequestId)",
    "if (false)"
  ],
  [
    "preview assigns wrong format",
    "renderPreview",
    "preview.innerHTML = rendered.bodyHtml;",
    "preview.innerHTML = rendered.bodyMarkdown;"
  ],
  [
    "preview link preference omitted",
    "renderPreview",
    "applyExternalMarkdownLinkPreference(preview);",
    "void 0;"
  ],
  [
    "preview empty fallback skipped",
    "renderPreview",
    "if (!requireNotesValue(preview).textContent.trim())",
    "if (false)"
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-list-query.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-list-query.test.mjs"],
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
