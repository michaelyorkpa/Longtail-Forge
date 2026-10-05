import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const document = new FakeDocument();
  const s = vm.createContext({ document, ...fakeDomConstructors(), URLSearchParams,
    TASK_LIST_PAGE_SIZE: 100, TASK_FILTER_STORAGE_KEY: "lf_tasks_filters_v1", DEFAULT_TASK_VIEW: "my",
    TASK_VIEW_VALUES: new Set(["all", "my", "unassigned", "overdue", "today", "week", "complete", "archived"]),
    state: { quickFilter: "all", options: { clients: [], projects: [] } },
    sortInput: { value: "due_asc" }, statusFilter: { value: "active" }, assigneeFilter: { value: "all" },
    clientFilter: { value: "all" }, projectFilter: { value: "all" }, tagFilter: null, tagFilterController: null,
    usesClientScope: () => true, window: { LongtailForge: {} }, ...extra,
  });
  for (const name of ["taskControlValue", "taskOptionalControlField", "taskRowKey", "requireBulkSelect", "setSelectValue", "replaceOptions", "canonicalStatusValue", "canonicalTaskViewValue", "canonicalSortValue", "normalizeTagFilterValue", "selectedTaskTagFilterValue", "noTagsFilterValue", "selectedTaskView", "buildTaskQuery", "projectMatchesClient", "projectOptionsForClient", "descendantClientScopeIdsForFilter", "taskFilterLabelField", "optionLabel", "taskOptions", "taskSelect", "taskCheckboxLine", "populateTagFilter", "defaultStatusForTaskView", "isStatusFilterCompatibleWithTaskView", "preserveCompatibleAdvancedFiltersForTaskView", "resetAdvancedFilterControlsForTaskView", "setStatusFilterValue", "saveFilterState"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, document };
}

