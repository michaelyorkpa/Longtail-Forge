import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";

const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  const document = new FakeDocument();
  /** @type {unknown[][]} */ const calls = [];
  const controls = Object.fromEntries([
    ...["Lifecycle", "Status", "Priority", "Project", "TagAction", "Tags"].map((name) => [`bulk${name}Input`, document.createElement("select")]),
    ...["BlockedReason", "DueDate", "ClearDueDate", "DueTime", "ClearDueTime"].map((name) => [`bulk${name}Input`, document.createElement("input")]),
  ]);
  const s = vm.createContext({
    ...fakeDomConstructors(), document, ...controls, bulkAssigneesControl: null,
    bulkApplyButton: document.createElement("button"), selectAllInput: document.createElement("input"),
    state: { selectedTaskIds: new Set(["b", "a"]), tasks: [{ task_id: "a", status: "open" }, { task_id: "b", status: "archived" }], options: { projects: [] } },
    renderTasks: () => calls.push(["render"]), usesClientScope: () => true,
    requireModalDialogs: () => ({ confirm: async (/** @type {unknown} */ options) => { calls.push(["confirm", options]); return false; } }),
    requireCapturePrompt: () => ({ open: async (/** @type {unknown} */ options) => { calls.push(["prompt", options]); return { confirmed: false, value: "" }; } }),
    updateBulkControls: () => calls.push(["controls"]),
    ...overrides,
  });
  for (const name of ["taskRowField", "callTaskRowMethod", "requireBulkElement", "requireBulkDetails", "requireBulkButton", "requireBulkInput", "requireBulkSelect", "optionalBulkInput", "optionalBulkSelect", "bulkTaskTagId", "selectedBulkActions", "pushLifecycleBulkAction", "bulkLifecycleTaskIds", "selectedTasksForBulk", "selectedBulkAssigneeIds", "selectedBulkTagIds", "hasMixedValues", "hasMixedTagValues", "mixedBulkActionWarnings", "confirmMixedBulkActions", "confirmBulkArchive", "captureBulkBlockedReason", "syncSelectionToTasks", "toggleVisibleSelection", "updateSelectionControls", "syncBulkDueControlStates", "applyBulkAction"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, calls, document };
}

