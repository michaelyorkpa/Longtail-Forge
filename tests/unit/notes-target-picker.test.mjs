import assert from "node:assert/strict";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const read = createProjectTextReader().readText, source = read("public/js/notes.js");
const names = ["populateLinkTargetSelect", "populateLinkTargetTypeSelect", "availableLinkTargetTypes", "defaultLinkTargetType", "linkTargetProviderOptions",
  "replaceLinkTargetOptions", "readSelectedLinkTarget", "editorContextPickerParts", "isNotesContextPickerParts", "queueEditorLinkTargetSearch",
  "handleEditorLinkClientContextChange", "readLinkTargetClientContext", "populateLinkClientContextSelect", "linkTargetClientContextOptions", "linkTargetWorkspaceClientLabel",
  "loadEditorLinkTargets", "fetchLinkTargets", "linkTargetLoadFailureLabel", "isNoteLinkTarget", "readNoteLinkTargets", "isResponseRecord",
  "pickerRecordFromTarget", "targetPickerDisplayLabel", "targetPickerSecondaryLabel", "primaryProjectOptionLabel", "primaryClientOptionLabel",
  "providerDisplayLabel", "unavailableTargetLabel", "normalizeText", "formatToken", "readStoredOpenExternalLinksPreference", "findNotesControl", "cacheNotesElements", "requireNamespace"];
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {unknown} value */
function assertEmptyParts(value) {
  assert.ok(value && typeof value === "object");
  assert.deepEqual(Reflect.ownKeys(value), []);
}
/** @param {Record<string, unknown>} [changes] */
function target(changes = {}) {
  return { ariaLabel: "Accessible target", clientId: "client-a", clientName: "Client A", displayLabel: "Provider label", fullLabel: "Full title",
    isAvailable: true, label: "Title", moduleId: "notes", projectId: "project-a", projectName: "Project A", secondaryLabel: "Context", sortKey: "z",
    sourceUrl: "notes.html?note=one", subtitle: "", suggestedLibraryBucket: "reference", targetId: "one", targetType: "note", title: "Title", workspaceName: "Workspace", ...changes };
}
function fixture() {
  const browser = createFakeBrowserContext();
  browser.window.location = { search: "" };
  /** @type {unknown[][]} */ const calls = [];
  /** @type {Map<number, () => unknown>} */ const timers = new Map(); let nextTimer = 1;
  browser.window.localStorage = { getItem: () => null };
  browser.window.Option = function (label = "", value = "", defaultSelected = false, selected = false) {
    return Object.assign(browser.document.createElement("option"), { textContent: label, value, defaultSelected, selected });
  };
  browser.window.clearTimeout = (/** @type {number | undefined} */ id) => { calls.push(["clear", id]); if (id !== undefined) timers.delete(id); };
  browser.window.setTimeout = (/** @type {() => unknown} */ callback, /** @type {number} */ delay) => { calls.push(["timer", delay]); const id = nextTimer++; timers.set(id, callback); return id; };
  const context = vm.createContext({ ...browser, URLSearchParams, business: true, usesBusinessScope: () => context.business,
    answer: Promise.resolve({ targets: [] }), requireApi: () => ({ getJson: (/** @type {string} */ url, /** @type {unknown} */ options) => { calls.push(["get", url, options]); return context.answer; } }) });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const name of ["LINK_TARGET_TYPE_LABELS", "LINK_TARGET_TYPE_ORDER", "DEFAULT_LINK_TARGET_TYPE", "LINK_CLIENT_CONTEXT_ALL", "LINK_CLIENT_CONTEXT_WORKSPACE", "LINK_TARGET_LOAD_FAILURE", "NOTE_LINK_TARGET_TYPES", "NOTE_LINK_TARGET_TEXT", "OPEN_EXTERNAL_LINKS_STORAGE_KEY"]) {
    const start = source.indexOf(`const ${name} =`); assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), context);
  }
  // Lift the real state initializer, rather than making a fixture answer for its slots.
  const start = source.indexOf("let state = {"); assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf("\n  };", start) + 5), context);
  const state = vm.runInContext("state", context), api = vm.runInContext(`({${names.join(",")}})`, context);
  const picker = context.window.LongtailForge.view.createLinkedContextPicker({ showClientContext: true });
  picker.dataset.noteContextPicker = "";
  const parts = picker.viewParts;
  parts.rows.dataset.noteContextList = ""; parts.clientContextSelect.dataset.noteContextClient = "";
  parts.targetSelect.dataset.noteContextTargetType = ""; parts.recordSelect.dataset.noteContextResults = ""; parts.searchInput.dataset.noteContextSearch = "";
  browser.document.body.appendChild(picker); api.cacheNotesElements();
  return { api, context, state, calls, timers, document: browser.document, picker, parts };
}
/** An untrusted mount is separate from the real factory's readonly viewParts property. @param {ReturnType<typeof fixture>} f */
function fallbackMount(f) {
  /** @type {{viewParts: unknown}} */ const properties = { viewParts: {} };
  const mount = Object.assign(f.document.createElement("section"), properties);
  mount.dataset.noteContextPicker = ""; mount.appendChild(f.parts.rows); f.document.body.appendChild(mount); return mount;
}

