import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The `|| {}` stand-ins removed by `0.33.33.38.2.8`, and the fallbacks that stayed.
 *
 * Three files captured an optional namespace member behind an empty object literal. That literal
 * has no members, so every read through it was a property access on `{}` - the diagnostics were
 * about the **stand-in**, not about whether the member was available. Removing it lets each
 * site's own existing test do the narrowing.
 *
 * **Nothing about availability changed.** The two Time Tracking files still format hours and
 * currency locally when the shared helper is unpublished, and they keep their *different* tests -
 * `typeof ... === "function"` in the dashboard, plain truthiness in the reporting adapter.
 * `view-builder` still throws its named error when the descriptor adapter is missing or its
 * `normalize` is not a function.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const dashboardSource = read("public/js/time-tracking-dashboard.js");
const reportingSource = read("public/js/time-tracking-reporting.js");
const viewBuilderSource = read("public/js/shared/view-builder.js");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * Lift a shipped formatter wrapper together with the shipped capture line above it, so the test
 * drives the real capture-and-conditional chain.
 * @param {string} source @param {string} opener @param {unknown} formattersValue
 */
function liftFormatter(source, opener, formattersValue) {
  const capture = source.split("\n").find((line) => line.includes("const formatters = window.LongtailForge"));
  assert.ok(capture, "the shipped capture line must exist");
  const built = new Function("window", [capture, slice(source, opener), "  return " + opener.replace(/^function /, "").replace(/\(.*$/, "") + ";"].join("\n"));
  return built({ LongtailForge: formattersValue === undefined ? {} : { formatters: formattersValue } });
}

/** Lift `normalizeSurfaceDescriptor` with a controlled root. @param {Record<string, unknown>} root */
function liftNormalizer(root) {
  const built = new Function("root", [
    slice(viewBuilderSource, "function normalizeSurfaceDescriptor(descriptor) {"),
    "  return normalizeSurfaceDescriptor;",
  ].join("\n"));
  return built(root);
}

describe("the Time Tracking dashboard keeps its typeof-function test", () => {
  const OPENER = "function formatHours(seconds) {";

  it("formats locally when no formatter surface was captured", () => {
    const formatHours = liftFormatter(dashboardSource, OPENER, undefined);
    assert.equal(formatHours(3600), "1.00 hrs");
    assert.equal(formatHours(5400), "1.50 hrs");
    assert.equal(formatHours(0), "0.00 hrs");
    assert.equal(formatHours("not a number"), "0.00 hrs", "a non-numeric input still reads as zero");
  });

  it("formats locally when the captured surface has no hours method", () => {
    const formatHours = liftFormatter(dashboardSource, OPENER, { currency: () => "$0" });
    assert.equal(formatHours(7200), "2.00 hrs");
  });

  it("formats locally when hours is present but is not a function", () => {
    // This is the distinction the dashboard's `typeof` test makes and the reporting adapter's
    // truthiness test does not. Homogenising them would change this row.
    const formatHours = liftFormatter(dashboardSource, OPENER, { hours: "8h" });
    assert.equal(formatHours(3600), "1.00 hrs");
  });

  it("uses the captured formatter, on its own receiver, with the value it was given", () => {
    /** @type {unknown[]} */
    const seen = [];
    /** @type {unknown[]} */
    const receivers = [];
    const surface = {
      hours(/** @type {unknown} */ seconds) {
        receivers.push(this);
        seen.push(seconds);
        return "eight hours";
      },
    };
    const formatHours = liftFormatter(dashboardSource, OPENER, surface);

    assert.equal(formatHours(28800), "eight hours");
    assert.equal(formatHours("28800"), "eight hours");
    assert.deepEqual(seen, [28800, "28800"], "the raw value reaches the formatter unnormalized");
    assert.deepEqual(receivers, [surface, surface], "the method keeps its own receiver");
  });

  it("returns an empty string when the formatter does, rather than falling back", () => {
    // `formatter?.hours(value) || fallback` would substitute the local text here. The existing
    // conditional does not, and must not start.
    const formatHours = liftFormatter(dashboardSource, OPENER, { hours: () => "" });
    assert.equal(formatHours(3600), "", "a valid formatter's empty answer is the answer");
  });

  it("lets a formatter's exception through rather than converting it to fallback output", () => {
    const failure = new Error("formatter is broken");
    const formatHours = liftFormatter(dashboardSource, OPENER, { hours: () => { throw failure; } });
    assert.throws(() => formatHours(3600), (/** @type {unknown} */ error) => {
      assert.equal(error, failure);
      return true;
    });
  });
});

describe("the Time Tracking reporting adapter keeps its truthiness tests", () => {
  const HOURS = "function formatHours(seconds) {";
  const CURRENCY = "function formatCurrency(amount) {";

  it("formats hours and currency locally when no surface was captured", () => {
    assert.equal(liftFormatter(reportingSource, HOURS, undefined)(3600), "1.00 hrs");
    assert.equal(liftFormatter(reportingSource, CURRENCY, undefined)(12.5), "$12.50");
    assert.equal(liftFormatter(reportingSource, CURRENCY, undefined)("nope"), "$0.00");
  });

  it("formats locally when the captured surface lacks the method", () => {
    assert.equal(liftFormatter(reportingSource, HOURS, { currency: () => "$1" })(1800), "0.50 hrs");
    assert.equal(liftFormatter(reportingSource, CURRENCY, { hours: () => "1h" })(3), "$3.00");
  });

  it("accepts a truthy non-function where the dashboard's typeof test would not", () => {
    // Preserved deliberately: this adapter tests truthiness, so a non-callable member reaches the
    // call and fails there. Making the two files agree would be a behaviour change, not a tidy-up.
    const formatHours = liftFormatter(reportingSource, HOURS, { hours: "8h" });
    assert.throws(() => formatHours(3600), TypeError);
  });

  it("uses the captured formatters on their own receivers", () => {
    /** @type {unknown[]} */
    const receivers = [];
    const surface = {
      currency(/** @type {unknown} */ amount) { receivers.push(this); return `USD ${String(amount)}`; },
      hours(/** @type {unknown} */ seconds) { receivers.push(this); return `H ${String(seconds)}`; },
    };
    assert.equal(liftFormatter(reportingSource, HOURS, surface)(60), "H 60");
    assert.equal(liftFormatter(reportingSource, CURRENCY, surface)(9), "USD 9");
    assert.deepEqual(receivers, [surface, surface]);
  });

  it("returns a formatter's empty string rather than the local fallback", () => {
    assert.equal(liftFormatter(reportingSource, HOURS, { hours: () => "" })(3600), "");
    assert.equal(liftFormatter(reportingSource, CURRENCY, { currency: () => "" })(5), "");
  });

  it("lets a formatter's exception through", () => {
    const failure = new Error("currency formatter is broken");
    const formatCurrency = liftFormatter(reportingSource, CURRENCY, { currency: () => { throw failure; } });
    assert.throws(() => formatCurrency(5), (/** @type {unknown} */ error) => {
      assert.equal(error, failure);
      return true;
    });
  });
});

describe("the formatter surface stays captured once", () => {
  it("keeps the object it captured when the namespace member is replaced", () => {
    const captured = { hours: () => "captured" };
    /** @type {Record<string, unknown>} */
    const namespace = { formatters: captured };
    const capture = dashboardSource.split("\n").find((line) => line.includes("const formatters = window.LongtailForge"));
    assert.ok(capture);
    const formatHours = new Function("window", [
      capture,
      slice(dashboardSource, "function formatHours(seconds) {"),
      "  return formatHours;",
    ].join("\n"))({ LongtailForge: namespace });

    assert.equal(formatHours(3600), "captured");
    namespace.formatters = { hours: () => "replaced" };
    assert.equal(formatHours(3600), "captured", "a replacement does not take over an existing capture");
  });

  it("never makes the formatter surface a requirement", () => {
    for (const [name, source] of /** @type {const} */ ([
      ["time-tracking-dashboard.js", dashboardSource],
      ["time-tracking-reporting.js", reportingSource],
    ])) {
      assert.ok(!/throw new Error\([^)]*[Ff]ormatters/.test(source),
        `${name} must not make the shared formatter surface mandatory`);
      assert.ok(!/require[Ff]ormatters/.test(source), `${name} must not add a require accessor`);
    }
  });

  it("reads the member once, at module scope, in both files", () => {
    for (const [name, source] of /** @type {const} */ ([
      ["time-tracking-dashboard.js", dashboardSource],
      ["time-tracking-reporting.js", reportingSource],
    ])) {
      assert.equal((source.match(/window\.LongtailForge\?\.formatters/g) || []).length, 1,
        `${name} must read the member exactly once`);
      assert.ok(!/formatters\s*\|\|\s*\{\}/.test(source),
        `${name} must not restore the empty-object stand-in`);
    }
  });

  it("keeps each file's own kind of test at the real call sites", () => {
    const dashboard = slice(dashboardSource, "function formatHours(seconds) {");
    assert.match(dashboard, /typeof formatters\?\.hours === "function"/,
      "the dashboard keeps its typeof-function test");

    for (const opener of ["function formatHours(seconds) {", "function formatCurrency(amount) {"]) {
      const body = slice(reportingSource, opener);
      assert.match(body, /formatters\?\.(hours|currency) \? formatters\.(hours|currency)\(/,
        "the reporting adapter keeps its truthiness test");
      assert.ok(!/typeof formatters/.test(body), "and is not homogenised into the other form");
    }
  });

  it("never substitutes an optional call with a falsy-coalescing fallback", () => {
    for (const source of [dashboardSource, reportingSource]) {
      assert.ok(!/formatters\?\.(hours|currency)\([^)]*\)\s*\|\|/.test(source),
        "`formatter?.method(value) || fallback` would swallow a valid empty result");
    }
  });
});

describe("the view descriptor adapter keeps its required-function guard", () => {
  const MESSAGE = "View primitives require LongtailForge.viewSurfaceDescriptor.normalize.";

  it("refuses an absent adapter with the same named error", () => {
    assert.throws(() => liftNormalizer({})({ id: "surface" }), (/** @type {unknown} */ error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, MESSAGE);
      return true;
    });
  });

  it("refuses an adapter whose normalize is missing or not a function", () => {
    for (const adapter of [{}, { normalize: null }, { normalize: "yes" }, { normalize: 3 }]) {
      assert.throws(() => liftNormalizer({ viewSurfaceDescriptor: adapter })({ id: "surface" }),
        new RegExp("^Error: View primitives require"), `refused for ${JSON.stringify(adapter)}`);
    }
  });

  it("calls normalize on its own adapter, with the descriptor it was given", () => {
    /** @type {unknown[]} */
    const receivers = [];
    /** @type {unknown[]} */
    const args = [];
    const normalized = { normalized: true };
    const adapter = {
      normalize(/** @type {unknown} */ descriptor) {
        receivers.push(this);
        args.push(descriptor);
        return normalized;
      },
    };
    const descriptor = { id: "surface" };

    assert.equal(liftNormalizer({ viewSurfaceDescriptor: adapter })(descriptor), normalized,
      "the normalized object is returned by identity");
    assert.deepEqual(receivers, [adapter], "normalize keeps its own receiver");
    assert.equal(args[0], descriptor, "the descriptor reaches it unchanged");
  });

  it("looks the adapter up on every call, so a replacement between calls is used", () => {
    /** @type {Record<string, unknown>} */
    const root = { viewSurfaceDescriptor: { normalize: () => ({ which: "first" }) } };
    const normalize = liftNormalizer(root);

    assert.deepEqual(normalize({}), { which: "first" });
    root.viewSurfaceDescriptor = { normalize: () => ({ which: "second" }) };
    assert.deepEqual(normalize({}), { which: "second" });
    root.viewSurfaceDescriptor = undefined;
    assert.throws(() => normalize({}), new RegExp("^Error: View primitives require"),
      "and an adapter removed between calls is refused again");
  });

  it("reads from the captured root inside the function, not at module scope", () => {
    const body = slice(viewBuilderSource, "function normalizeSurfaceDescriptor(descriptor) {");
    assert.match(body, /const adapter = root\.viewSurfaceDescriptor;/,
      "the lookup stays inside the function");
    assert.ok(!/^\s*const \w*[Aa]dapter = root\.viewSurfaceDescriptor/m
      .test(viewBuilderSource.slice(0, viewBuilderSource.indexOf("function normalizeSurfaceDescriptor"))),
    "nothing caches the adapter at module scope");
    assert.ok(!/viewSurfaceDescriptor \|\| \{\}/.test(viewBuilderSource),
      "the empty-object stand-in is gone and must not return");
    assert.match(body, /typeof adapter\?\.normalize !== "function"/,
      "the function check is what narrows it");
  });
});
