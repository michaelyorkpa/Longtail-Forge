import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  const s = vm.createContext({ state: { tasks: [], taskTimers: [] }, recurrenceContinuityTrackers: new Map(), getWorkspaceScopeLabel: () => "Workspace", ...overrides });
  for (const name of ["taskRowField", "taskRowKey", "callTaskRowMethod", "taskActionField", "optionalTaskLifecycleId", "writeTaskSurfaceData", "decorateTasksDeclarativeSurface", "taskTimerForTask", "upsertTaskTimerState", "readTaskTimerElapsedSeconds", "formatToken", "truncateTaskName", "displayUser", "formatDue", "formatScope", "taskContextBadge", "trackTaskRecurrenceContinuity", "upsertTask", "followTaskNotifications"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return s;
}

describe("Tasks remaining owned boundary", () => {
  it("retains timer identity, search short-circuit and pause ordering", () => {
    const s = fixture();
    const first = { task_id: "a", timer_status: "running", last_active_start_time: "start" }, second = { task_id: "b", timer_status: "paused" };
    s.state.taskTimers = [first, second];
    /** @type {unknown[]} */ const calls = [];
    const task = { get task_id() { calls.push(this); return "b"; } };
    assert.equal(s.taskTimerForTask(task), second); assert.deepEqual(calls, [task, task]);
    const replacement = { task_id: "b", timer_status: "running" };
    s.upsertTaskTimerState(replacement);
    assert.equal(s.state.taskTimers[1], replacement);
    assert.notEqual(s.state.taskTimers[0], first);
    assert.equal(s.state.taskTimers[0].timer_status, "paused");
    assert.equal(s.state.taskTimers[0].last_active_start_time, null);
    assert.equal(first.timer_status, "running");
    s.state.taskTimers = [];
    assert.equal(s.taskTimerForTask({ get task_id() { return assert.fail("empty list must not read id"); } }), undefined);
    s.upsertTaskTimerState(replacement); assert.equal(s.state.taskTimers[0], replacement);
  });

  it("retains parseInt conversion, elapsed arithmetic, invalid dates and getter ordering", () => {
    class FixedDate extends Date { static now() { return 20000; } }
    const s = fixture({ Date: FixedDate });
    for (const value of [null, undefined, false, 0, "", NaN]) assert.equal(s.readTaskTimerElapsedSeconds(value), 0);
    for (const [value, answer] of [["12.9seconds", 12], [2.9, 2], ["bad", 0], [-4, -4]])
      assert.equal(s.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: value, timer_status: "paused" }), answer);
    for (const start of [10000, new Date(10000), "1970-01-01T00:00:10Z", { valueOf: () => 10000 }])
      assert.equal(s.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 3, timer_status: "running", last_active_start_time: start }), 13);
    assert.equal(s.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 3, timer_status: "running", last_active_start_time: "invalid" }), 3);
    assert.equal(s.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 3, timer_status: "running", last_active_start_time: 30000 }), 3);
    assert.throws(() => s.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: Symbol("seconds") }), { name: "TypeError" });
    /** @type {string[]} */ const order = [];
    const failure = new Error("conversion");
    const timer = {
      get accumulated_elapsed_seconds() { order.push("seconds"); return { [Symbol.toPrimitive](/** @type {string} */ hint) { order.push(hint); return "2.7"; } }; },
      get timer_status() { order.push("status"); return "running"; },
      get last_active_start_time() { order.push("start"); return { valueOf() { throw failure; } }; },
    };
    assert.throws(() => s.readTaskTimerElapsedSeconds(timer), (error) => error === failure);
    assert.deepEqual(order, ["seconds", "string", "status", "start", "start"]);
  });

  it("preserves formatter coercions, fallbacks, opaque answers and shared formatter arguments", () => {
    /** @type {unknown[][]} */ const zoneCalls = [];
    const s = fixture({ requireNamespace: () => ({ timezones: { formatDateTime: (/** @type {unknown[]} */ ...args) => { zoneCalls.push(args); return "zoned"; } } }) });
    assert.equal(s.formatToken(null), ""); assert.equal(s.formatToken("in_progress"), "In Progress");
    assert.equal(s.formatToken(Symbol("x")), "Symbol(x)");
    assert.equal(s.truncateTaskName(" abc def ", 5), "abc…");
    assert.equal(s.displayUser(Object.create({ display_name: " Person ", email: "mail" })), "Person (mail)");
    assert.equal(s.displayUser({ displayName: "same", username: "same" }), "same");
    assert.throws(() => s.displayUser(null), { name: "TypeError" });
    const raw = {};
    assert.equal(s.formatScope({ project_name: raw }), raw);
    assert.equal(s.formatScope({ project_name: "P", client_name: "C" }), "C / P");
    assert.equal(s.formatScope({}), "Workspace");
    assert.equal(s.formatDue({}), "None"); assert.equal(s.formatDue({ due_date: raw }), raw);
    assert.equal(s.formatDue({ due_date: "date", due_time: "time", due_at_utc: raw, due_timezone: "zone" }), "zoned");
    assert.equal(zoneCalls[0][0], raw); assert.equal(zoneCalls[0][1], "zone");
    s.requireNamespace = () => ({});
    assert.equal(s.formatDue({ due_date: "date", due_time: "time" }), "date time");
    assert.deepEqual(JSON.parse(JSON.stringify(s.taskContextBadge({ label: "L", value: "V", className: "c" }))), { className: ["task-context-chip", "c"], label: "L", title: "L: V", value: "V" });
  });

  it("keeps continuity tracker identity, supersession, update timing and rejection cleanup", async () => {
    /** @type {Array<(value: unknown) => Promise<void>>} */ const updates = [];
    /** @type {unknown[][]} */ const calls = [];
    /** @type {Array<{resolve: (value: unknown) => void, reject: (error: unknown) => void}>} */ const resolvers = [];
    const dialog = { pollRecurrenceContinuity(/** @type {unknown} */ id, /** @type {{initialContinuity: unknown, onUpdate: (value: unknown) => Promise<void>}} */ options) { assert.equal(this, dialog); calls.push(["poll", id, options.initialContinuity]); updates.push(options.onUpdate); return new Promise((resolve, reject) => resolvers.push({ resolve, reject })); } };
    const s = fixture({ requireNamespace: () => ({ tasksDialog: dialog }), reloadTaskList: async () => { calls.push(["reload"]); }, renderTaskRecurrenceContinuity: (/** @type {unknown} */ value) => calls.push(["render", value]) });
    const id = { toString: () => "id" }, initial = Object.create({ status: "pending" });
    s.trackTaskRecurrenceContinuity(id, initial);
    const first = s.recurrenceContinuityTrackers.get(id);
    s.trackTaskRecurrenceContinuity(id, initial);
    assert.notEqual(s.recurrenceContinuityTrackers.get(id), first);
    assert.equal(calls[0][1], id); assert.equal(calls[0][2], initial);
    const available = Object.create({ status: "available" });
    await updates[0](available); assert.equal(calls.length, 2);
    await updates[1](available); assert.deepEqual(calls.slice(2), [["reload"], ["render", available]]);
    resolvers[0].resolve(undefined); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(s.recurrenceContinuityTrackers.size, 1);
    resolvers[1].reject(new Error("poll failed")); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(s.recurrenceContinuityTrackers.size, 0);
    assert.throws(() => s.trackTaskRecurrenceContinuity(Symbol("id"), initial), { name: "TypeError" });
    s.trackTaskRecurrenceContinuity(null, { get status() { return assert.fail("id guard first"); } });
    s.trackTaskRecurrenceContinuity("id", null);
  });

  it("records the raw insertion boundary without validating or cloning its inputs", () => {
    const s = fixture();
    const raw = { title: "caller seed" };
    s.upsertTask(raw); assert.equal(s.state.tasks[0], raw);
    s.upsertTask(7); assert.equal(s.state.tasks[0], 7);
    s.state.tasks = []; s.upsertTask(null); assert.equal(s.state.tasks[0], null);
    s.state.tasks = [{ task_id: "present" }];
    assert.throws(() => s.upsertTask(null), { name: "TypeError" });
    assert.equal(s.state.tasks.length, 1);
  });
});

