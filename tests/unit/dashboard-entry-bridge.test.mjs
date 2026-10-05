import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/dashboard.entry.js");

/**
 * The dashboard ES-module entry's bridge and panel readers.
 *
 * Thirteen of the fifteen diagnostics this checkpoint cleared were parameters and two were a
 * default inferring an empty shape - all compiler-proved. **The signatures were not invented
 * here**: `BrowserEsModuleBridge` and `BrowserDashboardBootstrap` were written from these very
 * writers and declare `unknown` deliberately, so honouring them meant proving values are records
 * rather than narrowing the published promise. These cases hold the answers that proof produces,
 * and cover the asset refusals the bridge exists to make.
 */

const LIFTED = [
  "dashboardRecord", "versionedAssetUrl", "dashboardPanelRoute", "warmDashboardPanelData",
  "loadDashboardRoute", "dashboardCalendarRange", "dashboardAddDays", "dashboardDateKey",
];

/**
 * @param {object} [options]
 * @param {string} [options.assetVersion] what the namespace publishes as the asset version
 * @param {string | null} [options.metaVersion] what the asset-version meta tag carries
 * @param {string} [options.preferredCalendarView] the stored calendar preference
 * @param {boolean} [options.narrowViewport] whether the media query reports a narrow screen
 */
function entryCase(options = {}) {
  const { assetVersion = "", metaVersion = null, preferredCalendarView = "", narrowViewport = false } = options;
  /** @type {string[]} */
  const requested = [];
  const dashboardDataPromises = new Map();

  const namespace = {
    assetVersion: assetVersion ? { value: assetVersion } : undefined,
    userPreferences: { preferredCalendarView },
  };
  const sandbox = vm.createContext({
    URL, URLSearchParams, Date,
    namespace,
    dashboardDataPromises,
    document: {
      baseURI: "https://app.test/dashboard.html",
      /** @param {string} selector */
      querySelector: (selector) => (selector === "meta[data-asset-version]" && metaVersion !== null
        ? { content: metaVersion }
        : null),
    },
    window: {
      location: { origin: "https://app.test" },
      /** @param {string} query */
      matchMedia: (query) => ({ matches: narrowViewport && query === "(max-width: 700px)" }),
    },
    requireApi: () => ({
      /** @param {string} route */
      getJson: (route) => { requested.push(route); return Promise.resolve({ route }); },
    }),
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox), dashboardDataPromises, requested };
}

describe("Dashboard record proof", () => {
  it("answers a record as itself", () => {
    const { api } = entryCase();
    assert.deepEqual(JSON.parse(JSON.stringify(api.dashboardRecord({ a: 1 }))), { a: 1 });
  });

  /**
   * **An empty record, not null.** Every reader went on to take a member and receive
   * `undefined`, so answering `{}` keeps them free of optional chains that would only ever
   * describe the same answer.
   */
  it("answers an empty record for everything that is not one", () => {
    const { api } = entryCase();
    for (const value of [null, undefined, "text", 5, true, [1, 2]]) {
      assert.deepEqual(JSON.parse(JSON.stringify(api.dashboardRecord(value))), {}, `value: ${JSON.stringify(value)}`);
    }
  });
});

describe("Dashboard asset URL", () => {
  /**
   * **Non-throwing first.** A refusal that widened to cover every path would make this case
   * crash rather than answer wrongly, and a crash is not the same evidence as a wrong answer.
   */
  it("resolves a local script path against the page and stamps the published version", () => {
    const { api } = entryCase({ assetVersion: "42" });
    assert.doesNotThrow(() => api.versionedAssetUrl("/js/dashboard.js"), "a local asset must be accepted");
    assert.equal(api.versionedAssetUrl("/js/dashboard.js"), "https://app.test/js/dashboard.js?v=42");
  });

  it("falls back to the meta tag when the namespace publishes no version", () => {
    const { api } = entryCase({ metaVersion: "meta-7" });
    assert.equal(api.versionedAssetUrl("/css/app.css"), "https://app.test/css/app.css?v=meta-7");
  });

  it("stamps nothing when neither source names a version", () => {
    const { api } = entryCase();
    assert.equal(api.versionedAssetUrl("/js/dashboard.js"), "https://app.test/js/dashboard.js");
  });

  /** **The refusal the bridge exists for.** Anything off-origin or outside /css/ and /js/ throws. */
  it("refuses an asset that leaves this origin", () => {
    const { api } = entryCase();
    assert.throws(() => api.versionedAssetUrl("https://elsewhere.test/js/evil.js"), /refused non-local browser asset/);
  });

  it("refuses a local path outside the two asset directories", () => {
    const { api } = entryCase();
    for (const path of ["/uploads/x.js", "/dashboard.html", "/api/dashboard", ""]) {
      assert.throws(() => api.versionedAssetUrl(path), /refused non-local browser asset/, `path: ${path}`);
    }
  });

  it("refuses a protocol-relative path that would leave the origin", () => {
    const { api } = entryCase();
    assert.throws(() => api.versionedAssetUrl("//elsewhere.test/js/evil.js"), /refused non-local browser asset/);
  });

  /** The published signature accepts anything; a value that is not a path still refuses. */
  it("refuses a non-string asset path rather than throwing something unreadable", () => {
    const { api } = entryCase();
    for (const value of [null, undefined, 5, {}]) {
      assert.throws(() => api.versionedAssetUrl(value), /refused non-local browser asset/, `value: ${String(value)}`);
    }
  });
});

