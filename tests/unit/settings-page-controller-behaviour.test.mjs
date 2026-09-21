import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/settings-page-controller.js");

/**
 * The settings page controller's dirty tracking, through the shipped module.
 *
 * `0.33.33.39.43` typed it against the published `BrowserSettingsPageControllerOptions`, whose
 * `root` is an `Element` because a caller supplies one. The controls, buttons and dialog it
 * collects are `Element`s by selector, so every member beyond an element's own is read the way
 * the property access read it. Nothing had executed this file before; these cases are that
 * coverage, and they hold the snapshot, the dirty flag and the two actions gated on it.
 */

/** @typedef {Record<string, unknown>} Bag */

/**
 * One node of the fake page. The control members are optional because a real page's controls
 * differ, and the controller reads each of them as the property access read it.
 *
 * @typedef {{
 *   tag: string,
 *   attrs: Record<string, string>,
 *   listeners: Record<string, unknown[]>,
 *   classes: string[],
 *   isConnected: boolean,
 *   offsetWidth: number,
 *   parent: FakeElement | null,
 *   dataset: Record<string, string>,
 *   classList: { add: (name: string) => void, remove: (name: string) => void },
 *   addEventListener: (name: string, handler: unknown) => void,
 *   setAttribute: (name: string, value: string) => void,
 *   removeAttribute: (name: string) => void,
 *   hasAttribute: (name: string) => boolean,
 *   matches: (selector: string) => boolean,
 *   closest: (selector: string) => FakeElement | null,
 *   type?: string,
 *   value?: string,
 *   checked?: boolean,
 *   disabled?: boolean,
 *   multiple?: boolean,
 *   selected?: boolean,
 *   options?: FakeElement[],
 *   selectedOptions?: FakeElement[],
 *   querySelectorAll?: (selector: string) => FakeElement[],
 *   querySelector?: (selector: string) => FakeElement | null,
 * }} FakeElement
 */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

/** @param {() => unknown} run */
function thrown(run) {
  try {
    run();
  } catch (error) {
    return { name: nameOf(error), message: isBag(error) ? String(error.message) : "" };
  }
  return null;
}

/**
 * One element of the fake page. `attrs` decides what selectors it answers, and the members the
 * controller reads off a control are plain properties so a missing one answers `undefined`.
 *
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {Partial<FakeElement>} [extra]
 * @returns {FakeElement}
 */
function element(tag, attrs = {}, extra = {}) {
  /** @type {Record<string, unknown[]>} */
  const listeners = {};
  /** @type {string[]} */
  const classes = [];
  /** @type {FakeElement} */
  const node = {
    tag,
    attrs,
    listeners,
    classes,
    isConnected: true,
    offsetWidth: 0,
    /** @type {FakeElement | null} */
    parent: null,
    /** @type {Record<string, string>} */
    dataset: {},
    classList: {
      /** @param {string} name */
      add: (name) => { if (!classes.includes(name)) classes.push(name); },
      /** @param {string} name */
      remove: (name) => {
        const at = classes.indexOf(name);
        if (at >= 0) classes.splice(at, 1);
      },
    },
    /** @param {string} name @param {unknown} handler */
    addEventListener: (name, handler) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(handler);
    },
    /** @param {string} name */
    setAttribute: (name, /** @type {string} */ value) => { attrs[name] = value; },
    /** @param {string} name */
    removeAttribute: (name) => { Reflect.deleteProperty(attrs, name); },
    /** @param {string} name */
    hasAttribute: (name) => Object.hasOwn(attrs, name),
    /** @param {string} selector */
    matches: (selector) => selector.split(",").some((part) => matchesOne(node, part.trim())),
    /** @param {string} selector */
    closest: (selector) => {
      /** @type {FakeElement | null} */
      let cursor = node;
      while (cursor) {
        if (cursor.matches(selector)) return cursor;
        cursor = cursor.parent;
      }
      return null;
    },
    ...extra,
  };
  return node;
}

/** @param {FakeElement} node @param {string} selector */
function matchesOne(node, selector) {
  const attribute = selector.match(/^\[([^\]=]+)(?:='([^']*)')?\]$/);
  if (attribute) {
    const [, name, value] = attribute;
    return Object.hasOwn(node.attrs, name) && (value === undefined || node.attrs[name] === value);
  }
  const tagWithAttribute = selector.match(/^([a-z]+)\[([^\]=]+)='([^']*)'\]$/);
  if (tagWithAttribute) {
    const [, tag, name, value] = tagWithAttribute;
    return node.tag === tag && node.attrs[name] === value;
  }
  return node.tag === selector;
}

