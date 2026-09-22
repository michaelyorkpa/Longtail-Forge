import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");

function fixture() {
  const scope = vm.createContext({ state: { taskOptions: {}, timers: [], activeTaskFocus: { taskId: "task", task: { status: "open", project_id: "project" } } }, moduleEnabled: () => true });
  for (const name of ["workbenchSourceField", "workbenchSourceFields", "workbenchCardField", "workbenchCardPropertyKey", "loadTimerCardData", "loadTaskOptionsData", "mergeWorkbenchSourceData", "loadWorkbenchSourceData", "taskFocusTimerEligibility", "taskTimerSurfaceAvailable", "startTicking", "readElapsedSeconds"])
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

it("keeps loader body members opaque and observes changing getters without validation", async () => {
  const s = fixture(), timers = [null, 7, { sparse: true }], options = Symbol("options");
  /** @type {unknown[]} */ const calls = [];
  let reads = 0;
  const body = Object.create({ get timers() { assert.equal(this, body); calls.push("timers"); return ++reads === 1 ? [] : timers; } });
  s.requireApi = () => ({ getJson: async (/** @type {unknown} */ route, /** @type {unknown} */ settings) => { calls.push(route, settings); return body; } });
  const route = { toString() { throw new Error("must remain opaque"); } };
  assert.equal((await s.loadTimerCardData({ listRoute: route })).timers, timers);
  assert.equal(calls[0], route);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), { cache: "no-store" });
  assert.deepEqual(calls.slice(2), ["timers", "timers"]);
  s.requireApi = () => ({ getJson: async () => ({ options }) });
  assert.equal((await s.loadTaskOptionsData({ listRoute: "/options" })).taskOptions, options);
  for (const value of [null, undefined, 0, "", false]) {
    s.requireApi = () => ({ getJson: async () => value });
    assert.deepEqual(Array.from((await s.loadTimerCardData({})).timers), []);
    assert.deepEqual(JSON.parse(JSON.stringify((await s.loadTaskOptionsData({})).taskOptions)), { projects: [] });
  }
});

it("preserves native iteration of the second timer read, including failure after the array probe", () => {
  const s = fixture();
  for (const next of [new Set([7, null]), "ab", null, 7]) {
    let reads = 0;
    const data = { get timers() { return ++reads === 1 ? [] : next; } };
    const target = { timers: [], taskOptions: null };
    if (next === null || next === 7) assert.throws(() => s.mergeWorkbenchSourceData(target, data), { name: "TypeError" });
    else { s.mergeWorkbenchSourceData(target, data); assert.deepEqual(target.timers, typeof next === "string" ? ["a", "b"] : [7, null]); }
    assert.equal(reads, 2);
  }
});

it("dispatches inherited loaders with native key conversion, original card identity and no receiver", async () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    const renderer = { [Symbol.toPrimitive](hint) { calls.push(hint); return "inherited"; } };
    globalThis.card = { renderer, get listRoute() { calls.push("route"); return 7; } };
    globalThis.workbenchCardDataLoaders = Object.create({ inherited: function(value) { "use strict"; calls.push(this, value); return { timers: [value] }; } });
  `, s);
  const result = await s.loadWorkbenchSourceData({ workbenchCards: [s.card] });
  assert.deepEqual(Array.from(s.calls), ["string", "route", undefined, s.card]);
  assert.equal(result.timers[0], s.card);
  s.workbenchCardDataLoaders = { absent: 0, bad: 7 };
  const skipped = { renderer: "absent", get listRoute() { throw new Error("short-circuited"); } };
  await s.loadWorkbenchSourceData({ workbenchCards: [skipped, { renderer: "bad", listRoute: "" }] });
  await assert.rejects(s.loadWorkbenchSourceData({ workbenchCards: [{ renderer: "bad", listRoute: "/route" }] }), { name: "TypeError", message: "The Workbench card data loader must be callable." });
});

it("retains primitive body getter receivers and rejects required null merges at first consumption", async () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    Object.defineProperty(Number.prototype, "timers", { get() { "use strict"; calls.push(this); return [7]; } });
    Object.defineProperty(Number.prototype, "options", { get() { "use strict"; calls.push(this); return 9; } });
    globalThis.requireApi = () => ({ getJson: async () => 7 });
  `, s);
  assert.deepEqual(Array.from((await s.loadTimerCardData({})).timers), [7]);
  assert.equal((await s.loadTaskOptionsData({})).taskOptions, 9);
  assert.deepEqual(Array.from(s.calls), [7, 7, 7]);
  const fields = s.workbenchSourceFields(null, false);
  assert.throws(() => fields.timers, { name: "TypeError", message: "The Workbench source data cannot be read." });
});

it("records the unresolved route boundary against the real registry reader and API forwarding", async () => {
  const s = fixture();
  for (const name of ["isBootstrapRecord", "isWorkbenchContribution", "readWorkbenchRegistry"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  /** @type {unknown[]} */ const requested = [];
  s.window = { LongtailForge: { errors: { createError: () => new Error("unexpected HTTP error") } } };
  s.fetch = async (/** @type {unknown} */ url) => { requested.push(url); return { ok: true, status: 200, text: async () => '{"options":{"projects":[]}}' }; };
  vm.runInContext(createProjectTextReader().readText("public/js/shared/api-client.js"), s);
  s.requireApi = () => s.window.LongtailForge.api;
  vm.runInContext(source.match(/const workbenchCardDataLoaders = \{[^}]+\};/)?.[0] || "throw new Error('loader literal missing')", s);
  const registry = s.readWorkbenchRegistry({ workbenchCards: [{ moduleId: "tasks", renderer: "task-workbench-items", listRoute: 7 }] });
  const result = await s.loadWorkbenchSourceData(registry);
  assert.deepEqual(requested, [7]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.taskOptions)), { projects: [] });
});
