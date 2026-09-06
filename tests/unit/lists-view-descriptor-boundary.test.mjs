import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const lists = read("public/js/lists.js");
const contracts = read("src/types/browser-contracts.d.ts");

/**
 * One declaration sliced at the indentation it is written at.
 * @param {string} opener @param {number} [indent]
 */
function slice(opener, indent = 2) {
  const pad = " ".repeat(indent);
  const start = lists.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = lists.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return lists.slice(start, end + pad.length + 2);
}

/** @param {string} source */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

/**
 * The descriptor boundary, lifted from the shipped page and run against a fake namespace.
 *
 * Nothing is retyped: each reader is the file's own text, so a change to any of them changes what
 * these assertions see.
 * @param {unknown} viewSurfaces what the stored workspace context carries
 */
function descriptorBoundary(viewSurfaces) {
  const win = { LongtailForge: viewSurfaces === undefined ? undefined : { workspaceContext: { viewSurfaces } } };
  return new Function("window", [
    slice("function isResponseRecord(value) {"),
    slice("function listsViewSurfaceDescriptor() {"),
    slice("function listsWorkspaceViewSurfaces() {"),
    slice("function isListsSurfaceDescriptor(value) {"),
    slice("function readListsAction(value) {"),
    slice("function readListsActions(value) {"),
    slice("function readListsFields(value) {"),
    slice("function isListsText(value) {"),
    slice("function readListsActionStrip(value) {"),
    slice("function readListsItemForm(value) {"),
    slice("function readListsItemRows(value) {"),
    slice("function readListsModal(value) {"),
    slice("function readListsIndexPanel(value) {"),
    slice("function listsDetailSection(descriptor, section) {"),
    "return { listsViewSurfaceDescriptor, listsWorkspaceViewSurfaces, readListsAction,"
    + " readListsActions, readListsFields, readListsActionStrip, readListsItemForm,"
    + " readListsItemRows, readListsModal, readListsIndexPanel, listsDetailSection };",
  ].join("\n"))(win);
}

/** A complete contributed surface, so each negative case differs in exactly one way. */
const validSurface = () => ({
  id: "lists.workspace",
  moduleId: "lists",
  contributedExtra: { kept: true },
  indexPanel: { collapseOnSelect: true, title: "Lists", label: "Fallback" },
  modals: [{ id: "list-editor", fields: [{ field: "title" }], footerActions: [{ id: "save-list", label: "Save" }] }],
  detail: {
    actionStrip: { label: "Server actions", actions: [{ id: "duplicate-list", label: "Copy", role: "secondary" }] },
    itemForm: { title: "Server items", actions: [{ id: "add-item", label: "Add" }], fields: [{ field: "item_name", width: "full" }] },
    itemRows: { actions: [{ id: "edit-item" }], emptyState: { message: "Nothing yet." } },
  },
});

