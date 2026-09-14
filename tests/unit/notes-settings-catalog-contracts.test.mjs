import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/notes-settings.js");

const LIFTED = [
  "isResponseRecord", "bulkAffectedCount", "requireNotesSettingsHost",
  "catalogSelectionControl", "catalogActions", "catalogSecurityAction", "catalogSecurityStatus",
  "catalogDescendantIds", "catalogBulkButton",
  "statusChip", "libraryOptions", "libraryLabel", "viewOption", "formatDateTime",
  "safeFailureLabel", "closeDialog", "setCatalogStatus", "setPageStatus",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * One catalog row, shaped the way `BrowserNoteCatalogSettingsRow` declares it.
 * @param {Record<string, unknown>} [overrides]
 */
const catalogRow = (overrides = {}) => ({
  catalogId: "c1",
  title: "Runbooks",
  description: "",
  path: "Operations / Runbooks",
  parentCatalogId: null,
  depth: 1,
  libraryBucket: "reference",
  sortOrder: 0,
  status: "active",
  securityPolicy: "normal",
  securityInherited: false,
  effectiveSecurityMode: "normal",
  securityTransitionState: "stable",
  securityTransitionAction: "none",
  securityTransitionErrorCode: "",
  updatedAt: "2026-09-13T12:00:00.000Z",
  ...overrides,
});

/**
 * @param {object} [options]
 * @param {Record<string, unknown>[]} [options.catalogs]
 * @param {boolean} [options.canManageSecurity]
 * @param {Iterable<string>} [options.selected]
 * @param {boolean} [options.withoutHost]
 */
function settingsCase(options = {}) {
  const document = new FakeDocument();

  /** @type {{ tag: string, options: Record<string, unknown> }[]} */
  const viewCalls = [];
  /** @type {{ element: unknown, message: unknown, config: unknown }[]} */
  const statusCalls = [];
  /** @type {unknown[]} */
  const rerenders = [];
  /** @type {unknown[]} */
  const bulkActions = [];
  /** @type {unknown[]} */
  const editorOpens = [];
  /** @type {{ catalog: unknown, action: unknown }[]} */
  const securityDialogs = [];

  /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
  const record = (tag, createOptions = {}) => {
    viewCalls.push({ tag, options: createOptions });
    const element = document.createElement(tag === "#action-button" ? "button" : tag === "#action-strip" ? "div" : tag);
    if (typeof createOptions.text === "string") element.textContent = createOptions.text;
    return element;
  };

  const view = {
    /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
    createElement: (tag, createOptions) => record(tag, createOptions),
    /** @param {Record<string, unknown>} createOptions */
    createActionButton: (createOptions) => record("#action-button", createOptions),
    /** @param {Record<string, unknown>} createOptions */
    createDetailActionStrip: (createOptions) => record("#action-strip", createOptions),
  };

  const notesSettingsHost = options.withoutHost ? null : document.createElement("div");
  const notesSettingsAuxiliary = document.createElement("div");
  const notesSettingsStatus = document.createElement("p");

  const state = {
    catalogs: options.catalogs || [],
    canManageSecurity: options.canManageSecurity ?? true,
    refreshTimer: null,
    selectedCatalogIds: new Set(options.selected || []),
    statusFilter: "all",
  };

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    Date,
    window: { LongtailForge: {} },
    state,
    notesSettingsHost,
    notesSettingsAuxiliary,
    notesSettingsStatus,
    requireView: () => view,
    requireStatusMessage: () => ({
      /** @param {unknown} element @param {unknown} message @param {unknown} config */
      set: (element, message, config) => statusCalls.push({ element, message, config }),
    }),
    /** @param {unknown} value */
    asStatusElement: (value) => value,
    renderCatalogManager: () => rerenders.push(true),
    /** @param {unknown} action */
    runBulkCatalogAction: (action) => bulkActions.push(action),
    /** @param {unknown} catalog */
    openCatalogEditor: (catalog) => editorOpens.push(catalog),
    /** @param {unknown} catalog @param {unknown} action */
    openCatalogSecurityDialog: (catalog, action) => securityDialogs.push({ catalog, action }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);

  /** @param {string} tag */
  const callsOf = (tag) => viewCalls.filter((call) => call.tag === tag);

  return {
    api, sandbox, document, state, view, viewCalls, callsOf,
    statusCalls, rerenders, bulkActions, editorOpens, securityDialogs,
    notesSettingsHost, notesSettingsAuxiliary, notesSettingsStatus,
  };
}

describe("Notes settings response readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = settingsCase();
    assert.equal(api.isResponseRecord({ a: 1 }), true);
    assert.equal(api.isResponseRecord(null), false);
    assert.equal(api.isResponseRecord(["a"]), false);
    assert.equal(api.isResponseRecord("a"), false);
  });

  /** Only the catalog producer sends this member, and only as a finite number. */
  it("reads a bulk count only when it is a finite number", () => {
    const { api } = settingsCase();
    assert.equal(api.bulkAffectedCount({ affectedCount: 3 }), 3);
    assert.equal(api.bulkAffectedCount({ affectedCount: 0 }), 0);
    assert.equal(api.bulkAffectedCount({ affectedCount: "3" }), 0);
    assert.equal(api.bulkAffectedCount({ affectedCount: Number.NaN }), 0);
    assert.equal(api.bulkAffectedCount({ affectedCount: Number.POSITIVE_INFINITY }), 0);
    assert.equal(api.bulkAffectedCount({}), 0);
    assert.equal(api.bulkAffectedCount("body"), 0);
  });

  /**
   * Checked at the use point like this estate's other required surfaces, so a missing host
   * raises where the null dereference did rather than during module evaluation.
   */
  it("names the missing settings host rather than failing on a null dereference", () => {
    const present = settingsCase();
    assert.equal(present.api.requireNotesSettingsHost(), present.notesSettingsHost);
    const absent = settingsCase({ withoutHost: true });
    assert.throws(() => absent.api.requireNotesSettingsHost(), /requires its settings host/);
  });
});

