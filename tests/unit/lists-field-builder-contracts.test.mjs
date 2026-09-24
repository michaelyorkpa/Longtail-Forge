import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists field builders take, and what their narrowings refuse.
 *
 * `0.33.33.43.26` typed the six builders that make or write a form field, and closed the two
 * `decorate*` twins that `0.33.33.43.20` deferred and `0.33.33.43.24` explained - their gate was
 * `Element` carrying no `dataset`, which the checked narrowing `0.33.33.43.25` established closes.
 *
 * Three narrowings and one coercion are executable, so each is proved here rather than asserted.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/** Constructors standing in for the DOM's, so `instanceof` behaves as it does in a browser. */
class FakeElement {
  constructor() {
    /** @type {Record<string, unknown>} */
    this.dataset = {};
    /** @type {Record<string, FakeElement | null>} */
    this.matches = {};
  }

  /** @param {string} selector */
  querySelector(selector) {
    return this.matches[selector] ?? null;
  }
}
class FakeHTMLElement extends FakeElement {}
class FakeHTMLInputElement extends FakeHTMLElement {
  /** @param {string} [type] */
  constructor(type = "text") {
    super();
    this.type = type;
    this.value = "before";
    this.checked = false;
  }
}
class FakeHTMLSelectElement extends FakeHTMLElement {
  constructor() {
    super();
    this.type = "select-one";
    this.value = "before";
    this.checked = false;
  }
}
class FakeHTMLTextAreaElement extends FakeHTMLElement {}

/** @param {string} name */
function lift(name) {
  const sandbox = vm.createContext({
    HTMLElement: FakeHTMLElement,
    HTMLInputElement: FakeHTMLInputElement,
    HTMLSelectElement: FakeHTMLSelectElement,
    HTMLTextAreaElement: FakeHTMLTextAreaElement,
  });
  vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(name, sandbox);
}

/**
 * A field wrapper holding one control, addressed the way the decorators address them.
 * @param {string} fieldName @param {FakeElement | null} control
 */
function surfaceWith(fieldName, control) {
  const wrapper = new FakeHTMLElement();
  wrapper.matches[`[data-view-input="${fieldName}"]`] = control;
  const surface = new FakeHTMLElement();
  surface.matches[`[data-view-field="${fieldName}"]`] = wrapper;
  return { surface, wrapper };
}

describe("The two decorators stamp this page's hooks onto contributed fields", () => {
  for (const name of ["decorateFilterControl", "decorateListEditorField"]) {
    it(`${name} stamps both the control and the wrapper`, () => {
      const decorate = lift(name);
      const control = new FakeHTMLInputElement();
      const { surface, wrapper } = surfaceWith("status", control);

      decorate(surface, "status", "listFilterStatus", "listBusinessControl");
      assert.equal(control.dataset.listFilterStatus, "");
      assert.equal(wrapper.dataset.listBusinessControl, "");
    });

    it(`${name} leaves the wrapper alone when no wrapper hook is asked for`, () => {
      const decorate = lift(name);
      const control = new FakeHTMLInputElement();
      const { surface, wrapper } = surfaceWith("status", control);

      decorate(surface, "status", "listFilterStatus");
      assert.equal(control.dataset.listFilterStatus, "");
      assert.deepEqual(Object.keys(wrapper.dataset), [], "the wrapper is untouched");
    });

    it(`${name} takes the absent path for a control that is not an HTML element`, () => {
      const decorate = lift(name);
      const control = new FakeElement();
      const { surface, wrapper } = surfaceWith("status", control);

      // The narrowing this checkpoint added. Both writes already sat behind a truthiness guard,
      // so a control the page cannot stamp takes the path an absent one already took - it does
      // not throw, and it does not stamp something that cannot carry the hook.
      assert.doesNotThrow(() => decorate(surface, "status", "listFilterStatus", "listBusinessControl"));
      assert.deepEqual(Object.keys(control.dataset), [], "nothing is stamped on it");
      assert.equal(wrapper.dataset.listBusinessControl, "", "and the wrapper is still stamped");
    });

    it(`${name} does nothing at all when the field is not on the surface`, () => {
      const decorate = lift(name);
      const surface = new FakeHTMLElement();

      assert.doesNotThrow(() => decorate(surface, "missing", "listFilterStatus", "listBusinessControl"));
    });
  }
});