describe("the root surface is selected by identity and returned whole", () => {
  it("finds the contributed lists.workspace surface", () => {
    const surface = validSurface();
    const found = descriptorBoundary([surface]).listsViewSurfaceDescriptor();
    assert.equal(found, surface, "the original object, not a rebuild");
  });

  it("ignores a surface with the wrong id", () => {
    const boundary = descriptorBoundary([{ ...validSurface(), id: "notes.workspace" }]);
    assert.equal(boundary.listsViewSurfaceDescriptor(), null);
  });

  it("ignores a surface with the wrong module", () => {
    const boundary = descriptorBoundary([{ ...validSurface(), moduleId: "notes" }]);
    assert.equal(boundary.listsViewSurfaceDescriptor(), null);
  });

  it("ignores entries that are not records at all", () => {
    for (const entry of [null, 7, "lists.workspace", [], undefined, true]) {
      assert.equal(descriptorBoundary([entry]).listsViewSurfaceDescriptor(), null, String(entry) + " is not a surface");
    }
  });

  it("takes the no-surface path for a container that is not a list", () => {
    for (const container of ["surfaces", 7, null, { id: "lists.workspace" }, undefined]) {
      assert.deepEqual(descriptorBoundary(container).listsWorkspaceViewSurfaces(), []);
      assert.equal(descriptorBoundary(container).listsViewSurfaceDescriptor(), null);
    }
  });

  it("survives an absent namespace, which is the cold-load and dialog-only case", () => {
    const boundary = new Function("window", [
      slice("function isResponseRecord(value) {"),
      slice("function listsWorkspaceViewSurfaces() {"),
      "return { listsWorkspaceViewSurfaces };",
    ].join("\n"))({ LongtailForge: undefined });
    assert.deepEqual(boundary.listsWorkspaceViewSurfaces(), []);
  });

  it("keeps the first match when several surfaces are delivered", () => {
    const wanted = validSurface();
    const later = { ...validSurface(), contributedExtra: { kept: false } };
    const found = descriptorBoundary([{ id: "notes.workspace", moduleId: "notes" }, wanted, later])
      .listsViewSurfaceDescriptor();
    assert.equal(found, wanted);
  });

  it("preserves every contributed root member by identity", () => {
    const surface = validSurface();
    const extra = surface.contributedExtra;
    const found = descriptorBoundary([surface]).listsViewSurfaceDescriptor();
    assert.equal(found.contributedExtra, extra, "an unread contribution reaches the renderer untouched");
  });

  it("promises only identity at the root, leaving the sections to their own readers", () => {
    const at = contracts.indexOf("export interface BrowserListsWorkspaceSurfaceDescriptor {");
    assert.notEqual(at, -1, "the root contract must exist");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    const members = [...body.matchAll(/^ {2}([a-zA-Z]+)[?]?:/gm)].map((match) => match[1]).sort();
    assert.deepEqual(members, ["id", "moduleId"]);
    assert.match(body, /\[key: string\]: unknown;/);
  });
});

describe("each contributed section is validated where it is used", () => {
  it("accepts a well-formed action strip and keeps its object", () => {
    const surface = validSurface();
    const boundary = descriptorBoundary([surface]);
    const strip = boundary.readListsActionStrip(boundary.listsDetailSection(surface, "actionStrip"));
    assert.equal(strip, surface.detail.actionStrip);
    assert.equal(strip.label, "Server actions");
  });

  it("treats a malformed action strip as absent, so the page's own answers", () => {
    const boundary = descriptorBoundary([]);
    for (const candidate of ["strip", 7, null, { label: 7 }, { actions: "none" }, { actions: [{ label: "no id" }] }]) {
      assert.equal(boundary.readListsActionStrip(candidate), null, JSON.stringify(candidate) + " is unusable");
    }
  });

  it("refuses an action collection when any member carries no usable identity", () => {
    const boundary = descriptorBoundary([]);
    assert.equal(boundary.readListsActions([{ id: "a" }, { id: "" }]), null, "an empty id is no identity");
    assert.equal(boundary.readListsActions([{ id: "a" }, null]), null);
    assert.equal(boundary.readListsActions([{ id: "a" }, { id: "b", role: 7 }]), null, "a non-string role");
    assert.equal(boundary.readListsActions("actions"), null);
    assert.deepEqual(boundary.readListsActions([]), [], "an empty collection is usable");
  });

  it("keeps each action object and its unread members", () => {
    const boundary = descriptorBoundary([]);
    const action = { id: "duplicate-list", label: "Copy", confirm: { title: "Sure?" }, icon: "copy" };
    const [read] = boundary.readListsActions([action]);
    assert.equal(read, action);
    assert.equal(read.confirm, action.confirm, "a member Lists never reads still reaches the renderer");
  });

  it("accepts a well-formed item form and refuses a malformed field", () => {
    const surface = validSurface();
    const boundary = descriptorBoundary([surface]);
    assert.equal(
      boundary.readListsItemForm(boundary.listsDetailSection(surface, "itemForm")),
      surface.detail.itemForm,
    );
    assert.equal(boundary.readListsItemForm({ fields: [{ label: "no field name" }] }), null);
    assert.equal(boundary.readListsItemForm({ fields: [{ field: "x", width: 7 }] }), null);
    assert.equal(boundary.readListsItemForm({ title: 7 }), null);
  });

  it("requires an action collection on item rows, because the row builder maps over it", () => {
    const boundary = descriptorBoundary([]);
    assert.equal(boundary.readListsItemRows({ emptyState: { message: "x" } }), null, "no actions is unusable");
    assert.equal(boundary.readListsItemRows({ actions: "none" }), null);
    const rows = { actions: [{ id: "edit-item" }] };
    assert.equal(boundary.readListsItemRows(rows), rows);
  });

  it("refuses an empty-state object whose message is not text", () => {
    const boundary = descriptorBoundary([]);
    assert.equal(boundary.readListsItemRows({ actions: [], emptyState: "none" }), null);
    assert.equal(boundary.readListsItemRows({ actions: [], emptyState: { message: 7 } }), null);
    const rows = { actions: [], emptyState: { message: "Nothing yet." } };
    assert.equal(boundary.readListsItemRows(rows), rows);
  });

  it("accepts a well-formed modal and refuses one with no identity", () => {
    const surface = validSurface();
    const boundary = descriptorBoundary([surface]);
    assert.equal(boundary.readListsModal(surface.modals[0]), surface.modals[0]);
    assert.equal(boundary.readListsModal({ fields: [] }), null, "no id");
    assert.equal(boundary.readListsModal({ id: "x", footerActions: [{ label: "no id" }] }), null);
  });

  it("reads a detail section only through a validated detail record", () => {
    const boundary = descriptorBoundary([]);
    assert.equal(boundary.listsDetailSection({ detail: "none" }, "actionStrip"), undefined);
    assert.equal(boundary.listsDetailSection(null, "actionStrip"), undefined);
    assert.equal(boundary.listsDetailSection({}, "actionStrip"), undefined);
  });
});

