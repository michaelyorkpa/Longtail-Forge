// Tasks owns its Dashboard renderer behavior. The framework Dashboard host
// supplies only generic contribution rendering and asset-loading contracts.
// This file is a native ES module at runtime: the browser loads it as one and its
// top-level await depends on that. TypeScript decides module scope from syntax alone,
// so without an export marker it modelled this file as a global script and offered every
// declaration below to the classic shared scope. The marker exports nothing; this module's
// public behaviour is its explicit window.LongtailForge.* publication.
export {};

const bridge = window.LongtailForge?.esModuleBridge;

if (!bridge?.importScripts) {
  throw new Error("Tasks Dashboard requires the ES-module compatibility bridge.");
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserEsModuleBridge} BrowserEsModuleBridge */

/**
 * The dashboard asset loader this module cannot open the Task editor without.
 *
 * The module-scope guard above already throws when the bridge is absent, so this can only fail
 * if the namespace is torn down afterwards - but the guard narrows `bridge` at module scope and
 * not inside this handler, and asserting what the compiler cannot see is what this branch does
 * not do. Acquired at the point of use, failing where the raw read failed before.
 * @returns {BrowserEsModuleBridge}
 */
function requireEsModuleBridge() {
  const esModuleBridge = window.LongtailForge?.esModuleBridge;
  if (!esModuleBridge) {
    throw new Error("Tasks Dashboard requires the ES-module compatibility bridge.");
  }
  return esModuleBridge;
}

await bridge.importScripts([
  "/js/shared/task-calendar.js",
  "/js/shared/capture-prompt.js",
  "/js/task-resume-note-capture.js",
]);

const dashboard = window.LongtailForge?.dashboard;
const DEFAULT_TASK_SUMMARY_ROUTE = "/api/tasks/dashboard-summary";

if (!dashboard?.registerPanelRenderer) {
  throw new Error("Tasks Dashboard requires the framework Dashboard renderer registry.");
}

dashboard.registerPanelRenderer("tasks.needs-attention", renderTasksNeedsAttentionContribution);
dashboard.registerPanelRenderer("tasks.calendar", renderTasksCalendarContribution);
dashboard.registerPanelRenderer("tasks.today-upcoming", renderTasksTodayUpcomingContribution);
dashboard.registerPanelRenderer("tasks.pressure", renderTasksPressureContribution);
dashboard.registerPanelRenderer("task-summary", renderTasksPressureContribution);

/** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskCalendarViewId} BrowserTaskCalendarViewId */
/**
 * Only the channels used here, from dashboard.js:createDashboardRendererContext.
 * The registry deliberately accepts unknown; this local guard establishes callable channels,
 * not a new published host or task-record contract. The view methods reuse their producer type.
 * @typedef {object} TasksDashboardContext
 * @property {Pick<BrowserViewFactory, "createElement" | "createEmptyState">} view
 * @property {(options: {className: string, title: unknown, children: (Node | null)[]}) => HTMLElement} createPanel
 * @property {(contribution: unknown, fallbackRoute: string) => Promise<unknown>} loadContributionData
 * @property {(message: string, options: {isError: boolean}) => void} setStatus
 *
 * @typedef {object} TasksDashboardPanelOptions
 * @property {string} className
 * @property {string} errorMessage
 * @property {string} errorTitle
 * @property {string} loadingMessage
 * @property {unknown} title
 * @property {(context: TasksDashboardContext, summary?: Record<string, unknown>) => HTMLElement} renderContent
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isTasksDashboardRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Summary rows/metrics/actions are a Tasks-owned projection, not BrowserTaskRecord.
 * Keep their own display values opaque: the view factory owns text/attribute coercion.
 * Copy only own entries so inherited names cannot become wire data. Unreadable records
 * now use the existing empty-object defaults instead of refusing a whole panel;
 * no required member is invented.
 * @param {unknown} value @returns {Record<string, unknown>}
 */
function tasksDashboardRecord(value) {
  return isTasksDashboardRecord(value) ? Object.fromEntries(Object.entries(value)) : {};
}

