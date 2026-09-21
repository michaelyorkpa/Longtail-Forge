import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/quick-action-refresh.js");

/**
 * The listener a quick-action refresh subscription installs.
 *
 * `quiet-tail-surface-contracts` lifts `normalizeValues` and `subscribe` and holds the
 * subscribe/unsubscribe pairing and the two refusals, but it never fires the listener - which
 * is where the filtering and the detail read live. `0.33.33.39.46` changed exactly one
 * executable line there, the optional detail read, so these cases cover it.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

function refresher() {
  /** @type {{ name: string, listener: Function }[]} */
  const added = [];
  /** @type {{ name: string, listener: Function }[]} */
  const removed = [];
  /** @type {Bag} */
  const global = {
    /** @param {string} name @param {Function} listener */
    addEventListener: (name, listener) => { added.push({ name, listener }); },
    /** @param {string} name @param {Function} listener */
    removeEventListener: (name, listener) => { removed.push({ name, listener }); },
  };
  vm.runInNewContext(source, { window: global }, { filename: "quick-action-refresh.js" });
  const namespace = global.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.quickActionRefresh;
  assert.ok(isBag(api));
  const subscribeFn = api.subscribe;
  assert.equal(typeof subscribeFn, "function");

  /** @param {unknown} options */
  const subscribe = (options) => Reflect.apply(/** @type {Function} */ (subscribeFn), api, [options]);
  /** Fire whatever the most recent subscription installed. @param {unknown} event */
  const fire = (event) => {
    const last = added.at(-1);
    assert.ok(last, "a listener was installed");
    return Reflect.apply(last.listener, global, [event]);
  };
  return { api, subscribe, fire, added, removed, eventName: api.eventName };
}

describe("what the listener lets through", () => {
  /** @param {unknown} options */
  function calls(options) {
    /** @type {unknown[][]} */
    const seen = [];
    const refresh = refresher();
    const unsubscribe = refresh.subscribe({
      ...(isBag(options) ? options : {}),
      onRefresh: (/** @type {unknown} */ detail, /** @type {unknown} */ event) => { seen.push([detail, event]); },
    });
    return { ...refresh, seen, unsubscribe };
  }

  it("calls back for a matching record type and stays quiet for another", () => {
    const subscription = calls({ recordTypes: ["task"] });
    subscription.fire({ detail: { recordType: "task", actionId: "complete" } });
    assert.equal(subscription.seen.length, 1);

    subscription.fire({ detail: { recordType: "note" } });
    assert.equal(subscription.seen.length, 1, "another record type is not this subscription's");
  });

  it("hands the callback the detail it read and the event it came on", () => {
    const subscription = calls({ recordTypes: ["task"] });
    const detail = { recordType: "task", actionId: "complete", extra: 7 };
    const event = { detail };
    subscription.fire(event);
    assert.equal(subscription.seen[0][0], detail, "the detail is passed through, not rebuilt");
    assert.equal(subscription.seen[0][1], event);
  });

  it("requires both filters to match when both were given", () => {
    const subscription = calls({ recordTypes: ["task"], actionIds: ["complete"] });
    subscription.fire({ detail: { recordType: "task", actionId: "start" } });
    assert.equal(subscription.seen.length, 0, "the action id did not match");

    subscription.fire({ detail: { recordType: "note", actionId: "complete" } });
    assert.equal(subscription.seen.length, 0, "the record type did not match");

    subscription.fire({ detail: { recordType: "task", actionId: "complete" } });
    assert.equal(subscription.seen.length, 1);
  });

  it("filters on the action id alone when that is all it was given", () => {
    const subscription = calls({ actionIds: ["complete"] });
    subscription.fire({ detail: { actionId: "complete" } });
    subscription.fire({ detail: { actionId: "start" } });
    assert.equal(subscription.seen.length, 1);
  });

  it("trims and drops empties the same way on both sides of the comparison", () => {
    const subscription = calls({ recordTypes: ["  task  ", "", null] });
    subscription.fire({ detail: { recordType: "  task  " } });
    assert.equal(subscription.seen.length, 1, "both the filter and the detail are trimmed");

    subscription.fire({ detail: { recordType: "" } });
    assert.equal(subscription.seen.length, 1, "an empty record type matches nothing");
  });

  it("accepts a single filter value as readily as a list", () => {
    const subscription = calls({ recordTypes: "task" });
    subscription.fire({ detail: { recordType: "task" } });
    assert.equal(subscription.seen.length, 1);
  });
});

describe("an event carrying no detail", () => {
  it("reads as an empty detail rather than failing", () => {
    // This is the line `0.33.33.39.46` changed: the optional read of the event's own detail.
    /** @type {unknown[]} */
    const seen = [];
    const refresh = refresher();
    refresh.subscribe({
      actionIds: ["complete"],
      onRefresh: (/** @type {unknown} */ detail) => { seen.push(detail); },
    });

    for (const event of [{}, { detail: null }, { detail: undefined }, null, undefined]) {
      assert.equal(refresh.fire(event), undefined, `event: ${JSON.stringify(event) || String(event)}`);
    }
    assert.deepEqual(seen, [], "no action id could be read, so this subscription stayed quiet");
  });

  it("still calls back when the subscription filters on nothing the detail must carry", () => {
    // A record-type filter cannot match an absent detail, so the empty-detail path is only
    // observable as the absence of a throw. This pins that it is an absence, not a silence.
    const refresh = refresher();
    assert.doesNotThrow(() => {
      refresh.subscribe({ recordTypes: ["task"], onRefresh: () => {} });
      refresh.fire({});
    });
  });
});

describe("the subscription itself", () => {
  it("installs on the published event name and removes the very listener it added", () => {
    const refresh = refresher();
    const unsubscribe = refresh.subscribe({ recordTypes: ["task"], onRefresh: () => {} });
    assert.equal(refresh.added.length, 1);
    assert.equal(refresh.added[0].name, refresh.eventName);
    assert.equal(refresh.eventName, "longtailforge:quick-action-refresh");

    assert.equal(typeof unsubscribe, "function");
    unsubscribe();
    assert.deepEqual(refresh.removed, refresh.added, "the listener removed is the one added");
  });

  it("honours refresh as the alias for onRefresh", () => {
    /** @type {unknown[]} */
    const seen = [];
    const refresh = refresher();
    refresh.subscribe({ recordTypes: ["task"], refresh: (/** @type {unknown} */ detail) => { seen.push(detail); } });
    refresh.fire({ detail: { recordType: "task" } });
    assert.equal(seen.length, 1);
  });

  it("refuses a subscription with no filter or no callback", () => {
    const refresh = refresher();
    assert.throws(() => refresh.subscribe({ onRefresh: () => {} }), /record type or action id/);
    assert.throws(() => refresh.subscribe({ recordTypes: ["task"] }), /callback/);
    assert.equal(refresh.added.length, 0, "a refused subscription installs nothing");
  });
});
