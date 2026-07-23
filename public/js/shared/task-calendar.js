// Shared read-only task-calendar helpers used by the Calendar host and the
// Dashboard calendar panel. This file owns the period range math, the bounded
// /api/tasks/calendar window fetch, and the grid/day rendering built on
// LongtailForge.view primitives; consumers own their own toolbar, filter, and
// status chrome. Load after view-builder.js.
(function attachTaskCalendar(global) {
  const root = global.LongtailForge = global.LongtailForge || {};
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const CALENDAR_VIEW_IDS = new Set(["day", "week", "month"]);
  const MONTH_TASK_LIMIT = 3;

  function viewBuilder() {
    return root.view;
  }

  function normalizeCalendarView(value) {
    return CALENDAR_VIEW_IDS.has(value) ? value : null;
  }

  function readPreferredCalendarView() {
    return normalizeCalendarView(root.userPreferences?.preferredCalendarView);
  }

  function resolveDefaultView(preferredView, options = {}) {
    const normalizedPreference = normalizeCalendarView(preferredView);

    if (normalizedPreference) {
      return normalizedPreference;
    }

    const isMobile = typeof options.isMobile === "boolean"
      ? options.isMobile
      : typeof global.matchMedia === "function" && global.matchMedia("(max-width: 700px)").matches;
    return isMobile ? "day" : "month";
  }

  function calendarRange(viewId, anchor) {
    if (viewId === "day") {
      const dayKey = dateKeyOf(anchor);
      return {
        fetchStart: dayKey,
        fetchEnd: dayKey,
        days: [dayKey],
        label: formatFullDate(anchor),
      };
    }

    if (viewId === "week") {
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

  async function fetchCalendarWindow(range, filters = {}) {
    const params = new URLSearchParams({ start: range.fetchStart, end: range.fetchEnd });

    if (filters.clientId) {
      params.set("clientId", filters.clientId);
    }

    if (filters.projectId) {
      params.set("projectId", filters.projectId);
    }

    const statuses = (Array.isArray(filters.statuses) ? filters.statuses : [filters.statuses])
      .flatMap((entry) => String(entry || "").split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (statuses.length) {
      params.set("statuses", [...new Set(statuses)].join(","));
    }

    const response = await fetch(`/api/tasks/calendar?${params.toString()}`, { cache: "no-store" });

    if (response.status === 403) {
      throw new Error("You do not have permission to view tasks.");
    }

    if (!response.ok) {
      throw new Error(`Could not load calendar data: ${response.status}`);
    }

    return response.json();
  }

  function renderCalendarBody(target, options = {}) {
    const view = viewBuilder();

    if (!target || !view) {
      return false;
    }

    const viewId = options.viewId || "month";
    const range = options.range;
    const onOpenTask = typeof options.onOpenTask === "function" ? options.onOpenTask : () => {};
    const tasksByDate = groupByKey(options.data?.tasks || [], (task) => task.due_date);
    const remindersByDate = groupByKey(options.data?.reminders || [], (marker) => marker.date);
    const children = [];

    if (viewId === "day") {
      children.push(createDayView(range.days[0], tasksByDate, remindersByDate, onOpenTask));
    } else {
      children.push(createWeekdayHeaderRow());
      children.push(createDayGrid(viewId, range, tasksByDate, remindersByDate, onOpenTask));
    }

    const hasEntries = range.days.some((dayKey) => (tasksByDate.get(dayKey) || []).length > 0
      || (remindersByDate.get(dayKey) || []).length > 0);

    if (!hasEntries) {
      children.push(view.createEmptyState({
        title: "Nothing scheduled",
        message: "No task due dates or reminders in this period.",
      }));
    }

    target.replaceChildren(...children);
    return hasEntries;
  }

  function createWeekdayHeaderRow() {
    const view = viewBuilder();
    return view.createElement("div", {
      className: "calendar-weekday-row",
      attrs: { "aria-hidden": "true" },
      children: WEEKDAY_LABELS.map((label) => view.createElement("div", {
        className: "calendar-weekday",
        text: label,
      })),
    });
  }

  function createDayGrid(viewId, range, tasksByDate, remindersByDate, onOpenTask) {
    const view = viewBuilder();
    const todayKey = dateKeyOf(new Date());
    const grid = view.createElement("div", {
      className: ["calendar-grid", viewId === "week" ? "calendar-grid--week" : "calendar-grid--month"],
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
        view.createElement("span", {
          className: ["calendar-day-number", isMonthGrid ? "u-hide-mobile" : ""],
          text: isMonthGrid
            ? String(dayDate.getDate())
            : dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          attrs: { "aria-label": formatFullDate(dayDate) },
        }),
      ];

      if (isMonthGrid) {
        headerChildren.push(view.createElement("span", {
          className: "calendar-day-date-long u-mobile-only",
          text: dayDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        }));
      }

      if (dayReminders.length > 0) {
        headerChildren.push(createReminderIndicator(dayReminders));
      }

      const visibleTasks = isMonthGrid ? dayTasks.slice(0, MONTH_TASK_LIMIT) : dayTasks;
      const entryChildren = visibleTasks.map((task) => createTaskEntry(task, onOpenTask));

      if (isMonthGrid && dayTasks.length > MONTH_TASK_LIMIT) {
        entryChildren.push(view.createElement("a", {
          className: "calendar-view-all-tasks",
          attrs: {
            href: `calendar.html?view=day&date=${dayKey}`,
          },
          text: "View all tasks",
        }));
      }

      grid.appendChild(view.createElement("section", {
        className: classNames,
        attrs: { "aria-label": formatFullDate(dayDate) },
        dataset: { calendarDay: dayKey },
        children: [
          view.createElement("div", {
            className: "calendar-day-header",
            children: headerChildren,
          }),
          view.createElement("div", {
            className: "calendar-day-entries",
            children: entryChildren,
          }),
        ],
      }));
    }

    return grid;
  }

  function createDayView(dayKey, tasksByDate, remindersByDate, onOpenTask) {
    const view = viewBuilder();
    const dayTasks = tasksByDate.get(dayKey) || [];
    const dayReminders = remindersByDate.get(dayKey) || [];
    const children = [];

    if (dayReminders.length > 0) {
      children.push(view.createElement("section", {
        className: "calendar-day-reminders",
        attrs: { "aria-label": "Reminders" },
        children: [
          view.createElement("h3", { className: "calendar-section-title", text: "Reminders" }),
          ...dayReminders.map((marker) => createReminderRow(marker, onOpenTask)),
        ],
      }));
    }

    children.push(view.createElement("section", {
      className: "calendar-day-tasks",
      attrs: { "aria-label": "Tasks due" },
      children: [
        view.createElement("h3", { className: "calendar-section-title", text: "Tasks due" }),
        view.createElement("div", {
          className: "calendar-day-entries",
          children: dayTasks.map((task) => createTaskEntry(task, onOpenTask, { showMeta: true })),
        }),
      ],
    }));

    return view.createElement("div", {
      className: "calendar-day-view",
      dataset: { calendarDay: dayKey },
      children,
    });
  }

  function createTaskEntry(task, onOpenTask, options = {}) {
    const view = viewBuilder();
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
      children.push(view.createElement("span", { className: "calendar-entry-time", text: timeLabel }));
    }

    children.push(view.createElement("span", { className: "calendar-entry-title", text: task.title }));

    if (options.showMeta) {
      const metaText = [formatToken(task.status), formatToken(task.priority), contextLabel].filter(Boolean).join(" - ");
      children.push(view.createElement("span", { className: "calendar-entry-meta", text: metaText }));
    }

    const entry = view.createElement("button", {
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

    entry.addEventListener("click", () => onOpenTask(task.task_id, entry));
    return entry;
  }

  function createReminderIndicator(reminders) {
    const view = viewBuilder();
    const summary = reminders
      .map((marker) => `${formatReminderTime(marker.reminder_at_utc)} ${marker.title}`)
      .join("\n");
    const indicator = view.createElement("span", {
      className: "calendar-reminder-indicator",
      attrs: {
        title: `Reminders:\n${summary}`,
        role: "img",
        "aria-label": `${reminders.length} reminder${reminders.length === 1 ? "" : "s"}`,
      },
    });
    const icons = root.icons;

    if (icons?.createIcon) {
      indicator.appendChild(icons.createIcon("bell", { size: 12 }));
    }

    indicator.appendChild(view.createElement("span", {
      className: "calendar-reminder-count",
      text: String(reminders.length),
    }));

    return indicator;
  }

  function createReminderRow(marker, onOpenTask) {
    const view = viewBuilder();
    const row = view.createElement("button", {
      className: "calendar-reminder-row",
      attrs: {
        type: "button",
        title: `Reminder for ${marker.title}`,
        "aria-label": `Open task: ${marker.title}`,
      },
      dataset: { calendarReminder: marker.task_id },
      children: [
        view.createElement("span", {
          className: "calendar-entry-time",
          text: formatReminderTime(marker.reminder_at_utc),
        }),
        view.createElement("span", { className: "calendar-entry-title", text: marker.title }),
      ],
    });

    row.addEventListener("click", () => onOpenTask(marker.task_id, row));
    return row;
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

  root.taskCalendar = Object.freeze({
    addDays,
    calendarRange,
    dateKeyOf,
    fetchCalendarWindow,
    normalizeCalendarView,
    parseDateKey,
    readPreferredCalendarView,
    renderCalendarBody,
    resolveDefaultView,
  });
})(window);
