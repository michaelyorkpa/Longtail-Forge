import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  const f = vm.createContext({
    fields: {}, document: { createTextNode: (/** @type {string} */ textContent) => ({ textContent }), createElement: () => ({}) },
    ...overrides,
  });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "writeRecurrenceContinuity", "recurrenceContinuityMessage", "renderRecurrenceContinuity", "pollRecurrenceContinuity"])
    vm.runInContext(extractFunctionBlock(source, name), f);
  return f;
}

describe("Task recurrence continuity remains opaque", () => {
  it("retains absent, ended, available, failed and pending messages", () => {
    const f = fixture();
    for (const value of [undefined, null, false, 3, "token", {}]) assert.equal(f.recurrenceContinuityMessage(value), "");
    assert.equal(f.recurrenceContinuityMessage({ isRecurring: true, status: "ended" }), "Task completed. Recurring series ended.");
    for (const [status, nextTask, suffix] of [["available", {}, "."], ["available", null, " (creating now)."], ["handoff_failed", null, "; automatic recovery is pending."], ["pending", null, " (creating now)."]]) {
      assert.equal(f.recurrenceContinuityMessage({ isRecurring: 1, status, nextTask, nextScheduledDate: "2050-01-01" }), `Task completed. Next scheduled 2050-01-01${suffix}`);
    }
    assert.equal(f.recurrenceContinuityMessage({ isRecurring: true }), "Task completed. Recurring follow-up (creating now).");
  });

  it("retains inherited getters, repeated reads and the forwarder's original arguments", () => {
    const f = fixture();
    /** @type {string[]} */
    const log = [];
    const token = Object.create({
      get isRecurring() { assert.equal(this, token); log.push("recurring"); return true; },
      get status() { assert.equal(this, token); log.push("status"); return "handoff_failed"; },
      get nextScheduledDate() { assert.equal(this, token); log.push("date"); return "2050-01-01"; },
    });
    f.recurrenceContinuityMessage(token);
    assert.deepEqual(log, ["recurring", "status", "date", "date", "status", "status"]);
    const container = {}; f.fields.recurrenceContinuity = container;
    f.renderRecurrenceContinuity = (/** @type {unknown} */ c, /** @type {unknown} */ t) => { assert.equal(c, container); assert.equal(t, token); };
    f.writeRecurrenceContinuity(token);
  });

  it("preserves custom container receivers, replacement, hidden state and repeated link reads", () => {
    const f = fixture();
    /** @type {unknown[]} */
    const children = ["old"];
    const container = { hidden: false, replaceChildren() { assert.equal(this, container); children.length = 0; }, append(/** @type {unknown[]} */ ...items) { assert.equal(this, container); children.push(...items); } };
    f.renderRecurrenceContinuity(container, null);
    assert.deepEqual(children, []); assert.equal(container.hidden, true);
    const url = { toString: () => "/tasks.html?task=next" }; let reads = 0;
    const token = { isRecurring: true, status: "available", get nextTask() { reads++; return { url }; } };
    f.renderRecurrenceContinuity(container, token);
    assert.equal(container.hidden, false); assert.equal(reads, 3);
    assert.equal(children.length, 3);
    assert.deepEqual(children[2], { className: "button button-secondary button-compact", href: url, textContent: "Open next task" });
  });

  it("keeps optional containers optional and method failure timing visible", () => {
    const f = fixture(); const sentinel = new Error("must not read");
    for (const container of [undefined, null, false, 0, ""]) f.renderRecurrenceContinuity(container, { get isRecurring() { throw sentinel; } });
    /** @type {string[]} */
    const log = [];
    const container = { get replaceChildren() { log.push("replace getter"); return /** @this {unknown} */ function () { assert.equal(this, container); log.push("replace"); }; }, set hidden(/** @type {unknown} */ value) { assert.equal(value, false); log.push("hidden"); }, get append() { log.push("append getter"); return 7; } };
    f.document.createTextNode = () => { log.push("text"); return {}; };
    assert.throws(() => f.renderRecurrenceContinuity(container, { isRecurring: true }), { name: "TypeError", message: "Task continuity container append is not callable." });
    assert.deepEqual(log, ["replace getter", "replace", "hidden", "append getter", "text"]);
    assert.throws(() => f.renderRecurrenceContinuity({ replaceChildren: null }, {}), { name: "TypeError", message: "Task continuity container replaceChildren is not callable." });
  });

  it("keeps default seven attempts, six delays, cache policy and opaque identity", async () => {
    /** @type {unknown[]} */
    const calls = [];
    /** @type {number[]} */
    const delays = [];
    const token = { status: "pending", extra: {} }; const options = { initialContinuity: token, onUpdate(/** @type {unknown} */ result, /** @type {number} */ attempt) { assert.equal(this, options); assert.equal(result, token); calls.push(attempt); } };
    const f = fixture({ requireApi: () => ({ getJson(/** @type {string} */ url, /** @type {{cache:string}} */ request) { assert.equal(url, "/api/tasks/task%2Fid/recurrence-continuity"); assert.equal(request.cache, "no-store"); return Promise.resolve({ recurrenceContinuity: 0 }); } }), global: { setTimeout(/** @type {() => void} */ callback, /** @type {number} */ delay) { delays.push(delay); callback(); } } });
    assert.equal(await f.pollRecurrenceContinuity("task/id", options), token);
    assert.deepEqual(calls, [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual(delays, Array(6).fill(1500));
  });

  it("awaits updates before reading settled status and never starts a later request early", async () => {
    let requests = 0; let release = () => {}; let entered = () => {};
    const started = new Promise((resolve) => { entered = () => resolve(undefined); });
    const token = { status: "pending" };
    const options = { attempts: "4", onUpdate: async function (/** @type {unknown} */ value, /** @type {number} */ attempt) { assert.equal(this, options); assert.equal(value, token); assert.equal(attempt, 0); await new Promise((resolve) => { release = () => resolve(undefined); entered(); }); token.status = "ended"; } };
    const f = fixture({ requireApi: () => ({ getJson: async () => { requests++; return { recurrenceContinuity: token }; } }), global: { setTimeout() { throw new Error("unexpected timer"); } } });
    const pending = f.pollRecurrenceContinuity("t", options); await started;
    assert.equal(requests, 1); release(); assert.equal(await pending, token); assert.equal(requests, 1);
  });

  it("keeps attempt/delay floors, available stopping and primitive truthy tokens", async () => {
    let requests = 0;
    /** @type {number[]} */
    const delays = [];
    const f = fixture({ requireApi: () => ({ getJson: async () => { requests++; return { recurrenceContinuity: "opaque" }; } }), global: { setTimeout(/** @type {() => void} */ callback, /** @type {number} */ delay) { delays.push(delay); callback(); } } });
    assert.equal(await f.pollRecurrenceContinuity("t", { attempts: -2, delayMs: -1 }), "opaque"); assert.equal(requests, 1);
    assert.equal(await f.pollRecurrenceContinuity("t", { attempts: "2tail", delayMs: -1 }), "opaque"); assert.deepEqual(delays, [100]);
    const settled = { status: "available" }; f.requireApi = () => ({ getJson: async () => ({ recurrenceContinuity: settled }) });
    assert.equal(await f.pollRecurrenceContinuity("t", { onUpdate: 5 }), settled);
  });

  it("retains callback getter counts, original receiver and changed-getter failure", async () => {
    const f = fixture({ requireApi: () => ({ getJson: async () => ({ recurrenceContinuity: { status: "ended" } }) }) });
    let reads = 0; const options = { get onUpdate() { reads++; return reads === 1 ? () => {} : 7; } };
    await assert.rejects(f.pollRecurrenceContinuity("t", options), { name: "TypeError", message: "Task continuity onUpdate is not callable." }); assert.equal(reads, 2);
    const sentinel = new Error("callback rejected");
    await assert.rejects(f.pollRecurrenceContinuity("t", { onUpdate: async () => { throw sentinel; } }), (error) => error === sentinel);
  });

  it("preserves dependency-first failure, URL coercion and API rejection without retries", async () => {
    /** @type {string[]} */
    const log = [];
    const sentinel = new Error("request failed");
    const f = fixture({ requireApi: () => { log.push("api"); return { getJson: async () => { log.push("get"); throw sentinel; } }; } });
    await assert.rejects(f.pollRecurrenceContinuity("t", null), { name: "TypeError", message: "Task detail projection is unavailable." }); assert.deepEqual(log, ["api"]);
    log.length = 0; await assert.rejects(f.pollRecurrenceContinuity(Symbol("id")), { name: "TypeError" }); assert.deepEqual(log, ["api"]);
    log.length = 0;
    await assert.rejects(f.pollRecurrenceContinuity({ [Symbol.toPrimitive](/** @type {string} */ hint) { assert.equal(hint, "string"); log.push("id"); return "t"; } }), (error) => error === sentinel);
    assert.deepEqual(log, ["api", "id", "get"]);
  });
});