/**
 * A page: a host, a scope, and whatever controls and buttons the case needs. Descendant
 * selectors are answered by walking the flat list, which is enough for the two this file uses.
 *
 * @param {{ controls?: FakeElement[], buttons?: FakeElement[], host?: FakeElement }} [parts]
 */
function page(parts = {}) {
  const scope = element("div", { "data-settings-scope": "" });
  const host = parts.host || element("div", { "data-settings-host": "" });
  const controls = parts.controls || [];
  const buttons = parts.buttons || [];
  for (const control of controls) {
    control.parent = control.parent || scope;
  }
  scope.parent = host;
  // Read live rather than snapshotted, so a control added after wiring is discoverable - which
  // is the case that proves the controller re-lists rather than trusting its snapshot.
  const all = () => [scope, ...controls, ...buttons];

  /** @param {string} selector */
  const find = (selector) => {
    const parts2 = selector.split(" ");
    const last = parts2[parts2.length - 1];
    return all().filter((node) => {
      if (!last.split(",").some((one) => matchesOne(node, one.trim()))) return false;
      if (parts2.length === 1) return true;
      return Boolean(node.closest(parts2[0]));
    });
  };

  Object.assign(host, {
    /** @param {string} selector */
    querySelectorAll: (selector) => selector.split(",").flatMap((one) => find(one.trim())),
    /** @param {string} selector */
    querySelector: (selector) => find(selector.trim())[0] || null,
  });
  return { host, scope, controls, buttons };
}

