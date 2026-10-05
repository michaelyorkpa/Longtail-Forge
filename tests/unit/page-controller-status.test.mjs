import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/page-controller.js");

/**
 * What `pageController.setStatus` hands its recipient, through the shipped function.
 *
 * `0.33.33.39.35` corrected the declaration to the capability the writer uses and to the opaque
 * message it never converts, and made the message reach the node's own `textContent` setter
 * through `Reflect.set`. The claim here is that nothing observable moved: the absent-recipient
 * no-op, the `|| ""` fallback, the unconverted value handed to the setter, that order, the tone
 * written afterwards, and a refusing or throwing recipient answered exactly as the assignment
 * answered it - which is why every case below also passes against the original implementation.
 *
 * A real document answers what the setter does with the value it is handed; these cases answer
 * what it is handed. `page-controller-status-recipients.spec.mjs` covers the first, on HTML and
 * SVG recipients.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

// `0.33.33.39.37` gave the tone its own writer, so both are lifted together.
const setStatus = new Function([
  extractFunctionBlock(source, "setStatus"),
  extractFunctionBlock(source, "writeStatusTone"),
  "return setStatus;",
].join("\n"))();

/** @param {unknown[]} args */
const write = (...args) => Reflect.apply(setStatus, undefined, args);

/** A recipient that records what its setter was handed, in order. */
function recipient() {
  /** @type {unknown[]} */
  const written = [];
  /** @type {string[]} */
  const order = [];
  const dataset = {};
  const element = { dataset };
  Object.defineProperty(element, "textContent", {
    enumerable: true,
    get: () => written.at(-1),
    set: (value) => { written.push(value); order.push("textContent"); },
  });
  /** @type {unknown} */
  let statusTone = "";
  Object.defineProperty(dataset, "statusTone", {
    enumerable: true,
    get: () => statusTone,
    set: (value) => { statusTone = value; order.push("statusTone"); },
  });
  const tone = () => Reflect.get(dataset, "statusTone");
  return { element, order, tone, written };
}

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    return isBag(error) ? String(error.name) : String(error);
  }
  return null;
}

describe("setStatus writes to the recipient it is given", () => {
  it("does nothing at all without one", () => {
    assert.equal(write(null, "Saved"), undefined);
    assert.equal(write(undefined, "Saved"), undefined);
    assert.equal(write(null, Symbol("message")), undefined, "a missing recipient converts nothing");
  });

  it("clears the line for every falsy message and hands anything else over unconverted", () => {
    const target = recipient();
    for (const message of ["", 0, null, undefined, false, Number.NaN]) {
      write(target.element, message);
    }
    assert.deepEqual(target.written, ["", "", "", "", "", ""], "the || \"\" fallback clears the line");

    const object = { toString: () => "from an object" };
    write(target.element, 42);
    write(target.element, object);
    write(target.element, "Saved");
    assert.deepEqual(target.written.slice(-3), [42, object, "Saved"],
      "the setter is handed the value itself, because the setter is the conversion");
  });

  it("writes the message first and the tone after it, on every call", () => {
    const target = recipient();
    write(target.element, "Saved", { isError: true });
    assert.deepEqual(target.order, ["textContent", "statusTone"], "the message is written first");
    assert.equal(target.tone(), "error");
    write(target.element, "Saved again");
    assert.equal(target.tone(), "", "a later call clears the tone it set");
    write(target.element, "", { isError: true });
    assert.equal(target.tone(), "error", "an empty message still carries its tone");
  });

  it("propagates a setter that refuses the value, as the assignment did", () => {
    const failing = { dataset: { statusTone: "" } };
    Object.defineProperty(failing, "textContent", {
      set: () => { throw new TypeError("Cannot convert a Symbol value to a string"); },
    });
    assert.equal(thrown(() => write(failing, Symbol("message"))), "TypeError");
    assert.equal(failing.dataset.statusTone, "", "and the tone is not written past the failure");
  });

  it("writes the message, then fails where the recipient carries no dataset", () => {
    // What an element of another namespace does in the browser: it takes the message, and the
    // tone write is where it fails. `0.33.33.39.37` left that untouched rather than refusing the
    // recipient up front, which would have moved the failure before the message.
    /** @type {unknown[]} */
    const written = [];
    const element = {};
    Object.defineProperty(element, "textContent", { set: (value) => { written.push(value); } });
    assert.equal(thrown(() => write(element, "Saved", { isError: true })), "TypeError");
    assert.deepEqual(written, ["Saved"], "the message was written before the tone failed");
  });

  it("treats a recipient that refuses the write exactly as the assignment did", () => {
    // The file is a classic script in sloppy mode, where assigning to a refusing property is
    // silent and execution continues. `Reflect.set` answers `false` in those same cases, and the
    // writer does not read it, so the tone is still written and nothing new fails.
    const readOnly = { dataset: { statusTone: "" } };
    Object.defineProperty(readOnly, "textContent", { value: "fixed", writable: false });
    assert.equal(thrown(() => write(readOnly, "Saved", { isError: true })), null);
    assert.equal(Reflect.get(readOnly, "textContent"), "fixed");
    assert.equal(readOnly.dataset.statusTone, "error");
  });
});
