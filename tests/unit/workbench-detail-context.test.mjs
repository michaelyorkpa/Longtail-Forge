import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({
    state: { activeTaskFocus: { taskId: "task" } },
    requireView: () => ({ createElement: (/** @type {unknown} */ tag, /** @type {unknown} */ options) => ({ tag, options }) }),
    badge: (/** @type {unknown} */ label, /** @type {unknown} */ type) => ({ label, type }),
    taskFocusExitSnapshot: () => ({ task: {}, taskId: "task" }),
    requireNamespace: () => ({ taskResumeNoteCapture: { offer: async (/** @type {unknown} */ options) => { scope.options = options; return { captured: true }; } } }),
    applyActiveTaskFocusTask: (/** @type {unknown} */ task) => calls.push(["apply", task]),
    setStatus: (/** @type {unknown} */ message, /** @type {unknown} */ options) => calls.push(["status", message, options]),
    clearPendingTaskFocusDrift: () => calls.push(["clear"]),
    emptyState: (/** @type {unknown} */ value) => value,
    taskFocusTitle: () => "Task", taskFocusDueText: () => "No due date", formatToken: (/** @type {unknown} */ v) => v,
  });
  vm.runInContext(["workbenchDetailField", "safeCandidateText", "safeTaskFocusText", "safeRelatedContextText", "looksLikeRawId", "taskFocusAssigneesText", "relatedContextBadges", "createTaskDetailField", "createTaskDetailFields", "offerTaskResumeNoteBeforeExit"].map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  return { scope, calls };
}
it("assignee readers preserve repeated reads, inherited accessors, fallback labels and refusal timing", () => {
  const { scope: s } = fixture(); let reads = 0;
  const assignee = Object.create({ get displayName() { assert.equal(this, assignee); return ""; }, username: "Alice" });
  assert.equal(s.taskFocusAssigneesText({ get assignees() { reads++; return [assignee, { displayName: "Bob" }]; } }), "Alice, Bob");
  assert.equal(reads, 2);
  assert.equal(s.taskFocusAssigneesText({ assignees: [7, false, {}, { displayName: "0123456789abcdef01234567" }] }), "Unassigned");
  assert.throws(() => s.taskFocusAssigneesText({ assignees: [null] }), /detail value cannot be read/);
  const failure = new Error("getter");
  assert.throws(() => s.taskFocusAssigneesText({ assignees: [{ get displayName() { throw failure; } }] }), e => e === failure);
});
it("related badges retain empty-label short circuit, map-before-truncation and opaque type identity", () => {
  const { scope: s } = fixture(); const type = {};
  const rows = [{ label: "", get type() { throw new Error("unused"); } }, { label: "Visible", type }];
  assert.equal(s.relatedContextBadges({ badges: rows })[0].type, type);
  assert.equal(s.relatedContextBadges({ badges: [1, {}, { label: "0123456789abcdef01234567" }] }).length, 0);
  let sixth = false;
  const many = [...Array.from({ length: 5 }, () => ({ label: "label" })), { get label() { sixth = true; return "sixth"; } }];
  assert.equal(s.relatedContextBadges({ badges: many }).length, 4); assert.equal(sixth, true);
  assert.throws(() => s.relatedContextBadges({ badges: [null] }), /detail value cannot be read/);
});
it("the real detail literal keeps order, blocked-row presence and multiline state", () => {
  const { scope: s } = fixture();
  for (const status of ["open", "blocked"]) {
    const rows = s.createTaskDetailFields({ task: { status } })[0].options.children;
    assert.deepEqual(Array.from(rows, row => row.options.dataset.workbenchTaskDetailField), ["title", "status", "priority", "due", "assignees", "client", "project", ...(status === "blocked" ? ["blocked-reason"] : []), "description"]);
    assert.equal(rows.at(-1).options.className[1], "is-multiline");
  }
  assert.deepEqual(Array.from(s.createTaskDetailFields({ isLoading: true })), ["Task details are loading."]);
  assert.deepEqual(Array.from(s.createTaskDetailFields({ error: "Failed" })), ["Failed"]);
});
it("exit callbacks keep identity, optional reads, inherited error messages and clearing order", async () => {
  const { scope: s, calls } = fixture(); const trigger = {};
  await s.offerTaskResumeNoteBeforeExit({ trigger });
  assert.equal(s.options.trigger, trigger); assert.deepEqual(calls, [["clear"]]);
  const task = Object.create({ task_id: "task" }); s.options.onSaved(task); assert.equal(calls.at(-1)?.[1], task);
  s.options.onSaved(null); s.options.onSaved(7); assert.equal(calls.length, 2);
  const message = {}, error = Object.create({ get message() { assert.equal(this, error); return message; } });
  s.options.onError(error); assert.equal(calls.at(-1)?.[1], message);
  assert.throws(() => s.options.onError(null), /detail value cannot be read/);
  calls.length = 0; const failure = new Error("offer failed");
  s.requireNamespace = () => ({ taskResumeNoteCapture: { offer: async () => { throw failure; } } });
  await assert.rejects(s.offerTaskResumeNoteBeforeExit(), e => e === failure); assert.equal(calls.length, 0);
});
