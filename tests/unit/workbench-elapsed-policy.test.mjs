import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { ActiveTimerStatusSchema, ActiveTimerFinalizeSchema, parseTimeTrackingEdgePayload } from "../../src/modules/time-tracking/time-tracking.contracts.js";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
const guard = "    if (!Number.isFinite(startedAt)) {\n      return baseSeconds;\n    }\n";

/** @param {boolean} [before] */
function fixture(before = false) {
  /** @type {{path: string, payload: Record<string, unknown>}[]} */ const writes = [];
  const scope = vm.createContext({
    requireApi: () => ({
      async putJson(/** @type {string} */ path, /** @type {Record<string, unknown>} */ payload) { writes.push({ path, payload: JSON.parse(JSON.stringify(payload)) }); return {}; },
      async postJson(/** @type {string} */ path, /** @type {Record<string, unknown>} */ payload) { writes.push({ path, payload: JSON.parse(JSON.stringify(payload)) }); return {}; },
    }),
    setStatus() {}, async loadWorkbench() {}, offerTaskResumeNote() {},
    requireTaskRecords: () => ({ readTask: () => null }),
    requireErrors: () => ({ caughtMessage(/** @type {unknown} */ error) { throw error; } }),
  });
  vm.runInContext("Date.now = () => 100000;", scope);
  for (const name of ["workbenchSourceField", "readElapsedSeconds", "formatDuration", "taskFocusTimerResultTask", "saveTaskTimer", "pauseExistingTimer", "finalizeSourceTaskTimer", "finalizeTimer"]) {
    let body = extractFunctionBlock(source, name);
    if (before && name === "readElapsedSeconds") {
      assert.equal(body.split(guard).length, 2);
      body = body.replace(guard, "");
    }
    vm.runInContext(body, scope);
  }
  return { scope, writes };
}

it("keeps accumulated parsing, invalid-start display, rounding and future clamping", () => {
  for (const [start, status, expected] of [["invalid", "running", 72], ["1970-01-01T00:01:30.500Z", "running", 81], ["1970-01-01T00:02:00Z", "running", 72], [undefined, "running", 72], [null, "running", 72], ["invalid", "paused", 72]]) {
    const { scope } = fixture();
    const timer = { accumulated_elapsed_seconds: "72.9tail", timer_status: status, last_active_start_time: start };
    assert.equal(scope.readElapsedSeconds(timer), expected);
    assert.equal(scope.formatDuration(scope.readElapsedSeconds(timer)), expected === 81 ? "00:01:21" : "00:01:12");
  }
  const { scope } = fixture();
  assert.equal(scope.readElapsedSeconds({ accumulated_elapsed_seconds: -8, timer_status: "running", last_active_start_time: "invalid" }), -8);
  assert.equal(scope.readElapsedSeconds({ accumulated_elapsed_seconds: "invalid", timer_status: "running", last_active_start_time: "invalid" }), 0);
});

it("preserves valid pause/finalize requests and replaces malformed-start nulls with the base", async () => {
  for (const method of ["pauseExistingTimer", "finalizeSourceTaskTimer"]) {
    for (const start of ["1970-01-01T00:01:30.500Z", "invalid"]) {
      const timer = { source_type: "task", source_enabled: true, source_id: "task-one", active_timer_id: "timer-one", accumulated_elapsed_seconds: 72, timer_status: "running", last_active_start_time: start };
      const old = fixture(true), current = fixture();
      await old.scope[method](timer);
      await current.scope[method](timer);
      assert.equal(old.writes.length, 1); assert.equal(current.writes.length, 1);
      assert.equal(current.writes[0].path, old.writes[0].path);
      const key = method === "pauseExistingTimer" ? "accumulated_elapsed_seconds" : "duration_seconds";
      assert.equal(old.writes[0].payload[key], start === "invalid" ? null : 81);
      assert.equal(current.writes[0].payload[key], start === "invalid" ? 72 : 81);
      const timeKey = method === "pauseExistingTimer" ? "last_active_start_time" : "end_time";
      for (const write of [old.writes[0], current.writes[0]]) {
        assert.equal(typeof write.payload[timeKey], "string");
        assert.equal(Number.isFinite(Date.parse(String(write.payload[timeKey]))), true);
      }
      // Wall-clock request timestamps advance independently of Date.now's test clock.
      const { [timeKey]: oldTime, ...oldBody } = old.writes[0].payload;
      const { [timeKey]: currentTime, ...currentBody } = current.writes[0].payload;
      assert.ok(oldTime); assert.ok(currentTime);
      assert.deepEqual(currentBody, { ...oldBody, [key]: start === "invalid" ? 72 : 81 });
    }
  }
});

it("pins the real server edge rejection of null status and finalization values", () => {
  assert.throws(() => parseTimeTrackingEdgePayload(ActiveTimerStatusSchema, { accumulated_elapsed_seconds: null }), { statusCode: 400 });
  assert.throws(() => parseTimeTrackingEdgePayload(ActiveTimerFinalizeSchema, { duration_seconds: null }), { statusCode: 400 });
});

it("shows manual finalization previously fails before a request and now sends finite time", async () => {
  const timer = { source_type: "manual", timer_slot: "one", accumulated_elapsed_seconds: 72, timer_status: "running", last_active_start_time: "invalid" };
  const old = fixture(true), current = fixture();
  await assert.rejects(old.scope.finalizeTimer(timer), { name: "RangeError" });
  assert.equal(old.writes.length, 0);
  await current.scope.finalizeTimer(timer);
  assert.equal(current.writes[0].payload.duration_seconds, 72);
});

it("retains finalization's one-second minimum and derived start for a zero base", async () => {
  const current = fixture();
  await current.scope.finalizeTimer({ source_type: "manual", timer_slot: "one", accumulated_elapsed_seconds: 0, timer_status: "running", last_active_start_time: "invalid" });
  const payload = current.writes[0].payload;
  assert.equal(payload.duration_seconds, 1);
  assert.equal(Date.parse(String(payload.end_time)) - Date.parse(String(payload.start_time)), 1000);
});

it("traces task pause null to zero at the real task service before sourced persistence", async () => {
  const task = { task_id: "one", title: "Task" };
  /** @type {Record<string, unknown>[]} */ const saved = [];
  const scope = vm.createContext({
    readEligibleTask: async () => task, assertTaskTimersEnabled() {}, assertCanUseTaskTimer() {},
    taskTimersRepository: { readByTask: async () => ({ accumulated_elapsed_seconds: 72 }) },
    taskTimerTransitionMetadata: () => ({}), taskTimerSource: () => ({}), taskTimerBillable: () => false,
    activeTimersService: { async saveSourced(/** @type {unknown} */ source, /** @type {Record<string, unknown>} */ payload) { saved.push(payload); return { timer: payload }; } },
    markTaskWorked() {}, tasksRepository: { readById: async () => task }, taskTimerFromUnified: (/** @type {unknown} */ timer) => timer,
  });
  vm.runInContext(extractFunctionBlock(read("src/modules/tasks/task-timers.service.js"), "save"), scope);
  for (const value of [null, 72]) await scope.save("one", { timer_status: "paused", accumulated_elapsed_seconds: value }, { workspace_id: "workspace", user_id: "user" });
  assert.equal(saved[0].accumulated_elapsed_seconds, 0);
  assert.equal(saved[1].accumulated_elapsed_seconds, 72);
  assert.equal(saved[0].last_active_start_time, null);
});
