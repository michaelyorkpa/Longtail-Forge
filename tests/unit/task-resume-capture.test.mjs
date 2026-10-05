import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/task-resume-note-capture.js");
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  /** @type {unknown[][]} */ const reads = [];
  /** @type {unknown[][]} */ const writes = [];
  /** @type {unknown[][]} */ const prompts = [];
  const task = { task_id: "one", status: "open", resume_note: "", extra: { preserved: true } };
  const handlers = {
    read: () => Promise.resolve({ task }),
    write: (/** @type {unknown} */ _url, /** @type {Record<string, unknown>} */ payload) => {
      if (typeof payload.resume_note === "string") task.resume_note = payload.resume_note;
      if (payload.resume_note_action === "consume") task.resume_note = "";
      return Promise.resolve({ task });
    },
    prompt: () => Promise.resolve({ confirmed: true, value: "Continue here" }),
  };
  const window = { LongtailForge: { api: {
    getJson: (/** @type {unknown[]} */ ...args) => { reads.push(args); return handlers.read(); },
    putJson: (/** @type {unknown} */ url, /** @type {Record<string, unknown>} */ payload) => { writes.push([url, payload]); return handlers.write(url, payload); },
  }, capturePrompt: { open: (/** @type {unknown} */ options) => { prompts.push([options]); return handlers.prompt(); } } } };
  const context = vm.createContext({ window });
  vm.runInContext(source, context);
  const capture = vm.runInContext("window.LongtailForge.taskResumeNoteCapture", context);
  for (const name of ["isResumeFieldContainer", "resumeTaskField", "readResumeTaskResponse", "callResumeChannel"])
    vm.runInContext(extractFunctionBlock(source, name), context);
  return { task, handlers, window, reads, writes, prompts, capture, helpers: vm.runInContext("({resumeTaskField,readResumeTaskResponse,callResumeChannel})", context) };
}