// Lift the actual collection declaration and its consumers; omit only automatic page boot
// and registry installation. This fixture does not manufacture a replacement state object.
function collectionFixture() {
  const boot = "  initializeTasksPage();";
  assert.equal(source.split(boot).length, 2);
  const registration = source.lastIndexOf('  requirePageController().register("tasks",');
  assert.ok(registration > 0);
  const program = source.slice(0, registration).replace(boot, "") +
    "return { state, upsertTask, mergeTasksById, nestedTaskDisplayRows, selectedTasksForBulk, syncSelectionToTasks, hasMixedValues, hasMixedTagValues, taskRowKey, isTaskNestingKey, appendTaskMetadata }; })();";
  return vm.runInNewContext(program, { window: { LongtailForge: { pageController: {} } } });
}

describe("Tasks raw collection writer and consumers", () => {
  it("keeps insertion and replacement identity, comparison order and primitive getter receivers", () => {
    const f = collectionFixture();
    /** @type {unknown[]} */ const reads = [];
    const id = {};
    const old = { get task_id() { reads.push(["old", this]); return id; } };
    const replacement = { get task_id() { reads.push(["replacement", this]); return id; } };
    f.upsertTask(old); assert.equal(reads.length, 0);
    const collection = f.state.tasks;
    f.upsertTask(replacement);
    assert.equal(f.state.tasks, collection); assert.equal(collection[0], replacement);
    assert.deepEqual(reads, [["old", old], ["replacement", replacement]]);
    const tail = { task_id: "tail" }; f.upsertTask(tail);
    assert.equal(collection[0], tail); assert.equal(collection[1], replacement);
    const failure = new Error("id read");
    f.state.tasks = [{ get task_id() { throw failure; } }];
    assert.throws(() => f.upsertTask({ get task_id() { return assert.fail("incoming read is later"); } }), error => error === failure);
    f.state.tasks = []; f.upsertTask(null); assert.equal(f.state.tasks[0], null);
    assert.throws(() => f.upsertTask(replacement), { name: "TypeError" });
    assert.equal(f.state.tasks[0], null);
    f.state.tasks = [{ title: "seed" }]; f.upsertTask(7); assert.equal(f.state.tasks[0], 7);
    const numberPrototype = f.upsertTask.constructor("return Number.prototype")();
    /** @type {unknown[]} */ const receivers = [];
    Object.defineProperty(numberPrototype, "task_id", { configurable: true, get() { receivers.push(this); return "numeric-id"; } });
    try {
      f.state.tasks = [{ task_id: "numeric-id" }]; f.upsertTask(7);
      assert.equal(f.state.tasks[0], 7); assert.deepEqual(receivers, [7]);
    } finally { delete numberPrototype.task_id; }

    assert.equal(f.nestedTaskDisplayRows(f.state.tasks).length, 0);
    assert.equal(f.state.tasks[0], 7, "display projection must not filter the stored collection");
  });

  it("keeps selection identity, order and existing projection behavior for opaque and sparse rows", () => {
    const f = collectionFixture();
    const id = {}, symbol = Symbol("id");
    const parent = { task_id: id }, child = { task_id: symbol, parentTask: { task_id: id } }, sparse = { title: "seed" };
    f.state.tasks.push(child, parent, sparse);
    const selected = f.state.selectedTaskIds;
    selected.add(symbol); selected.add("gone"); selected.add(id); selected.add(undefined);
    f.syncSelectionToTasks(f.state.tasks);
    assert.equal(f.state.selectedTaskIds, selected);
    assert.deepEqual([...selected], [symbol, id, undefined]);
    const chosen = f.selectedTasksForBulk([id, symbol]);
    assert.equal(chosen[0], child); assert.equal(chosen[1], parent);
    const display = f.nestedTaskDisplayRows(f.state.tasks);
    assert.equal(display[0].task, parent); assert.equal(display[1].task, child);
    assert.deepEqual(Array.from(display, (/** @type {{depth:number}} */ entry) => entry.depth), [0, 1]);
    const replacement = { task_id: id, title: "replacement" };
    const merged = f.mergeTasksById(f.state.tasks, [replacement]);
    assert.equal(merged[0], child); assert.equal(merged[1], replacement);
    f.state.tasks = [null];
    assert.throws(() => f.syncSelectionToTasks(f.state.tasks), { name: "TypeError" });
    assert.deepEqual([...selected], [symbol, id, undefined], "failure precedes selection cleanup");
  });

  it("retains native property-key conversion including symbols and thrown hooks", () => {
    const f = collectionFixture();
    const symbol = Symbol("counter");
    /** @type {string[]} */ const hints = [];
    const key = { [Symbol.toPrimitive](/** @type {string} */ hint) { hints.push(hint); return symbol; } };
    assert.equal(f.taskRowKey(key), symbol); assert.deepEqual(hints, ["string"]);
    for (const value of [null, undefined, 7, true, "__proto__", symbol]) {
      const original = Object.fromEntries([[value, 1]]);
      assert.equal(f.taskRowKey(value), Reflect.ownKeys(original)[0]);
    }
    const failure = new Error("key");
    assert.throws(() => f.taskRowKey({ toString() { throw failure; } }), error => error === failure);
    for (const value of [{}, () => {}, symbol]) assert.equal(f.isTaskNestingKey(value), true);
    for (const value of [null, undefined, 7, "text", false]) assert.equal(f.isTaskNestingKey(value), false);
  });

  it("retains custom collection receivers, opaque mapped values and failed calls", () => {
    const f = collectionFixture();
    /** @type {unknown[]} */ const calls = [];
    const result = { filter(/** @type {(value:unknown)=>boolean} */ predicate) { assert.equal(this, result); calls.push(predicate(0)); return this; }, sort() { assert.equal(this, result); calls.push("sort"); return this; }, join(/** @type {string} */ separator) { assert.equal(this, result); calls.push(separator); return "same"; } };
    const tags = { map(/** @type {(value:unknown)=>unknown} */ mapper) { assert.equal(this, tags); calls.push(mapper({ tag_id: "tag" })); return result; } };
    assert.equal(f.hasMixedTagValues([{ tags }, { tags }]), false);
    assert.deepEqual(calls, ["tag", false, "sort", "|", "tag", false, "sort", "|"]);
    assert.throws(() => f.hasMixedTagValues([{ tags: { map: 7 } }]), { name: "TypeError" });
    const failure = new Error("map getter");
    assert.throws(() => f.hasMixedTagValues([{ tags: { get map() { throw failure; } } }]), error => error === failure);
    assert.throws(() => f.hasMixedValues([null], "due_date"), { name: "TypeError" });
  });
});


