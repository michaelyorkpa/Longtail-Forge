import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
  for (const name of ["workbenchSourceField", "taskTimerMatches", "isManualTimerCandidate", "sortedTimers", "activeOrPausedTimers", "isTaskTimer", "timerKey"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}
it("matches task timers with the original read order and strict target identity", () => {
  const s = fixture();
  /** @type {string[]} */ const reads = [];
  const timer = Object.create({
    get task_id() { assert.equal(this, timer); reads.push("task"); return "one"; },
    get source_id() { return assert.fail("task id takes precedence"); },
    get source_type() { reads.push("type"); return "task"; },
    get source_module_id() { return assert.fail("task type short circuits"); },
  });
  assert.equal(s.taskTimerMatches(timer, "one"), true);
  assert.deepEqual(reads, ["task", "type"]);
  reads.length = 0; assert.equal(s.taskTimerMatches(timer, { toString: () => "one" }), false);
  assert.deepEqual(reads, ["task"]);
  reads.length = 0; assert.equal(s.taskTimerMatches(timer, ""), false); assert.deepEqual(reads, ["task"]);
  for (const value of [null, undefined, 7, "raw"]) assert.equal(s.taskTimerMatches(value, "one"), false);
  assert.equal(s.taskTimerMatches({ source_id: 7, source_module_id: "tasks" }, "7"), true);
  assert.equal(s.taskTimerMatches({ source_id: "one", active_task_timer_id: {} }, "one"), true);
});
it("preserves inherited task detection and thrown getters without demanding a full record", () => {
  const s = fixture(), failure = new Error("source getter");
  assert.equal(s.isTaskTimer(Object.create({ source_module_id: "tasks" })), true);
  assert.equal(s.isTaskTimer({ active_task_timer_id: {} }), true);
  for (const value of [null, undefined, 0, "raw", {}]) assert.equal(s.isTaskTimer(value), false);
  assert.throws(() => s.isTaskTimer({ get source_type() { throw failure; } }), error => error === failure);
});
it("keeps active filtering identity, order, holes and non-array handling", () => {
  const s = fixture(), running = { timer_status: "running" }, paused = Object.create({ timer_status: "paused" });
  const values = [paused, null, running, { timer_status: "stopped" }, undefined];
  delete values[4];
  const result = s.activeOrPausedTimers(values);
  assert.equal(result.length, 2); assert.equal(result[0], paused); assert.equal(result[1], running);
  assert.equal(values.length, 5);
  for (const value of [undefined, null, new Set([running]), "running", {}]) assert.equal(s.activeOrPausedTimers(value).length, 0);
});
it("sorts a copy with running first, recent first and stable equal keys, retaining opaque entries", () => {
  const s = fixture();
  const old = { timer_status: "paused", updated_at: "2020" }, recent = { timer_status: "paused", updated_at: "2025" };
  const running = { timer_status: "running", updated_at: "2019" }, equal = { ...recent };
  const input = [old, recent, running, equal];
  const sorted = s.sortedTimers(new Set(input));
  assert.deepEqual(Array.from(sorted), [running, recent, equal, old]);
  assert.deepEqual(input, [old, recent, running, equal]);
  assert.equal(s.sortedTimers([null])[0], null);
  assert.throws(() => s.sortedTimers([null, {}]), { name: "TypeError", message: "The Workbench source data cannot be read." });
  const failure = new Error("sort getter");
  const entry = Object.create({ get timer_status() { assert.equal(this, entry); throw failure; } });
  assert.throws(() => s.sortedTimers([{}, entry]), error => error === failure);
  assert.throws(() => s.sortedTimers(null), { name: "TypeError" });
});
it("keeps timer-key coercion and repeated reads, and fails only at the required read", () => {
  const s = fixture();
  /** @type {string[]} */ const reads = [];
  const id = { [Symbol.toPrimitive](/** @type {string} */ hint) { reads.push(hint); return "id"; } };
  const timer = Object.create({ get source_type() { assert.equal(this, timer); reads.push("type"); return "task"; }, get source_id() { reads.push("id"); return id; } });
  assert.equal(s.timerKey(timer), "task:id"); assert.deepEqual(reads, ["type", "id", "id", "string"]);
  assert.equal(s.timerKey({ source_type: "manual", timer_slot: 7 }), "manual-slot:7");
  assert.equal(s.timerKey({ active_timer_id: "active", timer_slot: "slot" }), "timer:active");
  assert.equal(s.timerKey(7), "timer:");
  assert.throws(() => s.timerKey(null), { name: "TypeError", message: "The Workbench source data cannot be read." });
  assert.throws(() => s.timerKey({ source_type: "manual", timer_slot: Symbol("slot") }), { name: "TypeError" });
});
it("uses the established WorkCandidate vocabulary for manual timer selection", () => {
  const s = fixture(), candidate = { moduleId: "time-tracking", recordType: "active_work_timer" };
  assert.equal(s.isManualTimerCandidate(candidate), true);
  assert.equal(s.isManualTimerCandidate({ ...candidate, metadata: { source_type: "task" } }), false);
  assert.equal(s.isManualTimerCandidate({ ...candidate, metadata: { source_type: "manual" } }), true);
  assert.equal(s.isManualTimerCandidate(), false);
});