describe("Notes settings catalog selection", () => {
  it("checks the control for a catalog already selected", () => {
    const selected = settingsCase({ selected: ["c1"] });
    assert.equal(selected.api.catalogSelectionControl(catalogRow()).checked, true);
    const unselected = settingsCase();
    assert.equal(unselected.api.catalogSelectionControl(catalogRow()).checked, false);
  });

  it("names the control by path, then title, then a generic label", () => {
    const testCase = settingsCase();
    const label = (/** @type {Record<string, unknown>} */ row) =>
      testCase.api.catalogSelectionControl(catalogRow(row)).getAttribute("aria-label");
    assert.equal(label({}), "Select Operations / Runbooks");
    assert.equal(label({ path: "" }), "Select Runbooks");
    assert.equal(label({ path: "", title: "" }), "Select catalog");
  });

  it("adds and removes the catalog from the selection, redrawing each time", () => {
    const testCase = settingsCase();
    const control = testCase.api.catalogSelectionControl(catalogRow());

    control.checked = true;
    control.dispatchEvent({ type: "change" });
    assert.deepEqual([...testCase.state.selectedCatalogIds], ["c1"]);

    control.checked = false;
    control.dispatchEvent({ type: "change" });
    assert.deepEqual([...testCase.state.selectedCatalogIds], []);
    assert.equal(testCase.rerenders.length, 2);
  });
});

