import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
const names = ["taskFocusChecklistField", "taskFocusChecklistRequiredField", "taskFocusChecklistResultFields", "taskFocusChecklistClosest", "taskFocusChecklistItems", "taskFocusChecklistProgress", "formatTaskFocusChecklistProgress", "truncateTaskFocusChecklistLabel", "createTaskFocusChecklistItem", "createTaskFocusChecklistBody", "safeTaskFocusText", "safeCandidateText", "looksLikeRawId", "applyTaskFocusChecklistResult", "handleTaskFocusChecklistChange"];
function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const state = { activeTaskFocus: { taskId: "one", task: {}, checklistError: "", checklistMutationItemId: "" } };
  const scope = vm.createContext({ state, TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX: 20,
    requireView: () => ({
      createElement: (/** @type {string} */ tag, /** @type {object} */ options) => ({ tag, ...options }),
      createEmptyState: (/** @type {unknown} */ options) => options,
    }),
    emptyState: (/** @type {unknown} */ text) => ({ text }),
    applyActiveTaskFocusTask: (/** @type {unknown} */ task) => calls.push(["task", task]),
    requireApi: () => ({ postJson: async (/** @type {string} */ path) => { calls.push(["post", path]); return {}; } }),
    setStatus: (/** @type {unknown} */ text) => calls.push(["status", text]),
    renderTaskFocusSurface: () => calls.push(["surface"]), renderWorkbench: () => calls.push(["render"]),
    requireErrors: () => ({ caughtMessage: (/** @type {Error} */ e) => e.message }),
  });
  vm.runInContext(names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  return { scope, state, calls };
}
it("preserves item arrays by identity, holes and fallback counts without validating opaque entries", () => {
  const { scope: s } = fixture();
  const items = [null, { label: "First", is_checked: 0 }, { is_checked: "yes" }, , 7];
  assert.equal(s.taskFocusChecklistItems({ checklistItems: items }), items);
  assert.equal(s.taskFocusChecklistItems({ checklistItems: {} }).length, 0);
  const progress = s.taskFocusChecklistProgress({}, items);
  assert.equal(progress.completed_count, 1); assert.equal(progress.total_count, 5);
  assert.equal(progress.next_incomplete_item_label, "");
  const supplied = { opaque: true };
  assert.equal(s.taskFocusChecklistProgress({ checklistProgress: supplied }, items), supplied);
  assert.equal(s.taskFocusChecklistProgress({ checklistProgress: "opaque" }, items), "opaque");
});
it("keeps optional inherited reads, primitive boxing, getter receiver and thrown conversion", () => {
  const { scope: s } = fixture();
  const inherited = Object.create({ is_checked: true, label: "Inherited" });
  assert.equal(s.taskFocusChecklistProgress({}, [inherited]).completed_count, 1);
  assert.equal(s.taskFocusChecklistField("text", "length"), 4);
  assert.equal(s.taskFocusChecklistField(null, "label"), undefined);
  const value = { get label() { assert.equal(this, value); return "Getter"; } };
  assert.equal(s.taskFocusChecklistField(value, "label"), "Getter");
  const failure = new Error("conversion");
  assert.throws(() => s.formatTaskFocusChecklistProgress({ total_count: { valueOf() { throw failure; } } }), e => e === failure);
});
it("preserves progress coercion, next-label truncation and untruncated accessible copy", () => {
  const { scope: s } = fixture();
  const next = "A checklist label longer than twenty characters";
  const progress = { total_count: "3", completed_count: true, next_incomplete_item_label: next };
  assert.equal(s.formatTaskFocusChecklistProgress(progress), "1 / 3 complete. Next: " + next.slice(0, 20) + "\u2026");
  assert.equal(s.formatTaskFocusChecklistProgress(progress, { truncate: false }), "1 / 3 complete. Next: " + next);
  assert.equal(s.formatTaskFocusChecklistProgress(null), "0 / 0 complete");
  assert.equal(s.truncateTaskFocusChecklistLabel(0, 20), "");
});
it("renders checked/disabled rows and loading, failure and empty bodies without filtering", () => {
  const { scope: s } = fixture();
  const row = s.createTaskFocusChecklistItem({ task_checklist_item_id: 12, label: "Read", is_checked: "yes" }, { checklistMutationItemId: "other" });
  assert.equal(row.dataset.taskChecklistItem, "12");
  assert.equal(row.children[0].checked, true); assert.equal(row.children[0].disabled, true);
  assert.equal(row.children[1].text, "Read");
  assert.equal(s.createTaskFocusChecklistItem(null, null).children[1].text, "Checklist item");
  assert.equal(s.createTaskFocusChecklistBody({ isLoading: true }, []).at(0).text, "Checklist is loading.");
  assert.equal(s.createTaskFocusChecklistBody({ error: "bad" }, []).at(0).text, "Checklist could not be loaded.");
  assert.equal(s.createTaskFocusChecklistBody(null, []).at(0).title, "No checklist items");
  const body = s.createTaskFocusChecklistBody({ checklistError: "Retry" }, [null, { label: "Second" }]);
  assert.equal(body[0].text, "Retry"); assert.equal(body[1].children.length, 2);
});
it("reads the mutation envelope lazily and preserves truthy task identity and fallback references", () => {
  const { scope: s, calls } = fixture();
  const task = { title: "caller seed" };
  s.applyTaskFocusChecklistResult({ task, get items() { throw new Error("unused"); } });
  assert.equal(calls[0][1], task);
  /** @type {unknown[]} */ const items = []; const progress = { total_count: 0 };
  s.applyTaskFocusChecklistResult({ items, checklistProgress: progress });
  const result = s.taskFocusChecklistResultFields({ task: 7 });
  assert.equal(result.task, 7);
  const merged = calls[1][1];
  assert.ok(merged && typeof merged === "object" && "checklistItems" in merged && "checklistProgress" in merged);
  assert.equal(merged.checklistItems, items); assert.equal(merged.checklistProgress, progress);
  s.state.activeTaskFocus = null;
  s.applyTaskFocusChecklistResult(null);
});
it("keeps required reads failing at consumption, and closest's receiver and result", () => {
  const { scope: s } = fixture();
  const projection = s.taskFocusChecklistResultFields(null);
  assert.throws(() => projection.task, /checklist value cannot be read/);
  const result = {};
  const host = { closest(/** @type {string} */ selector) { assert.equal(this, host); assert.equal(selector, "selector"); return result; } };
  assert.equal(s.taskFocusChecklistClosest(host, "selector"), result);
  assert.throws(() => s.taskFocusChecklistClosest({ closest: 1 }, "x"), /requires closest/);
});
it("keeps opaque row identity through the marker and native URL string conversion, posting once", async () => {
  const { scope: s, calls } = fixture();
  const identity = { toString: () => "row / one" };
  const row = { dataset: { taskChecklistItem: identity } };
  const checkbox = { checked: true, closest: () => row };
  await s.handleTaskFocusChecklistChange({ target: { closest: () => checkbox } });
  assert.deepEqual(calls.filter(call => call[0] === "post"), [["post", "/api/tasks/one/checklist/row%20%2F%20one/check"]]);
  assert.equal(s.state.activeTaskFocus.checklistMutationItemId, "");
  await s.handleTaskFocusChecklistChange({ target: { closest: () => null } });
  assert.equal(calls.filter(call => call[0] === "post").length, 1);
});

