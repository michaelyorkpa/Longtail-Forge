import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
const names = ["taskFocusTimerResultTask", "saveTaskTimer", "pauseExistingTimer", "startExistingTimer", "refreshWorkbenchAfterTaskFocusTimerMutation", "finalizeSourceTaskTimer"];
function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({ calls, state: { activeTaskFocus: { taskId: "one" } }, pendingActivatedTimerKey: "",
    requireApi: () => ({ putJson: async (/** @type {unknown} */ path, /** @type {unknown} */ payload) => { calls.push(["put", path, payload]); return {}; }, postJson: async (/** @type {unknown} */ path, /** @type {unknown} */ payload) => { calls.push(["post", path, payload]); return {}; } }),
    setStatus: (/** @type {unknown} */ message, /** @type {unknown} */ options) => calls.push(["status", message, options]),
    requireErrors: () => ({ caughtMessage: (/** @type {Error} */ error) => error.message }),
    loadWorkbench: async () => { calls.push(["load"]); }, applyActiveTaskFocusTask: (/** @type {unknown} */ task) => calls.push(["apply", task]),
    renderTaskFocusSurface: () => calls.push(["surface"]), renderWorkbenchInspector: () => calls.push(["inspector"]), renderWorkbenchViewState: () => calls.push(["view"]),
    readElapsedSeconds: () => 7, timerKey: () => "task:one", offerTaskResumeNote: (/** @type {unknown} */ task) => calls.push(["note", task]),
    updateTimerStatus: async (/** @type {unknown} */ timer, /** @type {unknown} */ status) => { calls.push(["update", timer, status]); },
    requireTaskRecords: () => ({ readTask: () => null }),
  });
  vm.runInContext(names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  return { scope, calls };
}
it("preserves raw task identity and four getter reads across load and rendering", async () => {
  const { scope: s, calls } = fixture(); const task = { title: "caller seed" }; let reads = 0;
  const result = { get task() { reads++; return task; } };
  await s.refreshWorkbenchAfterTaskFocusTimerMutation(result, "one");
  assert.equal(reads, 4);
  assert.deepEqual(calls, [["apply", task], ["load"], ["apply", task], ["surface"], ["inspector"], ["view"]]);
});
it("keeps changing getter answers and stale selection handling", async () => {
  const { scope: s, calls } = fixture(); const answers = [true, 7, true, "raw"];
  await s.refreshWorkbenchAfterTaskFocusTimerMutation({ get task() { return answers.shift(); } }, "one");
  assert.equal(calls[0][1], 7); assert.equal(calls[2][1], "raw");
  calls.length = 0;
  s.loadWorkbench = async () => { s.state.activeTaskFocus = null; calls.push(["load"]); };
  const task = {};
  await s.refreshWorkbenchAfterTaskFocusTimerMutation({ task }, "one");
  assert.deepEqual(calls, [["apply", task], ["load"]]);
});
it("keeps optional envelope boxing, inherited getters and rejection propagation", async () => {
  const { scope: s } = fixture(); const result = Object.create({ task: 3 });
  assert.equal(s.taskFocusTimerResultTask(result), 3);
  assert.equal(s.taskFocusTimerResultTask(null), undefined);
  assert.equal(s.taskFocusTimerResultTask(7), undefined);
  const failure = new Error("getter failure");
  await assert.rejects(s.refreshWorkbenchAfterTaskFocusTimerMutation({ get task() { throw failure; } }, "one"), e => e === failure);
});
it("keeps nullable id conversion, elapsed payload and failed-write null result", async () => {
  const { scope: s, calls } = fixture();
  await s.saveTaskTimer(null, "paused", 13);
  assert.equal(calls[1][1], "/api/tasks/null/timer");
  assert.equal(Reflect.get(Object(calls[1][2]), "accumulated_elapsed_seconds"), 13);
  assert.equal(Reflect.get(Object(calls[1][2]), "active_task_timer_id"), "");
  const result = await s.saveTaskTimer(Symbol("id"), "running", 0);
  assert.equal(result, null); assert.equal(calls.filter(call => call[0] === "put").length, 1);
  await s.finalizeSourceTaskTimer({ source_id: undefined });
  assert.equal(calls.find(call => call[0] === "post")?.[1], "/api/tasks/undefined/timer/finalize");
});
it("preserves pause routing, raw resume-note task and start activation order", async () => {
  const { scope: s, calls } = fixture(); const task = { title: "seed" }, timer = { source_type: "task", source_enabled: true, source_id: "one", active_timer_id: "timer" };
  s.requireApi = () => ({ putJson: async () => ({ task }) });
  await s.pauseExistingTimer(timer);
  assert.equal(calls.at(-1)?.[1], task);
  const manual = { source_type: "manual" };
  await s.pauseExistingTimer(manual);
  assert.deepEqual(calls.at(-1), ["update", manual, "paused"]);
  await s.startExistingTimer(manual);
  assert.equal(s.pendingActivatedTimerKey, "task:one");
  assert.deepEqual(calls.at(-1), ["update", manual, "running"]);
});
