import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The shared checked-DOM contract, and its first adoption in Clients/Projects (`0.33.33.38.3.9`).
 *
 * The contract is two steps: `find` answers the subtype or `null`, and `require` refuses that
 * `null` by name. What these cases aim at is what the compiler cannot see:
 *
 * 1. **`find` checks the first match and nothing else.** It must not search on for a later node of
 *    the right subtype, and it must stay inside the root it was given.
 * 2. **`require` refuses exactly `null`.** A falsy control value is still a value.
 * 3. **Every page receives it.** The static service injects it at `<head>`, and its guard knows
 *    about it, or a page that already carried the older scripts would never get this one.
 * 4. **Each adopted site keeps its required-or-optional decision.** A required control fails by name
 *    rather than turning into an optional no-op; the one optional lookup keeps its fallback.
 *
 * The shared module runs as shipped inside each sandbox. A stand-in could answer differently from
 * what the page is actually delivered, which is the gap `0.33.33.43.43` had to close.
 */

const reader = createProjectTextReader();
const checkedDomSource = reader.readText("public/js/shared/checked-dom.js");
const page = reader.readText("public/js/clients-projects.js");
const staticSource = reader.readText("src/services/static.service.js");
const declarationSource = reader.readText("src/types/browser-contracts.d.ts");
const baselinePage = execFileSync("git", ["show", "ed69a010:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const MISSING_CONTROL = { name: "TypeError" };

/**
 * A sandbox with a fake document, the DOM constructor stand-ins and the shipped contract loaded.
 *
 * The namespace and the contract are read back out of the sandbox, which is what the page itself
 * would see, rather than through the object this test handed in.
 * @param {Record<string, unknown>} [existing] what `window.LongtailForge` already holds
 */
function sandboxWithCheckedDom(existing) {
  const document = new FakeDocument();
  const window = existing === undefined ? {} : { LongtailForge: existing };
  const sandbox = vm.createContext({ document, window, ...fakeDomConstructors() });
  vm.runInContext(checkedDomSource, sandbox, { filename: "checked-dom.js" });
  return {
    document,
    sandbox,
    namespace: vm.runInContext("window.LongtailForge", sandbox),
    checkedDom: vm.runInContext("window.LongtailForge.checkedDom", sandbox),
  };
}

/** @param {string} text @param {string[]} names @param {import("node:vm").Context} sandbox */
function lift(text, names, sandbox) {
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(text, name), sandbox);
  }
  return vm.runInContext(`({ ${names.join(", ")} })`, sandbox);
}

/** @param {string} source @param {string} fragment */
function occurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

describe("The shared contract, as shipped", () => {
  it("publishes exactly find and require, frozen, beside what the namespace already held", () => {
    const existing = { errors: { marker: true } };
    const { namespace, checkedDom } = sandboxWithCheckedDom(existing);

    assert.equal(namespace.checkedDom, checkedDom);
    assert.equal(namespace, existing, "the namespace is extended, never replaced");
    assert.equal(existing.errors.marker, true);
    assert.deepEqual(Object.keys(checkedDom).sort(), ["find", "require"]);
    assert.ok(Object.isFrozen(checkedDom));
  });

  it("creates the namespace when the page has none yet", () => {
    const { checkedDom } = sandboxWithCheckedDom();

    assert.equal(typeof checkedDom.find, "function");
  });

  it("answers the very element that matched, when it is the subtype asked for", () => {
    const { document, sandbox, checkedDom } = sandboxWithCheckedDom();
    const root = document.createElement("form");
    const input = document.createElement("input");
    root.appendChild(input);

    assert.equal(checkedDom.find(root, "input", sandbox.HTMLInputElement), input);
  });

  it("answers null when nothing matches", () => {
    const { document, sandbox, checkedDom } = sandboxWithCheckedDom();

    assert.equal(checkedDom.find(document.createElement("div"), "input", sandbox.HTMLInputElement), null);
  });

  it("answers null when the first match is another subtype, even with a later one that is not", () => {
    const { document, sandbox, checkedDom } = sandboxWithCheckedDom();
    const root = document.createElement("div");
    const decoy = document.createElement("span");
    const later = document.createElement("button");
    decoy.dataset.control = "";
    later.dataset.control = "";
    root.append(decoy, later);

    assert.equal(checkedDom.find(root, "[data-control]", sandbox.HTMLButtonElement), null,
      "the wrong subtype is absence; searching on for a later match would pick a different control");
  });

  it("stays inside the root it was given", () => {
    const { document, sandbox, checkedDom } = sandboxWithCheckedDom();
    const root = document.createElement("div");
    document.body.append(root, document.createElement("input"));

    assert.equal(checkedDom.find(root, "input", sandbox.HTMLInputElement), null);
    assert.notEqual(checkedDom.find(document, "input", sandbox.HTMLInputElement), null,
      "the document is a root like any other");
  });

  it("requires a found value by returning it unchanged", () => {
    const { checkedDom } = sandboxWithCheckedDom();
    const control = { marker: true };

    assert.equal(checkedDom.require(control, "Owner", "control"), control);
  });

  it("refuses null with an error naming the owner and the control", () => {
    const { checkedDom } = sandboxWithCheckedDom();

    assert.throws(() => checkedDom.require(null, "Clients/Projects", "billable checkbox"),
      { ...MISSING_CONTROL, message: "Clients/Projects requires its billable checkbox." });
  });

  it("refuses only null, so a falsy value is still returned", () => {
    const { checkedDom } = sandboxWithCheckedDom();

    for (const value of [0, "", false, undefined]) {
      assert.equal(checkedDom.require(value, "Owner", "control"), value);
    }
  });
});