/** @param {unknown} context @returns {asserts context is TasksDashboardContext} */
function requireTasksDashboardContext(context) {
  if (!isTasksDashboardRecord(context) || !isTasksDashboardRecord(context.view)
    || typeof context.view.createElement !== "function" || typeof context.view.createEmptyState !== "function"
    || typeof context.createPanel !== "function" || typeof context.loadContributionData !== "function"
    || typeof context.setStatus !== "function") {
    throw new TypeError("Tasks Dashboard requires its host panel, data, status and view channels.");
  }
}

/** @param {unknown} contribution @param {unknown} context */
function renderTasksNeedsAttentionContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "dashboard-task-attention-panel",
    errorMessage: "Task attention signals could not be loaded.",
    errorTitle: "Needs Attention unavailable",
    loadingMessage: "Loading attention signals...",
    renderContent: createTasksNeedsAttentionContent,
    title: tasksDashboardRecord(contribution).label || "Needs Attention",
  });
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskCalendarOccurrence} BrowserTaskCalendarOccurrence */
/** @param {unknown} contribution @param {unknown} contextValue */
function renderTasksCalendarContribution(contribution, contextValue) {
  const optionalTaskCalendar = window.LongtailForge?.taskCalendar;

  if (!optionalTaskCalendar) {
    return null;
  }

  // Re-bound after the guard so the nested `hydrate` sees the narrowed surface. The Dashboard
  // still contributes no panel at all when the helper is unpublished; this is the same object.
  const taskCalendar = optionalTaskCalendar;
  requireTasksDashboardContext(contextValue);
  const context = contextValue;

  const state = {
    view: taskCalendar.resolveDefaultView(taskCalendar.readPreferredCalendarView()),
    viewSelectedByUser: false,
  };
  let hydrateToken = 0;
  const periodLabel = context.view.createElement("p", {
    className: "dashboard-calendar-period",
    dataset: { dashboardCalendarPeriod: "" },
  });
  const body = context.view.createElement("div", {
    className: "dashboard-calendar-body",
    attrs: { role: "status" },
    text: "Loading calendar...",
  });
  /** @type {BrowserTaskCalendarViewId[]} */
  const viewIds = ["month", "week", "day"];
  const viewButtons = viewIds.map((viewId) => createViewButton(viewId));
  const toolbar = context.view.createElement("div", {
    className: "dashboard-calendar-toolbar",
    children: [
      periodLabel,
      context.view.createElement("div", {
        className: "segmented-control dashboard-calendar-view-switch",
        attrs: { role: "group", "aria-label": "Dashboard calendar view" },
        children: viewButtons,
      }),
    ],
  });
  const panel = context.createPanel({
    className: "dashboard-task-calendar-panel",
    title: tasksDashboardRecord(contribution).label || "Calendar",
    children: [
      toolbar,
      body,
      createDashboardTaskActions(context, [{ label: "Open full calendar", href: "calendar.html" }]),
    ],
  });

  hydrate();
  return panel;

  /** @param {BrowserTaskCalendarViewId} viewId */
  function createViewButton(viewId) {
    const button = context.view.createElement("button", {
      className: "calendar-view-button",
      text: viewId.charAt(0).toUpperCase() + viewId.slice(1),
      attrs: { type: "button", "aria-pressed": viewId === state.view ? "true" : "false" },
      dataset: { dashboardCalendarView: viewId },
    });

    button.addEventListener("click", () => {
      if (state.view === viewId) {
        return;
      }

      state.view = viewId;
      state.viewSelectedByUser = true;
      updateViewButtons();

      hydrate();
    });

    return button;
  }

  async function hydrate() {
    const token = ++hydrateToken;

    try {
      const range = taskCalendar.calendarRange(state.view, new Date());
      const data = await taskCalendar.fetchCalendarWindow(range, {
        statuses: ["open", "in_progress", "blocked"],
      });

      if (token !== hydrateToken) {
        return;
      }

      periodLabel.textContent = range.label;
      body.removeAttribute("role");
      taskCalendar.renderCalendarBody(body, {
        viewId: state.view,
        range,
        data,
        onOpenTask: openTask,
      });
    } catch (error) {
      if (token !== hydrateToken) {
        return;
      }

      body.replaceChildren(context.view.createEmptyState({
        title: "Calendar unavailable",
        message: "Task calendar data could not be loaded.",
      }));
      console.error(error);
    }
  }

  function updateViewButtons() {
    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", button.dataset.dashboardCalendarView === state.view ? "true" : "false");
    }
  }

  /**
   * @param {string} taskId @param {Element} trigger
   * @param {BrowserTaskCalendarOccurrence | null} [occurrence]
   */
  async function openTask(taskId, trigger, occurrence = null) {
    const templateId = String(occurrence?.templateId || "").trim();
    const instanceDate = String(occurrence?.instanceDate || "").trim();

    if (!taskId && (!templateId || !instanceDate)) {
      return;
    }

    try {
      await requireEsModuleBridge().importScript("/js/task-dialog.js");
      const opener = window.LongtailForge?.tasksDialog?.openTaskEditor;

      if (typeof opener !== "function") {
        throw new Error("The Task editor did not register its opener.");
      }

      await opener({
        instanceDate,
        taskId,
        templateId,
        mode: "edit",
        returnFocusTo: trigger,
        onSaved: () => hydrate(),
      });
    } catch (error) {
      context.setStatus("The task could not be opened.", { isError: true });
      console.error(error);
    }
  }
}

