// Dashboard renders the workspace overview through contribution-backed panels.
const dashboardHost = document.querySelector("[data-dashboard-host]");
const dashboardView = window.LongtailForge?.view;

let dashboardData = null;
let dashboardPanels = [];
let dashboardPanelRegion = null;
let dashboardStatus = null;
let dashboardSummaryGrid = null;

const dashboardPanelRenderers = {};

publishDashboardApi();
registerDashboardPanelRenderer("project-summary", renderProjectHub);
registerDashboardPanelRenderer("task-summary", renderTaskSummaryContribution);
buildDashboardHost();
bindDashboardEvents();
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
  dashboardSummaryGrid = dashboardView.createElement("section", {
    className: "dashboard-summary-grid",
    attrs: { "aria-label": "Dashboard summary" },
    hidden: true,
  });
  dashboardPanelRegion = dashboardView.createElement("section", {
    className: "dashboard-panel-region",
    attrs: { "aria-label": "Dashboard panels" },
    dataset: { dashboardPanelRegion: "" },
  });

  dashboardHost.replaceChildren(
    header,
    dashboardStatus,
    dashboardSummaryGrid,
    dashboardPanelRegion,
  );
}

function bindDashboardEvents() {
  dashboardHost?.addEventListener("change", (event) => {
    if (event.target?.matches?.("input[name='dashboard-report-client']")) {
      updateOpenReportButton();
    }
  });

  dashboardHost?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-open-client-report]");

    if (!button) {
      return;
    }

    const scopeId = getSelectedReportScopeId();

    if (scopeId) {
      window.location.href = `reporting.html?scope=${encodeURIComponent(scopeId)}`;
    }
  });
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
    renderRegisteredDashboardPanels();
    setDashboardStatus("");
  } catch (error) {
    setDashboardStatus("Dashboard data could not be loaded.", { isError: true });
    console.error(error);
  }
}

