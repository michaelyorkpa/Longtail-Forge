import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
function fixture() {
  const f = vm.createContext({ context: {}, fields: { timerDisplay: {} } });
  const declaration = source.match(/  let taskTimers = \[\];/);
  assert.ok(declaration);
  vm.runInContext(declaration[0], f);
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "writeTaskControl", "currentTaskTimer", "upsertTaskTimer", "removeTaskTimer", "readTaskTimerElapsedSeconds", "updateTaskTimerDisplay", "formatDuration"])
    vm.runInContext(extractFunctionBlock(source, name), f);
  vm.runInContext("Date.now = () => 20000", f);
  return f;
}

describe("Task Dialog final timer input boundary", () => {
  it("retains sparse and primitive mutation rows by identity", () => {
    const f = fixture(); const sparse = Object.create({ task_id: "sparse" });
    sparse.extra = { marker: true }; f.upsertTaskTimer(sparse);
    assert.equal(f.currentTaskTimer("sparse"), sparse);
    assert.equal(f.context.taskTimers[0], sparse);
    f.upsertTaskTimer(7); assert.equal(f.currentTaskTimer(undefined), 7);
    f.removeTaskTimer(undefined); assert.equal(f.context.taskTimers.length, 1);
    assert.equal(f.context.taskTimers[0], sparse);
  });

  it("pauses other running rows without cloning the inserted row or losing extra members", () => {
    const f = fixture(); const extra = Symbol("extra");
    const first = { task_id: "first", timer_status: "running", last_active_start_time: "start", [extra]: {} };
    const next = { task_id: "next", timer_status: "running" };
    f.upsertTaskTimer(first); f.upsertTaskTimer(next);
    const paused = f.currentTaskTimer("first");
    assert.notEqual(paused, first); assert.equal(paused.timer_status, "paused");
    assert.equal(paused.last_active_start_time, null); assert.equal(paused[extra], first[extra]);
    assert.equal(f.currentTaskTimer("next"), next);
    assert.throws(() => f.upsertTaskTimer(null), { name: "TypeError" });
    assert.equal(f.currentTaskTimer("next"), next);
  });

  it("keeps parseInt string-hint conversion and falsy timer fallback", () => {
    const f = fixture();
    for (const value of [null, undefined, false, 0, "", NaN, 7]) assert.equal(f.readTaskTimerElapsedSeconds(value), 0);
    for (const [value, expected] of [[2.9, 2], [1e21, 1], [1e-7, 1], [-2.9, -2], [0, 0], [NaN, 0], ["12seconds", 12]])
      assert.equal(f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: value, timer_status: "paused" }), expected);
    /** @type {string[]} */ const hints = [];
    const value = { [Symbol.toPrimitive](/** @type {string} */ hint) { hints.push(hint); return "17tail"; } };
    assert.equal(f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: value }), 17);
    assert.deepEqual(hints, ["string"]);
    assert.throws(() => f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: Symbol("seconds") }), { name: "TypeError" });
  });

  it("keeps native date inputs, Date internal-slot copying and default-hint conversion", () => {
    const f = fixture();
    const date = new Date(10000); date.valueOf = () => { throw new Error("Date copy must not coerce"); };
    for (const start of [10000, "1970-01-01T00:00:10.000Z", date])
      assert.equal(f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 2.9, timer_status: "running", last_active_start_time: start }), 12);
    /** @type {string[]} */ const hints = [];
    const start = { [Symbol.toPrimitive](/** @type {string} */ hint) { hints.push(hint); return 10000; } };
    assert.equal(f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 0, timer_status: "running", last_active_start_time: start }), 10);
    assert.deepEqual(hints, ["default"]);
    assert.ok(Number.isNaN(f.readTaskTimerElapsedSeconds({ timer_status: "running", last_active_start_time: "invalid" })));
    assert.equal(f.readTaskTimerElapsedSeconds({ accumulated_elapsed_seconds: 3, timer_status: "running", last_active_start_time: 30000 }), 3);
    assert.throws(() => f.readTaskTimerElapsedSeconds({ timer_status: "running", last_active_start_time: Symbol("start") }), { name: "TypeError" });
  });

  it("preserves repeated date getters and stops before unused date reads", () => {
    const f = fixture(); let reads = 0;
    const timer = { accumulated_elapsed_seconds: "4", timer_status: "paused", get last_active_start_time() { reads++; return reads === 1 ? 10000 : 15000; } };
    assert.equal(f.readTaskTimerElapsedSeconds(timer), 4); assert.equal(reads, 0);
    timer.timer_status = "running";
    assert.equal(f.readTaskTimerElapsedSeconds(timer), 9); assert.equal(reads, 2);
    f.updateTaskTimerDisplay({ accumulated_elapsed_seconds: 3661, timer_status: "paused" });
    assert.equal(f.fields.timerDisplay.textContent, "01:01:01");
  });

  it("matches the original native construction through the consumer, including ordering and thrown conversion", () => {
    const current = extractFunctionBlock(source, "readTaskTimerElapsedSeconds");
    const bridge = "    /** @type {Date} */\n    const startedAtDate = Reflect.construct(Date, [\n      taskProjectionFields(timer).last_active_start_time,\n    ]);\n    const startedAt = startedAtDate.getTime();";
    assert.ok(current.includes(bridge));
    const original = current.replace(bridge, "    const startedAt = new Date(taskProjectionFields(timer).last_active_start_time).getTime();");
    for (const implementation of [original, current]) {
      const f = fixture();
      vm.runInContext(implementation, f);
      const date = new Date(10000);
      date.valueOf = () => { throw new Error("Date internal slots must be copied"); };
      for (const input of [10000, date, { valueOf: () => 10000 }])
        assert.equal(f.readTaskTimerElapsedSeconds({ timer_status: "running", last_active_start_time: input }), 10);
      assert.ok(Number.isNaN(f.readTaskTimerElapsedSeconds({ timer_status: "running", last_active_start_time: "invalid" })));
      /** @type {string[]} */ const order = [];
      f.order = order;
      vm.runInContext(`
        const nativeGetTime = Date.prototype.getTime;
        Date.prototype.getTime = function () { order.push("getTime"); return Reflect.apply(nativeGetTime, this, []); };
        Date.now = () => { order.push("now"); return 20000; };
      `, f);
      const input = { [Symbol.toPrimitive](/** @type {string} */ hint) { order.push(`convert:${hint}`); return 10000; } };
      const timer = {
        get accumulated_elapsed_seconds() { order.push("elapsed"); return 3; },
        get timer_status() { order.push("status"); return "running"; },
        get last_active_start_time() { order.push("start"); return input; },
      };
      assert.equal(f.readTaskTimerElapsedSeconds(timer), 13);
      assert.deepEqual(order, ["elapsed", "status", "start", "start", "convert:default", "getTime", "now"]);
      order.length = 0;
      const failure = new Error("conversion failed");
      input[Symbol.toPrimitive] = (hint) => { order.push(`convert:${hint}`); throw failure; };
      assert.throws(() => f.readTaskTimerElapsedSeconds(timer), (error) => error === failure);
      assert.deepEqual(order, ["elapsed", "status", "start", "start", "convert:default"]);
    }
  });
});