describe("Every rendered page receives it", () => {
  const injector = (() => {
    /** @type {{ inject?: (contents: string) => string }} */
    const context = {};
    vm.runInNewContext(`${extractFunctionBlock(staticSource, "injectErrorBoundaryScripts")}\nthis.inject = injectErrorBoundaryScripts;`, context);
    const inject = context.inject;
    if (typeof inject !== "function") {
      throw new TypeError("the head injector must be extractable from static.service.js");
    }
    return inject;
  })();
  const tag = '<script src="/js/shared/checked-dom.js"></script>';

  it("injects it once at <head>, after the other shared modules and before any page asset", () => {
    const delivered = injector("<html><head>\n<title>Page</title>\n<script src=\"js/page.js\"></script></head></html>");

    assert.equal(occurrences(delivered, tag), 1);
    assert.ok(delivered.indexOf("/js/shared/task-records.js") < delivered.indexOf(tag));
    assert.ok(delivered.indexOf(tag) < delivered.indexOf("<title>"));
    assert.ok(delivered.indexOf(tag) < delivered.indexOf("js/page.js"));
  });

  it("is known to the guard, so a page carrying only the older scripts still receives it", () => {
    const older = [
      "error-contract", "browser-recovery", "app-shell-bootstrap", "view-surface-descriptor",
      "view-response-records", "view-action-security", "view-search-options", "view-data-binding",
      "view-modal-stack", "task-lifecycle-legality", "task-records",
    ].map((name) => `<script src="/js/shared/${name}.js"></script>`).join("\n");

    assert.equal(occurrences(injector(`<html><head>\n${older}\n</head></html>`), tag), 1);
  });

  it("is not injected a second time into a page that already carries it", () => {
    const once = injector("<html><head></head></html>");

    assert.equal(injector(once), once);
  });

  it("is declared, so no consumer reaches it through an untyped global", () => {
    assert.match(declarationSource, /\n {2}checkedDom\?: BrowserCheckedDom;/);
    assert.match(declarationSource,
      /export interface BrowserCheckedDom \{\n {2}find<T extends Element>\(root: ParentNode, selector: string, constructor: \{ new \(\): T \}\): T \| null;\n {2}require<T>\(value: T \| null, owner: string, name: string\): T;\n\}/);
  });
});

describe("Clients/Projects reaches the contract through a checked accessor", () => {
  it("names itself when the contract is missing", () => {
    const sandbox = vm.createContext({ window: {} });
    const { requireCheckedDom } = lift(page, ["requireCheckedDom"], sandbox);

    assert.throws(() => requireCheckedDom(), { name: "Error", message: "Clients/Projects requires LongtailForge.checkedDom." });
  });

  it("answers the published contract itself", () => {
    const { sandbox, checkedDom } = sandboxWithCheckedDom();
    const { requireCheckedDom } = lift(page, ["requireCheckedDom"], sandbox);

    assert.equal(requireCheckedDom(), checkedDom);
  });
});

