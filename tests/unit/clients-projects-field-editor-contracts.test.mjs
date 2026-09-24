import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeElement} FakeElement */
/** @typedef {{ element: FakeElement }} HostedEditor */

/**
 * The Clients/Projects field-editor builders, and the two claims their annotations make.
 *
 * `0.33.33.43.34` typed the four editor builders. Most of that is annotation, which the compiler
 * proves; what these cases aim at is the short list that annotation alone cannot settle:
 *
 * 1. **The hosted editors are real.** `createProjectTaskDefaultsEditor` takes a reminder-policy and
 *    a rounding editor, both defaulting to `null` - which inferred `never`, so the compiler treated
 *    every `?.element` read on them as unreachable. Deriving each from its builder is a claim that
 *    those branches run; these cases execute them.
 * 2. **The rate field's conversion was already happening.** The one executable change is
 *    `client.billing_rate ?? ""`, which is equivalent only because `normalizeBillingRate` answers
 *    `string | null` and never `undefined`. That precondition is pinned here, because it is what
 *    the equivalence rests on rather than anything the annotation says.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

const EDITOR_READERS = [
  "vocabularyHas",
  "parseJsonArray",
  "normalizeProjectTaskSortOrder",
  "normalizeProjectTaskDefaults",
  "createProjectTaskDefaultsEditor",
];

/**
 * One `const <name> = [...]` or `= {...}` declaration, lifted from the source rather than restated.
 * @param {string} name @param {string} close
 */
function declaration(name, close) {
  const at = source.indexOf(`  const ${name} = `);
  assert.notEqual(at, -1, `${name} is still declared`);

  return source.slice(at, source.indexOf(close, at) + close.length);
}

/**
 * The task-defaults editor and everything it reaches for.
 *
 * The page's own vocabularies and label maps are lifted rather than restated; only the surroundings
 * this builder does not own are supplied - a fake document, the option and action-button factories,
 * and the token formatter.
 */
function liftTaskDefaultsEditor() {
  const document = new FakeDocument();
  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    /** @param {unknown} value @param {unknown} text */
    createOption: (value, text) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = text === undefined ? "" : String(text);
      return option;
    },
    /** @param {string} label */
    createClientProjectActionButton: (label) => {
      const button = document.createElement("button");
      button.textContent = label;
      return button;
    },
    /** @param {unknown} value */
    formatToken: (value) => String(value || ""),
  });

  for (const name of ["taskDefaultStatuses", "taskDefaultPriorities", "taskDefaultAssigneeModes", "defaultProjectTaskSortOrder"]) {
    vm.runInContext(declaration(name, "];"), sandbox);
  }
  for (const name of ["projectTaskSortLabels", "projectTaskAssigneeModeLabels"]) {
    vm.runInContext(declaration(name, "\n  };"), sandbox);
  }
  for (const name of EDITOR_READERS) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return { document, ...vm.runInContext(`({ ${EDITOR_READERS.join(", ")} })`, sandbox) };
}

/**
 * One value read back across the realm boundary.
 *
 * The builder runs inside the VM, so its result and the array on it carry that realm's prototypes;
 * `deepEqual` compares those by reference and reports "same structure but not reference-equal".
 * Re-materialising through JSON is what makes the comparison about the values.
 * @param {unknown} value
 */
