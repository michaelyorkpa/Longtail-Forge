import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof; never run concurrently with a server or source verification.
const path = "public/js/notes.js";
const original = Buffer.from(readFileSync(path));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = hash(original);
// The suite lifts the actual state and provider initializers. Entry changes are observable.
// First-run assertion gap: removing serialized target data caused the test's JSON.parse
// to throw before asserting. A string-presence assertion now catches that break explicitly;
// the runner did not count the incidental SyntaxError as coverage.
// The next run similarly exposed a missing length assertion before reading the separate
// select's first option. Its option count is now asserted before any property read.
// The nearest-mount break then hit spawnSync ENOBUFS: the failed identity assertion
// dumped the entire cyclic fake DOM beyond the output buffer. It now asserts the same
// reference equality as a boolean, retaining the identity claim with bounded diagnostics.
// The wrong-control break exposed another fixture diagnostic failure: JSON serialization
// of a rejected parts bag became cyclic when validation was removed. Empty fallback bags
// are now asserted by object/own-key checks, with no JSON traversal of DOM nodes.
// Withdrawn as real redundancies, not counted as caught breaks:
// - Removing only `?? undefined` passes null to clearTimeout; both mean no active handle in
//   the browser. The strict compiler requires normalization, not a fabricated behavior claim.
// - Omitting selected:false has the same result as the shared factory's Boolean(undefined).
//   The break below instead preselects true, which changes the real options.
// - defaultLinkTargetType's final fallback is unreachable while the actual ordered constant
//   contains project and availableLinkTargetTypes filters only client. The live default and
//   actual order are mutated instead; the fixture does not pretend it can reach a dead branch.
const cases = [
  [
    "provider menu order changes",
    "$order",
    "\"project\", \"task\"",
    "\"task\", \"project\""
  ],
  [
    "provider default changes",
    "$default",
    "\"project\"",
    "\"task\""
  ],
  [
    "client scope initial state changes",
    "$state",
    "linkTargetClientContext: LINK_CLIENT_CONTEXT_ALL",
    "linkTargetClientContext: LINK_CLIENT_CONTEXT_WORKSPACE"
  ],
  [
    "client control loses its checked subtype",
    "cacheNotesElements",
    "contextClientInput = findNotesControl(\"[data-note-context-client]\", HTMLSelectElement);",
    "contextClientInput = document.querySelector(\"[data-note-context-client]\");"
  ],
  [
    "search forgets to cancel its previous timer",
    "queueEditorLinkTargetSearch",
    "window.clearTimeout(state.linkTargetSearchTimer ?? undefined);",
    ""
  ],
  [
    "search delay changes",
    "queueEditorLinkTargetSearch",
    ", 180)",
    ", 0)"
  ],
  [
    "search schedules without saving its handle",
    "queueEditorLinkTargetSearch",
    "state.linkTargetSearchTimer = window.setTimeout",
    "window.setTimeout"
  ],
  [
    "options reverse server order",
    "populateLinkTargetSelect",
    "targets.map",
    "[...targets].reverse().map"
  ],
  [
    "options preselect every target",
    "populateLinkTargetSelect",
    "selected: false",
    "selected: true"
  ],
  [
    "options serialize a projection instead of the original",
    "populateLinkTargetSelect",
    "JSON.stringify(target)",
    "JSON.stringify(pickerRecordFromTarget(target))"
  ],
  [
    "options drop serialized target data",
    "populateLinkTargetSelect",
    "option.dataset.target = JSON.stringify(target);",
    ""
  ],
  [
    "options replace the wrong select",
    "populateLinkTargetSelect",
    "replaceLinkTargetOptions(records, select);",
    "replaceLinkTargetOptions(records);"
  ],
  [
    "type select loses an eligible selection",
    "populateLinkTargetTypeSelect",
    "? select.value : defaultLinkTargetType()",
    "? defaultLinkTargetType() : defaultLinkTargetType()"
  ],
  [
    "type options lose their readable labels",
    "populateLinkTargetTypeSelect",
    "LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType)",
    "targetType"
  ],
  [
    "client provider leaks outside Business",
    "availableLinkTargetTypes",
    "targetType !== \"client\" || usesBusinessScope()",
    "true"
  ],
  [
    "provider module identity changes",
    "linkTargetProviderOptions",
    "note: \"notes\"",
    "note: \"tasks\""
  ],
  [
    "provider label changes",
    "linkTargetProviderOptions",
    "LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType)",
    "targetType"
  ],
  [
    "client change reloads before writing state",
    "handleEditorLinkClientContextChange",
    "state.linkTargetClientContext = normalizeText(contextClientInput?.value) || LINK_CLIENT_CONTEXT_ALL;\n    void loadEditorLinkTargets();",
    "void loadEditorLinkTargets();"
  ],
  [
    "client change does not reload",
    "handleEditorLinkClientContextChange",
    "void loadEditorLinkTargets();",
    ""
  ],
  [
    "client scope trusts state before the live control",
    "readLinkTargetClientContext",
    "contextClientInput?.value || state.linkTargetClientContext",
    "state.linkTargetClientContext || contextClientInput?.value"
  ],
  [
    "client scope leaks into non-Business queries",
    "readLinkTargetClientContext",
    "if (!usesBusinessScope())",
    "if (false)"
  ],
  [
    "workspace client scope is treated as a client id",
    "readLinkTargetClientContext",
    "if (value === LINK_CLIENT_CONTEXT_WORKSPACE)",
    "if (false)"
  ],
  [
    "plain select routes through the editor hook",
    "replaceLinkTargetOptions",
    "select === contextResultsInput",
    "true"
  ],
  [
    "record label precedence changes",
    "replaceLinkTargetOptions",
    "record.displayLabel || record.label",
    "record.label || record.displayLabel"
  ],
  [
    "record identity precedence changes",
    "replaceLinkTargetOptions",
    "record.targetId || record.value",
    "record.value || record.targetId"
  ],
  [
    "fallback option loses disabled state",
    "replaceLinkTargetOptions",
    "Boolean(record.disabled)",
    "false"
  ],
  [
    "fallback option loses accessible title",
    "replaceLinkTargetOptions",
    "option.setAttribute(\"aria-label\", title);",
    ""
  ],
  [
    "selected row bypasses validation",
    "readSelectedLinkTarget",
    "return isNoteLinkTarget(target) ? target : null;",
    "return target;"
  ],
  [
    "selected row always refuses readable data",
    "readSelectedLinkTarget",
    "return isNoteLinkTarget(target) ? target : null;",
    "return null;"
  ],
  [
    "missing selection stops returning null",
    "readSelectedLinkTarget",
    "return null;",
    "return {};"
  ],
  [
    "parts lookup ignores nearest picker",
    "editorContextPickerParts",
    "contextList?.closest(\"[data-note-context-picker]\")",
    "contextList"
  ],
  [
    "parts lookup always falls back",
    "editorContextPickerParts",
    "isNotesContextPickerParts(parts) ? parts : {}",
    "{}"
  ],
  [
    "parts lookup bypasses validation",
    "editorContextPickerParts",
    "isNotesContextPickerParts(parts) ? parts : {}",
    "parts || {}"
  ],
  [
    "parts accepts the wrong client-control subtype",
    "isNotesContextPickerParts",
    "value.clientContextSelect instanceof HTMLSelectElement",
    "value.clientContextSelect instanceof HTMLElement"
  ],
  [
    "parts admits a non-callable setClientContexts",
    "isNotesContextPickerParts",
    "&& (value.setClientContexts === undefined || typeof value.setClientContexts === \"function\")",
    ""
  ],
  [
    "parts admits a non-callable setRecords",
    "isNotesContextPickerParts",
    "&& (value.setRecords === undefined || typeof value.setRecords === \"function\")",
    ""
  ],
  [
    "parts admits a non-callable setLinkedItems",
    "isNotesContextPickerParts",
    "&& (value.setLinkedItems === undefined || typeof value.setLinkedItems === \"function\")",
    ""
  ],
  [
    "loader no longer disables the result control while pending",
    "loadEditorLinkTargets",
    "contextResultsInput.disabled = true;",
    ""
  ],
  [
    "loader leaves stale target state on failure",
    "loadEditorLinkTargets",
    "state.linkTargets = [];",
    ""
  ],
  [
    "loader never enables recovery",
    "loadEditorLinkTargets",
    "contextResultsInput.disabled = false;",
    ""
  ],
  [
    "request loses trimmed search",
    "fetchLinkTargets",
    "params.set(\"q\", search.trim());",
    ""
  ],
  [
    "request sends client context outside Business",
    "fetchLinkTargets",
    "if (usesBusinessScope())",
    "if (true)"
  ]
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-target-picker.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const declaration = name === "$order" ? "const LINK_TARGET_TYPE_ORDER =" : name === "$default" ? "const DEFAULT_LINK_TARGET_TYPE =" : name === "$state" ? "let state = {" : "";
    const start = declaration ? source.indexOf(declaration) : -1;
    const region = start === -1 ? extractFunctionBlock(source, name) : source.slice(start, name === "$state" ? source.indexOf("\n  };", start) + 5 : source.indexOf(";", start) + 1);
    assert.ok(region.includes(from), `${label}: intended mutation site must exist`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax errors are not caught breaks\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: an infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT: ${label}`);
      }
    } finally {
      writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, `${label}: byte restoration`);
    }
  }
} finally {
  writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, "final byte restoration");
  console.log(`Restored SHA-256 ${before}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
