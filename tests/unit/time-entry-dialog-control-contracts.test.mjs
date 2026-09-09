import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Time Entry Dialog's control record, typed by `0.33.33.44.2`.
 *
 * **A state boundary that happens to be built from DOM queries.** `fields` was declared `{}`, so
 * every one of the eighteen controls read off it reported a missing property - 110 of the file's
 * 203 diagnostics. Those are record-shape errors on a page-local slot, not query nullability,
 * which is why closing them moved the `state` family by 112 and `dom` by only 2.
 *
 * **`ensureDialog` is the single writer, and it renders the markup itself when the page has
 * none.** A control still missing after that is a markup-contract error, not an absent optional
 * section - and this module already dereferenced each one unguarded immediately afterwards. So
 * every control is required, checked where the dereference already was, and the record is
 * declared complete rather than asserted from an empty object.
 */

const page = readFileSync(new URL("../../public/js/time-entry-dialog.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/**
 * The tag `dialogMarkup` renders for one control, read from the markup itself.
 * @param {string} dataset
 */
function renderedTag(dataset) {
  const markup = slice("  function dialogMarkup() {");
  // Matched on the complete attribute: `billable-control` sits on the <label> wrapping the
  // <select> that carries `billable`, on the same line, so a prefix search finds the wrong one.
  const at = markup.search(new RegExp(`data-time-entry-dialog-${dataset}(?=[\\s>])`));
  assert.notEqual(at, -1, dataset + " must appear in the rendered markup");
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open, at));
  assert.ok(tag, dataset + " must sit on an element");
  return tag[1];
}

/** dataset suffix -> the constructor the module checks it against. */
const CONTROLS = [
  ["billable", "HTMLSelectElement", "select"],
  ["billable-control", "HTMLElement", "label"],
  ["cancel", "HTMLButtonElement", "button"],
  ["client", "HTMLSelectElement", "select"],
  ["date", "HTMLInputElement", "input"],
  ["description", "HTMLTextAreaElement", "textarea"],
  ["duration", "HTMLElement", "fieldset"],
  ["duration-hours", "HTMLInputElement", "input"],
  ["duration-minutes", "HTMLInputElement", "input"],
  ["duration-seconds", "HTMLInputElement", "input"],
  ["end-time", "HTMLInputElement", "input"],
  ["heading", "HTMLElement", "h2"],
  ["invoice-status", "HTMLSelectElement", "select"],
  ["project", "HTMLSelectElement", "select"],
  ["save", "HTMLButtonElement", "button"],
  ["start-time", "HTMLInputElement", "input"],
  ["status", "HTMLElement", "p"],
  ["tags", "HTMLElement", "div"],
];

