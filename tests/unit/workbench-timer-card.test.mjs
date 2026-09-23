import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
  for (const name of ["workbenchSourceField", "readElapsedSeconds", "formatDuration", "sourceLabel", "cssEscape"])
    vm.runInContext(extractFunctionBlock(source, name).replace("Date.now()", "100000"), scope);
  return scope;
}
it("retains the elapsed consumer's native Date input domains and invalid-date arithmetic", () => {
  const s = fixture();
  for (const input of [1, new Date(1000), { valueOf: () => 1000 }, "1970-01-01T00:00:01Z"])
    assert.equal(s.readElapsedSeconds({ accumulated_elapsed_seconds: "12.9", timer_status: "running", last_active_start_time: input }), 111);
  for (const input of ["bad date", new Date(NaN)])
    assert.equal(Number.isNaN(s.readElapsedSeconds({ accumulated_elapsed_seconds: 12, timer_status: "running", last_active_start_time: input })), true);
  assert.equal(s.readElapsedSeconds({ accumulated_elapsed_seconds: 12, timer_status: "running", last_active_start_time: 200000 }), 12);
  for (const input of [0, null, undefined, ""])
    assert.equal(s.readElapsedSeconds({ accumulated_elapsed_seconds: 12, timer_status: "running", last_active_start_time: input }), 12);
  for (const timer of [null, undefined, false, 0, ""]) assert.equal(s.readElapsedSeconds(timer), 0);
});
it("preserves elapsed getter order, repeated date reads and conversion exceptions", () => {
  const s = fixture();
  /** @type {string[]} */ const reads = [];
  const input = { [Symbol.toPrimitive](/** @type {string} */ hint) { reads.push(hint); return 1000; } };
  const timer = Object.create({
    get accumulated_elapsed_seconds() { assert.equal(this, timer); reads.push("elapsed"); return "3x"; },
    get timer_status() { reads.push("status"); return "running"; },
    get last_active_start_time() { reads.push("date"); return input; },
  });
  assert.equal(s.readElapsedSeconds(timer), 102);
  assert.deepEqual(reads, ["elapsed", "status", "date", "date", "default"]);
  const failure = new Error("date conversion");
  assert.throws(() => s.readElapsedSeconds({ timer_status: "running", last_active_start_time: { [Symbol.toPrimitive]() { throw failure; } } }), error => error === failure);
  assert.throws(() => s.readElapsedSeconds({ timer_status: "running", last_active_start_time: Symbol("timestamp") }), { name: "TypeError" });
  assert.equal(s.readElapsedSeconds({ accumulated_elapsed_seconds: 7, timer_status: "paused", get last_active_start_time() { return assert.fail("paused short circuit"); } }), 7);
});
it("keeps duration parsing and formatting for opaque accepted values", () => {
  const s = fixture();
  for (const value of [3661, 3661n, "3661x", { toString: () => "3661.9" }]) assert.equal(s.formatDuration(value), "01:01:01");
  for (const value of [-5, null, undefined, NaN, Infinity, "invalid"]) assert.equal(s.formatDuration(value), "00:00:00");
  assert.throws(() => s.formatDuration(Symbol("seconds")), { name: "TypeError" });
  const failure = new Error("duration conversion");
  assert.throws(() => s.formatDuration({ toString() { throw failure; } }), error => error === failure);
});
it("keeps source labels and native/fallback CSS escaping", () => {
  const s = fixture();
  assert.equal(s.sourceLabel({ source_type: "task" }), "Task");
  assert.equal(s.sourceLabel({ source_type: "future-provider" }), "Manual");
  assert.equal(s.sourceLabel({}), "Manual");
  s.window = {};
  assert.equal(s.cssEscape('task:"quoted"'), 'task:\\"quoted\\"');
  s.window.CSS = { escape(/** @type {string} */ value) { assert.equal(this, s.window.CSS); return `native:${value}`; } };
  assert.equal(s.cssEscape("task:id"), "native:task:id");
});

// Deferred in .42.31: discharge requires producer evidence for every reachable
// timestamp path, including missing/optional values, before typing native Date.
// This case must be reassessed if the array-only handoff stops carrying opaque entries.
it("pins the elapsed-time deferral to the real array-only loader and merge handoff", async () => {
  const s = fixture();
  for (const name of ["workbenchSourceFields", "loadTimerCardData", "mergeWorkbenchSourceData"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  const timers = [
    { timer_status: "running", accumulated_elapsed_seconds: 2, last_active_start_time: 1000 },
    { timer_status: "running", accumulated_elapsed_seconds: 2 },
    { timer_status: "running", accumulated_elapsed_seconds: 2, last_active_start_time: null },
    { timer_status: "paused", accumulated_elapsed_seconds: "2x", last_active_start_time: "unread" },
  ];
  s.requireApi = () => ({ getJson: async () => ({ timers }) });
  const loaded = await s.loadTimerCardData({ listRoute: "/timers" });
  assert.equal(loaded.timers, timers);
  const target = { timers: [], taskOptions: null };
  s.mergeWorkbenchSourceData(target, loaded);
  for (const [index, timer] of timers.entries()) assert.equal(target.timers[index], timer);
  assert.deepEqual(Array.from(target.timers, timer => s.readElapsedSeconds(timer)), [101, 2, 2, 2]);
  s.requireApi = () => ({ getJson: async () => ({}) });
  assert.deepEqual(Array.from((await s.loadTimerCardData({ listRoute: "/timers" })).timers), []);
});
