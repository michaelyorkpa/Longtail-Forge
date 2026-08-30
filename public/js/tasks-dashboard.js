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

function renderTasksNeedsAttentionContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "dashboard-task-attention-panel",
    errorMessage: "Task attention signals could not be loaded.",
    errorTitle: "Needs Attention unavailable",
    loadingMessage: "Loading attention signals...",
    renderContent: createTasksNeedsAttentionContent,
    title: contribution.label || "Needs Attention",
  });
}

function renderTasksCalendarContribution(contribution, context) {
  const taskCalendar = window.LongtailForge?.taskCalendar;

  if (!taskCalendar) {
    return null;
  }

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
  const viewButtons = ["month", "week", "day"].map((viewId) => createViewButton(viewId));
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
    title: contribution.label || "Calendar",
    children: [
      toolbar,
      body,
      createDashboardTaskActions(context, [{ label: "Open full calendar", href: "calendar.html" }]),
    ],
  });

  hydrate();
  return panel;

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

function renderTasksTodayUpcomingContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "dashboard-task-upcoming-panel",
    errorMessage: "Upcoming task work could not be loaded.",
    errorTitle: "Today / Upcoming unavailable",
    loadingMessage: "Loading upcoming work...",
    renderContent: createTasksTodayUpcomingContent,
    title: contribution.label || "Today / Upcoming",
  });
}

function renderTasksPressureContribution(contribution, context) {
  return renderTasksDashboardContribution(contribution, context, {
    className: "task-summary-panel dashboard-task-pressure-panel",
    errorMessage: "Task pressure could not be loaded.",
    errorTitle: "Tasks unavailable",
    loadingMessage: "Loading task pressure...",
    renderContent: createTasksPressureContent,
    title: contribution.label || "Tasks",
  });
}

function renderTasksDashboardContribution(contribution, context, options) {
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

async function hydrateTasksDashboardPanel(body, contribution, context, options) {
  try {
    const summary = await context.loadContributionData(contribution, DEFAULT_TASK_SUMMARY_ROUTE);
    body.replaceChildren(options.renderContent(context, summary));
  } catch (error) {
    body.replaceChildren(context.view.createEmptyState({
      title: options.errorTitle,
      message: options.errorMessage,
    }));
    console.error(error);
  }
}

function createTasksNeedsAttentionContent(context, summary = {}) {
  return context.view.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(context, summary.attentionRows || [], "No urgent task signals right now."),
      createDashboardTaskActions(context, [summary.actions?.workbench]),
    ],
  });
}

function createTasksTodayUpcomingContent(context, summary = {}) {
  return context.view.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(context, summary.upcomingRows || [], "No due-today or due-this-week task work."),
      createDashboardTaskActions(context, [summary.actions?.workbench]),
    ],
  });
}

function createTasksPressureContent(context, summary = {}) {
  return context.view.createElement("div", {
    className: "task-summary-content",
    children: [
      createDashboardTaskMetricGrid(context, summary.metrics || {}),
      createDashboardTaskRows(context, (summary.pressureRows || []).slice(0, 1), "No task pressure signals right now."),
      createDashboardTaskActions(context, [summary.actions?.workbench, summary.actions?.tasks]),
    ],
  });
}

function createDashboardTaskMetricGrid(context, metrics = {}) {
  const orderedMetrics = ["overdue", "dueSoon", "blocked", "assignedToMe"]
    .map((key) => metrics[key])
    .filter(Boolean);

  return context.view.createElement("div", {
    className: "task-summary-counts dashboard-task-metrics",
    children: orderedMetrics.map((metric) => createTaskMetric(context, metric)),
  });
}

function createTaskMetric(context, metric = {}) {
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

function createDashboardTaskRows(context, rows, emptyMessage) {
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

function createDashboardTaskRow(context, row = {}) {
  const reasons = Array.isArray(row.reasons) && row.reasons.length > 0
    ? row.reasons
    : [row.reasonBadge].filter(Boolean);
  const action = row.action || {};
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

function createDashboardTaskActions(context, actions = []) {
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