/** @param {{ host?: FakeElement }} [context] */
function controller(context = {}) {
  /** @type {unknown[]} */
  const dirtyChanges = [];
  /** @type {Bag} */
  const window = {
    location: { href: "https://forge.test/settings.html", origin: "https://forge.test", assign: () => {} },
    URL,
    addEventListener: () => {},
  };
  const document = {
    baseURI: "https://forge.test/settings.html",
    addEventListener: () => {},
    /** @param {string} selector */
    querySelector: (selector) => (context.host && selector === "[data-settings-host]" ? context.host : null),
  };
  vm.runInNewContext(source, { window, document }, { filename: "settings-page-controller.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const published = namespace.settingsPageController;
  assert.ok(isBag(published));
  const create = published.create;
  assert.equal(typeof create, "function");
  /** @param {unknown} options */
  const build = (options) => Reflect.apply(/** @type {Function} */ (create), published, [options]);
  return { build, dirtyChanges };
}

/** @param {string} type @param {string} value @param {Record<string, unknown>} [extra] */
function control(type, value, extra = {}) {
  return element("input", { type }, { type, value, ...extra });
}

describe("the host the controller wires", () => {
  it("refuses to run without one", () => {
    const { build } = controller();
    const failure = thrown(() => build({}));
    assert.equal(failure?.message, "Settings page controller requires a settings host.");
  });

  it("prefers the root it was given over the page's own", () => {
    const given = page();
    const fallback = page();
    const { build } = controller({ host: fallback.host });
    const handle = build({ root: given.host });
    assert.ok(isBag(handle));
    assert.equal(given.host.dataset.settingsDirty, "false", "the given root is the one wired");
    assert.equal(fallback.host.dataset.settingsDirty, undefined);
  });

  it("falls back to the page's settings host", () => {
    const fallback = page();
    const { build } = controller({ host: fallback.host });
    build({});
    assert.equal(fallback.host.dataset.settingsDirty, "false");
  });

  it("fails where a host carrying no dataset always failed", () => {
    // `root` is an `Element`, and `dataset` is not every element's. The write fails as it did,
    // named here rather than reported as an anonymous property access.
    const bare = page();
    Reflect.deleteProperty(bare.host, "dataset");
    const { build } = controller();
    const failure = thrown(() => build({ root: bare.host }));
    assert.equal(failure?.name, "TypeError");
    assert.match(String(failure?.message), /dataset/);
  });
});

describe("the snapshot the dirty flag is measured against", () => {
  /** @param {FakeElement[]} controls @param {Bag} [options] */
  function wired(controls, options = {}) {
    const built = page({ controls, buttons: [
      element("button", { "data-settings-page-save": "" }),
      element("button", { "data-settings-page-revert": "" }),
    ] });
    const { build } = controller();
    const handle = build({ root: built.host, ...options });
    assert.ok(isBag(handle));
    return { ...built, handle };
  }

  it("starts clean, with both actions gated off", () => {
    const { host, buttons, handle } = wired([control("text", "one")]);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false);
    assert.equal(host.dataset.settingsDirty, "false");
    assert.deepEqual(buttons.map((button) => button.disabled), [true, true],
      "Save and Revert are both disabled while the form is clean");
  });

  it("becomes dirty when a tracked control's value moves, and ungates both actions", () => {
    const field = control("text", "one");
    const { host, buttons, handle } = wired([field]);
    field.value = "two";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true);
    assert.equal(host.dataset.settingsDirty, "true");
    assert.deepEqual(buttons.map((button) => button.disabled), [false, false]);
  });

  it("reads a checkbox as its checked state rather than its value", () => {
    const box = control("checkbox", "on", { checked: false });
    const { handle } = wired([box]);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false);
    box.checked = true;
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true);
  });

  it("notices a control that appeared after the snapshot was taken", () => {
    const first = control("text", "one");
    const built = wired([first]);
    const added = control("text", "new");
    added.parent = built.scope;
    built.controls.push(added);
    Reflect.apply(/** @type {Function} */ (built.handle.updateDirtyState), built.handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (built.handle.isDirty), built.handle, []), true);
  });

  it("ignores a disabled control and one inside an action form", () => {
    const disabled = control("text", "one", { disabled: true });
    const actionForm = element("form", { "data-settings-action-form": "" });
    const inAction = control("text", "one");
    const built = page({ controls: [disabled, inAction], buttons: [] });
    actionForm.parent = built.scope;
    inAction.parent = actionForm;
    const { build } = controller();
    const handle = build({ root: built.host });
    assert.ok(isBag(handle));

    disabled.value = "changed";
    inAction.value = "changed";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false,
      "neither control is tracked, so neither can make the form dirty");
  });

  it("decides what an input event is allowed to dirty, by where the target sits", () => {
    // `listControls` and `isTrackedControl` answer the same question on different paths: the
    // first when the flag is recomputed, the second when an event arrives. This is the event
    // path, so an action-form control must be refused here too.
    const tracked = control("text", "one");
    const actionForm = element("form", { "data-settings-action-form": "" });
    const untracked = control("text", "one");
    const built = page({ controls: [tracked, untracked], buttons: [] });
    actionForm.parent = built.scope;
    untracked.parent = actionForm;
    const { build } = controller();
    const handle = build({ root: built.host });
    assert.ok(isBag(handle));

    const handlers = built.host.listeners.input || [];
    assert.equal(handlers.length, 1, "the host listens for input once");
    /** @param {FakeElement | null} target */
    const sendInput = (target) => Reflect.apply(
      /** @type {Function} */ (handlers[0]), built.host, [{ target }]);

    untracked.value = "changed";
    sendInput(untracked);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false,
      "an action-form control is not tracked, so its own event dirties nothing");

    tracked.value = "changed";
    sendInput(tracked);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true,
      "a control in the settings scope does");

    sendInput(null);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true,
      "an event with no target is not a control, and changes nothing");
  });

  it("does not flash the save button when an action-form control loses focus", () => {
    // `listControls` already refuses an action-form control, so mistaking one for tracked
    // cannot move the dirty flag. What it would do is flash Save on the way past, which is
    // user-visible - so this is where that refusal is actually observable.
    const tracked = control("text", "one");
    const actionForm = element("form", { "data-settings-action-form": "" });
    const untracked = control("text", "one");
    const save = element("button", { "data-settings-page-save": "" });
    const built = page({ controls: [tracked, untracked], buttons: [save] });
    actionForm.parent = built.scope;
    untracked.parent = actionForm;
    const { build } = controller();
    const handle = build({ root: built.host });
    assert.ok(isBag(handle));

    tracked.value = "changed";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true);

    const handlers = built.host.listeners.focusout || [];
    assert.equal(handlers.length, 1);
    Reflect.apply(/** @type {Function} */ (handlers[0]), built.host, [{ target: untracked }]);
    assert.deepEqual(save.classes, [], "the action-form control never reached the flash");

    Reflect.apply(/** @type {Function} */ (handlers[0]), built.host, [{ target: tracked }]);
    assert.deepEqual(save.classes, ["is-unsaved-flash"], "a tracked one does");
  });

  it("re-baselines on setClean, so the same value is no longer a change", () => {
    const field = control("text", "one");
    const { handle, host } = wired([field]);
    field.value = "two";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true);

    Reflect.apply(/** @type {Function} */ (handle.setClean), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false);
    assert.equal(host.dataset.settingsDirty, "false");
  });

  it("reports every flag change to the caller's listener", () => {
    /** @type {unknown[]} */
    const changes = [];
    const field = control("text", "one");
    const { handle } = wired([field], { onDirtyChange: (/** @type {unknown} */ next) => changes.push(next) });
    assert.deepEqual(changes, [false], "the initial clean state is reported");
    field.value = "two";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.deepEqual(changes, [false, true]);
  });
});

