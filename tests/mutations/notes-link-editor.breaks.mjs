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
  ["unavailable becomes selectable", "pickerRecordFromTarget", "target.isAvailable !== false && target.is_available !== false", "true"],
  ["empty module becomes a guessed module", "pickerRecordFromTarget", 'target.moduleId || target.module_id || ""', 'target.moduleId || target.module_id || "notes"'],
  ["source URL is discarded", "pickerRecordFromTarget", 'sourceUrl: target.sourceUrl || target.source_url || ""', 'sourceUrl: ""'],
  ["key drops module identity", "editorLinkTargetKey", '${target.moduleId || target.module_id || ""}:', ""],
  ["match loses empty-module wildcard", "editorLinkTargetMatches", "(!linkModuleId || !targetModuleId || linkModuleId === targetModuleId)", "linkModuleId === targetModuleId"],
  ["match ignores target type", "editorLinkTargetMatches", "linkTargetType === targetType &&", "true &&"],
  ["empty secondary label loses presence semantics", "targetPickerSecondaryLabel", 'Object.hasOwn(target, "secondaryLabel") || Object.hasOwn(target, "secondary_label")', "target.secondaryLabel || target.secondary_label"],
  ["project ignores provider label", "primaryProjectOptionLabel", "if (providerLabel)", "if (false)"],
  ["stage copies instead of retaining identity", "stageEditorLinkTarget", "[]), target]", "[]), { ...target }]"],
  ["stage permits duplicates", "stageEditorLinkTarget", "if (stagedTargetExists(target))", "if (false)"],
  ["payload leaks source URL", "linkPayloadFromTarget", "moduleId: target.moduleId,", "sourceUrl: target.sourceUrl, moduleId: target.moduleId,"],
  ["add fails to encode note identity", "addEditorNoteLink", "${encodeURIComponent(noteId)}/links", "${noteId}/links"],
  ["remove reverses legacy identity precedence", "removeEditorNoteLink", "link.noteLinkId || link.note_link_id", "link.note_link_id || link.noteLinkId"],
  ["load enables picker before directory arrives", "loadEditorLinkTargets", "contextResultsInput.disabled = true", "contextResultsInput.disabled = false"],
  ["missing status silently permits a write", "addEditorNoteLink", "requireNotesValue(formStatus)", "(formStatus || {})"],
  ["add leaks raw secure failure", "addEditorNoteLink", 'safeNoteErrorMessage(error, "Linked context could not be added.")', "error.message"],
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-link-editor.test.mjs"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    const broken = source.replace(region, region.replaceAll(from, to));
    try {
      writeFileSync(sourcePath, broken);
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-link-editor.test.mjs"],
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
