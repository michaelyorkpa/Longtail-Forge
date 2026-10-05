import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
// Run alone: every child lifts the temporarily changed Notes file.
// No declaration-line mutation credit: actual cache execution proves this reader.
// The backup is retained even after success, so interrupted campaigns never need reconstruction.
// Threads keep the suite's workers inside the bounded Node process; no shell or forked worker
// is left behind when that process is killed. Timeouts are reported distinctly from assertions.
// The first campaign exposed an assertion gap: an absent-control read threw before the
// equality assertion could run. The case now explicitly asserts no throw at that read;
// no incidental crash was credited, and the entire campaign is rerun.
// No inert case has been dropped or withdrawn.
const path = "public/js/notes.js", original = readFileSync(path);
/** @param {Buffer} bytes */ const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = hash(original), backup = join(mkdtempSync(join(tmpdir(), "ltf-notes-value-readers-")), "notes.js");
writeFileSync(backup, original); assert.equal(hash(readFileSync(backup)), sha);
console.log(`Source byte backup: ${backup}`);
const cases = [
  [
    "falsy values no longer become empty",
    "normalizeText",
    "value || \"\"",
    "value ?? \"\""
  ],
  [
    "normalization no longer trims",
    "normalizeText",
    ".trim()",
    ""
  ],
  [
    "normalization changes case",
    "normalizeText",
    ".trim()",
    ".trim().toLowerCase()"
  ],
  [
    "coercion happens twice",
    "normalizeText",
    "String(value || \"\")",
    "(String(value || \"\"), String(value || \"\"))"
  ],
  [
    "query values no longer normalize",
    "appendNotesQueryParam",
    "normalizeText(value)",
    "String(value)"
  ],
  [
    "query retains empty values",
    "appendNotesQueryParam",
    "!text || text === ignoredValue",
    "text === ignoredValue"
  ],
  [
    "query retains ignored values",
    "appendNotesQueryParam",
    "!text || text === ignoredValue",
    "!text"
  ],
  [
    "query compares sentinel without case",
    "appendNotesQueryParam",
    "text === ignoredValue",
    "text.toLowerCase() === ignoredValue.toLowerCase()"
  ],
  [
    "query deletes retained values on omission",
    "appendNotesQueryParam",
    "return;",
    "params.delete(key); return;"
  ],
  [
    "query appends instead of replacing",
    "appendNotesQueryParam",
    "params.set(key, text)",
    "params.append(key, text)"
  ],
  [
    "query stores the wrong key",
    "appendNotesQueryParam",
    "params.set(key, text)",
    "params.set(\"other\", text)"
  ],
  [
    "status cache accepts non-select elements",
    "cacheNotesElements",
    "findNotesControl(\"[data-note-filter-status]\", HTMLSelectElement)",
    "findNotesControl(\"[data-note-filter-status]\", HTMLElement)"
  ],
  [
    "status cache uses wrong selector",
    "cacheNotesElements",
    "\"[data-note-filter-status]\", HTMLSelectElement",
    "\"[data-note-filter-security]\", HTMLSelectElement"
  ],
  [
    "archive override removed",
    "activeStatusFilter",
    "state.activeBucket === \"archive\"",
    "state.activeBucket === \"other\""
  ],
  [
    "archive override reversed",
    "activeStatusFilter",
    "return \"archived\"",
    "return \"active\""
  ],
  [
    "status control ignored",
    "activeStatusFilter",
    "statusFilter?.value || \"active\"",
    "\"active\""
  ],
  [
    "missing status default changed",
    "activeStatusFilter",
    "statusFilter?.value || \"active\"",
    "statusFilter?.value || \"all\""
  ],
  [
    "missing status no longer optional",
    "activeStatusFilter",
    "statusFilter?.value",
    "statusFilter.value"
  ],
  [
    "option selection compares the wrong value",
    "selectedOptionText",
    "option.value === select?.value",
    "option.value !== select?.value"
  ],
  [
    "option selection chooses last duplicate",
    "selectedOptionText",
    ".find((option)",
    ".findLast((option)"
  ],
  [
    "option selection reads selection flags",
    "selectedOptionText",
    "option.value === select?.value",
    "option.selected"
  ],
  [
    "option label no longer trimmed",
    "selectedOptionText",
    "normalizeText(selected?.textContent)",
    "selected?.textContent"
  ],
  [
    "option label uses id instead",
    "selectedOptionText",
    "selected?.textContent",
    "selected?.value"
  ],
  [
    "option fallback lost",
    "selectedOptionText",
    "|| fallback",
    "|| \"\""
  ],
  [
    "missing select no longer optional",
    "selectedOptionText",
    "select?.options",
    "select.options"
  ],
  [
    "option membership matches labels",
    "optionListHasValue",
    "option.value === value",
    "option.textContent === value"
  ],
  [
    "option membership trims ids",
    "optionListHasValue",
    "option.value === value",
    "option.value === value.trim()"
  ],
  [
    "option membership requires every row",
    "optionListHasValue",
    ".some(",
    ".every("
  ],
  [
    "option membership empty default lost",
    "optionListHasValue",
    "options = []",
    "options"
  ]
];
const suiteTimeoutMs = 30000;
const command = ["node_modules/vitest/vitest.mjs", "run", "--pool=threads", "--maxWorkers=1", "tests/unit/notes-value-readers.test.mjs"];
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
