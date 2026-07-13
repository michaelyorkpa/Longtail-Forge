// Calendar renders the read-only task calendar through framework view primitives.
// Period math, the bounded task calendar-window fetch (/api/tasks/calendar), and
// grid/day rendering live in the shared LongtailForge.taskCalendar helpers; this
// adapter owns the page chrome (toolbar, filters, status) and opens entries
// through the canonical Task editor.
const calendarHost = document.querySelector("[data-calendar-host]");
const calendarView = window.LongtailForge?.view;
const taskCalendar = window.LongtailForge?.taskCalendar;

const CALENDAR_VIEW_OPTIONS = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

const calendarState = {
  view: "month",
  anchor: new Date(),
  data: null,
  workspaceType: "business",
  clientId: "",
  projectId: "",
  clients: [],
  projects: [],
};

let calendarStatus = null;
let calendarPeriodLabel = null;
let calendarViewButtons = [];
let calendarBodyRegion = null;
let calendarClientFilter = null;
let calendarProjectFilter = null;
let calendarClientFilterControl = null;

applyCalendarQueryParams();
buildCalendarHost();
initializeCalendar();

async function initializeCalendar() {
  if (!calendarHost || !calendarView || !taskCalendar) {
    return;
  }

  await Promise.resolve(window.LongtailForge?.workspaceContextReady).catch(() => null);
  applyCalendarWorkspaceContext();
  await loadCalendarFilterOptions();
  populateCalendarFilters();
  await loadCalendarWindow();
}

function applyCalendarQueryParams() {
  if (!taskCalendar) {
    return;
  }

  const params = new URLSearchParams(window.location?.search || "");
  const requestedView = String(params.get("view") || "").trim().toLowerCase();

  if (CALENDAR_VIEW_OPTIONS.some((option) => option.id === requestedView)) {
    calendarState.view = requestedView;
  }

  const requestedDate = String(params.get("date") || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    const anchor = taskCalendar.parseDateKey(requestedDate);

    if (Number.isFinite(anchor.getTime())) {
      calendarState.anchor = anchor;
    }
  }
}

function buildCalendarHost() {
  if (!calendarHost || !calendarView) {
    return;
  }

  const header = calendarView.createPageHeader({
    title: "Calendar",
    subtitle: "Task due dates and reminders, read-only.",
  });

  calendarStatus = calendarView.createStatusMessage({
    className: "calendar-status",
    dataset: { calendarStatus: "" },
    hidden: true,
  });

  calendarPeriodLabel = calendarView.createElement("h2", {
    className: "calendar-period-label",
    dataset: { calendarPeriodLabel: "" },
  });

  const previousButton = calendarView.createActionButton({
    className: "calendar-period-button",
    icon: "previous",
    iconOnly: true,
    label: "Previous period",
    text: "",
    onClick: () => shiftCalendarPeriod(-1),
  });
  previousButton.dataset.calendarPeriodPrevious = "";

  const todayButton = calendarView.createActionButton({
    className: "calendar-period-button",
    label: "Today",
    onClick: () => {
      calendarState.anchor = new Date();
      loadCalendarWindow();
    },
  });
  todayButton.dataset.calendarPeriodToday = "";

  const nextButton = calendarView.createActionButton({
    className: "calendar-period-button",
    icon: "next",
    iconOnly: true,
    label: "Next period",
    text: "",
    onClick: () => shiftCalendarPeriod(1),
  });
  nextButton.dataset.calendarPeriodNext = "";

  const periodNav = calendarView.createElement("div", {
    className: "calendar-period-nav",
    attrs: { role: "group", "aria-label": "Calendar period" },
    children: [previousButton, todayButton, nextButton],
  });

  const toolbar = calendarView.createElement("div", {
    className: "calendar-toolbar",
    children: [
      calendarView.createElement("div", {
        className: "calendar-toolbar-period",
        children: [calendarPeriodLabel, periodNav],
      }),
      calendarView.createElement("div", {
        className: "segmented-control calendar-view-switch",
        attrs: { role: "group", "aria-label": "Calendar view" },
        children: CALENDAR_VIEW_OPTIONS.map((option) => createViewSwitchButton(option)),
      }),
    ],
  });

  calendarBodyRegion = calendarView.createElement("section", {
    className: "calendar-body",
    attrs: { "aria-label": "Calendar" },
    dataset: { calendarBody: "" },
  });

  calendarHost.replaceChildren(header, calendarStatus, toolbar, createCalendarFilterPanel(), calendarBodyRegion);
}

