import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/formatters.js");

/**
 * The shared formatters, through the shipped module.
 *
 * `0.33.33.39.49` closed this file's last diagnostic by reading the entry-status table the way
 * the index read it. Its only owner stubs `entryStatus` rather than running it, so nothing had
 * executed the real lookup; these cases are that, with a light pass over the other five.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

function formatters() {
  /** @type {Bag} */
  const window = {};
  vm.runInNewContext(source, { window, Intl }, { filename: "formatters.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.formatters;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  return { api, member };
}

describe("the label an entry status carries", () => {
  const entryStatus = formatters().member("entryStatus");

  it("answers each label the table holds", () => {
    assert.equal(entryStatus("unbilled"), "Unbilled");
    assert.equal(entryStatus("billed"), "Billed");
    assert.equal(entryStatus("paid"), "Paid");
    assert.equal(entryStatus("na"), "N/A");
  });

  it("falls back to Unbilled for a status the table does not hold", () => {
    for (const status of ["", "nope", "BILLED", undefined, null, 0, false, 7]) {
      assert.equal(entryStatus(status), "Unbilled", `status: ${String(status)}`);
    }
  });

  it("selects the same label for a status that converts to the same property key", () => {
    assert.equal(entryStatus(Object("paid")), "Paid",
      "a String object selects what the string selected");
  });

  it("selects nothing for a symbol, which is a key the table cannot hold", () => {
    assert.equal(entryStatus(Symbol("paid")), "Unbilled");
  });

  it("still answers an inherited name, as the index always did", () => {
    // `toString` is the table's inherited method. The index answered it, so it was truthy and
    // reached the caller instead of the fallback. Recorded as what this does, not changed.
    assert.equal(typeof entryStatus("toString"), "function");
    assert.equal(typeof entryStatus("valueOf"), "function");
  });
});

describe("the other formatters this module publishes", () => {
  const api = formatters();

  it("formats currency from anything numeric, and zero from anything else", () => {
    const currency = api.member("currency");
    assert.equal(currency(12.5), "$12.50");
    assert.equal(currency("12.5"), "$12.50");
    assert.equal(currency("not a number"), "$0.00");
    assert.equal(currency(undefined), "$0.00");
  });

  it("publishes six formatters and nothing else", () => {
    assert.deepEqual(Object.keys(api.api).sort(),
      ["currency", "dateInput", "entryStatus", "hours", "monthLabel", "name"]);
  });
});
