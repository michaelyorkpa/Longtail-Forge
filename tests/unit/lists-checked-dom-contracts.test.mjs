import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, createFakeBrowserContext, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * Lists' adoption of the shared checked-DOM contract (`0.33.33.38.3.10`).
 *
 * What the compiler cannot see, and these cases pin:
 *
 * 1. **Nothing is required at capture.** `cacheListsElements` runs on both paths, and the
 *    dialog-only path has no workspace markup, so its handles are `null` there. Capture must still
 *    succeed; a required control is checked only where the page already read it unguarded.
 * 2. **Each check sits exactly where the unguarded read was.** A read inside a callback or a
 *    conditional branch still fails only when that code runs. Proved against the implementation it
 *    replaced, lifted from `da87725e`: same outcome in every case, and a named error where the old
 *    code threw a native one.
 * 3. **The iterations skip what they never needed.** A matched node that is not an HTML element is
 *    left alone rather than written to.
 *
 * The shipped `shared/checked-dom.js` runs in every sandbox, not a stand-in.
 */

const reader = createProjectTextReader();
const source = reader.readText("public/js/lists.js");
const checkedDomSource = reader.readText("public/js/shared/checked-dom.js");
const baseline = execFileSync("git", ["show", "da87725e:public/js/lists.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** The handles the page requires at a read, and how many reads each had. */
const REQUIRED_READS = Object.freeze({
  listFormStatus: 13, listLinkApplyButton: 5, itemDialogForm: 5, listSaveButton: 4,
  listTypeInput: 3, listTitleInput: 3, listMount: 3, itemDialogSave: 3, itemDialogFormStatus: 3,
  listProjectInput: 2, listLinkResultsInput: 2, listDialogTitle: 2, listDescriptionInput: 2,
  listClientInput: 2, detailPanel: 2, itemDialogTitle: 1,
});

/**
 * A sandbox holding the shipped contract, the page's accessor and adapter, and whatever else a
 * case lifts from one version of the page.
 * @param {string} text @param {string[]} names @param {Record<string, unknown>} [globals]
 */
function liftFrom(text, names, globals = {}) {
  const sandbox = vm.createContext({ window: {}, document: new FakeDocument(), ...fakeDomConstructors(), ...globals });
  vm.runInContext(checkedDomSource, sandbox, { filename: "checked-dom.js" });
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(text, name), sandbox);
  }
  return sandbox;
}

/** @param {() => unknown} run @returns {{ threw: false, value: unknown } | { threw: true, name: string, message: string }} */
function outcome(run) {
  try {
    return { threw: false, value: run() };
  } catch (error) {
    return { threw: true, name: String(Reflect.get(Object(error), "name")), message: String(Reflect.get(Object(error), "message")) };
  }
}

describe("The accessor and the handle adapter", () => {
  it("names itself when the contract is missing", () => {
    const sandbox = vm.createContext({ window: {} });
    vm.runInContext(extractFunctionBlock(source, "requireCheckedDom"), sandbox);

    assert.throws(() => vm.runInContext("requireCheckedDom()", sandbox),
      { name: "Error", message: "Lists requires LongtailForge.checkedDom." });
  });

  it("returns a present handle itself and refuses null by name", () => {
    const sandbox = liftFrom(source, ["requireCheckedDom", "requireListsHandle"]);
    const handle = { marker: true };

    assert.equal(vm.runInContext("requireListsHandle", sandbox)(handle, "item form"), handle);
    assert.throws(() => vm.runInContext("requireListsHandle", sandbox)(null, "item form"),
      { name: "TypeError", message: "Lists requires its item form." });
  });
});