function createCalendarFilterPanel() {
  calendarClientFilter = calendarView.createElement("select", {
    attrs: { "aria-label": "Client filter" },
    dataset: { calendarClientFilter: "" },
  });
  calendarProjectFilter = calendarView.createElement("select", {
    attrs: { "aria-label": "Project filter" },
    dataset: { calendarProjectFilter: "" },
  });
  calendarClientFilterControl = calendarView.createElement("label", {
    className: "calendar-filter-control",
    children: [
      calendarView.createElement("span", { text: "Client" }),
      calendarClientFilter,
    ],
    dataset: { calendarClientFilterControl: "" },
  });

  calendarClientFilter.addEventListener("change", () => {
    calendarState.clientId = calendarClientFilter.value;
    populateCalendarProjectFilter();
    calendarState.projectId = calendarProjectFilter.value;
    loadCalendarWindow();
  });
  calendarProjectFilter.addEventListener("change", () => {
    calendarState.projectId = calendarProjectFilter.value;
    loadCalendarWindow();
  });

  return calendarView.createFilterPanel({
    title: "Filters",
    className: "calendar-filter-panel",
    ariaLabel: "Calendar filters",
    fields: [
      calendarClientFilterControl,
      calendarView.createElement("label", {
        className: "calendar-filter-control",
        children: [
          calendarView.createElement("span", { text: "Project" }),
          calendarProjectFilter,
        ],
      }),
    ],
  });
}

function shiftCalendarPeriod(direction) {
  const anchor = calendarState.anchor;

  if (calendarState.view === "month") {
    calendarState.anchor = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  } else if (calendarState.view === "week") {
    calendarState.anchor = taskCalendar.addDays(anchor, direction * 7);
  } else {
    calendarState.anchor = taskCalendar.addDays(anchor, direction);
  }

  loadCalendarWindow();
}

function applyCalendarWorkspaceContext() {
  calendarState.workspaceType = window.LongtailForge?.workspaceContext?.workspaceType || "business";

  if (calendarClientFilterControl) {
    calendarClientFilterControl.hidden = calendarState.workspaceType !== "business";
  }
}

