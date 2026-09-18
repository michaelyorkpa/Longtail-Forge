import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");
const hostSource = readText("public/js/shared/settings-host.js");

/**
 * The settings host's catalog reads, its load-time mount and its field options, through the real
 * module and the real view factory.
 *
 * `0.33.33.39.30` took `settings-host.js` to zero and rewrote three executable paths:
 * `attachmentSections` reads the catalog through `catalogMember` instead of optional chains; the
 * load-time mount establishes that the marked host is an `HTMLElement` before handing it to the
 * published `mount`; and `field` reads `inputType` and `optionClassName` once each. These cases
 * hold each of them to what it did, and prove the one place a failure moved.
 *
 * The DOM double models every tag as one element class, so it cannot produce an element that is
 * not an `HTMLElement`. A host from another namespace is represented by an object the double's
 * `HTMLElement` stand-in rejects; the platform answers the same question for an `<svg>`.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} value */
function thrown(value) {
  assert.ok(isBag(value), "a failure should be an object");
  return { name: String(value.name), message: String(value.message) };
}

/**
 * An empty array from the module's realm, which `deepEqual` would reject for its prototype.
 * @param {unknown} value
 */
function assertEmpty(value) {
  assert.ok(Array.isArray(value) && value.length === 0, "an unusable catalog answers an empty array");
}

/**
 * Load the view factory and then the settings host into one fake page.
 *
 * `placement` marks a real `<main>` host; `foreignHost` is what the page's host query answers
 * instead; `replaceDefinition` rewrites one field descriptor before the real factory builds it.
 * @param {{ placement?: string, foreignHost?: Bag, replaceDefinition?: (definition: Bag) => Bag }} [setup]
 */
function loadHost({ placement, foreignHost, replaceDefinition } = {}) {
  const context = createFakeBrowserContext();
  const document = context.document;
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  const framework = context.window.LongtailForge;
  const view = framework.view;
  assert.ok(isBag(view) && isCallable(view.createField), "the real view factory loads");
  if (replaceDefinition) {
    const createField = view.createField;
    framework.view = {
      ...view,
      createField: (/** @type {unknown} */ definition, /** @type {unknown} */ options) => Reflect.apply(
        createField, view, [isBag(definition) ? replaceDefinition(definition) : definition, options]),
    };
  }
  const host = document.createElement("main");
  if (placement !== undefined) {
    host.dataset.settingsHost = placement;
    document.body.appendChild(host);
  }
  if (foreignHost) {
    const querySelector = document.querySelector;
    Reflect.set(document, "querySelector", (/** @type {string} */ selector) => (
      selector === "[data-settings-host]" ? foreignHost : Reflect.apply(querySelector, document, [selector])
    ));
  }
  /** @type {unknown} */
  let error = null;
  try {
    vm.runInNewContext(hostSource, context, { filename: "settings-host.js" });
  } catch (caught) {
    error = caught;
  }
  const api = framework.settingsHost;
  return { api, error, host };
}

function publishedApi() {
  const { api, error } = loadHost();
  assert.equal(error, null, "a page without a host loads cleanly");
  assert.ok(isBag(api));
  const { attachmentSections, mount } = api;
  assert.ok(isCallable(attachmentSections) && isCallable(mount));
  return {
    /** @param {unknown[]} args */
    attachmentSections: (...args) => Reflect.apply(attachmentSections, api, args),
    /** @param {unknown} hostElement */
    mount: (hostElement) => Reflect.apply(mount, api, [hostElement]),
  };
}

describe("attachmentSections reads the catalog as the optional chains did", () => {
  const { attachmentSections } = publishedApi();

  it("answers the placement's own array, and [] for anything it cannot use", () => {
    const sections = [{ id: "backup" }];
    assert.equal(attachmentSections({ attachments: { workspace: sections } }, "workspace"), sections);
    assertEmpty(attachmentSections({ attachments: { workspace: sections } }, "user"));
    assertEmpty(attachmentSections({ attachments: { user: { id: "not a list" } } }, "user"));
    for (const catalog of [undefined, null, {}, { attachments: null }, { attachments: 0 }, "catalog", 7, true]) {
      assertEmpty(attachmentSections(catalog, "workspace"));
    }
  });

  it("answers a module's own array by id, and [] for a missing module level, id or list", () => {
    const sections = [{ id: "notes-settings" }];
    const catalog = { attachments: { module: { notes: sections, tasks: "not a list" } } };
    assert.equal(attachmentSections(catalog, "module", "notes"), sections);
    assertEmpty(attachmentSections(catalog, "module", "tasks"));
    assertEmpty(attachmentSections(catalog, "module", "calendar"));
    assertEmpty(attachmentSections({ attachments: { module: null } }, "module", "notes"));
    assertEmpty(attachmentSections({ attachments: {} }, "module", "notes"));
    assert.equal(attachmentSections({ attachments: { module: { "": sections } } }, "module"), sections,
      "the module id still defaults to the empty string");
  });

  it("reads attachments once, with the catalog as the receiver", () => {
    const sections = [{ id: "profile" }];
    /** @type {unknown[]} */
    const receivers = [];
    const catalog = { get attachments() { receivers.push(this); return { user: sections }; } };
    assert.equal(attachmentSections(catalog, "user"), sections);
    assert.deepEqual(receivers.map((receiver) => receiver === catalog), [true]);
  });
});

