import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/icons.js");

/**
 * The icon registry's lookup and the two button writers, through the shipped module.
 *
 * `0.33.33.39.41` took `icons.js` to zero. The published `BrowserIcons` declares `createIcon`'s
 * name as a `string`, but `createIconButton` forwards an `unknown` icon into it, so the lookup
 * keeps the property-key conversion the index performed - a `String` object still selects its
 * icon, a symbol still selects nothing, and an inherited name is still answered and still fails
 * where it always failed. Nothing here changed behaviour; these cases are what says so.
 */

/** @typedef {Record<string, unknown>} Bag */

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
 * A DOM small enough to read back exactly: every element records the attributes it was given,
 * the classes it collected and the children it appended, and `textContent` behaves as the real
 * one does - reading descendant text, and clearing the children when it is written.
 *
 * @typedef {{
 *   attrs: Record<string, string>,
 *   children: FakeElement[],
 *   namespace: string | null,
 *   nodeType: number,
 *   tagName: string,
 *   className: string,
 *   title: string,
 *   type: unknown,
 *   classList: { add: (...names: string[]) => void },
 *   setAttribute: (key: string, value: string) => void,
 *   getAttribute: (key: string) => string | null,
 *   appendChild: (child: FakeElement) => FakeElement,
 *   textContent: string,
 * }} FakeElement
 */

/** @param {string} tag @param {string | null} namespace @returns {FakeElement} */
function makeElement(tag, namespace) {
  /** @type {Record<string, string>} */
  const attrs = {};
  /** @type {FakeElement[]} */
  const children = [];
  let ownText = "";
  /** @type {FakeElement} */
  const element = {
    attrs,
    children,
    namespace,
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: "",
    title: "",
    type: undefined,
    classList: {
      add: (...names) => {
        element.className = `${element.className} ${names.join(" ")}`.trim();
      },
    },
    setAttribute: (key, value) => { attrs[key] = value; },
    getAttribute: (key) => (Object.hasOwn(attrs, key) ? attrs[key] : null),
    appendChild: (child) => { children.push(child); return child; },
    get textContent() {
      return children.length > 0 ? children.map((child) => child.textContent).join("") : ownText;
    },
    set textContent(value) {
      ownText = String(value);
      children.length = 0;
    },
  };
  return element;
}

function fakeDocument() {
  return {
    /** @param {string} tag */
    createElement: (tag) => makeElement(tag, null),
    /** @param {string} namespace @param {string} tag */
    createElementNS: (namespace, tag) => makeElement(tag, namespace),
  };
}