function publishDashboardApi() {
  window.LongtailForge = {
    ...(window.LongtailForge || {}),
    dashboard: {
      ...(window.LongtailForge?.dashboard || {}),
      registerPanelRenderer: registerDashboardPanelRenderer,
    },
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

function renderRegisteredDashboardPanels() {
  if (!dashboardSummaryGrid || !dashboardPanelRegion) {
    return;
  }

  dashboardSummaryGrid.replaceChildren();
  dashboardPanelRegion.replaceChildren();

  for (const contribution of dashboardPanels) {
    const renderer = dashboardPanelRenderers[contribution.renderer];

    if (!renderer) {
      continue;
    }

    const renderedPanels = normalizeRenderedPanels(renderer(contribution, createDashboardRendererContext(contribution)));
    const target = contribution.id === "project-summary" ? dashboardSummaryGrid : dashboardPanelRegion;
    renderedPanels.forEach((panel) => target.appendChild(panel));
  }

  dashboardSummaryGrid.hidden = dashboardSummaryGrid.childElementCount === 0;
  dashboardPanelRegion.hidden = dashboardPanelRegion.childElementCount === 0;

  if (dashboardSummaryGrid.hidden && dashboardPanelRegion.hidden) {
    dashboardPanelRegion.hidden = false;
    dashboardPanelRegion.appendChild(dashboardView.createEmptyState({
      title: "No dashboard panels are available",
      message: "Enabled modules can contribute overview panels when you have access to them.",
    }));
  }
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
    setStatus: setDashboardStatus,
    view: dashboardView,
    workspaceProjectsLabel,
    createPanel: (options = {}) => createDashboardPanel(contribution, options),
    createDashboardPanel,
  };
}

function renderProjectHub(contribution) {
  const hub = dashboardData?.hub || {};
  const reportScopes = Array.isArray(hub.reportScopes) ? hub.reportScopes : [];
  const details = dashboardView.createElement("details", {
    className: "dashboard-client-details",
    children: [
      dashboardView.createElement("summary", {
        children: [
          dashboardView.createElement("span", {
            dataset: { dashboardHubCountLabel: "" },
            text: hub.countLabel || "Active Projects",
          }),
          dashboardView.createElement("span", {
            className: "metric-value",
            dataset: { activeClientCount: "" },
            text: String(hub.activeCount || 0),
          }),
        ],
      }),
      createReportScopeOptions(hub, reportScopes),
      dashboardView.createElement("button", {
        attrs: {
          type: "button",
          "data-open-client-report": "",
          disabled: true,
        },
        text: "Open Reporting",
      }),
    ],
  });
  const panel = createDashboardPanel(contribution, {
    className: "active-client-panel",
    children: [details],
  });

  selectDefaultReportScope(hub.defaultReportScopeId || "");
  updateOpenReportButton(panel);
  return panel;
}

function createReportScopeOptions(hub, reportScopes) {
  const fieldset = dashboardView.createElement("fieldset", {
    className: "client-radio-list",
    dataset: { clientReportOptions: "" },
    children: [
      createLegend(hub.reportLegend || "Project Reporting"),
    ],
  });

  reportScopes.forEach((scope) => {
    fieldset.appendChild(createScopeRadio(scope));
  });

  return fieldset;
}

function renderTaskSummaryContribution() {
  if (!dashboardData?.tasks?.available) {
    return null;
  }

  return createTaskSummaryPanel(dashboardData.tasks.summary);
}

function createTaskSummaryPanel(summary = {}) {
  const counts = dashboardView.createElement("div", {
    className: "task-summary-counts",
    children: [
      createTaskCount("Overdue", summary.counts?.overdue || 0),
      createTaskCount("Due Soon", summary.counts?.dueSoon || 0),
      createTaskCount("Mine", summary.counts?.assignedToMe || 0),
    ],
  });
  const sections = dashboardView.createElement("div", {
    className: "task-summary-sections",
    children: [
      createTaskSummarySection("Overdue", summary.overdue || [], "No overdue tasks."),
      createTaskSummarySection("Due Soon", summary.dueSoon || [], "No tasks due soon."),
      createTaskSummarySection("Assigned to Me", summary.assignedToMe || [], "No assigned active tasks."),
    ],
  });

  return createDashboardPanel(findDashboardContribution("task-summary", "task-summary"), {
    className: "task-summary-panel",
    title: "Tasks",
    children: [counts, sections],
  });
}

function createTaskSummarySection(title, rows, emptyMessage) {
  const listItems = rows.length === 0
    ? [dashboardView.createElement("li", { text: emptyMessage })]
    : rows.slice(0, 5).map((task) => {
        const link = dashboardView.createElement("a", {
          attrs: { href: task.url || `tasks.html?task=${encodeURIComponent(task.task_id)}` },
          text: task.title,
        });
        const meta = dashboardView.createElement("span", {
          text: task.due_date ? `Due ${task.due_date}` : "No due date",
        });

        return dashboardView.createElement("li", { children: [link, meta] });
      });

  return dashboardView.createElement("section", {
    className: "task-summary-section",
    children: [
      dashboardView.createElement("h3", { text: title }),
      dashboardView.createElement("ul", {
        className: "task-summary-list",
        children: listItems,
      }),
    ],
  });
}

function createTaskCount(label, value) {
  return dashboardView.createElement("span", {
    children: [
      dashboardView.createElement("strong", { text: String(value) }),
      dashboardView.createElement("span", { text: label }),
    ],
  });
}

function createDashboardPanel(contribution = {}, options = {}) {
  const panel = dashboardView.createElement("article", {
    className: ["dashboard-panel", "surface-main-panel", options.className],
    attrs: {
      ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
      ...(contribution?.id ? { "data-dashboard-panel-id": contribution.id } : {}),
      ...(contribution?.renderer ? { "data-dashboard-renderer": contribution.renderer } : {}),
    },
    dataset: {
      ...(contribution?.moduleId ? { moduleId: contribution.moduleId } : {}),
    },
  });

  if (options.title) {
    panel.appendChild(dashboardView.createElement("h2", { text: options.title }));
  }

  panel.append(...(Array.isArray(options.children) ? options.children : [options.children]).filter(Boolean));
  return panel;
}

function findDashboardContribution(renderer, id = "") {
  return dashboardPanels.find((panel) => (
    panel.renderer === renderer &&
    (!id || panel.id === id)
  ));
}

function createLegend(text) {
  return dashboardView.createElement("legend", { text });
}

function createScopeRadio(scope) {
  const input = dashboardView.createElement("input", {
    attrs: {
      type: "radio",
      name: "dashboard-report-client",
      value: scope.id,
    },
  });

  return dashboardView.createElement("label", {
    className: "client-radio-option",
    children: [
      input,
      document.createTextNode(scope.isWorkspaceScope ? workspaceProjectsLabel() : scope.name),
    ],
  });
}

function selectDefaultReportScope(defaultScopeId) {
  if (!defaultScopeId) {
    return;
  }

  const defaultInput = [...dashboardHost?.querySelectorAll("input[name='dashboard-report-client']") || []]
    .find((input) => input.value === defaultScopeId);

  if (defaultInput) {
    defaultInput.checked = true;
  }
}

function updateOpenReportButton(root = dashboardHost) {
  const button = root?.querySelector?.("[data-open-client-report]");

  if (button) {
    button.disabled = !getSelectedReportScopeId(root);
  }
}

function getSelectedReportScopeId(root = dashboardHost) {
  return root?.querySelector?.("input[name='dashboard-report-client']:checked")?.value || "";
}

function workspaceProjectsLabel() {
  return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
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
