import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/dashboard.js");
const contracts = reader.readText("src/types/browser-contracts.d.ts");

const LIFTED = [
  "dashboardRecord", "dashboardRecordList", "dashboardActionInput", "dashboardLayoutRegions",
  "requireDashboardPanelNode", "normalizeRenderedPanels", "normalizeDashboardPlacement",
  "dashboardRegionLabel", "registerDashboardPanelRenderer", "findDashboardContribution",
  "loadContributionData", "setDashboardStatus", "createDashboardRegionEmptyState",
  "createDashboardPanel",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {Record<string, unknown> | null} [options.data] the snapshot the page has accepted
 * @param {Record<string, unknown>[]} [options.panels] the contributions it read out of it
 * @param {Record<string, unknown>} [options.bootstrap] the entry module's shared load state
 */
function dashboardCase(options = {}) {
  const document = new FakeDocument();

  /** @param {string} tag @param {Record<string, unknown>} [props] */
  const element = (tag, props = {}) => Object.assign(document.createElement(tag), props);

  // The view factory is stubbed rather than lifted: `createEmptyState` and `createElement` are
  // `shared/view-builder.js`'s work and are pinned there. What this fixture needs is the options
  // bag each call was handed, which is what these record.
  /** @param {unknown} value @returns {Record<string, unknown>} */
  const recordOf = (value) => (value && typeof value === "object"
    ? /** @type {Record<string, unknown>} */ (value)
    : {});

  /**
   * @type {{
   *   emptyState: Record<string, unknown>[],
   *   elements: { tag: string, attrs: Record<string, unknown>, dataset: Record<string, unknown>, className: unknown, text: unknown }[],
   * }}
   */
  const viewCalls = { emptyState: [], elements: [] };
  const view = {
    /** @param {Record<string, unknown>} createOptions */
    createEmptyState(createOptions) {
      viewCalls.emptyState.push(createOptions);
      return element("div", { className: "empty-state" });
    },
    /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
    createElement(tag, createOptions = {}) {
      viewCalls.elements.push({
        tag,
        attrs: recordOf(createOptions.attrs),
        dataset: recordOf(createOptions.dataset),
        className: createOptions.className,
        text: createOptions.text,
      });
      const node = element(tag);
      if (typeof createOptions.text === "string") node.textContent = createOptions.text;
      return node;
    },
  };

  const dashboardDataPromises = new Map();
  /** @type {Record<string, unknown>} */
  const dashboardPanelRenderers = {};
  /** @type {unknown[]} */
  const rerenders = [];
  /** @type {{ route: string, init: unknown }[]} */
  const apiCalls = [];

  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: { LongtailForge: {} },
    dashboardData: options.data === undefined ? null : options.data,
    dashboardPanels: options.panels || [],
    dashboardPanelRenderers,
    dashboardDataPromises,
    dashboardBootstrap: options.bootstrap,
    dashboardStatus: element("p"),
    KNOWN_DASHBOARD_PLACEMENTS: new Set([
      "pulse", "attention", "calendar", "today", "main", "activity", "secondary",
    ]),
    requireView: () => view,
    requireApi: () => ({
      /** @param {string} route @param {unknown} init */
      getJson(route, init) {
        apiCalls.push({ route, init });
        return Promise.resolve({ route });
      },
    }),
    renderRegisteredDashboardPanels: () => rerenders.push(true),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);

  return { api, context, document, element, view, viewCalls, dashboardPanelRenderers, dashboardDataPromises, rerenders, apiCalls };
}