function icons() {
  const document = fakeDocument();
  /** @type {Bag} */
  const window = {};
  vm.runInNewContext(source, { window, document }, { filename: "icons.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.icons;
  assert.ok(isBag(api));
  /**
   * Each published writer answers the element it built, which in this DOM is a `FakeElement`.
   * @param {string} name
   * @returns {(...args: unknown[]) => FakeElement}
   */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  return { api, document, member };
}

/** @param {FakeElement} icon */
function shape(icon) {
  return {
    attrs: icon.attrs,
    className: icon.className,
    /** @type {[string, Record<string, string>][]} */
    parts: icon.children.map((child) => [child.tagName, child.attrs]),
  };
}

describe("the registry lookup converts a name as the index converted it", () => {
  it("builds a known icon with the registry's own parts", () => {
    const createIcon = icons().member("createIcon");
    const icon = shape(createIcon("user"));
    assert.equal(icon.className, "icon");
    assert.equal(icon.attrs.viewBox, "0 0 24 24");
    assert.deepEqual(icon.parts.map(([tag]) => tag), ["CIRCLE", "PATH"],
      "every part of a multi-part icon is drawn, in order");
    assert.deepEqual(icon.parts[0][1], { cx: "12", cy: "8", r: "4" });
  });

  it("selects the same icon for a name that converts to the same property key", () => {
    const createIcon = icons().member("createIcon");
    assert.deepEqual(shape(createIcon(Object("user"))), shape(createIcon("user")),
      "a String object selects what the string selected");
  });

  it("answers nothing for a name the registry does not hold, and names it", () => {
    const createIcon = icons().member("createIcon");
    for (const [name, text] of [["nope", "nope"], [undefined, "undefined"], [null, "null"], [7, "7"]]) {
      const failure = thrown(() => createIcon(name));
      assert.equal(failure?.name, "Error", `name: ${String(name)}`);
      assert.equal(failure?.message, `Unknown icon '${text}'.`);
    }
  });

  it("still fails where naming the unknown icon failed", () => {
    // A symbol selects nothing, and the message that reports it has never been able to
    // convert one. The failure is that conversion, not the lookup.
    const createIcon = icons().member("createIcon");
    assert.equal(thrown(() => createIcon(Symbol("user")))?.name, "TypeError");
  });

  it("still answers an inherited name, and still fails at the parts it does not have", () => {
    // `iconRegistry.toString` is the registry's inherited method, which the index has always
    // answered. It is truthy, so the unknown-icon guard passes and the draw fails instead.
    const createIcon = icons().member("createIcon");
    assert.equal(thrown(() => createIcon("toString"))?.name, "TypeError");
  });
});

describe("the icon an option bag asks for", () => {
  it("defaults its size and stroke, and hides itself", () => {
    const createIcon = icons().member("createIcon");
    const { attrs } = shape(createIcon("add"));
    assert.equal(attrs.width, "20");
    assert.equal(attrs.height, "20");
    assert.equal(attrs["stroke-width"], "2");
    assert.equal(attrs["aria-hidden"], "true");
    assert.equal(attrs.focusable, "false");
    assert.equal(attrs.role, undefined);
  });

  it("takes the size and stroke it is given, as the strings they are written as", () => {
    const createIcon = icons().member("createIcon");
    const { attrs } = shape(createIcon("add", { size: 32, strokeWidth: 1.5 }));
    assert.equal(attrs.width, "32");
    assert.equal(attrs.height, "32");
    assert.equal(attrs["stroke-width"], "1.5");
  });

  it("labels a non-decorative icon and refuses one without a label", () => {
    const createIcon = icons().member("createIcon");
    const { attrs } = shape(createIcon("add", { decorative: false, label: "  Add  " }));
    assert.equal(attrs.role, "img");
    assert.equal(attrs["aria-label"], "Add", "the label is trimmed");
    assert.equal(attrs["aria-hidden"], undefined);

    const failure = thrown(() => createIcon("add", { decorative: false }));
    assert.equal(failure?.message, "Non-decorative icons require a label.");
    assert.equal(thrown(() => createIcon("add", { decorative: false, label: "   " }))?.message,
      "Non-decorative icons require a label.", "whitespace is not a label");
  });

  it("treats every flag but an explicit false as decorative", () => {
    const createIcon = icons().member("createIcon");
    for (const decorative of [undefined, true, 0, "", null]) {
      const { attrs } = shape(createIcon("add", { decorative }));
      assert.equal(attrs["aria-hidden"], "true", `decorative: ${String(decorative)}`);
    }
  });
});

describe("the buttons the icon helpers build", () => {
  it("builds an icon-only button with its label, title and type", () => {
    const createIconButton = icons().member("createIconButton");
    const button = createIconButton({ icon: "add", label: "  Add task  " });
    assert.equal(button.type, "button", "the default type is written through the native setter");
    assert.equal(button.className, "action-button icon-button");
    assert.equal(button.getAttribute("aria-label"), "Add task");
    assert.equal(button.title, "Add task", "the title falls back to the label");
    assert.equal(/** @type {Bag[]} */ (button.children).length, 1, "an icon and no visible text");
  });

  it("refuses a button with neither a label nor visible text", () => {
    const createIconButton = icons().member("createIconButton");
    assert.equal(thrown(() => createIconButton({ icon: "add" }))?.message,
      "Icon buttons require an accessible label or visible text.");
    assert.equal(thrown(() => createIconButton({ icon: "add", label: "  ", text: "  " }))?.message,
      "Icon buttons require an accessible label or visible text.");
  });

  it("puts the text after the icon by default and before it on request", () => {
    const createIconButton = icons().member("createIconButton");
    const before = createIconButton({ icon: "add", text: "Add" });
    assert.deepEqual(/** @type {Bag[]} */ (before.children).map((child) => child.tagName), ["SVG", "SPAN"]);

    const after = createIconButton({ icon: "add", text: "Add", position: "after" });
    assert.deepEqual(/** @type {Bag[]} */ (after.children).map((child) => child.tagName), ["SPAN", "SVG"]);
    assert.equal(after.className, "action-button", "a button with visible text is not icon-only");
  });

  it("distinguishes an absent icon-only flag from an explicit false", () => {
    // The contract declares `iconOnly` as `unknown` precisely because it is tested with
    // `!== false`, so these two calls are different inputs rather than the same one.
    const createIconButton = icons().member("createIconButton");
    const absent = createIconButton({ icon: "add", label: "Add" });
    const explicit = createIconButton({ icon: "add", label: "Add", iconOnly: false });
    assert.equal(absent.className, "action-button icon-button");
    assert.equal(explicit.className, "action-button", "an explicit false is not icon-only");
    assert.equal(explicit.getAttribute("aria-label"), null);
  });

  it("adds one class per named variant and none for any other name", () => {
    const createIconButton = icons().member("createIconButton");
    for (const [variant, className] of [
      ["danger", "danger-button"], ["secondary", "secondary-button"], ["link", "link-button"],
    ]) {
      const button = createIconButton({ icon: "add", label: "Act", variant });
      assert.match(String(button.className), new RegExp(className));
    }
    for (const variant of [undefined, "", "primary", 7]) {
      const button = createIconButton({ icon: "add", label: "Act", variant });
      assert.equal(button.className, "action-button icon-button", `variant: ${String(variant)}`);
    }
  });
});

describe("decorating a button the page already rendered", () => {
  /** @param {string} tag @param {string} [text] */
  function existing(tag, text = "") {
    const { member } = icons();
    const element = makeElement(tag, null);
    element.textContent = text;
    return { element, decorateButton: member("decorateButton") };
  }

  it("refuses anything that is not a button element", () => {
    const { decorateButton } = existing("button");
    for (const value of [null, undefined, {}, { nodeType: 1, tagName: "DIV" }, { nodeType: 3, tagName: "BUTTON" }]) {
      assert.equal(thrown(() => decorateButton(value))?.message, "decorateButton requires a button element.",
        `value: ${String(value)}`);
    }
  });

  it("returns the very element it was given, rebuilt around the icon", () => {
    const { element, decorateButton } = existing("button", "Save");
    const returned = decorateButton(element, { icon: "add" });
    assert.equal(returned, element, "the same element, not a copy");
    assert.deepEqual(element.children.map((child) => child.tagName), ["SVG", "SPAN"]);
    assert.equal(element.textContent, "Save", "the button's own text is kept when none is given");
  });

  it("prefers the text it is given, and an explicit empty one makes it icon-only", () => {
    const withText = existing("button", "Save");
    withText.decorateButton(withText.element, { icon: "add", text: "  Publish  " });
    assert.equal(withText.element.textContent, "Publish");

    const cleared = existing("button", "Save");
    cleared.decorateButton(cleared.element, { icon: "add", text: "", label: "Save" });
    assert.match(cleared.element.className, /icon-button/);
    assert.equal(cleared.element.getAttribute("aria-label"), "Save");
  });

  it("falls back to the aria-label the button already carried", () => {
    const { element, decorateButton } = existing("button");
    element.setAttribute("aria-label", "Existing label");
    decorateButton(element, { icon: "add" });
    assert.equal(element.getAttribute("aria-label"), "Existing label");
    assert.equal(element.title, "Existing label");
  });
});

describe("the published surface", () => {
  it("publishes three writers and every registry name, frozen", () => {
    const { api } = icons();
    assert.deepEqual(Object.keys(api).sort(), ["createIcon", "createIconButton", "decorateButton", "names"]);
    const names = api.names;
    assert.ok(Array.isArray(names));
    assert.ok(Object.isFrozen(names), "names is frozen at publication");
    assert.ok(names.length > 20 && names.every((name) => typeof name === "string"));
    assert.ok(names.includes("add") && names.includes("user"));
  });
});
