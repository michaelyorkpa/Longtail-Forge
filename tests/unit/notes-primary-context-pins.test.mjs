import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["readNoteEditorId", "readEditorPayload", "loadPrimaryContextOptions", "isActivePrimaryClientTarget", "requireNotesValue", "normalizeText", "normalizeWorkspaceType", "usesBusinessScope", "workspaceHasClientTools", "readEditorVisibility", "updatePrimaryContextVisibility", "populatePrimaryClientOptions", "populatePrimaryProjectOptions", "findPrimaryContextProject", "primaryContextSummaryForSelection", "primaryClientFallbackOption", "primaryProjectFallbackOption", "optionListHasValue", "primaryClientOptionLabel", "primaryProjectOptionLabel", "providerDisplayLabel", "unavailableTargetLabel"];
function fixture() {
  const document = new FakeDocument();
  const active = { targetId: "client-target", clientId: "client-a", status: " Active ", label: "Active client", displayLabel: "  Active client  ", isAvailable: false };
  const clients = [active, { targetId: "client-b", status: "ACTIVE", label: "Second client" }, { targetId: "inactive", status: "Inactive" }, { targetId: "unknown", status: "" }];
  const projects = [
    { targetId: "alternate-id", projectId: "project-a", clientId: "client-a", label: "First project", displayLabel: "First project - Active client" },
    { targetId: "project-b", clientId: "client-b", label: "Second project", clientName: "Second client" },
    { targetId: "workspace-project", clientId: "", label: "Workspace project" },
  ];
  /** @type {unknown[]} */ const events = [];
  const data = { clients, projects, fail: false,
    /** @type {Promise<void> | null} */
    pending: null };
  const state = { workspaceType: "business", editingNoteId: "", primaryContextClients: [], primaryContextProjects: [], editorContextSummaries: {}, tagPicker: null };
  const controlNames = ["clientInput", "projectInput", "titleInput", "bodyInput", "libraryInput", "collectionInput", "typeInput", "securityInput", "userInput", "visibilityInput"];
  const context = vm.createContext({ document, state, editor: null,
    ...Object.fromEntries(controlNames.map((name) => [name, document.createElement(name === "clientInput" || name === "projectInput" ? "select" : "input")])),
    primaryClientField: Object.assign(document.createElement("div"), { style: { display: "" } }), primaryProjectField: document.createElement("div"),
    window: { LongtailForge: { workspaceContext: { workspaceName: "Current workspace", workspaceCapabilities: { availableTools: ["clients_projects"] } } },
      Option: function (label = "", value = "") { return Object.assign(document.createElement("option"), { textContent: label, value }); } },
    fetchLinkTargets: async (/** @type {{targetType: string, limit: number}} */ query) => {
      events.push(["fetch", query.targetType, query.limit]); if (data.pending) await data.pending;
      if (data.fail) throw new Error("Directory unavailable");
      return query.targetType === "client" ? data.clients : data.projects;
    },
    populateLinkClientContextSelect: () => events.push("link-client-context"),
    stagedLinkPayloads: () => { events.push("staged-links"); return []; },
  });
  const api = vm.runInContext(`${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\n({${names.join(",")}})`, context);
  return { api, context, data, state, events, active, projects };
}
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {ReturnType<typeof fixture>} f */
function options(f) {
  return { clients: f.context.clientInput.children.map((/** @type {{value: string}} */ option) => option.value),
    projects: f.context.projectInput.children.map((/** @type {{value: string}} */ option) => option.value) };
}

