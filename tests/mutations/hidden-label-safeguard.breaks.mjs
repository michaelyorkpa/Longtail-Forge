import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
//
// The source here is a stylesheet, so there is no `node --check` equivalent to gate on. Each
// mutation is a whole-declaration edit that leaves the file syntactically valid by construction,
// and the brace balance is asserted instead so a malformed edit cannot be scored as a catch.
const sourcePath = "public/css/longtail-forge.css";
const suites = ["scripts/run-playwright-e2e.mjs", "tests/e2e/hidden-label-controls.spec.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

const SAFEGUARD = `[data-audit-client-filter-control][hidden]:not([hidden="until-found"]),
[data-audit-workspace-filter-control][hidden]:not([hidden="until-found"]),
[data-time-entry-filter-tag-control][hidden]:not([hidden="until-found"]),
[data-new-user-client-scope-field][hidden]:not([hidden="until-found"]),
[data-new-user-project-scope-field][hidden]:not([hidden="until-found"]) {
    display: none;
}`;

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  ["the safeguard is removed entirely",
    SAFEGUARD,
    "[data-longtail-safeguard-removed] {\n    display: none;\n}"],
  ["the safeguard stops hiding and only un-grids the control",
    "[data-new-user-project-scope-field][hidden]:not([hidden=\"until-found\"]) {\n    display: none;\n}",
    "[data-new-user-project-scope-field][hidden]:not([hidden=\"until-found\"]) {\n    display: block;\n}"],
  ["the Audit Log client filter loses its safeguard",
    "[data-audit-client-filter-control][hidden]:not([hidden=\"until-found\"]),\n",
    ""],
  ["the Audit Log workspace filter loses its safeguard",
    "[data-audit-workspace-filter-control][hidden]:not([hidden=\"until-found\"]),\n",
    ""],
  ["the Time Entries tag filter loses its safeguard",
    "[data-time-entry-filter-tag-control][hidden]:not([hidden=\"until-found\"]),\n",
    ""],
  ["the User Admin client scope field loses its safeguard",
    "[data-new-user-client-scope-field][hidden]:not([hidden=\"until-found\"]),\n",
    ""],
  ["the User Admin project scope field loses its safeguard",
    "[data-new-user-project-scope-field][hidden]:not([hidden=\"until-found\"]) {\n    display: none;\n}",
    "[data-longtail-project-scope-safeguard-removed] {\n    display: none;\n}"],
  ["the safeguard stops being scoped to the hidden state",
    "[data-new-user-client-scope-field][hidden]:not([hidden=\"until-found\"]),\n",
    "[data-new-user-client-scope-field]:not([hidden=\"until-found\"]),\n"],
];

let caught = 0;
let missed = 0;

/** @param {string} text @returns {boolean} */
const bracesBalanced = (text) => text.split("{").length === text.split("}").length;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    const mutated = source.replace(find, replace);
    writeFileSync(sourcePath, mutated, "utf8");

    const suite = spawnSync("node", suites, {
      encoding: "utf8",
      env: { ...process.env, LTF_E2E_PORT: process.env.LTF_E2E_PORT || "8101" },
      shell: true,
    });
    writeFileSync(sourcePath, original);

    const valid = bracesBalanced(mutated);
    const refused = valid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (rendered; stylesheet valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${valid ? "" : " (UNBALANCED BRACES)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
