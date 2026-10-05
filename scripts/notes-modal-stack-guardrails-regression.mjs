import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext, createFakeEvent } from "./test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionSpan } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const notesHtml = readText("views/protected/notes.html");
const notesJs = readText("public/js/notes.js");
const viewBuilderJs = readText("public/js/shared/view-builder.js");
// 0.33.33.35.3 moved the modal stack into LongtailForge.viewModalStack. The builder
// delegates to it at call time, so every context that executes the builder provides it.
const viewModalStackSource = readText("public/js/shared/view-modal-stack.js");
const viewRendererJs = readText("public/js/shared/view-renderer.js");

assert.match(notesHtml, /js\/shared\/view-builder\.js/, "Notes should reference the shared view builder stack helper");
assert.match(notesHtml, /js\/shared\/view-renderer\.js/, "Notes should reference the shared view renderer modal opener");
assert.match(notesHtml, /css\/longtail-forge\.css/, "Notes should reference stacked modal warning styles");
assert.match(notesHtml, /js\/notes\.js/, "Notes should reference the Notes modal wiring");

// 0.33.33.35.1.2: these matched across the whole file, so they spanned from a `label:` inside
// the deleted descriptor fallback into the live shell below it - passing for the wrong
// reason and in an order the real code never had. They are scoped to the shell that builds
// the buttons, in the order it declares them.
const noteDialogShell = extractFunctionSpan(notesJs, "createNoteDialogShell");
assert.match(noteDialogShell, /icon: "tag",[\s\S]*iconOnly: false,[\s\S]*label: "Tags",[\s\S]*role: "utility",[\s\S]*text: "Tags",[\s\S]*title: "Tags"/, "Tags utility should use the concise icon plus text label");
assert.match(noteDialogShell, /icon: "file",[\s\S]*iconOnly: false,[\s\S]*label: "Files",[\s\S]*role: "utility",[\s\S]*text: "Files",[\s\S]*title: "Files"/, "Files utility should use the concise icon plus text label");
assert.doesNotMatch(notesJs, /Note tags|Note files/, "Notes utility buttons should not expose the old longer labels");
assert.match(notesJs, /view\.showModal\(dialog, \{ trigger: options\.trigger \|\| options\.hostContext\?\.trigger \|\| null \}\)/, "The Add/Edit Note dialog should open through the shared modal stack helper with focus-return trigger context");
assert.match(notesJs, /view\.closeModal\(dialog, options\.returnValue \|\| ""\)/, "Closing or saving the Add/Edit Note dialog should close child modals safely");
assert.match(notesJs, /view\.showModal\(collectionDialog, \{ parent: null \}\)/, "Collection dialogs should use the shared modal stack helper without inheriting the action-modal parent");
assert.match(notesJs, /view\.closeModal\(collectionDialog\)/, "Collection dialogs should close through the shared modal stack helper");

