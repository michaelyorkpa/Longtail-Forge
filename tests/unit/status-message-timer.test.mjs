import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/status.js");

/**
 * The status message helper's tone, hiding and self-clearing timer.
 *
 * `0.33.33.39.45` typed this file against `BrowserStatusMessage`, whose element is an
 * `HTMLElement` because the writer sets `hidden`, and changed no executable line. The page that
 * consumes it is driven by a browser spec, but nothing held the timer semantics on their own:
 * the `WeakMap` is keyed by element, a second write cancels the pending clear, and an empty
 * message schedules nothing. These cases are that.
 */

/** @typedef {Record<string, unknown>} Bag */
/** @typedef {ReturnType<typeof statusElement>} StatusElement */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** An element that records exactly the three things the writer touches. */
function statusElement() {
  /** @type {Set<string>} */
  const classes = new Set();
  return {
    textContent: "",
    hidden: false,
    classes,
    classList: {
      /** @param {string} name @param {boolean} force */
      toggle: (name, force) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      /** @param {string[]} names */
      remove: (...names) => { names.forEach((name) => classes.delete(name)); },
    },
  };
}

function statusHelper() {
  /** @type {Map<number, () => void>} */
  const scheduled = new Map();
  /** @type {number[]} */
  const cancelled = [];
  let nextId = 1;
  /** @type {Bag} */
  const global = {
    /** @param {() => void} run @param {number} delay */
    setTimeout: (run, delay) => {
      const id = nextId;
      nextId += 1;
      scheduled.set(id, run);
      Reflect.set(global, "lastDelay", delay);
      return id;
    },
    /** @param {number} id */
    clearTimeout: (id) => { cancelled.push(id); scheduled.delete(id); },
  };
  vm.runInNewContext(source, { window: global }, { filename: "status.js" });
  const namespace = global.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.status;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  /** Fire every timer that is still pending. */
  const fireAll = () => {
    [...scheduled.entries()].forEach(([id, run]) => {
      scheduled.delete(id);
      run();
    });
  };
  return {
    set: member("set"),
    clear: member("clear"),
    pending: () => scheduled.size,
    cancelled,
    fireAll,
    lastDelay: () => global.lastDelay,
  };
}

describe("the message and the tone it carries", () => {
  it("writes the message and shows the element", () => {
    const status = statusHelper();
    const element = statusElement();
    status.set(element, "Saved");
    assert.equal(element.textContent, "Saved");
    assert.equal(element.hidden, false);
    assert.deepEqual([...element.classes], [], "no tone was asked for, so none was added");
  });

  it("adds each recognised tone, and honours the older error spelling", () => {
    const status = statusHelper();
    const byType = statusElement();
    status.set(byType, "Failed", { type: "error" });
    assert.deepEqual([...byType.classes], ["is-error"]);

    const byFlag = statusElement();
    status.set(byFlag, "Failed", { isError: true });
    assert.deepEqual([...byFlag.classes], ["is-error"], "isError is the older spelling of type error");

    const success = statusElement();
    status.set(success, "Done", { type: "success" });
    assert.deepEqual([...success.classes], ["is-success"]);
  });

  it("renders any other tone neutral rather than refusing it", () => {
    // The contract calls this open vocabulary with two recognised members; role-assignments
    // passes the empty string deliberately.
    const status = statusHelper();
    for (const type of ["", "warning", "info"]) {
      const element = statusElement();
      status.set(element, "Note", { type });
      assert.deepEqual([...element.classes], [], `type: ${type}`);
    }
  });

  it("replaces the previous tone rather than accumulating them", () => {
    const status = statusHelper();
    const element = statusElement();
    status.set(element, "Failed", { type: "error" });
    status.set(element, "Done", { type: "success" });
    assert.deepEqual([...element.classes], ["is-success"], "the error tone was toggled back off");
  });

  it("hides the element for an empty message, including the default", () => {
    const status = statusHelper();
    const explicit = statusElement();
    status.set(explicit, "");
    assert.equal(explicit.hidden, true);
    assert.equal(explicit.textContent, "");

    const defaulted = statusElement();
    status.set(defaulted);
    assert.equal(defaulted.hidden, true, "the message defaults to the empty string");
  });
});

describe("the self-clearing timer", () => {
  it("schedules a clear at the delay it was given, and clears everything when it fires", () => {
    const status = statusHelper();
    const element = statusElement();
    status.set(element, "Saved", { clearAfter: 2500, type: "success" });
    assert.equal(status.pending(), 1);
    assert.equal(status.lastDelay(), 2500, "the delay is forwarded, not defaulted");

    status.fireAll();
    assert.equal(element.textContent, "");
    assert.equal(element.hidden, true);
    assert.deepEqual([...element.classes], [], "both tones are dropped when the timer clears");
  });

  it("schedules nothing when there is no message to clear", () => {
    const status = statusHelper();
    status.set(statusElement(), "", { clearAfter: 2500 });
    assert.equal(status.pending(), 0, "an empty message is already cleared");
  });

  it("schedules nothing without a delay", () => {
    const status = statusHelper();
    status.set(statusElement(), "Saved");
    assert.equal(status.pending(), 0);
  });

  it("cancels the pending clear when the same element is written again", () => {
    const status = statusHelper();
    const element = statusElement();
    status.set(element, "First", { clearAfter: 1000 });
    status.set(element, "Second", { clearAfter: 1000 });
    assert.equal(status.cancelled.length, 1, "the first timer was cancelled by the second write");
    assert.equal(status.pending(), 1, "and exactly one is left pending");

    status.fireAll();
    assert.equal(element.textContent, "", "the surviving timer is the second one");
  });

  it("cancels the pending clear when the element is cleared by hand", () => {
    const status = statusHelper();
    const element = statusElement();
    status.set(element, "Saved", { clearAfter: 1000 });
    status.clear(element);
    assert.equal(status.cancelled.length, 1);
    assert.equal(status.pending(), 0, "nothing is left to fire later");
    assert.equal(element.hidden, true);
  });

  it("keeps each element's timer to itself", () => {
    // The timers are held in a WeakMap keyed by element, so writing one must not disturb
    // another's pending clear.
    const status = statusHelper();
    const first = statusElement();
    const second = statusElement();
    status.set(first, "First", { clearAfter: 1000 });
    status.set(second, "Second", { clearAfter: 1000 });
    assert.equal(status.pending(), 2);
    assert.deepEqual(status.cancelled, [], "neither write touched the other's timer");

    status.clear(first);
    assert.equal(status.pending(), 1, "only the first element's timer was cancelled");
    assert.equal(second.textContent, "Second", "the second element is untouched");
  });
});

describe("an element that is not there", () => {
  it("is a no-op for both writers rather than an error", () => {
    const status = statusHelper();
    for (const absent of [null, undefined, ""]) {
      assert.equal(status.set(absent, "Saved"), undefined, `set: ${String(absent)}`);
      assert.equal(status.clear(absent), undefined, `clear: ${String(absent)}`);
    }
    assert.equal(status.pending(), 0, "nothing was scheduled for an element that is not there");
  });
});