describe("Tasks filter controls and canonical query", () => {
  it("preserves canonical query entries, their order, aliases, cursor and workspace client scope", () => {
    const { s } = fixture();
    s.state.quickFilter = "complete";
    s.statusFilter.value = "all";
    s.sortInput.value = "oldest";
    s.assigneeFilter.value = "someone";
    s.clientFilter.value = "";
    s.projectFilter.value = "project";
    s.tagFilter = { dataset: { tagFilterValue: "__no_effective_tags__" } };
    assert.deepEqual([...new URLSearchParams(s.buildTaskQuery("cursor +/"))], [
      ["task_view", "completed"], ["status", "all"], ["sort", "created_asc"], ["limit", "100"],
      ["assignee_id", "someone"], ["client_id", ""], ["project_id", "project"], ["tags", "__no_tags__"], ["cursor", "cursor +/"],
    ]);
    s.usesClientScope = () => false;
    assert.equal(new URLSearchParams(s.buildTaskQuery()).has("client_id"), false);
    s.assigneeFilter.value = "me";
    assert.equal(new URLSearchParams(s.buildTaskQuery()).get("assignee"), "me");
    s.assigneeFilter.value = "unassigned";
    assert.equal(new URLSearchParams(s.buildTaskQuery()).get("assignee"), "unassigned");
    assert.equal(s.canonicalTaskViewValue("custom"), "custom");
    assert.equal(s.canonicalSortValue("custom"), "due_at");
    assert.equal(s.canonicalStatusValue(""), "active");
    const inherited = vm.runInContext("Object.prototype.toString", s);
    assert.equal(s.canonicalTaskViewValue("toString"), inherited);
    assert.equal(s.canonicalSortValue("toString"), inherited);
    s.sortInput.value = "toString";
    const native = new URLSearchParams(); native.set("sort", String(inherited));
    assert.equal(new URLSearchParams(s.buildTaskQuery()).get("sort"), native.get("sort"));
  });

  it("preserves ordered descendant closure and project identities, including cycles and no client", () => {
    const { s } = fixture();
    s.state.options.clients = [{ id: "a", parent_client_id: "b" }, { id: "b", parent_client_id: "a" }, { id: "c", parent_client_id: "a" }, { id: "d", parent_client_id: "c" }];
    const a = { id: "1", client_id: "b" }, b = { id: "2", client_id: "d" }, c = { id: "3", client_id: "" };
    s.state.options.projects = [b, c, a];
    assert.deepEqual(plain(s.descendantClientScopeIdsForFilter(" a ")), ["a", "b", "c", "d"]);
    assert.deepEqual(plain(s.descendantClientScopeIdsForFilter(null)), [""]);
    const results = s.projectOptionsForClient("a");
    assert.equal(results[0], b); assert.equal(results[1], a);
    assert.equal(s.projectOptionsForClient("")[0], c);
    assert.equal(s.projectOptionsForClient("all")[1], c);
    assert.equal(s.projectMatchesClient(null, "all"), true);
  });

  it("preserves optional label precedence, raw identity and inherited primitive getter receivers", () => {
    const { s } = fixture();
    const label = { opaque: true };
    assert.equal(s.optionLabel({ optionLabel: label, get display_label() { throw new Error("read too far"); } }), label);
    assert.equal(s.optionLabel({ optionLabel: "", display_label: "legacy", displayName: "display" }), "legacy");
    assert.equal(s.optionLabel(null), "");
    assert.equal(s.optionLabel({ displayName: "", name: "", title: "title" }), "title");
    vm.runInContext('Object.defineProperty(Number.prototype, "displayName", {get() {"use strict"; globalThis.receiver = this; return "number";}})', s);
    assert.equal(s.optionLabel(7), "number"); assert.equal(s.receiver, 7);
    const failure = new Error("getter failure");
    assert.throws(() => s.optionLabel({ get optionLabel() { throw failure; } }), (error) => error === failure);
  });

  it("forwards real builder tuples with their selected member and checkbox attribute precedence", () => {
    const { s } = fixture({ requireView: () => ({ createElement: (/** @type {string} */ tag, /** @type {unknown} */ options) => ({ tag, options }) }) });
    const attrs = { "data-control": "x" };
    const select = s.taskSelect(attrs, [["a", "A", true], ["b", "B"]]);
    assert.equal(select.options.attrs, attrs);
    assert.deepEqual(plain(select.options.children), [
      { tag: "option", options: { attrs: { value: "a", selected: true }, text: "A" } },
      { tag: "option", options: { attrs: { value: "b", selected: false }, text: "B" } },
    ]);
    const label = { opaque: true };
    const checkbox = s.taskCheckboxLine(label, { type: "radio", value: "v" });
    assert.equal(checkbox.options.children[1], label);
    assert.equal(checkbox.options.children[0].options.attrs.type, "radio");
  });

  it("preserves option node order and selection, optional absence and refusal of a non-select", () => {
    const { s, document } = fixture();
    const select = document.createElement("select");
    const a = document.createElement("option"), b = document.createElement("option");
    a.value = "a"; b.value = "b"; a.selected = true;
    select.append(a, b);
    s.setSelectValue(select, "b"); assert.equal(select.value, "b");
    s.setSelectValue(select, "missing"); assert.equal(select.value, "b");
    b.selected = true; a.selected = false;
    s.replaceOptions(select, [b, a]);
    assert.equal(select.children[0], b); assert.equal(select.children[1], a); assert.equal(select.value, "b");
    select.multiple = true; a.selected = true;
    s.replaceOptions(select, [a, b]);
    assert.equal(a.selected, true); assert.equal(b.selected, true);
    s.setSelectValue(null, "a"); s.replaceOptions(undefined, []);
    for (const fn of [() => s.setSelectValue(document.createElement("input"), "a"), () => s.replaceOptions(document.createElement("div"), [])])
      assert.throws(fn, { name: "TypeError", message: "Tasks bulk select control is unavailable." });
  });

  it("keeps tag catalogue identity, remount rules, aliases and controller receiver", () => {
    const { s, document } = fixture();
    s.tagFilter = document.createElement("input"); s.tagFilterControl = document.createElement("label");
    const tags = [{ tag_id: "t" }]; s.state.tagOptions = tags;
    /** @type {unknown[][]} */ const calls = [];
    const controller = { readValue() { return "t"; }, setTags(/** @type {unknown} */ value) { assert.equal(this, controller); calls.push(["tags", value]); }, setValue(/** @type {unknown} */ value) { assert.equal(this, controller); calls.push(["value", value]); } };
    s.window.LongtailForge.tags = { mountFilterPicker: (/** @type {unknown} */ input, /** @type {{tags:unknown,value:unknown}} */ options) => { calls.push(["mount", input, options.tags, options.value]); return controller; } };
    s.populateTagFilter();
    assert.equal(calls[0]?.[1], s.tagFilter); assert.equal(calls[0]?.[2], tags); assert.equal(calls[0]?.[3], "all");
    assert.equal(s.tagFilterControl.hidden, false);
    s.populateTagFilter(); assert.equal(calls[1]?.[1], tags); assert.deepEqual(calls[2], ["value", "t"]);
    s.state.tagOptions = []; s.populateTagFilter();
    assert.equal(s.tagFilterControl.hidden, true); assert.deepEqual(calls.at(-1), ["value", "all"]);
  });

  it("keeps view compatibility resets and persists only sort and saved view", () => {
    const { s, document } = fixture({ requireTaskLifecycleLegality: () => ({ isTerminalStatus: (/** @type {unknown} */ status) => status === "complete" || status === "archived" }) });
    for (const name of ["statusFilter", "assigneeFilter", "clientFilter", "projectFilter"]) {
      const select = document.createElement("select");
      for (const value of ["active", "complete", "archived", "all", "person", "scope"]) { const o = document.createElement("option"); o.value = value; select.append(o); }
      select.value = name === "statusFilter" ? "complete" : "scope"; s[name] = select;
    }
    s.preserveCompatibleAdvancedFiltersForTaskView("my");
    assert.equal(s.statusFilter.value, "active"); assert.equal(s.assigneeFilter.value, "all"); assert.equal(s.clientFilter.value, "scope");
    s.usesClientScope = () => false; s.preserveCompatibleAdvancedFiltersForTaskView("complete");
    assert.equal(s.statusFilter.value, "complete"); assert.equal(s.clientFilter.value, "all");
    /** @type {unknown[]} */ const tags = [];
    s.tagFilterController = { setValue: (/** @type {unknown} */ value) => tags.push(value) };
    s.resetAdvancedFilterControlsForTaskView("archived");
    assert.equal(s.statusFilter.value, "archived"); assert.equal(s.projectFilter.value, "all"); assert.equal(s.sortInput.value, "due_asc"); assert.deepEqual(tags, ["all"]);
    /** @type {unknown[][]} */ const saved = [];
    s.window.localStorage = { setItem: (/** @type {unknown[]} */ ...args) => saved.push(args) };
    s.saveFilterState(); assert.deepEqual(saved, [["lf_tasks_filters_v1", '{"sort":"due_asc","quickFilter":"all"}']]);
  });
});
