import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/support-view-audit.js");

/**
 * The filter controls this page refills, and the refusal that replaced a property read.
 *
 * **All eleven diagnostics were parameter annotations**, and an annotation is proved by the
 * compiler rather than by a test - the wire half of this page was already validated, so naming
 * the readers changed nothing. What did gain behaviour is the narrowing that made those
 * annotations honest: the cached controls are now proved to be selects, and an absent one is
 * refused by name instead of throwing on a property access. Those are what these cases hold.
 *
 * `support-view-audit-contracts.test.mjs` already covers the response readers.
 */

const LIFTED = ["findAuditSelect", "requireAuditSelect", "replaceOptions", "formatOptions", "formatEnum"];

/**
 * @param {object} [options]
 * @param {string} [options.tagName] what the view rendered at the selector
 * @param {string} [options.selected] the control's current value
 */
function auditCase(options = {}) {
  const { tagName = "select", selected = "" } = options;
  const document = new FakeDocument();
  const rendered = tagName ? document.createElement(tagName) : null;
  if (rendered && selected) rendered.value = selected;

  // **The shared fake keeps a `value` its option list no longer contains; a real `select` does
  // not.** Replacing a select's options leaves the first one selected, so the restore below is
  // only observable if the fixture models that reset. Without it, a mutation that stops
  // restoring - or restores a value no longer offered - is invisible.
  if (rendered && tagName === "select") {
    const replaceChildren = rendered.replaceChildren.bind(rendered);
    /** @param {Parameters<typeof replaceChildren>} nodes */
    rendered.replaceChildren = (...nodes) => {
      const result = replaceChildren(...nodes);
      rendered.value = rendered.children[0]?.value ?? "";
      return result;
    };
  }

  const sandbox = vm.createContext({
    ...fakeDomConstructors(),
    document: {
      /** @param {string} tag */
      createElement: (tag) => document.createElement(tag),
      querySelector: () => rendered,
    },
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox), rendered };
}

/**
 * The control the fixture rendered, proved present for the cases that drive it.
 * @param {{ rendered: ReturnType<FakeDocument["createElement"]> | null }} testCase
 */
function control(testCase) {
  assert.ok(testCase.rendered, "the fixture must have rendered a control");
  return testCase.rendered;
}

describe("Support View audit filter acquisition", () => {
  it("answers the control when the view rendered a select", () => {
    const testCase = auditCase();
    assert.equal(testCase.api.findAuditSelect("[data-x]"), testCase.rendered);
  });

  /**
   * **The narrowing is what makes the declaration honest.** A matching element that is not a
   * select cannot hold options or answer a value, and it now takes the same absent-control path
   * a missing one already took.
   */
  it("answers nothing when the view rendered something that is not a select", () => {
    for (const tagName of ["div", "input", "textarea"]) {
      const testCase = auditCase({ tagName });
      assert.equal(testCase.api.findAuditSelect("[data-x]"), null, `tag: ${tagName}`);
    }
  });

  it("answers nothing when the view rendered no control at all", () => {
    const testCase = auditCase({ tagName: "" });
    assert.equal(testCase.api.findAuditSelect("[data-x]"), null);
  });
});

describe("Support View audit filter refusal", () => {
  it("hands back a control it was given", () => {
    const testCase = auditCase();
    assert.equal(testCase.api.requireAuditSelect(control(testCase)), control(testCase));
  });

  /**
   * **It throws rather than skipping, deliberately.** Reading `value` off an absent control
   * already threw here; answering with an early return would leave a filter permanently empty
   * or a query silently unfiltered, with nothing said.
   */
  it("refuses an absent control by name rather than skipping the work", () => {
    const { api } = auditCase();
    assert.throws(() => api.requireAuditSelect(null), {
      message: "The Support View audit page requires its filter controls.",
      name: "TypeError",
    });
  });
});