async function loadCalendarFilterOptions() {
  try {
    const response = await fetch("/api/client-projects", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load filter options: ${response.status}`);
    }

    const normalizedClients = window.LongtailForge?.clientProjectOptions?.normalizeClients?.(await response.json()) || [];
    calendarState.clients = normalizedClients.filter((client) => client.id && !client.isWorkspaceScope);
    calendarState.projects = flattenCalendarProjectOptions(normalizedClients);
  } catch {
    calendarState.clients = [];
    calendarState.projects = [];
  }
}

function flattenCalendarProjectOptions(clients) {
  const projects = [];

  for (const client of clients) {
    const clientLabel = window.LongtailForge?.clientProjectOptions?.optionLabel?.(client)
      || client.displayName
      || client.name
      || "";

    for (const project of Array.isArray(client.projects) ? client.projects : []) {
      if (!project?.id) {
        continue;
      }

      const projectLabel = project.optionLabel || project.name || "Untitled Project";
      projects.push({
        id: project.id,
        clientId: client.isWorkspaceScope ? "" : client.id,
        label: clientLabel ? `${clientLabel} / ${projectLabel}` : projectLabel,
        projectLabel,
      });
    }
  }

  return projects;
}

function populateCalendarFilters() {
  if (calendarClientFilter) {
    calendarClientFilter.replaceChildren(
      createCalendarOption("", "All clients"),
      ...calendarState.clients.map((client) => createCalendarOption(
        client.id,
        window.LongtailForge?.clientProjectOptions?.optionLabel?.(client) || client.name || "Untitled Client",
      )),
    );
    calendarClientFilter.value = calendarState.clientId;
  }

  populateCalendarProjectFilter();
}

function populateCalendarProjectFilter() {
  if (!calendarProjectFilter) {
    return;
  }

  const previousValue = calendarProjectFilter.value;
  const selectedClientId = calendarState.workspaceType === "business" ? calendarClientFilter?.value || "" : "";
  const projects = selectedClientId
    ? calendarState.projects.filter((project) => project.clientId === selectedClientId)
    : calendarState.projects;

  calendarProjectFilter.replaceChildren(
    createCalendarOption("", "All projects"),
    ...projects.map((project) => createCalendarOption(project.id, selectedClientId ? project.projectLabel : project.label)),
  );
  calendarProjectFilter.value = projects.some((project) => project.id === previousValue) ? previousValue : "";
}

function createCalendarOption(value, label) {
  return calendarView.createElement("option", {
    attrs: { value },
    text: label,
  });
}

function createViewSwitchButton(option) {
  const button = calendarView.createElement("button", {
    className: "calendar-view-button",
    text: option.label,
    attrs: { type: "button", "aria-pressed": option.id === calendarState.view ? "true" : "false" },
    dataset: { calendarViewOption: option.id },
  });

  button.addEventListener("click", () => {
    if (calendarState.view === option.id) {
      return;
    }

    calendarState.view = option.id;
    updateViewSwitchButtons();
    loadCalendarWindow();
  });

  calendarViewButtons.push(button);
  return button;
}

function updateViewSwitchButtons() {
  for (const button of calendarViewButtons) {
    const isActive = button.dataset.calendarViewOption === calendarState.view;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

async function loadCalendarWindow() {
  if (!calendarHost || !calendarView || !taskCalendar) {
    return;
  }

  setCalendarStatus("Loading calendar...");

  try {
    const range = taskCalendar.calendarRange(calendarState.view, calendarState.anchor);
    calendarState.data = await taskCalendar.fetchCalendarWindow(range, {
      clientId: calendarState.clientId,
      projectId: calendarState.projectId,
    });
    calendarPeriodLabel.textContent = range.label;
    taskCalendar.renderCalendarBody(calendarBodyRegion, {
      viewId: calendarState.view,
      range,
      data: calendarState.data,
      onOpenTask: openCalendarTask,
    });
    setCalendarStatus(calendarState.data?.source_enabled === false
      ? "The Tasks module is disabled for this workspace. Existing due dates are shown read-only."
      : "");
  } catch (error) {
    setCalendarStatus(error.message || "Calendar data could not be loaded.", { isError: true });
    console.error(error);
  }
}

function openCalendarTask(taskId, trigger) {
  const opener = window.LongtailForge?.tasksDialog?.openTaskEditor;

  if (typeof opener !== "function" || !taskId) {
    return;
  }

  opener({
    taskId,
    mode: "edit",
    returnFocusTo: trigger,
    onSaved: () => loadCalendarWindow(),
  }).catch((error) => {
    setCalendarStatus("The task could not be opened.", { isError: true });
    console.error(error);
  });
}

function setCalendarStatus(message, options = {}) {
  if (!calendarStatus) {
    return;
  }

  calendarStatus.textContent = message || "";
  calendarStatus.hidden = !message;
  calendarStatus.dataset.viewTone = options.isError ? "danger" : "info";
  calendarStatus.setAttribute("role", options.isError ? "alert" : "status");
  calendarStatus.setAttribute("aria-live", options.isError ? "assertive" : "polite");
}