describe("Writing one value into a form control", () => {
  /** @param {string} type */
  function formWith(type) {
    const control = type === "select" ? new FakeHTMLSelectElement() : new FakeHTMLInputElement(type);
    return {
      control,
      form: { elements: { namedItem: (/** @type {string} */ name) => (name === "field" ? control : null) } },
    };
  }

  it("writes text into a text control", () => {
    const setFormValue = lift("setFormValue");
    const { form, control } = formWith("text");

    setFormValue(form, "field", "written");
    assert.equal(control.value, "written");
  });

  it("checks a checkbox for true and for the string true, and for nothing else", () => {
    const setFormValue = lift("setFormValue");

    for (const [value, expected] of [[true, true], ["true", true], [false, false], ["false", false], ["", false], [1, false]]) {
      const { form, control } = formWith("checkbox");
      setFormValue(form, "field", value);
      assert.equal(control.checked, expected, `${JSON.stringify(value)} checks ${expected}`);
    }
  });

  /**
   * The one coercion this checkpoint made explicit. Assigning to `.value` already converted
   * through the IDL `DOMString`, which is `ToString`; the template performs the same conversion.
   * It is **not** `String()`, which special-cases a symbol into text where `ToString` throws.
   */
  it("converts every value the same way the assignment already did", () => {
    const setFormValue = lift("setFormValue");

    for (const [value, expected] of [
      [0, "0"], [42, "42"], [-1.5, "-1.5"], ["x", "x"], ["", ""],
      [null, ""], [undefined, ""], [true, "true"], [false, "false"],
      [Number.NaN, "NaN"], [[], ""], [[7], "7"], [{}, "[object Object]"],
    ]) {
      const { form, control } = formWith("text");
      setFormValue(form, "field", value);
      assert.equal(control.value, expected, `${JSON.stringify(String(value))} writes ${expected}`);
    }
  });

  it("refuses a symbol by throwing, exactly as the assignment did", () => {
    const setFormValue = lift("setFormValue");
    const { form } = formWith("text");

    // `String(symbol)` would have answered "Symbol(s)" and written it. `ToString` - what both the
    // template and the IDL assignment use - throws, so this spelling preserves the refusal.
    assert.throws(() => setFormValue(form, "field", Symbol("s")), (error) => String(error).startsWith("TypeError"));
  });

  it("writes nothing for a control it cannot find, or a form that is absent", () => {
    const setFormValue = lift("setFormValue");
    const { form, control } = formWith("text");

    assert.doesNotThrow(() => setFormValue(form, "other", "written"));
    assert.equal(control.value, "before");
    assert.doesNotThrow(() => setFormValue(null, "field", "written"));
    assert.doesNotThrow(() => setFormValue(undefined, "field", "written"));
  });
});

describe("The descriptor options reader accepts both forms a contributor may send", () => {
  it("passes a pair through untouched", () => {
    const optionsFromDescriptor = lift("optionsFromDescriptor");
    const pairs = optionsFromDescriptor({ options: [["a", "A"], ["b", "B"]] });

    assert.equal(pairs.length, 2);
    assert.deepEqual([...pairs[0]], ["a", "A"]);
  });

  it("flattens a record, taking the first spelling present", () => {
    const optionsFromDescriptor = lift("optionsFromDescriptor");
    const [byValue] = optionsFromDescriptor({ options: [{ value: "v", id: "i", label: "L", text: "T" }] });
    const [byId] = optionsFromDescriptor({ options: [{ id: "i", text: "T" }] });

    assert.deepEqual([...byValue], ["v", "L"], "value beats id, and label beats text");
    assert.deepEqual([...byId], ["i", "T"]);
  });

  it("falls back to the value for a record carrying no label at all", () => {
    const optionsFromDescriptor = lift("optionsFromDescriptor");
    const [pair] = optionsFromDescriptor({ options: [{ value: "only" }] });

    assert.deepEqual([...pair], ["only", "only"]);
  });

  it("keeps an empty-string value rather than falling past it", () => {
    const optionsFromDescriptor = lift("optionsFromDescriptor");
    const [pair] = optionsFromDescriptor({ options: [{ value: "", label: "Any" }] });

    // `??` rather than `||`, so the empty option - a real choice on every one of these selects -
    // survives instead of being replaced by the id.
    assert.deepEqual([...pair], ["", "Any"]);
  });

  it("answers nothing for a field offering no options", () => {
    const optionsFromDescriptor = lift("optionsFromDescriptor");

    assert.equal(optionsFromDescriptor().length, 0);
    assert.equal(optionsFromDescriptor({}).length, 0);
    assert.equal(optionsFromDescriptor({ options: [] }).length, 0);
  });
});
