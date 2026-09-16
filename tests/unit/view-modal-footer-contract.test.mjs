import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
// The builder delegates its modal stack to LongtailForge.viewModalStack at call time, so every
// context that executes it provides one.
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * What the two modal factories actually attach as `viewParts.footer`.
 *
 * `0.33.33.39.13` corrected `BrowserViewModalParts.footer` to `HTMLElement | null` because
 * `createModal` builds a footer only for `actions.length || options.footer` and had always
 * attached `null` otherwise, while the declaration promised an element unconditionally.
 * `BrowserViewModalFormParts.footer` keeps the non-nullable type, because `createModalForm`
 * builds its footer on every path.
 *
 * **These cases are the writers' side of that decision.** They do not assert the declaration -
 * a declaration that compiles proves nothing about what runs - they assert which of the four
 * outcomes each factory produces, so that a later change to either factory has to face them.
 */

/** @typedef {Record<string, unknown>} Bag */

function view() {
  const context = createFakeBrowserContext();
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  const factory = context.window.LongtailForge.view;
  assert.ok(factory, "the builder should publish LongtailForge.view");
  return /** @type {Record<string, (...args: unknown[]) => Bag>} */ (factory);
}

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {Bag} dialog @returns {Bag} */
function parts(dialog) {
  const value = dialog.viewParts;
  assert.ok(isBag(value), "a modal should carry a viewParts record");
  return value;
}