it("preserves opaque timezone arguments, optional call ordering, receiver and return identity", () => {
  /** @type {string[]} */ const calls = [];
  const result = {}, date = {}, zone = {};
  const owner = { get formatDateTime() { calls.push("method"); return /** @this {unknown} */ function (/** @type {unknown} */ value, /** @type {unknown} */ timezone) { assert.equal(this, owner); assert.equal(value, date); assert.equal(timezone, zone); calls.push("call"); return result; }; } };
  const s = fixture({ requireNamespace: () => { calls.push("namespace"); return { timezones: owner }; } });
  const task = { get due_date() { calls.push("date-present"); return "date"; }, get due_time() { calls.push("time-present"); return "time"; }, get due_at_utc() { calls.push("utc"); return date; }, get due_timezone() { calls.push("zone"); return zone; } };
  assert.equal(s.formatDue(task), result);
  assert.deepEqual(calls, ["date-present", "time-present", "namespace", "method", "utc", "zone", "call"]);
  calls.length = 0; s.requireNamespace = () => ({ timezones: { formatDateTime: null } });
  assert.equal(s.formatDue(task), "date time");
  assert.deepEqual(calls, ["date-present", "time-present", "date-present", "time-present"]);
  calls.length = 0; s.requireNamespace = () => ({ timezones: { formatDateTime: 7 } });
  assert.throws(() => s.formatDue(task), { name: "TypeError" });
  assert.deepEqual(calls, ["date-present", "time-present", "utc", "zone"]);
  const failure = new Error("formatter"); s.requireNamespace = () => ({ timezones: { formatDateTime() { throw failure; } } });
  assert.throws(() => s.formatDue(task), error => error === failure);
});

