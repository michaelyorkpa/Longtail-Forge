import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
const writers = [...source.matchAll(/\n    context = (\{[\s\S]*?\n    \});/g)].map((match) => match[1]);
function fixture() {
  const sandbox = vm.createContext({ context: null, taskTimers: [], taskDialogApi: {}, ensureDialog() {}, populateFormOptions() {} });
  for (const name of ["defaultTaskOptions", "configure"]) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return sandbox;
}

describe("Task Dialog context writer facts before consumer reconciliation", () => {
  it("has nine configure defaults and a separate host-only override, not two equivalent defaults blocks", () => {
    assert.equal(writers.length, 2);
    const f = fixture();
    f.configure();
    assert.deepEqual(Object.keys(f.context), ["currentUserId", "hostContext", "onSaved", "onNotesChanged", "options", "setStatus", "tagOptions", "taskTimers", "tasks"]);
    f.context = null;
    f.hostContext = null;
    vm.runInContext(`context = ${writers[1]};`, f);
    assert.deepEqual(Object.keys(f.context), ["hostContext"]);
  });
  it("executes the real configure writer with unvalidated overrides and additional host keys", () => {
    const f = fixture();
    const callback = () => {};
    const extra = Symbol("host-key");
    const input = { currentUserId: 17, options: null, tasks: "opaque", tagOptions: false, hostContext: 4,
      onSaved: callback, onNotesChanged: callback, setStatus: callback, onAttachmentsChanged: callback,
      onAttachmentsRefreshed: callback, [extra]: "retained" };
    assert.equal(f.configure(input), f.taskDialogApi);
    for (const key of Reflect.ownKeys(input)) assert.equal(f.context[key], Reflect.get(input, key));
    assert.equal(f.context.onAttachmentsChanged, callback);
    // Producer-only fixture: rendering consumers are deliberately not claimed to accept these values.
    const before = f.context;
    f.configure({ currentUserId: undefined });
    assert.equal(f.context.currentUserId, undefined);
    assert.equal(f.context.onSaved, callback);
    assert.equal(f.context[extra], "retained");
    assert.notEqual(f.context, before);
  });
  it("preserves spread precedence, own-enumerable getter reads, symbols and prototype data keys", () => {
    const f = fixture();
    /** @type {string[]} */ const order = [];
    const previous = { get currentUserId() { order.push("previous"); return "prior"; }, retained: true };
    const input = Object.create({ inherited: "not spread" });
    Object.defineProperty(input, "currentUserId", { enumerable: true, get() { order.push("input"); return "last"; } });
    Object.defineProperty(input, "__proto__", { enumerable: true, value: { host: true } });
    f.context = previous;
    f.configure(input);
    assert.deepEqual(order, ["previous", "input"]);
    assert.equal(f.context.currentUserId, "last");
    assert.equal(f.context.retained, true);
    assert.equal(Object.hasOwn(f.context, "inherited"), false);
    assert.equal(Object.hasOwn(f.context, "__proto__"), true);
    assert.equal(f.context.__proto__, input.__proto__);
  });
  it("lifts the exact second writer and keeps its truthy host precedence without adding defaults", () => {
    const f = fixture();
    const statement = `context = ${writers[1]};`;
    f.hostContext = null;
    vm.runInContext(statement, f);
    assert.deepEqual(Object.keys(f.context), ["hostContext"]);
    const oldHost = { complete() {} };
    f.context = { hostContext: oldHost, extra: "preserved" };
    f.hostContext = false;
    vm.runInContext(statement, f);
    assert.equal(f.context.hostContext, oldHost);
    assert.equal(f.context.extra, "preserved");
    f.hostContext = "truthy unvalidated host";
    vm.runInContext(statement, f);
    assert.equal(f.context.hostContext, "truthy unvalidated host");
  });
});