/** Every descendant carrying the footer class, however deep. @param {unknown} node */
function footerNodes(node) {
  /** @type {Bag[]} */
  const found = [];
  /** @param {unknown} current */
  const walk = (current) => {
    if (!current || typeof current !== "object") return;
    const element = /** @type {Bag} */ (current);
    const classList = element.classList;
    if (classList && typeof classList === "object" && Reflect.get(classList, "contains")) {
      const contains = /** @type {(name: string) => boolean} */ (Reflect.get(classList, "contains"));
      if (Reflect.apply(contains, classList, ["view-modal-footer"])) found.push(element);
    }
    const children = element.children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(node);
  return found;
}

describe("What createModal attaches as its footer", () => {
  it("attaches null, and renders no footer, for a modal with neither actions nor a footer", () => {
    const factory = view();
    const dialog = factory.createModal({ title: "Bare" });
    assert.equal(parts(dialog).footer, null, "the part is null rather than absent or an empty element");
    assert.equal(footerNodes(dialog).length, 0, "and nothing footer-shaped is rendered");
  });

  it("attaches null for an empty action list and an empty footer, which are both falsy here", () => {
    const factory = view();
    for (const options of [{ title: "A", actions: [] }, { title: "B", footer: null }, { title: "C", actions: [], footer: undefined }]) {
      const dialog = factory.createModal(options);
      assert.equal(parts(dialog).footer, null, `options: ${JSON.stringify(Object.keys(options))}`);
    }
  });

  it("builds a footer for an explicit footer, with no actions at all", () => {
    const factory = view();
    const note = factory.createElement("p", { text: "Small print" });
    const dialog = factory.createModal({ title: "Explicit", footer: note });
    const footer = parts(dialog).footer;
    assert.notEqual(footer, null, "an explicit footer is enough on its own");
    assert.equal(footerNodes(dialog).length, 1);
    assert.equal(footerNodes(dialog)[0], footer, "and the part is the rendered element");
  });

  it("builds a footer for actions, and puts them in the commit group", () => {
    const factory = view();
    const save = factory.createElement("button", { text: "Save" });
    const dialog = factory.createModal({ title: "Actions", actions: [save] });
    const footer = parts(dialog).footer;
    assert.notEqual(footer, null);
    const groups = Array.isArray(Reflect.get(footer ?? {}, "children")) ? Reflect.get(footer ?? {}, "children") : [];
    assert.equal(groups.length, 1, "one group, for the commit actions");
    assert.equal(groups[0].getAttribute("data-modal-footer-group"), "commit");
    assert.equal(groups[0].children[0], save, "and the caller's own button is the one appended");
  });

  it("keeps body and title non-null on the footerless path, so only the footer is affected", () => {
    const factory = view();
    const dialog = factory.createModal({ title: "Bare" });
    assert.notEqual(parts(dialog).title, null);
    assert.notEqual(parts(dialog).body, null);
    assert.equal(parts(dialog).footer, null);
  });
});

describe("What createModalForm attaches as its footer", () => {
  it("builds a footer with no actions, which is the stronger guarantee its consumers read", () => {
    const factory = view();
    const dialog = factory.createModalForm({ title: "Empty form" });
    const footer = parts(dialog).footer;
    assert.notEqual(footer, null, "a form modal always has a footer");
    assert.equal(footerNodes(dialog).length, 1);
    assert.equal(footerNodes(dialog)[0], footer);
  });

  it("builds it for an empty action list too, which is the case that would have been null on a plain modal", () => {
    const factory = view();
    for (const options of [{ title: "A", actions: [] }, { title: "B" }, { title: "C", fields: [] }]) {
      const dialog = factory.createModalForm(options);
      assert.notEqual(parts(dialog).footer, null, `options: ${JSON.stringify(Object.keys(options))}`);
    }
  });

  it("puts the footer inside the form, alongside the title and body it also exposes", () => {
    const factory = view();
    const dialog = factory.createModalForm({ title: "Shaped" });
    const form = parts(dialog).form;
    assert.ok(form, "a form modal exposes its form");
    const children = Reflect.get(form, "children");
    assert.ok(Array.isArray(children));
    assert.equal(children.length, 3, "title, body, footer");
    assert.equal(children[0], parts(dialog).title);
    assert.equal(children[1], parts(dialog).body);
    assert.equal(children[2], parts(dialog).footer);
  });

  it("carries the commit actions it was given", () => {
    const factory = view();
    const save = factory.createElement("button", { text: "Save" });
    const dialog = factory.createModalForm({ title: "Form", actions: [save] });
    const footer = parts(dialog).footer;
    const groups = Reflect.get(footer ?? {}, "children");
    assert.ok(Array.isArray(groups));
    assert.equal(groups.at(-1).getAttribute("data-modal-footer-group"), "commit");
    assert.equal(groups.at(-1).children[0], save);
  });
});

describe("The one consumer that reads a plain modal's footer", () => {
  /**
   * `shared/file-preview.js` is the only reader of `createModal`'s footer, and it already
   * guarded with `if (dialog.viewParts?.footer)` before this checkpoint. That conditional is
   * what the corrected declaration describes, so it is asserted as source rather than left to
   * be re-derived: genuinely optional footer work stays conditional.
   */
  it("still decorates the footer conditionally rather than unconditionally", () => {
    const preview = readText("public/js/shared/file-preview.js");
    assert.match(
      preview,
      /if \(dialog\.viewParts\?\.footer\) \{[\s\S]*?dialog\.viewParts\.footer\.classList\.add\("files-preview-actions"\)/,
      "the preview modal's footer work should stay behind its presence check",
    );
  });

  it("is the only unguarded-free reader: every other footer read is on a modal form", () => {
    for (const [path, constructors] of [
      ["public/js/notes.js", 3],
      ["public/js/files.js", 1],
      ["public/js/task-dialog.js", 2],
    ]) {
      const text = readText(String(path));
      const reads = text.match(/viewParts\.footer/g) || [];
      assert.ok(reads.length > 0, `${path} should still read a modal footer`);
      const formModals = text.match(/renderDescriptorModalForm\(|createModalForm\(/g) || [];
      assert.ok(
        formModals.length >= Number(constructors),
        `${path} should still build its footer-reading modals as form modals, which keep a non-null footer`,
      );
      assert.doesNotMatch(
        text,
        /view\.createModal\(\{[\s\S]{0,4000}?viewParts\.footer\.(classList|dataset)/,
        `${path} should not read a plain modal's footer unguarded`,
      );
    }
  });
});
