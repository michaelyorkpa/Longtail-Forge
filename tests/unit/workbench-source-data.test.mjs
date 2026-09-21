import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");

function fixture() {
  const scope = vm.createContext({ state: { taskOptions: {}, timers: [], activeTaskFocus: { taskId: "task", task: { status: "open", project_id: "project" } } }, moduleEnabled: () => true });
  for (const name of ["mergeWorkbenchSourceData", "loadWorkbenchSourceData", "taskFocusTimerEligibility", "taskTimerSurfaceAvailable", "startTicking", "readElapsedSeconds"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}

it("merges opaque options and sparse timer values by identity without reordering or filtering", () => {
  const s = fixture(), first = {}, second = {}, options = Symbol("options");
  const target = { timers: [first], taskOptions: null };
  s.mergeWorkbenchSourceData(target, { timers: [second, null, 7], taskOptions: options });
  assert.deepEqual(target.timers, [first, second, null, 7]);
  assert.equal(target.taskOptions, options);
  for (const taskOptions of [null, undefined, false, 0, ""]) {
    s.mergeWorkbenchSourceData(target, { timers: "ignored", taskOptions });
    assert.equal(target.taskOptions, options);
    assert.equal(target.timers.length, 4);
  }
  s.mergeWorkbenchSourceData(target);
  assert.throws(() => s.mergeWorkbenchSourceData(target, null), { name: "TypeError" });
});

it("retains repeated getter reads, receiver and partial merge before an options failure", () => {
  /** @type {string[]} */ const calls = [];
  const s = fixture(), timer = {}, failure = new Error("options");
  const data = {
    get timers() { assert.equal(this, data); calls.push("timers"); return [timer]; },
    get taskOptions() { assert.equal(this, data); calls.push("options"); throw failure; },
  };
  const target = { timers: [], taskOptions: null };
  assert.throws(() => s.mergeWorkbenchSourceData(target, data), error => error === failure);
  assert.deepEqual(calls, ["timers", "timers", "options"]);
  assert.equal(target.timers[0], timer);
});

it("keeps source-loader completion ordering and last truthy options without rebuilding records", async () => {
  const s = fixture(), timer = {}, options = {};
  let release = () => {};
  s.workbenchCardDataLoaders = {
    first: () => new Promise(resolve => { release = () => resolve({ timers: [timer], taskOptions: options }); }),
    second: async () => ({ timers: [7], taskOptions: "earlier" }),
  };
  const pending = s.loadWorkbenchSourceData({ workbenchCards: [{ renderer: "first", listRoute: "/first" }, { renderer: "second", listRoute: "/second" }] });
  await Promise.resolve();
  release();
  const result = await pending;
  assert.deepEqual(Array.from(result.timers), [7, timer]);
  assert.equal(result.taskOptions, options);
});

it("preserves option getter receivers, short-circuit order and primitive boxing", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    Object.defineProperty(Number.prototype, "timeTrackingEnabled", { get() { "use strict"; calls.push(["time", this]); return 0; } });
    Object.defineProperty(Number.prototype, "taskTimersEnabled", { get() { "use strict"; calls.push(["task", this]); return false; } });
    state.taskOptions = 7;
  `, s);
  assert.equal(s.taskTimerSurfaceAvailable(), false);
  assert.equal(s.taskFocusTimerEligibility().reason, "Task timers are disabled.");
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls)), [["time", 7], ["task", 7], ["time", 7], ["task", 7]]);
  s.calls.length = 0;
  s.moduleEnabled = () => false;
  assert.equal(s.taskTimerSurfaceAvailable(), false);
  assert.equal(s.taskFocusTimerEligibility().reason, "Tasks are not available in this workspace.");
  assert.deepEqual(Array.from(s.calls), []);
  s.moduleEnabled = () => true;
  const failure = new Error("getter");
  s.state.taskOptions = { get timeTrackingEnabled() { throw failure; } };
  assert.throws(() => s.taskTimerSurfaceAvailable(), error => error === failure);
  assert.throws(() => s.taskFocusTimerEligibility(), error => error === failure);
});

it("ticks with the original timer identity, inherited ID getter and unchanged absent-total arithmetic", () => {
  /** @type {unknown[][]} */ const calls = [];
  const s = fixture(), element = { textContent: "" };
  s.tickIntervalId = 9;
  s.window = { clearInterval: (/** @type {unknown} */ id) => calls.push(["clear", id]), setInterval: (/** @type {unknown} */ callback, /** @type {unknown} */ interval) => { s.tick = callback; calls.push(["interval", interval]); return 10; } };
  s.document = { querySelector: (/** @type {unknown} */ selector) => { calls.push(["query", selector]); return element; } };
  s.formatDuration = (/** @type {unknown} */ value) => { calls.push(["format", value]); return String(value); };
  const timer = Object.create({ get active_timer_id() { assert.equal(this, timer); calls.push(["id"]); return "timer"; } });
  s.state.timers = [timer];
  s.startTicking(); s.tick();
  assert.deepEqual(calls, [["clear", 9], ["interval", 1000], ["id"], ["query", '[data-workbench-duration="timer"]'], ["format", 0]]);
  assert.equal(element.textContent, "0");
  assert.equal(s.state.timers[0], timer);
  assert.equal(s.tickIntervalId, 10);
  assert.equal(s.readElapsedSeconds({ accumulated_elapsed_seconds: "12.9", timer_status: "paused" }), 12);
});

it("preserves primitive ID receivers, nullish failures and tick stopping order", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    globalThis.tickIntervalId = null;
    globalThis.window = { setInterval(callback) { globalThis.tick = callback; return 1; } };
    globalThis.document = { querySelector(value) { calls.push(value); return null; } };
    Object.defineProperty(Number.prototype, "active_timer_id", { get() { "use strict"; calls.push(this); return "number"; } });
  `, s);
  for (const missing of [null, undefined]) {
    s.calls.length = 0; s.state.timers = [7, missing, {}];
    s.startTicking();
    assert.throws(() => s.tick(), { name: "TypeError", message: "The Workbench timer list carries an entry it cannot read." });
    assert.deepEqual(Array.from(s.calls), [7, '[data-workbench-duration="number"]']);
    s.tickIntervalId = null;
  }
});
