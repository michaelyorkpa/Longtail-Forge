import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists element-handle lookups narrow, and what they refuse.
 *
 * `0.33.33.43.25` narrowed 25 module handles from `Element | null` to the subtypes their reads
 * already assume, using the checked-lookup shape `public/js/files.js` established on its way to
 * zero. That moved the `dom` family for the first time in this campaign.
 *
 * These cases fix the lookups' own behaviour. **They do not, and cannot, prove the claim that
 * makes the narrowing safe** - that the page really builds each handle as the subtype its lookup
 * demands. Only the real DOM settles that, and `tests/e2e/lists-element-handles.spec.mjs` does it
 * against the rendered page for all 25.
 */

const reader = createProjectTextReader();
const source = reader.readText("public/js/lists.js");
const checkedDomSource = reader.readText("public/js/shared/checked-dom.js");

/** Constructors standing in for the DOM's, so `instanceof` behaves as it does in a browser. */
class FakeElement {}
class FakeHTMLElement extends FakeElement {}
class FakeHTMLInputElement extends FakeHTMLElement {}
class FakeHTMLSelectElement extends FakeHTMLElement {}
class FakeHTMLTextAreaElement extends FakeHTMLElement {}
class FakeHTMLButtonElement extends FakeHTMLElement {}
class FakeHTMLFormElement extends FakeHTMLElement {}
class FakeHTMLDialogElement extends FakeHTMLElement {}
class FakeSVGElement extends FakeElement {}

/**
 * One lookup, lifted with a document that answers whatever the case supplies.
 *
 * Since `0.33.33.38.3.10` the lookups go through the shared checked-DOM contract, so the page's own
 * accessor is lifted beside them and the shipped `shared/checked-dom.js` runs in the sandbox - not a
 * stand-in, which could answer differently from what the page is delivered. `queries` counts every
 * query the lookup makes.
 * @param {string} name @param {unknown} answer
 */
function lookupCounting(name, answer) {
  const queries = { count: 0 };
  const sandbox = vm.createContext({
    window: {},
    document: { querySelector: () => { queries.count += 1; return answer; } },
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    HTMLInputElement: FakeHTMLInputElement,
    HTMLSelectElement: FakeHTMLSelectElement,
    HTMLTextAreaElement: FakeHTMLTextAreaElement,
    HTMLButtonElement: FakeHTMLButtonElement,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLDialogElement: FakeHTMLDialogElement,
  });
  vm.runInContext(checkedDomSource, sandbox, { filename: "checked-dom.js" });
  vm.runInContext(extractFunctionBlock(source, "requireCheckedDom"), sandbox);
  vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { find: vm.runInContext(name, sandbox), queries };
}

/** @param {string} name @param {unknown} answer */
function lookup(name, answer) {
  return lookupCounting(name, answer).find;
}

describe("The form-control lookup names the member, not the tag", () => {
  /**
   * The filters are a genuine mixture - the E2E proof records `[data-list-filter-needed]` as an
   * input and `[data-list-filter-client]` as a select - so a lookup per tag would have had to
   * guess. The union is exactly the four elements carrying `value` and `disabled`.
   */
  it("accepts every control that carries value and disabled", () => {
    for (const Control of [FakeHTMLInputElement, FakeHTMLSelectElement, FakeHTMLTextAreaElement, FakeHTMLButtonElement]) {
      const control = new Control();
      assert.equal(lookup("findListsFormControl", control)("[x]"), control, `${Control.name} is a form control`);
    }
  });

  it("refuses an element that carries neither", () => {
    assert.equal(lookup("findListsFormControl", new FakeHTMLElement())("[x]"), null);
    assert.equal(lookup("findListsFormControl", new FakeSVGElement())("[x]"), null);
  });

  it("answers null for a selector that matches nothing, as the query already did", () => {
    assert.equal(lookup("findListsFormControl", null)("[x]"), null);
  });
});