describe("Nothing is required at capture", () => {
  const helpers = ["requireCheckedDom", "findListsFormControl", "findListsSelect", "findListsForm",
    "findListsDialog", "findListsHtmlElement", "cacheListsElements"];

  /** The module handle declarations, lifted exactly as the page declares them. */
  const declarations = () => {
    const start = source.indexOf("  let pageTitle = null;");
    const end = source.indexOf("  let itemDialogFormStatus = null;");
    assert.ok(start > 0 && end > start, "the handle declarations are still one run");
    return source.slice(start, end) + "  let itemDialogFormStatus = null;\n";
  };

  it("captures the dialog-only shell without requiring the workspace handles it lacks", () => {
    const sandbox = liftFrom(source, helpers);
    vm.runInContext(declarations(), sandbox);
    /** @type {FakeDocument} */
    const document = sandbox.document;
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const status = document.createElement("div");
    const title = document.createElement("input");
    dialog.dataset.listDialog = "";
    form.dataset.listForm = "";
    status.dataset.listFormStatus = "";
    title.dataset.listTitle = "";
    form.append(status, title);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    vm.runInContext("cacheListsElements()", sandbox);

    const read = (/** @type {string} */ name) => vm.runInContext(name, sandbox);
    assert.equal(read("listDialog"), dialog);
    assert.equal(read("listForm"), form);
    assert.equal(read("listFormStatus"), status);
    assert.equal(read("listTitleInput"), title);
    for (const absent of ["listMount", "detailPanel", "indexPanel", "itemDialogForm", "itemDialogSave"]) {
      assert.equal(read(absent), null, `${absent} is simply absent on the dialog-only path`);
    }
  });

  it("captures the index panel only as the <details> it is", () => {
    /** @type {[string, boolean][]} */
    const shapes = [["details", true], ["div", false]];
    for (const [tag, kept] of shapes) {
      const sandbox = liftFrom(source, helpers);
      vm.runInContext(declarations(), sandbox);
      /** @type {FakeDocument} */
      const document = sandbox.document;
      const panel = document.createElement(tag);
      panel.dataset.listsIndexPanel = "";
      document.body.appendChild(panel);
      vm.runInContext("cacheListsElements()", sandbox);

      assert.equal(vm.runInContext("indexPanel", sandbox), kept ? panel : null, `a ${tag}`);
    }
  });

  it("keeps every requirement out of the capture itself", () => {
    const capture = extractFunctionBlock(source, "cacheListsElements");
    assert.doesNotMatch(capture, /requireListsHandle|\.require\(/, "capture finds; it never requires");
  });
});

describe("Each check sits exactly where the unguarded read was", () => {
  it("requires every read the page made unguarded, and names each control consistently", () => {
    let total = 0;
    for (const [handle, reads] of Object.entries(REQUIRED_READS)) {
      const uses = [...source.matchAll(new RegExp(`requireListsHandle\\(${handle}, "([^"]+)"\\)`, "g"))];
      assert.equal(uses.length, reads, `${handle} is required at each of its ${reads} unguarded reads`);
      assert.equal(new Set(uses.map((use) => use[1])).size, 1, `${handle} is named one way`);
      total += uses.length;
    }
    assert.equal(total, 55);
  });

  /**
   * `syncClientFromProject` reads the project control inside a `find` callback, which runs only
   * when there are projects. The check has to stay inside it.
   * @param {string} text @param {unknown[]} projects @param {unknown} projectInput @param {unknown} clientInput
   */
  function syncFrom(text, projects, projectInput, clientInput) {
    const sandbox = liftFrom(text, ["requireCheckedDom", "requireListsHandle", "syncClientFromProject"].filter(
      (name) => text.includes(`function ${name}(`),
    ), { allProjects: () => projects, listProjectInput: projectInput, listClientInput: clientInput });
    return outcome(() => vm.runInContext("syncClientFromProject()", sandbox));
  }

  it("keeps the project read inside its callback, proved against the replaced implementation", () => {
    const project = { id: "p", client_id: "c" };
    const clientInput = { value: "" };
    const cases = [
      { projects: [], projectInput: null, expect: "no-throw", why: "no project, so the callback never reads" },
      { projects: [project], projectInput: null, expect: "throw", why: "the callback reads a missing control" },
      { projects: [project], projectInput: { value: "p" }, expect: "no-throw", why: "a present control" },
    ];
    for (const { projects, projectInput, expect, why } of cases) {
      const now = syncFrom(source, projects, projectInput, clientInput);
      const before = syncFrom(baseline, projects, projectInput, clientInput);
      assert.equal(now.threw, before.threw, `same outcome as before: ${why}`);
      assert.equal(now.threw, expect === "throw", why);
      if (now.threw && before.threw) {
        assert.equal(now.name, "TypeError");
        assert.equal(before.name, "TypeError", "the old read threw natively");
        assert.equal(now.message, "Lists requires its list project select.", "and now names the control");
      }
    }
    assert.equal(clientInput.value, "c", "a present control still drives the client");
  });

  it("fails the selection sync by name when the index region is missing, as the old read failed", () => {
    for (const text of [source, baseline]) {
      const sandbox = liftFrom(text, ["requireCheckedDom", "requireListsHandle", "updateListSelectionState"].filter(
        (name) => text.includes(`function ${name}(`),
      ), { listMount: null, state: { selectedListId: "a" } });
      const result = outcome(() => vm.runInContext("updateListSelectionState()", sandbox));
      assert.equal(result.threw, true);
      if (text === source && result.threw) {
        assert.equal(result.message, "Lists requires its list index region.");
      }
    }
  });
});

describe("The iterations skip what they never needed", () => {
  it("syncs selection on the index buttons and skips a match that is not an HTML element", () => {
    const run = (/** @type {string} */ text) => {
      const document = new FakeDocument();
      const buttons = ["a", "b"].map((id) => {
        const button = document.createElement("button");
        button.dataset.viewIndexId = id;
        return button;
      });
      const touched = { count: 0 };
      const stray = { dataset: { viewIndexId: "a" }, classList: { toggle() { touched.count += 1; } }, setAttribute() {}, removeAttribute() {} };
      const listMount = { querySelectorAll: () => [...buttons, stray] };
      const sandbox = liftFrom(text, ["requireCheckedDom", "requireListsHandle", "updateListSelectionState"].filter(
        (name) => text.includes(`function ${name}(`),
      ), { listMount, state: { selectedListId: "a" } });
      vm.runInContext("updateListSelectionState()", sandbox);
      return {
        selected: buttons.map((button) => button.classList.contains("is-selected")),
        current: buttons.map((button) => button.getAttribute("aria-current")),
        strayTouched: touched.count,
      };
    };
    const now = run(source);
    const before = run(baseline);

    assert.deepEqual(now.selected, before.selected, "the real buttons are synced exactly as before");
    assert.deepEqual(now.current, before.current);
    assert.deepEqual(now.selected, [true, false]);
    assert.equal(before.strayTouched, 1, "the page used to write onto it");
    assert.equal(now.strayTouched, 0, "and now leaves it alone");
  });

  it("toggles hidden on the page's controls and leaves a non-HTML match unwritten", () => {
    for (const name of ["setBusinessControlsVisible", "setContextControlsVisible"]) {
      const results = [source, baseline].map((text) => {
        const fake = new FakeDocument();
        const control = fake.createElement("label");
        /** @type {Record<string, unknown>} */
        const stray = { hidden: false };
        const sandbox = liftFrom(text, [name], { document: { querySelectorAll: () => [control, stray] } });
        vm.runInContext(`${name}(false)`, sandbox);
        return { control: control.hidden, stray: stray.hidden };
      });
      assert.equal(results[0].control, true, `${name} still hides the page's control`);
      assert.equal(results[0].control, results[1].control);
      assert.equal(results[1].stray, true, `${name} used to write onto a non-HTML match`);
      assert.equal(results[0].stray, false, "and now leaves it alone");
    }
  });
});

describe("The optional lookups keep their optionality", () => {
  it("focuses the item name only when it is the input the field builder makes", () => {
    const line = source.split("\n").find((text) => text.includes("[name='item_name']") && text.includes("focus"));
    assert.ok(line, "the focus line is still there");
    assert.match(line, /requireCheckedDom\(\)\.find\(requireListsHandle\(itemDialogForm, "item form"\), "\[name='item_name'\]", HTMLInputElement\)\?\.focus\(\);/,
      "the form is required, as its read already was; the field stays optional, as its ?. already said");
  });

  it("reads the linked-context picker's parts through the framework's own record", () => {
    // `0.33.33.38.3.11` discharged what this checkpoint reported and left: the picker's parts now
    // come from `LongtailForge.view.partsOf`, with the same `{}` for an absent picker. The real
    // builder runs here, and the result is compared with the replaced `viewParts` read.
    const builderSource = reader.readText("public/js/shared/view-builder.js");
    const modalStackSource = reader.readText("public/js/shared/view-modal-stack.js");
    /** @param {string} text @param {(document: FakeDocument, view: { createLinkedContextPicker: (options: object) => unknown }) => unknown} pickerFor */
    const partsFrom = (text, pickerFor) => {
      const context = createFakeBrowserContext();
      vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
      vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
      const view = vm.runInContext("window.LongtailForge.view", context);
      const picker = pickerFor(context.document, view);
      context.listLinkPicker = picker;
      for (const name of ["requireView", "listEditorPickerParts"]) {
        vm.runInContext(extractFunctionBlock(text, name), context);
      }
      return { picker, parts: vm.runInContext("listEditorPickerParts()", context) };
    };

    const built = partsFrom(source, (_document, view) => view.createLinkedContextPicker({}));
    assert.equal(built.parts, Reflect.get(Object(built.picker), "viewParts"), "a framework picker answers its own parts");
    const replaced = partsFrom(baseline, (_document, view) => view.createLinkedContextPicker({}));
    assert.equal(replaced.parts, Reflect.get(Object(replaced.picker), "viewParts"), "as the replaced read did");

    assert.deepEqual(JSON.parse(JSON.stringify(partsFrom(source, () => null).parts)), {}, "no picker still answers {}");

    const imitation = (/** @type {FakeDocument} */ document) => {
      const element = document.createElement("section");
      Object.defineProperty(element, "viewParts", { value: { setRecords() {} } });
      return element;
    };
    assert.equal(typeof partsFrom(baseline, imitation).parts.setRecords, "function",
      "the replaced read took any viewParts property");
    assert.deepEqual(Object.keys(partsFrom(source, imitation).parts), [],
      "and the framework's record answers only for a picker it built - unreachable, since the page's shell builds it");
  });
});
