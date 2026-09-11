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
const legacyCases = [
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

// .40.15 retains every .40.6 break and adds executable proof of the reconciled pins.
const readCases = [
  ["identity loses noteId", "readNoteEditorId", "params.noteId || ", "", "unit"],
  ["identity loses note_id", "readNoteEditorId", "params.note_id || ", "", "unit"],
  ["identity loses recordId", "readNoteEditorId", "params.recordId || ", "", "unit"],
  ["identity loses id", "readNoteEditorId", "params.id || ", "", "unit"],
  ["identity alias precedence reversed", "readNoteEditorId", "params.noteId || params.note_id", "params.note_id || params.noteId", "unit"],
  ["identity absent default removed", "readNoteEditorId", "params = {}", "params", "unit"],
  ["identity whitespace trimmed", "readNoteEditorId", "return params.noteId || params.note_id || params.recordId || params.id || \"\";", "return String(params.noteId || params.note_id || params.recordId || params.id || \"\").trim();", "unit"],
  ["regression rejects unfiltered clients", "loadPrimaryContextOptions", "clients.filter(isActivePrimaryClientTarget)", "clients", "regression"],
  ["regression rejects missing client default", "isActivePrimaryClientTarget", "client = {}", "client", "regression"],
  ["regression rejects inactive-only filter", "isActivePrimaryClientTarget", "=== \"active\"", "=== \"inactive\"", "regression"],
  ["regression rejects case-sensitive status", "isActivePrimaryClientTarget", ".toLowerCase()", "", "regression"],
  ["regression rejects out-of-scope client read", "readEditorPayload", "client_id: usesBusinessScope() ?", "client_id: true ?", "regression"],
  ["regression rejects wrong project identity", "readEditorPayload", "project_id: normalizeText(requireNotesValue(projectInput).value)", "project_id: normalizeText(requireNotesValue(clientInput).value)", "regression"],
  ["regression requires client control", "readEditorPayload", "requireNotesValue(clientInput).value", "clientInput?.value", "regression"],
  ["regression requires project control", "readEditorPayload", "requireNotesValue(projectInput).value", "projectInput?.value", "regression"],
  ["regression preserves client null default", "readEditorPayload", "normalizeText(requireNotesValue(clientInput).value) || null", "normalizeText(requireNotesValue(clientInput).value) || \"\"", "regression"],
  ["regression preserves project null default", "readEditorPayload", "normalizeText(requireNotesValue(projectInput).value) || null", "normalizeText(requireNotesValue(projectInput).value) || \"\"", "regression"],
  ["regression requires client before project", "readEditorPayload", "      client_id: usesBusinessScope() ? normalizeText(requireNotesValue(clientInput).value) || null : null,\n      project_id: normalizeText(requireNotesValue(projectInput).value) || null,", "      project_id: normalizeText(requireNotesValue(projectInput).value) || null,\n      client_id: usesBusinessScope() ? normalizeText(requireNotesValue(clientInput).value) || null : null,", "regression"],
  ["selected project ignored", "loadPrimaryContextOptions", "selected.projectId || ", "", "unit"],
  ["selected client ignored", "loadPrimaryContextOptions", "selected.clientId || ", "", "unit"],
  ["empty project no longer uses control", "loadPrimaryContextOptions", "selected.projectId || projectInput?.value || \"\"", "selected.projectId ?? (projectInput?.value || \"\")", "unit"],
  ["client directory fetched outside business", "loadPrimaryContextOptions", "usesBusinessScope() ? fetchLinkTargets", "true ? fetchLinkTargets", "unit"],
  ["pending project remains enabled", "loadPrimaryContextOptions", "projectInput.disabled = true;", "projectInput.disabled = false;", "unit"],
  ["pending client remains enabled", "loadPrimaryContextOptions", "clientInput.disabled = true;", "clientInput.disabled = false;", "unit"],
  ["project directory copied instead of retained", "loadPrimaryContextOptions", "state.primaryContextProjects = projects;", "state.primaryContextProjects = [...projects];", "unit"],
  ["project no longer establishes client", "loadPrimaryContextOptions", "selectedProject?.clientId || ", "", "unit"],
  ["project fallback summary ignored", "loadPrimaryContextOptions", "|| primaryContextSummaryForSelection(\"project\", selectedProjectId)", "|| null", "unit"],
  ["non-business client re-enabled", "loadPrimaryContextOptions", "clientInput.disabled = !usesBusinessScope();", "clientInput.disabled = false;", "unit"],
  ["resolved project remains disabled", "loadPrimaryContextOptions", "projectInput.disabled = false;", "projectInput.disabled = true;", "unit"],
  ["failed directory retains client list", "loadPrimaryContextOptions", "state.primaryContextClients = [];", ";", "unit"],
  ["failed directory retains project list", "loadPrimaryContextOptions", "state.primaryContextProjects = [];", ";", "unit"],
  ["failed directory retains selected project", "loadPrimaryContextOptions", "populatePrimaryProjectOptions(\"\");", "populatePrimaryProjectOptions(selectedProjectId);", "unit"],
  ["new availability policy drops active clients", "isActivePrimaryClientTarget", "return normalizeText(client.status)", "return client.isAvailable !== false && normalizeText(client.status)", "unit"],
];
const cases = [...legacyCases, ...readCases];
const verificationEnv = { ...process.env };
for (const key of ["LONGTAIL_LOCAL_STORAGE_ROOT", "LONGTAIL_PUBLIC_URL", "SUPER_ADMIN_PASSWORD", "SECURE_NOTES_MASTER_KEY"]) delete verificationEnv[key];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-primary-context.test.mjs", "tests/unit/notes-primary-context-pins.test.mjs"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  const regressionBaseline = spawnSync(process.execPath, ["scripts/notes-primary-context-regression.mjs"],
    { encoding: "utf8", windowsHide: true, env: verificationEnv });
  assert.equal(regressionBaseline.status, 0, regressionBaseline.stdout + regressionBaseline.stderr);
  for (const [label, name, from, to, proof] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = name === "types" ? source : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    const broken = source.replace(region, region.replaceAll(from, to));
    try {
      writeFileSync(sourcePath, broken);
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const command = proof === "regression" ? ["scripts/notes-primary-context-regression.mjs"]
        : ["node_modules/vitest/vitest.mjs", "run", proof === "unit" ? "tests/unit/notes-primary-context-pins.test.mjs" : "tests/unit/notes-primary-context.test.mjs"];
      const result = spawnSync(process.execPath, command,
        { encoding: "utf8", windowsHide: true, env: verificationEnv });
      const output = result.stdout + result.stderr;
      if (result.status === 0) {
        inert.push(label);
        console.log(`INERT: ${label} - re-aim before claiming coverage`);
      } else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1;
        console.log(`CAUGHT (${proof || "legacy"}; syntax valid, assertion failed): ${label}`);
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
