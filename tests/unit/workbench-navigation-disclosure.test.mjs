import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
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
  s.setWorkbenchDisclosureOpen(readonly, true);
  assert.equal(Reflect.get(readonly, "open"), false); assert.equal(queried, 1);
  const failure = new Error("setter");
  const broken = { set open(/** @type {unknown} */ value) { throw failure; }, querySelector() { throw new Error("too late"); } };
  assert.throws(() => s.setWorkbenchDisclosureOpen(broken, true), e => e === failure);
});