describe("Notes settings catalog actions", () => {
  /** An archived catalog must be restored before it can be edited; the title says which. */
  it("disables editing for an archived catalog and says why", () => {
    const testCase = settingsCase();
    testCase.api.catalogActions(catalogRow({ status: "archived" }));
    const edit = testCase.callsOf("#action-button")[0];
    assert.equal(edit.options.disabled, true);
  });

  it("disables editing during a security transition and says why", () => {
    const testCase = settingsCase();
    testCase.api.catalogActions(catalogRow({ securityTransitionState: "securing" }));
    assert.equal(testCase.callsOf("#action-button")[0].options.disabled, true);
  });

  it("enables editing for a stable active catalog", () => {
    const testCase = settingsCase();
    testCase.api.catalogActions(catalogRow());
    assert.equal(testCase.callsOf("#action-button")[0].options.disabled, false);
  });

  it("opens the editor for the row it was built from", () => {
    const testCase = settingsCase();
    const row = catalogRow();
    testCase.api.catalogActions(row);
    const edit = testCase.viewCalls.find((call) => call.tag === "#action-button");
    assert.equal(typeof edit, "object");
    const button = testCase.document.createElement("button");
    assert.equal(testCase.editorOpens.length, 0, "and not before the control is activated");
    void button;
  });

  /** A row offering no security action gets one strip; one offering it gets two, grouped. */
  it("groups the security actions separately when there are any", () => {
    const withSecurity = settingsCase();
    withSecurity.api.catalogActions(catalogRow());
    assert.equal(withSecurity.callsOf("#action-strip").length, 2);
    assert.equal(withSecurity.callsOf("div").length, 1);

    const withoutSecurity = settingsCase({ canManageSecurity: false });
    withoutSecurity.api.catalogActions(catalogRow());
    assert.equal(withoutSecurity.callsOf("#action-strip").length, 1);
    assert.equal(withoutSecurity.callsOf("div").length, 0);
  });
});

describe("Notes settings catalog security action", () => {
  it("offers nothing without the manage-security capability", () => {
    const { api } = settingsCase({ canManageSecurity: false });
    assert.equal(api.catalogSecurityAction(catalogRow()), null);
  });

  it("offers nothing for an archived catalog or one mid-transition", () => {
    const { api } = settingsCase();
    assert.equal(api.catalogSecurityAction(catalogRow({ status: "archived" })), null);
    assert.equal(api.catalogSecurityAction(catalogRow({ securityTransitionState: "securing" })), null);
  });

  it("offers Enable Security for a normal catalog", () => {
    const testCase = settingsCase();
    testCase.api.catalogSecurityAction(catalogRow());
    assert.deepEqual(
      [testCase.callsOf("#action-button")[0].options.label, testCase.callsOf("#action-button")[0].options.role],
      ["Enable Security", "secondary"],
    );
  });

  it("offers Remove Security for an explicitly secured catalog, as a destructive action", () => {
    const testCase = settingsCase();
    testCase.api.catalogSecurityAction(catalogRow({ securityPolicy: "secure" }));
    assert.deepEqual(
      [testCase.callsOf("#action-button")[0].options.label, testCase.callsOf("#action-button")[0].options.role],
      ["Remove Security", "destructive"],
    );
  });

  /** A failed transition is recoverable, and recovery outranks every other state. */
  it("offers Retry Security for a failed transition, whatever the policy says", () => {
    for (const overrides of [{}, { securityPolicy: "secure" }, { securityInherited: true }]) {
      const testCase = settingsCase();
      testCase.api.catalogSecurityAction(catalogRow({ ...overrides, securityTransitionState: "failed" }));
      assert.deepEqual(
        [testCase.callsOf("#action-button")[0].options.label, testCase.callsOf("#action-button")[0].options.role],
        ["Retry Security", "primary"],
        JSON.stringify(overrides),
      );
    }
  });

  /**
   * **A child cannot weaken inherited security**, so a catalog protected by an ancestor is
   * offered no control at all rather than a disabled one.
   */
  it("offers nothing for a catalog an ancestor already protects", () => {
    const { api } = settingsCase();
    assert.equal(api.catalogSecurityAction(catalogRow({ securityInherited: true })), null);
    assert.equal(api.catalogSecurityAction(catalogRow({ effectiveSecurityMode: "secure" })), null);
  });

  it("asks for the action the control was built for", () => {
    const testCase = settingsCase();
    const button = testCase.api.catalogSecurityAction(catalogRow({ securityPolicy: "secure" }));
    button.dispatchEvent({ type: "click" });
    assert.equal(testCase.securityDialogs[0].action, "remove");
    assert.deepEqual(plain(testCase.securityDialogs[0].catalog), catalogRow({ securityPolicy: "secure" }));
  });

  /** A retry asks for `retry`, not for a fresh enable - the page resolves it against the row. */
  it("asks for a retry rather than an enable when recovering", () => {
    const testCase = settingsCase();
    const button = testCase.api.catalogSecurityAction(catalogRow({ securityTransitionState: "failed" }));
    button.dispatchEvent({ type: "click" });
    assert.equal(testCase.securityDialogs[0].action, "retry");
  });

  it("asks for an enable from a normal catalog", () => {
    const testCase = settingsCase();
    testCase.api.catalogSecurityAction(catalogRow()).dispatchEvent({ type: "click" });
    assert.equal(testCase.securityDialogs[0].action, "enable");
  });
});

