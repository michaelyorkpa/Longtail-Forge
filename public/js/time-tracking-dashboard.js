(function () {
  const dashboard = window.LongtailForge?.dashboard;
  // The `|| {}` stand-in is gone, not the fallback. An empty object literal has no members,
  // so every read through it was a property access on `{}`; the capture is simply the optional
  // surface now, and the conditional below narrows it exactly as it always did at runtime.
  const formatters = window.LongtailForge?.formatters;
  const effortSummaryPromises = window.LongtailForge?.dashboardBootstrap?.dataPromises || new Map();
  const DEFAULT_EFFORT_SUMMARY_ROUTE = "/api/time-tracking/dashboard/effort-summary";

  if (!dashboard?.registerPanelRenderer) {
    return;
  }

  dashboard.registerPanelRenderer("time-tracking.active-timers", renderActiveTimersPanel);
  dashboard.registerPanelRenderer("time-tracking.recent-time", renderRecentTimePanel);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * A record this renderer read out of a dashboard value, with no member guaranteed.
   *
   * **The contribution, the effort summary and its rows are all untrusted**: the contribution is
   * a module's own declaration carried through the dashboard manifest, and the summary is a wire
   * body the host hands straight through. `DashboardPanelRenderer` types both parameters as
   * `unknown` for exactly that reason, so this renderer states what it verifies - that it is
   * reading from a record - rather than naming a vocabulary it does not own.
   * @typedef {Record<string, unknown>} TimeTrackingRecord
   */

  /**
   * What this renderer uses from the context the Dashboard host builds for it.
   *
   * **The declared shape is exactly the checked shape.** An earlier spelling named `view` as the
   * published `BrowserViewFactory` while `requirePanelContext` only checked that it was truthy,
   * so `view: true` and `view: {}` both satisfied the check and were then handed back as a full
   * factory - a promise nothing had established. This names only the two functions this file ever
   * calls on it, which is what the guard can honestly verify. Narrowing the declaration rather
   * than widening the check is deliberate: this renderer is a *consumer*, so it should state the
   * least it needs, and the host stays free to publish whatever else it likes.
   * @typedef {object} TimeTrackingPanelView
   * @property {(tag: string, options?: Record<string, unknown>) => HTMLElement} createElement
   * @property {(options?: Record<string, unknown>) => HTMLElement} createEmptyState
   *
   * @typedef {object} TimeTrackingPanelContext
   * @property {TimeTrackingPanelView} view
   * @property {(options?: { ariaLabel?: unknown, children?: unknown, className?: unknown, title?: unknown }) => HTMLElement} createPanel
   */

  /**
   * One metric the strip displays, as **this file's own callers build it**.
   *
   * Named precisely rather than left open, because the two content builders are the only
   * producers and each writes both members at the call site.
   * @typedef {{ label: string, value: unknown }} TimeTrackingMetric
   */

  /**
   * The record a dashboard member carries, or `null`.
   *
   * Arrays are refused because every caller asks this for a member it will read *by name*, and an
   * array answers `undefined` for each of them anyway.
   * @param {unknown} value
   * @returns {TimeTrackingRecord | null}
   */
  function timeTrackingRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? /** @type {TimeTrackingRecord} */ (value)
      : null;
  }

  /**
   * A dashboard list, with every entry read as a record.
   *
   * A malformed entry becomes an empty record rather than being dropped, because that is what the
   * untyped page did: it read `row.title` off whatever the list held, got `undefined`, and drew
   * the row with its fallback. Filtering here would remove a row the panel has always shown.
   * @param {unknown} value
   * @returns {TimeTrackingRecord[]}
   */
  function timeTrackingRecordList(value) {
    /** @type {readonly unknown[]} */
    const entries = Array.isArray(value) ? value : [];
    return entries.map((entry) => timeTrackingRecord(entry) || {});
  }

  /**
   * The panel context, narrowed at the one boundary where this file is the callee.
   *
   * **`DashboardPanelRenderer` types the context as `unknown` on purpose** - a host-supplied
   * callback shape is read defensively, and typing it would constrain hosts the runtime does not
   * constrain. That decision belongs to the contract, so the narrowing belongs here instead.
   *
   * **Every member the returned type declares is verified here**, including both view functions
   * this file calls. A truthiness check on `view` is not enough to hand back something that says
   * it can build elements: `view: true` and `view: {}` are both truthy and neither can. A context
   * missing any of the three throws where the first unguarded dereference threw before.
   * @param {unknown} value
   * @returns {TimeTrackingPanelContext}
   */
  function requirePanelContext(value) {
    const context = timeTrackingRecord(value);
    const view = context && timeTrackingRecord(context.view);
    if (!context || typeof context.createPanel !== "function"
      || !view || typeof view.createElement !== "function" || typeof view.createEmptyState !== "function") {
      throw new TypeError("Time Tracking dashboard panels require the host's panel builder and a view factory that can create elements and empty states.");
    }
    return /** @type {TimeTrackingPanelContext} */ (context);
  }

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
  /**
   * @param {unknown} contributionValue
   * @param {unknown} contextValue
   */
  function renderActiveTimersPanel(contributionValue, contextValue) {
    const contribution = timeTrackingRecord(contributionValue) || {};
    const context = requirePanelContext(contextValue);
    const body = createPanelBody(context, "Loading active timers...");
    const panel = context.createPanel({
      className: "time-tracking-dashboard-panel",
      title: contribution.label || "Active Timers",
      children: [body],
    });

    hydrateTimeTrackingPanel(body, contribution, context, createActiveTimersContent);
    return panel;
  }

  /**
   * @param {unknown} contributionValue
   * @param {unknown} contextValue
   */
  function renderRecentTimePanel(contributionValue, contextValue) {
    const contribution = timeTrackingRecord(contributionValue) || {};
    const context = requirePanelContext(contextValue);
    const body = createPanelBody(context, "Loading recent time...");
    const panel = context.createPanel({
      className: "time-tracking-dashboard-panel",
      title: contribution.label || "Recent Time",
      children: [body],
    });

    hydrateTimeTrackingPanel(body, contribution, context, createRecentTimeContent);
    return panel;
  }

  /**
   * @param {HTMLElement} body
   * @param {TimeTrackingRecord} contribution
   * @param {TimeTrackingPanelContext} context
   * @param {(data: TimeTrackingRecord, context: TimeTrackingPanelContext) => Node} renderContent
   */
  async function hydrateTimeTrackingPanel(body, contribution, context, renderContent) {
    try {
      const data = timeTrackingRecord(await loadEffortSummary(contribution)) || {};
      body.replaceChildren(renderContent(data, context));
    } catch (error) {
      renderError(body, context, "Time Tracking summary could not be loaded.");
      console.error(error);
    }
  }

  /** @param {TimeTrackingRecord} contribution @returns {Promise<unknown>} */
  async function loadEffortSummary(contribution) {
    const route = String(contribution?.dataRoute || DEFAULT_EFFORT_SUMMARY_ROUTE);

    if (!effortSummaryPromises.has(route)) {
      effortSummaryPromises.set(route, contextLoad(route));
    }

    return effortSummaryPromises.get(route);
  }

  /** @param {string} route @returns {Promise<unknown>} */
  function contextLoad(route) {
    const loadRoute = window.LongtailForge?.dashboardBootstrap?.loadRoute;
    return typeof loadRoute === "function"
      ? loadRoute(route)
      : requireApi().getJson(route, { cache: "no-store" });
  }

  /** @param {TimeTrackingRecord} data @param {TimeTrackingPanelContext} context */
  function createActiveTimersContent(data, context) {
    const activeTimers = timeTrackingRecord(data?.activeTimers) || {};
    const rows = timeTrackingRecordList(activeTimers.rows);

    return context.view.createElement("div", {
      className: "time-tracking-dashboard-content",
      children: [
        createMetricStrip(context, [
          { label: "Active/paused", value: activeTimers.count || 0 },
          { label: "Running", value: activeTimers.runningCount || 0 },
          { label: "Paused", value: activeTimers.pausedCount || 0 },
        ]),
        createTimeTrackingRows(context, rows, "No active or paused timers."),
        createActionRow(context, timeTrackingRecordList([activeTimers.action])),
      ],
    });
  }

  /** @param {TimeTrackingRecord} data @param {TimeTrackingPanelContext} context */
  function createRecentTimeContent(data, context) {
    const recentTime = timeTrackingRecord(data?.recentTime) || {};
    const rows = timeTrackingRecordList(recentTime.rows);
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
        createActionRow(context, timeTrackingRecordList(recentTime.actions)),
      ],
    });
  }

  /** @param {TimeTrackingPanelContext} context @param {readonly TimeTrackingMetric[]} metrics */
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

  /**
   * @param {TimeTrackingPanelContext} context
   * @param {readonly TimeTrackingRecord[]} rows
   * @param {string} emptyMessage
   */
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

  /** @param {TimeTrackingPanelContext} context @param {TimeTrackingRecord} [row] */
  function createTimeTrackingRow(context, row = {}) {
    const action = timeTrackingRecord(row.action) || {};
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

  /** @param {TimeTrackingPanelContext} context @param {readonly TimeTrackingRecord[]} [actions] */
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

  /** @param {TimeTrackingPanelContext} context @param {string} message */
  function createPanelBody(context, message) {
    return context.view.createElement("div", {
      className: "dashboard-panel-body",
      attrs: { role: "status" },
      text: message,
    });
  }

  /** @param {HTMLElement} body @param {TimeTrackingPanelContext} context @param {string} message */
  function renderError(body, context, message) {
    body.replaceChildren(context.view.createEmptyState({
      title: "Time Tracking data unavailable",
      message,
    }));
  }

  /** @param {unknown} seconds */
  function formatHours(seconds) {
    return typeof formatters?.hours === "function"
      ? formatters.hours(seconds)
      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;
  }
}());