describe("Notes linked-record picker", () => {
  it("uses the actual provider order, hides only client outside Business and preserves an eligible selected type", () => {
    const f = fixture();
    for (const business of [true, false]) {
      f.context.business = business;
      const types = business ? ["project", "task", "note", "list", "client", "user"] : ["project", "task", "note", "list", "user"];
      const providers = plain(f.api.linkTargetProviderOptions());
      assert.deepEqual(providers, types.map((type) => ({ targetType: type,
        moduleId: ({ project: "client-projects", task: "tasks", note: "notes", list: "lists", client: "client-projects", user: "users" })[type],
        label: ({ project: "Project", task: "Task", note: "Note", list: "List", client: "Client", user: "User" })[type] })));
      f.parts.targetSelect.value = "note"; f.api.populateLinkTargetTypeSelect(f.parts.targetSelect);
      assert.equal(f.parts.targetSelect.value, "note"); assert.deepEqual(f.parts.targetSelect.options.map((/** @type {{value:string}} */ o) => o.value), types);
      assert.deepEqual(f.parts.targetSelect.options.map((/** @type {{textContent:string}} */ o) => o.textContent), providers.map((p) => p.label));
      f.parts.targetSelect.value = "workspace"; f.api.populateLinkTargetTypeSelect(f.parts.targetSelect); assert.equal(f.parts.targetSelect.value, "project");
      f.parts.targetSelect.value = "client"; f.api.populateLinkTargetTypeSelect(f.parts.targetSelect); assert.equal(f.parts.targetSelect.value, business ? "client" : "project");
    }
    assert.doesNotThrow(() => f.api.populateLinkTargetTypeSelect(null));
  });
  it("caches the real select once, treats a wrong subtype as absent and keeps the client-scope fallback", () => {
    const f = fixture(), original = f.parts.clientContextSelect;
    original.value = " client-a "; assert.deepEqual(plain(f.api.readLinkTargetClientContext()), { clientScope: "client", clientId: "client-a" });
    const wrong = f.document.createElement("input"); wrong.dataset.noteContextClient = ""; wrong.value = "wrong";
    original.remove(); f.document.body.appendChild(wrong); assert.equal(f.context.contextClientInput, original);
    f.api.cacheNotesElements(); assert.equal(f.context.contextClientInput, null);
    f.state.linkTargetClientContext = "workspace"; assert.deepEqual(plain(f.api.readLinkTargetClientContext()), { clientScope: "workspace", clientId: "" });
  });
  it("reads all/workspace/client scope only in Business, preferring control over state", () => {
    const f = fixture(); f.state.linkTargetClientContext = "state-client";
    for (const [value, scope, id] of [["all", "all", ""], ["workspace", "workspace", ""], [" client-a ", "client", "client-a"], ["", "client", "state-client"]]) {
      f.parts.clientContextSelect.value = value;
      f.context.business = true; assert.deepEqual(plain(f.api.readLinkTargetClientContext()), { clientScope: scope, clientId: id });
      f.context.business = false; assert.deepEqual(plain(f.api.readLinkTargetClientContext()), { clientScope: "all", clientId: "" });
    }
    f.context.business = true; f.context.contextClientInput = null; f.state.linkTargetClientContext = "";
    assert.deepEqual(plain(f.api.readLinkTargetClientContext()), { clientScope: "all", clientId: "" });
  });
  it("populates client contexts through the published parts and retains the plain-select fallback", () => {
    const f = fixture(); f.state.primaryContextClients = [target({ targetType: "client", displayLabel: "Client A" })];
    f.api.populateLinkClientContextSelect("client-a");
    assert.deepEqual(f.parts.clientContextSelect.options.map((/** @type {{value:string}} */ o) => o.value), ["all", "workspace", "client-a"]);
    assert.equal(f.state.linkTargetClientContext, "client-a"); assert.equal(f.parts.clientContextSelect.disabled, false);
    f.api.populateLinkClientContextSelect("missing"); assert.equal(f.state.linkTargetClientContext, "all");
    fallbackMount(f); f.api.populateLinkClientContextSelect("client-a"); assert.equal(f.parts.clientContextSelect.value, "client-a");
    f.context.business = false; f.api.populateLinkClientContextSelect("client-a");
    assert.equal(f.state.linkTargetClientContext, "all"); assert.equal(f.parts.clientContextSelect.disabled, true); assert.equal(f.parts.clientContextSelect.options.length, 0);
  });
  it("carries every validated original target without reordering or dropping provider extras", () => {
    const f = fixture(), values = [target({ targetId: "z", isAvailable: false, extra: { kept: true } }), target({ targetId: "a", moduleId: "", sourceUrl: "" })];
    f.api.populateLinkTargetSelect(f.parts.recordSelect, values);
    const options = f.parts.recordSelect.options;
    assert.deepEqual(options.map((/** @type {{value:string}} */ o) => o.value), ["z", "a"]);
    assert.equal(options[0].disabled, true); assert.equal(options[1].disabled, false);
    assert.equal(options[0].getAttribute("aria-label"), "Accessible target");
    assert.equal(options[1].dataset.moduleId, ""); assert.equal(options[1].dataset.sourceUrl, "");
    for (let index = 0; index < options.length; index++) { assert.equal(typeof options[index].dataset.target, "string"); assert.deepEqual(JSON.parse(options[index].dataset.target), values[index]); assert.equal(options[index].selected, false); }
    options[1].selected = true; assert.deepEqual(plain(f.api.readSelectedLinkTarget(f.parts.recordSelect)), values[1]);
    f.api.populateLinkTargetSelect(f.parts.recordSelect, []); assert.equal(f.parts.recordSelect.options.length, 1);
    assert.equal(f.parts.recordSelect.options[0].textContent, "No records found"); assert.equal(f.parts.recordSelect.options[0].disabled, true);
    assert.doesNotThrow(() => f.api.populateLinkTargetSelect(null, values));
  });
  it("updates a separate select without calling the editor hook and retains option fallback precedence", () => {
    const f = fixture(), separate = f.document.createElement("select");
    const original = f.parts.recordSelect.options[0];
    const values = [target({ targetId: "other" })]; f.api.populateLinkTargetSelect(separate, values);
    assert.equal(separate.options.length, 1); assert.equal(separate.options[0].value, "other"); assert.strictEqual(f.parts.recordSelect.options[0], original);
    const rows = [{ displayLabel: "Display", label: "Label", targetId: "target", value: "value", ariaLabel: "Aria", title: "Title", fullLabel: "Full", disabled: true },
      { label: "Label", value: "value", title: "Title" }, { fullLabel: "Full" }, {}];
    f.api.replaceLinkTargetOptions(rows, separate);
    assert.deepEqual(separate.options.map((/** @type {{textContent:string,value:string,disabled:boolean}} */ o) => [o.textContent, o.value, o.disabled]), [["Display", "target", true], ["Label", "value", false], ["No records found", "", false], ["No records found", "", false]]);
    assert.deepEqual(separate.options.map((/** @type {{getAttribute:(key:string)=>string|null}} */ o) => o.getAttribute("aria-label")), ["Aria", "Title", "Full", null]);
    assert.doesNotThrow(() => f.api.replaceLinkTargetOptions(rows, null));
  });
  it("refuses a malformed serialized row locally and retains the strict directory reader", () => {
    const f = fixture(), option = f.document.createElement("option"); option.selected = true; f.parts.recordSelect.replaceChildren(option);
    for (const value of [null, [], "text", {}, target({ targetId: "" }), target({ label: 1 }), target({ isAvailable: "true" }), target({ targetType: "unknown" })]) {
      option.dataset.target = JSON.stringify(value); assert.equal(f.api.readSelectedLinkTarget(f.parts.recordSelect), null);
    }
    for (const text of ["", "{invalid"]) { option.dataset.target = text; assert.equal(f.api.readSelectedLinkTarget(f.parts.recordSelect), null); }
    assert.equal(f.api.readSelectedLinkTarget(null), null); option.selected = false; assert.equal(f.api.readSelectedLinkTarget(f.parts.recordSelect), null);
    const valid = target(); assert.equal(f.api.readNoteLinkTargets({ targets: [valid, {}] }), null);
    assert.deepEqual(plain(f.api.readNoteLinkTargets({ targets: [valid] })), [valid]);
  });
  it("checks only published parts it consumes, retains valid identity and falls back on unreadable anatomy", () => {
    const f = fixture(); assert.equal(f.api.editorContextPickerParts() === f.parts, true, "The real published parts object retains its identity");
    const mount = fallbackMount(f);
    for (const name of ["setRecords", "setClientContexts", "setLinkedItems"]) {
      const partial = { [name]: () => {} }; mount.viewParts = partial; assert.strictEqual(f.api.editorContextPickerParts(), partial);
      mount.viewParts = { [name]: "not callable" }; assertEmptyParts(f.api.editorContextPickerParts());
    }
    for (const value of [null, [], 1, { clientContextSelect: f.document.createElement("input") }]) {
      mount.viewParts = value; assertEmptyParts(f.api.editorContextPickerParts());
      f.api.replaceLinkTargetOptions([{ label: "Fallback", value: "fallback" }]); assert.equal(f.parts.recordSelect.options[0].value, "fallback");
    }
    mount.viewParts = { clientContextSelect: f.parts.clientContextSelect }; assert.strictEqual(f.api.editorContextPickerParts(), mount.viewParts);
    Reflect.deleteProperty(mount, "viewParts"); assertEmptyParts(f.api.editorContextPickerParts());
    f.context.contextList = null; assertEmptyParts(f.api.editorContextPickerParts());
  });
  it("builds the outgoing query with trimmed search and only applicable workspace scope", async () => {
    const f = fixture();
    for (const business of [true, false]) for (const scope of ["all", "workspace", "client"]) {
      f.context.business = business; f.context.answer = Promise.resolve({ targets: [target()] });
      assert.equal((await f.api.fetchLinkTargets({ targetType: "note", search: "  needle  ", clientScope: scope, clientId: "id / one", limit: 40 })).length, 1);
      const call = f.calls.at(-1); assert.ok(call); const query = new URL(String(call[1]), "http://local").searchParams;
      assert.equal(query.get("targetType"), "note"); assert.equal(query.get("limit"), "40"); assert.equal(query.get("q"), "needle");
      assert.equal(query.get("clientScope"), business && scope !== "all" ? scope : null); assert.equal(query.get("clientId"), business && scope === "client" ? "id / one" : null);
      assert.deepEqual(plain(call[2]), { cache: "no-store" });
    }
    await f.api.fetchLinkTargets(); assert.equal(new URL(String(f.calls.at(-1)?.[1]), "http://local").searchParams.has("q"), false);
  });
  it("shows loading until the checked read settles, distinguishes invalid and empty directories and enables recovery", async () => {
    const f = fixture(); let resolve = (/** @type {unknown} */ _value) => {};
    f.context.answer = new Promise((done) => { resolve = done; }); f.parts.targetSelect.value = "note"; f.parts.searchInput.value = "needle";
    const loading = f.api.loadEditorLinkTargets(); assert.equal(f.parts.recordSelect.disabled, true);
    assert.equal(f.parts.recordSelect.options[0].textContent, "Loading records...");
    resolve({ targets: [target()] }); await loading; assert.equal(f.parts.recordSelect.disabled, false); assert.equal(f.state.linkTargets.length, 1);
    f.context.answer = Promise.resolve({ targets: [target(), {}] }); await f.api.loadEditorLinkTargets();
    assert.equal(f.parts.recordSelect.options[0].textContent, "Link targets could not be loaded."); assert.deepEqual(plain(f.state.linkTargets), []);
    f.context.answer = Promise.reject(new Error("unavailable")); await f.api.loadEditorLinkTargets(); assert.equal(f.parts.recordSelect.options[0].textContent, "No records available");
    f.context.answer = Promise.resolve({ targets: [] }); await f.api.loadEditorLinkTargets(); assert.equal(f.parts.recordSelect.options[0].textContent, "No records found");
    f.context.contextResultsInput = null; const before = f.calls.length; await f.api.loadEditorLinkTargets(); assert.equal(f.calls.length, before);
  });
  it("changes client scope before reloading and debounces against the actual timer slot without sleeping", async () => {
    const f = fixture(); assert.equal(f.state.linkTargetSearchTimer, null); assert.equal(f.state.linkTargetClientContext, "all");
    f.parts.clientContextSelect.value = " client-a "; f.api.handleEditorLinkClientContextChange();
    assert.equal(f.state.linkTargetClientContext, "client-a"); assert.equal(f.calls.filter(([kind]) => kind === "get").length, 1);
    await Promise.resolve(); await Promise.resolve(); f.calls.length = 0;
    f.api.queueEditorLinkTargetSearch(); const first = f.state.linkTargetSearchTimer;
    assert.deepEqual(f.calls, [["clear", undefined], ["timer", 180]]); assert.equal(f.timers.has(first), true);
    f.api.queueEditorLinkTargetSearch(); assert.equal(f.timers.has(first), false); assert.equal(f.timers.size, 1);
    const latest = f.timers.get(f.state.linkTargetSearchTimer); assert.ok(latest); await latest();
    assert.equal(f.calls.filter(([kind]) => kind === "get").length, 1);
    f.context.contextClientInput = null; f.api.handleEditorLinkClientContextChange(); assert.equal(f.state.linkTargetClientContext, "all");
    await Promise.resolve(); await Promise.resolve();
  });
});