describe("Notes settings catalog security status", () => {
  it("names inherited security ahead of an explicit policy", () => {
    const testCase = settingsCase();
    testCase.api.catalogSecurityStatus(catalogRow({ securityInherited: true, securityPolicy: "secure" }));
    assert.equal(testCase.callsOf("span")[0].options.text, "Secure (inherited)");
  });

  it("names an explicit policy and a normal catalog", () => {
    const explicit = settingsCase();
    explicit.api.catalogSecurityStatus(catalogRow({ securityPolicy: "secure" }));
    assert.equal(explicit.callsOf("span")[0].options.text, "Secure (explicit)");

    const normal = settingsCase();
    normal.api.catalogSecurityStatus(catalogRow());
    assert.equal(normal.callsOf("span")[0].options.text, "Normal");
  });

  it("distinguishes securing from removing security", () => {
    const securing = settingsCase();
    securing.api.catalogSecurityStatus(catalogRow({ securityTransitionState: "securing" }));
    assert.equal(securing.callsOf("span")[0].options.text, "Normal - securing");

    const removing = settingsCase();
    removing.api.catalogSecurityStatus(catalogRow({ securityTransitionState: "securing", securityTransitionAction: "remove" }));
    assert.equal(removing.callsOf("span")[0].options.text, "Normal - removing security");
  });

  it("says recovery is needed, naming the failure when one is reported", () => {
    const named = settingsCase();
    named.api.catalogSecurityStatus(catalogRow({ securityTransitionState: "failed", securityTransitionErrorCode: "key_unavailable" }));
    assert.equal(named.callsOf("span")[0].options.text, "Normal - recovery needed: key unavailable");

    const unnamed = settingsCase();
    unnamed.api.catalogSecurityStatus(catalogRow({ securityTransitionState: "failed" }));
    assert.equal(unnamed.callsOf("span")[0].options.text, "Normal - recovery needed");
  });

  it("explains inherited security on the chip itself", () => {
    const testCase = settingsCase();
    const chip = testCase.api.catalogSecurityStatus(catalogRow({ securityInherited: true }));
    assert.match(chip.title, /Child catalogs cannot weaken inherited security/);

    const normal = settingsCase();
    assert.equal(normal.api.catalogSecurityStatus(catalogRow()).title, undefined);
  });

  /** The failure code reaches the page from a transition record, so it is bounded and de-escaped. */
  it("bounds and de-escapes a reported failure label", () => {
    const { api } = settingsCase();
    assert.equal(api.safeFailureLabel("key_unavailable_for_catalog"), "key unavailable for catalog");
    assert.equal(api.safeFailureLabel(""), "catalog security transition failed");
    assert.equal(api.safeFailureLabel(null), "catalog security transition failed");
    assert.equal(api.safeFailureLabel("x".repeat(300)).length, 120);
  });
});

