(function () {
  const dashboard = window.LongtailForge?.dashboard;
  const formatters = window.LongtailForge?.formatters || {};
  const effortSummaryPromises = window.LongtailForge?.dashboardBootstrap?.dataPromises || new Map();
  const DEFAULT_EFFORT_SUMMARY_ROUTE = "/api/time-tracking/dashboard/effort-summary";

  if (!dashboard?.registerPanelRenderer) {
    return;
  }

  dashboard.registerPanelRenderer("time-tracking.active-timers", renderActiveTimersPanel);
  dashboard.registerPanelRenderer("time-tracking.recent-time", renderRecentTimePanel);

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
      throw new Error("The time tracking dashboard requires LongtailForge.api.");
    }
    return apiClient;
  }
  function renderActiveTimersPanel(contribution, context) {
    const body = createPanelBody(context, "Loading active timers...");
    const panel = context.createPanel({
      className: "time-tracking-dashboard-panel",
      title: contribution.label || "Active Timers",
      children: [body],
    });

    hydrateTimeTrackingPanel(body, contribution, context, createActiveTimersContent);
    return panel;
  }

  function renderRecentTimePanel(contribution, context) {
    const body = createPanelBody(context, "Loading recent time...");
    const panel = context.createPanel({
      className: "time-tracking-dashboard-panel",
      title: contribution.label || "Recent Time",
      children: [body],
    });

    hydrateTimeTrackingPanel(body, contribution, context, createRecentTimeContent);
    return panel;
  }

  async function hydrateTimeTrackingPanel(body, contribution, context, renderContent) {
    try {
      const data = await loadEffortSummary(contribution);
      body.replaceChildren(renderContent(data, context));
    } catch (error) {
      renderError(body, context, "Time Tracking summary could not be loaded.");
      console.error(error);
    }
  }

  async function loadEffortSummary(contribution) {
    const route = String(contribution?.dataRoute || DEFAULT_EFFORT_SUMMARY_ROUTE);

    if (!effortSummaryPromises.has(route)) {
      effortSummaryPromises.set(route, contextLoad(route));
    }

    return effortSummaryPromises.get(route);
  }

  function contextLoad(route) {
    const loadRoute = window.LongtailForge?.dashboardBootstrap?.loadRoute;
    return typeof loadRoute === "function"
      ? loadRoute(route)
      : requireApi().getJson(route, { cache: "no-store" });
  }

  function createActiveTimersContent(data, context) {
    const activeTimers = data?.activeTimers || {};
    const rows = Array.isArray(activeTimers.rows) ? activeTimers.rows : [];

    return context.view.createElement("div", {
      className: "time-tracking-dashboard-content",
      children: [
        createMetricStrip(context, [
          { label: "Active/paused", value: activeTimers.count || 0 },
          { label: "Running", value: activeTimers.runningCount || 0 },
          { label: "Paused", value: activeTimers.pausedCount || 0 },
        ]),
        createTimeTrackingRows(context, rows, "No active or paused timers."),
        createActionRow(context, [activeTimers.action]),
      ],
    });
  }

  function createRecentTimeContent(data, context) {
    const recentTime = data?.recentTime || {};
    const rows = Array.isArray(recentTime.rows) ? recentTime.rows : [];
    const windowDays = Number(recentTime.windowDays) || 7;

    return context.view.createElement("div", {
      className: "time-tracking-dashboard-content",
      children: [
        createMetricStrip(context, [
          { label: `Last ${windowDays} days`, value: formatHours(recentTime.totalSeconds || 0) },
          { label: "Today", value: formatHours(recentTime.todaySeconds || 0) },
          { label: "Entries", value: recentTime.entriesCount || 0 },
        ]),
        createTimeTrackingRows(context, rows, "No recent saved time."),
        createActionRow(context, recentTime.actions || []),
      ],
    });
  }

  function createMetricStrip(context, metrics) {
    return context.view.createElement("div", {
      className: "time-tracking-dashboard-metrics",
      children: metrics.map((metric) => context.view.createElement("span", {
        children: [
          context.view.createElement("strong", { text: String(metric.value ?? 0) }),
          context.view.createElement("span", { text: metric.label || "Metric" }),
        ],
      })),
    });
  }

  function createTimeTrackingRows(context, rows, emptyMessage) {
    if (rows.length === 0) {
      return context.view.createElement("p", {
        className: "dashboard-task-empty",
        text: emptyMessage,
      });
    }

    return context.view.createElement("ul", {
      className: "dashboard-task-row-list time-tracking-dashboard-list",
      children: rows.map((row) => createTimeTrackingRow(context, row)),
    });
  }

  function createTimeTrackingRow(context, row = {}) {
    const action = row.action || {};
    const meta = [
      row.sourceLabel,
      row.contextLabel,
      row.elapsedLabel || row.durationLabel,
      row.endedAtLabel,
    ].filter(Boolean);

    return context.view.createElement("li", {
      className: "dashboard-task-row time-tracking-dashboard-row",
      children: [
        context.view.createElement("div", {
          className: "dashboard-task-row-main",
          children: [
            context.view.createElement("div", {
              className: "dashboard-task-row-heading",
              children: [
                context.view.createElement("strong", {
                  className: "dashboard-task-row-title",
                  text: row.title || "Time Tracking item",
                }),
                row.status ? context.view.createElement("span", {
                  className: "dashboard-task-row-badge",
                  text: row.status,
                }) : null,
              ].filter(Boolean),
            }),
            context.view.createElement("div", {
              className: "dashboard-task-row-meta",
              children: meta.map((item) => context.view.createElement("span", { text: item })),
            }),
          ],
        }),
        action.href ? context.view.createElement("a", {
          className: "link-button dashboard-task-row-action",
          attrs: { href: action.href },
          text: action.label || "Open",
        }) : null,
      ].filter(Boolean),
    });
  }

  function createActionRow(context, actions = []) {
    const availableActions = actions.filter((action) => action?.href);

    if (availableActions.length === 0) {
      return null;
    }

    return context.view.createElement("div", {
      className: "dashboard-task-actions",
      children: availableActions.map((action) => context.view.createElement("a", {
        className: "button-link secondary",
        attrs: { href: action.href },
        text: action.label || "Open",
      })),
    });
  }

  function createPanelBody(context, message) {
    return context.view.createElement("div", {
      className: "dashboard-panel-body",
      attrs: { role: "status" },
      text: message,
    });
  }

  function renderError(body, context, message) {
    body.replaceChildren(context.view.createEmptyState({
      title: "Time Tracking data unavailable",
      message,
    }));
  }

  function formatHours(seconds) {
    return typeof formatters.hours === "function"
      ? formatters.hours(seconds)
      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;
  }
}());