/** @param {unknown} contribution @param {unknown} context */
function renderTasksTodayUpcomingContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "dashboard-task-upcoming-panel",
    errorMessage: "Upcoming task work could not be loaded.",
    errorTitle: "Today / Upcoming unavailable",
    loadingMessage: "Loading upcoming work...",
    renderContent: createTasksTodayUpcomingContent,
    title: tasksDashboardRecord(contribution).label || "Today / Upcoming",
  });
}

/** @param {unknown} contribution @param {unknown} context */
function renderTasksPressureContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "task-summary-panel dashboard-task-pressure-panel",
    errorMessage: "Task pressure could not be loaded.",
    errorTitle: "Tasks unavailable",
    loadingMessage: "Loading task pressure...",
    renderContent: createTasksPressureContent,
    title: tasksDashboardRecord(contribution).label || "Tasks",
  });
}

/** @param {unknown} contribution @param {unknown} context @param {TasksDashboardPanelOptions} options */
function renderTasksDashboardContribution(contribution, context, options) {
  requireTasksDashboardContext(context);
  const body = context.view.createElement("div", {
    className: "dashboard-panel-body",
    attrs: { role: "status" },
    text: options.loadingMessage,
  });
  const panel = context.createPanel({
    className: options.className,
    title: options.title,
    children: [body],
  });

  hydrateTasksDashboardPanel(body, contribution, context, options);
  return panel;
}

/** @param {HTMLElement} body @param {unknown} contribution @param {TasksDashboardContext} context @param {TasksDashboardPanelOptions} options */
async function hydrateTasksDashboardPanel(body, contribution, context, options) {
  try {
    const summary = await context.loadContributionData(contribution, DEFAULT_TASK_SUMMARY_ROUTE);
    body.replaceChildren(options.renderContent(context, tasksDashboardRecord(summary)));
  } catch (error) {
    body.replaceChildren(context.view.createEmptyState({
      title: options.errorTitle,
      message: options.errorMessage,
    }));
    console.error(error);
  }
}

/** @param {TasksDashboardContext} context @param {Record<string, unknown>} [summaryValue] */
function createTasksNeedsAttentionContent(context, summaryValue = {}) {
  /** @type {Record<string, unknown> & {actions: Record<string, unknown>}} */
  const summary = { ...summaryValue, actions: tasksDashboardRecord(summaryValue.actions) };
  return context.view.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(context, summary.attentionRows || [], "No urgent task signals right now."),
      createDashboardTaskActions(context, [summary.actions?.workbench]),
    ],
  });
}

/** @param {TasksDashboardContext} context @param {Record<string, unknown>} [summaryValue] */
function createTasksTodayUpcomingContent(context, summaryValue = {}) {
  /** @type {Record<string, unknown> & {actions: Record<string, unknown>}} */
  const summary = { ...summaryValue, actions: tasksDashboardRecord(summaryValue.actions) };
  return context.view.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(context, summary.upcomingRows || [], "No due-today or due-this-week task work."),
      createDashboardTaskActions(context, [summary.actions?.workbench]),
    ],
  });
}