function lifted(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * The module fieldset the builder appends its hosted editors into.
 * @param {HostedEditor} editor
 * @returns {FakeElement}
 */
function moduleGroupOf(editor) {
  return editor.element.childNodes[1];
}

describe("The task-defaults editor hosts the editors it is handed", () => {
  it("adopts a reminder-policy editor's element", () => {
    const { document, createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();
    const reminderPolicyEditor = { element: document.createElement("fieldset") };
    const editor = createProjectTaskDefaultsEditor({}, { reminderPolicyEditor });

    assert.ok(moduleGroupOf(editor).childNodes.includes(reminderPolicyEditor.element),
      "the reminder-policy fieldset is in the module group");
  });

  it("adopts a rounding editor's element", () => {
    const { document, createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();
    const billingRoundingEditor = { element: document.createElement("fieldset") };
    const editor = createProjectTaskDefaultsEditor({}, { billingRoundingEditor });

    assert.ok(moduleGroupOf(editor).childNodes.includes(billingRoundingEditor.element),
      "the rounding fieldset is in the module group");
  });

  it("adopts both, after its own grid, in the order it was given them", () => {
    const { document, createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();
    const reminderPolicyEditor = { element: document.createElement("fieldset") };
    const billingRoundingEditor = { element: document.createElement("fieldset") };
    const children = moduleGroupOf(createProjectTaskDefaultsEditor({}, { reminderPolicyEditor, billingRoundingEditor })).childNodes;

    assert.equal(children.length, 4, "legend, grid, then the two hosted editors");
    assert.equal(children[2], reminderPolicyEditor.element);
    assert.equal(children[3], billingRoundingEditor.element);
  });

  it("hosts neither when it is given neither, and does not fail on the absence", () => {
    const { createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();

    assert.equal(moduleGroupOf(createProjectTaskDefaultsEditor({})).childNodes.length, 2);
    assert.equal(moduleGroupOf(createProjectTaskDefaultsEditor({}, {})).childNodes.length, 2);
    assert.equal(moduleGroupOf(createProjectTaskDefaultsEditor()).childNodes.length, 2);
  });

  it("skips an editor that carries no element rather than appending a blank", () => {
    // `?.element` is the guard, not `editor != null` - an editor without one contributes nothing.
    const { createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();
    const editor = createProjectTaskDefaultsEditor({}, { reminderPolicyEditor: /** @type {never} */ ({}) });

    assert.equal(moduleGroupOf(editor).childNodes.length, 2);
  });
});

describe("What the task-defaults editor reads back", () => {
  it("answers the normalised defaults when it was given none", () => {
    const { createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();

    assert.deepEqual(lifted(createProjectTaskDefaultsEditor({}).getValue()), {
      status: "open",
      priority: "normal",
      defaultAssigneeMode: "creator",
      sortOrder: ["due_date", "priority", "status"],
    });
  });

  it("answers what it was given, through the same vocabularies", () => {
    const { createProjectTaskDefaultsEditor } = liftTaskDefaultsEditor();
    const editor = createProjectTaskDefaultsEditor({
      status: "blocked",
      priority: "urgent",
      defaultAssigneeMode: "unassigned",
      sortOrder: ["status", "due_date"],
    });

    assert.deepEqual(lifted(editor.getValue()), {
      status: "blocked",
      priority: "urgent",
      defaultAssigneeMode: "unassigned",
      // The normaliser appends what a stored order leaves out, so the set is always whole.
      sortOrder: ["status", "due_date", "priority"],
    });
  });

  it("labels every sort row it can render, so the defensive fallback is not what is being read", () => {
    const { createProjectTaskDefaultsEditor, document } = liftTaskDefaultsEditor();
    const editor = createProjectTaskDefaultsEditor({});
    /** @type {FakeElement[]} */
    const rows = [];
    /** @param {FakeElement} node */
    const walk = (node) => {
      if (node?.dataset?.sortItem) rows.push(node);
      (node?.childNodes || []).forEach(walk);
    };
    walk(editor.element);
    assert.ok(document, "the fake document backed the render");

    assert.deepEqual(lifted(rows.map((row) => row.dataset.sortItem)), ["due_date", "priority", "status"]);
    assert.deepEqual(lifted(rows.map((row) => row.childNodes[0].textContent)), ["Due Date", "Priority", "Status"]);
  });
});

describe("The precondition the rate field's conversion rests on", () => {
  /** @returns {Record<string, Function>} */
  function rateReader() {
    const sandbox = vm.createContext({});
    vm.runInContext(extractFunctionBlock(source, "normalizeBillingRate"), sandbox);

    return vm.runInContext("({ normalizeBillingRate })", sandbox);
  }

  it("answers null, never undefined, for every value that carries no rate", () => {
    const { normalizeBillingRate } = rateReader();

    for (const value of [null, undefined, "", "   ", false, 0, Number.NaN, [], {}]) {
      const answer = normalizeBillingRate(value);

      // The distinction is the whole equivalence: assigning `null` to an input's `value` writes the
      // empty string, but assigning `undefined` writes the text "undefined". `?? ""` matches the
      // first and would have differed from the second, so this reader must never produce one.
      assert.notEqual(answer, undefined, `${JSON.stringify(String(value))} does not answer undefined`);
      if (answer !== null) assert.equal(typeof answer, "string");
    }

    assert.equal(normalizeBillingRate(""), null);
    assert.equal(normalizeBillingRate(undefined), null);
  });

  it("keeps a rate that is present, including zero", () => {
    const { normalizeBillingRate } = rateReader();

    assert.equal(normalizeBillingRate("125"), "125");
    assert.equal(normalizeBillingRate(" 125 "), "125");
    assert.equal(normalizeBillingRate(0), "0", "?? rather than || is what keeps a zero rate");
  });

  it("is what the rate field coalesces against", () => {
    assert.match(source, /billingRateInput\.value = client\.billing_rate \?\? "";/,
      "the assignment states the conversion the DOM was already performing");
  });
});