describe("Dashboard wire-record readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = dashboardCase();
    assert.deepEqual(plain(api.dashboardRecord({ id: "main" })), { id: "main" });
    assert.equal(api.dashboardRecord(null), null);
    assert.equal(api.dashboardRecord(undefined), null);
    assert.equal(api.dashboardRecord("main"), null);
    assert.equal(api.dashboardRecord(7), null);
  });

  /**
   * An array is refused because every caller asks for a member *by name*, which an array answers
   * `undefined` for anyway - so this reaches the same fallback rather than a different one.
   */
  it("refuses an array, which reaches the same fallback the untyped read did", () => {
    const { api } = dashboardCase();
    assert.equal(api.dashboardRecord(["main"]), null);
    assert.equal(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (["main"])).label, undefined);
  });

  /**
   * **The count is the claim.** The untyped page read `entry.label` off whatever the list held,
   * got `undefined`, and drew the entry with its defaults. Filtering here would remove a row the
   * page has always drawn, so a malformed entry becomes an empty record instead.
   */
  it("keeps a malformed list entry as an empty record rather than dropping it", () => {
    const { api } = dashboardCase();
    const list = api.dashboardRecordList([{ id: "a" }, "b", null, 4, { id: "e" }]);
    assert.equal(list.length, 5);
    assert.deepEqual(plain(list), [{ id: "a" }, {}, {}, {}, { id: "e" }]);
  });

  it("answers no entries for a value that is not a list", () => {
    const { api } = dashboardCase();
    assert.deepEqual(plain(api.dashboardRecordList({ id: "a" })), []);
    assert.deepEqual(plain(api.dashboardRecordList(undefined)), []);
    assert.deepEqual(plain(api.dashboardRecordList("a")), []);
  });

  /**
   * **Identity, not equality.** `createEmptyState` accepts a node or an options bag per entry and
   * coerces each one itself, so rebuilding the list here would only narrow what it will draw.
   */
  it("passes an action list through unchanged and answers none for anything else", () => {
    const { api } = dashboardCase();
    const actions = [{ label: "Open Workbench" }];
    assert.equal(api.dashboardActionInput(actions), actions);
    assert.deepEqual(plain(api.dashboardActionInput("Open Workbench")), []);
    assert.deepEqual(plain(api.dashboardActionInput(undefined)), []);
  });
});

describe("Dashboard layout regions", () => {
  it("reads the regions through the layout branch", () => {
    const { api } = dashboardCase({ data: { layout: { regions: [{ id: "main", label: "Module Overview" }] } } });
    assert.deepEqual(plain(api.dashboardLayoutRegions()), [{ id: "main", label: "Module Overview" }]);
  });

  it("answers no regions when the layout branch is absent or is not a record", () => {
    assert.deepEqual(plain(dashboardCase({ data: {} }).api.dashboardLayoutRegions()), []);
    assert.deepEqual(plain(dashboardCase({ data: { layout: "main" } }).api.dashboardLayoutRegions()), []);
    assert.deepEqual(plain(dashboardCase({ data: null }).api.dashboardLayoutRegions()), []);
  });

  it("labels a region by its normalized id, trimmed, and answers empty when none matches", () => {
    const { api } = dashboardCase({
      data: { layout: { regions: [{ id: "activity", label: "  Recent Activity  " }, { id: "main" }] } },
    });
    assert.equal(api.dashboardRegionLabel("activity"), "Recent Activity");
    assert.equal(api.dashboardRegionLabel("main"), "");
    assert.equal(api.dashboardRegionLabel("pulse"), "");
  });

  /**
   * An unrecognised region id normalizes to `main` on both sides of the comparison, so a region
   * the layout declares under an unknown id labels the main region rather than nothing.
   */
  it("normalizes the declared id as well as the one it is asked about", () => {
    const { api } = dashboardCase({ data: { layout: { regions: [{ id: "invented", label: "Invented" }] } } });
    assert.equal(api.dashboardRegionLabel("main"), "Invented");
  });
});

describe("Dashboard placement normalization", () => {
  it("keeps a known placement and falls back to main for anything else", () => {
    const { api } = dashboardCase();
    for (const placement of ["pulse", "attention", "calendar", "today", "main", "activity", "secondary"]) {
      assert.equal(api.normalizeDashboardPlacement(placement), placement);
    }
    assert.equal(api.normalizeDashboardPlacement("invented"), "main");
    assert.equal(api.normalizeDashboardPlacement(""), "main");
    assert.equal(api.normalizeDashboardPlacement(undefined), "main");
    assert.equal(api.normalizeDashboardPlacement(null), "main");
  });

  it("trims before deciding", () => {
    const { api } = dashboardCase();
    assert.equal(api.normalizeDashboardPlacement("  today  "), "today");
  });
});