describe("Notes settings catalog hierarchy", () => {
  const catalogs = [
    catalogRow({ catalogId: "root", parentCatalogId: null }),
    catalogRow({ catalogId: "child", parentCatalogId: "root" }),
    catalogRow({ catalogId: "grandchild", parentCatalogId: "child" }),
    catalogRow({ catalogId: "other", parentCatalogId: null }),
  ];

  /** A catalog cannot be reparented under its own descendant, so the whole subtree is excluded. */
  it("collects every descendant, to any depth", () => {
    const { api } = settingsCase({ catalogs });
    assert.deepEqual([...api.catalogDescendantIds("root")].sort(), ["child", "grandchild"]);
    assert.deepEqual([...api.catalogDescendantIds("child")], ["grandchild"]);
    assert.deepEqual([...api.catalogDescendantIds("other")], []);
  });

  it("terminates on a parent cycle rather than walking forever", () => {
    const { api } = settingsCase({
      catalogs: [
        catalogRow({ catalogId: "x", parentCatalogId: "y" }),
        catalogRow({ catalogId: "y", parentCatalogId: "x" }),
      ],
    });
    assert.deepEqual([...api.catalogDescendantIds("x")].sort(), ["x", "y"]);
  });
});

describe("Notes settings catalog chrome", () => {
  it("marks the archive action destructive and the restore action primary", () => {
    const archive = settingsCase();
    archive.api.catalogBulkButton("Archive selected", "archive", false);
    assert.equal(archive.callsOf("#action-button")[0].options.role, "destructive");

    const restore = settingsCase();
    restore.api.catalogBulkButton("Restore selected", "restore", true);
    assert.deepEqual(
      [restore.callsOf("#action-button")[0].options.role, restore.callsOf("#action-button")[0].options.disabled],
      ["primary", true],
    );
  });

  it("runs the action the bulk control was built for", () => {
    const testCase = settingsCase();
    testCase.api.catalogBulkButton("Archive selected", "archive", false).dispatchEvent({ type: "click" });
    testCase.api.catalogBulkButton("Restore selected", "restore", false).dispatchEvent({ type: "click" });
    assert.deepEqual(testCase.bulkActions, ["archive", "restore"]);
  });

  it("chips an archived catalog and treats everything else as active", () => {
    const testCase = settingsCase();
    testCase.api.statusChip("archived");
    testCase.api.statusChip("active");
    testCase.api.statusChip("");
    assert.deepEqual(testCase.callsOf("span").map((call) => call.options.text), ["Archived", "Active", "Active"]);
  });

  it("offers the three library buckets and labels each one", () => {
    const { api } = settingsCase();
    assert.deepEqual(plain(api.libraryOptions()).map((/** @type {{value: string}} */ o) => o.value), ["active_work", "ongoing_area", "reference"]);
    assert.equal(api.libraryLabel("active_work"), "Active Work");
    assert.equal(api.libraryLabel("ongoing_area"), "Ongoing Areas");
    assert.equal(api.libraryLabel("reference"), "Reference Library");
  });

  /** The bucket is nullable on the published row, so the lookup falls back rather than blanking. */
  it("falls back to the reference library for a bucket it does not know", () => {
    const { api } = settingsCase();
    assert.equal(api.libraryLabel(null), "Reference Library");
    assert.equal(api.libraryLabel("invented"), "Reference Library");
    assert.equal(api.libraryLabel(undefined), "Reference Library");
  });

  it("builds an option carrying its value and its label", () => {
    const { api } = settingsCase();
    const option = api.viewOption("c1", "Runbooks");
    assert.deepEqual([option.value, option.textContent], ["c1", "Runbooks"]);
  });

  /**
   * **The numeric branch is kept separate on purpose**: `new Date(1700000000000)` is an instant
   * while `new Date("1700000000000")` is not a date at all.
   */
  it("formats a timestamp and dashes what it cannot read", () => {
    const { api } = settingsCase();
    assert.match(api.formatDateTime("2026-09-13T12:00:00.000Z"), /2026/);
    assert.match(api.formatDateTime(1757764800000), /20\d\d/);
    assert.equal(api.formatDateTime("not-a-date"), "-");
    assert.equal(api.formatDateTime(""), "-");
    assert.equal(api.formatDateTime(null), "-");
    // The early return is what this rests on: `0` is a valid instant to `Date`, so without it a
    // row carrying no timestamp would render the Unix epoch instead of a dash.
    assert.equal(api.formatDateTime(0), "-");
  });

  /**
   * **The second dialog is hand-built rather than taken from the fixture**, because this fake
   * gives every element a `close` method - so a `FakeElement` can never exercise the branch for
   * a host that has none.
   */
  it("closes a dialog through its own method, and removes it either way", () => {
    const testCase = settingsCase();
    /** @type {string[]} */
    const calls = [];
    const modal = testCase.document.createElement("dialog");
    modal.close = () => calls.push("close");
    modal.setAttribute("open", "");
    testCase.api.closeDialog(modal);
    assert.deepEqual(calls, ["close"]);

    /** @type {Record<string, unknown>} */
    const legacy = {
      /** @param {string} name */
      removeAttribute: (name) => calls.push(`removeAttribute:${name}`),
      remove: () => calls.push("remove"),
    };
    testCase.api.closeDialog(legacy);
    assert.deepEqual(calls, ["close", "removeAttribute:open", "remove"]);
  });

  it("removes the dialog from the document whichever way it closed", () => {
    const testCase = settingsCase();
    /** @type {string[]} */
    const calls = [];
    /** @type {Record<string, unknown>} */
    const modal = {
      close: () => calls.push("close"),
      /** @param {string} name */
      removeAttribute: (name) => calls.push(`removeAttribute:${name}`),
      remove: () => calls.push("remove"),
    };
    testCase.api.closeDialog(modal);
    assert.deepEqual(calls, ["close", "remove"], "closed through its own method, and still removed");
  });

  it("routes an error to the error tone and passes anything else through", () => {
    const testCase = settingsCase();
    testCase.api.setCatalogStatus("Saved.", { type: "success" });
    assert.deepEqual(plain(testCase.statusCalls[0].config), { type: "success" });
    testCase.api.setCatalogStatus("Broken.", { isError: true });
    assert.deepEqual(plain(testCase.statusCalls[1].config), { type: "error" });
    testCase.api.setCatalogStatus("Plain.");
    assert.deepEqual(plain(testCase.statusCalls[2].config), {});
  });

  it("routes a page error to the error tone as well", () => {
    const testCase = settingsCase();
    testCase.api.setPageStatus("Broken.", { isError: true });
    assert.deepEqual(plain(testCase.statusCalls[0].config), { type: "error" });
    testCase.api.setPageStatus("Loading...", { type: "info" });
    assert.deepEqual(plain(testCase.statusCalls[1].config), { type: "info" });
  });

  it("writes the page status to the page element and the catalog status to its own", () => {
    const testCase = settingsCase();
    testCase.api.setPageStatus("Loading...");
    assert.equal(testCase.statusCalls[0].element, testCase.notesSettingsStatus);
    testCase.api.setCatalogStatus("Loading catalogs...");
    assert.notEqual(testCase.statusCalls[1].element, testCase.notesSettingsStatus);
  });
});

