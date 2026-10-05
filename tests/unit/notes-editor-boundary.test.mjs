import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/notes-editor.js");

/**
 * The Notes editor's published boundary, through the shipped module.
 *
 * `0.33.33.39.39` took `notes-editor.js` to zero. Its textarea, event, options and command name
 * are `unknown` at the published surface, so each is read as the member access read it: the
 * command name takes the same property-key conversion and the same table lookup, and the caret,
 * value and methods are read and called on whatever the caller handed over.
 * `notes-preview-editor-regression` already executes the command, keydown, indent and outdent
 * paths against a stand-in textarea; these cases cover the boundary around them.
 *
 * Two behaviours are stated here because they changed: a non-textarea element is refused, and a
 * caret that is not a number is converted rather than carried into the arithmetic.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

class StubEvent {
  /** @param {string} type @param {{ bubbles?: boolean }} [options] */
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
  }
}

function editor() {
  /** @type {Bag} */
  const window = { Event: StubEvent };
  vm.runInNewContext(source, { window }, { filename: "notes-editor.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.notesEditor;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.ok(isCallable(fn), `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(fn, api, args);
  };
  return { api, member };
}

/**
 * A stand-in for the page's textarea: a node of any realm answers the element check this way.
 * @param {Bag} [overrides]
 */
function textareaStub(overrides = {}) {
  /** @type {unknown[]} */
  const events = [];
  /** @type {Record<string, string>} */
  const dataset = {};
  return {
    nodeType: 1,
    tagName: "TEXTAREA",
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    dataset,
    events,
    focus: () => {},
    addEventListener: () => {},
    dispatchEvent: (/** @type {unknown} */ event) => { events.push(event); return true; },
    ...overrides,
  };
}

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    return nameOf(error);
  }
  return null;
}

describe("the command name selects what the table lookup selected", () => {
  it("applies a named command, and converts the name as the lookup did", () => {
    const applyCommand = editor().member("applyCommand");
    const target = textareaStub({ value: "hello", selectionStart: 0, selectionEnd: 5 });
    assert.equal(applyCommand(target, "bold"), "**hello**");

    const converted = textareaStub({ value: "hello", selectionStart: 0, selectionEnd: 5 });
    assert.equal(applyCommand(converted, Object("bold")), "**hello**",
      "a name that converts to the same property key selects the same command");
  });

  it("answers the empty string for a name the table does not carry", () => {
    const applyCommand = editor().member("applyCommand");
    for (const name of ["", "shout", undefined, null, 7, Symbol("bold")]) {
      assert.equal(applyCommand(textareaStub(), name), "", `name: ${String(name)}`);
    }
  });

  it("still reaches an inherited name and still fails at its missing prefix", () => {
    // `COMMANDS.toString` is the table's inherited method, which the lookup has always answered.
    const applyCommand = editor().member("applyCommand");
    assert.equal(thrown(() => applyCommand(textareaStub(), "toString")), "TypeError");
  });

  it("does nothing without a textarea, whatever the name", () => {
    const applyCommand = editor().member("applyCommand");
    assert.equal(applyCommand(null, "bold"), "");
    assert.equal(applyCommand(undefined, "bold"), "");
  });
});

describe("the caret and the textarea it writes to", () => {
  it("inserts at the caret and dispatches one input event through the element's own method", () => {
    const applyCommand = editor().member("applyCommand");
    const target = textareaStub({ value: "ab", selectionStart: 1, selectionEnd: 1 });
    assert.equal(applyCommand(target, "italic"), "a*italic text*b");
    assert.equal(target.selectionStart, 2);
    assert.equal(target.selectionEnd, 2 + "italic text".length);
    assert.equal(target.events.length, 1);
    assert.ok(target.events[0] instanceof StubEvent);
  });

  it("converts a caret that is not a number, where the arithmetic once carried it", () => {
    // The DOM answers a number here. A stand-in that answers the digits as text now counts from
    // that position rather than concatenating it into the next caret.
    const applyCommand = editor().member("applyCommand");
    const target = textareaStub({ value: "abcd", selectionStart: "2", selectionEnd: "2" });
    assert.equal(applyCommand(target, "bold"), "ab**bold text**cd");
    assert.equal(target.selectionStart, 4);
  });

  it("treats a textarea with no caret as a caret at zero, as the fallback did", () => {
    const applyCommand = editor().member("applyCommand");
    const target = textareaStub({ value: "ab" });
    Reflect.deleteProperty(target, "selectionStart");
    Reflect.deleteProperty(target, "selectionEnd");
    assert.equal(applyCommand(target, "bold"), "**bold text**ab");
    assert.equal(target.selectionStart, 2, "the next caret counts from zero rather than from nothing");
    assert.equal(target.selectionEnd, 2 + "bold text".length);
  });

  it("still fails where a textarea cannot be read or written", () => {
    const applyCommand = editor().member("applyCommand");
    assert.equal(thrown(() => applyCommand({ nodeType: 1, tagName: "TEXTAREA" }, "bold")), "TypeError",
      "a stand-in with no dispatchEvent fails at the call it always made");
  });
});

describe("createPlainTextarea publishes a controller for the page's own textarea", () => {
  it("answers null without an element", () => {
    const createPlainTextarea = editor().member("createPlainTextarea");
    assert.equal(createPlainTextarea(null), null);
    assert.equal(createPlainTextarea(undefined), null);
    assert.equal(createPlainTextarea(""), null);
  });

  it("refuses an element that is not a textarea", () => {
    // The published controller carries an `HTMLTextAreaElement`; the page hands over the one it
    // rendered. `0.33.33.39.39` names anything else here rather than publishing it as a textarea.
    const createPlainTextarea = editor().member("createPlainTextarea");
    assert.equal(thrown(() => createPlainTextarea({ value: "", dataset: {}, addEventListener: () => {} })), "TypeError");
    // Carrying every member the controller uses is not enough: the tag is what decides.
    assert.equal(thrown(() => createPlainTextarea({
      nodeType: 1, tagName: "DIV", value: "", dataset: {}, addEventListener: () => {},
    })), "TypeError");
  });

  it("normalises the initial value and answers the eleven command names", () => {
    const createPlainTextarea = editor().member("createPlainTextarea");
    const element = textareaStub({ value: "  trailing  \r\nlines  " });
    const controller = createPlainTextarea(element);
    assert.ok(isBag(controller));
    assert.equal(element.value, "trailing\nlines", "the value is normalised through the element");
    assert.equal(element.dataset.notesEditor, "plain-markdown");
    assert.equal(controller.element, element, "the controller carries the element it was given");
    // The list is built in the module's realm, so it is compared as data rather than by prototype.
    assert.deepEqual(JSON.parse(JSON.stringify(controller.commands)), [
      "bold", "italic", "underline", "heading", "link", "checklist",
      "unorderedList", "orderedList", "codeBlock", "blockquote", "wikiLink",
    ]);

    assert.ok(isCallable(controller.setValue) && isCallable(controller.getValue));
    Reflect.apply(controller.setValue, controller, ["  spaced  "]);
    assert.equal(Reflect.apply(controller.getValue, controller, []), "spaced");
  });

  it("reads its initial value from the options it was given, and still fails for a missing bag", () => {
    const createPlainTextarea = editor().member("createPlainTextarea");
    const element = textareaStub({ value: "from element" });
    const controller = createPlainTextarea(element, { value: "  from options  " });
    assert.ok(isBag(controller));
    assert.equal(element.value, "from options");
    assert.equal(thrown(() => createPlainTextarea(textareaStub(), null)), "TypeError",
      "a null options bag fails at its first read, as the member access did");
  });
});
