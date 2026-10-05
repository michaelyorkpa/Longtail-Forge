import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects dialog openers, and the two claims typing them makes.
 *
 * `0.33.33.43.38` typed the three remaining dialog openers. Almost all of it is annotation. What
 * annotation cannot settle is:
 *
 * 1. **`fieldSelect` narrows by checking, not by asserting.** `fieldControl` answers the published
 *    control union, which carries no `options`. The new reader proves the control is a select and
 *    throws otherwise. Its throw is not reachable from this page's own fields - the view builder
 *    maps a `select` field to a `select` control unconditionally - which is why it is not a
 *    behaviour change; these cases show it really checks.
 * 2. **`cancel` is called with exactly two shapes.** The host contract now says a cancellation
 *    carries `recordId` only when the dialog was editing a record. That is a claim about every call
 *    site, so the call sites are inventoried rather than trusted.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

function liftFieldReaders() {
  const document = new FakeDocument();
  const sandbox = vm.createContext({ ...fakeDomConstructors() });
  for (const name of ["fieldControl", "fieldSelect"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return { document, ...vm.runInContext("({ fieldControl, fieldSelect })", sandbox) };
}

/** A rendered field whose control is the given element, or none. @param {unknown} control */
function fieldWith(control) {
  return { viewParts: { control } };
}

describe("fieldSelect checks the control rather than asserting it", () => {
  it("answers the select itself when the field rendered one", () => {
    const { document, fieldSelect } = liftFieldReaders();
    const select = document.createElement("select");

    assert.equal(fieldSelect(fieldWith(select)), select, "by identity");
  });

  it("refuses a control that is not a select", () => {
    const { document, fieldSelect } = liftFieldReaders();

    for (const tag of ["input", "textarea", "div"]) {
      assert.throws(() => fieldSelect(fieldWith(document.createElement(tag))),
        { message: "Client/Project select fields require a rendered select." }, tag);
    }
  });

  it("fails the way fieldControl fails when there is no control at all", () => {
    const { fieldSelect, fieldControl } = liftFieldReaders();

    for (const control of [null, undefined]) {
      const expected = { message: "Client/Project fields require a rendered control." };
      assert.throws(() => fieldControl(fieldWith(control)), expected);
      assert.throws(() => fieldSelect(fieldWith(control)), expected, "delegating rather than restating");
    }
  });

  it("is used for the one field this page reads options from", () => {
    assert.match(source, /const parentSelect = fieldSelect\(parentField\);/);
    assert.match(source, /\[\.\.\.parentSelect\.options\]/, "which is the read that needed a select");
  });

  it("rests on the view builder rendering a select for a select field", () => {
    // Why the throw is unreachable here. If the builder ever stops doing this, the comment on
    // `fieldSelect` stops being true and this case is where that shows.
    const builder = createProjectTextReader().readText("public/js/shared/view-builder.js");

    assert.match(builder, /if \(options\.fieldType === "select" \|\| options\.fieldType === "multi-select"\) \{\r?\n\s+const control = createElement\("select",/);
  });
});

describe("A cancellation carries a record only when a record was being edited", () => {
  /** Every `cancel?.(...)` call's action and whether it names a record. */
  function cancellations() {
    return [...source.matchAll(/cancel\?\.\(\{ actionId: "([a-z.]+)"(, recordId: [a-z.]+)? \}\)/g)]
      .map((match) => ({ actionId: match[1], withRecord: Boolean(match[2]) }));
  }

  it("finds every call site, so none can be missed by the shapes below", () => {
    const calls = source.match(/cancel\?\.\(/g) || [];

    assert.equal(cancellations().length, calls.length, "every cancel call has one of the two known shapes");
    assert.ok(calls.length >= 8, `found ${calls.length}`);
  });

  it("names the record from the edit dialogs and never from the add dialogs", () => {
    for (const { actionId, withRecord } of cancellations()) {
      assert.equal(withRecord, actionId.endsWith(".edit"), `${actionId} ${withRecord ? "names" : "omits"} its record`);
    }
  });
});