describe("The required controls fail by name rather than becoming optional", () => {
  it("returns the checkbox the billable builder appended, for every value it is given", () => {
    const { sandbox } = sandboxWithCheckedDom();
    const { createBillableCheckbox, requireBillableInput } = lift(page,
      ["requireCheckedDom", "normalizeBillableFlag", "createBillableCheckbox", "requireBillableInput"], sandbox);

    for (const value of [true, false, "yes", "no", undefined, null, "other"]) {
      const label = createBillableCheckbox(value);
      assert.equal(requireBillableInput(label), label.childNodes[0], "the input the builder appended, not a copy");
    }
  });

  it("refuses a billable label that carries no checkbox", () => {
    const { document, sandbox } = sandboxWithCheckedDom();
    const { requireBillableInput } = lift(page, ["requireCheckedDom", "requireBillableInput"], sandbox);

    assert.throws(() => requireBillableInput(document.createElement("label")),
      { ...MISSING_CONTROL, message: "Clients/Projects requires its billable checkbox." });
  });

  it("returns the first select in a parent-project label, and refuses one without", () => {
    const { document, sandbox } = sandboxWithCheckedDom();
    const { requireParentProjectSelect } = lift(page, ["requireCheckedDom", "requireParentProjectSelect"], sandbox);
    const label = document.createElement("label");
    const select = document.createElement("select");
    label.append(select, document.createElement("select"));

    assert.equal(requireParentProjectSelect(label), select);
    assert.throws(() => requireParentProjectSelect(document.createElement("label")),
      { ...MISSING_CONTROL, message: "Clients/Projects requires its parent project select." });
  });

  it("is what every required site now uses, and the null-tolerant consumer keeps its raw lookup", () => {
    assert.equal(occurrences(page, "const billableInput = requireBillableInput(billableLabel);"), 3);
    assert.equal(occurrences(page, "billableLabel.querySelector("), 0);
    assert.equal(occurrences(page, "const parentProjectSelect = requireParentProjectSelect(parentProjectLabel);"), 1);
    assert.equal(occurrences(page, "const parentProjectId = requireParentProjectSelect(parentProjectLabel).value;"), 1);
    // `populateParentProjectSelect` returns early on `null`, so these two were already optional and
    // carry no diagnostic; they are left exactly as they were.
    assert.equal(occurrences(page, "populateParentProjectSelect(parentProjectLabel.querySelector(\"select\"), {"), 2);
  });
});

describe("The one optional lookup keeps its fallback", () => {
  it("finds the form's own submit button and builds one only when it is not there", () => {
    assert.match(page,
      /const submitButton = requireCheckedDom\(\)\.find\(form, "\[data-add-project-button\]", HTMLButtonElement\)\n\s+\|\| createAddProjectSubmitButton\(client\.id\);/);
  });

  it("narrows to a button because a button is the only thing that ever carries the marker", () => {
    assert.equal(occurrences(page, "dataset.addProjectButton ="), 1);
    assert.match(extractFunctionBlock(page, "createAddProjectSubmitButton"),
      /const button = document\.createElement\("button"\);[\s\S]*button\.dataset\.addProjectButton = clientId;/);
  });
});

describe("The bulk toolbar's selects", () => {
  /**
   * The toolbar sync from one version of the page, with the selection readers it calls supplied.
   * @param {string} text @param {number} selectedCount
   */
  function syncFrom(text, selectedCount) {
    const document = new FakeDocument();
    const selected = Array.from({ length: selectedCount }, (_, index) => `id-${index}`);
    const sandbox = vm.createContext({
      document,
      ...fakeDomConstructors(),
      getSelectedClientIds: () => selected,
      getSelectedProjectIds: () => selected,
    });
    const { syncClientProjectsBulkToolbar } = lift(text, ["syncClientProjectsBulkToolbar"], sandbox);
    return { document, syncClientProjectsBulkToolbar };
  }

  /** @param {FakeDocument} document */
  function toolbarWithSelects(document) {
    const toolbar = document.createElement("div");
    const body = document.createElement("div");
    body.className = "view-bulk-action-toolbar-body";
    body.append(document.createElement("select"), document.createElement("select"));
    toolbar.appendChild(body);
    return toolbar;
  }

  it("disables and enables real selects exactly as before", () => {
    for (const selectedCount of [0, 2]) {
      const states = [page, baselinePage].map((text) => {
        const { document, syncClientProjectsBulkToolbar } = syncFrom(text, selectedCount);
        const toolbar = toolbarWithSelects(document);
        syncClientProjectsBulkToolbar("project", toolbar);
        return toolbar.querySelectorAll("select").map((select) => select.disabled);
      });

      assert.deepEqual(states[0], states[1]);
      assert.deepEqual(states[0], [selectedCount === 0, selectedCount === 0]);
    }
  });

  it("no longer writes `disabled` onto a matched node that is not a select", () => {
    const [current, baseline] = [page, baselinePage].map((text) => {
      const { document, syncClientProjectsBulkToolbar } = syncFrom(text, 0);
      const toolbar = toolbarWithSelects(document);
      // An element in the toolbar body that the selector matched but that is not a select.
      const stray = document.createElement("svg");
      const selects = toolbar.querySelectorAll("select");
      toolbar.querySelectorAll = (/** @type {string} */ selector) => (
        selector === ".view-bulk-action-toolbar-body select" ? [...selects, stray] : []
      );
      syncClientProjectsBulkToolbar("project", toolbar);
      return { selects: selects.map((select) => select.disabled), stray };
    });

    // The fake DOM gives every element an own `disabled` of `false`, so the value is what shows a
    // write: with nothing selected the page writes `true`, and an untouched node keeps `false`.
    assert.deepEqual(current.selects, baseline.selects, "the real selects are unaffected");
    assert.equal(Reflect.get(baseline.stray, "disabled"), true, "the page used to write onto it");
    assert.equal(Reflect.get(current.stray, "disabled"), false, "and now leaves the node alone");
  });
});
