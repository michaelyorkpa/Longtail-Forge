// Calendar renders the read-only task calendar through framework view primitives.
// It consumes the bounded task calendar-window read model (/api/tasks/calendar)
// and opens entries through the canonical Task editor.
const calendarHost = document.querySelector("[data-calendar-host]");
const calendarView = window.LongtailForge?.view;

const CALENDAR_VIEW_OPTIONS = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];
const CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  if (!calendarHost || !calendarView) {
    return;
  }

  await Promise.resolve(window.LongtailForge?.workspaceContextReady).catch(() => null);
  applyCalendarWorkspaceContext();
  await loadCalendarFilterOptions();
  populateCalendarFilters();
  await loadCalendarWindow();
}

function applyCalendarQueryParams() {
  const params = new URLSearchParams(window.location?.search || "");
  const requestedView = String(params.get("view") || "").trim().toLowerCase();

  if (CALENDAR_VIEW_OPTIONS.some((option) => option.id === requestedView)) {
    calendarState.view = requestedView;
  }

  const requestedDate = String(params.get("date") || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    const anchor = parseDateKey(requestedDate);

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
    calendarState.anchor = addDays(anchor, direction * 7);
  } else {
    calendarState.anchor = addDays(anchor, direction);
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
  if (!calendarHost || !calendarView) {
    return;
  }

  setCalendarStatus("Loading calendar...");

  try {
    const range = calendarRange();
    const params = new URLSearchParams({ start: range.fetchStart, end: range.fetchEnd });

    if (calendarState.clientId) {
      params.set("clientId", calendarState.clientId);
    }

    if (calendarState.projectId) {
      params.set("projectId", calendarState.projectId);
    }

    const response = await fetch(`/api/tasks/calendar?${params.toString()}`, { cache: "no-store" });

    if (response.status === 403) {
      throw new Error("You do not have permission to view tasks.");
    }

    if (!response.ok) {
      throw new Error(`Could not load calendar data: ${response.status}`);
    }

    calendarState.data = await response.json();
    renderCalendarBody(range);
    setCalendarStatus(calendarState.data?.source_enabled === false
      ? "The Tasks module is disabled for this workspace. Existing due dates are shown read-only."
      : "");
  } catch (error) {
    setCalendarStatus(error.message || "Calendar data could not be loaded.", { isError: true });
    console.error(error);
  }
}

function calendarRange() {
  const anchor = calendarState.anchor;

  if (calendarState.view === "day") {
    const dayKey = dateKeyOf(anchor);
    return {
      fetchStart: dayKey,
      fetchEnd: dayKey,
      days: [dayKey],
      label: formatFullDate(anchor),
    };
  }

  if (calendarState.view === "week") {
    const weekStart = addDays(anchor, -anchor.getDay());
    const days = listDayKeys(weekStart, 7);
    return {
      fetchStart: days[0],
      fetchEnd: days[days.length - 1],
      days,
      label: `Week of ${formatFullDate(weekStart)}`,
    };
  }

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
  const days = listDayKeys(gridStart, dayCount);
  return {
    fetchStart: days[0],
    fetchEnd: days[days.length - 1],
    days,
    label: anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    monthIndex: anchor.getMonth(),
  };
}

function renderCalendarBody(range) {
  if (!calendarBodyRegion) {
    return;
  }

  calendarPeriodLabel.textContent = range.label;

  const tasksByDate = groupByKey(calendarState.data?.tasks || [], (task) => task.due_date);
  const remindersByDate = groupByKey(calendarState.data?.reminders || [], (marker) => marker.date);
  const children = [];

  if (calendarState.view === "day") {
    children.push(createDayView(range.days[0], tasksByDate, remindersByDate));
  } else {
    children.push(createWeekdayHeaderRow());
    children.push(createDayGrid(range, tasksByDate, remindersByDate));
  }

  const hasEntries = range.days.some((dayKey) => (tasksByDate.get(dayKey) || []).length > 0
    || (remindersByDate.get(dayKey) || []).length > 0);

  if (!hasEntries) {
    children.push(calendarView.createEmptyState({
      title: "Nothing scheduled",
      message: "No task due dates or reminders in this period.",
    }));
  }

  calendarBodyRegion.replaceChildren(...children);
}

function createWeekdayHeaderRow() {
  return calendarView.createElement("div", {
    className: "calendar-weekday-row",
    attrs: { "aria-hidden": "true" },
    children: CALENDAR_WEEKDAY_LABELS.map((label) => calendarView.createElement("div", {
      className: "calendar-weekday",
      text: label,
    })),
  });
}

function createDayGrid(range, tasksByDate, remindersByDate) {
  const todayKey = dateKeyOf(new Date());
  const grid = calendarView.createElement("div", {
    className: ["calendar-grid", calendarState.view === "week" ? "calendar-grid--week" : "calendar-grid--month"],
  });

  for (const dayKey of range.days) {
    const dayTasks = tasksByDate.get(dayKey) || [];
    const dayReminders = remindersByDate.get(dayKey) || [];
    const dayDate = parseDateKey(dayKey);
    const classNames = ["calendar-day"];

    if (dayKey === todayKey) {
      classNames.push("is-today");
    }

    if (typeof range.monthIndex === "number" && dayDate.getMonth() !== range.monthIndex) {
      classNames.push("is-outside");
    }

    if (dayTasks.length === 0 && dayReminders.length === 0) {
      classNames.push("calendar-day--empty");
    }

    const isMonthGrid = typeof range.monthIndex === "number";
    const headerChildren = [
      calendarView.createElement("span", {
        className: ["calendar-day-number", isMonthGrid ? "u-hide-mobile" : ""],
        text: isMonthGrid
          ? String(dayDate.getDate())
          : dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        attrs: { "aria-label": formatFullDate(dayDate) },
      }),
    ];

    if (isMonthGrid) {
      headerChildren.push(calendarView.createElement("span", {
        className: "calendar-day-date-long u-mobile-only",
        text: dayDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      }));
    }

    if (dayReminders.length > 0) {
      headerChildren.push(createReminderIndicator(dayReminders));
    }

    grid.appendChild(calendarView.createElement("section", {
      className: classNames,
      attrs: { "aria-label": formatFullDate(dayDate) },
      dataset: { calendarDay: dayKey },
      children: [
        calendarView.createElement("div", {
          className: "calendar-day-header",
          children: headerChildren,
        }),
        calendarView.createElement("div", {
          className: "calendar-day-entries",
          children: dayTasks.map((task) => createTaskEntry(task)),
        }),
      ],
    }));
  }

  return grid;
}

function createDayView(dayKey, tasksByDate, remindersByDate) {
  const dayTasks = tasksByDate.get(dayKey) || [];
  const dayReminders = remindersByDate.get(dayKey) || [];
  const children = [];

  if (dayReminders.length > 0) {
    children.push(calendarView.createElement("section", {
      className: "calendar-day-reminders",
      attrs: { "aria-label": "Reminders" },
      children: [
        calendarView.createElement("h3", { className: "calendar-section-title", text: "Reminders" }),
        ...dayReminders.map((marker) => createReminderRow(marker)),
      ],
    }));
  }

  children.push(calendarView.createElement("section", {
    className: "calendar-day-tasks",
    attrs: { "aria-label": "Tasks due" },
    children: [
      calendarView.createElement("h3", { className: "calendar-section-title", text: "Tasks due" }),
      calendarView.createElement("div", {
        className: "calendar-day-entries",
        children: dayTasks.map((task) => createTaskEntry(task, { showMeta: true })),
      }),
    ],
  }));

  return calendarView.createElement("div", {
    className: "calendar-day-view",
    dataset: { calendarDay: dayKey },
    children,
  });
}

function createTaskEntry(task, options = {}) {
  const timeLabel = task.due_time ? formatDueTime(task.due_time) : "";
  const contextLabel = [task.client_name, task.project_name].filter(Boolean).join(" / ");
  const tooltip = [
    task.title,
    `Status: ${formatToken(task.status)}`,
    `Priority: ${formatToken(task.priority)}`,
    contextLabel,
    timeLabel ? `Due ${timeLabel}` : "Due all day",
  ].filter(Boolean).join("\n");
  const children = [];

  if (timeLabel) {
    children.push(calendarView.createElement("span", { className: "calendar-entry-time", text: timeLabel }));
  }

  children.push(calendarView.createElement("span", { className: "calendar-entry-title", text: task.title }));

  if (options.showMeta) {
    const metaText = [formatToken(task.status), formatToken(task.priority), contextLabel].filter(Boolean).join(" - ");
    children.push(calendarView.createElement("span", { className: "calendar-entry-meta", text: metaText }));
  }

  const entry = calendarView.createElement("button", {
    className: "calendar-entry",
    attrs: {
      type: "button",
      title: tooltip,
      "aria-label": `Open task: ${task.title}`,
    },
    dataset: {
      calendarEntry: task.task_id,
      priority: task.priority || "normal",
      status: task.status || "open",
    },
    children,
  });

  entry.addEventListener("click", () => openCalendarTask(task.task_id, entry));
  return entry;
}

function createReminderIndicator(reminders) {
  const summary = reminders
    .map((marker) => `${formatReminderTime(marker.reminder_at_utc)} ${marker.title}`)
    .join("\n");
  const indicator = calendarView.createElement("span", {
    className: "calendar-reminder-indicator",
    attrs: {
      title: `Reminders:\n${summary}`,
      role: "img",
      "aria-label": `${reminders.length} reminder${reminders.length === 1 ? "" : "s"}`,
    },
  });
  const icons = window.LongtailForge?.icons;

  if (icons?.createIcon) {
    indicator.appendChild(icons.createIcon("bell", { size: 12 }));
  }

  indicator.appendChild(calendarView.createElement("span", {
    className: "calendar-reminder-count",
    text: String(reminders.length),
  }));

  return indicator;
}

function createReminderRow(marker) {
  const row = calendarView.createElement("button", {
    className: "calendar-reminder-row",
    attrs: {
      type: "button",
      title: `Reminder for ${marker.title}`,
      "aria-label": `Open task: ${marker.title}`,
    },
    dataset: { calendarReminder: marker.task_id },
    children: [
      calendarView.createElement("span", {
        className: "calendar-entry-time",
        text: formatReminderTime(marker.reminder_at_utc),
      }),
      calendarView.createElement("span", { className: "calendar-entry-title", text: marker.title }),
    ],
  });

  row.addEventListener("click", () => openCalendarTask(marker.task_id, row));
  return row;
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

function groupByKey(rows, readKey) {
  const grouped = new Map();

  for (const row of rows) {
    const key = readKey(row);

    if (!key) {
      continue;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(row);
  }

  return grouped;
}

function dateKeyOf(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function listDayKeys(startDate, count) {
  const days = [];

  for (let index = 0; index < count; index += 1) {
    days.push(dateKeyOf(addDays(startDate, index)));
  }

  return days;
}

function formatFullDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDueTime(dueTime) {
  const [hours, minutes] = String(dueTime).split(":").map(Number);
  const probe = new Date();
  probe.setHours(hours || 0, minutes || 0, 0, 0);
  return probe.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatReminderTime(reminderAtUtc) {
  const date = new Date(reminderAtUtc);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
}

function formatToken(value) {
  const text = String(value || "").replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