describe("the index panel takes real values or its defaults", () => {
  it("keeps a contributed title and label", () => {
    const panel = descriptorBoundary([]).readListsIndexPanel({ title: "Lists", label: "Fallback" });
    assert.equal(panel.title, "Lists");
    assert.equal(panel.label, "Fallback");
  });

  it("requires a real boolean for collapse-on-select", () => {
    const boundary = descriptorBoundary([]);
    assert.equal(boundary.readListsIndexPanel({ collapseOnSelect: true }).collapseOnSelect, true);
    assert.equal(boundary.readListsIndexPanel({ collapseOnSelect: false }).collapseOnSelect, false);
    for (const truthy of ["yes", 1, {}, []]) {
      assert.equal(
        boundary.readListsIndexPanel({ collapseOnSelect: truthy }).collapseOnSelect,
        undefined,
        JSON.stringify(truthy) + " must not collapse the panel",
      );
    }
  });

  it("answers an empty fragment for anything that is not a record", () => {
    const boundary = descriptorBoundary([]);
    for (const candidate of [undefined, null, "panel", 7, []]) {
      assert.deepEqual(boundary.readListsIndexPanel(candidate), {});
    }
  });

  it("drops members that are not text rather than passing them on", () => {
    const panel = descriptorBoundary([]).readListsIndexPanel({ title: 7, label: null });
    assert.equal(panel.title, undefined);
    assert.equal(panel.label, undefined);
  });
});