describe("The load-time mount hands the published mount an HTML element", () => {
  it("publishes the API and mounts nothing on a page without a host", () => {
    const { api, error } = loadHost();
    assert.equal(error, null);
    assert.ok(isBag(api) && isCallable(api.mount));
  });

  it("mounts a marked <main> once, and a second mount returns it untouched", () => {
    const { api, error, host } = loadHost({ placement: "user" });
    assert.equal(error, null);
    assert.equal(host.dataset.settingsHostMounted, "true");
    const children = host.children.length;
    assert.ok(children > 0, "the user host renders into the element");
    assert.ok(isBag(api) && isCallable(api.mount));
    assert.equal(Reflect.apply(api.mount, api, [host]), host);
    assert.equal(host.children.length, children, "mounting stays idempotent");
  });

  it("still returns a missing host unchanged", () => {
    const { mount } = publishedApi();
    assert.equal(mount(null), null);
    assert.equal(mount(undefined), undefined);
  });

  it("still refuses an unknown placement with its own error", () => {
    const { error } = loadHost({ placement: "elsewhere" });
    assert.deepEqual(thrown(error), { name: "Error", message: "Unknown Settings host 'elsewhere'." });
  });

  it("fails by name for a host that is not an HTML element, after publishing and before mounting", () => {
    const foreignHost = { dataset: { settingsHost: "user" } };
    const { api, error } = loadHost({ foreignHost });
    assert.deepEqual(thrown(error), { name: "TypeError", message: "The settings host must be an HTML element." });
    assert.ok(isBag(api) && isCallable(api.mount), "the API is published before the host is checked");
    assert.deepEqual(Object.keys(foreignHost.dataset), ["settingsHost"], "the host is not marked mounted");
  });
});

describe("field applies its input type and option class once each", () => {
  it("types the password and email controls, and leaves the rest as rendered", () => {
    const { error, host } = loadHost({ placement: "user" });
    assert.equal(error, null);
    /** @param {string} key */
    const typeOf = (key) => {
      const control = host.querySelector(`[data-${key}]`);
      assert.ok(control, `the ${key} control renders`);
      return control.type;
    };
    assert.deepEqual(["current-password", "new-password", "confirm-password"].map(typeOf), ["password", "password", "password"]);
    assert.deepEqual(["profile-username", "profile-alt-email"].map(typeOf), ["email", "email"]);
    assert.equal(typeOf("profile-display-name"), "text");
  });

  it("classes exactly the theme option labels, before they are regrouped", () => {
    const { host } = loadHost({ placement: "user" });
    const classed = host.querySelectorAll(".settings-segmented-option");
    assert.deepEqual(classed.map((label) => label.tagName), ["LABEL", "LABEL", "LABEL", "LABEL"]);
    // The double does not re-parent a node its container's constructor adopts, so a descendant
    // selector cannot see the regrouped labels; each group's own children can.
    /** @param {string} selector */
    const groupClasses = (selector) => {
      const group = host.querySelector(selector);
      assert.ok(group, `${selector} renders`);
      return Array.from(group.children, (label) => label.classList.contains("settings-segmented-option"));
    };
    assert.deepEqual(groupClasses(".theme-mode-control"), [true, true, true]);
    assert.deepEqual(groupClasses(".theme-auto-source-options"), [true]);
  });

  it("still requires an input control for an input type", () => {
    const { error } = loadHost({
      placement: "user",
      replaceDefinition: (definition) => (definition.id === "newPassword"
        ? { ...definition, type: "select", options: [{ value: "x", label: "X" }] }
        : definition),
    });
    assert.deepEqual(thrown(error), { name: "Error", message: "Settings host input types apply to input controls only." });
  });

  it("still requires a rendered control for an input type", () => {
    const { error } = loadHost({
      placement: "user",
      replaceDefinition: (definition) => (definition.id === "newPassword"
        ? { ...definition, type: "radio", options: [] }
        : definition),
    });
    assert.deepEqual(thrown(error), { name: "Error", message: "Settings host fields require a rendered control." });
  });
});
