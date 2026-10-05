// Dashboard renders the workspace overview through contribution-backed panels.
(function attachDashboardPage() {
  const dashboardHost = document.querySelector("[data-dashboard-host]");
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this path cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it. The
   * graceful path that legitimately runs without the factory keeps its own optional read.
   * @returns {BrowserViewFactory}
   */
  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Dashboard requires LongtailForge.view.");
    }
    return factory;
  }
  const dashboardBootstrap = window.LongtailForge?.dashboardBootstrap;

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewActionInput} BrowserViewActionInput */
  /** @typedef {import("../../src/types/browser-contracts.js").DashboardPanelRenderer} DashboardPanelRenderer */

  /**
   * A record this page read out of the dashboard body, with no member guaranteed.
   *
   * **Every shape below this page reads is one of these**, and the reason they are not named
   * individually is the reason `BrowserWorkbenchContribution` guarantees only `moduleId`: the
   * regions, signals, warnings and panel contributions are a module's own declaration carried
   * through `/api/dashboard`, and naming their members here would freeze one module's
   * vocabulary into every module's contract. The page already reads each member defensively;
   * this states that the value it reads *from* is a record, which is the only part it checks.
   * @typedef {Record<string, unknown>} DashboardRecord
   */

  /**
   * The record a dashboard member carries, or `null`.
   *
   * Arrays are refused because every caller asks this for a member it will read *by name*,
   * and an array answers `undefined` for each of them anyway - so refusing it here reaches the
   * same fallbacks by a shorter path rather than a different one.
   * @param {unknown} value
   * @returns {DashboardRecord | null}
   */
  function dashboardRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? /** @type {DashboardRecord} */ (value)
      : null;
  }

  /**
   * A dashboard list, with every entry read as a record.
   *
   * **A malformed entry becomes `{}` rather than being dropped**, because that is what the
   * untyped page did: it read `entry.label` off whatever the list held, got `undefined`, and
   * rendered the entry with its defaults. Filtering the list instead would remove a row the
   * page has always drawn.
   * @param {unknown} value
   * @returns {DashboardRecord[]}
   */
  function dashboardRecordList(value) {
    /** @type {readonly unknown[]} */
    const entries = Array.isArray(value) ? value : [];
    return entries.map((entry) => dashboardRecord(entry) || {});
  }

  /**
   * The action descriptors a dashboard empty state carries, or none.
   *
   * The array is passed through **unchanged** rather than rebuilt: `createEmptyState` already
   * accepts a node or an options bag per entry and coerces each one, so re-reading the entries
   * here would only narrow what the factory is willing to draw.
   * @param {unknown} value
   * @returns {BrowserViewActionInput}
   */
  function dashboardActionInput(value) {
    return Array.isArray(value) ? value : [];
  }

  /**
   * The regions the layout declares, read from the snapshot each time rather than cached.
   *
   * Both callers already re-read it: the container is rebuilt from the current snapshot, and
   * `dashboardRegionLabel` is asked during a render that a later snapshot can replace.
   * @returns {DashboardRecord[]}
   */
  function dashboardLayoutRegions() {
    return dashboardRecordList(dashboardRecord(dashboardData?.layout)?.regions);
  }

  /**
   * A rendered panel, as a node.
   *
   * A renderer's return is `unknown` by contract, and the untyped page handed whatever it
   * produced straight to `appendChild`, which throws on a non-node. This throws for the same
   * values at the same point, naming the renderer contract rather than the DOM method: nothing
   * that reached the DOM before is dropped, and nothing that threw before now passes silently.
   * @param {unknown} value
   * @returns {Node}
   */
  function requireDashboardPanelNode(value) {
    if (!(value instanceof Node)) {
      throw new TypeError("A dashboard panel renderer must return nodes.");
    }
    return value;
  }

  /** @type {DashboardRecord | null} */
  let dashboardData = null;
  /** @type {DashboardRecord[]} */
  let dashboardPanels = [];
  /** @type {HTMLElement | null} */
  let dashboardStatus = null;
  /** @type {HTMLElement | null} */
  let dashboardPulseRegion = null;
  /** @type {HTMLElement | null} */
  let dashboardWarningsRegion = null;
  /** @type {HTMLElement | null} */
  let dashboardRegionContainer = null;

  // Values are optional, so the `!renderer` guard in `renderRegisteredDashboardPanels` is a
  // real check rather than a formality the compiler has already decided can never fire.
  /** @type {Record<string, DashboardPanelRenderer | undefined>} */
  const dashboardPanelRenderers = {};
  /** @type {Map<string, { body: HTMLElement, section: HTMLElement }>} */
  const dashboardRegionBodies = new Map();
  const dashboardDataPromises = dashboardBootstrap?.dataPromises || new Map();
  const KNOWN_DASHBOARD_PLACEMENTS = new Set([
    "pulse",
    "attention",
    "calendar",
    "today",
    "main",
    "activity",
    "secondary",
  ]);

  publishDashboardApi();
  buildDashboardHost();
  loadDashboardData();

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Dashboard requires LongtailForge.api.");
    }
    return apiClient;
  }
  function buildDashboardHost() {
    const dashboardView = window.LongtailForge?.view;
    if (!dashboardHost || !dashboardView) {
      return;
    }

    const header = dashboardView.createPageHeader({
      title: "Dashboard",
    });

    dashboardStatus = dashboardView.createStatusMessage({
      className: "dashboard-status",
      hidden: true,
    });
    dashboardPulseRegion = dashboardView.createElement("section", {
      className: "dashboard-pulse-region",
      attrs: { "aria-label": "Workspace Pulse" },
      dataset: { dashboardPulse: "" },
    });
    dashboardWarningsRegion = dashboardView.createElement("section", {
      className: "dashboard-warning-region",
      attrs: { "aria-label": "Setup warnings" },
      dataset: { dashboardWarnings: "" },
      hidden: true,
    });
    dashboardRegionContainer = dashboardView.createElement("section", {
      className: "dashboard-regions",
      attrs: { "aria-label": "Dashboard regions" },
      dataset: { dashboardRegions: "" },
    });

    dashboardHost.replaceChildren(
      header,
      dashboardStatus,
      dashboardPulseRegion,
      dashboardWarningsRegion,
      dashboardRegionContainer,
    );
  }

  async function loadDashboardData() {
    setDashboardStatus("Loading dashboard...");

    try {
      const manifest = await loadDashboardManifest();
      await renderDashboardSnapshot(manifest.data);

      if (manifest.fromCache) {
        const freshData = await manifest.revalidated.catch(() => manifest.data);

        if (JSON.stringify(freshData) !== JSON.stringify(manifest.data)) {
          await renderDashboardSnapshot(freshData);
        }
      }
    } catch (error) {
      setDashboardStatus("Dashboard data could not be loaded.", { isError: true });
      console.error(error);
    }
  }

  async function loadDashboardManifest() {
    if (dashboardBootstrap?.manifestPromise) {
      return dashboardBootstrap.manifestPromise;
    }

    const data = await requireApi().getJson("/api/dashboard", { cache: "no-store" });
    return {
      data,
      fromCache: false,
      revalidated: Promise.resolve(data),
    };
  }

  /**
   * **The body is kept by identity, not rebuilt.** `createDashboardRendererContext` hands
   * `dashboardData` to module-contributed renderers, and the published contract names it
   * without typing it - so a renderer may read a member this page never asks for. Reading the
   * snapshot into a fresh object would silently drop those members from every contribution.
   * @param {unknown} data
   */
  async function renderDashboardSnapshot(data) {
    dashboardData = dashboardRecord(data);
    const extensionPoints = dashboardRecord(dashboardData?.extensionPoints);
    dashboardPanels = dashboardRecordList(extensionPoints?.dashboardPanels);
    warmDashboardPanelData();
    const browserAssetsReady = loadDashboardBrowserAssets(extensionPoints?.browserAssets);

    renderDashboardRegions();
    renderWorkspacePulse();
    renderSetupWarnings();
    setDashboardStatus("");

    await browserAssetsReady;
    renderRegisteredDashboardPanels();
  }

  function warmDashboardPanelData() {
    for (const panel of dashboardPanels) {
      const routeForPanel = dashboardBootstrap?.routeForPanel;
      const route = typeof routeForPanel === "function" ? routeForPanel(panel) : panel?.dataRoute;
      loadContributionData({ ...panel, dataRoute: route }).catch(() => {});
    }
  }

  /** @param {unknown} assets */
  async function loadDashboardBrowserAssets(assets) {
    const loader = window.LongtailForge?.esModuleBridge?.loadContributedAssets;

    if (typeof loader !== "function") {
      throw new Error("Dashboard browser assets require the ES-module compatibility bridge.");
    }

    await loader(assets);
  }

  function publishDashboardApi() {
    // The namespace *root* is mutated in place, because replacing it would orphan earlier
    // scripts that captured it at load. `dashboard` itself is a plain replacement:
    // `0.33.33.38.2.4.4` removed a spread of the previous value that could not do what the
    // comment here claimed. A spread assigns a new object, so it never preserved identity
    // for a captured reference; and the panel registry it appeared to protect is
    // `dashboardPanelRenderers`, a file-local closure, so a re-evaluation would start empty
    // whether the members were carried over or not. This file publishes once, from one call.
    const namespace = window.LongtailForge = window.LongtailForge || {};
    // Annotated rather than merely assigned, so the compiler checks this object against the
    // contract at its construction point. `0.33.33.38.2.2.6.3` found that a declaration alone
    // proves nothing about its writer: deleting a member from a declared surface stayed green,
    // because a TypeScript object type is not exact and an extra runtime property is ignored.
    // An annotated object literal is checked both ways - a missing member fails, and an excess
    // one fails the object-literal check - which is the cheapest linkage the estate already has.
    /** @type {import("../../src/types/browser-contracts.js").BrowserDashboard} */
    const dashboardApi = {
      registerPanelRenderer: registerDashboardPanelRenderer,
    };

    namespace.dashboard = dashboardApi;
  }

  /**
   * The implementation of `LongtailForge.dashboard.registerPanelRenderer`. Its parameters carry
   * the declared contract so the annotation on `dashboardApi` has something to check: with
   * implicit `any` here, a wrong renderer type in the declaration was assignable and the
   * linkage passed a break it should have caught.
   * @param {unknown} rendererId
   * @param {import("../../src/types/browser-contracts.js").DashboardPanelRenderer} renderer
   */
  function registerDashboardPanelRenderer(rendererId, renderer) {
    const normalizedRendererId = String(rendererId || "").trim();

    if (!normalizedRendererId || typeof renderer !== "function") {
      return;
    }

    dashboardPanelRenderers[normalizedRendererId] = renderer;

    if (dashboardData) {
      renderRegisteredDashboardPanels();
    }
  }

  function renderDashboardRegions() {
    const dashboardView = requireView();
    if (!dashboardRegionContainer) {
      return;
    }

    dashboardRegionBodies.clear();
    dashboardRegionContainer.replaceChildren();

    const regions = dashboardLayoutRegions();

    for (const region of regions) {
      const regionId = normalizeDashboardPlacement(region.id);
      const section = dashboardView.createElement("section", {
        className: ["dashboard-region", `dashboard-region--${regionId}`],
        attrs: { "aria-label": region.label || regionId },
        dataset: { dashboardRegion: regionId },
        hidden: true,
      });
      const heading = dashboardView.createElement("h2", {
        className: "dashboard-region-heading",
        text: region.label || regionId,
      });
      const body = dashboardView.createElement("div", {
        className: ["dashboard-region-body", `dashboard-region-body--${regionId}`],
        dataset: { dashboardRegionBody: regionId },
      });

      section.append(heading, body);
      dashboardRegionBodies.set(regionId, { body, section });
      dashboardRegionContainer.appendChild(section);
    }
  }

  function renderWorkspacePulse() {
    const dashboardView = requireView();
    if (!dashboardPulseRegion) {
      return;
    }

    const pulse = dashboardRecord(dashboardData?.pulse) || {};
    const signals = dashboardRecordList(pulse.signals);
    const primaryAction = dashboardRecord(pulse.primaryAction) || { label: "Open Workbench", href: "workbench.html" };
    const signalList = dashboardView.createElement("dl", {
      className: "dashboard-pulse-signals",
      children: signals.map((signal) => dashboardView.createElement("div", {
        className: "dashboard-pulse-signal",
        dataset: { dashboardPulseSignal: signal.id || "" },
        children: [
          dashboardView.createElement("dt", { text: signal.label || "Signal" }),
          dashboardView.createElement("dd", { text: String(signal.value ?? 0) }),
        ],
      })),
    });
    const action = dashboardView.createElement("a", {
      className: "button-link dashboard-pulse-primary",
      attrs: {
        href: primaryAction.href || "workbench.html",
        "data-dashboard-pulse-primary": "",
      },
      text: primaryAction.label || "Open Workbench",
    });

    dashboardPulseRegion.replaceChildren(dashboardView.createElement("article", {
      className: "dashboard-pulse surface-main-panel",
      children: [
        dashboardView.createElement("div", {
          className: "dashboard-pulse-copy",
          children: [
            dashboardView.createElement("p", {
              className: "dashboard-pulse-kicker",
              text: "Workspace Pulse",
            }),
            dashboardView.createElement("h2", {
              text: pulse.title || dashboardRecord(dashboardData?.workspace)?.name || "Workspace",
            }),
            dashboardView.createElement("p", {
              className: "dashboard-pulse-summary",
              text: pulse.summary || "Workspace overview is ready.",
            }),
          ],
        }),
        dashboardView.createElement("div", {
          className: "dashboard-pulse-meta",
          children: [signalList, action],
        }),
      ],
    }));
  }

  function renderSetupWarnings() {
    const dashboardView = requireView();
    if (!dashboardWarningsRegion) {
      return;
    }

    const warnings = dashboardRecordList(dashboardData?.setupWarnings);
    dashboardWarningsRegion.replaceChildren();
    dashboardWarningsRegion.hidden = warnings.length === 0;

    if (warnings.length === 0) {
      return;
    }

    dashboardWarningsRegion.appendChild(dashboardView.createElement("article", {
      className: "dashboard-warning-panel surface-main-panel",
      children: [
        dashboardView.createElement("h2", { text: "Setup needs attention" }),
        dashboardView.createElement("ul", {
          className: "dashboard-warning-list",
          children: warnings.map((warning) => dashboardView.createElement("li", {
            children: [
              dashboardView.createElement("strong", { text: warning.title || "Setup warning" }),
              dashboardView.createElement("span", { text: warning.message || "Review setup." }),
            ],
          })),
        }),
      ],
    }));
  }

  function renderRegisteredDashboardPanels() {
    const dashboardView = requireView();
    if (dashboardRegionBodies.size === 0) {
      return;
    }

    for (const { body, section } of dashboardRegionBodies.values()) {
      body.replaceChildren();
      section.hidden = true;
    }

    for (const contribution of dashboardPanels) {
      // Indexed by the coerced identifier rather than the raw member, which is the same lookup
      // a property access already performed - including the `"undefined"` key an absent
      // `renderer` reaches for, which `registerPanelRenderer` can never have written because it
      // refuses an empty identifier. A symbol is the one value `String` would reject instead of
      // coercing, and a JSON body cannot carry one.
      const renderer = dashboardPanelRenderers[String(contribution.renderer)];

      if (!renderer) {
        continue;
      }

      const renderedPanels = normalizeRenderedPanels(renderer(contribution, createDashboardRendererContext(contribution)));
      const target = dashboardRegionBodies.get(normalizeDashboardPlacement(contribution.placement)) ||
        dashboardRegionBodies.get("main");

      renderedPanels.forEach((panel) => target?.body.appendChild(requireDashboardPanelNode(panel)));
    }

    renderModuleOverviewEmptyState();
    renderRecentActivityState();

    let visibleRegionCount = 0;

    for (const { body, section } of dashboardRegionBodies.values()) {
      section.hidden = body.childElementCount === 0;
      if (!section.hidden) {
        visibleRegionCount += 1;
      }
    }

    if (visibleRegionCount === 0) {
      const target = dashboardRegionBodies.get("main") || [...dashboardRegionBodies.values()][0];
      target.section.hidden = false;
      target.body.appendChild(dashboardView.createEmptyState({
        title: "No dashboard panels are available",
        message: "Enabled modules can contribute overview panels when you have access to them.",
      }));
    }
  }

  function renderModuleOverviewEmptyState() {
    const target = dashboardRegionBodies.get("main");

    if (!target || target.body.childElementCount > 0) {
      return;
    }

    target.body.appendChild(createDashboardRegionEmptyState(
      dashboardRecord(dashboardRecord(dashboardData?.moduleOverview)?.emptyState),
      {
        className: "dashboard-module-overview-empty",
        message: "Enabled modules can contribute compact overview cards here.",
        title: "No module overview cards yet",
      },
    ));
  }

  function renderRecentActivityState() {
    const target = dashboardRegionBodies.get("activity");

    if (!target || target.body.childElementCount > 0) {
      return;
    }

    const activityState = dashboardRecord(dashboardData?.recentActivity) || {};

    if (activityState.status === "hidden") {
      return;
    }

    target.body.appendChild(createDashboardRegionEmptyState(
      dashboardRecord(activityState.emptyState),
      {
        className: "dashboard-recent-activity-empty",
        message: "A safe activity digest is deferred.",
        title: "Recent Activity is intentionally quiet",
      },
    ));
  }

  /**
   * **`emptyState` is optional-or-absent rather than defaulted.** Its callers read it out of the
   * snapshot, where a missing branch answers nothing at all; reading through it here says that
   * once instead of asking each caller to substitute an empty record first.
   * @param {DashboardRecord | null} emptyState the descriptor the snapshot carried, if any
   * @param {{ className?: string, message?: string, title?: string }} fallback this page's own copy
   */
  function createDashboardRegionEmptyState(emptyState, fallback) {
    const dashboardView = requireView();
    return dashboardView.createEmptyState({
      className: fallback.className || "",
      headingLevel: 3,
      title: emptyState?.title || fallback.title || "Nothing to show yet",
      message: emptyState?.message || fallback.message || "More context will appear here when it is available.",
      actions: dashboardActionInput(emptyState?.actions),
    });
  }

  /** @param {unknown} rendered */
  function normalizeRenderedPanels(rendered) {
    if (!rendered) {
      return [];
    }

    return Array.isArray(rendered) ? rendered.filter(Boolean) : [rendered];
  }

  /**
   * The context a panel renderer is handed.
   *
   * **Left as a literal rather than annotated**, because `DashboardPanelRenderer` names these
   * seven members without typing them - a host-supplied callback shape is read defensively, and
   * typing it would constrain renderers the runtime does not constrain.
   * @param {DashboardRecord} contribution
   */
  function createDashboardRendererContext(contribution) {
    return {
      dashboardData,
      findContribution: findDashboardContribution,
      loadContributionData,
      setStatus: setDashboardStatus,
      view: window.LongtailForge?.view,
      createPanel: (/** @type {DashboardPanelOptions} */ options = {}) => createDashboardPanel(contribution, options),
      createDashboardPanel,
    };
  }

  /**
   * What a renderer may ask this page to draw around its panel body.
   *
   * Every member is optional and read for its value rather than its type, because a renderer
   * builds this bag itself - `createPanel` is reached through the context, so the caller is a
   * module rather than this file.
   * @typedef {object} DashboardPanelOptions
   * @property {unknown} [ariaLabel]
   * @property {unknown} [children]
   * @property {unknown} [className]
   * @property {unknown} [title]
   */

  /**
   * @param {DashboardRecord} [contribution]
   * @param {DashboardPanelOptions} [options]
   */
  function createDashboardPanel(contribution = {}, options = {}) {
    const dashboardView = requireView();
    const panel = dashboardView.createElement("article", {
      className: ["dashboard-panel", "surface-main-panel", options.className],
      attrs: {
        ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
        ...(contribution?.id ? { "data-dashboard-panel-id": contribution.id } : {}),
        ...(contribution?.renderer ? { "data-dashboard-renderer": contribution.renderer } : {}),
        "data-dashboard-placement": normalizeDashboardPlacement(contribution?.placement),
      },
      dataset: {
        ...(contribution?.moduleId ? { moduleId: contribution.moduleId } : {}),
      },
    });

    const title = String(options.title || "").trim();

    if (title && title === dashboardRegionLabel(normalizeDashboardPlacement(contribution?.placement))) {
      // The region heading already says this; a repeated panel title reads as
      // clutter. Keep the panel identifiable for assistive tech instead.
      if (!options.ariaLabel) {
        panel.setAttribute("aria-label", title);
      }
    } else if (title) {
      panel.appendChild(dashboardView.createElement("h3", { text: title }));
    }

    panel.append(...(Array.isArray(options.children) ? options.children : [options.children]).filter(Boolean));
    return panel;
  }

  /** @param {string} regionId */
  function dashboardRegionLabel(regionId) {
    const regions = dashboardLayoutRegions();
    return String(regions.find((region) => normalizeDashboardPlacement(region.id) === regionId)?.label || "").trim();
  }

  /**
   * **Both parameters stay `unknown`**: this is reached through the renderer context, so the
   * caller is a module rather than this file, and each is compared rather than coerced.
   * @param {unknown} renderer
   * @param {unknown} [id]
   */
  function findDashboardContribution(renderer, id = "") {
    return dashboardPanels.find((panel) => (
      panel.renderer === renderer &&
      (!id || panel.id === id)
    ));
  }

  /**
   * @param {unknown} contribution
   * @param {unknown} [fallbackRoute]
   */
  async function loadContributionData(contribution, fallbackRoute = "") {
    const route = String(dashboardRecord(contribution)?.dataRoute || fallbackRoute || "").trim();

    if (!route) {
      return {};
    }

    if (!dashboardDataPromises.has(route)) {
      const loadRoute = dashboardBootstrap?.loadRoute;
      dashboardDataPromises.set(
        route,
        typeof loadRoute === "function"
          ? loadRoute(route)
          : requireApi().getJson(route, { cache: "no-store" }),
      );
    }

    return dashboardDataPromises.get(route);
  }

  /** @param {unknown} placement */
  function normalizeDashboardPlacement(placement) {
    const value = String(placement || "").trim();
    return KNOWN_DASHBOARD_PLACEMENTS.has(value) ? value : "main";
  }

  /**
   * @param {unknown} message
   * @param {{ isError?: unknown }} [options]
   */
  function setDashboardStatus(message, options = {}) {
    if (!dashboardStatus) {
      return;
    }

    // `textContent` coerces whatever it is assigned, so naming the coercion here changes the
    // spelling rather than the result. `hidden` still reads the original value's truthiness,
    // because a message of `0` has always hidden the status line and still does.
    dashboardStatus.textContent = String(message || "");
    dashboardStatus.hidden = !message;
    dashboardStatus.dataset.viewTone = options.isError ? "danger" : "info";
    dashboardStatus.setAttribute("role", options.isError ? "alert" : "status");
    dashboardStatus.setAttribute("aria-live", options.isError ? "assertive" : "polite");
  }
})();
