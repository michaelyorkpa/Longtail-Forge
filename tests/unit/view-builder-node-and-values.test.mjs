import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/view-builder.js");

/**
 * The node test the element factory appends through, and the control reads the value collector
 * makes - the two places `0.33.33.39.12` had to say something the compiler could check.
 *
 * **`isNode` is the checkpoint's one executable change**, and it is here because the existing
 * doubles cannot see it. `typeof value === "object"` narrows to `object`, which carries no
 * members, so the read now passes through `"nodeType" in value`. Breaking that to
 * `Object.hasOwn(value, "nodeType")` **survives both suites that execute this file**: the fake
 * DOM assigns `nodeType` in its constructor, so it is an own property there, while a real DOM
 * node inherits it from `Node.prototype`. The first case below is written against a prototype
 * rather than an element for exactly that reason, and it fails on the own-key spelling.
 *
 * `collectFieldValues` is here because its seven control reads are now declared as optional
 * additions to `Element` - `checked`, `dataset`, `disabled`, `multiple`, `name`,
 * `selectedOptions`, `type` and `value`. The cases below are what each of those reads answers.
 */

const LIFTED = ["isNode", "appendChild", "appendChildren", "replaceElementChildren", "collectFieldValues"];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function builder() {
  const context = createFakeBrowserContext();
  const scope = vm.createContext({ document: context.document });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), scope);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, scope);
  // The payload is built inside the vm, and a record built there is never reference-equal to one
  // written here, so every collected result is rebuilt in this realm before it is compared.
  /** @param {unknown} target @param {unknown} [options] */
  const collect = (target, options) => plain(api.collectFieldValues(target, options));
  return { api, collect, document: context.document };
}

/**
 * A node that keeps `nodeType` where a real one keeps it: on the prototype.
 * @param {unknown} [nodeType]
 */
const inheritedNode = (nodeType = 1) => Object.create({ nodeType });

/**
 * @param {import("../../scripts/test-support/fake-dom.mjs").FakeDocument} document
 * @param {string} tag
 * @param {Record<string, unknown>} members
 */
function control(document, tag, members) {
  const node = document.createElement(tag);
  node.setAttribute("data-view-input", String(members.viewInput ?? ""));
  node.dataset.viewInput = String(members.viewInput ?? "");
  for (const [name, value] of Object.entries(members)) {
    if (name !== "viewInput") Reflect.set(node, name, value);
  }
  return node;
}

describe("The element factory's node test", () => {
  it("accepts a node that inherits nodeType, which is where a real one keeps it", () => {
    const { api } = builder();
    assert.equal(api.isNode(inheritedNode(1)), true, "an element node");
    assert.equal(api.isNode(inheritedNode(3)), true, "a text node");
    assert.equal(api.isNode(inheritedNode(11)), true, "a fragment");
  });

  it("accepts a node carrying nodeType as its own property too", () => {
    const { api, document } = builder();
    assert.equal(api.isNode(document.createElement("div")), true);
    assert.equal(api.isNode({ nodeType: 1 }), true);
  });

  it("refuses a nodeType that is not a number, however node-like the value looks", () => {
    const { api } = builder();
    assert.equal(api.isNode({ nodeType: "1" }), false);
    assert.equal(api.isNode(inheritedNode("1")), false, "including an inherited one");
    assert.equal(api.isNode({ nodeType: null }), false);
    assert.equal(api.isNode({ appendChild() {} }), false, "and a value carrying no nodeType at all");
  });

  it("refuses everything that is not an object", () => {
    const { api } = builder();
    for (const value of [null, undefined, "div", 0, 1, true, false]) {
      assert.equal(api.isNode(value), false, `value: ${JSON.stringify(value)}`);
    }
  });
});

