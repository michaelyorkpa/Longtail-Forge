import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
const names = ["workbenchSourceField", "workbenchCardField", "workbenchCardPropertyKey", "renderRegisteredWorkbenchCards", "workbenchRegistryCardsChanged", "readCardState", "restoreCardState", "persistCardState", "handleWorkbenchCardToggle", "isTimerWorkbenchCard"];
class HtmlFixture {}
class DetailsFixture extends HtmlFixture {}
function fixture() {
  /** @type {unknown[]} */ const cards = [];
  /** @type {unknown[][]} */ const calls = [];
  let stored = "{}";
  const scope = vm.createContext({ HTMLDetailsElement: DetailsFixture, HTMLElement: HtmlFixture, state: { registry: { workbenchCards: [] } }, workbenchCardRenderers: {}, WORKBENCH_CARD_STATE_KEY: "lf_workbench_cards_v1", timerSectionUserToggled: false,
    document: { querySelectorAll: () => cards },
    window: { localStorage: { getItem: () => stored, setItem: (/** @type {string} */ key, /** @type {string} */ value) => { calls.push(["store", key, value]); stored = value; } } },
    updateDisclosureExpandedState: (/** @type {unknown} */ card) => calls.push(["expanded", card]),
    setWorkbenchDisclosureOpen: (/** @type {unknown} */ card, /** @type {unknown} */ value) => calls.push(["open", card, value]),
    syncTimerSectionOpenState: () => calls.push(["sync"]),
  });
  vm.runInContext(names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  return { scope, cards, calls, setStored: (/** @type {string} */ value) => { stored = value; }, readStored: () => stored };
}
it("keeps stored arrays and opaque values, and catches invalid JSON or storage access", () => {
  const f = fixture();
  for (const text of ['{"a":7}', '[false,"yes"]', '{}']) {
    f.setStored(text); assert.equal(JSON.stringify(f.scope.readCardState()), text);
  }
  for (const text of ['null','false','4','"text"','{']) {
    f.setStored(text); assert.equal(JSON.stringify(f.scope.readCardState()), '{}');
  }
  f.scope.window.localStorage.getItem = () => { throw new Error("denied"); };
  assert.equal(JSON.stringify(f.scope.readCardState()), '{}');
});
it("persists non-timer values in DOM order with the original open-read before key conversion", () => {
  const f = fixture();
  /** @type {string[]} */ const order = [];
  const key = { [Symbol.toPrimitive](/** @type {string} */ hint) { order.push(hint); return "card"; } };
  const card = { dataset: { workbenchCard: key }, get open() { order.push("open"); return 7; } };
  f.cards.push({ dataset: { workbenchCard: "active-work-timers" }, get open() { throw new Error("excluded"); } }, card, { dataset: {} });
  f.scope.persistCardState();
  assert.deepEqual(order, ["open", "string"]);
  assert.equal(f.readStored(), '{"card":7}');
  f.scope.window.localStorage.setItem = () => { throw new Error("write denied"); };
  assert.throws(() => f.scope.persistCardState(), /write denied/);
});
it("restores own keys only, preserves two coercions and the timer policy sync", () => {
  const f = fixture(); let reads = 0;
  const key = { [Symbol.toPrimitive]() { reads++; return "card"; } };
  const card = Object.assign(new DetailsFixture(), { dataset: { workbenchCard: key } });
  f.cards.push(card, { dataset: { workbenchCard: "toString" } }, { dataset: { workbenchCard: "active-work-timers" } });
  f.setStored('{"card":{"opaque":true},"active-work-timers":true}');
  f.scope.restoreCardState();
  assert.equal(reads, 2); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][1], card); assert.equal(JSON.stringify(f.calls[0][2]), '{"opaque":true}');
  assert.deepEqual(f.calls[1], ["sync"]);
});
it("retains symbols, inherited datasets, and required-read failure timing", () => {
  const f = fixture(), symbol = Symbol("card");
  assert.equal(f.scope.workbenchCardPropertyKey(symbol), symbol);
  assert.equal(f.scope.workbenchCardPropertyKey({ [Symbol.toPrimitive]: () => symbol }), symbol);
  assert.equal(f.scope.workbenchCardPropertyKey(undefined), "undefined");
  assert.equal(f.scope.isTimerWorkbenchCard(Object.create({ dataset: { workbenchCard: "active-work-timers" } })), true);
  assert.equal(f.scope.isTimerWorkbenchCard(null), false);
  f.cards.push({});
  assert.throws(() => f.scope.persistCardState(), /card value cannot be read/);
  assert.equal(f.calls.length, 0);
});
it("keeps registration identity, visibility-before-dispatch, receiver and inherited lookup", () => {
  const f = fixture(), contribution = { renderer: "registered" };
  const card = Object.assign(new HtmlFixture(), { dataset: { workbenchRenderer: "registered" }, hidden: true });
  f.cards.push(card, Object.assign(new HtmlFixture(), { dataset: { workbenchRenderer: "absent" }, hidden: false }));
  f.scope.state.registry.workbenchCards = [contribution];
  f.scope.workbenchCardRenderers = Object.create({ registered: function (/** @type {unknown} */ value) { assert.equal(this, undefined); assert.equal(value, contribution); assert.equal(card.hidden, false); } });
  f.scope.renderRegisteredWorkbenchCards();
  assert.equal(Reflect.get(Object(f.cards[1]), "hidden"), true);
  f.scope.workbenchCardRenderers.registered = 7;
  card.hidden = true;
  assert.throws(() => f.scope.renderRegisteredWorkbenchCards(), /renderer must be callable/);
  assert.equal(card.hidden, false);
});
it("keeps toggle ordering, trusted timer override, and non-timer persistence", () => {
  const f = fixture(), card = { dataset: { workbenchCard: "active-work-timers" } };
  f.scope.handleWorkbenchCardToggle({ currentTarget: card, isTrusted: false });
  assert.equal(f.scope.timerSectionUserToggled, false);
  f.scope.handleWorkbenchCardToggle({ currentTarget: card, isTrusted: true });
  assert.equal(f.scope.timerSectionUserToggled, true);
  assert.equal(f.calls.some(call => call[0] === "store"), false);
  f.scope.handleWorkbenchCardToggle({ currentTarget: null, isTrusted: false });
  assert.deepEqual(f.calls.slice(-2), [["expanded", null], ["store", "lf_workbench_cards_v1", "{}"]]);
});
it("compares registry card serialization without normalizing order or metadata", () => {
  const { scope: s } = fixture();
  assert.equal(s.workbenchRegistryCardsChanged(null, {}), false);
  assert.equal(s.workbenchRegistryCardsChanged({ workbenchCards: [{ id: "a" }, { id: "b" }] }, { workbenchCards: [{ id: "b" }, { id: "a" }] }), true);
});
it("matches the original assignment's getter and coercion trace", () => {
  const f = fixture();
  /** @type {string[]} */ const trace = [];
  const key = { [Symbol.toPrimitive](/** @type {string} */ hint) { trace.push(hint); return "card"; } };
  const card = { get dataset() { trace.push("dataset"); return { workbenchCard: key }; }, get open() { trace.push("open"); return true; } };
  // The original writer expression is the ordering oracle, rather than a test-built result.
  vm.runInNewContext("const stateByCard = {}; stateByCard[card.dataset.workbenchCard] = card.open;", { card });
  const original = trace.slice(); trace.length = 0;
  f.cards.push(card); f.scope.persistCardState();
  // isTimerWorkbenchCard performs one dataset read before the unchanged writer expression.
  assert.deepEqual(trace, ["dataset", ...original]);
});

it("skips a non-details restoration recipient without reading its saved value and still syncs timers", () => {
  const f = fixture(), card = { dataset: { workbenchCard: "other" } };
  f.cards.push(card);
  f.scope.readCardState = () => ({ get other() { throw new Error("must not read skipped value"); } });
  f.scope.restoreCardState();
  assert.deepEqual(f.calls, [["sync"]]);
});