describe("Support View audit filter refill", () => {
  it("puts the all-values entry first and keeps the offered options in order", () => {
    const testCase = auditCase();
    testCase.api.replaceOptions(control(testCase), "All administrators", [
      { label: "Ada", value: "ada" },
      { label: "Grace", value: "grace" },
    ]);
    const options = control(testCase).children;
    assert.equal(options.length, 3);
    assert.equal(options[0].value, "");
    assert.equal(options[0].textContent, "All administrators");
    assert.deepEqual(options.slice(1).map((/** @type {{ value: string }} */ o) => o.value), ["ada", "grace"]);
  });

  /** An entry missing either half cannot be selected or labelled, so it is skipped. */
  it("skips an option carrying no value or no label", () => {
    const testCase = auditCase();
    testCase.api.replaceOptions(control(testCase), "All", [
      { label: "Ada", value: "ada" },
      { label: "", value: "blank-label" },
      { value: "no-label" },
      { label: "No value", value: "" },
    ]);
    assert.deepEqual(
      control(testCase).children.map((/** @type {{ value: string }} */ o) => o.value),
      ["", "ada"],
    );
  });

  it("restores the operator's selection when the refreshed list still offers it", () => {
    const testCase = auditCase({ selected: "grace" });
    testCase.api.replaceOptions(control(testCase), "All", [
      { label: "Ada", value: "ada" },
      { label: "Grace", value: "grace" },
    ]);
    assert.equal(control(testCase).value, "grace");
  });

  /**
   * The restore is conditional: a selection the refreshed list no longer offers is **not**
   * written back, and the control is left to the all-values entry a real `select` falls to.
   * Asserted as "the value was not reassigned and is not on offer", because the fake DOM keeps
   * a `value` its option list does not contain, where a browser would not.
   */
  it("does not restore a selection the refreshed list no longer offers", () => {
    const testCase = auditCase({ selected: "removed" });
    testCase.api.replaceOptions(control(testCase), "All", [{ label: "Ada", value: "ada" }]);
    const offered = control(testCase).children.map((/** @type {{ value: string }} */ o) => o.value);
    assert.deepEqual(offered, ["", "ada"]);
    assert.equal(control(testCase).value, "", "a stale selection must not be written back");
  });

  it("answers an empty control for a list it cannot read", () => {
    for (const value of [null, undefined, "options", 5, {}]) {
      const testCase = auditCase();
      assert.doesNotThrow(() => testCase.api.replaceOptions(control(testCase), "All", value), `value: ${JSON.stringify(value)}`);
      assert.equal(control(testCase).children.length, 1, `value: ${JSON.stringify(value)}`);
    }
  });

  it("refuses to refill a control the view did not render", () => {
    const { api } = auditCase();
    assert.throws(() => api.replaceOptions(null, "All", []), /requires its filter controls/);
  });
});

describe("Support View audit labels", () => {
  it("derives a readable label from a filter value that carries none", () => {
    const { api } = auditCase();
    assert.deepEqual(
      JSON.parse(JSON.stringify(api.formatOptions([{ value: "action_attempt" }]))),
      [{ label: "Action Attempt", value: "action_attempt" }],
    );
  });

  it("prefers a label the route supplied", () => {
    const { api } = auditCase();
    assert.equal(api.formatOptions([{ label: "Entered", value: "entered" }])[0].label, "Entered");
  });

  it("splits every separator the audit vocabulary uses", () => {
    const { api } = auditCase();
    assert.equal(api.formatEnum("action_attempt"), "Action Attempt");
    assert.equal(api.formatEnum("support-view.entered"), "Support View Entered");
    assert.equal(api.formatEnum("a:b"), "A B");
  });

  /** An unreadable value is named rather than left blank, so a cell never renders empty. */
  it("names a value it cannot read rather than answering blank", () => {
    const { api } = auditCase();
    // Falsy values and separator-only strings both reduce to no parts. A non-empty object is
    // not in this set on purpose: it stringifies to something truthy and is rendered as such,
    // which is what the untyped read did.
    for (const value of [null, undefined, "", 0, false, "___", ".-:"]) {
      assert.equal(api.formatEnum(value), "None", `value: ${String(value)}`);
    }
  });
});