describe("each control is checked against the tag this module itself renders", () => {
  it("matches the markup for every one of the eighteen", () => {
    for (const [dataset, , tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag,
        `data-time-entry-dialog-${dataset} is rendered as <${tag}>`);
    }
  });

  it("checks each against the constructor that tag produces", () => {
    const body = slice("  function ensureDialog() {");
    for (const [dataset, constructor] of CONTROLS) {
      assert.ok(
        body.includes(`"[data-time-entry-dialog-${dataset}]", ${constructor},`),
        `${dataset} must be checked against ${constructor}`,
      );
    }
  });

  it("never claims a subtype narrower than the markup guarantees", () => {
    // The five containers this module only shows, hides or writes text into stay `HTMLElement`
    // rather than being narrowed to the exact tag, because nothing reads a tag-specific member.
    for (const [dataset] of CONTROLS.filter(([, c]) => c === "HTMLElement")) {
      const uses = [...page.matchAll(new RegExp(`fields\\.${dataset.replace(/-(\\w)/g, (_, c) => c.toUpperCase())}\\.(\\w+)`, "g"))]
        .map((entry) => entry[1]);
      for (const use of uses) {
        assert.ok(["hidden", "textContent", "replaceChildren", "appendChild", "append", "classList", "dataset"].includes(use),
          `${dataset} reads only container members, not ${use}`);
      }
    }
  });

  it("narrows by a runtime check with the constructor passed as a value", () => {
    const body = slice("  function requireDialogControl(scope, selector, constructor, name) {");
    assert.match(body, /if \(!\(node instanceof constructor\)\) \{/,
      "the check is instanceof against the passed constructor");
    assert.match(body, /throw new Error\(`The time entry dialog requires its \$\{name\}\.`\);/,
      "and a missing or mistyped control raises a named error");
    assert.ok(!/@type \{|\bas\s+HTML|createElement/.test(body),
      "no assertion, and no fabricated stand-in element");
  });
});

describe("the record is declared complete, not asserted from an empty object", () => {
  it("declares all eighteen controls at their subtypes", () => {
    const at = page.indexOf(" * @typedef {{");
    assert.notEqual(at, -1, "the record must be declared");
    const typedef = page.slice(at, page.indexOf("}} TimeEntryDialogFields", at));
    const declared = [...typedef.matchAll(/^\s+\*\s+(\w+): (HTML\w+),/gm)].map((entry) => [entry[1], entry[2]]);
    assert.equal(declared.length, 18, "eighteen controls are declared");
    for (const [dataset, constructor] of CONTROLS) {
      const name = dataset.replace(/-(\w)/g, (_, c) => c.toUpperCase());
      assert.deepEqual(declared.find(([key]) => key === name), [name, constructor],
        `${name} is declared as ${constructor}`);
    }
  });

  it("does not assert an empty object into the record's shape", () => {
    assert.ok(!/let fields = \{\}/.test(executable), "the empty-object initializer is gone");
    assert.ok(!/@type \{TimeEntryDialogFields\} \*\/ \(\{\}\)/.test(page),
      "and it was not replaced by an assertion of one");
    assert.match(page, /\/\*\* @type \{TimeEntryDialogFields\} \*\/\s*\n\s*let fields;/,
      "the slot is declared at the record type with no initializer");
  });

  it("types the dialog and its form at the subtypes they are used as", () => {
    assert.match(page, /@type \{HTMLDialogElement\}\s*\n\s*\*\/\s*\n\s*let dialog;/);
    assert.match(page, /@type \{HTMLFormElement\} \*\/\s*\n\s*let form;/);
    // Justified by use: the module opens, closes and reads a return value from the dialog, and
    // reads `dataset` and binds `submit` on the form.
    for (const use of ["dialog.showModal(", "dialog.close(", "dialog.returnValue", "form.dataset", 'form.addEventListener("submit"']) {
      assert.ok(executable.includes(use), use + " is why that subtype is required");
    }
  });
});

describe("ensureDialog remains the single writer, and still renders its own markup", () => {
  it("renders the markup when the page has none, before acquiring anything", () => {
    const body = slice("  function ensureDialog() {");
    const render = body.indexOf("wrapper.innerHTML = dialogMarkup();");
    const acquire = body.indexOf("dialog = requireDialogControl(");
    assert.notEqual(render, -1, "the module still renders its own markup");
    assert.notEqual(acquire, -1, "and then acquires the dialog");
    assert.ok(render < acquire, "in that order, so a page without the dialog still gets one");
    assert.match(body, /if \(!document\.querySelector\("\[data-time-entry-dialog\]"\)\) \{/,
      "and it still renders only when the dialog is absent");
  });

  it("is the only writer of all three slots", () => {
    for (const slot of ["dialog", "form", "fields"]) {
      const writes = [...executable.matchAll(new RegExp(`(^|[^.\\w])${slot} = `, "gm"))];
      assert.equal(writes.length, 1, slot + " is assigned exactly once, inside ensureDialog");
    }
    const body = slice("  function ensureDialog() {");
    for (const slot of ["dialog = ", "form = ", "fields = {"]) {
      assert.ok(body.includes(slot), slot + " is assigned inside ensureDialog");
    }
  });

  it("is reached before any control is read, from both entry points", () => {
    // This is what makes the complete record honest: nothing reads a control first.
    for (const opener of ["  function configure(options = {}) {", "  function openDialog({ entry = null, mode = \"add\", params = {} } = {}) {"]) {
      const body = slice(opener);
      const call = body.indexOf("ensureDialog();");
      assert.notEqual(call, -1, opener + " must call ensureDialog");
      const firstRead = body.search(/fields\.\w+/);
      if (firstRead !== -1) {
        assert.ok(call < firstRead, opener + " must call ensureDialog before reading a control");
      }
    }
    assert.equal((executable.match(/ensureDialog\(\);/g) || []).length, 2,
      "and those are the only two call sites");
  });
});

describe("dialog behaviour this child must not have moved", () => {
  it("keeps the dependent client to project population", () => {
    const body = slice("  function populateProjectOptions(projectId = \"\") {");
    assert.match(body, /const client = getClient\(fields\.client\.value\);/);
    assert.match(body, /fields\.project\.disabled = !client;/,
      "the project select is still disabled without a client");
    assert.match(body, /if \(!client\) \{\s*\n\s*return;\s*\n\s*\}/,
      "and still returns before listing projects");
    assert.match(body, /sortByName\(client\.projects\)\.forEach/, "ordering is unchanged");
  });

  it("keeps the workspace-scope default and its guard", () => {
    const body = slice("  function selectWorkspaceScopeClientIfNeeded() {");
    assert.match(body, /if \(workspaceShowsClientTools\(\)\) \{\s*\n\s*return;\s*\n\s*\}/,
      "workspaces that show client tools still choose their own client");
    assert.match(body, /const workspaceClient = clients\.find\(\(client\) => client\.isWorkspaceScope\);/);
    assert.match(body, /populateProjectOptions\(\);/,
      "and selecting it still repopulates the projects");
  });

  it("keeps the placeholder option on both selects", () => {
    assert.match(slice("  function populateClientOptions(placeholder) {"),
      /replaceChildren\(createOption\("", placeholder\)\)/);
    assert.match(slice("  function populateProjectOptions(projectId = \"\") {"),
      /replaceChildren\(createOption\("", "Select a project"\)\)/);
  });

  it("keeps the form binding guard so listeners bind once", () => {
    const body = slice("  function ensureDialog() {");
    assert.match(body, /if \(form\.dataset\.timeEntryDialogBound === "true"\) \{\s*\n\s*return;\s*\n\s*\}/,
      "a second ensureDialog must not rebind the listeners");
    assert.match(body, /form\.dataset\.timeEntryDialogBound = "true";/);
    assert.match(body, /form\.addEventListener\("submit", saveEntry\);/);
  });

  it("adds no cast, suppression or namespace surface", () => {
    const added = slice("  function requireDialogControl(scope, selector, constructor, name) {")
      + slice("  function ensureDialog() {");
    assert.ok(!/@ts-expect-error|@ts-ignore|:\s*any\b|\bas\s+[A-Z]/.test(added));
    assert.ok(!/LongtailForge\.\w+\s*=/.test(added), "the helper stays file-local");
    assert.equal((page.match(/function requireDialogControl\(/g) || []).length, 1);
  });
});
