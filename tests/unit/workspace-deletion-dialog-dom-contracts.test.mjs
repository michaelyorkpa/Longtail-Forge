import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Workspace Settings deletion-dialog control lookups, checked by `0.33.33.38.3.2`.
 *
 * The second `0.33.33.38.3` cohort, using the pattern `0.33.33.38.3.1` established: checked
 * lookups that narrow with `instanceof`, capture preserved at the original query point, and each
 * required control checked at the use point that already dereferenced it.
 *
 * **The dialog needs three subtypes the core form did not**: a real `<dialog>` for
 * `showModal`/`close`, `<button>` for `disabled`, and a plain `HTMLElement` for the nodes this
 * page only reads `hidden` or `textContent` from. That last helper also **retires this page's own
 * `asStatusElement`**, which tested `"hidden" in node` and then asserted `HTMLElement`.
 *
 * As in `0.33.33.38.3.1`, the double supplies **real constructors**, so `instanceof` is modelled
 * accurately rather than relaxed to suit a fake.
 */

const page = readFileSync(new URL("../../public/js/workspace-settings.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const host = readFileSync(new URL("../../public/js/shared/settings-host.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const viewBuilder = readFileSync(new URL("../../public/js/shared/view-builder.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** @param {string} name */
function captureLine(name) {
  const match = new RegExp("^  const " + name + " = find\\w+\\(\"[^\"]+\"\\);$", "m").exec(page);
  assert.ok(match, name + " must be captured through a checked lookup");
  return match[0];
}

// --- the DOM double, with real constructors ---------------------------------------------------

class FakeHTMLElement {
  constructor(tag = "p") {
    this.tag = tag;
    this.hidden = false;
    this.textContent = "";
  }
}
class FakeHTMLButtonElement extends FakeHTMLElement {
  constructor() {
    super("button");
    this.disabled = false;
    /** @type {string[]} */
    this.classes = [];
    this.classList = { toggle: (/** @type {string} */ name) => this.classes.push(name) };
  }
}
class FakeHTMLInputElement extends FakeHTMLElement {
  constructor() {
    super("input");
    this.value = "";
    this.required = false;
    this.placeholder = "";
  }

  closest() { return null; }
}
class FakeHTMLDialogElement extends FakeHTMLElement {
  constructor() {
    super("dialog");
    this.openCount = 0;
    this.closeCount = 0;
    this.title = new FakeHTMLElement("h2");
  }

  showModal() { this.openCount += 1; }
  close() { this.closeCount += 1; }
  querySelector() { return this.title; }
}
class FakeSVGElement {
  constructor() { this.tag = "svg"; }
}

const SELECTORS = {
  dialog: "[data-workspace-deletion-dialog]",
  explanation: "[data-workspace-deletion-dialog-explanation]",
  name: "[data-workspace-deletion-name]",
  acknowledgement: "[data-workspace-deletion-acknowledgement]",
  acknowledgementField: "[data-workspace-deletion-acknowledgement-field]",
  status: "[data-workspace-deletion-dialog-status]",
  open: "[data-open-workspace-deletion]",
  openCancel: "[data-open-workspace-deletion-cancel]",
  close: "[data-close-workspace-deletion]",
  confirm: "[data-confirm-workspace-deletion]",
};

/**
 * The dialog rendered exactly as `workspaceDeletionDialog()` builds it.
 *
 * Returns the document map **and** typed handles onto the same objects, so a test can read
 * `markup.name.required` without the map's value type widening every control to its base class.
 * The handles are the identical instances the map holds, which is what makes the identity
 * assertions below meaningful.
 */
function renderedMarkup() {
  const dialog = new FakeHTMLDialogElement();
  const explanation = new FakeHTMLElement("p");
  const name = new FakeHTMLInputElement();
  const acknowledgement = new FakeHTMLInputElement();
  const acknowledgementField = new FakeHTMLElement("label");
  const status = new FakeHTMLElement("p");
  const open = new FakeHTMLButtonElement();
  const openCancel = new FakeHTMLButtonElement();
  const close = new FakeHTMLButtonElement();
  const confirm = new FakeHTMLButtonElement();
  /** @type {Record<string, unknown>} */
  const nodes = {
    [SELECTORS.dialog]: dialog,
    [SELECTORS.explanation]: explanation,
    [SELECTORS.name]: name,
    [SELECTORS.acknowledgement]: acknowledgement,
    [SELECTORS.acknowledgementField]: acknowledgementField,
    [SELECTORS.status]: status,
    [SELECTORS.open]: open,
    [SELECTORS.openCancel]: openCancel,
    [SELECTORS.close]: close,
    [SELECTORS.confirm]: confirm,
  };
  return {
    nodes, dialog, explanation, name, acknowledgement, acknowledgementField, status,
    open, openCancel, close, confirm,
  };
}

/**
 * The shipped lookups, captures, guards and the dialog opener, run against a document double.
 * @param {Record<string, unknown>} nodes
 * @param {unknown} deletionState
 * @returns {{
 *   workspaceDeletionDialog: unknown,
 *   workspaceDeletionDialogExplanation: unknown,
 *   workspaceDeletionNameInput: unknown,
 *   workspaceDeletionAcknowledgementInput: unknown,
 *   workspaceDeletionAcknowledgementField: unknown,
 *   workspaceDeletionDialogStatus: unknown,
 *   openWorkspaceDeletionButton: unknown,
 *   openWorkspaceDeletionCancelButton: unknown,
 *   confirmWorkspaceDeletionButton: unknown,
 *   openWorkspaceDeletionDialog: (mode: string) => void,
 *   requireWorkspaceDeletionDialog: () => unknown,
 *   requireOpenWorkspaceDeletionButton: () => unknown,
 *   requireWorkspaceDeletionNameInput: () => unknown,
 *   requireConfirmWorkspaceDeletionButton: () => unknown,
 *   requireWorkspaceDeletionDialogStatus: () => unknown,
 * }}
 */
function shippedDialog(nodes, deletionState = { workspaceName: "Acme", backup: { current: true } }) {
  const document = {
    /** @param {string} selector */
    querySelector: (selector) => (selector in nodes ? nodes[selector] : null),
  };
  const built = new Function(
    "document", "HTMLElement", "HTMLButtonElement", "HTMLDialogElement", "HTMLInputElement",
    "workspaceDeletionState",
    [
      slice("  function findButton(selector) {"),
      slice("  function findDialog(selector) {"),
      slice("  function findElement(selector) {"),
      slice("  function findInput(selector) {"),
      captureLine("workspaceDeletionDialog"),
      captureLine("workspaceDeletionDialogExplanation"),
      captureLine("workspaceDeletionNameInput"),
      captureLine("workspaceDeletionAcknowledgementInput"),
      captureLine("workspaceDeletionAcknowledgementField"),
      captureLine("workspaceDeletionDialogStatus"),
      captureLine("openWorkspaceDeletionButton"),
      captureLine("openWorkspaceDeletionCancelButton"),
      captureLine("confirmWorkspaceDeletionButton"),
      'let workspaceDeletionDialogMode = "request";',
      slice("  function requireWorkspaceDeletionDialog() {"),
      slice("  function requireOpenWorkspaceDeletionButton() {"),
      slice("  function requireOpenWorkspaceDeletionCancelButton() {"),
      slice("  function requireConfirmWorkspaceDeletionButton() {"),
      slice("  function requireWorkspaceDeletionNameInput() {"),
      slice("  function requireWorkspaceDeletionAcknowledgementInput() {"),
      slice("  function requireWorkspaceDeletionAcknowledgementField() {"),
      slice("  function requireWorkspaceDeletionDialogExplanation() {"),
      slice("  function requireWorkspaceDeletionDialogStatus() {"),
      slice("  function openWorkspaceDeletionDialog(mode) {"),
      `return {
        workspaceDeletionDialog, workspaceDeletionDialogExplanation, workspaceDeletionNameInput,
        workspaceDeletionAcknowledgementInput, workspaceDeletionAcknowledgementField,
        workspaceDeletionDialogStatus, openWorkspaceDeletionButton,
        openWorkspaceDeletionCancelButton, confirmWorkspaceDeletionButton,
        openWorkspaceDeletionDialog, requireWorkspaceDeletionDialog,
        requireOpenWorkspaceDeletionButton, requireWorkspaceDeletionNameInput,
        requireConfirmWorkspaceDeletionButton, requireWorkspaceDeletionDialogStatus,
      };`,
    ].join("\n"),
  );
  return built(document, FakeHTMLElement, FakeHTMLButtonElement, FakeHTMLDialogElement,
    FakeHTMLInputElement, deletionState);
}

describe("each lookup answers the subtype the host actually renders", () => {
  it("matches the builder's own tags", () => {
    // Scoped to `createModal` itself: this file builds a `<dialog>` in more than one place, and
    // a whole-file match would be satisfied by the other one.
    const modalAt = viewBuilder.indexOf("  function createModal(options = {}) {");
    assert.notEqual(modalAt, -1, "createModal must exist");
    const createModal = viewBuilder.slice(modalAt, viewBuilder.indexOf("\n  }\n", modalAt));
    assert.match(createModal, /const dialog = createElement\("dialog", \{/,
      "createModal builds a real dialog element");
    assert.match(viewBuilder, /button = document\.createElement\("button"\);/,
      "createActionButton builds a real button");
    assert.match(host, /dialog\.dataset\.workspaceDeletionDialog = "";/,
      "and the deletion dialog is that modal");
    assert.match(host, /id: "workspaceDeletionName",\s*\n\s*label: "Type the workspace name",\s*\n\s*type: "text",/,
      "the name control is a text field, so an input");
    assert.match(host, /shellDataset: \{ workspaceDeletionAcknowledgementField: "" \}/,
      "and the acknowledgement field marker is the field shell, which this page only hides");
  });

  it("finds every control of a rendered dialog", () => {
    const dialog = shippedDialog(renderedMarkup().nodes);
    assert.ok(dialog.workspaceDeletionDialog instanceof FakeHTMLDialogElement);
    assert.ok(dialog.workspaceDeletionNameInput instanceof FakeHTMLInputElement);
    assert.ok(dialog.workspaceDeletionAcknowledgementInput instanceof FakeHTMLInputElement);
    assert.ok(dialog.confirmWorkspaceDeletionButton instanceof FakeHTMLButtonElement);
    assert.ok(dialog.openWorkspaceDeletionButton instanceof FakeHTMLButtonElement);
    assert.ok(dialog.workspaceDeletionDialogExplanation instanceof FakeHTMLElement);
    assert.ok(dialog.workspaceDeletionAcknowledgementField instanceof FakeHTMLElement);
  });

  it("refuses a present node of the wrong subtype rather than typing it", () => {
    const markup = renderedMarkup();
    const wrong = markup.nodes;
    wrong[SELECTORS.dialog] = new FakeHTMLElement("div");
    wrong[SELECTORS.name] = new FakeHTMLButtonElement();
    wrong[SELECTORS.confirm] = new FakeHTMLInputElement();
    wrong[SELECTORS.status] = new FakeSVGElement();
    const dialog = shippedDialog(wrong);
    assert.equal(dialog.workspaceDeletionDialog, null, "a div is not a dialog");
    assert.equal(dialog.workspaceDeletionNameInput, null, "a button is not an input");
    assert.equal(dialog.confirmWorkspaceDeletionButton, null, "an input is not a button");
    assert.equal(dialog.workspaceDeletionDialogStatus, null,
      "and a non-HTMLElement is not a status element");
  });

  it("narrows by runtime check, never by assertion", () => {
    for (const opener of ["  function findButton(selector) {", "  function findDialog(selector) {",
      "  function findElement(selector) {"]) {
      const body = slice(opener);
      assert.match(body, /node instanceof HTML\w*Element \? node : null;/, opener + " must use instanceof");
      assert.ok(!/\/\*\* @type \{/.test(body), "no assertion stands in for the check");
      assert.ok(!/createElement/.test(body), "and no detached element is manufactured");
    }
  });
});

describe("required controls fail at the use point that already dereferenced them", () => {
  it("raises named errors rather than null dereferences", () => {
    const dialog = shippedDialog({});
    assert.throws(() => dialog.requireWorkspaceDeletionDialog(), /requires its deletion dialog\./);
    assert.throws(() => dialog.requireOpenWorkspaceDeletionButton(), /requires its delete-workspace button\./);
    assert.throws(() => dialog.requireWorkspaceDeletionNameInput(), /requires its deletion name input\./);
    assert.throws(() => dialog.requireConfirmWorkspaceDeletionButton(), /requires its confirm-deletion button\./);
    assert.throws(() => dialog.requireWorkspaceDeletionDialogStatus(), /requires its deletion dialog status\./);
  });

  it("capture itself never throws, so unrelated initialization still runs", () => {
    const dialog = shippedDialog({});
    assert.equal(dialog.workspaceDeletionDialog, null);
    assert.equal(dialog.confirmWorkspaceDeletionButton, null);
  });

  it("keeps the listener bindings optional, exactly as they already were", () => {
    // This page treats these controls as optional to bind and required to render onto. That
    // inconsistency is preserved rather than harmonised: harmonising it would change behaviour.
    for (const binding of ["openWorkspaceDeletionButton", "openWorkspaceDeletionCancelButton",
      "closeWorkspaceDeletionButton", "confirmWorkspaceDeletionButton"]) {
      assert.match(page, new RegExp(binding + "\\?\\.addEventListener"),
        binding + " still binds optionally");
    }
    assert.match(page, /closeWorkspaceDeletionButton\?\.addEventListener\("click", \(\) => workspaceDeletionDialog\?\.close\(\)\);/,
      "and the close handler keeps its optional dialog read");
  });

  it("keeps the two summary readers' early returns", () => {
    assert.match(page, /if \(!workspaceDeletionSummary\) return;/, "the summary stays optional");
    assert.match(page, /if \(!workspaceDeletionStatus\) return;/, "and so does the page status");
    assert.match(page, /if \(!workspaceDeletionDialog \|\| !workspaceDeletionState\) return;/,
      "and the dialog opener still declines when either is absent");
  });
});

describe("the request and cancel flows still behave", () => {
  it("opens in request mode with the deletion controls shown", () => {
    const markup = renderedMarkup();
    const dialog = shippedDialog(markup.nodes, { workspaceName: "Acme", backup: { current: true }, acknowledgementPhrase: "delete acme" });
    dialog.openWorkspaceDeletionDialog("request");
    assert.equal(markup.dialog.openCount, 1, "the dialog is opened");
    assert.equal(markup.dialog.title.textContent, "Delete Workspace");
    assert.equal(markup.name.required, true, "the workspace name is required to delete");
    assert.equal(markup.confirm.textContent, "Schedule Deletion");
    assert.match(String(markup.explanation.textContent), /Schedule Acme for deletion/);
  });

  it("opens in cancel mode with those requirements lifted", () => {
    const markup = renderedMarkup();
    const dialog = shippedDialog(markup.nodes, { workspaceName: "Acme", backup: { current: true } });
    dialog.openWorkspaceDeletionDialog("cancel");
    assert.equal(markup.dialog.title.textContent, "Cancel Workspace Deletion");
    assert.equal(markup.name.required, false, "no typed name is required to cancel");
    assert.equal(markup.acknowledgement.required, false);
    assert.equal(markup.acknowledgementField.hidden, true, "and the acknowledgement is hidden");
    assert.equal(markup.confirm.textContent, "Cancel Deletion");
    assert.match(String(markup.explanation.textContent), /Cancel the pending deletion of Acme/);
  });

  it("keeps the backup-dependent acknowledgement rule", () => {
    const withBackup = renderedMarkup();
    shippedDialog(withBackup.nodes, { workspaceName: "Acme", backup: { current: true } })
      .openWorkspaceDeletionDialog("request");
    assert.equal(withBackup.acknowledgementField.hidden, true,
      "a current backup hides the acknowledgement");
    assert.equal(withBackup.acknowledgement.required, false);

    const withoutBackup = renderedMarkup();
    shippedDialog(withoutBackup.nodes, { workspaceName: "Acme", backup: { current: false }, acknowledgementPhrase: "delete acme" })
      .openWorkspaceDeletionDialog("request");
    assert.equal(withoutBackup.acknowledgementField.hidden, false,
      "no current backup requires the acknowledgement");
    assert.equal(withoutBackup.acknowledgement.required, true);
    assert.equal(withoutBackup.acknowledgement.placeholder, "delete acme");
  });

  it("clears both inputs and the status every time it opens", () => {
    const markup = renderedMarkup();
    markup.name.value = "stale";
    markup.acknowledgement.value = "stale";
    markup.status.textContent = "stale";
    shippedDialog(markup.nodes).openWorkspaceDeletionDialog("request");
    assert.equal(markup.name.value, "");
    assert.equal(markup.acknowledgement.value, "");
    assert.equal(markup.status.textContent, "");
  });

  it("uses the node captured at evaluation after the document changes", () => {
    const markup = renderedMarkup();
    const original = markup.dialog;
    const dialog = shippedDialog(markup.nodes);
    // The *document* is what changes, not the handle: a later render replaces the node under the
    // same selector. Nothing re-queries, so the page still holds - and opens - the original.
    const replacement = new FakeHTMLDialogElement();
    markup.nodes[SELECTORS.dialog] = replacement;
    dialog.openWorkspaceDeletionDialog("request");
    assert.equal(original.openCount, 1, "the captured dialog is the one opened");
    assert.equal(replacement.openCount, 0, "not the node that replaced it in the document");
  });
});

describe("the page's weaker status helper is retired", () => {
  it("is gone, and its call sites use the checked lookup", () => {
    // Compared against executable code: this file's own documentation names the retired helper
    // and its test, and prose must not be able to fail - or satisfy - a claim about code.
    const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
    assert.ok(!/asStatusElement/.test(executable), "the property-presence helper is removed");
    assert.ok(!/"hidden" in node/.test(executable), "and so is its test");
    assert.match(page, /const workspaceSettingsStatus = findElement\("\[data-workspace-settings-status\]"\);/,
      "the page status uses the checked lookup");
    assert.match(page, /const workspaceBackupStatus = findElement\("\[data-workspace-backup-status\]"\);/,
      "and so does the backup status, which is not a deletion control");
  });

  it("keeps every status consumer's existing tolerance", () => {
    // The tolerance was never a page guard: `BrowserStatusMessage.set` declares
    // `HTMLElement | null | undefined` and documents an absent element as a no-op. `findElement`
    // answers exactly that type, so retiring the helper changed how the node is recognised, not
    // whether the page tolerates its absence.
    const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
      .replace(/\r\n/g, "\n");
    const at = contracts.indexOf("export interface BrowserStatusMessage {");
    assert.notEqual(at, -1, "the status contract must exist");
    const declared = contracts.slice(at, contracts.indexOf("\n}", at));
    assert.match(declared, /element: HTMLElement \| null \| undefined,/,
      "set still accepts an absent element");
    // The JSDoc sits above the opener the slice starts at, so this reads the doc block itself.
    const finderAt = page.indexOf("  function findElement(selector) {");
    assert.notEqual(finderAt, -1, "the checked lookup must exist");
    assert.match(page.slice(page.lastIndexOf("/**", finderAt), finderAt),
      /@returns \{HTMLElement \| null\}/,
      "and the checked lookup answers that same type");
    // The helper's two call sites tolerate absence in two different ways, and both survive.
    assert.match(page, /requireStatusMessage\(\)\.set\(workspaceSettingsStatus, /,
      "the page status is still handed to the null-tolerant writer");
    assert.match(page, /if \(!workspaceBackupStatus\) return;/,
      "and the backup status - not a deletion control - still guards with its own early return");
  });

  it("does not sweep the other five pages", () => {
    for (const script of ["calendar-settings", "files-settings", "module-settings",
      "notes-settings", "role-assignments"]) {
      const source = readFileSync(new URL(`../../public/js/${script}.js`, import.meta.url), "utf8");
      assert.match(source, /"hidden" in node/,
        script + " keeps its own helper; this cohort is one page");
    }
  });
});