describe("Tasks bulk controls and action ordering", () => {
  it("retains selection identity and insertion order through reconciliation and toggling", () => {
    const { s, calls } = fixture();
    const selection = s.state.selectedTaskIds;
    selection.add("gone");
    s.syncSelectionToTasks([{ task_id: "a" }]);
    assert.equal(s.state.selectedTaskIds, selection);
    assert.deepEqual([...selection], ["b", "a"]);
    selection.delete("a");
    s.selectAllInput.checked = true;
    s.toggleVisibleSelection();
    assert.deepEqual([...selection], ["b", "a"]);
    assert.deepEqual(calls, [["render"]]);
    s.updateSelectionControls(s.state.tasks);
    assert.equal(s.selectAllInput.checked, true);
    selection.delete("a");
    s.updateSelectionControls(s.state.tasks);
    assert.equal(s.selectAllInput.indeterminate, true);
    s.syncSelectionToTasks([]);
    assert.equal(selection.size, 0);
  });

  it("continues reading the select-all control for each task, then renders once", () => {
    const { s, calls } = fixture();
    let reads = 0;
    Object.defineProperty(s.selectAllInput, "checked", { get: () => ++reads === 1 });
    s.toggleVisibleSelection();
    assert.equal(reads, 2);
    assert.deepEqual([...s.state.selectedTaskIds], ["a"]);
    assert.deepEqual(calls, [["render"]]);
  });

  it("builds actions in established order and carries selection references", () => {
    const { s } = fixture();
    s.bulkLifecycleInput.value = "restore";
    s.bulkStatusInput.value = "blocked";
    s.bulkBlockedReasonInput.value = "  waiting  ";
    s.bulkPriorityInput.value = "high";
    s.bulkProjectInput.value = "project";
    s.state.options.projects = [{ id: "project", client_id: "client" }];
    s.bulkDueDateInput.value = "2026-10-01";
    s.bulkDueTimeInput.value = "10:30";
    s.selectedBulkAssigneeIds = () => ["user"];
    s.bulkTagActionInput.value = "tag_replace";
    s.selectedBulkTagIds = () => ["tag"];
    const ids = ["b", "a"];
    const actions = s.selectedBulkActions(ids);
    assert.deepEqual(plain(actions.map((/** @type {{action:string}} */ action) => action.action)), ["restore", "status", "priority", "project_assign", "due_date", "due_time", "assignee_replace", "tag_replace"]);
    assert.deepEqual(plain(actions[0].task_ids), ["b"]);
    for (const action of actions.slice(1)) assert.equal(action.task_ids, ids);
    assert.equal(actions[1].blocked_reason, "waiting");
    assert.equal(actions[3].client_id, "client");
    s.bulkLifecycleInput.value = "archive";
    s.bulkClearDueDateInput.checked = true;
    const clearing = s.selectedBulkActions(ids);
    assert.equal(clearing.at(-1).action, "archive");
    assert.deepEqual(plain(clearing.at(-1).task_ids), ["a"]);
    assert.equal(clearing.find((/** @type {{action:string}} */ action) => action.action === "due_date").due_date, "");
    assert.equal(clearing.some((/** @type {{action:string}} */ action) => action.action === "due_time"), false);
  });

  it("preserves warning order, destructive wording and the review-first cancellation", async () => {
    const { s, calls } = fixture();
    s.state.tasks = [
      { task_id: "a", due_date: "one", due_time: "one", project_id: "one", tags: [{ tag_id: "one" }] },
      { task_id: "b", due_date: "two", due_time: "two", project_id: "two", tags: [{ tag_id: "two" }] },
    ];
    const actions = ["due_date", "due_time", "project_assign", "tag_replace", "archive"].map((action) => ({ action, task_ids: ["b", "a"] }));
    const warnings = ["Selected tasks currently have different due dates.", "Selected tasks currently have different due times.", "Selected tasks currently have different Projects.", "Selected tasks currently have different tags."];
    assert.deepEqual(plain(s.mixedBulkActionWarnings(actions, ["b", "a"])), warnings);
    assert.equal(await s.confirmMixedBulkActions(actions, ["b", "a"]), false);
    assert.deepEqual(plain(calls), [["confirm", {
      title: "Archive selected tasks?", message: `${warnings.join(" ")} Archive 2 selected tasks? Archived tasks move to the Archived view and can be restored later.`,
      confirmLabel: "Archive Tasks", cancelLabel: "Review First", danger: true,
    }]]);
    s.requireModalDialogs = () => null;
    s.window = { confirm: (/** @type {string} */ message) => { calls.push(["native", message]); return false; } };
    assert.equal(await s.confirmMixedBulkActions(actions.slice(0, 4), ["b", "a"]), false);
    assert.deepEqual(calls.at(-1), ["native", `${warnings.join(" ")} Apply these bulk changes?`]);
  });

  it("keeps tag projection boxing, inherited getters, ordering and null refusal", () => {
    const { s } = fixture();
    let reads = 0;
    const inherited = Object.create({ get tag_id() { reads += 1; return "a"; } });
    assert.equal(s.hasMixedTagValues([{ tags: [inherited, { tag_id: "b" }, 7] }, { tags: [{ tag_id: "b" }, { tag_id: "a" }] }]), false);
    assert.equal(reads, 1);
    assert.equal(s.hasMixedTagValues([{ tags: [] }, { tags: [{ tag_id: "b" }] }]), true);
    assert.throws(() => s.hasMixedTagValues([{ tags: [null] }]), /tag row is unavailable/);
  });

  it("keeps optional absence, while refusing a wrong control only at its required use", () => {
    const { s, document } = fixture();
    assert.equal(s.optionalBulkInput(null), undefined);
    assert.equal(s.optionalBulkSelect(undefined), undefined);
    s.bulkStatusInput = null;
    s.bulkTagsInput = null;
    assert.deepEqual(plain(s.selectedBulkActions(["a"])), []);
    s.selectAllInput = null;
    s.updateSelectionControls([]);
    s.selectAllInput = document.createElement("div");
    assert.throws(() => s.toggleVisibleSelection(), /input control is unavailable/);
    for (const [name, tag] of [["requireBulkInput", "input"], ["requireBulkSelect", "select"], ["requireBulkButton", "button"], ["requireBulkDetails", "details"], ["requireBulkElement", "span"]]) {
      const element = document.createElement(tag);
      assert.equal(s[name](element), element);
      assert.throws(() => s[name](null), /control is unavailable/);
    }
  });

  it("cancels a blocked-reason prompt before changing a control or constructing actions", async () => {
    const { s, calls } = fixture();
    s.bulkStatusInput.value = "blocked";
    assert.equal(await s.captureBulkBlockedReason(), false);
    assert.equal(s.bulkBlockedReasonInput.value, "");
    assert.equal(calls.length, 1);
    s.requireCapturePrompt = () => ({ open: async () => ({ confirmed: true, value: "reason" }) });
    assert.equal(await s.captureBulkBlockedReason(), true);
    assert.equal(s.bulkBlockedReasonInput.value, "reason");
    assert.deepEqual(calls.at(-1), ["controls"]);
    assert.equal(await s.captureBulkBlockedReason(), true);
    assert.equal(calls.length, 2);
  });

  for (const fails of [false, true]) it(`keeps serial writes and ${fails ? "thrown-write state" : "partial-result reporting"}`, async () => {
    const { s, calls } = fixture();
    const actions = [{ action: "priority" }, { action: "archive" }];
    const selection = s.state.selectedTaskIds;
    s.captureBulkBlockedReason = async () => true;
    s.selectedBulkActions = () => actions;
    s.confirmMixedBulkActions = async () => true;
    s.setStatus = (/** @type {unknown[]} */ ...args) => calls.push(["status", ...args]);
    s.requireApi = () => ({ postJson: async (/** @type {string} */ path, /** @type {{action:string}} */ payload) => {
      calls.push(["post", path, payload.action]);
      await Promise.resolve();
      if (fails && payload.action === "archive") throw new Error("write failed");
      calls.push(["resolved", payload.action]);
      return { tasks: [{ task_id: payload.action }], errors: payload.action === "archive" ? [{ message: "denied" }] : [] };
    } });
    s.requireTaskRecords = () => ({ readBulkTasks: (/** @type {{tasks:unknown[]}} */ result) => result.tasks, readBulkRecurrenceContinuities: () => [] });
    s.requireErrors = () => ({ readBulkFailures: (/** @type {{errors:unknown[]}} */ result) => result.errors, caughtMessage: (/** @type {Error} */ error) => error.message });
    s.upsertTask = (/** @type {unknown} */ task) => calls.push(["upsert", task]);
    s.resetBulkInputs = () => calls.push(["reset"]);
    s.reloadTaskList = async () => calls.push(["reload"]);
    await s.applyBulkAction();
    assert.deepEqual(calls.slice(0, 4), [["status", "Updating selected tasks..."], ["post", "/api/tasks/bulk", "priority"], ["resolved", "priority"], ["post", "/api/tasks/bulk", "archive"]]);
    assert.equal(s.state.selectedTaskIds, selection);
    if (fails) {
      assert.equal(selection.size, 2);
      assert.deepEqual(plain(calls.slice(4)), [["status", "write failed", { isError: true }]]);
    } else {
      assert.equal(selection.size, 0);
      assert.deepEqual(plain(calls.slice(4)), [["resolved", "archive"], ["upsert", { task_id: "priority" }], ["upsert", { task_id: "archive" }], ["reset"], ["reload"], ["status", "Updated 2 task changes. 1 changes could not be updated. denied", { isError: false }]]);
    }
  });

  it("never writes, clears selection or resets controls after confirmation cancellation", async () => {
    const { s } = fixture();
    let posts = 0;
    s.requireApi = () => ({ postJson: async () => { posts += 1; } });
    s.bulkPriorityInput.value = "high";
    s.bulkLifecycleInput.value = "archive";
    await s.applyBulkAction();
    assert.equal(posts, 0);
    assert.deepEqual([...s.state.selectedTaskIds], ["b", "a"]);
    assert.equal(s.bulkPriorityInput.value, "high");
  });
});