describe("Dashboard rendered panels", () => {
  it("reduces the three shapes a renderer may return to a list", () => {
    const { api, element } = dashboardCase();
    const panel = element("article");
    assert.equal(api.normalizeRenderedPanels(null).length, 0);
    assert.equal(api.normalizeRenderedPanels(undefined).length, 0);
    assert.equal(api.normalizeRenderedPanels("").length, 0);
    assert.deepEqual([...api.normalizeRenderedPanels(panel)], [panel]);
    assert.deepEqual([...api.normalizeRenderedPanels([panel, null, panel])], [panel, panel]);
  });

  /**
   * The untyped page handed a renderer's return straight to `appendChild`, which throws on a
   * non-node. This throws for the same values at the same point: nothing that reached the DOM
   * before is dropped, and nothing that threw before now passes silently.
   */
  it("requires a node, and throws for a value the DOM would have rejected", () => {
    const { api, element } = dashboardCase();
    const panel = element("article");
    assert.equal(api.requireDashboardPanelNode(panel), panel);
    assert.throws(() => api.requireDashboardPanelNode("<article></article>"), /must return nodes/);
    assert.throws(() => api.requireDashboardPanelNode({ nodeType: 1 }), /must return nodes/);
  });

  it("accepts a text node, which the DOM would have appended", () => {
    const { api, document: fakeDocument } = dashboardCase();
    const text = fakeDocument.createTextNode("Panel");
    assert.equal(api.requireDashboardPanelNode(text), text);
  });
});

describe("Dashboard renderer registry", () => {
  it("registers a trimmed identifier and refuses an empty one", () => {
    const { api, dashboardPanelRenderers } = dashboardCase();
    const renderer = () => null;
    api.registerDashboardPanelRenderer("  time-billing  ", renderer);
    assert.equal(dashboardPanelRenderers["time-billing"], renderer);

    api.registerDashboardPanelRenderer("   ", renderer);
    api.registerDashboardPanelRenderer("", renderer);
    api.registerDashboardPanelRenderer(null, renderer);
    assert.deepEqual(Object.keys(dashboardPanelRenderers), ["time-billing"]);
  });

  it("refuses a renderer that is not callable", () => {
    const { api, dashboardPanelRenderers } = dashboardCase();
    api.registerDashboardPanelRenderer("time-billing", { render: () => null });
    assert.deepEqual(Object.keys(dashboardPanelRenderers), []);
  });

  /**
   * A renderer registered after the data arrived re-renders immediately, so a late registration
   * still shows its panel; one registered before it does not, because there is nothing to draw.
   */
  it("re-renders on a late registration only", () => {
    const early = dashboardCase({ data: null });
    early.api.registerDashboardPanelRenderer("time-billing", () => null);
    assert.equal(early.rerenders.length, 0);

    const late = dashboardCase({ data: { layout: {} } });
    late.api.registerDashboardPanelRenderer("time-billing", () => null);
    assert.equal(late.rerenders.length, 1);
  });

  /**
   * The lookup coerces its key, which is what a property access already did - so an absent
   * `renderer` asks for the `"undefined"` key, which `registerPanelRenderer` can never write.
   */
  it("indexes by the coerced identifier, which no empty registration can match", () => {
    const { api, dashboardPanelRenderers } = dashboardCase();
    api.registerDashboardPanelRenderer(undefined, () => null);
    assert.equal(dashboardPanelRenderers["undefined"], undefined);
    assert.match(source, /dashboardPanelRenderers\[String\(contribution\.renderer\)\]/);
  });
});

describe("Dashboard contribution lookup", () => {
  const panels = [
    { id: "billing", renderer: "time-billing", placement: "main" },
    { id: "effort", renderer: "time-billing", placement: "today" },
    { id: "tasks", renderer: "task-summary", placement: "attention" },
  ];

  it("finds the first contribution for a renderer when no id narrows it", () => {
    const { api } = dashboardCase({ panels });
    assert.equal(plain(api.findDashboardContribution("time-billing")).id, "billing");
  });

  it("narrows by id when one is given", () => {
    const { api } = dashboardCase({ panels });
    assert.equal(plain(api.findDashboardContribution("time-billing", "effort")).id, "effort");
    assert.equal(api.findDashboardContribution("time-billing", "missing"), undefined);
    assert.equal(api.findDashboardContribution("missing"), undefined);
  });

  /** The renderer is compared rather than coerced, so a lookalike identifier does not match. */
  it("compares the renderer rather than coercing it", () => {
    const { api } = dashboardCase({ panels: [{ id: "n", renderer: 7 }] });
    assert.equal(api.findDashboardContribution("7"), undefined);
    assert.equal(plain(api.findDashboardContribution(7)).id, "n");
  });
});