describe("What the element factory appends", () => {
  it("appends a node as itself and anything else as its text", () => {
    const { api, document } = builder();
    const parent = document.createElement("div");
    const child = document.createElement("span");
    api.appendChild(parent, child);
    api.appendChild(parent, "plain text");
    assert.equal(parent.children[0], child, "the node is appended by identity");
    assert.equal(parent.children[1].nodeType, 3, "and the string becomes a text node");
    assert.equal(parent.children[1].textContent, "plain text");
  });

  it("appends a number and refuses only the three values it names", () => {
    const { api, document } = builder();
    const parent = document.createElement("div");
    for (const value of [null, undefined, false]) api.appendChild(parent, value);
    assert.equal(parent.children.length, 0, "null, undefined and false are skipped");
    api.appendChild(parent, 0);
    api.appendChild(parent, "");
    assert.equal(parent.children.length, 2, "but zero and the empty string are appended as text");
    assert.equal(parent.children[0].textContent, "0");
    assert.equal(parent.children[1].textContent, "");
  });

  it("flattens a nested list rather than stringifying it", () => {
    const { api, document } = builder();
    const parent = document.createElement("div");
    const deep = document.createElement("b");
    api.appendChild(parent, ["a", [deep, ["c"]]]);
    assert.equal(parent.children.length, 3);
    assert.equal(parent.children[0].textContent, "a");
    assert.equal(parent.children[1], deep);
    assert.equal(parent.children[2].textContent, "c");
  });

  it("answers the parent unchanged for an absent child list", () => {
    const { api, document } = builder();
    const parent = document.createElement("div");
    assert.equal(api.appendChildren(parent, null), parent);
    assert.equal(api.appendChildren(parent, undefined), parent);
    assert.equal(parent.children.length, 0);
    api.appendChildren(parent, "one");
    assert.equal(parent.children.length, 1, "and wraps a lone child rather than iterating its characters");
  });

  it("replaces children, dropping the three skipped values", () => {
    const { api, document } = builder();
    const parent = document.createElement("div");
    parent.appendChild(document.createElement("old"));
    const kept = document.createElement("new");
    api.replaceElementChildren(parent, [null, kept, false, undefined]);
    assert.equal(parent.children.length, 1);
    assert.equal(parent.children[0], kept);
  });
});

describe("The value collector's control reads", () => {
  it("answers nothing for a scope it cannot query", () => {
    const { collect } = builder();
    for (const value of [null, undefined, {}, "form", 7]) {
      assert.deepEqual(collect(value), {}, `value: ${JSON.stringify(value)}`);
    }
  });

  it("reads a text control by its value and a number control as a number", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "title", type: "text", value: "Report" }),
      control(document, "input", { viewInput: "estimate", type: "number", value: "3.5" }),
    );
    assert.deepEqual(collect(form), { title: "Report", estimate: 3.5 });
  });

  it("reads a checkbox as a boolean rather than as its value", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "done", type: "checkbox", value: "true", checked: true }),
      control(document, "input", { viewInput: "urgent", type: "checkbox", value: "true", checked: false }),
    );
    assert.deepEqual(collect(form), { done: true, urgent: false });
  });

  it("reads a multiple select as the list of its selected options", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    const select = control(document, "select", { viewInput: "tags", multiple: true, value: "a" });
    /** @type {[string, boolean][]} */
    const choices = [["a", true], ["skipped", false], ["b", true]];
    for (const [value, selected] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.selected = selected;
      select.appendChild(option);
    }
    form.appendChild(select);
    assert.deepEqual(collect(form), { tags: ["a", "b"] }, "only the selected options, in document order");

    const empty = control(document, "select", { viewInput: "none", multiple: true });
    const otherForm = document.createElement("form");
    otherForm.appendChild(empty);
    assert.deepEqual(collect(otherForm), { none: [] }, "and an absent list is empty rather than a throw");
  });

  it("takes the first checked radio of a group and asks the group only once", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "mode", type: "radio", value: "one", checked: false }),
      control(document, "input", { viewInput: "mode", type: "radio", value: "two", checked: true }),
      control(document, "input", { viewInput: "mode", type: "radio", value: "three", checked: true }),
    );
    assert.deepEqual(collect(form), { mode: "two" });
  });

  it("answers an empty string for a radio group with nothing checked", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "mode", type: "radio", value: "one", checked: false }),
      control(document, "input", { viewInput: "mode", type: "radio", value: "two", checked: false }),
    );
    assert.deepEqual(collect(form), { mode: "" });
  });

  it("skips a disabled control unless it is asked for one", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "title", type: "text", value: "Report" }),
      control(document, "input", { viewInput: "locked", type: "text", value: "Fixed", disabled: true }),
    );
    assert.deepEqual(collect(form), { title: "Report" });
    assert.deepEqual(collect(form, { includeDisabled: true }), { title: "Report", locked: "Fixed" });
  });

  it("skips a disabled radio unless it is asked for one, and keeps the group's order", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    form.append(
      control(document, "input", { viewInput: "mode", type: "radio", value: "one", checked: true, disabled: true }),
      control(document, "input", { viewInput: "mode", type: "radio", value: "two", checked: true }),
    );
    assert.deepEqual(collect(form), { mode: "two" });
    assert.deepEqual(collect(form, { includeDisabled: true }), { mode: "one" });
  });

  it("falls back to a control's name when it carries no dataset key, and skips one with neither", () => {
    const { collect, document } = builder();
    const form = document.createElement("form");
    const named = document.createElement("input");
    named.setAttribute("data-view-input", "");
    Reflect.set(named, "name", "fromName");
    Reflect.set(named, "type", "text");
    named.value = "Named";
    const anonymous = document.createElement("input");
    anonymous.setAttribute("data-view-input", "");
    Reflect.set(anonymous, "type", "text");
    anonymous.value = "Ignored";
    form.append(named, anonymous);
    assert.deepEqual(collect(form), { fromName: "Named" });
  });
});
