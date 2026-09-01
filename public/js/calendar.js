// Calendar renders the read-only task calendar through framework view primitives.
// Period math, the bounded task calendar-window fetch (/api/tasks/calendar), and
// grid/day rendering live in the shared LongtailForge.taskCalendar helpers; this
// adapter owns the page chrome (toolbar, filters, status) and opens entries
// through the canonical Task editor.
(function attachCalendarPage() {
  const calendarHost = document.querySelector("[data-calendar-host]");
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Calendar requires LongtailForge.errors.");
    }
    return errors;
  }

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
      throw new Error("Calendar requires LongtailForge.view.");
    }
    return factory;
  }
  const taskCalendar = window.LongtailForge?.taskCalendar;

  const CALENDAR_VIEW_OPTIONS = [
    { id: "month", label: "Month" },
    { id: "week", label: "Week" },
    { id: "day", label: "Day" },
  ];
  const CALENDAR_STATUS_OPTIONS = [
    { id: "open", label: "Open" },
    { id: "in_progress", label: "In Progress" },
    { id: "blocked", label: "Blocked" },
    { id: "complete", label: "Completed" },
    { id: "archived", label: "Archived" },
  ];
  const DEFAULT_CALENDAR_STATUSES = ["open", "in_progress", "blocked", "complete"];

  const calendarState = {
    view: taskCalendar?.resolveDefaultView?.(null) || "month",
    anchor: new Date(),
    data: null,
    workspaceType: "business",
    clientId: "",
    projectId: "",
    statuses: [...DEFAULT_CALENDAR_STATUSES],
    /** @type {import("../../src/types/browser-contracts.js").NormalizedClientOption[]} */
    clients: [],
    projects: [],
  };
  let calendarViewFromQuery = false;

  let calendarStatus = null;
  let calendarPeriodLabel = null;
  let calendarViewButtons = [];
  let calendarBodyRegion = null;
  let calendarClientFilter = null;
  let calendarProjectFilter = null;
  let calendarClientFilterControl = null;
  let calendarStatusFilter = null;

  applyCalendarQueryParams();
  buildCalendarHost();
  initializeCalendar();

  async function initializeCalendar() {
    const calendarView = window.LongtailForge?.view;
    if (!calendarHost || !calendarView || !taskCalendar) {
      return;
    }

    await Promise.resolve(window.LongtailForge?.workspaceContextReady).catch(() => null);
    if (!calendarViewFromQuery) {
      calendarState.view = taskCalendar.resolveDefaultView(taskCalendar.readPreferredCalendarView());
      updateViewSwitchButtons();
    }
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
      calendarViewFromQuery = true;
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
    const calendarView = requireView();
    if (!calendarHost || !calendarView) {
      return;
    }

    const header = calendarView.createPageHeader({
      title: "Calendar",
      subtitle: "Task due dates and reminders, read-only.",
    });

    calendarStatus = calendarView.createStatusMessage({
      className: "calendar-status",
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
    const calendarView = requireView();
    calendarClientFilter = calendarView.createElement("select", {
      attrs: { "aria-label": "Client filter" },
      dataset: { calendarClientFilter: "" },
    });
    calendarProjectFilter = calendarView.createElement("select", {
      attrs: { "aria-label": "Project filter" },
      dataset: { calendarProjectFilter: "" },
    });
    calendarStatusFilter = calendarView.createElement("select", {
      attrs: { "aria-label": "Task status filter", multiple: true, size: 3 },
      dataset: { calendarStatusFilter: "" },
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
    calendarStatusFilter.addEventListener("change", () => {
      calendarState.statuses = [...calendarStatusFilter.selectedOptions].map((option) => option.value);
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
        calendarView.createElement("label", {
          className: "calendar-filter-control",
          children: [
            calendarView.createElement("span", { text: "Task status" }),
            calendarStatusFilter,
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
      const response = await fetch("/api/client-projects?view=options", { cache: "no-store" });

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
    const calendarView = requireView();
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
    if (calendarStatusFilter) {
      calendarStatusFilter.replaceChildren(
        ...CALENDAR_STATUS_OPTIONS.map((option) => calendarView.createElement("option", {
          attrs: { value: option.id },
          text: option.label,
        })),
      );
      [...calendarStatusFilter.options].forEach((option) => {
        option.selected = calendarState.statuses.includes(option.value);
      });
    }
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
    const calendarView = requireView();
    return calendarView.createElement("option", {
      attrs: { value },
      text: label,
    });
  }

  function createViewSwitchButton(option) {
    const calendarView = requireView();
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
    const calendarView = window.LongtailForge?.view;
    if (!calendarHost || !calendarView || !taskCalendar) {
      return;
    }

    setCalendarStatus("Loading calendar...");

    try {
      const range = taskCalendar.calendarRange(calendarState.view, calendarState.anchor);
      calendarState.data = await taskCalendar.fetchCalendarWindow(range, {
        clientId: calendarState.clientId,
        projectId: calendarState.projectId,
        statuses: calendarState.statuses,
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
      setCalendarStatus(requireErrors().caughtMessage(error, "Calendar data could not be loaded."), { isError: true });
      console.error(error);
    }
  }

  function openCalendarTask(taskId, trigger, occurrence = null) {
    const opener = window.LongtailForge?.tasksDialog?.openTaskEditor;
    const templateId = String(occurrence?.templateId || "").trim();
    const instanceDate = String(occurrence?.instanceDate || "").trim();

    if (typeof opener !== "function" || (!taskId && (!templateId || !instanceDate))) {
      return;
    }

    opener({
      instanceDate,
      taskId,
      templateId,
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
})();
