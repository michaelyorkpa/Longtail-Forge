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
    "filter catalogue reloads unnecessarily",
    "hydrateNoteTagFilterOptions",
    "if (!state.availableTags.length)",
    "if (true)"
  ],
  [
    "filter load skipped",
    "hydrateNoteTagFilterOptions",
    "await loadTags();",
    ";"
  ],
  [
    "filter sentinel changed",
    "hydrateNoteTagFilterOptions",
    "\"__no_tags__\"",
    "\"wrong\""
  ],
  [
    "filter shared sentinel ignored",
    "hydrateNoteTagFilterOptions",
    "window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE ||",
    ""
  ],
  [
    "filter names ignored",
    "hydrateNoteTagFilterOptions",
    "value: tag.name || tag.slug",
    "value: tag.slug"
  ],
  [
    "filter keywords dropped",
    "hydrateNoteTagFilterOptions",
    "[tag.slug, tag.description].filter(Boolean)",
    "[]"
  ],
  [
    "filter colors dropped",
    "hydrateNoteTagFilterOptions",
    "color: tag.color",
    "color: \"\""
  ],
  [
    "filter precedence broken",
    "hydrateNoteTagFilterOptions",
    "if (typeof mountSearchOptions === \"function\")",
    "if (false)"
  ],
  [
    "filter free text disabled",
    "hydrateNoteTagFilterOptions",
    "\"option-or-input\"",
    "\"option-only\""
  ],
  [
    "filter minimum changed",
    "hydrateNoteTagFilterOptions",
    "minChars: 1",
    "minChars: 2"
  ],
  [
    "filter maximum changed",
    "hydrateNoteTagFilterOptions",
    "maxResults: 10",
    "maxResults: 1"
  ],
  [
    "filter fallback setter skipped",
    "hydrateNoteTagFilterOptions",
    "setOptions?.(options,",
    "(() => {})?.(options,"
  ],
  [
    "editor toggle remains hidden",
    "mountTagEditor",
    "tagsToggle.hidden = false",
    "tagsToggle.hidden = true"
  ],
  [
    "editor guard hides available tags",
    "mountTagEditor",
    "hidden = !tagSurface",
    "hidden = true"
  ],
  [
    "editor note id lost",
    "mountTagEditor",
    "note?.note_id || \"\"",
    "\"\""
  ],
  [
    "editor does not await picker",
    "mountTagEditor",
    "await tagSurface.mountPicker",
    "tagSurface.mountPicker"
  ],
  [
    "editor disables creation",
    "mountTagEditor",
    "allowCreate: true",
    "allowCreate: false"
  ],
  [
    "editor loses assignment provenance",
    "mountTagEditor",
    "selectedTags: note?.tags || []",
    "selectedTags: []"
  ],
  [
    "editor loses catalogue",
    "mountTagEditor",
    "tags: state.availableTags",
    "tags: []"
  ],
  [
    "bulk allows creation",
    "mountBulkTagPicker",
    "allowCreate: false",
    "allowCreate: true"
  ],
  [
    "bulk catalogue lost",
    "mountBulkTagPicker",
    "tags: state.availableTags",
    "tags: []"
  ],
  [
    "dialog files remain open",
    "openTagsDialog",
    "closeFilesDialog();",
    ";"
  ],
  [
    "dialog expansion state wrong",
    "openTagsDialog",
    "\"aria-expanded\", \"true\"",
    "\"aria-expanded\", \"false\""
  ],
  [
    "dialog loses parent",
    "openTagsDialog",
    "parent: dialog",
    "parent: null"
  ],
  [
    "dialog loses trigger",
    "openTagsDialog",
    "trigger: tagsToggle",
    "trigger: null"
  ],
  [
    "dialog focus omitted",
    "openTagsDialog",
    "input.focus();",
    ";"
  ],
  [
    "dialog close state stale",
    "handleTagsDialogClose",
    "\"aria-expanded\", \"false\"",
    "\"aria-expanded\", \"true\""
  ],
  [
    "chips empty message lost",
    "tagChips",
    "wrapper.textContent = \"No tags\"",
    "wrapper.textContent = \"\""
  ],
  [
    "chips zero limit ignored",
    "tagChips",
    "options.limit >= 0",
    "options.limit > 0"
  ],
  [
    "chips fractional limit accepted",
    "tagChips",
    "Number.isInteger(options.limit)",
    "Number.isFinite(options.limit)"
  ],
  [
    "chips color fallback wrong",
    "tagChips",
    "\"#64748b\"",
    "\"#000000\""
  ],
  [
    "chips name precedence reversed",
    "tagChips",
    "name || slug || \"Tag\"",
    "slug || name || \"Tag\""
  ],
  [
    "chips decorative swatch exposed",
    "tagChips",
    "\"aria-hidden\", \"true\"",
    "\"aria-hidden\", \"false\""
  ],
  [
    "chips overflow always shown",
    "tagChips",
    "options.showOverflow && hiddenCount > 0",
    "hiddenCount > 0"
  ],
  [
    "chips overflow singular wrong",
    "tagChips",
    "hiddenCount === 1",
    "false"
  ],
  [
    "chips null failure hidden",
    "tagChips",
    "throw new TypeError(\"Invalid Notes tag.\");",
    "return;"
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-tag-surface.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-tag-surface.test.mjs"],
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