it("retains repeated getter reads and their order through row and progress rendering", () => {
  const { scope: s } = fixture();
  /** @type {string[]} */ const reads = [];
  const item = {
    get task_checklist_item_id() { reads.push("id"); return "item"; },
    get label() { reads.push("label"); return "Label"; },
    get is_checked() { reads.push("checked"); return reads.filter(r => r === "checked").length === 1; },
  };
  const row = s.createTaskFocusChecklistItem(item, null);
  assert.deepEqual(reads, ["id", "label", "checked", "checked"]);
  assert.equal(row.children[0].checked, true); assert.equal(row.className[1], "");
  reads.length = 0;
  const progress = {
    get total_count() { reads.push("total"); return 2; },
    get completed_count() { reads.push("completed"); return 1; },
    get next_incomplete_item_label() { reads.push("next"); return "Label"; },
  };
  assert.equal(s.formatTaskFocusChecklistProgress(progress), "1 / 2 complete. Next: Label");
  assert.deepEqual(reads, ["total", "completed", "next"]);
});
it("keeps unreadable target failure before status and conversion failure inside the handled write path", async () => {
  const { scope: s, calls } = fixture();
  await assert.rejects(s.handleTaskFocusChecklistChange({ target: null }), /checklist value cannot be read/);
  assert.equal(calls.length, 0);
  const id = Symbol("opaque");
  const checkbox = { checked: true, closest: () => ({ dataset: { taskChecklistItem: id } }) };
  /** @type {unknown[]} */ const markers = [];
  s.renderTaskFocusSurface = () => { markers.push(s.state.activeTaskFocus.checklistMutationItemId); };
  await s.handleTaskFocusChecklistChange({ target: { closest: () => checkbox } });
  assert.equal(calls.filter(call => call[0] === "post").length, 0);
  assert.deepEqual(markers, [id, ""]);
  assert.match(s.state.activeTaskFocus.checklistError, /Symbol/);
  assert.equal(s.state.activeTaskFocus.checklistMutationItemId, "");
});
