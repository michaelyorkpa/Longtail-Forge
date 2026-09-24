import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
class DetailsFixture {}
function fixture() {
  const scope = vm.createContext({ HTMLDetailsElement: DetailsFixture });
  for (const name of ["workbenchSourceField", "navigationContainsHref", "setWorkbenchDisclosureOpen", "updateDisclosureExpandedState"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}
it("walks opaque nested navigation in order, preserving strict identity and short circuiting", () => {
  const s = fixture(), href = {};
  /** @type {unknown[]} */ const calls = [];
  const child = Object.create({ get href() { assert.equal(this, child); calls.push("href"); return href; }, get items() { throw new Error("must short circuit"); } });
  const root = { get href() { calls.push("root"); return "other"; }, get items() { calls.push("items"); return [null, child]; } };
  assert.equal(s.navigationContainsHref([root, { get href() { throw new Error("after match"); } }], href), true);
  assert.deepEqual(calls, ["root", "items", "href"]);
  assert.equal(s.navigationContainsHref([{ href: 7 }], "7"), false);
  assert.equal(s.navigationContainsHref([null], undefined), true);
  for (const value of [null, undefined, 7, "calendar.html", {}]) assert.equal(s.navigationContainsHref(value, "calendar.html"), false);
});
it("keeps primitive getter receivers, sparse arrays, and recursive getter failures", () => {
  const s = fixture();
  vm.runInContext(`
    globalThis.receivers = [];
    Object.defineProperty(Number.prototype, "href", { get() { "use strict"; receivers.push(this); return "calendar.html"; } });
  `, s);
  assert.equal(s.navigationContainsHref([7], "calendar.html"), true);
  assert.deepEqual(Array.from(s.receivers), [7]);
  assert.equal(s.navigationContainsHref(new Array(2), undefined), false);
  const failure = new Error("nested getter");
  assert.throws(() => s.navigationContainsHref([{ href: "no", get items() { throw failure; } }], "yes"), e => e === failure);
});
it("writes Boolean disclosure state before updating its accessible state with the same recipient", () => {
  const s = fixture();
  /** @type {unknown[]} */ const calls = [];
  let open = false;
  const summary = { setAttribute: (/** @type {unknown[]} */ ...args) => calls.push(args) };
  const details = {
    dataset: {},
    get open() { calls.push("read"); return open; },
    set open(/** @type {boolean} */ value) { assert.equal(this, details); calls.push(["write", value]); open = value; },
    querySelector(/** @type {string} */ selector) { assert.equal(this, details); calls.push(selector); return summary; },
  };
  Object.setPrototypeOf(details, DetailsFixture.prototype);
  for (const value of [false, 0, "", null, undefined, {}, "false", Symbol("open")]) {
    calls.length = 0;
    s.setWorkbenchDisclosureOpen(details, value);
    assert.deepEqual(calls, [["write", Boolean(value)], "summary", "read", ["aria-expanded", value ? "true" : "false"]]);
    assert.equal(Reflect.get(details.dataset, "workbenchExpanded"), value ? "true" : "false");
  }
  s.setWorkbenchDisclosureOpen(null, true);
});
it("preserves sloppy failed writes and setter exceptions without moving later reads", () => {
  const s = fixture();
  let queried = 0;
  const readonly = Object.defineProperty({ querySelector() { queried++; return null; } }, "open", { value: false });
  Object.setPrototypeOf(readonly, DetailsFixture.prototype);
  s.setWorkbenchDisclosureOpen(readonly, true);
  assert.equal(Reflect.get(readonly, "open"), false); assert.equal(queried, 1);
  const failure = new Error("setter");
  const broken = { set open(/** @type {unknown} */ value) { throw failure; }, querySelector() { throw new Error("too late"); } };
  assert.throws(() => s.setWorkbenchDisclosureOpen(broken, true), e => e === failure);
});

it("ignores non-details disclosure recipients and preserves absent native summaries", () => {
  const s = fixture();
  for (const value of [null, undefined, { querySelector() { assert.fail("wrong kind queried"); } }]) s.updateDisclosureExpandedState(value);
  const details = Object.assign(new DetailsFixture(), { querySelector: () => null, get open() { return false; } });
  s.updateDisclosureExpandedState(details);
});
it("keeps disclosure event recipients and timer keyboard activation semantics", () => {
  const s = fixture();
  for (const name of ["handleDisclosureToggle", "markTimerSectionUserToggle"]) vm.runInContext(extractFunctionBlock(source, name), s);
  const recipient = {};
  s.updateDisclosureExpandedState = (/** @type {unknown} */ value) => assert.equal(value, recipient);
  s.handleDisclosureToggle({ currentTarget: recipient });
  for (const key of ["Enter", " ", "Spacebar", "Escape", "", undefined, null, 7, {}, Symbol("key")]) {
    s.timerSectionUserToggled = false;
    let reads = 0;
    s.markTimerSectionUserToggle({ type: "keydown", get key() { reads++; return key; } });
    assert.equal(s.timerSectionUserToggled, key === "Enter" || key === " " || key === "Spacebar");
    assert.equal(reads, 1);
  }
  s.timerSectionUserToggled = false;
  s.markTimerSectionUserToggle({ type: "click", get key() { return assert.fail("click must not read key"); } });
  assert.equal(s.timerSectionUserToggled, true);
  const failure = new Error("keyboard getter");
  assert.throws(() => s.markTimerSectionUserToggle({ type: "keydown", get key() { throw failure; } }), error => error === failure);
});
