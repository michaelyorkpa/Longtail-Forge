import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/timezones.js");

/**
 * The shared timezone helpers, through the shipped module.
 *
 * `0.33.33.39.42` typed this file's parameters and changed no executable line. Nothing had ever
 * executed it - only source-text owners read it - so these cases are the coverage that absence
 * left, and they hold the conversions the rest of the app depends on: the offset at an instant,
 * a wall-clock reading resolved to UTC across a DST boundary, and the fallbacks for a zone or a
 * value this runtime cannot use.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {string} [stored] the zone localStorage answers when the module loads */
function timezones(stored = "UTC") {
  /** @type {Record<string, string>} */
  const store = {};
  if (stored) {
    store.lf_timezone = stored;
  }
  /** @type {Bag} */
  const window = {
    localStorage: {
      /** @param {string} key */
      getItem: (key) => (Object.hasOwn(store, key) ? store[key] : null),
      /** @param {string} key @param {string} value */
      setItem: (key, value) => { store[key] = value; },
    },
  };
  vm.runInNewContext(source, { window, fetch: () => Promise.reject(new Error("unused")) },
    { filename: "timezones.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.timezones;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  return { api, member, store };
}

describe("the zone a value is normalized to", () => {
  it("keeps a zone this runtime accepts, trimmed", () => {
    const normalizeTimezone = timezones().member("normalizeTimezone");
    assert.equal(normalizeTimezone("America/New_York"), "America/New_York");
    assert.equal(normalizeTimezone("  Europe/Paris  "), "Europe/Paris");
    assert.equal(normalizeTimezone("UTC"), "UTC");
  });

  it("falls back to the default for anything it cannot use", () => {
    const normalizeTimezone = timezones().member("normalizeTimezone");
    for (const value of ["", "   ", null, undefined, 0, false, "Mars/Olympus", "not a zone"]) {
      assert.equal(normalizeTimezone(value), "America/New_York", `value: ${String(value)}`);
    }
  });

  it("coerces a non-string the way String coerced it", () => {
    const normalizeTimezone = timezones().member("normalizeTimezone");
    assert.equal(normalizeTimezone({ toString: () => "Europe/Paris" }), "Europe/Paris",
      "an object that names a zone is accepted, because the zone is read as text");
    assert.equal(normalizeTimezone(["UTC"]), "UTC", "a single-element array stringifies to its element");
  });
});

describe("the zone the module remembers", () => {
  it("loads the stored zone and answers it", () => {
    const { member } = timezones("Europe/Paris");
    assert.equal(member("getUserTimezone")(), "Europe/Paris");
  });

  it("normalizes a stored zone the runtime no longer accepts", () => {
    const { member } = timezones("Mars/Olympus");
    assert.equal(member("getUserTimezone")(), "America/New_York");
  });

  it("stores what it normalized, and answers that", () => {
    const { member, store } = timezones("UTC");
    assert.equal(member("setUserTimezone")("  Asia/Tokyo  "), "Asia/Tokyo");
    assert.equal(store.lf_timezone, "Asia/Tokyo", "the normalized zone is what reaches storage");
    assert.equal(member("getUserTimezone")(), "Asia/Tokyo");

    assert.equal(member("setUserTimezone")(null), "America/New_York",
      "an unusable zone stores the default rather than nothing");
    assert.equal(store.lf_timezone, "America/New_York");
  });
});

describe("the offset a zone carries at an instant", () => {
  const formatUtcOffset = timezones().member("formatUtcOffset");

  it("reports zero for UTC and the sign for either side of it", () => {
    const instant = new Date("2026-01-15T12:00:00Z");
    assert.equal(formatUtcOffset(instant, "UTC"), "UTC +00:00");
    assert.equal(formatUtcOffset(instant, "America/New_York"), "UTC -05:00");
    assert.equal(formatUtcOffset(instant, "Europe/Paris"), "UTC +01:00");
  });

  it("follows daylight saving rather than a fixed table", () => {
    // The same zone, six months apart. A fixed offset would answer the same twice.
    assert.equal(formatUtcOffset(new Date("2026-01-15T12:00:00Z"), "America/New_York"), "UTC -05:00");
    assert.equal(formatUtcOffset(new Date("2026-07-15T12:00:00Z"), "America/New_York"), "UTC -04:00");
  });

  it("pads a half-hour zone to two digits on both sides", () => {
    assert.equal(formatUtcOffset(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata"), "UTC +05:30");
    assert.equal(formatUtcOffset(new Date("2026-01-15T12:00:00Z"), "Pacific/Marquesas"), "UTC -09:30");
  });
});

describe("a wall-clock reading resolved to UTC", () => {
  it("resolves a date and time in the zone it was written in", () => {
    const zonedDateTimeToUtcIso = timezones().member("zonedDateTimeToUtcIso");
    assert.equal(zonedDateTimeToUtcIso("2026-01-15", "09:30:00", "America/New_York"),
      "2026-01-15T14:30:00.000Z");
    assert.equal(zonedDateTimeToUtcIso("2026-01-15", "09:30:00", "UTC"),
      "2026-01-15T09:30:00.000Z");
  });

  it("uses the remembered zone when none is given", () => {
    const { member } = timezones("Europe/Paris");
    assert.equal(member("zonedDateTimeToUtcIso")("2026-01-15", "09:30:00"),
      "2026-01-15T08:30:00.000Z");
  });

  it("defaults the seconds and accepts a time without them", () => {
    const zonedDateTimeToUtcIso = timezones().member("zonedDateTimeToUtcIso");
    assert.equal(zonedDateTimeToUtcIso("2026-03-02", "07:15", "UTC"), "2026-03-02T07:15:00.000Z");
  });

  it("crosses a daylight-saving boundary with the offset in force on each side", () => {
    // US DST began 2026-03-08. The same wall time is -05:00 the day before and -04:00 after.
    const zonedDateTimeToUtcIso = timezones().member("zonedDateTimeToUtcIso");
    assert.equal(zonedDateTimeToUtcIso("2026-03-07", "12:00:00", "America/New_York"),
      "2026-03-07T17:00:00.000Z");
    assert.equal(zonedDateTimeToUtcIso("2026-03-09", "12:00:00", "America/New_York"),
      "2026-03-09T16:00:00.000Z");
  });

  it("answers the empty string for a reading it cannot parse", () => {
    const zonedDateTimeToUtcIso = timezones().member("zonedDateTimeToUtcIso");
    assert.equal(zonedDateTimeToUtcIso("", "09:30:00", "UTC"), "");
    assert.equal(zonedDateTimeToUtcIso("2026-01-15", "", "UTC"), "");
    assert.equal(zonedDateTimeToUtcIso("not-a-date", "09:30:00", "UTC"), "");
    assert.equal(zonedDateTimeToUtcIso("2026-01-15", "not-a-time", "UTC"), "");
  });
});

describe("the inputs a date and a time are written back into", () => {
  it("renders the date and time that zone was showing at the instant", () => {
    const { member } = timezones();
    const instant = new Date("2026-01-15T14:30:45Z");
    assert.equal(member("formatDateInput")(instant, "America/New_York"), "2026-01-15");
    assert.equal(member("formatTimeInput")(instant, "America/New_York"), "09:30:45");
  });

  it("rolls the date over when the zone is already on the next day", () => {
    const { member } = timezones();
    const instant = new Date("2026-01-15T23:30:00Z");
    assert.equal(member("formatDateInput")(instant, "Asia/Tokyo"), "2026-01-16");
    assert.equal(member("formatTimeInput")(instant, "Asia/Tokyo"), "08:30:00");
  });

  it("writes midnight as 00 rather than 24", () => {
    const { member } = timezones();
    assert.equal(member("formatTimeInput")(new Date("2026-01-15T00:00:00Z"), "UTC"), "00:00:00");
  });

  it("round-trips a wall-clock reading back to itself", () => {
    const { member } = timezones();
    const iso = member("zonedDateTimeToUtcIso")("2026-07-04", "13:45:30", "America/New_York");
    const instant = new Date(String(iso));
    assert.equal(member("formatDateInput")(instant, "America/New_York"), "2026-07-04");
    assert.equal(member("formatTimeInput")(instant, "America/New_York"), "13:45:30");
  });
});

describe("the values a formatted date accepts", () => {
  it("formats a Date, an ISO string and an epoch number alike", () => {
    const formatDateTime = timezones().member("formatDateTime");
    // `dateStyle: "short"` renders a two-digit year; this pins the rendering, not just the parse.
    assert.equal(formatDateTime(new Date("2026-01-15T14:30:45Z"), "UTC"), "1/15/26, 2:30:45 PM");
    assert.equal(formatDateTime("2026-01-15T14:30:45Z", "UTC"), "1/15/26, 2:30:45 PM");
    assert.equal(formatDateTime(Date.parse("2026-01-15T14:30:45Z"), "UTC"), "1/15/26, 2:30:45 PM");
  });

  it("answers the empty string for a value that is not a time", () => {
    const formatDateTime = timezones().member("formatDateTime");
    for (const value of ["not a date", Number.NaN, "", undefined]) {
      assert.equal(formatDateTime(value, "UTC"), "", `value: ${String(value)}`);
    }
  });

  it("formats null as the epoch, which is what `new Date(null)` has always answered", () => {
    // Recorded rather than changed, and out of contract either way: `formatDateTime` is declared
    // `Date | string | number`. `new Date(null)` is `new Date(0)`, a finite instant, so the
    // guard below it never sees an invalid date. `undefined` does reach that guard.
    const formatDateTime = timezones().member("formatDateTime");
    assert.equal(formatDateTime(null, "UTC"), "1/1/70, 12:00:00 AM");
  });

  it("formats the date alone in the zone it is asked for", () => {
    const formatDate = timezones().member("formatDate");
    const instant = new Date("2026-01-15T23:30:00Z");
    assert.equal(formatDate(instant, "UTC"), "1/15/2026");
    assert.equal(formatDate(instant, "Asia/Tokyo"), "1/16/2026", "the zone decides the day");
  });
});

describe("the day a local date covers", () => {
  it("spans that zone's own midnight to its last second", () => {
    const localDateRangeToUtc = timezones().member("localDateRangeToUtc");
    const range = localDateRangeToUtc("2026-01-15", "America/New_York");
    assert.ok(isBag(range));
    assert.equal(/** @type {Date} */ (range.start).toISOString(), "2026-01-15T05:00:00.000Z");
    assert.equal(/** @type {Date} */ (range.end).toISOString(), "2026-01-16T04:59:59.000Z");
  });

  it("shifts with the zone rather than with UTC", () => {
    const localDateRangeToUtc = timezones().member("localDateRangeToUtc");
    const tokyo = localDateRangeToUtc("2026-01-15", "Asia/Tokyo");
    assert.ok(isBag(tokyo));
    assert.equal(/** @type {Date} */ (tokyo.start).toISOString(), "2026-01-14T15:00:00.000Z");
  });
});

describe("the zones offered for selection", () => {
  it("lists every zone once, sorted, each labelled with its offset", () => {
    const listSupportedTimezones = timezones().member("listSupportedTimezones");
    const options = listSupportedTimezones(new Date("2026-01-15T12:00:00Z"));
    assert.ok(Array.isArray(options));
    assert.ok(options.length > 100, "the runtime's zones, not a hand-written table");

    // The list is built in the module's realm, so it is spread into this one before comparing:
    // a cross-realm array carries a different prototype and would never compare equal.
    const values = [...options].map((option) => {
      assert.ok(isBag(option));
      return String(option.value);
    });
    assert.deepEqual(values, [...values].sort((left, right) => left.localeCompare(right)), "sorted");
    assert.equal(new Set(values).size, values.length, "no zone appears twice");
    assert.ok(values.includes("UTC"), "UTC is offered even where the runtime omits it");

    const utc = options.find((option) => isBag(option) && option.value === "UTC");
    assert.ok(isBag(utc));
    assert.equal(utc.label, "UTC (UTC +00:00)");
  });
});
