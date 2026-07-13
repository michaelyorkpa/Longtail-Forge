// Dashboard renders the workspace overview through contribution-backed panels.
const dashboardHost = document.querySelector("[data-dashboard-host]");
const dashboardView = window.LongtailForge?.view;

let dashboardData = null;
let dashboardPanels = [];
let dashboardStatus = null;
let dashboardPulseRegion = null;
let dashboardWarningsRegion = null;
let dashboardRegionContainer = null;

const dashboardPanelRenderers = {};
const dashboardRegionBodies = new Map();
const dashboardDataPromises = new Map();
const DEFAULT_TASK_SUMMARY_ROUTE = "/api/tasks/dashboard-summary";
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
registerDashboardPanelRenderer("tasks.needs-attention", renderTasksNeedsAttentionContribution);
registerDashboardPanelRenderer("tasks.calendar", renderTasksCalendarContribution);
registerDashboardPanelRenderer("tasks.today-upcoming", renderTasksTodayUpcomingContribution);
registerDashboardPanelRenderer("tasks.pressure", renderTasksPressureContribution);
registerDashboardPanelRenderer("task-summary", renderTasksPressureContribution);
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
    const response = await fetch("/api/dashboard", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load dashboard data: ${response.status}`);
    }

    dashboardData = await response.json();
    dashboardPanels = dashboardData?.extensionPoints?.dashboardPanels || [];
    renderDashboardRegions();
    renderWorkspacePulse();
    renderSetupWarnings();
    renderRegisteredDashboardPanels();
    setDashboardStatus("");
  } catch (error) {
    setDashboardStatus("Dashboard data could not be loaded.", { isError: true });
    console.error(error);
  }
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

  const state = { view: "month" };
  let hydrateToken = 0;

  const periodLabel = dashboardView.createElement("p", {
    className: "dashboard-calendar-period",
    dataset: { dashboardCalendarPeriod: "" },
  });
  const body = dashboardView.createElement("div", {
    className: "dashboard-calendar-body",
    attrs: { role: "status" },
    text: "Loading calendar...",
  });
  const viewButtons = ["month", "week", "day"].map((viewId) => createViewButton(viewId));
  const toolbar = dashboardView.createElement("div", {
    className: "dashboard-calendar-toolbar",
    children: [
      periodLabel,
      dashboardView.createElement("div", {
        className: "segmented-control dashboard-calendar-view-switch",
        attrs: { role: "group", "aria-label": "Dashboard calendar view" },
        children: viewButtons,
      }),
    ],
  });
  const panel = createDashboardPanel(contribution, {
    className: "dashboard-task-calendar-panel",
    title: contribution.label || "Calendar",
    children: [
      toolbar,
      body,
      createDashboardTaskActions([{ label: "Open full calendar", href: "calendar.html" }]),
    ],
  });

  hydrate();
  return panel;

  function createViewButton(viewId) {
    const button = dashboardView.createElement("button", {
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

      for (const other of viewButtons) {
        other.setAttribute("aria-pressed", other.dataset.dashboardCalendarView === viewId ? "true" : "false");
      }

      hydrate();
    });

    return button;
  }

  async function hydrate() {
    const token = ++hydrateToken;

    try {
      const range = taskCalendar.calendarRange(state.view, new Date());
      const data = await taskCalendar.fetchCalendarWindow(range);

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

  function openTask(taskId, trigger) {
    const opener = window.LongtailForge?.tasksDialog?.openTaskEditor;

    if (typeof opener !== "function" || !taskId) {
      return;
    }

    opener({
      taskId,
      mode: "edit",
      returnFocusTo: trigger,
      onSaved: () => hydrate(),
    }).catch((error) => {
      context.setStatus("The task could not be opened.", { isError: true });
      console.error(error);
    });
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
  const body = dashboardView.createElement("div", {
    className: "dashboard-panel-body",
    attrs: { role: "status" },
    text: options.loadingMessage,
  });
  const panel = createDashboardPanel(contribution, {
    className: options.className,
    title: options.title,
    children: [body],
  });

  hydrateTasksDashboardPanel(body, contribution, context, options);
  return panel;
}

async function hydrateTasksDashboardPanel(body, contribution, context, options) {
  try {
    const summary = await loadContributionData(contribution, DEFAULT_TASK_SUMMARY_ROUTE);
    body.replaceChildren(options.renderContent(summary));
  } catch (error) {
    body.replaceChildren(context.view.createEmptyState({
      title: options.errorTitle,
      message: options.errorMessage,
    }));
    console.error(error);
  }
}

function createTasksNeedsAttentionContent(summary = {}) {
  return dashboardView.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(summary.attentionRows || [], "No urgent task signals right now."),
      createDashboardTaskActions([summary.actions?.workbench]),
    ],
  });
}

function createTasksTodayUpcomingContent(summary = {}) {
  return dashboardView.createElement("div", {
    className: "dashboard-task-card-content",
    children: [
      createDashboardTaskRows(summary.upcomingRows || [], "No due-today or due-this-week task work."),
      createDashboardTaskActions([summary.actions?.workbench]),
    ],
  });
}

function createTasksPressureContent(summary = {}) {
  return dashboardView.createElement("div", {
    className: "task-summary-content",
    children: [
      createDashboardTaskMetricGrid(summary.metrics || {}),
      createDashboardTaskRows((summary.pressureRows || []).slice(0, 1), "No task pressure signals right now."),
      createDashboardTaskActions([summary.actions?.workbench, summary.actions?.tasks]),
    ],
  });
}

function createDashboardTaskMetricGrid(metrics = {}) {
  const orderedMetrics = ["overdue", "dueSoon", "blocked", "assignedToMe"]
    .map((key) => metrics[key])
    .filter(Boolean);

  return dashboardView.createElement("div", {
    className: "task-summary-counts dashboard-task-metrics",
    children: orderedMetrics.map((metric) => createTaskMetric(metric)),
  });
}

function createTaskMetric(metric = {}) {
  const content = [
    dashboardView.createElement("strong", { text: String(metric.value ?? 0) }),
    dashboardView.createElement("span", { text: metric.label || "Metric" }),
  ];

  if (metric.href) {
    return dashboardView.createElement("a", {
      className: "dashboard-task-metric-link",
      attrs: { href: metric.href },
      children: content,
    });
  }

  return dashboardView.createElement("span", { children: content });
}

function createDashboardTaskRows(rows, emptyMessage) {
  const taskRows = Array.isArray(rows) ? rows : [];

  if (taskRows.length === 0) {
    return dashboardView.createElement("p", {
      className: "dashboard-task-empty",
      text: emptyMessage,
    });
  }

  return dashboardView.createElement("ul", {
    className: "dashboard-task-row-list",
    children: taskRows.map((row) => createDashboardTaskRow(row)),
  });
}

function createDashboardTaskRow(row = {}) {
  const reasons = Array.isArray(row.reasons) && row.reasons.length > 0
    ? row.reasons
    : [row.reasonBadge].filter(Boolean);
  const action = row.action || {};
  const metaItems = [row.sourceLabel, row.contextLabel, row.dueLabel, row.timerStatus]
    .filter(Boolean)
    .map((item) => dashboardView.createElement("span", { text: item }));

  return dashboardView.createElement("li", {
    className: "dashboard-task-row",
    children: [
      dashboardView.createElement("div", {
        className: "dashboard-task-row-main",
        children: [
          dashboardView.createElement("div", {
            className: "dashboard-task-row-heading",
            children: [
              dashboardView.createElement("strong", {
                className: "dashboard-task-row-title",
                text: row.title || "Untitled task",
              }),
              dashboardView.createElement("span", {
                className: "dashboard-task-row-badge",
                text: row.reasonBadge || reasons[0] || "Task",
              }),
            ],
          }),
          reasons.length > 1 ? dashboardView.createElement("div", {
            className: "dashboard-task-row-reasons",
            children: reasons.map((reason) => dashboardView.createElement("span", { text: reason })),
          }) : null,
          dashboardView.createElement("div", {
            className: "dashboard-task-row-meta",
            children: metaItems,
          }),
        ].filter(Boolean),
      }),
      action.href ? dashboardView.createElement("a", {
        className: "link-button dashboard-task-row-action",
        attrs: { href: action.href },
        text: action.label || "Open Workbench",
      }) : null,
    ],
  });
}

function createDashboardTaskActions(actions = []) {
  const availableActions = actions.filter((action) => action?.href);

  if (availableActions.length === 0) {
    return null;
  }

  return dashboardView.createElement("div", {
    className: "dashboard-task-actions",
    children: availableActions.map((action) => dashboardView.createElement("a", {
      className: "button-link secondary",
      attrs: { href: action.href },
      text: action.label || "Open",
    })),
  });
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
    dashboardDataPromises.set(route, fetch(route, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load Dashboard contribution data: ${response.status}`);
        }

        return response.json();
      }));
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
