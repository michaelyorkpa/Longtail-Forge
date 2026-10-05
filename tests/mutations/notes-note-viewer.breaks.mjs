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
  ["missing identity reaches viewer setup", "openNoteViewer", "if (!noteId)", "if (false)"],
  ["viewer skips workspace readiness", "openNoteViewer", "await requireNamespace().workspaceContextReady;", "void requireNamespace().workspaceContextReady;"],
  ["viewer reads without route encoding", "openNoteViewer", "encodeURIComponent(noteId)", "noteId"],
  ["viewer permits cached detail", "openNoteViewer", 'cache: "no-store"', 'cache: "default"'],
  ["viewer bypasses checked detail", "openNoteViewer", "requireNoteFromEnvelope(result)", "result.note"],
  ["viewer skips replacement", "openNoteViewer", "if (activeNoteViewDialog?.isConnected)", "if (false)"],
  ["closing old viewer clears new viewer", "openNoteViewer", "if (activeNoteViewDialog === dialog)", "if (true)"],
  ["edit cancels view host prematurely", "openNoteViewer", 'if (dialog.returnValue !== "edit")', "if (true)"],
  ["viewer fails to remove closed dialog", "openNoteViewer", "dialog.remove();", "dialog.dataset.remained = 'yes';"],
  ["viewer ignores host result", "openNoteViewer", "return hostContext?.result || closeResult;", "return 'wrong-result';"],
  ["viewer uses raw Markdown", "renderNoteViewDialog", 'note.body_html || ""', 'note.body_markdown || ""'],
  ["viewer omits external link preference", "renderNoteViewDialog", "applyExternalMarkdownLinkPreference(body);", "void body;"],
  ["archived note remains editable", "renderNoteViewDialog", 'editAction.disabled = note.status === "archived";', "editAction.disabled = false;"],
  ["secure empty body uses ordinary copy", "renderNoteViewDialog", "isSecureNote(note) ?", "false ?"],
  ["edit listener permits duplicate handoffs", "renderNoteViewDialog", "once: true", "once: false"],
  ["unavailable viewer exposes error", "noteViewErrorMessage", 'return "Note is unavailable or you do not have access.";', "return error.message;"],
  ["handoff does not close viewer", "openNoteViewEditHandoff", 'view.closeModal(dialog, "edit");', "void dialog;"],
  ["handoff changes edit to add", "openNoteViewEditHandoff", 'mode: "edit"', 'mode: "add"'],
  ["handoff loses caller focus", "openNoteViewEditHandoff", "params.returnFocusTo || hostContext?.trigger", "hostContext?.trigger"],
  ["handoff skips rejection cancellation", "openNoteViewEditHandoff", "hostContext?.cancel?.({", "Object?.assign?.({"],
  ["metadata exposes personal visibility", "detailMetaItems", 'normalizeWorkspaceType(state.workspaceType) === "personal"', "false"],
  ["metadata lacks accessible names", "detailMetaItems", 'item.setAttribute("aria-label",', 'item.setAttribute("data-label",'],
  ["metadata adds trailing separator", "detailMetaItems", "index < items.length - 1", "index < items.length"],
  ["metadata loses owner fallback", "detailMetaItems", 'note.owner_display_name || "Unavailable owner"', "note.owner_display_name"],
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-note-viewer.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-note-viewer.test.mjs"],
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