describe("Notes primary-context reads and source-pin reconciliation", () => {
  it("reads note identity aliases in their existing order, preserving default, falsy and whitespace behavior", () => {
    const { api } = fixture();
    const aliases = ["noteId", "note_id", "recordId", "id"];
    for (let first = 0; first < aliases.length; first += 1) {
      const params = Object.fromEntries(aliases.map((alias, index) => [alias, index >= first ? `${alias}-value` : ""]));
      assert.equal(api.readNoteEditorId(params), `${aliases[first]}-value`);
      params[aliases[first]] = " "; assert.equal(api.readNoteEditorId(params), " ");
    }
    assert.doesNotThrow(() => assert.equal(api.readNoteEditorId(), ""));
    assert.equal(api.readNoteEditorId({}), "");
    assert.equal(api.readNoteEditorId({ noteId: null, note_id: undefined, recordId: "", id: "last" }), "last");
    assert.throws(() => api.readNoteEditorId(null), /null/);
  });

  it("offers only normalized active clients, preserving order and record identity without adding an availability policy", async () => {
    const f = fixture(); await f.api.loadPrimaryContextOptions();
    assert.equal(f.context.state.primaryContextClients.length, 2);
    assert.equal(f.context.state.primaryContextClients[0], f.active);
    assert.equal(f.context.state.primaryContextClients[1], f.data.clients[1]);
    assert.equal(f.context.state.primaryContextProjects, f.projects);
    assert.deepEqual(options(f), { clients: ["", "client-a", "client-b"], projects: ["", "project-a", "project-b", "workspace-project"] });
    assert.equal(f.context.clientInput.children[1].textContent, "  Active client  ");
    assert.equal(f.api.isActivePrimaryClientTarget(), false); assert.equal(f.api.isActivePrimaryClientTarget({}), false);
    for (const status of ["Active", " ACTIVE ", "active"]) assert.equal(f.api.isActivePrimaryClientTarget({ status }), true);
    for (const status of ["Inactive", "Archived", "", null, 12, false]) assert.equal(f.api.isActivePrimaryClientTarget({ status }), false);
    assert.throws(() => f.api.isActivePrimaryClientTarget(null), /null/);
    assert.deepEqual(f.events, [["fetch", "client", 50], ["fetch", "project", 50], "link-client-context"]);
  });

  it("keeps direct selections ahead of control values and derives the client from the selected project", async () => {
    const f = fixture(); f.context.clientInput.value = "client-b"; f.context.projectInput.value = "project-b";
    await f.api.loadPrimaryContextOptions({ clientId: "client-b", projectId: "project-a" });
    assert.equal(f.context.clientInput.value, "client-a"); assert.equal(f.context.projectInput.value, "project-a");
    assert.deepEqual(options(f).projects, ["", "project-a"]);
    f.context.clientInput.value = "client-b"; f.context.projectInput.value = "project-b";
    await f.api.loadPrimaryContextOptions({ clientId: "", projectId: "" });
    assert.equal(f.context.clientInput.value, "client-b"); assert.equal(f.context.projectInput.value, "project-b");
    assert.deepEqual(options(f).projects, ["", "project-b"]);
    await f.api.loadPrimaryContextOptions({ clientId: "client-a", projectId: "workspace-project" });
    assert.equal(f.context.clientInput.value, "client-a"); assert.equal(f.context.projectInput.value, "workspace-project");
    assert.equal(f.context.projectInput.children.at(-1).dataset.primaryContextFallback, "");
  });

  it("retains paged-out project identity, readable summaries and inactive-client fallback state", async () => {
    const f = fixture(); f.data.clients = []; f.data.projects = [];
    f.context.state.editorContextSummaries = { client: { targetId: "saved-client", label: "Saved client", status: "inactive" },
      project: { targetId: "saved-project", label: "Saved project", clientId: "saved-client", clientName: "Saved client" } };
    await f.api.loadPrimaryContextOptions({ clientId: "other-client", projectId: "saved-project" });
    assert.equal(f.context.clientInput.value, "saved-client"); assert.equal(f.context.projectInput.value, "saved-project");
    assert.equal(f.context.clientInput.children[1].textContent, "Saved client"); assert.equal(f.context.clientInput.children[1].disabled, true);
    assert.equal(f.context.projectInput.children[1].textContent, "Saved project - Saved client");
    f.context.state.editorContextSummaries = {};
    await f.api.loadPrimaryContextOptions({ clientId: "unavailable-client", projectId: "unavailable-project" });
    assert.equal(f.context.clientInput.children[1].textContent, "Unavailable client");
    assert.equal(f.context.projectInput.children[1].textContent, "Unavailable project");
    assert.equal(f.context.projectInput.value, "unavailable-project");
  });

  it("fetches and exposes clients only for business scope with the capability, while keeping projects everywhere", async () => {
    for (const workspaceType of ["business", " BUSINESS ", "family", "personal", "", "unknown"]) for (const tools of [["clients_projects"], []]) {
      const f = fixture(); f.state.workspaceType = workspaceType;
      f.context.window.LongtailForge.workspaceContext.workspaceCapabilities.availableTools = tools;
      f.context.clientInput.value = "client-a"; f.context.projectInput.value = "project-a";
      const business = workspaceType.trim().toLowerCase() === "business" && tools.length > 0;
      await f.api.loadPrimaryContextOptions();
      assert.equal(f.events.some((event) => Array.isArray(event) && event[1] === "client"), business);
      assert.equal(f.context.primaryClientField.hidden, !business); assert.equal(f.context.primaryClientField.style.display, business ? "" : "none");
      assert.equal(f.context.clientInput.disabled, !business); assert.equal(f.context.clientInput.value, business ? "client-a" : "");
      assert.equal(f.context.projectInput.disabled, false); assert.equal(f.context.primaryProjectField.hidden, false);
      assert.equal(f.context.projectInput.value, "project-a");
      assert.equal(f.context.state.primaryContextClients.length, business ? 2 : 0);
    }
  });

  it("disables controls while loading and preserves all-or-nothing directory failure and final re-enabling", async () => {
    for (const workspaceType of ["business", "family"]) {
      const f = fixture(); f.state.workspaceType = workspaceType; await f.api.loadPrimaryContextOptions();
      const previous = f.context.state.primaryContextProjects;
      let release = () => {}; f.data.pending = new Promise((done) => { release = () => done(); });
      f.data.fail = true;
      const pending = f.api.loadPrimaryContextOptions({ projectId: "project-a" });
      assert.equal(f.context.clientInput.disabled, true); assert.equal(f.context.projectInput.disabled, true);
      assert.equal(f.context.state.primaryContextProjects, previous);
      release(); await assert.doesNotReject(() => pending);
      assert.deepEqual(plain(f.context.state.primaryContextClients), []); assert.deepEqual(plain(f.context.state.primaryContextProjects), []);
      assert.equal(f.context.clientInput.value, ""); assert.equal(f.context.projectInput.value, "");
      assert.equal(f.context.clientInput.disabled, workspaceType !== "business"); assert.equal(f.context.projectInput.disabled, false);
      assert.equal(f.events.filter((event) => event === "link-client-context").length, 2);
    }
  });

  it("keeps optional controls and omitted selections tolerated, while explicit null selection fails before fetching", async () => {
    const f = fixture(); f.context.clientInput = null; f.context.projectInput = null;
    await assert.doesNotReject(() => f.api.loadPrimaryContextOptions());
    assert.equal(f.context.state.primaryContextProjects, f.projects);
    f.events.length = 0; await assert.rejects(() => f.api.loadPrimaryContextOptions(null), /null/); assert.deepEqual(f.events, []);
  });

  it("reads normalized primary IDs with business-only client scope and null defaults", () => {
    const f = fixture(); f.context.clientInput.value = " client-a "; f.context.projectInput.value = " project-a ";
    let payload = f.api.readEditorPayload(); assert.equal(payload.client_id, "client-a"); assert.equal(payload.project_id, "project-a");
    f.context.clientInput.value = " "; f.context.projectInput.value = " ";
    payload = f.api.readEditorPayload(); assert.equal(payload.client_id, null); assert.equal(payload.project_id, null);
    for (const workspaceType of ["family", "personal", "", "unknown"]) {
      f.state.workspaceType = workspaceType; f.context.clientInput = null; f.context.projectInput.value = " project-b ";
      assert.doesNotThrow(() => f.api.readEditorPayload()); payload = f.api.readEditorPayload();
      assert.equal(payload.client_id, null); assert.equal(payload.project_id, "project-b");
    }
  });

  it("requires the business client and every project at their original read, before later fields and staged links", () => {
    const f = fixture(); f.context.clientInput = null;
    let projectReads = 0; Object.defineProperty(f.context.projectInput, "value", { get() { projectReads += 1; return "project"; } });
    assert.throws(() => f.api.readEditorPayload(), /Required Notes value/); assert.equal(projectReads, 0); assert.deepEqual(f.events, []);
    f.state.workspaceType = "family"; f.context.projectInput = null;
    let userReads = 0; Object.defineProperty(f.context.userInput, "value", { get() { userReads += 1; return "user"; } });
    assert.throws(() => f.api.readEditorPayload(), /Required Notes value/); assert.equal(userReads, 0); assert.deepEqual(f.events, []);
  });
});