describe("Dashboard panel route", () => {
  it("answers the descriptor's own route for an ordinary panel", () => {
    const { api } = entryCase();
    assert.equal(api.dashboardPanelRoute({ dataRoute: "/api/notes/recent" }), "/api/notes/recent");
  });

  it("trims the route it was given", () => {
    const { api } = entryCase();
    assert.equal(api.dashboardPanelRoute({ dataRoute: "  /api/notes/recent  " }), "/api/notes/recent");
  });

  it("answers an empty route for a descriptor naming none", () => {
    const { api } = entryCase();
    assert.equal(api.dashboardPanelRoute({}), "");
    assert.equal(api.dashboardPanelRoute(), "");
  });

  /**
   * The published surface promises to accept anything, so these are the values it must tolerate.
   * Each answers the empty route, which is what reading `dataRoute` off the old `{}` produced.
   */
  it("answers an empty route for anything that is not a descriptor", () => {
    const { api } = entryCase();
    for (const value of [null, "panel", 7, [{ dataRoute: "/api/x" }], true]) {
      assert.equal(api.dashboardPanelRoute(value), "", `value: ${JSON.stringify(value)}`);
    }
  });

  /** A calendar renderer on a different route is left alone; both must match. */
  it("leaves the calendar renderer alone when its route is not the calendar route", () => {
    const { api } = entryCase();
    assert.equal(
      api.dashboardPanelRoute({ dataRoute: "/api/tasks/list", renderer: "tasks.calendar" }),
      "/api/tasks/list",
    );
  });

  it("leaves the calendar route alone when the renderer is not the calendar", () => {
    const { api } = entryCase();
    assert.equal(
      api.dashboardPanelRoute({ dataRoute: "/api/tasks/calendar", renderer: "tasks.list" }),
      "/api/tasks/calendar",
    );
  });

  /** Both together fold in a range and the active statuses. */
  it("folds a range and the active statuses into the calendar panel's route", () => {
    const { api } = entryCase({ preferredCalendarView: "day" });
    const route = api.dashboardPanelRoute({ dataRoute: "/api/tasks/calendar", renderer: "tasks.calendar" });
    const query = new URLSearchParams(route.slice(route.indexOf("?") + 1));
    assert.ok(route.startsWith("/api/tasks/calendar?"));
    assert.equal(query.get("statuses"), "open,in_progress,blocked");
    assert.equal(query.get("start"), query.get("end"), "a day view spans a single date");
    assert.match(String(query.get("start")), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("honours a stored week preference over the viewport", () => {
    const { api } = entryCase({ narrowViewport: true, preferredCalendarView: "week" });
    const route = api.dashboardPanelRoute({ dataRoute: "/api/tasks/calendar", renderer: "tasks.calendar" });
    const query = new URLSearchParams(route.slice(route.indexOf("?") + 1));
    assert.notEqual(query.get("start"), query.get("end"), "a week view spans more than one date");
  });

  /** With no usable preference the viewport decides, and a wide screen gets the month. */
  it("falls back to the viewport when no supported preference is stored", () => {
    for (const preferred of ["", "fortnight"]) {
      const narrow = entryCase({ narrowViewport: true, preferredCalendarView: preferred });
      const narrowRoute = narrow.api.dashboardPanelRoute({ dataRoute: "/api/tasks/calendar", renderer: "tasks.calendar" });
      const narrowQuery = new URLSearchParams(narrowRoute.slice(narrowRoute.indexOf("?") + 1));
      assert.equal(narrowQuery.get("start"), narrowQuery.get("end"), `narrow, preferred: ${preferred}`);

      const wide = entryCase({ narrowViewport: false, preferredCalendarView: preferred });
      const wideRoute = wide.api.dashboardPanelRoute({ dataRoute: "/api/tasks/calendar", renderer: "tasks.calendar" });
      const wideQuery = new URLSearchParams(wideRoute.slice(wideRoute.indexOf("?") + 1));
      assert.notEqual(wideQuery.get("start"), wideQuery.get("end"), `wide, preferred: ${preferred}`);
    }
  });
});

describe("Dashboard calendar range", () => {
  it("spans exactly one day for the day view", () => {
    const { api } = entryCase();
    const range = api.dashboardCalendarRange("day", new Date(2026, 8, 15));
    assert.deepEqual([range.start, range.end], ["2026-09-15", "2026-09-15"]);
  });

  it("spans a Sunday-anchored week for the week view", () => {
    const { api } = entryCase();
    const range = api.dashboardCalendarRange("week", new Date(2026, 8, 15));
    assert.deepEqual([range.start, range.end], ["2026-09-13", "2026-09-19"]);
  });

  /** The month view pads to whole weeks at both ends, so a grid renders without gaps. */
  it("pads the month to whole weeks at both ends", () => {
    const { api } = entryCase();
    // September 2026 opens on a Tuesday and closes on a Wednesday, so the grid reaches back to
    // Sunday 30 August and forward to Saturday 3 October.
    const range = api.dashboardCalendarRange("month", new Date(2026, 8, 15));
    assert.deepEqual([range.start, range.end], ["2026-08-30", "2026-10-03"]);
    assert.equal(new Date(`${range.start}T00:00:00`).getDay(), 0, "the padded range must start on a Sunday");
    assert.equal(new Date(`${range.end}T00:00:00`).getDay(), 6, "and end on a Saturday");
  });

  it("keys a date without drifting across a timezone boundary", () => {
    const { api } = entryCase();
    assert.equal(api.dashboardDateKey(new Date(2026, 0, 1)), "2026-01-01");
    assert.equal(api.dashboardDateKey(new Date(2026, 11, 31)), "2026-12-31");
  });

  it("adds days across a month boundary", () => {
    const { api } = entryCase();
    assert.equal(api.dashboardDateKey(api.dashboardAddDays(new Date(2026, 8, 30), 2)), "2026-10-02");
    assert.equal(api.dashboardDateKey(api.dashboardAddDays(new Date(2026, 8, 1), -1)), "2026-08-31");
  });
});

describe("Dashboard panel warm-up", () => {
  it("requests every contributed panel's route once", async () => {
    const testCase = entryCase();
    testCase.api.warmDashboardPanelData({
      extensionPoints: { dashboardPanels: [{ dataRoute: "/api/a" }, { dataRoute: "/api/b" }] },
    });
    await Promise.resolve();
    assert.deepEqual(testCase.requested, ["/api/a", "/api/b"]);
  });

  it("memoizes a route so a second panel naming it does not refetch", async () => {
    const testCase = entryCase();
    testCase.api.warmDashboardPanelData({
      extensionPoints: { dashboardPanels: [{ dataRoute: "/api/a" }, { dataRoute: "/api/a" }] },
    });
    await Promise.resolve();
    assert.deepEqual(testCase.requested, ["/api/a"]);
  });

  it("skips a panel naming no route", async () => {
    const testCase = entryCase();
    testCase.api.warmDashboardPanelData({ extensionPoints: { dashboardPanels: [{}, { dataRoute: "" }] } });
    await Promise.resolve();
    assert.deepEqual(testCase.requested, []);
  });

  /**
   * The manifest body is `unknown` where it is produced, so every shape that used to answer
   * `undefined` through the optional chain must still reach the same empty loop.
   */
  it("requests nothing for a manifest it cannot read", async () => {
    for (const data of [null, undefined, "manifest", 5, [], {}, { extensionPoints: null },
      { extensionPoints: "panels" }, { extensionPoints: { dashboardPanels: "one" } }]) {
      const testCase = entryCase();
      assert.doesNotThrow(() => testCase.api.warmDashboardPanelData(data), `data: ${JSON.stringify(data)}`);
      await Promise.resolve();
      assert.deepEqual(testCase.requested, [], `data: ${JSON.stringify(data)}`);
    }
  });

  it("answers the manifest it was given, so it can sit in a promise chain", () => {
    const testCase = entryCase();
    const data = { extensionPoints: { dashboardPanels: [] } };
    assert.equal(testCase.api.warmDashboardPanelData(data), data);
  });
});

describe("dashboard.entry.js shapes this module states rather than invents", () => {
  /** The bridge's signatures are the published ones, not narrower guesses. */
  it("declares the bridge parameters as the published contract does", () => {
    for (const spelling of [
      /@param \{unknown\} \[assetPath\]/,
      /@param \{readonly unknown\[\]\} assetPaths/,
      /@param \{unknown\} \[assets\]/,
      /@param \{unknown\} \[routeValue\]/,
      /@param \{unknown\} \[panel\]/,
    ]) {
      assert.match(source, spelling, `missing ${spelling}`);
    }
  });

  /** Three suites slice this function by its exact opening line. */
  it("keeps the panel-route signature the slicing suites match", () => {
    assert.match(source, /function dashboardPanelRoute\(panel = \{\}\) \{/);
  });

  it("proves the panel descriptor before reading it", () => {
    assert.match(source, /const descriptor = dashboardRecord\(panel\);/);
    assert.match(source, /descriptor\.renderer !== "tasks\.calendar"/);
  });

  /** The entry contract forbids these three in this file, comments included. */
  it("adds nothing the module-entry contract forbids", () => {
    assert.doesNotMatch(source, /eval\(|new Function\(|https?:\/\//);
  });

  it("carries no suppression, and only the cast the record proof earns", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    const casts = source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || [];
    assert.equal(casts.length, 1, "only dashboardRecord asserts, and only behind a proved check");
  });
});