/** @param {TasksDashboardContext} context @param {Record<string, unknown>} [summaryValue] */
function createTasksPressureContent(context, summaryValue = {}) {
  /** @type {Record<string, unknown> & {actions: Record<string, unknown>, pressureRows: unknown[]}} */
  const summary = {
    ...summaryValue,
    actions: tasksDashboardRecord(summaryValue.actions),
    pressureRows: Array.isArray(summaryValue.pressureRows) ? summaryValue.pressureRows : [],
  };
  return context.view.createElement("div", {
    className: "task-summary-content",
    children: [
      createDashboardTaskMetricGrid(context, summary.metrics || {}),
      createDashboardTaskRows(context, (summary.pressureRows || []).slice(0, 1), "No task pressure signals right now."),
      createDashboardTaskActions(context, [summary.actions?.workbench, summary.actions?.tasks]),
    ],
  });
}

/** @param {TasksDashboardContext} context @param {unknown} [metricsValue] */
function createDashboardTaskMetricGrid(context, metricsValue = {}) {
  const metrics = tasksDashboardRecord(metricsValue);
  const orderedMetrics = ["overdue", "dueSoon", "blocked", "assignedToMe"]
    .map((key) => metrics[key])
    .filter(Boolean);

  return context.view.createElement("div", {
    className: "task-summary-counts dashboard-task-metrics",
    children: orderedMetrics.map((metric) => createTaskMetric(context, metric)),
  });
}

/** @param {TasksDashboardContext} context @param {unknown} [metricValue] */
function createTaskMetric(context, metricValue = {}) {
  const metric = tasksDashboardRecord(metricValue);
  const content = [
    context.view.createElement("strong", { text: String(metric.value ?? 0) }),
    context.view.createElement("span", { text: metric.label || "Metric" }),
  ];

  if (metric.href) {
    return context.view.createElement("a", {
      className: "dashboard-task-metric-link",
      attrs: { href: metric.href },
      children: content,
    });
  }

  return context.view.createElement("span", { children: content });
}

/** @param {TasksDashboardContext} context @param {unknown} rows @param {string} emptyMessage */
function createDashboardTaskRows(context, rows, emptyMessage) {
  /** @type {unknown[]} */
  const taskRows = Array.isArray(rows) ? rows : [];

  if (taskRows.length === 0) {
    return context.view.createElement("p", {
      className: "dashboard-task-empty",
      text: emptyMessage,
    });
  }

  return context.view.createElement("ul", {
    className: "dashboard-task-row-list",
    children: taskRows.map((row) => createDashboardTaskRow(context, row)),
  });
}

/** @param {TasksDashboardContext} context @param {unknown} [rowValue] */
function createDashboardTaskRow(context, rowValue = {}) {
  const row = tasksDashboardRecord(rowValue);
  /** @type {unknown[]} */
  const reasons = Array.isArray(row.reasons) && row.reasons.length > 0
    ? row.reasons
    : [row.reasonBadge].filter(Boolean);
  const action = tasksDashboardRecord(row.action);
  const metaItems = [row.sourceLabel, row.contextLabel, row.dueLabel, row.timerStatus]
    .filter(Boolean)
    .map((item) => context.view.createElement("span", { text: item }));

  return context.view.createElement("li", {
    className: "dashboard-task-row",
    children: [
      context.view.createElement("div", {
        className: "dashboard-task-row-main",
        children: [
          context.view.createElement("div", {
            className: "dashboard-task-row-heading",
            children: [
              context.view.createElement("strong", {
                className: "dashboard-task-row-title",
                text: row.title || "Untitled task",
              }),
              context.view.createElement("span", {
                className: "dashboard-task-row-badge",
                text: row.reasonBadge || reasons[0] || "Task",
              }),
            ],
          }),
          reasons.length > 1 ? context.view.createElement("div", {
            className: "dashboard-task-row-reasons",
            children: reasons.map((reason) => context.view.createElement("span", { text: reason })),
          }) : null,
          context.view.createElement("div", {
            className: "dashboard-task-row-meta",
            children: metaItems,
          }),
        ].filter(Boolean),
      }),
      action.href ? context.view.createElement("a", {
        className: "link-button dashboard-task-row-action",
        attrs: { href: action.href },
        text: action.label || "Open Workbench",
      }) : null,
    ],
  });
}

/** @param {TasksDashboardContext} context @param {unknown[]} [actions] */
function createDashboardTaskActions(context, actions = []) {
  const availableActions = actions.map(tasksDashboardRecord).filter((action) => action.href);

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
