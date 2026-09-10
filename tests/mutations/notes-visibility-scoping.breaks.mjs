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
    "producer bypasses established reader",
    "scopeNotesVisibilityContributions",
    "requireView().normalizeSurfaceDescriptor(surface)",
    "surface"
  ],
  [
    "business returns unchecked original",
    "scopeNotesVisibilityContributions",
    "return descriptor;",
    "return surface;"
  ],
  [
    "family skips projection",
    "scopeNotesVisibilityContributions",
    "workspaceType === \"business\"",
    "workspaceType !== \"personal\""
  ],
  [
    "context overrides established state",
    "scopeNotesVisibilityContributions",
    "state.workspaceType || window.LongtailForge?.workspaceContext?.workspaceType",
    "window.LongtailForge?.workspaceContext?.workspaceType || state.workspaceType"
  ],
  [
    "personal retains editor visibility",
    "scopeNotesVisibilityContributions",
    "workspaceType !== \"personal\" || field.field !== \"visibility\"",
    "true"
  ],
  [
    "personal retains filter visibility",
    "scopeNotesVisibilityContributions",
    "workspaceType !== \"personal\" || filter.field !== \"visibility\"",
    "true"
  ],
  [
    "scopes unrelated filter",
    "scopeNotesVisibilityContributions",
    "filter.field === \"visibility\"",
    "filter.field !== \"visibility\""
  ],
  [
    "scopes unrelated field",
    "scopeNotesVisibilityContributions",
    "field.field === \"visibility\"",
    "field.field !== \"visibility\""
  ],
  [
    "bulk editor loses scoping",
    "scopeNotesVisibilityContributions",
    "[\"note-editor\", \"note-bulk-editor\"]",
    "[\"note-editor\"]"
  ],
  [
    "unrelated modal is scoped",
    "scopeNotesVisibilityContributions",
    "[\"note-editor\", \"note-bulk-editor\"].includes(modal.id)",
    "true"
  ],
  [
    "personal keeps visibility badge",
    "scopeNotesVisibilityContributions",
    "badge.field !== \"visibility\"",
    "true"
  ],
  [
    "personal discards other badges",
    "scopeNotesVisibilityContributions",
    "badge.field !== \"visibility\"",
    "badge.field === \"visibility\""
  ],
  [
    "family discards visibility badge",
    "scopeNotesVisibilityContributions",
    "workspaceType === \"personal\" && descriptor.detail",
    "descriptor.detail"
  ],
  [
    "tuple client visible leaks",
    "scopeNotesVisibilityOptions",
    "Array.isArray(option) ? option[0]",
    "Array.isArray(option) ? undefined"
  ],
  [
    "object client visible leaks",
    "scopeNotesVisibilityOptions",
    "isResponseRecord(option) ? option.value",
    "isResponseRecord(option) ? undefined"
  ],
  [
    "projection reorders and mutates input options",
    "scopeNotesVisibilityOptions",
    "return options.filter",
    "return options.reverse().filter"
  ],
  [
    "option labels declared without evidence",
    "readNotesVisibilityOption",
    "typeof label === \"string\"",
    "true"
  ],
  [
    "option values declared without evidence",
    "readNotesVisibilityOption",
    "typeof value === \"string\"",
    "true"
  ],
  [
    "option whitespace lost",
    "readNotesVisibilityOption",
    "[value, label] : null",
    "[value, label.trim()] : null"
  ],
  [
    "hidden controls stay shown",
    "applyWorkspaceVisibilityControls",
    "field.hidden = personalWorkspace",
    "field.hidden = false"
  ],
  [
    "display hides wrong workspace",
    "applyWorkspaceVisibilityControls",
    "personalWorkspace ? \"none\" : \"\"",
    "personalWorkspace ? \"\" : \"none\""
  ],
  [
    "applicable selection forgotten",
    "applyWorkspaceVisibilityControls",
    "? selectedValue",
    "? \"all\""
  ],
  [
    "inapplicable selection retained",
    "applyWorkspaceVisibilityControls",
    ": \"all\";",
    ": selectedValue;"
  ],
  [
    "invalid filter options reach DOM",
    "applyWorkspaceVisibilityControls",
    ".filter((option) => option !== null)",
    ""
  ],
  [
    "filter labels replaced by values",
    "applyWorkspaceVisibilityControls",
    "notesOptionElement(value, label)",
    "notesOptionElement(value, value)"
  ],
  [
    "non-HTML wrapper treated as HTML",
    "applyWorkspaceVisibilityControls",
    "field instanceof HTMLElement",
    "field"
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-visibility-scoping.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-visibility-scoping.test.mjs"],
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
