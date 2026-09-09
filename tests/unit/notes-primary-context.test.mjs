import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["setTaskCreatedPrimaryContextSummaries", "applyTaskCreatedPrimaryContext",
  "primaryProjectOptionLabel", "primaryClientOptionLabel", "targetPickerDisplayLabel",
  "providerDisplayLabel", "updatePrimaryContextVisibility", "normalizeText", "unavailableTargetLabel"];

/** @param {Record<string, unknown>} [overrides] */
function primaryContext(overrides = {}) {
  const state = { editorContextSummaries: { user: { label: "Retained user" } } };
  const clientInput = { value: "old-client", disabled: false };
  const projectInput = { value: "old-project", disabled: false };
  const context = vm.createContext({ state, clientInput, projectInput,
    window: { LongtailForge: { workspaceContext: { workspaceName: "Current workspace" } } },
    usesBusinessScope: () => true, loadPrimaryContextOptions: async () => {}, renderEditorContextPanel: () => {},
    primaryClientField: { hidden: false, style: { display: "" } }, primaryProjectField: { hidden: true }, ...overrides });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${names.join(", ")} })`, context), state, clientInput, projectInput, context };
}

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Notes primary context", () => {
  it("closes the thirteen legacy twins and refuses misspellings and wrong twin types in the compiler", () => {
    const twins = source.match(/@typedef \{object\} NotesLegacyLinkTargetFields([\s\S]*?)\*\//)?.[1] || "";
    const fields = [...twins.matchAll(/@property \{BrowserNoteLinkTarget\["(\w+)"\]\} \[(\w+)\]/g)].map((m) => [m[2], m[1]]);
    assert.deepEqual(fields, [
      ["module_id", "moduleId"], ["target_type", "targetType"], ["target_id", "targetId"],
      ["display_label", "displayLabel"], ["secondary_label", "secondaryLabel"], ["sort_key", "sortKey"],
      ["source_url", "sourceUrl"], ["full_label", "fullLabel"], ["aria_label", "ariaLabel"],
      ["is_available", "isAvailable"], ["client_name", "clientName"], ["project_name", "projectName"], ["workspace_name", "workspaceName"],
    ]);
    assert.doesNotMatch(source, /Partial<BrowserNoteLinkTarget> & Record<string, unknown>/);
    const start = source.indexOf('  /** @typedef {import("../../src/types/browser-contracts.js").BrowserNoteLinkTarget}');
    const end = source.indexOf("  /** What this picker says", start);
    assert.ok(start >= 0 && end > start);
    const declarations = source.slice(start, end).replaceAll("../../src/types/browser-contracts.js",
      path.resolve("src/types/browser-contracts.js").replaceAll("\\", "/"));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-notes-primary-types-"));
    try {
      fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
        allowJs: true, checkJs: true, strict: true, noEmit: true, skipLibCheck: true,
        target: "ESNext", lib: ["esnext", "dom"], types: [],
      }, files: ["probe.js"] }));
      /** @param {string} body */
      const compile = (body) => {
        fs.writeFileSync(path.join(directory, "probe.js"), declarations + body);
        return spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--pretty", "false", "-p", path.join(directory, "tsconfig.json")],
          { encoding: "utf8", windowsHide: true });
      };
      const valid = compile('/** @type {NotesLinkTargetInput} */ const target = { module_id: "", source_url: "", target_type: "task", is_available: false }; target.module_id;');
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      const typo = compile('/** @type {NotesLinkTargetInput} */ const target = {}; target.moduel_id;');
      assert.equal(typo.status, 1, typo.stdout + typo.stderr);
      assert.match(typo.stdout, /Property 'moduel_id' does not exist/);
      const invalid = compile('/** @type {NotesLinkTargetInput} */ const target = { is_available: "yes", target_type: "invoice", source_url: false };');
      assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
      assert.equal((invalid.stdout.match(/error TS2322:/g) || []).length, 3, invalid.stdout);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("presence-checks provider labels while preserving indentation and provider-first precedence", () => {
    const { api } = primaryContext();
    assert.equal(api.providerDisplayLabel(null, undefined, " \t", "  Child client  ", "Later"), "  Child client  ");
    assert.equal(api.providerDisplayLabel(null, 0, "Later"), "0");
    assert.equal(api.providerDisplayLabel(false), "false");
    assert.equal(api.providerDisplayLabel(" ", null), "");
    assert.equal(api.primaryClientOptionLabel({ displayLabel: "  Provider client", display_label: "Legacy", label: "Plain" }), "  Provider client");
    assert.equal(api.primaryClientOptionLabel({ display_label: "  Legacy client", label: "Plain" }), "  Legacy client");
    assert.equal(api.primaryClientOptionLabel({ label: " Client " }), "Client");
    assert.equal(api.primaryClientOptionLabel(), "Unavailable client");
    assert.equal(api.primaryProjectOptionLabel({ displayLabel: "Provider project", label: "Plain", clientName: "Client" }), "Provider project");
    assert.equal(api.targetPickerDisplayLabel({ target_type: "project", display_label: " Legacy project ", label: "Plain" }), " Legacy project ");
    assert.equal(api.targetPickerDisplayLabel({ targetType: "task", displayLabel: "Provider task", label: "Plain task" }), "Provider task");
    assert.equal(api.targetPickerDisplayLabel({ targetType: "task", label: "Task" }), "Task");
  });

  it("keeps business suffix precedence and the complete workspace fallback chain", () => {
    const { api, context } = primaryContext();
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", clientName: "Camel client", client_name: "Legacy client", workspaceName: "Space" }), "Project - Camel client");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", client_name: "Legacy client", workspaceName: "Space" }), "Project - Legacy client");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", workspaceName: "Camel space", workspace_name: "Legacy space" }), "Project - Camel space");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", workspace_name: "Legacy space" }), "Project - Legacy space");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project" }), "Project - Current workspace");
    context.window.LongtailForge.workspaceContext.workspaceName = "";
    assert.equal(api.primaryProjectOptionLabel(), "Unavailable project - Workspace");
    context.usesBusinessScope = () => false;
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", clientName: "Client" }), "Project");
    assert.equal(api.targetPickerDisplayLabel({ target_type: "project", label: "Project", clientName: "Client" }), "Project");
  });

  it("writes summaries only for present IDs, preserves unrelated context, and never labels an ID as readable context", () => {
    const { api, state } = primaryContext();
    const user = state.editorContextSummaries.user;
    api.setTaskCreatedPrimaryContextSummaries({ client_id: " client ", project_id: " project ", client_name: " Client ",
      project_name: " Project ", workspace_name: " Space ", client_status: "inactive" });
    assert.deepEqual(plain(state.editorContextSummaries), {
      user: { label: "Retained user" },
      client: { clientId: "client", label: "Client", status: "inactive", targetId: "client", targetType: "client" },
      project: { clientId: "client", clientName: "Client", label: "Project", projectId: "project", targetId: "project", targetType: "project", workspaceName: "Space" },
    });
    assert.equal(state.editorContextSummaries.user, user);
    api.setTaskCreatedPrimaryContextSummaries({ clientId: "new-client", projectId: "new-project", clientStatus: "active", client_status: "ignored" });
    assert.equal(plain(state.editorContextSummaries).client.label, "Unavailable client");
    assert.equal(plain(state.editorContextSummaries).client.status, "active");
    assert.equal(plain(state.editorContextSummaries).project.label, "Unavailable project");
    assert.equal(plain(state.editorContextSummaries).project.workspaceName, "Current workspace");
    const retained = plain(state.editorContextSummaries);
    api.setTaskCreatedPrimaryContextSummaries({});
    assert.deepEqual(plain(state.editorContextSummaries), retained);
  });

  it("prefills only task-created context, merges target over directory metadata, and waits before assigning controls", async () => {
    /** @type {(value?: unknown) => void} */
    let settle = () => {};
    const pending = new Promise((resolve) => { settle = resolve; });
    /** @type {unknown[]} */
    const loads = [];
    let renders = 0;
    const { api, state, clientInput, projectInput, context } = primaryContext({
      loadPrimaryContextOptions: async (/** @type {unknown} */ selection) => { loads.push(selection); },
      renderEditorContextPanel: () => { renders += 1; },
    });
    await api.applyTaskCreatedPrimaryContext({ targetType: "note", clientId: "ignored" });
    await api.applyTaskCreatedPrimaryContext({ targetType: "task" });
    assert.equal(loads.length, 0);
    context.loadPrimaryContextOptions = (/** @type {unknown} */ selection) => { loads.push(selection); return pending; };
    const applying = api.applyTaskCreatedPrimaryContext({ target_type: "task", client_id: " caller-client ", project_id: " caller-project ", clientName: "Caller" },
      { clientId: "directory-client", projectId: "directory-project", clientName: "Directory", projectName: "Directory project" });
    assert.deepEqual(plain(loads), [{ clientId: "caller-client", projectId: "caller-project" }]);
    assert.equal(plain(state.editorContextSummaries).client.label, "Caller");
    assert.equal(plain(state.editorContextSummaries).project.label, "Directory project");
    assert.equal(clientInput.value, "old-client");
    assert.equal(projectInput.value, "old-project");
    assert.equal(renders, 0);
    settle();
    await applying;
    assert.equal(clientInput.value, "caller-client");
    assert.equal(projectInput.value, "caller-project");
    assert.equal(renders, 1);
  });

  it("uses directory IDs as fallback, preserves control state on load failure, and keeps non-business client context absent", async () => {
    const { api, context, clientInput, projectInput } = primaryContext();
    await api.applyTaskCreatedPrimaryContext({ targetType: "task" }, { client_id: "client", project_id: "project" });
    assert.equal(clientInput.value, "client");
    assert.equal(projectInput.value, "project");
    context.loadPrimaryContextOptions = async () => { throw new Error("Directory unavailable"); };
    await assert.rejects(api.applyTaskCreatedPrimaryContext({ targetType: "task", clientId: "next", projectId: "next" }), /Directory unavailable/);
    assert.equal(clientInput.value, "client");
    assert.equal(projectInput.value, "project");
    context.usesBusinessScope = () => false;
    context.loadPrimaryContextOptions = async () => {};
    api.updatePrimaryContextVisibility();
    assert.equal(clientInput.value, "");
    assert.equal(clientInput.disabled, true);
    assert.equal(context.primaryClientField.hidden, true);
    assert.equal(context.primaryClientField.style.display, "none");
    assert.equal(context.primaryProjectField.hidden, false);
    await api.applyTaskCreatedPrimaryContext({ targetType: "task", clientId: "business-only", projectId: "personal-project" });
    assert.equal(clientInput.value, "");
    assert.equal(projectInput.value, "personal-project");
    context.usesBusinessScope = () => true;
    api.updatePrimaryContextVisibility();
    assert.equal(context.primaryClientField.hidden, false);
    assert.equal(context.primaryClientField.style.display, "");
    assert.equal(clientInput.disabled, false);
    Object.assign(context, { clientInput: null, projectInput: null, primaryClientField: null, primaryProjectField: null });
    api.updatePrimaryContextVisibility();
    await api.applyTaskCreatedPrimaryContext({ targetType: "task", projectId: "project" });
  });
});