// 0.33.33.35.3 moved the modal stack into LongtailForge.viewModalStack. These read as
// ownership rather than as source location: the stack state and lifecycle live in the extracted
// module, the builder still publishes the same four members on the frozen view factory and
// delegates each of them, and the extracted module never writes that factory. The behavioural
// proof further down executes real nested dialogs and is what actually pins the semantics.
assert.match(viewModalStackSource, /const modalStack = \[\]/, "The modal-stack module should own the stack");
assert.match(viewModalStackSource, /const modalEntries = new WeakMap\(\)/, "The modal-stack module should own its per-dialog entries");
assert.match(viewModalStackSource, /namespace\.viewModalStack = Object\.freeze\(\{\s*\n\s*closeChildModals,\s*\n\s*closeModal,\s*\n\s*isTopModal,\s*\n\s*showModal,\s*\n\s*\}\)/, "The modal-stack module should publish exactly what the builder delegates");
assert.doesNotMatch(viewModalStackSource, /\.view\s*=/, "The modal-stack module must not write the frozen LongtailForge.view factory");
assert.doesNotMatch(viewModalStackSource, /function createModal(Form|Footer)?\(/, "Modal constructors stay in the builder with its element factory");

for (const member of ["showModal", "closeModal", "closeChildModals", "isTopModal"]) {
  assert.match(
    viewBuilderJs,
    new RegExp(`function ${member}\\([^)]*\\) \\{[\\s\\S]{0,120}?requireModalStack\\(\\)\\.${member}\\(`),
    `View builder should keep publishing ${member} and delegate it to the modal-stack module`,
  );
}
assert.match(viewBuilderJs, /root\.view = Object\.freeze\(\{[\s\S]*closeChildModals,[\s\S]*closeModal,[\s\S]*isTopModal,[\s\S]*showModal,/, "The frozen view factory should still carry all four modal members");
assert.match(viewModalStackSource, /event\.target === dialog && !isTopModal\(dialog\)/, "Backdrop-style clicks on non-top dialogs should be guarded");
assert.match(viewModalStackSource, /"cancel"[\s\S]*!isTopModal\(dialog\)[\s\S]*event\.preventDefault\?\.\(\)/, "Escape/cancel on non-top dialogs should be guarded");
assert.match(viewRendererJs, /state\.view\.showModal\(dialog\)/, "Descriptor modal opening should route through the shared stack helper");

/** @typedef {import("./test-support/fake-dom.mjs").FakeNode} FakeNode */
/**
 * The published `LongtailForge.view` modal-stack helper catalog under test.
 * @typedef {Record<string, (...args: unknown[]) => FakeNode>} ModalStackSurface
 */

const context = createFakeBrowserContext({ globals: { WeakMap } });
vm.runInNewContext(viewModalStackSource, context, { filename: "view-modal-stack.js" });
vm.runInNewContext(viewBuilderJs, context, { filename: "view-builder.js" });
const view = /** @type {ModalStackSurface} */ (context.window.LongtailForge.view);

for (const helperName of ["showModal", "closeModal", "closeChildModals", "isTopModal"]) {
  assert.equal(typeof view[helperName], "function", `LongtailForge.view.${helperName} should be exposed`);
}

const parentDialog = view.createModal({ title: "Edit Note", body: ["Parent"] });
const childDialog = view.createModal({ title: "Tags", body: ["Child"] });
context.document.body.append(parentDialog, childDialog);

view.showModal(parentDialog);
assert.equal(parentDialog.open, true, "showModal should open the parent dialog");
assert.equal(parentDialog.dataset.viewModalStackLevel, "1", "Parent dialog should be stack level 1");
assert.equal(parentDialog.dataset.viewModalStackTop, "true", "Parent should be top before a child opens");

view.showModal(childDialog, { parent: parentDialog });
assert.equal(childDialog.open, true, "showModal should open the child dialog");
assert.equal(parentDialog.dataset.viewModalStackTop, undefined, "Parent should stop being top while a child is open");
assert.equal(childDialog.dataset.viewModalStackLevel, "2", "Child dialog should be stack level 2");
assert.equal(childDialog.dataset.viewModalStackTop, "true", "Child should become the top modal");
assert.equal(view.isTopModal(parentDialog), false, "Parent should not be top while child is open");
assert.equal(view.isTopModal(childDialog), true, "Child should be top while open");

const parentCancel = createFakeEvent("cancel", { target: parentDialog });
parentDialog.dispatchEvent(parentCancel);
assert.equal(parentCancel.defaultPrevented, true, "Non-top parent cancel should be prevented");

const childCancel = createFakeEvent("cancel", { target: childDialog });
childDialog.dispatchEvent(childCancel);
assert.equal(childCancel.defaultPrevented, false, "Top child cancel should not be prevented by the stack guard");

view.closeModal(parentDialog, "saved");
assert.equal(parentDialog.open, false, "Closing parent should close the parent dialog");
assert.equal(childDialog.open, false, "Closing parent should close any child dialogs");
assert.equal(view.isTopModal(parentDialog), false, "Closed parent should leave the modal stack");
assert.equal(view.isTopModal(childDialog), false, "Closed child should leave the modal stack");

view.showModal(parentDialog);
view.closeModal(null);
assert.equal(parentDialog.open, true, "closeModal without a dialog should not close unrelated top-level dialogs");
view.closeModal(parentDialog);

console.log("Notes modal stack guardrails regression passed.");
