import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
/** @param {unknown} result */
function fixture(result) {
  /** @type {unknown[][]} */ const calls = [];
  const namespace = { taskResumeNoteCapture: { offer: async (/** @type {unknown} */ options) => { calls.push(["offer", options]); return { reason: "dismissed" }; } } };
  const scope = vm.createContext({
    window: { LongtailForge: namespace },
    requireApi: () => ({ getJson: async (/** @type {string} */ route) => { calls.push(["read", route]); return result; } }),
    readPendingTaskFocusDrift: () => ({ taskId: "task/id" }),
    clearPendingTaskFocusDrift: () => calls.push(["clear"]),
    requireNamespace: () => namespace,
    setStatus: (/** @type {unknown} */ message, /** @type {unknown} */ options) => calls.push(["status", message, options]),
  });
  for (const name of ["workbenchSourceField", "recoverPendingTaskFocusDrift"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return { scope, calls };
}

it("keeps optional envelopes absent and clears the marker before reading", async () => {
  for (const result of [null, undefined, 0, false, "", {}, { task: null }]) {
    const f = fixture(result);
    assert.equal(await f.scope.recoverPendingTaskFocusDrift(), false);
    assert.deepEqual(f.calls, [["clear"], ["read", "/api/tasks/task%2Fid"]]);
  }
});

it("preserves inherited reads, receivers, raw task identity and eligibility short circuits", async () => {
  /** @type {string[]} */ const reads = [];
  const task = Object.create({
    get status() { assert.equal(this, task); reads.push("status"); return "open"; },
    get blocked_reason() { assert.equal(this, task); reads.push("blocked"); return ""; },
    get resume_note() { assert.equal(this, task); reads.push("note"); return ""; },
  });
  const result = Object.create({ get task() { assert.equal(this, result); reads.push("task"); return task; } });
  const f = fixture(result);
  assert.equal(await f.scope.recoverPendingTaskFocusDrift(), true);
  assert.deepEqual(reads, ["task", "status", "blocked", "note"]);
  assert.equal(Reflect.get(Object(f.calls[3][1]), "task"), task);
  assert.deepEqual(f.calls.map(row => row[0]), ["clear", "read", "status", "offer", "status"]);
  const failure = new Error("getter");
  const stopped = fixture({ task: { status: "closed", get blocked_reason() { throw failure; } } });
  assert.equal(await stopped.scope.recoverPendingTaskFocusDrift(), false);
  assert.equal(stopped.calls.length, 2);
  const failed = fixture({ get task() { throw failure; } });
  assert.equal(await failed.scope.recoverPendingTaskFocusDrift(), false);
  assert.equal(failed.calls.length, 2);
});

it("records caught nullish values reaching the real capture callback and failing before an error status", async () => {
  for (const thrown of [null, undefined]) {
    const f = fixture({ task: { status: "open" } });
    f.scope.window.LongtailForge.api = { getJson: async () => { throw thrown; } };
    vm.runInContext(read("public/js/task-resume-note-capture.js"), f.scope);
    assert.equal(await f.scope.recoverPendingTaskFocusDrift(), false);
    assert.deepEqual(f.calls, [["clear"], ["read", "/api/tasks/task%2Fid"], ["status", "Recovering work context...", undefined]]);
  }
});

it("preserves inherited error messages and failure from message getters through the real capture", async () => {
  for (const fails of [false, true]) {
    let reads = 0;
    const thrown = Object.create({ get message() {
      assert.equal(this, thrown); reads += 1;
      if (fails) throw new Error("message getter");
      return "Capture failed";
    } });
    const f = fixture({ task: { status: "open" } });
    f.scope.window.LongtailForge.api = { getJson: async () => { throw thrown; } };
    vm.runInContext(read("public/js/task-resume-note-capture.js"), f.scope);
    assert.equal(await f.scope.recoverPendingTaskFocusDrift(), !fails);
    assert.equal(reads, 1);
    if (fails) assert.equal(f.calls.length, 3);
    else {
      assert.equal(f.calls.length, 4);
      assert.equal(f.calls[3][1], "Capture failed");
      assert.equal(Reflect.get(Object(f.calls[3][2]), "isError"), true);
    }
  }
});
