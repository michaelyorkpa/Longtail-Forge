import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = createProjectTextReader().readText("public/js/workbench-task-focus-presentation.js") + "\n" + read("public/js/workbench.js");
const extracted = read("public/js/workbench-task-focus-checklist.js");
const before = JSON.parse(read("tests/unit/fixtures/workbench-checklist-before-extraction.json"));
const hosts = ["requireView", "emptyState", "safeTaskFocusText", "safeCandidateText", "looksLikeRawId",
  "createWorkbenchSectionSummary", "setWorkbenchDisclosureOpen", "updateDisclosureExpandedState",
  "handleTaskFocusChecklistChange", "taskFocusChecklistClosest", "taskFocusChecklistRequiredField",
  "taskFocusChecklistResultFields", "applyTaskFocusChecklistResult"];

/** @param {import("../../scripts/test-support/fake-dom.mjs").FakeElement} element @returns {object} */
function tree(element) {
  return { tag: element.tagName, text: element.textContent, className: element.className,
    dataset: { ...element.dataset }, attributes: [...element.attributes], checked: element.checked,
    disabled: element.disabled, children: element.children.map(tree) };
}

/** @param {boolean} [baseline] */
function fixture(baseline = false) {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({ ...browser,
    state: { activeTaskFocus: { taskId: "task-one", task: {}, checklistMutationItemId: "" } },
    requireApi: () => ({ postJson: async (/** @type {string} */ route) => { calls.push(["post", route]); return { task: { title: "saved" } }; } }),
    applyActiveTaskFocusTask: (/** @type {unknown} */ task) => calls.push(["task", task]),
    renderTaskFocusSurface: () => calls.push(["surface"]),
    renderWorkbench: () => calls.push(["render"]),
    setStatus: (/** @type {unknown} */ message) => calls.push(["status", message]),
  });
  vm.runInContext("const host = { get state() { return state; } };", scope);
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  vm.runInContext(read("public/js/shared/error-contract.js"), scope);
  scope.requireErrors = () => scope.window.LongtailForge.errors;
  vm.runInContext(hosts.map(n => extractFunctionBlock(source, n)).join("\n"), scope);
  if (baseline) {
    vm.runInContext("const TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX = 20;\n" + Object.values(before.functions).join("\n"), scope);
  } else {
    vm.runInContext(extracted, scope);
    vm.runInContext("let taskFocusChecklistRenderer = null;\n" +
      ["requireTaskFocusChecklistRenderer", "createTaskFocusChecklistSection"].map(n => extractFunctionBlock(source, n)).join("\n"), scope);
  }
  return { scope, calls };
}

it("moves the eight baseline bodies without changing their tokens or adding host state", () => {
  const normalize = (/** @type {string} */ text) => text.split(/\r?\n/).map(l => l.trim()).join("\n");
  for (const [name, block] of Object.entries(before.functions)) {
    assert.equal(normalize(extractFunctionBlock(extracted, name)), normalize(String(block)), name);
  }
  assert.doesNotMatch(extracted, /\bstate\.|requireApi|fetch\(|localStorage|setTimeout/);
  assert.match(read("views/protected/workbench.html"), /<script defer src="js\/workbench-task-focus-checklist\.js"><\/script>\s*<script defer src="js\/workbench-task-focus-presentation\.js"><\/script>\s*<script defer src="js\/workbench\.js"><\/script>/);
});

it("matches the old section through real view and host functions for populated, pending, error and empty states", () => {
  for (const active of [null, {}, { isLoading: true }, { error: "failed" },
    { checklistError: "Retry", task: { checklistItems: [] } },
    { checklistMutationItemId: { opaque: true }, task: { checklistItems: [null, { task_checklist_item_id: 7, label: "A long checklist label that must truncate", is_checked: true }] } },
    { task: { checklistItems: [{ label: "Next" }], checklistProgress: { completed_count: 2, total_count: 3, next_incomplete_item_label: "Next" } } },
  ]) {
    const old = fixture(true).scope.createTaskFocusChecklistSection(active);
    const next = fixture().scope.createTaskFocusChecklistSection(active);
    assert.deepEqual(tree(next), tree(old));
    assert.equal(next.open, old.open);
    assert.equal(next.querySelector("summary").getAttribute("aria-expanded"), old.querySelector("summary").getAttribute("aria-expanded"));
  }
});

it("keeps opaque getter receivers and read order across the seam", () => {
  /** @type {string[]} */ const reads = [];
  const item = { get label() { assert.equal(this, item); reads.push("label"); return "Read"; },
    get is_checked() { assert.equal(this, item); reads.push("checked"); return false; } };
  const active = { get task() { assert.equal(this, active); reads.push("task"); return { checklistItems: [item] }; } };
  fixture(true).scope.createTaskFocusChecklistSection(active);
  const expected = [...reads]; reads.length = 0;
  fixture().scope.createTaskFocusChecklistSection(active);
  assert.deepEqual(reads, expected);
});

it("attaches the original host listener and keeps check/uncheck writes and cleanup in Workbench", async () => {
  for (const baseline of [true, false]) {
    const { scope, calls } = fixture(baseline);
    const active = scope.state.activeTaskFocus;
    active.task = { checklistItems: [{ task_checklist_item_id: "item-one", label: "Read" }] };
    const section = scope.createTaskFocusChecklistSection(active);
    const body = section.querySelector("#workbench-task-focus-checklist-body");
    assert.equal(body.listeners.get("change")?.length, 1, "exactly one change listener remains attached");
    const callback = body.listeners.get("change")[0].listener;
    assert.equal(callback, scope.handleTaskFocusChecklistChange);
    const checkbox = section.querySelector("input");
    checkbox.checked = true;
    await callback.call(body, { target: checkbox, currentTarget: body });
    checkbox.checked = false;
    await callback.call(body, { target: checkbox, currentTarget: body });
    assert.deepEqual(calls.filter(c => c[0] === "post"), [
      ["post", "/api/tasks/task-one/checklist/item-one/check"],
      ["post", "/api/tasks/task-one/checklist/item-one/uncheck"],
    ]);
    assert.equal(scope.state.activeTaskFocus.checklistMutationItemId, "");
    assert.equal(calls.filter(c => c[0] === "render").length, 2);
  }
});

it("creates the renderer once and leaves publication synchronous and isolated", () => {
  const { scope } = fixture();
  const first = scope.requireTaskFocusChecklistRenderer();
  assert.equal(scope.requireTaskFocusChecklistRenderer(), first);
  assert.equal(scope.taskFocusChecklistField, undefined);
  assert.equal(scope.create, undefined);
  assert.equal(Object.isFrozen(scope.window.LongtailForge.workbenchTaskFocusChecklist), true);
});