describe("rendering and the dialog-only path are unchanged", () => {
  it("passes the original descriptor to renderSurface with only the two intentional overrides", () => {
    const body = codeOnly(lists.slice(lists.indexOf("activeListsViewDescriptor = listsViewSurfaceDescriptor();")));
    assert.match(body, /const renderDescriptor = \{\s*\n\s*\.\.\.activeListsViewDescriptor,\s*\n\s*dataSource: null,\s*\n\s*modals: \[\],\s*\n\s*\};/);
    assert.match(body, /renderSurface\(renderDescriptor, host\)/);
  });

  it("keeps suppressing the framework's duplicate modal shells", () => {
    assert.match(lists, /suppress the framework duplicate modal shells/);
    assert.match(lists, /function createListDialogShell/, "and still builds its own dialog");
  });

  it("leaves the lazy dialog-only path with no workspace dependency", () => {
    // Scoped to the branch itself: a fixed window runs on into the workspace initialiser,
    // which does await readiness, and would report the opposite of what this checks.
    const at = lists.indexOf("  if (isListsWorkspaceSurface) {");
    assert.notEqual(at, -1, "the bootstrap branch must exist");
    const branch = codeOnly(lists.slice(at, lists.indexOf("\n  }\n", at) + 4));
    assert.match(branch, /if \(isListsWorkspaceSurface\) \{\s*\n\s*initializeListsWorkspace\(\);\s*\n\s*\} else \{/);
    const dialogOnly = branch.slice(branch.indexOf("} else {"));
    assert.match(dialogOnly, /ensureListsDialogShell\(\);/, "it builds its own dialog immediately");
    assert.ok(!/await/.test(dialogOnly), "the dialog-only branch waits for nothing");
    assert.ok(!/workspaceContext/.test(dialogOnly), "and reads no workspace context");
    assert.ok(!/listsViewSurfaceDescriptor/.test(dialogOnly), "and no server surface");
  });

  it("keeps the host check that distinguishes the two paths", () => {
    assert.match(lists, /const isListsWorkspaceSurface = Boolean\(listsWorkspaceHost\);/);
    assert.notEqual(lists.indexOf("function isListsSurfaceDescriptor("), -1,
      "the descriptor predicate has a name of its own");
  });
});

describe("the contracts are page-specific and change nothing global", () => {
  it("declares the Lists family and nothing wider", () => {
    for (const name of [
      "BrowserListsActionDescriptor", "BrowserListsActionStripDescriptor",
      "BrowserListsDetailDescriptor", "BrowserListsEmptyStateDescriptor",
      "BrowserListsFieldDescriptor", "BrowserListsIndexPanelDescriptor",
      "BrowserListsItemFormDescriptor", "BrowserListsItemRowsDescriptor",
      "BrowserListsModalDescriptor", "BrowserListsWorkspaceSurfaceDescriptor",
    ]) {
      assert.match(contracts, new RegExp("^export interface " + name + " \\{$", "m"), name + " must be declared");
    }
  });

  it("leaves the stored context's view surfaces unvalidated at the container", () => {
    const at = contracts.indexOf("export interface BrowserStoredWorkspaceContext {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.match(body, /^ {2}viewSurfaces: unknown\[\];$/m, "this page narrows its own element");
  });

  it("left the namespace member to 0.33.33.38.2.2.5.2, and still reads it as a candidate", () => {
    // Spent by that child. This page's boundary was written to hold on both sides of the
    // declaration, so what outlives the guard is that it still does: the member is declared now,
    // and this reader still narrows the value itself rather than trusting the contract.
    const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.match(body, /^ {2}workspaceContext\?: BrowserStoredWorkspaceContext;$/m);
    assert.match(slice("function listsWorkspaceViewSurfaces() {"), /@type \{unknown\}/);
  });

  it("reads the namespace member as an unknown candidate, so it holds either way", () => {
    const body = slice("function listsWorkspaceViewSurfaces() {");
    assert.match(body, /@type \{unknown\} \*\/\s*\n\s*const context = window\.LongtailForge\?\.workspaceContext;/);
    assert.match(body, /isResponseRecord\(context\)/);
    assert.ok(!/@type \{[^}]*\} \*\/ \(window\.LongtailForge/.test(lists), "no cast through the namespace");
  });

  it("reuses the page's own record predicate rather than adding a second one", () => {
    assert.equal(countOf(lists, /function isResponseRecord\(/g), 1);
    assert.ok(!/function isListsRecord\(/.test(lists), "no duplicate plain-record predicate");
  });

  it("names no explicit any in the boundary it added", () => {
    const withoutText = lists.replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
    assert.ok(!/[:<,{|&]\s*any\b/.test(withoutText));
    assert.ok(!/\bany\s*(?:\[\]|[>,}|&])/.test(withoutText));
  });
});