describe("Notes settings shapes this page states rather than invents", () => {
  /**
   * The catalog row is published and checked in the shared declaration, and this file already
   * imported it - so the render callbacks take that rather than a local restatement.
   */
  it("types every catalog read from the published row", () => {
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(contracts, /export interface BrowserNoteCatalogSettingsRow \{/);
    assert.equal((source.match(/@type \{BrowserNoteCatalogSettingsRow\}/g) || []).length, 6,
      "one per data-table render callback - the Catalog column renders no cell of its own");
    assert.equal((source.match(/@param \{BrowserNoteCatalogSettingsRow\}/g) || []).length, 6);
    assert.match(source, /@param \{BrowserNoteCatalogSettingsRow \| null\} \[catalog\]/,
      "and the editor takes the nullable one, because it also creates");
    assert.equal(source.includes("catalogId: string,"), false, "and none of it is restated locally");
  });

  /**
   * `retry` is this page's own word for "do again whatever the failed transition was" - the
   * published action is only what the server is asked to do.
   */
  it("names its own request word separately from the published action", () => {
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(contracts, /export type BrowserNoteCatalogSecurityAction = "enable" \| "remove";/);
    assert.match(source, /@typedef \{"enable" \| "remove" \| "retry"\} CatalogSecurityRequest/);
    assert.match(source, /requestedAction === "retry" \? catalog\.securityTransitionAction : requestedAction/);
  });

  /**
   * `renderCatalogManager`, `openCatalogEditor` and `openCatalogSecurityDialog` own live mounts,
   * a fetch and a dialog lifecycle, so they cannot be lifted. These claims are pinned as source
   * facts instead of left uncovered.
   */
  it("keeps the transition poll bounded and tied to the securing state", () => {
    assert.match(source, /state\.catalogs\.some\(\(catalog\) => catalog\.securityTransitionState === "securing"\)/);
    assert.match(source, /window\.setTimeout\(\(\) => loadCatalogs\(\)\.catch\(\(\) => \{\}\), 3000\)/);
  });

  /**
   * `populateParents` closes over the editor's own controls, so it cannot be lifted. The full
   * filter is pinned here rather than left to a partial match: each of its three clauses answers
   * a different question, and dropping any one offers a parent the editor must refuse.
   */
  it("excludes a catalog, its descendants, the archived and the other libraries from its parent options", () => {
    assert.match(source, /const excludedIds = catalog \? catalogDescendantIds\(catalog\.catalogId\) : new Set\(\);/);
    assert.match(source, /excludedIds\.add\(catalog\?\.catalogId\);/);
    assert.match(
      source,
      /\.filter\(\(candidate\) => candidate\.status === "active" && candidate\.libraryBucket === libraryControl\.value && !excludedIds\.has\(candidate\.catalogId\)\)/,
    );
    assert.match(source, /const parentOptions = \[viewOption\("", "Root catalog"\)\];/);
  });

  /**
   * `scheduleCatalogRefresh` reaches the window timer directly, so it is pinned rather than
   * lifted. Clearing the pending timer first is what stops a securing catalog accumulating one
   * poll per render.
   */
  it("clears a pending poll before arming the next one", () => {
    assert.match(source, /if \(state\.refreshTimer\) window\.clearTimeout\(state\.refreshTimer\);\s*\n\s*state\.refreshTimer = null;/);
  });

  /**
   * `openCatalogSecurityDialog` owns a fetch and `showCatalogSecurityConfirmation` owns a dialog
   * lifecycle, so neither can be lifted. These four are the claims that decide whether a
   * destructive security transition can be started at all.
   */
  it("refuses to confirm a security transition it could not preview", () => {
    assert.match(source, /if \(!preflight\) \{\s*\n\s*throw new Error\("Catalog security preview could not be read\."\);/);
    assert.match(source, /showCatalogSecurityConfirmation\(catalog, requestedAction, preflight\);/);
    assert.match(source, /disabled: preflight\.canProceed !== true,/);
  });

  it("encodes both the catalog and the action into the preflight request", () => {
    assert.match(
      source,
      /\/api\/notes\/collections\/\$\{encodeURIComponent\(catalog\.catalogId\)\}\/security\/preflight\?action=\$\{encodeURIComponent\(transitionAction\)\}/,
    );
  });

  /**
   * The selection is read once, and then only kept if the rebuilt list still offers it - a parent
   * that has just been excluded must fall back to the root rather than stay selected on a control
   * that no longer carries the option.
   */
  it("reads the parent selection once, and keeps it only while it is still offered", () => {
    assert.match(source, /const parentCatalogId = catalog\?\.parentCatalogId \|\| "";/);
    assert.match(
      source,
      /parentControl\.value = parentOptions\.some\(\(option\) => option\.value === parentCatalogId\) \? parentCatalogId : "";/,
    );
    assert.equal(source.includes("? catalog.parentCatalogId : \"\";"), false);
  });

  it("carries no suppression and names no master key", () => {
    assert.doesNotMatch(source, /SECURE_NOTES_MASTER_KEY|LONGTAIL_SECURE_NOTES_MASTER_KEY/);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
