import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({ state: { modules: {} } });
  const statuses = source.match(/const WORKBENCH_MODULE_STATUSES = Object\.freeze\([^;]+;/);
  assert.ok(statuses);
  vm.runInContext(statuses[0], scope);
  for (const name of ["normalizeModuleStateMap", "moduleEnabled", "enabledModuleIds", "workbenchSourceField", "isBootstrapRecord", "isWorkbenchModuleState", "readWorkbenchModuleStates"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  vm.runInContext(extractFunctionBlock(reader.readText("src/services/workbench.service.js"), "buildModuleStateMap"), scope);
  return scope;
}

it("consumes the real producer's enabled and disabled records without losing value identity", () => {
  const s = fixture();
  const produced = s.buildModuleStateMap([{ id: "tasks", name: "Tasks", status: "enabled" }, { id: "time-tracking", status: "disabled" }]);
  const read = s.readWorkbenchModuleStates(produced);
  assert.equal(read.tasks, produced.tasks);
  assert.equal(read["time-tracking"], produced["time-tracking"]);
  s.state.modules = read;
  assert.equal(s.moduleEnabled("tasks"), true);
  assert.equal(s.moduleEnabled("time-tracking"), false);
  assert.equal(JSON.stringify(s.enabledModuleIds()), '["tasks"]');
});

it("keeps the fallback's accepted objects by identity rather than substituting fresh validation", () => {
  const s = fixture();
  for (const value of [{ tasks: { enabled: true } }, Object.create(null), new Date(0), new Map(), Object(7)]) {
    assert.equal(s.normalizeModuleStateMap(value), value);
  }
  const malformedForFreshReader = { tasks: { enabled: true } };
  s.state.modules = s.normalizeModuleStateMap(malformedForFreshReader);
  assert.equal(s.state.modules, malformedForFreshReader);
  assert.equal(s.moduleEnabled("tasks"), true);
  assert.equal(JSON.stringify(s.readWorkbenchModuleStates(malformedForFreshReader)), "{}");
  for (const value of [undefined, null, false, 0, 7, "modules", Symbol("modules"), [], () => {}]) {
    assert.equal(JSON.stringify(s.normalizeModuleStateMap(value)), "{}");
  }
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  assert.throws(() => s.normalizeModuleStateMap(revoked.proxy), { name: "TypeError" });
});

it("preserves optional absence and skips computed-key conversion for a nullish map", () => {
  const s = fixture();
  const key = { [Symbol.toPrimitive]() { throw new Error("key conversion must be skipped"); } };
  for (const value of [undefined, null]) {
    s.state.modules = value;
    assert.equal(s.moduleEnabled(key), false);
    assert.equal(JSON.stringify(s.enabledModuleIds()), "[]");
  }
  for (const value of [undefined, null, {}, { enabled: 1 }, { enabled: "true" }, { enabled: false }]) {
    s.state.modules = { tasks: value };
    assert.equal(s.moduleEnabled("tasks"), false);
  }
});

it("retains inherited entries, symbol keys, primitive getter receivers and one state-slot read", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    Object.defineProperty(Number.prototype, "enabled", { get() { "use strict"; calls.push(this); return true; } });
    globalThis.modules = Object.create({ tasks: 7 });
    globalThis.symbol = Symbol("module"); modules[symbol] = { enabled: true };
    globalThis.state = { get modules() { calls.push("modules"); return modules; } };
  `, s);
  assert.equal(s.moduleEnabled("tasks"), true);
  assert.equal(JSON.stringify(s.calls), '["modules",7]');
  assert.equal(s.moduleEnabled(s.symbol), true);
  assert.equal(JSON.stringify(s.enabledModuleIds()), "[]", "enumeration still excludes inherited and symbol keys");
});

it("enumerates own entries in native order before reading enabled getters", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.calls = [];
    const entry = name => ({ get enabled() { calls.push("enabled:" + name); return true; } });
    const modules = Object.create({ inherited: entry("inherited") });
    for (const name of ["b", "10", "2", "a"]) Object.defineProperty(modules, name, {
      enumerable: true, get() { calls.push("value:" + name); return entry(name); }
    });
    state.modules = modules;
  `, s);
  assert.equal(JSON.stringify(s.enabledModuleIds()), '["2","10","b","a"]');
  assert.equal(JSON.stringify(s.calls), '["value:2","value:10","value:b","value:a","enabled:2","enabled:10","enabled:b","enabled:a"]');
});

it("preserves computed-key hints, getter receivers and thrown identity at the original read", () => {
  const s = fixture();
  /** @type {unknown[]} */ const calls = [];
  const entry = { get enabled() { assert.equal(this, entry); calls.push("enabled"); return true; } };
  const modules = { get tasks() { assert.equal(this, modules); calls.push("entry"); return entry; } };
  s.state.modules = modules;
  const key = { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(hint); return "tasks"; } };
  assert.equal(s.moduleEnabled(key), true);
  assert.deepEqual(calls, ["string", "entry", "enabled"]);
  const failure = new Error("module getter");
  s.state.modules = { get tasks() { throw failure; } };
  assert.throws(() => s.moduleEnabled("tasks"), error => error === failure);
  assert.throws(() => s.enabledModuleIds(), error => error === failure);
  s.state.modules = { tasks: { get enabled() { throw failure; } } };
  assert.throws(() => s.moduleEnabled("tasks"), error => error === failure);
  assert.throws(() => s.enabledModuleIds(), error => error === failure);
});