describe("Dashboard contribution data", () => {
  it("answers an empty record without a route", async () => {
    const { api, apiCalls } = dashboardCase();
    assert.deepEqual(plain(await api.loadContributionData({})), {});
    assert.deepEqual(plain(await api.loadContributionData(null)), {});
    assert.deepEqual(plain(await api.loadContributionData("not-a-record")), {});
    assert.equal(apiCalls.length, 0);
  });

  it("falls back to the route it is handed when the contribution carries none", async () => {
    const { api, apiCalls } = dashboardCase();
    await api.loadContributionData({}, "/api/effort");
    assert.deepEqual(apiCalls.map((call) => call.route), ["/api/effort"]);
  });

  /** The shared cache is keyed by route, so a panel already requested is never requested twice. */
  it("requests each route once and answers the memoized promise", async () => {
    const { api, apiCalls, dashboardDataPromises } = dashboardCase();
    const first = await api.loadContributionData({ dataRoute: "/api/billing" });
    const second = await api.loadContributionData({ dataRoute: "  /api/billing  " });
    assert.equal(apiCalls.length, 1);
    assert.deepEqual(first, second);
    assert.deepEqual([...dashboardDataPromises.keys()], ["/api/billing"]);
  });

  it("prefers the entry module's loader over its own fetch when one is published", async () => {
    /** @type {string[]} */
    const routes = [];
    const { api, apiCalls } = dashboardCase({
      bootstrap: { loadRoute: (/** @type {string} */ route) => { routes.push(route); return Promise.resolve({ route }); } },
    });
    await api.loadContributionData({ dataRoute: "/api/billing" });
    assert.deepEqual(routes, ["/api/billing"]);
    assert.equal(apiCalls.length, 0);
  });

  it("uses its own fetch when the published loader is not callable", async () => {
    const { api, apiCalls } = dashboardCase({ bootstrap: { loadRoute: "/api/billing" } });
    await api.loadContributionData({ dataRoute: "/api/billing" });
    assert.deepEqual(apiCalls.map((call) => call.route), ["/api/billing"]);
    assert.deepEqual(plain(apiCalls[0].init), { cache: "no-store" });
  });
});

describe("Dashboard status line", () => {
  it("shows a message with the informational tone and its polite live region", () => {
    const { api, context } = dashboardCase();
    api.setDashboardStatus("Loading dashboard...");
    assert.equal(context.dashboardStatus.textContent, "Loading dashboard...");
    assert.equal(context.dashboardStatus.hidden, false);
    assert.equal(context.dashboardStatus.dataset.viewTone, "info");
    assert.equal(context.dashboardStatus.getAttribute("role"), "status");
    assert.equal(context.dashboardStatus.getAttribute("aria-live"), "polite");
  });

  it("raises the tone and the urgency for an error", () => {
    const { api, context } = dashboardCase();
    api.setDashboardStatus("Dashboard data could not be loaded.", { isError: true });
    assert.equal(context.dashboardStatus.dataset.viewTone, "danger");
    assert.equal(context.dashboardStatus.getAttribute("role"), "alert");
    assert.equal(context.dashboardStatus.getAttribute("aria-live"), "assertive");
  });

  it("hides itself when the message is cleared", () => {
    const { api, context } = dashboardCase();
    api.setDashboardStatus("Loading dashboard...");
    api.setDashboardStatus("");
    assert.equal(context.dashboardStatus.textContent, "");
    assert.equal(context.dashboardStatus.hidden, true);
  });

  /**
   * `textContent` coerces whatever it is assigned, so naming the coercion changed the spelling
   * rather than the result - and `hidden` still reads the original value, so a falsy message
   * hides the line as it always has.
   */
  it("coerces the message for the text but reads the original value for the visibility", () => {
    const { api, context } = dashboardCase();
    api.setDashboardStatus(0);
    assert.equal(context.dashboardStatus.textContent, "");
    assert.equal(context.dashboardStatus.hidden, true);
    api.setDashboardStatus(12);
    assert.equal(context.dashboardStatus.textContent, "12");
    assert.equal(context.dashboardStatus.hidden, false);
  });

  it("does nothing at all when the status line was never built", () => {
    const { api, context } = dashboardCase();
    context.dashboardStatus = null;
    assert.doesNotThrow(() => api.setDashboardStatus("Loading dashboard..."));
  });
});