describe("The subtype lookups accept only their own subtype", () => {
  it("narrows selects, forms and dialogs to exactly what their callers read", () => {
    const select = new FakeHTMLSelectElement();
    const form = new FakeHTMLFormElement();
    const dialog = new FakeHTMLDialogElement();

    assert.equal(lookup("findListsSelect", select)("[x]"), select);
    assert.equal(lookup("findListsForm", form)("[x]"), form);
    assert.equal(lookup("findListsDialog", dialog)("[x]"), dialog);
  });

  it("refuses a sibling subtype rather than letting it through", () => {
    // A select is not a form and a form is not a dialog. Each lookup exists because one member -
    // `options`, `elements`, `showModal` - lives on exactly one of them.
    assert.equal(lookup("findListsSelect", new FakeHTMLInputElement())("[x]"), null);
    assert.equal(lookup("findListsForm", new FakeHTMLSelectElement())("[x]"), null);
    assert.equal(lookup("findListsDialog", new FakeHTMLFormElement())("[x]"), null);
  });

  it("accepts any HTML element for the lookup that only needs dataset", () => {
    const plain = new FakeHTMLElement();
    const input = new FakeHTMLInputElement();

    assert.equal(lookup("findListsHtmlElement", plain)("[x]"), plain);
    assert.equal(lookup("findListsHtmlElement", input)("[x]"), input, "subtypes are HTML elements too");
    assert.equal(lookup("findListsHtmlElement", new FakeSVGElement())("[x]"), null, "an SVG element carries no dataset the page uses");
  });

  it("answers null rather than throwing for nothing at all", () => {
    for (const name of ["findListsSelect", "findListsForm", "findListsDialog", "findListsHtmlElement"]) {
      assert.equal(lookup(name, null)("[x]"), null, `${name} tolerates an absent match`);
    }
  });
});

describe("What this narrowing is, and what it leaves standing", () => {
  it("narrows only, and refuses only by returning the absent value the callers already handle", () => {
    // Every lookup has exactly one shape: query, test, return the element or null. No throw, no
    // fallback element, no mutation - so a mismatch takes the path an absent control already took.
    // `0.33.33.38.3.10` moved the query into the shared contract, so "queries once" is now counted
    // at runtime rather than read off a spelling, over a match and over a mismatch.
    const names = ["findListsFormControl", "findListsSelect", "findListsForm", "findListsDialog", "findListsHtmlElement"];
    for (const name of names) {
      for (const answer of [new FakeHTMLSelectElement(), new FakeSVGElement(), null]) {
        const { find, queries } = lookupCounting(name, answer);
        const before = answer === null ? null : Object.keys(answer);
        find("[x]");
        assert.equal(queries.count, 1, `${name} queries once`);
        if (answer !== null) {
          assert.deepEqual(Object.keys(answer), before, `${name} does not mutate what it found`);
        }
      }
      const block = extractFunctionBlock(source, name);
      assert.match(block, /requireCheckedDom\(\)\.find\(document, selector, /, `${name} goes through the shared lookup`);
      assert.doesNotMatch(block, /throw |createElement\(|\.remove\(|element\.[A-Za-z]+ =/,
        `${name} neither throws, nor builds a stand-in, nor mutates what it found`);
    }
  });

  it("keeps the form-control union as a thin adapter over one shared query", () => {
    // The shared `find` takes one constructor. The union is kept by asking it for any element and
    // testing the same four subtypes here, rather than by chaining one query per subtype.
    const block = extractFunctionBlock(source, "findListsFormControl");
    assert.equal(block.split("requireCheckedDom().find(").length - 1, 1, "exactly one shared query");
    assert.match(block, /find\(document, selector, Element\)/, "for any element");
    for (const subtype of ["HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLButtonElement"]) {
      assert.match(block, new RegExp(`element instanceof ${subtype}`), `and the union still names ${subtype}`);
    }
  });

  it("discharged the option-writer deferral that 0.33.33.43.24 recorded", () => {
    const at = source.indexOf("function replaceOptions(");
    const block = source.slice(source.lastIndexOf("/**", at), at);
    assert.match(block, /@param \{HTMLSelectElement \| null\} \[select\]/,
      "the refill takes a select, because it reads `.options`");
    assert.match(source, /clientFilter = findListsSelect\(/, "and the handles it is given are narrowed to one");
  });

  it("leaves the project populator deferred on nullability rather than on the subtype", () => {
    // Discharged by deciding what an absent project control should do - a product question. A
    // guard here would turn today's throw into a silent skip.
    const at = source.indexOf("function populateProjectOptions(");
    const block = source.slice(source.lastIndexOf("/**", at), at);
    assert.doesNotMatch(block, /@param \{[^}]*\} select/, "the populator's select is annotated; re-decide this deferral");
    assert.match(source, /select\.value = projects\.some/, "it still writes the control's value unguarded");
  });

  it("leaves the option builder deferred on its own second gate, not on the handles", () => {
    // `element.value` requires text while one caller hands it `state.users`' `user_id`, which is
    // `unknown` because nothing validates the options payload.
    const at = source.indexOf("function option(");
    const block = source.slice(source.lastIndexOf("/**", at), at);
    assert.doesNotMatch(block, /@param \{[^}]*\} value/, "the option builder is annotated; re-decide this deferral");
    assert.match(source, /@type \{\{ user_id\?: unknown \}\[\]\}/, "and the users rows are still unproved");
  });
});