it("retains follow-before-target lookup, opaque target identity, receivers, await and error handling", async () => {
  const targetSource = extractFunctionBlock(createProjectTextReader().readText("public/js/shared/notification-subscriptions.js"), "taskTarget");
  const taskTarget = vm.runInNewContext("(" + targetSource + ")");
  /** @type {unknown[]} */ const calls = [];
  const id = {};
  /** @type {() => void} */ let finish = () => {};
  const saved = new Promise(resolve => { finish = () => resolve(undefined); });
  const subscriptions = {
    get follow() { calls.push("follow-get"); return /** @this {unknown} */ function (/** @type {{targetId:unknown}} */ target) { assert.equal(this, subscriptions); assert.equal(target.targetId, id); calls.push("follow-call"); return saved; }; },
    get taskTarget() { calls.push("target-get"); return /** @this {unknown} */ function (/** @type {unknown} */ value) { assert.equal(this, subscriptions); calls.push("target-call"); return taskTarget(value); }; },
  };
  const task = { get task_id() { calls.push("id"); return id; } };
  const s = fixture({ requireNamespace: () => ({ notificationSubscriptions: subscriptions }), setStatus: (/** @type {unknown} */ message) => calls.push(message), requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error) => { calls.push(error); return "caught"; } }) });
  const pending = s.followTaskNotifications(task);
  assert.deepEqual(calls, ["Following task notifications...", "follow-get", "target-get", "id", "target-call", "follow-call"]);
  finish(); await pending;
  assert.equal(calls.at(-1), "Task notifications followed.");
  calls.length = 0;
  const failure = new Error("follow getter");
  s.requireNamespace = () => ({ notificationSubscriptions: { get follow() { throw failure; }, get taskTarget() { return assert.fail("later getter"); } } });
  await s.followTaskNotifications(task);
  assert.deepEqual(calls, ["Following task notifications...", failure, "caught"]);
  calls.length = 0; s.requireNamespace = () => ({});
  await s.followTaskNotifications(task);
  assert.deepEqual(calls, ["Notification following is unavailable."]);
});
