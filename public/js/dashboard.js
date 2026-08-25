// Dashboard renders the workspace overview through contribution-backed panels.
(function attachDashboardPage() {
  const dashboardHost = document.querySelector("[data-dashboard-host]");
  const dashboardView = window.LongtailForge?.view;
  const dashboardBootstrap = window.LongtailForge?.dashboardBootstrap;

  let dashboardData = null;
  let dashboardPanels = [];
  let dashboardStatus = null;
  let dashboardPulseRegion = null;
  let dashboardWarningsRegion = null;
  let dashboardRegionContainer = null;

  const dashboardPanelRenderers = {};
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

  function buildDashboardHost() {
    if (!dashboardHost || !dashboardView) {
      return;
    }

    const header = dashboardView.createPageHeader({
      title: "Dashboard",
    });

    dashboardStatus = dashboardView.createStatusMessage({
      className: "dashboard-status",
      dataset: { dashboardStatus: "" },
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

    const data = await window.LongtailForge.api.getJson("/api/dashboard", { cache: "no-store" });
    return {
      data,
      fromCache: false,
      revalidated: Promise.resolve(data),
    };
  }

  async function renderDashboardSnapshot(data) {
    dashboardData = data;
    dashboardPanels = dashboardData?.extensionPoints?.dashboardPanels || [];
    warmDashboardPanelData();
    const browserAssetsReady = loadDashboardBrowserAssets(dashboardData?.extensionPoints?.browserAssets);

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

  async function loadDashboardBrowserAssets(assets) {
    const loader = window.LongtailForge?.esModuleBridge?.loadContributedAssets;

    if (typeof loader !== "function") {
      throw new Error("Dashboard browser assets require the ES-module compatibility bridge.");
    }

    await loader(assets);
  }

  function publishDashboardApi() {
    // Mutate the shared namespace in place: replacing the object would orphan
    // earlier scripts (like the Task dialog) that captured a reference at load,
    // while navigation later assigns workspaceContext through window.LongtailForge.
    const namespace = window.LongtailForge = window.LongtailForge || {};
    namespace.dashboard = {
      ...(namespace.dashboard || {}),
      registerPanelRenderer: registerDashboardPanelRenderer,
    };
  }

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
    if (!dashboardRegionContainer) {
      return;
    }

    dashboardRegionBodies.clear();
    dashboardRegionContainer.replaceChildren();

    const regions = Array.isArray(dashboardData?.layout?.regions)
      ? dashboardData.layout.regions
      : [];

    for (const region of regions) {
      const regionId = normalizeDashboardPlacement(region?.id);
      const section = dashboardView.createElement("section", {
        className: ["dashboard-region", `dashboard-region--${regionId}`],
        attrs: { "aria-label": region?.label || regionId },
        dataset: { dashboardRegion: regionId },
        hidden: true,
      });
      const heading = dashboardView.createElement("h2", {
        className: "dashboard-region-heading",
        text: region?.label || regionId,
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
    if (!dashboardPulseRegion) {
      return;
    }

    const pulse = dashboardData?.pulse || {};
    const signals = Array.isArray(pulse.signals) ? pulse.signals : [];
    const primaryAction = pulse.primaryAction || { label: "Open Workbench", href: "workbench.html" };
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
              text: pulse.title || dashboardData?.workspace?.name || "Workspace",
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
    if (!dashboardWarningsRegion) {
      return;
    }

    const warnings = Array.isArray(dashboardData?.setupWarnings) ? dashboardData.setupWarnings : [];
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
    if (dashboardRegionBodies.size === 0) {
      return;
    }

    for (const { body, section } of dashboardRegionBodies.values()) {
      body.replaceChildren();
      section.hidden = true;
    }

    for (const contribution of dashboardPanels) {
      const renderer = dashboardPanelRenderers[contribution.renderer];

      if (!renderer) {
        continue;
      }

      const renderedPanels = normalizeRenderedPanels(renderer(contribution, createDashboardRendererContext(contribution)));
      const target = dashboardRegionBodies.get(normalizeDashboardPlacement(contribution.placement)) ||
        dashboardRegionBodies.get("main");

      renderedPanels.forEach((panel) => target?.body.appendChild(panel));
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
      dashboardData?.moduleOverview?.emptyState,
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

    const activityState = dashboardData?.recentActivity || {};

    if (activityState.status === "hidden") {
      return;
    }

    target.body.appendChild(createDashboardRegionEmptyState(
      activityState.emptyState,
      {
        className: "dashboard-recent-activity-empty",
        message: "A safe activity digest is deferred.",
        title: "Recent Activity is intentionally quiet",
      },
    ));
  }

  function createDashboardRegionEmptyState(emptyState = {}, fallback = {}) {
    return dashboardView.createEmptyState({
      className: fallback.className || "",
      headingLevel: 3,
      title: emptyState.title || fallback.title || "Nothing to show yet",
      message: emptyState.message || fallback.message || "More context will appear here when it is available.",
      actions: Array.isArray(emptyState.actions) ? emptyState.actions : [],
    });
  }

  function normalizeRenderedPanels(rendered) {
    if (!rendered) {
      return [];
    }

    return Array.isArray(rendered) ? rendered.filter(Boolean) : [rendered];
  }

  function createDashboardRendererContext(contribution) {
    return {
      dashboardData,
      findContribution: findDashboardContribution,
      loadContributionData,
      setStatus: setDashboardStatus,
      view: dashboardView,
      createPanel: (options = {}) => createDashboardPanel(contribution, options),
      createDashboardPanel,
    };
  }

  function createDashboardPanel(contribution = {}, options = {}) {
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

  function dashboardRegionLabel(regionId) {
    const regions = Array.isArray(dashboardData?.layout?.regions) ? dashboardData.layout.regions : [];
    return String(regions.find((region) => normalizeDashboardPlacement(region?.id) === regionId)?.label || "").trim();
  }

  function findDashboardContribution(renderer, id = "") {
    return dashboardPanels.find((panel) => (
      panel.renderer === renderer &&
      (!id || panel.id === id)
    ));
  }

  async function loadContributionData(contribution, fallbackRoute = "") {
    const route = String(contribution?.dataRoute || fallbackRoute || "").trim();

    if (!route) {
      return {};
    }

    if (!dashboardDataPromises.has(route)) {
      const loadRoute = dashboardBootstrap?.loadRoute;
      dashboardDataPromises.set(
        route,
        typeof loadRoute === "function"
          ? loadRoute(route)
          : window.LongtailForge.api.getJson(route, { cache: "no-store" }),
      );
    }

    return dashboardDataPromises.get(route);
  }

  function normalizeDashboardPlacement(placement) {
    const value = String(placement || "").trim();
    return KNOWN_DASHBOARD_PLACEMENTS.has(value) ? value : "main";
  }

  function setDashboardStatus(message, options = {}) {
    if (!dashboardStatus) {
      return;
    }

    dashboardStatus.textContent = message || "";
    dashboardStatus.hidden = !message;
    dashboardStatus.dataset.viewTone = options.isError ? "danger" : "info";
    dashboardStatus.setAttribute("role", options.isError ? "alert" : "status");
    dashboardStatus.setAttribute("aria-live", options.isError ? "assertive" : "polite");
  }
})();
