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
  ["legacy seam admits misspelled fields", "types", "Partial<BrowserNoteLinkTarget> & NotesLegacyLinkTargetFields", "Partial<BrowserNoteLinkTarget> & NotesLegacyLinkTargetFields & Record<string, unknown>"],
  ["provider trims hierarchy indentation", "providerDisplayLabel", "return label;", "return label.trim();"],
  ["provider treats whitespace as present", "providerDisplayLabel", "if (label.trim())", "if (label)"],
  ["provider reverses label precedence", "providerDisplayLabel", "const value of values", "const value of [...values].reverse()"],
  ["client ignores provider label", "primaryClientOptionLabel", "providerDisplayLabel(client.displayLabel, client.display_label)", '""'],
  ["project ignores provider label", "primaryProjectOptionLabel", "if (providerLabel)", "if (false)"],
  // Initially inert with only a project fixture: the project fallback also prefers the provider.
  // Re-aimed with a non-project provider-label assertion; the first inert run is not counted.
  ["non-project picker ignores provider label", "targetPickerDisplayLabel", "if (providerLabel)", "if (false)"],
  ["project suffix leaks into personal scope", "primaryProjectOptionLabel", "if (!usesBusinessScope())", "if (false)"],
  ["project reverses client-name precedence", "primaryProjectOptionLabel", "project.clientName || project.client_name", "project.client_name || project.clientName"],
  ["project loses current workspace fallback", "primaryProjectOptionLabel", "window.LongtailForge?.workspaceContext?.workspaceName", '""'],
  ["summary drops unrelated context", "setTaskCreatedPrimaryContextSummaries", "...(state.editorContextSummaries || {}),", "...{},"],
  ["summary labels client ID as readable context", "setTaskCreatedPrimaryContextSummaries", 'clientName || unavailableTargetLabel("client")', "clientName || clientId"],
  ["summary labels project ID as readable context", "setTaskCreatedPrimaryContextSummaries", 'projectName || unavailableTargetLabel("project")', "projectName || projectId"],
  ["summary fabricates absent client", "setTaskCreatedPrimaryContextSummaries", "...(clientId ? {", "...(true ? {"],
  ["non-task target writes primary context", "applyTaskCreatedPrimaryContext", 'if (targetType !== "task")', "if (false)"],
  ["directory overrides caller context", "applyTaskCreatedPrimaryContext", "target.clientId || target.client_id || matchedTarget.clientId || matchedTarget.client_id", "matchedTarget.clientId || matchedTarget.client_id || target.clientId || target.client_id"],
  ["controls assign before options finish loading", "applyTaskCreatedPrimaryContext", "await loadPrimaryContextOptions", "void loadPrimaryContextOptions"],
  ["task writes client outside business scope", "applyTaskCreatedPrimaryContext", "if (usesBusinessScope() && clientInput)", "if (clientInput)"],
  ["visibility preserves out-of-scope client", "updatePrimaryContextVisibility", 'clientInput.value = "";', "clientInput.value;"],
  ["visibility leaves client enabled outside business scope", "updatePrimaryContextVisibility", "clientInput.disabled = !clientAvailable", "clientInput.disabled = false"],
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-primary-context.test.mjs"],
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
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-primary-context.test.mjs"],
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