// Risk-based cases for the actual module, including its real pending/captured sets.
// No mirrored annotation campaign, equivalent-mutation credits or invented percentage.
describe("Task resume capture response and host boundaries", () => {
  it("keeps missing IDs, scalar options and null failure timing", async () => {
    const f = fixture();
    for (const options of [undefined, {}, false, 0, "text", { taskId: "  " }]) {
      assert.equal((await f.capture.offer(options)).reason, "suppressed");
      assert.equal((await f.capture.consume(options)).reason, "missing-task");
    }
    await assert.rejects(f.capture.offer(null), /options must not be null/);
    await assert.rejects(f.capture.consume(null), /options must not be null/);
    assert.equal(f.reads.length + f.writes.length + f.prompts.length, 0);
  });

  it("retains ID fallback, trimming/encoding and host prototype channels", async () => {
    const f = fixture(), options = Object.create({ taskId: "  a/b  ", task: { task_id: "other" } });
    await f.capture.offer(options);
    assert.deepEqual(plain(f.reads), [["/api/tasks/a%2Fb", { cache: "no-store" }]]);
    assert.equal(f.writes[0][0], "/api/tasks/a%2Fb");
    const g = fixture(); await g.capture.offer({ taskId: 0, task: { task_id: 42 } });
    assert.equal(g.reads[0][0], "/api/tasks/42");
  });

  it("preserves nullish versus empty note precedence and blocked preflight ordering", async () => {
    const f = fixture();
    assert.equal((await f.capture.offer({ taskId: "one", resumeNote: null, task: { resume_note: "saved" } })).reason, "suppressed");
    for (const task of [{ status: " blocked " }, { status: "open", blocked_reason: " waiting " }])
      assert.equal((await f.capture.offer({ taskId: "one", task })).reason, "blocked-task");
    assert.equal(f.reads.length, 0);
    await f.capture.offer({ taskId: "one", resumeNote: "", task: { resume_note: "old" } });
    assert.equal(f.reads.length, 1); assert.equal(f.writes.length, 1);
  });

  it("reads only own task fields and keeps wire task identity and opaque metadata", () => {
    const f = fixture(), partial = { task_id: "one", extra: { arbitrary: "metadata" } };
    assert.equal(f.helpers.readResumeTaskResponse({ task: partial }), partial);
    assert.equal(f.helpers.readResumeTaskResponse(Object.create({ task: partial })), null);
    assert.equal(f.helpers.resumeTaskField(Object.create({ status: "open" }), "status"), undefined);
    assert.equal(f.helpers.resumeTaskField({ status: { toString: () => "open" } }, "status").toString(), "open");
    for (const value of [null, undefined, false, 0, ""]) assert.equal(f.helpers.readResumeTaskResponse({ task: value }), null);
    assert.equal(f.helpers.readResumeTaskResponse({ task: 12 }), 12);
  });

  it("keeps checked reads, terminal/blocked/existing-note outcomes before prompting", async () => {
    for (const task of [null, { status: "completed" }, { status: "archived" }, Object.create({ status: "open" }), { status: "blocked" }, { status: "open", blocked_reason: "wait" }, { status: "open", resume_note: "saved" }]) {
      const f = fixture(); f.handlers.read = () => Promise.resolve({ task });
      const result = await f.capture.offer({ taskId: "one" });
      assert.equal(result.task, task);
      assert.equal(result.reason, task?.resume_note ? "existing-note" : task?.status === "blocked" || task?.blocked_reason ? "blocked-task" : "inactive-task");
      assert.equal(f.prompts.length + f.writes.length, 0);
    }
  });

  it("preserves prompt options, one write, callback receiver/result identity and consume reset", async () => {
    const f = fixture(), parent = { opaque: "parent" }, trigger = { opaque: "trigger" };
    /** @type {unknown[][]} */ const seen = [];
    const options = { taskId: "one", parent, trigger, onSaved(/** @type {unknown} */ task) { seen.push([this, task]); } };
    const result = await f.capture.offer(options);
    assert.equal(result.captured, true); assert.equal(result.task, f.task);
    assert.equal(seen[0][0], options); assert.equal(seen[0][1], f.task);
    assert.deepEqual(plain(f.writes), [["/api/tasks/one", { resume_note: "Continue here", resume_note_action: "capture" }]]);
    assert.deepEqual(plain(f.prompts[0][0]), { prompt: "Add resume note?", label: "Resume note", multiline: false, confirmLabel: "Yes", cancelLabel: "No", parent, trigger });
    assert.equal((await f.capture.offer({ taskId: "one" })).reason, "suppressed");
    const consumed = await f.capture.consume({ task: f.task, onConsumed(/** @type {unknown} */ task) { seen.push([this, task]); } });
    assert.equal(consumed.consumed, true); assert.equal(consumed.task, f.task);
    assert.equal(f.reads.length, 1); assert.equal(f.task.status, "open");
    f.handlers.prompt = () => Promise.resolve({ confirmed: false, value: "" });
    assert.equal((await f.capture.offer({ taskId: "one" })).reason, "dismissed");
    assert.equal(f.writes.length, 2);
  });

  it("suppresses overlapping offers and releases pending ownership after a rejected read", async () => {
    const f = fixture();
    /** @type {(reason?: unknown) => void} */ let rejectRead = () => {};
    f.handlers.read = () => new Promise((_resolve, reject) => { rejectRead = reject; });
    const pending = f.capture.offer({ taskId: "one" });
    assert.equal((await f.capture.offer({ taskId: "one" })).reason, "suppressed");
    const failure = new Error("read failed"); rejectRead(failure);
    const result = await pending; assert.equal(result.error, failure); assert.equal(result.reason, "error");
    f.handlers.read = () => Promise.resolve({ task: f.task });
    assert.equal((await f.capture.offer({ taskId: "one" })).captured, true);
  });

  it("reports committed writes whose callback fails and retains capture suppression", async () => {
    const f = fixture();
    /** @type {unknown[]} */ const errors = [];
    const result = await f.capture.offer({ taskId: "one", onSaved: true, onError: (/** @type {unknown} */ error) => errors.push(error) });
    assert.equal(f.writes.length, 1); assert.equal(result.reason, "error"); assert.equal(result.error, errors[0]);
    assert.equal((await f.capture.offer({ taskId: "one" })).reason, "suppressed");
    const consumed = await f.capture.consume({ task: f.task, onConsumed: "invalid" });
    assert.equal(consumed.reason, "error"); assert.equal(f.task.resume_note, "");
    assert.equal((await f.capture.offer({ taskId: "one" })).captured, true);
  });

  it("preserves thrown values, callback errors and non-awaited callback returns", async () => {
    const f = fixture(), failure = Object.create({ message: "inherited message" });
    f.handlers.read = () => Promise.reject(failure);
    const errorOptions = { taskId: "one", onError(/** @type {unknown} */ error) { assert.equal(this, errorOptions); assert.equal(error, failure); } };
    assert.equal((await f.capture.offer(errorOptions)).error, failure);
    await assert.rejects(f.capture.offer({ taskId: "one", onError: true }), /onError must be callable/);
    const g = fixture();
    const never = new Promise(() => {});
    const callback = () => never; Object.assign(callback, { call: "not the invocation protocol" });
    assert.equal((await g.capture.offer({ taskId: "one", onSaved: callback })).captured, true);
  });

  it("retains consume's inactive/no-note branches and write failure without a prompt", async () => {
    const f = fixture();
    assert.equal((await f.capture.consume({ taskId: "one", task: { status: "archived", resume_note: "saved" } })).reason, "inactive-task");
    assert.equal((await f.capture.consume({ taskId: "one", task: { status: "blocked", resume_note: "" } })).reason, "no-note");
    const failure = new Error("write failed"); f.handlers.write = () => Promise.reject(failure);
    const result = await f.capture.consume({ taskId: "one", task: { status: "blocked", resume_note: "saved" } });
    assert.equal(result.error, failure); assert.equal(result.consumed, false); assert.equal(f.prompts.length, 0);
  });
});