describe("Dashboard region empty state", () => {
  it("prefers the descriptor the snapshot carried over this page's own copy", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardRegionEmptyState(
      { title: "Module overview will appear here", message: "Enabled modules can add cards." },
      { className: "dashboard-module-overview-empty", message: "Fallback message.", title: "Fallback title" },
    );
    assert.equal(viewCalls.emptyState[0].title, "Module overview will appear here");
    assert.equal(viewCalls.emptyState[0].message, "Enabled modules can add cards.");
    assert.equal(viewCalls.emptyState[0].className, "dashboard-module-overview-empty");
    assert.equal(viewCalls.emptyState[0].headingLevel, 3);
  });

  /**
   * The descriptor is optional-or-absent rather than defaulted, because its callers read it out
   * of the snapshot where a missing branch answers nothing at all.
   */
  it("reads through an absent descriptor to this page's copy", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardRegionEmptyState(null, { message: "Fallback message.", title: "Fallback title" });
    assert.equal(viewCalls.emptyState[0].title, "Fallback title");
    assert.equal(viewCalls.emptyState[0].message, "Fallback message.");
    assert.equal(viewCalls.emptyState[0].className, "");
  });

  it("falls back once more when this page carries no copy either", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardRegionEmptyState(null, {});
    assert.equal(viewCalls.emptyState[0].title, "Nothing to show yet");
    assert.equal(viewCalls.emptyState[0].message, "More context will appear here when it is available.");
  });

  it("passes the descriptor's actions through and answers none for a value that is not a list", () => {
    const { api, viewCalls } = dashboardCase();
    const actions = [{ label: "Open Workbench", href: "workbench.html" }];
    api.createDashboardRegionEmptyState({ actions }, {});
    assert.equal(viewCalls.emptyState[0].actions, actions);

    api.createDashboardRegionEmptyState({ actions: "Open Workbench" }, {});
    assert.deepEqual(plain(viewCalls.emptyState[1].actions), []);
  });
});

describe("Dashboard panel construction", () => {
  it("carries the contribution's identity onto the panel element", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardPanel(
      { id: "billing", renderer: "time-billing", placement: "today", moduleId: "time-tracking" },
      { className: "time-billing-panel" },
    );
    const [panel] = viewCalls.elements;
    assert.equal(panel.tag, "article");
    assert.deepEqual(plain(panel.className), ["dashboard-panel", "surface-main-panel", "time-billing-panel"]);
    assert.equal(panel.attrs["data-dashboard-panel-id"], "billing");
    assert.equal(panel.attrs["data-dashboard-renderer"], "time-billing");
    assert.equal(panel.attrs["data-dashboard-placement"], "today");
    assert.equal(panel.dataset.moduleId, "time-tracking");
  });

  it("omits each identity attribute the contribution did not carry", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardPanel({}, {});
    const [panel] = viewCalls.elements;
    assert.equal("data-dashboard-panel-id" in panel.attrs, false);
    assert.equal("data-dashboard-renderer" in panel.attrs, false);
    assert.equal("moduleId" in panel.dataset, false);
    assert.equal(panel.attrs["data-dashboard-placement"], "main");
  });

  /**
   * The region heading already says this, so a repeated panel title reads as clutter. The panel
   * stays identifiable for assistive technology instead of losing its name entirely.
   */
  it("replaces a title that repeats the region heading with an accessible name", () => {
    const { api, viewCalls } = dashboardCase({
      data: { layout: { regions: [{ id: "main", label: "Module Overview" }] } },
    });
    const panel = api.createDashboardPanel({ placement: "main" }, { title: "Module Overview" });
    assert.equal(panel.getAttribute("aria-label"), "Module Overview");
    assert.equal(viewCalls.elements.some((call) => call.tag === "h3"), false);
  });

  it("leaves a renderer's own accessible name alone when it repeats the heading", () => {
    const { api } = dashboardCase({
      data: { layout: { regions: [{ id: "main", label: "Module Overview" }] } },
    });
    const panel = api.createDashboardPanel({ placement: "main" }, { title: "Module Overview", ariaLabel: "Billing" });
    assert.equal(panel.getAttribute("aria-label"), null, "the factory was given the renderer's label instead");
  });

  it("draws a heading for a title that does not repeat the region", () => {
    const { api, viewCalls } = dashboardCase({
      data: { layout: { regions: [{ id: "main", label: "Module Overview" }] } },
    });
    api.createDashboardPanel({ placement: "main" }, { title: "  Billing  " });
    const heading = viewCalls.elements.find((call) => call.tag === "h3");
    assert.equal(heading?.text, "Billing");
  });

  it("draws no heading at all for a blank title", () => {
    const { api, viewCalls } = dashboardCase();
    api.createDashboardPanel({}, { title: "   " });
    assert.equal(viewCalls.elements.some((call) => call.tag === "h3"), false);
  });

  /**
   * **The blank filter is pinned as a source fact**, because this fixture cannot show what it is
   * for: its `appendChild` returns early for a blank, while a real `Element.append(null)` inserts
   * the text "null" into the panel. The count below is the same with the filter and without it.
   */
  it("accepts one child or a list of them and skips the blanks", () => {
    const { api, element } = dashboardCase();
    const body = element("div");
    assert.equal(api.createDashboardPanel({}, { children: body }).children.includes(body), true);
    assert.equal(api.createDashboardPanel({}, { children: [body, null, body] }).children.length, 2);
    assert.equal(api.createDashboardPanel({}, {}).children.length, 0);
    assert.match(source, /\.filter\(Boolean\)\);\n    return panel;/);
  });
});