describe("support-view-audit.js shapes this page states rather than invents", () => {
  /** The readers name the published records the page already validates. */
  it("declares its readers from the published audit contracts", () => {
    assert.match(source, /@param \{readonly BrowserSupportViewAuditEvent\[\]\} events/);
    assert.match(source, /@param \{BrowserSupportViewAuditFilterOptions\} options/);
    assert.match(source, /@param \{readonly BrowserSupportViewAuditFilterValue\[\]\} options/);
  });

  it("narrows the cached controls where they are acquired", () => {
    assert.match(source, /return element instanceof HTMLSelectElement \? element : null;/);
    assert.match(source, /const actorSelect = findAuditSelect\(/);
  });

  /** The refusal throws; an early return would leave a filter silently empty. */
  it("refuses an absent control rather than skipping", () => {
    assert.match(source, /function requireAuditSelect\(select\) \{\n\s*if \(!select\) \{\n\s*throw new TypeError\(/);
    assert.doesNotMatch(source, /if \(!select\) \{\n\s*return;/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });

  /**
   * `0.33.33.38.3.5` extended the same shape to the rest of the page.
   *
   * **Each narrowing is checked against the element the view renders, not against the
   * binding's name.** `0.33.33.38.3.4` mistook a `textarea` for an `input` on the sibling page
   * and refused a real control; this is where that cannot repeat here.
   */
  it("narrows every remaining control to what the view actually renders", () => {
    const markup = createProjectTextReader().readText("views/protected/support-view-audit.html");
    assert.match(source, /function findAuditForm\(selector\) \{[\s\S]*element instanceof HTMLFormElement \? element : null;/);
    assert.match(source, /function findAuditInput\(selector\) \{[\s\S]*element instanceof HTMLInputElement \? element : null;/);
    assert.match(source, /function findAuditButton\(selector\) \{[\s\S]*element instanceof HTMLButtonElement \? element : null;/);

    for (const [selector, binding, finder, tag] of [
      ["filters", "filtersForm", "findAuditForm", "<form"],
      ["from", "fromInput", "findAuditInput", "<input"],
      ["to", "toInput", "findAuditInput", "<input"],
      ["reset", "resetButton", "findAuditButton", "<button"],
      ["export", "exportButton", "findAuditButton", "<button"],
      ["page-size", "pageSizeSelect", "findAuditSelect", "<select"],
      ["previous", "previousButton", "findAuditButton", "<button"],
      ["next", "nextButton", "findAuditButton", "<button"],
    ]) {
      assert.match(source, new RegExp(`const ${binding} = ${finder}\\("\\[data-support-view-audit-${selector}\\]"\\)`),
        `${binding} is narrowed by ${finder}`);
      assert.match(markup, new RegExp(`${tag}[^>]*data-support-view-audit-${selector}`),
        `the view renders data-support-view-audit-${selector} as ${tag}>, which is what ${finder} requires`);
    }
  });

  /**
   * **A second refusal, not a shared one.** `requireAuditSelect` is lifted by this suite and may
   * acquire no free variable, so the controls that are not selects get their own check rather
   * than both delegating to one.
   */
  it("refuses every remaining absent control at its use", () => {
    assert.match(source, /function requireAuditControl\(control, name\) \{\n\s*if \(!control\) \{\n\s*throw new TypeError\(`The Support View audit page requires its \$\{name\}\.`\)/);
    assert.ok((source.match(/requireAuditControl\(/g) || []).length >= 18,
      "every remaining required use goes through the check");
    assert.doesNotMatch(source, /const \w+ = requireAudit\w*\(document\.querySelector/,
      "no control is refused at its lookup, which would move the failure ahead of initialize()");
    assert.doesNotMatch(source, /tableBody\?\.|previousButton\?\.|nextButton\?\.|filtersForm\?\.|statusText\?\./,
      "nor read through an optional chain, which would make a required write a no-op");
  });
});
