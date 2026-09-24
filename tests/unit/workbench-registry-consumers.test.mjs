import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
  for (const name of ["workbenchCardField", "workbenchCardPropertyKey", "workbenchSourceField", "workbenchSourceFields", "mergeWorkbenchSourceData", "loadWorkbenchSourceData", "workbenchRegistryCardsChanged", "refreshWorkbenchTimers", "renderRegisteredWorkbenchCards"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  vm.runInContext(`
    globalThis.calls = [];
    globalThis.state = { registry: {}, timers: [] };
    globalThis.workbenchCardDataLoaders = {};
    globalThis.workbenchCardRenderers = {};
    globalThis.HTMLElement = class {};
    globalThis.node = new HTMLElement();
    node.dataset = { workbenchRenderer: "probe" };
    globalThis.document = { querySelectorAll() { calls.push("query"); return [node]; } };
    globalThis.renderTimers = () => calls.push("render");
    globalThis.setStatus = (message) => calls.push(message);
    globalThis.requireErrors = () => ({ caughtMessage: error => error.message });
  `, scope);
  return scope;
}

it("compares opaque registries with optional boxing, one read per side and serialization order", () => {
  const s = fixture();
  vm.runInContext(`
    Object.defineProperty(Number.prototype, "workbenchCards", { get() { "use strict"; calls.push(this); return { toJSON() { calls.push("json"); return [7]; } }; } });
    globalThis.fresh = { get workbenchCards() { calls.push("fresh"); return [7]; } };
  `, s);
  assert.equal(s.workbenchRegistryCardsChanged(7, s.fresh), false);
  assert.equal(JSON.stringify(s.calls), '[7,"json","fresh"]');
  for (const value of [null, undefined, false, "", Symbol("cache")]) assert.equal(s.workbenchRegistryCardsChanged(value, {}), false);
  const failure = new Error("serialize");
  let read = false;
  assert.throws(() => s.workbenchRegistryCardsChanged({ workbenchCards: { toJSON() { throw failure; } } }, { get workbenchCards() { read = true; return []; } }), error => error === failure);
  assert.equal(read, false);
});

it("loads from the second getter answer and preserves a custom map receiver and returned iterable", async () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.card = { renderer: "probe", listRoute: "/probe" };
    globalThis.collection = { map(callback) {
      if (this !== collection) throw new Error("receiver");
      calls.push("map"); return new Set([callback(card)]);
    } };
    Object.defineProperty(collection.map, "call", { get() { throw new Error("do not read call"); } });
    let reads = 0;
    globalThis.registry = { get workbenchCards() { calls.push(++reads); return reads === 1 ? [] : collection; } };
    workbenchCardDataLoaders.probe = value => { if (value !== card) throw new Error("identity"); calls.push("load"); return { timers: [value] }; };
  `, s);
  const result = await s.loadWorkbenchSourceData(s.registry);
  assert.equal(result.timers[0], s.card);
  assert.equal(JSON.stringify(s.calls), '[1,2,"map","load"]');
  let reads = 0;
  await s.loadWorkbenchSourceData({ get workbenchCards() { reads++; return s.collection; } });
  assert.equal(reads, 1, "initial non-array still skips rather than dispatching its custom map");
});

it("retains changing-getter and native Promise.all failures without running a loader", async () => {
  const s = fixture();
  for (const second of [null, { map: 7 }, { map: () => 7 }]) {
    let reads = 0;
    await assert.rejects(s.loadWorkbenchSourceData({ get workbenchCards() { return ++reads === 1 ? [] : second; } }), { name: "TypeError" });
    assert.equal(reads, 2);
  }
  const failure = new Error("get map");
  let reads = 0;
  await assert.rejects(s.loadWorkbenchSourceData({ get workbenchCards() { return ++reads === 1 ? [] : { get map() { throw failure; } }; } }), error => error === failure);
});

it("refreshes from a custom find with raw card identity and keeps lookup failures outside the load catch", async () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.card = { renderer: "active-work-timers" };
    globalThis.collection = { find(callback) { if (this !== collection || !callback(card)) throw new Error("find contract"); calls.push("find"); return card; } };
    state.registry = { workbenchCards: collection };
    globalThis.timers = [];
    globalThis.loadTimerCardData = async value => { if (value !== card) throw new Error("identity"); calls.push("load"); return { timers }; };
  `, s);
  await s.refreshWorkbenchTimers();
  assert.equal(s.state.timers, s.timers);
  assert.equal(JSON.stringify(s.calls), '["find","load","render"]');
  s.calls.length = 0;
  const failure = new Error("lookup");
  s.collection.find = () => { throw failure; };
  await assert.rejects(s.refreshWorkbenchTimers(), error => error === failure);
  assert.equal(s.calls.length, 0);
  s.collection.find = () => s.card;
  s.loadTimerCardData = () => { throw failure; };
  await s.refreshWorkbenchTimers();
  assert.equal(JSON.stringify(s.calls), '["lookup"]');
  s.collection.find = 7;
  await assert.rejects(s.refreshWorkbenchTimers(), { name: "TypeError", message: "The Workbench timer card collection requires a callable find." });
});

it("renders duplicate-key order and raw contribution identity from a custom iterable map result", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.first = { renderer: "probe", value: 1 };
    globalThis.last = { renderer: "probe", value: 2 };
    globalThis.collection = { map(callback) {
      if (this !== collection) throw new Error("receiver");
      calls.push("map");
      return { *[Symbol.iterator]() { calls.push("iterate"); yield callback(first); yield callback(last); } };
    } };
    Object.defineProperty(collection.map, "call", { get() { throw new Error("do not read call"); } });
    state.registry = { workbenchCards: collection };
    workbenchCardRenderers.probe = value => { if (value !== last) throw new Error("last identity"); calls.push("renderer"); };
  `, s);
  s.renderRegisteredWorkbenchCards();
  assert.equal(s.node.hidden, false);
  assert.equal(JSON.stringify(s.calls), '["map","iterate","query","renderer"]');
});

it("lets native Map validate map results before querying DOM, including nullish empty results", () => {
  const s = fixture();
  for (const value of [7, [7]]) {
    s.state.registry = { workbenchCards: { map: () => value } };
    assert.throws(() => s.renderRegisteredWorkbenchCards(), { name: "TypeError" });
    assert.equal(s.calls.length, 0);
  }
  for (const value of [null, undefined]) {
    s.state.registry = { workbenchCards: { map: () => value } };
    s.renderRegisteredWorkbenchCards();
    assert.equal(s.node.hidden, true);
  }
  s.calls.length = 0;
  s.state.registry = { workbenchCards: { map: false } };
  assert.throws(() => s.renderRegisteredWorkbenchCards(), { name: "TypeError", message: "The Workbench rendered card collection requires a callable map." });
  assert.equal(s.calls.length, 0);
  s.state.registry = 7;
  s.renderRegisteredWorkbenchCards();
  assert.equal(s.node.hidden, true);
});
