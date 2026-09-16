import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const reader = createProjectTextReader();
const source = reader.readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  /** @type {unknown[]} */ const writes = [];
  /** @type {unknown[]} */ const messages = [];
  const sandbox = vm.createContext({
    window: {}, context: { tasks: [] }, currentTaskId: "task", taskDialogApi: {}, fields: {},
    requireApi: () => ({ postJson: async (/** @type {unknown} */ url, /** @type {unknown} */ body) => { writes.push({ url, body }); return {}; } }),
    requireModalDialogs: () => ({ confirm: async () => true }),
    setStatus: (/** @type {unknown[]} */ ...args) => messages.push(args),
    requireErrors: () => ({ caughtMessage: () => "refused" }),
    notifyTaskEditorSaved: async () => {}, defaultTaskOptions: () => ({}),
    ensureDialog: () => {}, populateFormOptions: () => {},
    rememberTaskInContext: () => {}, syncTaskStatusField: () => {}, updateBlockedReasonState: () => {},
    writeTaskCompletionFields: () => {}, writeTaskMetadataRibbon: () => {}, writeTaskTimerFields: () => {},
    writeRecurrenceContinuity: () => {}, updateCompleteTaskActionState: () => {}, writeChecklistFields: () => {},
    ...extra,
  });
  // Lift the actual slot initializers, so tests do not manufacture a replacement state.
  for (const name of ["currentTask", "taskTimers"]) {
    const declaration = source.match(new RegExp(`  let ${name} = [^;]+;`));
    assert.ok(declaration);
    vm.runInContext(declaration[0], sandbox);
  }
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "configure", "applyTaskCompletionResult", "applyTaskTimerMutationResult", "applyChecklistResult", "currentTaskTimer", "upsertTaskTimer", "removeTaskTimer", "moveChecklistItem", "skipRecurrenceToCurrent", "refreshTaskTimers"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const run = (/** @type {string} */ expression) => vm.runInContext(expression, sandbox);
  const set = (/** @type {string} */ name, /** @type {unknown} */ value) => { sandbox.input = value; run(`${name} = input`); };
  return { sandbox, writes, messages, run, set };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task record slots and opaque detail consumers", () => {
  it("keeps inherited getters, callable/array projections and primitive boxing without claiming member types", () => {
    const { sandbox } = fixture();
    let reads = 0;
    const inherited = Object.create({ get duration_seconds() { reads++; return "12"; } });
    assert.equal(sandbox.taskProjectionFields(inherited), inherited);
    assert.equal(sandbox.taskProjectionFields(inherited).duration_seconds, "12");
    assert.equal(reads, 1);
    for (const value of [{}, [], () => {}, Object(0)]) assert.equal(sandbox.taskProjectionFields(value), value);
    for (const value of [false, 0, 1n, "seed", Symbol("seed")])
      assert.equal(sandbox.taskProjectionFields(value).valueOf(), value);
    for (const value of [null, undefined]) {
      assert.throws(() => sandbox.taskProjectionFields(value), { name: "TypeError" });
      assert.equal(sandbox.optionalTaskProjectionFields(value), undefined);
    }
  });
  it("preserves raw completion identity, continuity precedence and the missing-task no-op", () => {
    const f = fixture();
    const task = { task_id: "saved", recurrenceContinuity: { existing: true }, extra: { retained: true } };
    f.sandbox.applyTaskCompletionResult({ task });
    assert.equal(f.run("currentTask"), task);
    assert.equal(f.run("currentTaskId"), "saved");
    const continuity = { supplied: true };
    f.sandbox.applyTaskCompletionResult({ task, recurrenceContinuity: continuity });
    assert.equal(task.recurrenceContinuity, continuity);
    f.sandbox.applyTaskCompletionResult({});
    assert.equal(f.run("currentTask"), task);
    const sparse = { title: "caller seed" };
    f.sandbox.applyTaskCompletionResult({ task: sparse });
    assert.equal(f.run("currentTask"), sparse);
    assert.equal(f.run("currentTaskId"), "saved");
    assert.equal(f.run("currentTask.recurrenceContinuity"), null);
  });
  it("merges base timer responses without losing detail, and accepts a base-only first response", () => {
    const f = fixture();
    const details = { checklistItems: [{ task_checklist_item_id: "a" }], recurrenceRecovery: { available: true } };
    f.set("currentTask", { task_id: "a", title: "before", ...details });
    const base = { task_id: "a", status: "in_progress" };
    f.sandbox.applyTaskTimerMutationResult({ task: base });
    assert.equal(f.run("currentTask.checklistItems"), details.checklistItems);
    assert.equal(f.run("currentTask.recurrenceRecovery"), details.recurrenceRecovery);
    assert.equal(f.run("currentTask.status"), "in_progress");
    assert.notEqual(f.run("currentTask"), base);
    f.set("currentTask", null);
    f.sandbox.applyTaskTimerMutationResult({ task: base });
    assert.deepEqual(plain(f.run("currentTask")), base);
    const fallback = { title: "untouched" };
    assert.equal(f.sandbox.applyTaskTimerMutationResult({}, fallback), fallback);
  });
  it("retains checklist replacement and fallback reconstruction exactly", () => {
    const f = fixture();
    const task = { task_id: "a", checklistItems: [{ task_checklist_item_id: "before" }], checklistProgress: { total_count: 1 }, tags: ["retain"] };
    f.sandbox.applyChecklistResult({ task });
    assert.equal(f.run("currentTask"), task);
    const items = [{ task_checklist_item_id: "after" }];
    f.sandbox.applyChecklistResult({ items });
    assert.equal(f.run("currentTask.checklistItems"), items);
    assert.equal(f.run("currentTask.checklistProgress"), task.checklistProgress);
    assert.equal(f.run("currentTask.tags"), task.tags);
    assert.notEqual(f.run("currentTask"), task);
  });
  it("keeps configured timer identity, reader refresh, pause/update and removal", async () => {
    const f = fixture();
    const timers = [{ task_id: "a", timer_status: "running", last_active_start_time: "start", metadata: "keep" }];
    f.sandbox.configure({ taskTimers: timers });
    assert.equal(f.run("taskTimers"), timers);
    f.sandbox.configure({ taskTimers: null });
    assert.equal(f.run("taskTimers"), timers);
    const next = { task_id: "b", timer_status: "running" };
    f.sandbox.upsertTaskTimer(next);
    assert.equal(f.sandbox.currentTaskTimer("b"), next);
    assert.deepEqual(plain(f.sandbox.currentTaskTimer("a")), { ...timers[0], timer_status: "paused", last_active_start_time: null });
    const replaced = { task_id: "b", timer_status: "paused" };
    f.sandbox.upsertTaskTimer(replaced);
    assert.equal(f.sandbox.currentTaskTimer("b"), replaced);
    f.sandbox.removeTaskTimer("a");
    assert.equal(f.run("context.taskTimers"), f.run("taskTimers"));
    assert.equal(f.run("taskTimers.length"), 1);
    vm.runInContext(reader.readText("public/js/shared/task-records.js"), f.sandbox);
    f.sandbox.loadTaskTimers = async () => ({ timers: [] });
    f.sandbox.requireTaskRecords = () => f.sandbox.window.LongtailForge.taskRecords;
    await f.sandbox.refreshTaskTimers();
    assert.equal(f.run("taskTimers.length"), 0);
    assert.equal(f.run("context.taskTimers"), f.run("taskTimers"));
  });
  it("reorders complete identifiers without filtering or modifying original rows", async () => {
    const f = fixture();
    const first = { task_checklist_item_id: "a", label: "First" };
    const second = Object.create({ task_checklist_item_id: "b" });
    const items = [first, second, { task_checklist_item_id: "c" }];
    f.set("currentTask", { checklistItems: items });
    await f.sandbox.moveChecklistItem("b", "up");
    assert.deepEqual(plain(f.writes), [{ url: "/api/tasks/task/checklist/reorder", body: { item_ids: ["b", "a", "c"] } }]);
    assert.equal(items[0], first);
    assert.equal(items[1], second);
    await f.sandbox.moveChecklistItem("missing", "up");
    assert.equal(f.writes.length, 1);
  });
  it("preserves malformed-row throw timing before selection and caught refusal during payload construction", async () => {
    const f = fixture();
    f.set("currentTask", { checklistItems: [null, { task_checklist_item_id: "b" }] });
    await assert.rejects(f.sandbox.moveChecklistItem("b", "up"), { name: "TypeError" });
    assert.equal(f.writes.length, 0);
    assert.equal(f.messages.length, 0);
    f.set("currentTask", { checklistItems: [{ task_checklist_item_id: "a" }, null] });
    await f.sandbox.moveChecklistItem("a", "down");
    assert.equal(f.writes.length, 0);
    assert.equal(f.messages.length, 2);
  });
  it("keeps recovery gating and all confirmation values without validating a new projection contract", async () => {
    /** @type {unknown[]} */ const confirmations = [];
    const f = fixture({ requireModalDialogs: () => ({ confirm: async (/** @type {unknown} */ value) => { confirmations.push(value); return false; } }) });
    for (const value of [null, undefined, false, {}, { available: true, blockedByActiveTimer: true }]) {
      f.set("currentTask", { recurrenceRecovery: value });
      await f.sandbox.skipRecurrenceToCurrent({ preventDefault() {} });
    }
    assert.equal(confirmations.length, 0);
    const recovery = Object.create({ available: true, blockedByActiveTimer: false, completedTaskCount: 1, skippedOccurrenceCount: 2, targetDate: "2026-09-18", seriesEnded: false });
    f.set("currentTask", { recurrenceRecovery: recovery });
    await f.sandbox.skipRecurrenceToCurrent({ preventDefault() {} });
    assert.deepEqual(plain(confirmations[0]), { title: "Skip to current task?", message: "1 earlier active task will be completed and 2 unmaterialized occurrences will be skipped. The 2026-09-18 occurrence will be kept as the current task.", confirmLabel: "Skip to current", cancelLabel: "Cancel" });
    assert.equal(f.writes.length, 0);
  });
  it("preserves timer endpoint coercion for sparse caller seeds and refuses symbols before writes", async () => {
    for (const id of ["a/b", undefined, null, 7, Symbol("unsupported")]) {
      const f = fixture({ readTaskTimerElapsedSeconds: () => 3, offerTaskResumeNote: () => {}, requireTaskRecords: () => ({ readTask: () => null }) });
      const write = async (/** @type {unknown} */ url, /** @type {unknown} */ body) => { f.writes.push({ url, body }); return {}; };
      f.sandbox.requireApi = () => ({ putJson: write, postJson: write, deleteJson: write });
      f.set("currentTask", { task_id: id, title: "seed" });
      for (const name of ["saveTaskTimer", "finalizeTaskTimer", "resetTaskTimer"])
        vm.runInContext(extractFunctionBlock(source, name), f.sandbox);
      await f.sandbox.saveTaskTimer("running");
      f.set("taskTimers", [{ task_id: id }]);
      await f.sandbox.finalizeTaskTimer({});
      await f.sandbox.resetTaskTimer();
      if (typeof id === "symbol") assert.equal(f.writes.length, 0);
      else {
        const path = `/api/tasks/${encodeURIComponent(`${id}`)}/timer`;
        assert.deepEqual(plain(f.writes).map((/** @type {{url:string}} */ item) => item.url), [path, `${path}/finalize`, path]);
      }
    }
  });
  it("does not expose prototype members when an optional projection is absent", () => {
    const f = fixture();
    f.run("Object.prototype.duration_seconds = 42; Object.prototype.available = true");
    assert.equal(f.sandbox.optionalTaskProjectionFields(null), undefined);
    assert.equal(f.sandbox.optionalTaskProjectionFields(undefined), undefined);
  });
  it("keeps metadata duration coercion and omits missing or nonfinite values", () => {
    const f = fixture({ fields: { metadataRibbon: { replaceChildren() {} }, status: { value: "complete" }, estimate: { value: "" } },
      hasCompletedTaskMetrics: () => true, selectedText: () => "", formatToken: () => "", usesClientScope: () => false,
      createMetadataBadge: (/** @type {unknown} */ value) => value, formatDaysDuration: (/** @type {number} */ value) => `duration:${value}`,
    });
    /** @type {{label:string,value:unknown}[]} */ let badges = [];
    f.sandbox.requireTaskDialogView = () => ({ createDetailBadgeRow: (/** @type {{badges:typeof badges}} */ options) => { badges = options.badges; return { className: "ribbon", children: [] }; } });
    vm.runInContext(extractFunctionBlock(source, "writeTaskMetadataRibbon"), f.sandbox);
    for (const value of [0, "12", false, null, undefined, "invalid", Infinity]) {
      f.sandbox.writeTaskMetadataRibbon({ completionMetrics: { duration_seconds: value } });
      const result = badges.find((badge) => badge.label === "TTC");
      if (value === 0 || value === "12" || value === false) assert.equal(result?.value, `duration:${Number(value)}`);
      else assert.equal(result, undefined);
    }
    f.sandbox.writeTaskMetadataRibbon({});
    assert.equal(badges.find((badge) => badge.label === "TTC"), undefined);
  });
});