describe("Dashboard shapes this page states rather than invents", () => {
  /**
   * The same reasoning `BrowserWorkbenchContribution` records: the regions, signals, warnings and
   * contributions are a module's own declaration carried through `/api/dashboard`, so naming
   * their members in the shared contract would freeze one module's vocabulary into every
   * module's. This page states only that the value it reads *from* is a record.
   */
  it("reads every snapshot branch as an unguaranteed record", () => {
    assert.match(source, /@typedef \{Record<string, unknown>\} DashboardRecord/);
    assert.match(contracts, /export interface BrowserWorkbenchContribution \{\s*moduleId: string;/);
    assert.equal(/export interface (?:BrowserDashboardSnapshot|BrowserDashboardContribution)\b/.test(contracts), false,
      "and no snapshot or contribution shape was published to the shared declaration to do it");
  });

  /**
   * The renderer context stays a literal for the reason the published contract gives: a
   * host-supplied callback shape is read defensively, and typing it constrains renderers the
   * runtime does not constrain.
   */
  it("leaves the renderer context named rather than typed, as its contract says", () => {
    assert.match(contracts, /named here rather than typed/);
    assert.match(contracts, /export type DashboardPanelRenderer = \(contribution\?: unknown, context\?: unknown\) => unknown;/);
    assert.equal(/@type \{[^}]*\}\s*\*\/\s*\(?\s*function createDashboardRendererContext/.test(source), false);
  });

  /**
   * **The body is kept by identity.** A renderer may read a member this page never asks for, so
   * reading the snapshot into a fresh object would silently drop it from every contribution.
   */
  it("hands renderers the body it was given rather than one it rebuilt", () => {
    assert.match(source, /dashboardData = dashboardRecord\(data\)/);
    assert.match(source, /return \{\s*\n\s*dashboardData,/);
  });

  it("keeps the registry's values optional so the renderer guard stays a real check", () => {
    assert.match(source, /@type \{Record<string, DashboardPanelRenderer \| undefined>\}/);
    assert.match(source, /if \(!renderer\) \{\s*\n\s*continue;/);
  });

  /**
   * `renderRegisteredDashboardPanels` owns the region bodies, the visible-region count and the
   * whole-dashboard empty state, so it cannot be lifted. These three are pinned as source facts
   * instead of left uncovered.
   */
  it("appends only what the DOM would accept, and only when a region can hold it", () => {
    assert.match(source, /target\?\.body\.appendChild\(requireDashboardPanelNode\(panel\)\)/);
    assert.match(source, /dashboardRegionBodies\.get\(normalizeDashboardPlacement\(contribution\.placement\)\) \|\|\s*\n\s*dashboardRegionBodies\.get\("main"\)/);
    assert.match(source, /if \(visibleRegionCount === 0\) \{[\s\S]*?title: "No dashboard panels are available"/);
  });

  /**
   * `dashboardPanels` was the one list this page read with `|| []` while reading regions, signals
   * and warnings through `Array.isArray`. It now reads the same way they do.
   */
  it("carries no suppression and one document query", () => {
    assert.equal(source.split("document.querySelector").length - 1, 1);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("reads the contribution list the way it reads every other list", () => {
    assert.match(source, /dashboardPanels = dashboardRecordList\(extensionPoints\?\.dashboardPanels\)/);
    assert.equal(source.includes("dashboardPanels || []"), false);
    assert.match(source, /dashboardRecordList\(dashboardData\?\.setupWarnings\)/);
    assert.match(source, /dashboardRecordList\(dashboardRecord\(dashboardData\?\.layout\)\?\.regions\)/);
    assert.match(source, /dashboardRecordList\(pulse\.signals\)/);
  });
});