describe("the two actions the dirty flag gates", () => {
  /** @param {Bag} options */
  function wiredButtons(options) {
    const field = control("text", "one");
    const save = element("button", { "data-settings-page-save": "" });
    const revert = element("button", { "data-settings-page-revert": "" });
    const built = page({ controls: [field], buttons: [save, revert] });
    const { build } = controller();
    const handle = build({ root: built.host, ...options });
    assert.ok(isBag(handle));
    /** @param {FakeElement} button */
    const click = (button) => {
      const handlers = button.listeners.click || [];
      assert.equal(handlers.length, 1);
      return Reflect.apply(/** @type {Function} */ (handlers[0]), button, []);
    };
    return { field, save, revert, handle, click };
  }

  it("does nothing while the form is clean", async () => {
    let saves = 0;
    const { save, click } = wiredButtons({ onSave: () => { saves += 1; } });
    await click(save);
    assert.equal(saves, 0, "a clean form has nothing to save");
  });

  it("saves and cleans when the caller answers anything but false", async () => {
    /** @type {unknown[]} */
    const answers = [undefined, true, "ok", 0];
    for (const answer of answers) {
      const { field, save, handle, click } = wiredButtons({ onSave: () => answer });
      field.value = "two";
      Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
      await click(save);
      assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false,
        `answer: ${String(answer)}`);
    }
  });

  it("leaves the form dirty when the caller answers exactly false", async () => {
    const { field, save, handle, click } = wiredButtons({ onSave: () => false });
    field.value = "two";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    await click(save);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true,
      "a refused save keeps the page dirty, which is what keeps both actions available");
  });

  it("writes the snapshot back on revert and reports it", async () => {
    let reverts = 0;
    const { field, revert, handle, click } = wiredButtons({ onRevert: () => { reverts += 1; } });
    field.value = "two";
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    await click(revert);
    assert.equal(field.value, "one", "the control is written back to its snapshot value");
    assert.equal(reverts, 1);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), false);
  });

  it("snapshots and restores a multiple select through its selected options", async () => {
    // The only branch that reads the option list rather than a single value, and the only one
    // whose snapshot is JSON rather than the control's own text.
    const options = [
      element("option", {}, { value: "a", selected: true }),
      element("option", {}, { value: "b", selected: false }),
      element("option", {}, { value: "c", selected: true }),
    ];
    const select = element("select", { type: "select-multiple" }, {
      type: "select-multiple",
      multiple: true,
      options,
      selectedOptions: options.filter((option) => option.selected),
    });
    const revert = element("button", { "data-settings-page-revert": "" });
    const built = page({ controls: [select], buttons: [revert] });
    const { build } = controller();
    const handle = build({ root: built.host });
    assert.ok(isBag(handle));

    // Deselect everything, which the live collection reflects the way the DOM's would.
    options.forEach((option) => { option.selected = false; });
    Reflect.set(select, "selectedOptions", []);
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    assert.equal(Reflect.apply(/** @type {Function} */ (handle.isDirty), handle, []), true);

    const handlers = revert.listeners.click || [];
    await Reflect.apply(/** @type {Function} */ (handlers[0]), revert, []);
    assert.deepEqual(options.map((option) => option.selected), [true, false, true],
      "the snapshot restored exactly the options that had been selected");
  });

  it("restores a checkbox through its checked state", async () => {
    const box = control("checkbox", "on", { checked: true });
    const revert = element("button", { "data-settings-page-revert": "" });
    const built = page({ controls: [box], buttons: [revert] });
    const { build } = controller();
    const handle = build({ root: built.host });
    assert.ok(isBag(handle));
    box.checked = false;
    Reflect.apply(/** @type {Function} */ (handle.updateDirtyState), handle, []);
    const handlers = revert.listeners.click || [];
    await Reflect.apply(/** @type {Function} */ (handlers[0]), revert, []);
    assert.equal(box.checked, true, "the snapshot restored the checked state, not the value");
  });
});
