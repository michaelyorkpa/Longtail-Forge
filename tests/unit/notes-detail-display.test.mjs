import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const read = createProjectTextReader().readText, source = read("public/js/notes.js");
const names = ["notesActionStripDescriptor", "notesWorkflowActionStripDescriptor", "createNoteActionStrip", "detailActionButtons", "noteWorkflowActionButton",
  "renderDetail", "createNoteViewDialog", "renderNoteViewDialog", "renderNoteViewError", "noteViewBodyElement", "noteViewEditAction", "noteViewErrorMessage",
  "linkRecordNodes", "notePrimaryContextItem", "notePrimaryContextSummary", "linkItem", "isNoteLinkDisplay", "isNoteContextLabel", "isResponseRecord",
  "isSecureError", "emptyText", "requireNotesValue", "unavailableTargetLabel"];
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [changes] */
function note(changes = {}) {
  return { note_id: "note / one", title: "Readable note", status: "active", security_mode: "normal", body_html: "<p>Readable body</p>",
    tags: [], links: [], client_id: "", project_id: "", note_collection_id: "", ...changes };
}
function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const calls = [];
  const detail = browser.document.createElement("main"); detail.appendChild(browser.document.createElement("aside"));
  const context = vm.createContext({ ...browser, calls, detailPanel: detail, descriptor: null, business: true,
    notesViewSurfaceDescriptor: () => context.descriptor,
    notesLinkedRecordsDescriptor: () => ({ emptyState: { message: "No linked records here." } }),
    runNoteWorkflow: (/** @type {unknown} */ behavior, /** @type {unknown} */ record) => { calls.push(["workflow", behavior, record]); return "dispatched"; },
    usesBusinessScope: () => context.business, formatToken: (/** @type {unknown} */ text) => String(text || ""),
    isSecureNote: (/** @type {{security_mode?: string}} */ record) => record.security_mode === "secure",
    detailMetaItems: (/** @type {unknown} */ record) => { calls.push(["meta", record]); return []; },
    collectionLabel: (/** @type {unknown} */ id) => id === "collection" ? "Selected collection" : "",
    tagChips: (/** @type {unknown} */ tags) => { calls.push(["tags", tags]); return browser.document.createElement("span"); },
    applyExternalMarkdownLinkPreference: (/** @type {unknown} */ body) => calls.push(["markdown-links", body]),
    mountFilesPanel: (/** @type {unknown} */ record, /** @type {unknown} */ mount) => calls.push(["mount-files", record, mount]),
    loadRevisions: (/** @type {unknown} */ record, /** @type {unknown} */ mount) => calls.push(["load-revisions", record, mount]),
    readNoteEditorId: () => "fallback", openNoteViewEditHandoff: /** @param {...unknown} args */ (...args) => calls.push(["handoff", ...args]),
    removeNoteLink: /** @param {...unknown} args */ (...args) => calls.push(["remove", ...args]),
  });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  const view = context.window.LongtailForge.view; context.requireView = () => view;
  context.requireDescriptorRenderers = () => ({ renderDescriptorActionMenu: (/** @type {unknown[]} */ actions, /** @type {unknown} */ options) => {
    calls.push(["menu", actions, options]); return view.createElement("details", { children: actions });
  } });
  for (const [name, marker] of [["renderLinksPanel", "links"], ["renderFilesPanel", "files"], ["renderRevisionsPanel", "revisions"]]) {
    context[name] = (/** @type {unknown} */ record) => {
      calls.push([name, record]); const panel = view.createElement("section", { dataset: { panel: marker } });
      if (marker !== "links") panel.appendChild(view.createElement("div", { dataset: { [marker === "files" ? "noteFilesMount" : "noteRevisionsList"]: "" } }));
      return panel;
    };
  }
  const start = source.indexOf("const LINK_TARGET_TYPE_LABELS ="); assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({${names.join(",")}})`, context), context, view, calls, detail, document: browser.document };
}

describe("Notes detail display and action controls", () => {
  it("uses the actual fallback action producer, retaining action order and archived restrictions", async () => {
    const f = fixture(), record = note();
    assert.deepEqual(plain(f.api.notesWorkflowActionStripDescriptor()), { label: "Note actions", actions: [
      { id: "edit-note", label: "Edit", role: "secondary", behavior: "notes.workflow.edit" },
      { id: "archive-note", label: "Archive", role: "secondary", behavior: "notes.workflow.archive" },
      { id: "restore-note", label: "Restore", role: "secondary", behavior: "notes.workflow.restore" },
    ] });
    for (const status of ["active", "archived"]) {
      record.status = status; const buttons = f.api.detailActionButtons(record);
      assert.deepEqual(plain(buttons.map((/** @type {{dataset:{noteAction:string}}} */ b) => b.dataset.noteAction)), ["edit-note", status === "archived" ? "restore-note" : "archive-note"]);
      assert.equal(buttons[0].disabled, status === "archived");
      if (status === "archived") assert.equal(buttons[0].title, "Restore archived notes before editing.");
      await buttons[1].click(); const call = f.calls.at(-1); assert.equal(call?.[0], "workflow"); assert.equal(call?.[1], status === "archived" ? "notes.workflow.restore" : "notes.workflow.archive"); assert.strictEqual(call?.[2], record);
    }
  });
  it("forwards descriptor labels and roles, omits absent actions and dispatches an activation once", async () => {
    const f = fixture(), record = note();
    f.context.descriptor = { detail: { actionStrip: { label: "Custom actions", actions: [{ id: "edit-note", role: "primary", behavior: "notes.workflow.edit" }] } } };
    const menu = f.api.createNoteActionStrip(record); assert.equal(menu.children.length, 1);
    const call = f.calls.find((c) => c[0] === "menu"); assert.ok(call);
    assert.deepEqual(plain(call[2]), { summaryLabel: "...", ariaLabel: "Custom actions", title: "Custom actions" });
    const button = menu.children[0]; assert.equal(button.textContent, "edit-note"); assert.equal(button.dataset.surfaceActionRole, "primary");
    await button.click(); assert.equal(f.calls.filter((c) => c[0] === "workflow").length, 1); assert.strictEqual(f.calls.at(-1)?.[2], record);
    f.context.descriptor.detail.actionStrip.actions = [];
    assert.equal(f.api.detailActionButtons(record).length, 0);
    const inert = f.api.noteWorkflowActionButton({ id: "no-behavior" }, record); f.calls.length = 0; await inert.click(); assert.deepEqual(f.calls, []);
  });
  it("replaces stale detail content, retaining panel order, note identity and post-render mounts", () => {
    const f = fixture(), record = note({ note_collection_id: "collection" }); const old = f.detail.children[0];
    f.api.renderDetail(record); assert.equal(old.parentNode === null, true);
    assert.deepEqual(f.detail.children.map((/** @type {{tagName:string}} */ n) => n.tagName), ["HEADER", "P", "DIV", "HR", "DIV", "SECTION", "SECTION", "SECTION"]);
    assert.equal(f.detail.children[1].textContent, "Collection: Selected collection");
    assert.equal(f.detail.querySelector("h2").textContent, "Readable note");
    assert.equal(f.detail.querySelector(".notes-rendered-body").innerHTML, record.body_html);
    assert.equal(f.detail.querySelector(".notes-rendered-body").textContent.includes("No body."), false);
    assert.deepEqual(f.detail.children.slice(-3).map((node) => node.dataset.panel), ["links", "files", "revisions"]);
    assert.deepEqual(f.calls.slice(-2).map((c) => c[0]), ["mount-files", "load-revisions"]);
    for (const call of f.calls.filter((c) => ["meta", "renderLinksPanel", "renderFilesPanel", "renderRevisionsPanel", "mount-files", "load-revisions"].includes(String(c[0])))) assert.strictEqual(call[1], record);
    assert.strictEqual(f.calls.at(-2)?.[2], f.detail.querySelector("[data-note-files-mount]"));
    assert.strictEqual(f.calls.at(-1)?.[2], f.detail.querySelector("[data-note-revisions-list]"));
  });
  it("preserves empty-body, untitled, collection and secure-warning fallbacks without parsing fake HTML", () => {
    for (const security_mode of ["normal", "secure"]) {
      const f = fixture(); f.api.renderDetail(note({ title: "", body_html: "", security_mode }));
      assert.equal(f.detail.querySelector("h2").textContent, "Untitled note");
      assert.equal(f.detail.children[1].textContent, "Collection: Uncategorized");
      assert.equal(f.detail.querySelector(".notes-rendered-body").textContent, security_mode === "secure" ? "Secure note body is locked or unavailable." : "No body.");
      assert.equal(f.detail.querySelectorAll(".notes-secure-warning").length, security_mode === "secure" ? 1 : 0);
      if (security_mode === "secure") {
        assert.match(f.detail.querySelector(".notes-secure-warning").textContent, /Do not put secrets in the title/);
        f.api.renderDetail(note({ security_mode, secure_title_warning: "Visible title warning" }));
        assert.equal(f.detail.querySelector(".notes-secure-warning").textContent, "Visible title warning");
      }
    }
  });
  it("keeps required detail-panel failure at replacement, after construction and before mounts", () => {
    const f = fixture(); f.context.detailPanel = null;
    assert.throws(() => f.api.renderDetail(note()), /Required Notes value is unavailable/);
    assert.deepEqual(f.calls.filter((c) => String(c[0]).startsWith("render")).map((c) => c[0]), ["renderLinksPanel", "renderFilesPanel", "renderRevisionsPanel"]);
    assert.ok(f.calls.some((c) => c[0] === "tags")); assert.ok(!f.calls.some((c) => c[0] === "mount-files" || c[0] === "load-revisions"));
  });
  it("retains primary context before readable linked rows and drops only unreadable rows", async () => {
    const f = fixture(), record = note({ client_id: "client", linked_context: { client: { label: "Client" } }, links: [
      { label: "First", target_type: "task", source_url: "/first", note_link_id: "link" }, { label: 4 }, { label: "Last", targetType: "note" },
    ] });
    const rows = f.api.linkRecordNodes(record); assert.equal(rows.length, 3); assert.ok(rows.every(Boolean));
    assert.match(rows[0].textContent, /Primary Context/); assert.match(rows[0].textContent, /Client: Client/);
    assert.match(rows[1].textContent, /First/); assert.equal(rows[1].querySelector("a").getAttribute("href"), "/first"); assert.match(rows[2].textContent, /Last/);
    await rows[1].querySelector("button").click(); assert.strictEqual(f.calls.at(-1)?.[1], record); assert.strictEqual(f.calls.at(-1)?.[2], record.links[0]);
    f.context.business = false; assert.equal(f.api.linkRecordNodes(record).length, 2);
    const empty = f.api.linkRecordNodes(note({ links: [null, { label: 4 }] }));
    assert.equal(empty.length, 1); assert.equal(empty[0].textContent, "No linked records here.");
  });
  it("looks up the actual edit button and tolerates absent optional viewer regions", () => {
    const f = fixture(), dialog = f.api.createNoteViewDialog("id"); const edit = f.api.noteViewEditAction(dialog);
    assert.ok(edit); assert.equal(edit.tagName, "BUTTON"); assert.equal(edit.disabled, true);
    assert.doesNotThrow(() => f.api.noteViewEditAction(null)); assert.equal(f.api.noteViewEditAction(null), null); assert.equal(f.api.noteViewBodyElement(null), undefined);
    const decoy = f.document.createElement("div"); decoy.dataset.noteViewAction = "edit"; dialog.replaceChildren(decoy, ...dialog.children);
    assert.equal(f.api.noteViewEditAction(dialog) === edit, true);
    edit.remove(); assert.equal(f.api.noteViewEditAction(dialog), null);
    assert.doesNotThrow(() => f.api.renderNoteViewDialog(dialog, note()));
    assert.equal(f.api.noteViewBodyElement(dialog).querySelector(".notes-view-rendered-body").innerHTML, "<p>Readable body</p>");
    f.api.noteViewBodyElement(dialog).remove(); assert.doesNotThrow(() => f.api.renderNoteViewError(dialog, new Error("denied")));
  });
  it("preserves archived viewer edit state and one-shot handoff with the original note", async () => {
    const f = fixture(), record = note({ status: "archived" }), dialog = f.api.createNoteViewDialog("id");
    f.api.renderNoteViewDialog(dialog, record); const edit = f.api.noteViewEditAction(dialog);
    assert.equal(edit.disabled, true); assert.equal(edit.title, "Restore archived notes before editing.");
    const active = f.api.createNoteViewDialog("id"), host = { marker: true }, params = { marker: "params" }; record.status = "active";
    f.api.renderNoteViewDialog(active, record, params, host); const action = f.api.noteViewEditAction(active);
    assert.equal(action.disabled, false); assert.equal(action.title, "Edit this note"); await action.click(); await action.click();
    const handoffs = f.calls.filter((c) => c[0] === "handoff"); assert.equal(handoffs.length, 1); assert.strictEqual(handoffs[0][1], active); assert.equal(handoffs[0][2], record.note_id);
    const seed = handoffs[0][3]; assert.ok(seed && typeof seed === "object" && "note" in seed);
    assert.strictEqual(seed.note, record); assert.strictEqual(handoffs[0][4], host);
  });
  it("replaces prior viewer body on unknown throws, with inherited secure errors kept private", () => {
    for (const error of [null, undefined, 42, "denied", Object.create({ message: "private decrypt key" })]) {
      const f = fixture(), dialog = f.api.createNoteViewDialog("id"); const body = f.api.noteViewBodyElement(dialog); assert.ok(body);
      body.textContent = "Old private detail"; f.api.renderNoteViewError(dialog, error);
      const secure = error && typeof error === "object";
      assert.equal(body.textContent, secure ? "Secure note is locked or could not be decrypted. Check secure-note access and server key configuration." : "Note is unavailable or you do not have access.");
      assert.equal(dialog.viewParts.title.textContent, "Note unavailable"); const edit = f.api.noteViewEditAction(dialog);
      assert.equal(edit.disabled, true); assert.equal(edit.title, "This note cannot be edited from here.");
      edit.remove(); body.textContent = "Old again"; assert.doesNotThrow(() => f.api.renderNoteViewError(dialog, error)); assert.ok(!body.textContent.includes("Old again"));
    }
  });
});

describe("isolated workspace identity reader", () => {
  it("executes the actual creator against camelCase, both legacy branches and their precedence", async () => {
    const create = vm.runInNewContext(`(${extractFunctionBlock(read("tests/e2e/support/isolated-workspace.mjs"), "createOwnedWorkspace")})`);
    for (const [body, expected] of [[{ workspace: { workspaceId: "real-camel" } }, "real-camel"], [{ workspace: { workspace_id: "legacy-snake" } }, "legacy-snake"],
      [{ workspaceId: "legacy-root" }, "legacy-root"], [{ workspace: { workspace_id: "first", workspaceId: "second" }, workspaceId: "third" }, "first"], [{}, ""]]) {
      /** @type {unknown[][]} */ const requests = []; const result = await create({ post: async (/** @type {unknown} */ url, /** @type {unknown} */ options) => { requests.push([url, options]); return { status: () => 201, json: async () => body }; } }, "Owned name");
      assert.equal(result.workspaceId, expected); assert.equal(result.workspaceName, "Owned name"); assert.equal(result.workspaceType, "business");
      assert.deepEqual(plain(requests), [["/api/workspaces", { data: { workspaceName: "Owned name", workspaceType: "business" } }]]);
    }
  });
});
