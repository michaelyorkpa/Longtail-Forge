const TASK_FILTER_STORAGE_KEY = "lf_tasks_filters_v1";
const DEFAULT_TASK_VIEW = "my";
const QUICK_FILTERS = new Set(["my", "unassigned", "overdue", "today", "week", "complete", "archived"]);
const TASK_VIEW_VALUES = new Set(["all", ...QUICK_FILTERS]);
const view = window.LongtailForge?.view;
const TASK_LIFECYCLE_BEHAVIOR_HANDLERS = Object.freeze({
  "tasks.lifecycle.complete": ({ record }) => postTaskAction(record, "complete"),
  "tasks.lifecycle.reopen": ({ record }) => postTaskAction(record, "reopen"),
  "tasks.lifecycle.block": ({ action, record }) => updateTaskLifecycleStatus(record, action.statusPayload || { status: "blocked" }),
  "tasks.lifecycle.unblock": ({ action, record }) => updateTaskLifecycleStatus(record, action.statusPayload || { status: "open", blocked_reason: "" }),
  "tasks.lifecycle.archive": ({ record }) => postTaskAction(record, "archive"),
  "tasks.lifecycle.restore": ({ record }) => postTaskAction(record, "restore"),
});
const TASK_WORKFLOW_BEHAVIOR_HANDLERS = Object.freeze({
  "tasks.workflow.assign": ({ action, record, trigger }) => openTaskDialogForWorkflow(record, action, trigger),
  "tasks.workflow.due-date": ({ action, record, trigger }) => openTaskDialogForWorkflow(record, action, trigger),
  "tasks.workflow.due-time": ({ action, record, trigger }) => openTaskDialogForWorkflow(record, action, trigger),
  "tasks.workflow.recurrence": ({ action, record, trigger }) => openTaskDialogForWorkflow(record, action, trigger),
  "tasks.workflow.timer.start": ({ action, record }) => saveTaskTimerAction(record, action.timerStatus || "running"),
  "tasks.workflow.timer.pause": ({ action, record }) => saveTaskTimerAction(record, action.timerStatus || "paused"),
  "tasks.workflow.timer.resume": ({ action, record }) => saveTaskTimerAction(record, action.timerStatus || "running"),
});

let activeTasksViewDescriptor = null;
let state = {
  tasks: [],
  options: {
    clients: [],
    projects: [],
    users: [],
    workspaceType: "business",
    taskTimersEnabled: true,
    timeTrackingEnabled: true,
  },
  editingTaskId: "",
  currentUserId: "",
  quickFilter: DEFAULT_TASK_VIEW,
  selectedTaskIds: new Set(),
  attachmentCounts: {},
  noteCounts: {},
  taskTimers: [],
  tagOptions: [],
};
let hasLoadedTasks = false;

buildTasksViewShell();
window.LongtailForge.tasksDialog?.configure?.();

const taskStatus = document.querySelector("[data-task-status]");
const taskList = document.querySelector("[data-task-list]");
const addTaskButton = document.querySelector("[data-add-task]");
const taskDialog = document.querySelector("[data-task-dialog]");
const copyTaskLinkButton = document.querySelector("[data-copy-task-link]");
const taskViewSelector = document.querySelector("[data-task-view-selector]");
const sortInput = document.querySelector("[data-task-sort]");
const statusFilter = document.querySelector("[data-task-status-filter]");
const assigneeFilter = document.querySelector("[data-task-assignee-filter]");
const clientFilter = document.querySelector("[data-task-client-filter]");
const projectFilter = document.querySelector("[data-task-project-filter]");
const tagFilterControl = document.querySelector("[data-task-tag-filter-control]");
const tagFilter = document.querySelector("[data-task-tag-filter]");
const resetTaskFiltersButton = document.querySelector("[data-task-reset-filters]");
const selectAllInput = document.querySelector("[data-task-select-all]");
const bulkToolbar = document.querySelector("[data-task-bulk-toolbar]");
const bulkStatusControl = document.querySelector("[data-task-bulk-status-control]");
const bulkStatusInput = document.querySelector("[data-task-bulk-status]");
const bulkPriorityControl = document.querySelector("[data-task-bulk-priority-control]");
const bulkPriorityInput = document.querySelector("[data-task-bulk-priority]");
const bulkDueDateControl = document.querySelector("[data-task-bulk-due-date-control]");
const bulkDueDateInput = document.querySelector("[data-task-bulk-due-date]");
const bulkClearDueDateInput = document.querySelector("[data-task-bulk-clear-due-date]");
const bulkDueTimeControl = document.querySelector("[data-task-bulk-due-time-control]");
const bulkDueTimeInput = document.querySelector("[data-task-bulk-due-time]");
const bulkClearDueTimeInput = document.querySelector("[data-task-bulk-clear-due-time]");
const bulkAssigneeControl = document.querySelector("[data-task-bulk-assignee-control]");
const bulkAssigneesControl = document.querySelector("[data-task-bulk-assignees]");
const bulkTagActionControl = document.querySelector("[data-task-bulk-tag-action-control]");
const bulkTagActionInput = document.querySelector("[data-task-bulk-tag-action]");
const bulkTagsControl = document.querySelector("[data-task-bulk-tags-control]");
const bulkTagsInput = document.querySelector("[data-task-bulk-tags]");
const bulkLifecycleControl = document.querySelector("[data-task-bulk-lifecycle-control]");
const bulkLifecycleInput = document.querySelector("[data-task-bulk-lifecycle]");
const bulkApplyButton = document.querySelector("[data-task-bulk-apply]");
const bulkSelectionCount = document.querySelector("[data-task-bulk-selection-count]");
const recurringInput = document.querySelector("[data-task-recurring]");
const recurrenceDetailsButton = document.querySelector("[data-task-recurrence-details]");
const recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");

const api = window.LongtailForge.api;
const pageController = window.LongtailForge.pageController;
const modal = window.LongtailForge.modal;

addTaskButton?.addEventListener("click", () => openTaskDialog());
taskViewSelector?.addEventListener("change", handleTaskViewChange);
resetTaskFiltersButton?.addEventListener("click", resetAdvancedTaskFilters);
bulkStatusInput?.addEventListener("change", updateBulkControls);
bulkPriorityInput?.addEventListener("change", updateBulkControls);
bulkDueDateInput?.addEventListener("change", updateBulkControls);
bulkClearDueDateInput?.addEventListener("change", updateBulkControls);
bulkDueTimeInput?.addEventListener("change", updateBulkControls);
bulkClearDueTimeInput?.addEventListener("change", updateBulkControls);
bulkAssigneesControl?.addEventListener("change", updateBulkControls);
bulkTagActionInput?.addEventListener("change", updateBulkControls);
bulkTagsInput?.addEventListener("change", updateBulkControls);
bulkLifecycleInput?.addEventListener("change", updateBulkControls);
bulkApplyButton?.addEventListener("click", applyBulkAction);
selectAllInput?.addEventListener("change", toggleVisibleSelection);
[sortInput, statusFilter, assigneeFilter, clientFilter, projectFilter, tagFilter].forEach((input) => {
  input?.addEventListener("change", async () => {
    saveFilterState();
    await reloadTaskList();
  });
});

loadTasks();

function buildTasksViewShell() {
  const host = document.querySelector("[data-tasks-host]");
  if (!host || host.querySelector("[data-task-list]")) {
    return;
  }
  if (!view) {
    throw new Error("Tasks requires LongtailForge.view to build the protected workspace.");
  }

  registerTasksViewBehaviors();
  activeTasksViewDescriptor = tasksViewSurfaceDescriptor();
  const surface = view.renderSurface({ ...activeTasksViewDescriptor, dataSource: null, modals: [] }, host);
  decorateTasksDeclarativeSurface(surface);
}

function registerTasksViewBehaviors() {
  if (typeof view?.registerBehavior !== "function") {
    return;
  }
  view.registerBehavior("tasks.create", () => openTaskDialog());
  registerTaskLifecycleBehaviors();
  registerTaskWorkflowBehaviors();
  view.registerBehavior("tasks.sidebar.view-selector", ({ container }) => {
    container.replaceChildren(createTaskViewSelectorChrome());
  });
  view.registerBehavior("tasks.sidebar.filters", ({ container }) => {
    container.replaceChildren(createTaskFilterChrome());
  });
  view.registerBehavior("tasks.main.list", ({ container }) => {
    container.replaceChildren(createTaskMainListChrome());
  });
}

function registerTaskLifecycleBehaviors() {
  taskLifecycleActionStripDescriptor().actions.forEach((action) => {
    const handler = TASK_LIFECYCLE_BEHAVIOR_HANDLERS[action.behavior];
    if (handler) {
      view.registerBehavior(action.behavior, handler);
    }
  });
}

function registerTaskWorkflowBehaviors() {
  taskWorkflowActionMenuDescriptor().actions.forEach((action) => {
    const handler = TASK_WORKFLOW_BEHAVIOR_HANDLERS[action.behavior];
    if (handler) {
      view.registerBehavior(action.behavior, handler);
    }
  });
}

function tasksViewSurfaceDescriptor() {
  const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
  return surfaces.find((surface) => surface.id === "tasks.workspace" && surface.moduleId === "tasks")
    || fallbackTasksViewSurfaceDescriptor();
}

function fallbackTasksViewSurfaceDescriptor() {
  return {
    id: "tasks.workspace",
    moduleId: "tasks",
    viewId: "tasks",
    layout: "slide-out-sidebar",
    sidebarLabel: "Task filters",
    pageHeader: {
      title: "Tasks",
      primaryAction: {
        id: "create-task",
        label: "Add Task",
        role: "primary",
        behavior: "tasks.create",
      },
    },
    sidebarPanels: [
      {
        id: "tasks-view-selector",
        type: "navigation",
        title: "Saved Task Views",
        behavior: "tasks.sidebar.view-selector",
        collapsible: false,
        className: "tasks-view-selector-panel",
        ariaLabel: "Saved task views",
      },
      {
        id: "tasks-filters",
        type: "navigation",
        title: "Sorting and Filters",
        behavior: "tasks.sidebar.filters",
        open: false,
        className: "tasks-filters-panel",
        ariaLabel: "Sorting and task filters",
      },
    ],
    detail: {
      regions: [
        {
          id: "tasks-main-list",
          behavior: "tasks.main.list",
          className: "tasks-main-list-region",
          ariaLabel: "Task list",
        },
      ],
    },
    dataSource: {
      route: "/api/tasks",
      method: "GET",
      fieldBindings: {
        id: "task_id",
        title: "title",
        status: "status",
      },
    },
  };
}

function decorateTasksDeclarativeSurface(surface) {
  const createAction = surface.querySelector('[data-surface-action="tasks.create"], [data-surface-action="create-task"]');
  if (createAction) {
    createAction.dataset.addTask = "";
  }

  const main = surface.querySelector(".view-slideout-sidebar-main")
    || surface.querySelector(".view-sidebar-detail-primary")
    || surface.querySelector(".view-stacked-detail");
  if (main) {
    main.classList.add("tasks-main-list-panel");
    main.dataset.tasksMainPanel = "";
  }
}

function createTaskViewSelectorChrome() {
  return view.createElement("div", {
    className: "task-view-selector-control",
    attrs: { "data-task-view-selector-control": "" },
    children: view.createElement("select", {
      attrs: {
        "data-task-view-selector": "",
        "aria-label": "Saved Task Views",
      },
      children: taskOptions([
        ["my", "My Tasks", true],
        ["all", "All"],
        ["unassigned", "Unassigned"],
        ["overdue", "Overdue"],
        ["today", "Due Today"],
        ["week", "Due This Week"],
        ["complete", "Completed"],
        ["archived", "Archived"],
      ]),
    }),
  });
}

function createTaskFilterChrome() {
  return view.createElement("div", {
    className: "task-page-toolbar",
    attrs: {
      "data-task-filter-toolbar": "",
      "aria-label": "Sorting and task filters",
    },
    children: view.createElement("div", {
      className: "task-filter-grid",
      attrs: { "data-task-filter-details": "" },
      children: [
        taskControlLabel("Sort", taskSelect({ "data-task-sort": "" }, [
          ["due_asc", "Due Date", true],
          ["priority_desc", "Priority"],
          ["status_asc", "Status"],
          ["last_worked", "Last Worked"],
          ["context", "Project / Client"],
          ["newest", "Newest"],
          ["oldest", "Oldest"],
        ])),
        taskControlLabel("Status", taskSelect({ "data-task-status-filter": "" }, [
          ["active", "Active", true],
          ["open", "Open"],
          ["in_progress", "In Progress"],
          ["blocked", "Blocked"],
          ["complete", "Complete"],
          ["archived", "Archived"],
          ["all", "All"],
        ])),
        taskControlLabel("Assignee", taskSelect({ "data-task-assignee-filter": "" }, [
          ["all", "All assignees", true],
        ])),
        taskControlLabel("Client", taskSelect({ "data-task-client-filter": "" }, [
          ["all", "All clients", true],
        ]), { attrs: { "data-client-workspace-control": "" } }),
        taskControlLabel("Project", taskSelect({ "data-task-project-filter": "" }, [
          ["all", "All projects", true],
        ])),
        taskControlLabel("Tag", taskSelect({ "data-task-tag-filter": "" }, [
          ["all", "All tags", true],
        ]), {
          attrs: { "data-task-tag-filter-control": "" },
          hidden: true,
        }),
        view.createElement("div", {
          className: "task-filter-actions",
          children: view.createElement("button", {
            attrs: {
              type: "button",
              "data-task-reset-filters": "",
            },
            text: "Reset Filters",
          }),
        }),
      ],
    }),
  });
}

function createTaskMainListChrome() {
  if (typeof view?.createListShell !== "function") {
    throw new Error("Tasks list surface requires LongtailForge.view.createListShell.");
  }

  const selectAll = view.createElement("input", {
    attrs: {
      type: "checkbox",
      "data-task-select-all": "",
      "aria-label": "Select all visible tasks",
    },
  });
  const taskListBody = view.createElement("tbody", {
    attrs: { "data-task-list": "" },
  });
  const table = view.createElement("table", {
    className: "list-table task-table",
    children: [
      view.createElement("thead", {
        children: view.createElement("tr", {
          children: [
            view.createElement("th", { children: selectAll }),
            view.createElement("th", {
              attrs: {
                colspan: "6",
                "aria-label": "Task details",
              },
            }),
          ],
        }),
      }),
      taskListBody,
    ],
  });
  const list = view.createElement("div", {
    className: ["view-table-wrap", "list-table-wrap"],
    attrs: { "data-task-list-surface": "" },
    children: table,
  });

  return view.createListShell({
    className: "tasks-main-list-surface",
    attrs: { "data-task-main-list-surface": "" },
    toolbar: createTaskBulkToolbarChrome(),
    statusAttrs: { "data-task-status": "" },
    children: list,
  });
}

function createTaskBulkToolbarChrome() {
  if (typeof view?.createBulkActionToolbar !== "function") {
    throw new Error("Tasks bulk actions require LongtailForge.view.createBulkActionToolbar.");
  }

  return view.createBulkActionToolbar({
    label: "Bulk Actions",
    selectedCount: state.selectedTaskIds.size,
    className: "task-bulk-toolbar",
    bodyClassName: "task-bulk-grid",
    attrs: {
      "data-task-bulk-toolbar": "",
    },
    body: taskBulkToolbarControls(),
  });
}

function taskBulkToolbarControls() {
  return [
    taskControlLabel("Status", taskSelect({ "data-task-bulk-status": "" }, [
      ["", "-", true],
      ["open", "Open"],
      ["in_progress", "In Progress"],
      ["blocked", "Blocked"],
      ["complete", "Complete"],
    ]), { attrs: { "data-task-bulk-status-control": "" } }),
    taskControlLabel("Priority", taskSelect({ "data-task-bulk-priority": "" }, [
      ["", "-", true],
      ["low", "Low"],
      ["normal", "Normal"],
      ["high", "High"],
      ["urgent", "Urgent"],
    ]), { attrs: { "data-task-bulk-priority-control": "" } }),
    taskControlLabel("Due Date", [
      view.createElement("input", {
        attrs: {
          type: "date",
          "data-task-bulk-due-date": "",
        },
      }),
      taskCheckboxLine("Clear due date", { "data-task-bulk-clear-due-date": "" }),
    ], { attrs: { "data-task-bulk-due-date-control": "" } }),
    taskControlLabel("Due Time", [
      view.createElement("input", {
        attrs: {
          type: "time",
          "data-task-bulk-due-time": "",
        },
      }),
      taskCheckboxLine("Clear due time", { "data-task-bulk-clear-due-time": "" }),
    ], { attrs: { "data-task-bulk-due-time-control": "" } }),
    taskControlLabel("Assignees", view.createElement("div", {
      className: "task-bulk-assignee-list",
      attrs: { "data-task-bulk-assignees": "" },
    }), { attrs: { "data-task-bulk-assignee-control": "" } }),
    taskControlLabel("Tag Action", taskSelect({ "data-task-bulk-tag-action": "" }, [
      ["", "-", true],
      ["tag_add", "Add tags"],
      ["tag_remove", "Remove tags"],
      ["tag_replace", "Replace direct tags"],
    ]), {
      attrs: { "data-task-bulk-tag-action-control": "" },
      hidden: true,
    }),
    taskControlLabel("Tags", view.createElement("select", {
      attrs: {
        "data-task-bulk-tags": "",
        multiple: true,
        size: "4",
      },
    }), {
      attrs: { "data-task-bulk-tags-control": "" },
      hidden: true,
    }),
    taskControlLabel("Lifecycle", taskSelect({ "data-task-bulk-lifecycle": "" }, [
      ["", "-", true],
    ]), {
      attrs: { "data-task-bulk-lifecycle-control": "" },
      hidden: true,
    }),
    view.createElement("button", {
      attrs: {
        type: "button",
        "data-task-bulk-apply": "",
        disabled: true,
      },
      text: "Apply to 0",
    }),
  ];
}

function taskControlLabel(label, controls, options = {}) {
  return view.createElement("label", {
    className: options.className,
    attrs: options.attrs,
    hidden: options.hidden,
    children: [label, controls],
  });
}

function taskSelect(attrs, options = []) {
  return view.createElement("select", {
    attrs,
    children: taskOptions(options),
  });
}

function taskOptions(options = []) {
  return options.map(([value, label, selected = false]) => view.createElement("option", {
    attrs: {
      value,
      selected,
    },
    text: label,
  }));
}

function taskCheckboxLine(label, attrs = {}) {
  return view.createElement("span", {
    className: "checkbox-line",
    children: [
      view.createElement("input", {
        attrs: {
          type: "checkbox",
          ...attrs,
        },
      }),
      label,
    ],
  });
}

async function loadTasks() {
  setStatus("Loading tasks...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
    const tagOptions = await loadTagOptions();
    if (!hasLoadedTasks) {
      restoreFilterState();
    }
    const result = await loadCanonicalTasks();
    const timersResult = await loadTaskTimers();
    const [attachmentCounts, noteCounts] = await Promise.all([
      loadAttachmentCounts(result.tasks || []),
      loadNoteCounts(result.tasks || []),
    ]);
    state = {
      ...state,
      tasks: result.tasks || [],
      taskTimers: timersResult.timers || [],
      currentUserId: result.currentUserId || state.currentUserId,
      options: result.options || state.options,
      attachmentCounts,
      noteCounts,
      tagOptions,
    };
    populateFilters();
    configureTaskDialog();
    renderTasks();
    openTaskFromUrl();
    hasLoadedTasks = true;
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Tasks could not be loaded.", { isError: true });
  }
}

async function reloadTaskList() {
  if (!hasLoadedTasks) {
    return;
  }

  setStatus("Updating task list...");

  try {
    const result = await loadCanonicalTasks();
    const timersResult = await loadTaskTimers();
    const [attachmentCounts, noteCounts] = await Promise.all([
      loadAttachmentCounts(result.tasks || []),
      loadNoteCounts(result.tasks || []),
    ]);
    state = {
      ...state,
      tasks: result.tasks || [],
      taskTimers: timersResult.timers || [],
      currentUserId: result.currentUserId || state.currentUserId,
      options: result.options || state.options,
      attachmentCounts,
      noteCounts,
    };
    populateFilters();
    configureTaskDialog();
    renderTasks();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Tasks could not be loaded.", { isError: true });
  }
}

async function loadCanonicalTasks() {
  const query = buildTaskQuery();
  return api.getJson(query ? `/api/tasks?${query}` : "/api/tasks", { cache: "no-store" });
}

function buildTaskQuery() {
  const params = new URLSearchParams();
  const taskView = selectedTaskView();
  const statusValue = statusFilter?.value || "active";
  const assigneeValue = assigneeFilter?.value || "all";
  const clientValue = usesClientScope() ? clientFilter?.value || "all" : "all";
  const projectValue = projectFilter?.value || "all";
  const tagValue = tagFilter?.value || "all";

  params.set("task_view", canonicalTaskViewValue(taskView));
  params.set("status", canonicalStatusValue(statusValue));
  params.set("sort", canonicalSortValue(sortInput?.value || "due_asc"));

  if (assigneeValue === "me") {
    params.set("assignee", "me");
  } else if (assigneeValue === "unassigned") {
    params.set("assignee", "unassigned");
  } else if (assigneeValue !== "all") {
    params.set("assignee_id", assigneeValue);
  }

  if (clientValue !== "all") {
    params.set("client_id", clientValue);
  }

  if (projectValue !== "all") {
    params.set("project_id", projectValue);
  }

  if (tagValue !== "all") {
    params.set("tags", tagValue);
  }

  return params.toString();
}

function canonicalStatusValue(value) {
  if (value === "complete" || value === "archived" || value === "all") {
    return value;
  }

  return value || "active";
}

function canonicalTaskViewValue(value) {
  return {
    all: "all",
    my: "my",
    unassigned: "unassigned",
    overdue: "overdue",
    today: "today",
    week: "week",
    complete: "completed",
    archived: "archived",
  }[value] || value;
}

function canonicalSortValue(value) {
  return {
    due_asc: "due_at",
    priority_desc: "priority",
    status_asc: "status",
    newest: "created",
    oldest: "created_asc",
    last_worked: "last_worked",
    context: "context",
  }[value] || "due_at";
}

function populateFilters() {
  const workspaceScopeLabel = getWorkspaceScopeLabel();
  const hasClientScope = usesClientScope();

  replaceOptions(assigneeFilter, [
    option("all", "All assignees"),
    option("me", "Me"),
    option("unassigned", "Unassigned"),
    ...state.options.users.map((user) => option(user.user_id, displayUser(user))),
  ]);
  setClientScopeControlsVisible(hasClientScope);
  if (hasClientScope) {
    replaceOptions(clientFilter, [
      option("all", "All"),
      option("", workspaceScopeLabel),
      ...state.options.clients.map((client) => option(client.id, optionLabel(client))),
    ]);
  } else {
    replaceOptions(clientFilter, [option("all", "All")]);
  }
  replaceOptions(projectFilter, [
    option("all", "All Projects"),
    option("", "No project"),
    ...state.options.projects.map((project) => option(project.id, optionLabel(project))),
  ]);
  populateTagFilter();
  populateBulkTagOptions();
  renderBulkAssigneeOptions();
}

function populateTagFilter() {
  const tags = state.tagOptions || [];
  const previousValue = tagFilter?.value || "all";

  if (!tagFilter || !tagFilterControl) {
    return;
  }

  tagFilterControl.hidden = tags.length === 0;
  replaceOptions(tagFilter, [
    taskTagFilterAllOption(),
    taskTagFilterNoTagsOption(),
    ...tags.map((tag) => option(tag.tag_id, tag.name || tag.slug)),
  ]);
  tagFilter.value = previousValue === noTagsFilterValue() || previousValue === "__no_effective_tags__" || tags.some((tag) => tag.tag_id === previousValue) ? normalizeTagFilterValue(previousValue) : "all";
}

function taskTagFilterAllOption() {
  return option("all", "All tags");
}

function taskTagFilterNoTagsOption() {
  const shared = window.LongtailForge?.tags?.noTagsOption?.();
  if (shared) {
    return shared;
  }

  return option(noTagsFilterValue(), "No Tags");
}

function noTagsFilterValue() {
  return window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
}

function normalizeTagFilterValue(value) {
  return value === "__no_effective_tags__" ? noTagsFilterValue() : value;
}

function renderBulkAssigneeOptions() {
  if (!bulkAssigneesControl) {
    return;
  }

  const selectedIds = new Set(selectedBulkAssigneeIds());
  const controls = state.options.users.map((user) => {
    const labelText = displayUser(user);
    return view.createElement("label", {
      className: "task-bulk-assignee-option",
      children: [
        view.createElement("input", {
          attrs: {
            type: "checkbox",
            value: user.user_id,
            checked: selectedIds.has(user.user_id),
          },
        }),
        view.createElement("span", {
          className: "task-bulk-assignee-name",
          attrs: { title: labelText },
          text: labelText,
        }),
      ],
    });
  });

  bulkAssigneesControl.replaceChildren(...controls);
}

function populateBulkTagOptions() {
  if (!bulkTagsInput || !bulkTagActionControl || !bulkTagsControl) {
    return;
  }

  const tags = state.tagOptions || [];
  const selectedIds = new Set(selectedBulkTagIds());
  bulkTagActionControl.hidden = tags.length === 0;
  bulkTagsControl.hidden = tags.length === 0;
  bulkTagsInput.replaceChildren(...tags.map((tag) => {
    const entry = option(tag.tag_id, tag.name || tag.slug);
    entry.selected = selectedIds.has(tag.tag_id);
    return entry;
  }));
}

function renderTasks() {
  const tasks = state.tasks;

  syncSelectionToTasks(tasks);
  updateTaskViewSelectorState();
  updateBulkControls();
  taskList.replaceChildren();

  if (tasks.length === 0) {
    taskList.appendChild(view.createElement("tr", {
      children: view.createElement("td", {
        attrs: { colspan: "7" },
        text: emptyTaskMessage(),
      }),
    }));
    updateSelectionControls(tasks);
    return;
  }

  tasks.forEach((task) => taskList.append(...createTaskRow(task)));
  updateSelectionControls(tasks);
}

function emptyTaskMessage() {
  if (state.quickFilter === "my") {
    return "No tasks are assigned to you for the current filters.";
  }

  if (state.quickFilter === "unassigned") {
    return "No unassigned tasks match the current filters.";
  }

  if (state.quickFilter === "overdue") {
    return "No overdue tasks need recovery right now.";
  }

  if (state.quickFilter === "today") {
    return "No tasks are due today for the current filters.";
  }

  if (state.quickFilter === "week") {
    return "No tasks are due this week for the current filters.";
  }

  if (state.quickFilter === "complete") {
    return "No completed tasks match the current filters.";
  }

  if (state.quickFilter === "archived") {
    return "No archived tasks match the current filters.";
  }

  return "No tasks match the current filters.";
}

function createTaskRow(task) {
  const row = document.createElement("tr");
  const selectCell = document.createElement("td");
  const contentCell = document.createElement("td");
  const checkbox = document.createElement("input");
  const titleButton = document.createElement("button");
  const titleBand = document.createElement("div");
  const titleWrap = document.createElement("div");
  const metaBand = document.createElement("div");
  const actionsBand = document.createElement("div");

  row.dataset.taskStatus = task.status || "open";
  row.classList.add("task-density-row");
  row.classList.toggle("is-task-complete", task.status === "complete");
  row.classList.toggle("is-task-archived", task.status === "archived");

  checkbox.type = "checkbox";
  checkbox.value = task.task_id;
  checkbox.checked = state.selectedTaskIds.has(task.task_id);
  checkbox.setAttribute("aria-label", `Select ${task.title}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedTaskIds.add(task.task_id);
    } else {
      state.selectedTaskIds.delete(task.task_id);
    }
    updateBulkControls();
    updateSelectionControls(state.tasks);
  });
  selectCell.appendChild(checkbox);

  titleButton.type = "button";
  titleButton.className = "link-button";
  titleButton.textContent = task.title;
  titleButton.addEventListener("click", () => openTaskDialog(task));
  titleWrap.className = "task-title-wrap";
  titleWrap.appendChild(titleButton);
  appendAttachmentCount(titleWrap, task);
  appendNoteCount(titleWrap, task);

  titleBand.className = "task-density-title";
  titleBand.appendChild(titleWrap);
  appendTagChips(titleBand, task.tags);

  metaBand.className = "task-density-meta";
  appendTaskMetadata(metaBand, task);
  appendTaskContext(metaBand, task);

  actionsBand.className = "task-density-actions";
  actionsBand.appendChild(createActions(task));

  contentCell.colSpan = 6;
  contentCell.className = "task-density-cell";
  contentCell.append(titleBand, metaBand, actionsBand);
  row.append(selectCell, contentCell);
  return [row];
}

function createActions(task) {
  const wrap = document.createElement("div");
  const editButton = actionButton("Edit", () => openTaskDialog(task));
  const duplicateButton = actionButton("Duplicate", () => duplicateTask(task));
  const copyButton = actionButton("Copy Link", () => copyTaskLink(task));
  const followButton = actionButton("Follow Notifications", () => followTaskNotifications(task), {
    icon: "bell",
    title: "Follow notifications",
  });

  wrap.className = "task-row-actions";
  wrap.append(editButton, duplicateButton, copyButton, followButton, createTaskWorkflowActionMenu(task), createTaskLifecycleActionStrip(task));
  return wrap;
}

function createTaskWorkflowActionMenu(task) {
  const actions = taskWorkflowActionsForTask(task).map((action) => taskWorkflowActionButton(action, task));

  if (actions.length === 0) {
    return document.createDocumentFragment();
  }

  if (typeof view?.createDetailActionMenu === "function") {
    return view.createDetailActionMenu({
      ariaLabel: "Task workflow actions",
      className: "task-row-workflow-actions",
      summaryLabel: "...",
      title: "Task workflow actions",
      floating: true,
      actions,
    });
  }

  const fallback = document.createElement("div");
  fallback.className = "task-row-workflow-actions";
  fallback.append(...actions);
  return fallback;
}

function taskWorkflowActionsForTask(task) {
  const actions = taskWorkflowActionMenuDescriptor().actions || [];
  return actions.filter((action) => taskWorkflowActionVisible(action, task));
}

function taskWorkflowActionMenuDescriptor() {
  return {
    label: "Task workflow actions",
    actions: [
      {
        id: "assign-task",
        label: "Assign",
        icon: "edit",
        role: "secondary",
        behavior: "tasks.workflow.assign",
        focusTarget: "assignees",
        requiredPermissions: ["tasks.assign"],
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
      },
      {
        id: "change-task-due-date",
        label: "Due Date",
        icon: "edit",
        role: "secondary",
        behavior: "tasks.workflow.due-date",
        focusTarget: "due_date",
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
      },
      {
        id: "change-task-due-time",
        label: "Due Time",
        icon: "edit",
        role: "secondary",
        behavior: "tasks.workflow.due-time",
        focusTarget: "due_time",
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
      },
      {
        id: "apply-task-recurrence",
        label: "Recurrence",
        icon: "refresh",
        role: "secondary",
        behavior: "tasks.workflow.recurrence",
        focusTarget: "recurrence",
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
      },
      {
        id: "start-task-timer",
        label: "Start Timer",
        icon: "start",
        role: "secondary",
        behavior: "tasks.workflow.timer.start",
        timerStatus: "running",
        timerVisibility: "none",
        requiredPermissions: ["tasks.view", "time_entries.create"],
        visibleStatuses: ["open", "in_progress", "blocked"],
      },
      {
        id: "pause-task-timer",
        label: "Pause Timer",
        icon: "pause",
        role: "secondary",
        behavior: "tasks.workflow.timer.pause",
        timerStatus: "paused",
        timerVisibility: "running",
        requiredPermissions: ["tasks.view", "time_entries.create"],
        visibleStatuses: ["open", "in_progress", "blocked"],
      },
      {
        id: "resume-task-timer",
        label: "Resume Timer",
        icon: "start",
        role: "secondary",
        behavior: "tasks.workflow.timer.resume",
        timerStatus: "running",
        timerVisibility: "paused",
        requiredPermissions: ["tasks.view", "time_entries.create"],
        visibleStatuses: ["open", "in_progress", "blocked"],
      },
    ],
  };
}

function taskWorkflowActionVisible(action, task) {
  const visibleStatuses = action.visibleStatuses || [];
  if (visibleStatuses.length > 0 && !visibleStatuses.includes(task.status || "open")) {
    return false;
  }

  const timer = taskTimerForTask(task);
  if (action.timerVisibility === "none") {
    return !timer;
  }
  if (action.timerVisibility === "running") {
    return timer?.timer_status === "running";
  }
  if (action.timerVisibility === "paused") {
    return Boolean(timer && timer.timer_status !== "running");
  }

  return true;
}

function taskWorkflowActionButton(action, task) {
  const disabledReason = taskWorkflowDisabledReason(action, task);
  const options = {
    label: action.label,
    title: disabledReason || action.title || action.label,
    icon: action.icon,
    text: action.label,
    iconOnly: false,
    variant: action.variant,
    role: action.role,
    action: action.behavior || action.id,
    disabled: Boolean(disabledReason),
    onClick: (event) => runTaskWorkflowAction(action, task, event?.currentTarget || null),
  };
  const button = typeof view?.createActionButton === "function"
    ? view.createActionButton(options)
    : actionButton(action.label, options.onClick, { icon: action.icon, title: options.title });

  button.dataset.taskWorkflowAction = action.id;
  button.dataset.taskWorkflowBehavior = action.behavior || "";
  button.dataset.taskId = task.task_id || "";
  if (disabledReason) {
    button.disabled = true;
  }
  return button;
}

function taskWorkflowDisabledReason(action, task) {
  if (!task?.task_id) {
    return "Task action is unavailable.";
  }
  if (!hasTaskWorkflowPermission(action, task)) {
    return "You do not have permission to run this action.";
  }
  if (action.timerStatus) {
    return taskTimerDisabledReason(action, task);
  }
  return "";
}

function hasTaskWorkflowPermission(action, task) {
  const permissions = workspacePermissionSet();
  if (!permissions) {
    return true;
  }

  const requiredPermissions = Array.isArray(action.requiredPermissions) ? action.requiredPermissions : [];
  if (requiredPermissions.some((permissionId) => !permissionAllowsTaskAction(permissions, permissionId, task))) {
    return false;
  }

  const requiredAnyPermissions = Array.isArray(action.requiredAnyPermissions) ? action.requiredAnyPermissions : [];
  if (requiredAnyPermissions.length > 0 && !requiredAnyPermissions.some((permissionId) => permissionAllowsTaskAction(permissions, permissionId, task))) {
    return false;
  }

  return true;
}

function taskTimerDisabledReason(action, task) {
  const timer = taskTimerForTask(task);
  if (state.options.taskTimersEnabled === false) {
    return "Task timers are disabled.";
  }
  if (state.options.timeTrackingEnabled === false) {
    return "Time Tracking is disabled.";
  }
  if (!task.project_id) {
    return "Task timers require a project-linked task.";
  }
  if (task.status === "complete" || task.status === "archived") {
    return "Completed and archived tasks cannot use task timers.";
  }
  if (action.timerVisibility === "running" && timer?.timer_status !== "running") {
    return "No running task timer.";
  }
  if (action.timerVisibility === "paused" && (!timer || timer.timer_status === "running")) {
    return "No paused task timer.";
  }
  return "";
}

function createTaskLifecycleActionStrip(task) {
  const actions = taskLifecycleActionsForTask(task).map((action) => taskLifecycleActionButton(action, task));

  if (typeof view?.createDetailActionStrip === "function") {
    return view.createDetailActionStrip({
      ariaLabel: "Task lifecycle actions",
      className: "task-row-lifecycle-actions",
      actions,
    });
  }

  const fallback = document.createElement("div");
  fallback.className = "task-row-lifecycle-actions";
  fallback.append(...actions);
  return fallback;
}

function taskLifecycleActionsForTask(task) {
  const actions = taskLifecycleActionStripDescriptor().actions || [];
  return actions.filter((action) => taskLifecycleActionVisible(action, task));
}

function taskLifecycleActionStripDescriptor() {
  return {
    label: "Task lifecycle actions",
    actions: [
      {
        id: "complete-task",
        label: "Complete",
        icon: "complete",
        role: "secondary",
        behavior: "tasks.lifecycle.complete",
        requiredPermissions: ["tasks.complete"],
        visibleStatuses: ["open", "in_progress", "blocked"],
      },
      {
        id: "reopen-task",
        label: "Reopen",
        icon: "restore",
        role: "secondary",
        behavior: "tasks.lifecycle.reopen",
        requiredPermissions: ["tasks.complete"],
        visibleStatuses: ["complete"],
      },
      {
        id: "block-task",
        label: "Block",
        icon: "pause",
        role: "secondary",
        behavior: "tasks.lifecycle.block",
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
        statusPayload: { status: "blocked" },
        visibleStatuses: ["open", "in_progress"],
      },
      {
        id: "unblock-task",
        label: "Unblock",
        icon: "restore",
        role: "secondary",
        behavior: "tasks.lifecycle.unblock",
        requiredAnyPermissions: ["tasks.edit_all", "tasks.edit_own"],
        statusPayload: { status: "open", blocked_reason: "" },
        visibleStatuses: ["blocked"],
      },
      {
        id: "archive-task",
        label: "Archive",
        icon: "archive",
        role: "destructive",
        variant: "danger",
        behavior: "tasks.lifecycle.archive",
        requiredPermissions: ["tasks.archive"],
        visibleStatuses: ["open", "in_progress", "blocked", "complete"],
        confirm: {
          title: "Archive task",
          confirmLabel: "Archive",
          danger: true,
          message: (taskRecord) => `Archive "${taskRecord.title}"?`,
        },
      },
      {
        id: "restore-task",
        label: "Restore",
        icon: "restore",
        role: "secondary",
        behavior: "tasks.lifecycle.restore",
        requiredPermissions: ["tasks.restore"],
        visibleStatuses: ["archived"],
      },
    ],
  };
}

function taskLifecycleActionVisible(action, task) {
  const visibleStatuses = action.visibleStatuses || [];
  if (visibleStatuses.length === 0) {
    return true;
  }
  return visibleStatuses.includes(task.status || "open");
}

function taskLifecycleActionButton(action, task) {
  const disabledReason = taskLifecycleDisabledReason(action, task);
  const options = {
    label: action.label,
    title: disabledReason || action.title || action.label,
    icon: action.icon,
    text: "",
    iconOnly: true,
    variant: action.variant,
    role: action.role,
    action: action.behavior || action.id,
    disabled: Boolean(disabledReason),
    onClick: () => runTaskLifecycleAction(action, task),
  };
  const button = typeof view?.createActionButton === "function"
    ? view.createActionButton(options)
    : actionButton(action.label, options.onClick, { icon: action.icon, title: options.title });

  button.dataset.taskLifecycleAction = action.id;
  button.dataset.taskLifecycleBehavior = action.behavior || "";
  button.dataset.taskId = task.task_id || "";
  if (disabledReason) {
    button.disabled = true;
  }
  return button;
}

function taskLifecycleDisabledReason(action, task) {
  if (!task?.task_id) {
    return "Task action is unavailable.";
  }
  if (!hasTaskLifecyclePermission(action, task)) {
    return "You do not have permission to run this action.";
  }
  return "";
}

function hasTaskLifecyclePermission(action, task) {
  const permissions = workspacePermissionSet();
  if (!permissions) {
    return true;
  }

  const requiredPermissions = Array.isArray(action.requiredPermissions) ? action.requiredPermissions : [];
  if (requiredPermissions.some((permissionId) => !permissionAllowsTaskAction(permissions, permissionId, task))) {
    return false;
  }

  const requiredAnyPermissions = Array.isArray(action.requiredAnyPermissions) ? action.requiredAnyPermissions : [];
  if (requiredAnyPermissions.length > 0 && !requiredAnyPermissions.some((permissionId) => permissionAllowsTaskAction(permissions, permissionId, task))) {
    return false;
  }

  return true;
}

function workspacePermissionSet() {
  const rawPermissions = window.LongtailForge?.workspaceContext?.permissionIds ||
    window.LongtailForge?.workspaceContext?.permissions;
  if (!Array.isArray(rawPermissions)) {
    return null;
  }
  const permissionIds = rawPermissions
    .map((permission) => typeof permission === "string" ? permission : permission?.permissionId || permission?.permission_id || permission?.id)
    .filter(Boolean);
  return new Set(permissionIds);
}

function permissionAllowsTaskAction(permissions, permissionId, task) {
  if (!permissions.has(permissionId)) {
    return false;
  }
  if (permissionId === "tasks.edit_own") {
    return isOwnTask(task);
  }
  return true;
}

function isOwnTask(task) {
  const userId = currentUserId();
  return Boolean(userId && (
    task.created_by_user_id === userId ||
    (task.assignee_ids || []).includes(userId)
  ));
}

async function runTaskLifecycleAction(action, task) {
  const handler = TASK_LIFECYCLE_BEHAVIOR_HANDLERS[action.behavior];
  if (!handler) {
    setStatus(`Missing task lifecycle behavior: ${action.behavior}`, { isError: true });
    return;
  }
  if (action.confirm && !await confirmTaskLifecycleAction(action, task)) {
    return;
  }

  await handler({
    action,
    api,
    record: task,
    refresh: reloadTaskList,
    workspaceContext: window.LongtailForge?.workspaceContext || {},
  });
}

async function runTaskWorkflowAction(action, task, trigger = null) {
  const handler = TASK_WORKFLOW_BEHAVIOR_HANDLERS[action.behavior];
  if (!handler) {
    setStatus(`Missing task workflow behavior: ${action.behavior}`, { isError: true });
    return;
  }

  await handler({
    action,
    api,
    record: task,
    refresh: reloadTaskList,
    trigger,
    workspaceContext: window.LongtailForge?.workspaceContext || {},
  });
}

function openTaskDialogForWorkflow(task, action, trigger = null) {
  if (!task?.task_id) {
    setStatus("Task action is unavailable.", { isError: true });
    return null;
  }

  return openTaskDialog(task, {
    focusTarget: action.focusTarget || "",
    returnFocusTo: trigger || document.activeElement,
  });
}

async function saveTaskTimerAction(task, timerStatus) {
  if (!task?.task_id) {
    setStatus("Task timer action is unavailable.", { isError: true });
    return;
  }

  const timer = taskTimerForTask(task);
  const elapsedSeconds = readTaskTimerElapsedSeconds(timer);
  const isRunning = timerStatus === "running";
  const verb = isRunning ? (timer ? "Resuming" : "Starting") : "Pausing";

  setStatus(`${verb} task timer...`);

  try {
    const result = await api.putJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer`, {
      active_task_timer_id: timer?.active_task_timer_id || timer?.active_timer_id || "",
      timer_status: isRunning ? "running" : "paused",
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: new Date().toISOString(),
    });
    if (result.timer) {
      upsertTaskTimerState(result.timer);
    }
    await reloadTaskList();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task timer action failed.", { isError: true });
  }
}

function taskTimerForTask(task) {
  return state.taskTimers.find((timer) => timer.task_id === task?.task_id);
}

function upsertTaskTimerState(timer) {
  const existingIndex = state.taskTimers.findIndex((item) => item.task_id === timer.task_id);
  state.taskTimers = state.taskTimers.map((item) =>
    item.timer_status === "running" && item.task_id !== timer.task_id
      ? { ...item, timer_status: "paused", last_active_start_time: null }
      : item,
  );

  if (existingIndex >= 0) {
    state.taskTimers.splice(existingIndex, 1, timer);
  } else {
    state.taskTimers.push(timer);
  }
}

function readTaskTimerElapsedSeconds(timer) {
  if (!timer) {
    return 0;
  }

  const baseSeconds = Number.parseInt(timer.accumulated_elapsed_seconds, 10) || 0;
  if (timer.timer_status !== "running" || !timer.last_active_start_time) {
    return baseSeconds;
  }

  const startedAt = new Date(timer.last_active_start_time).getTime();
  if (!Number.isFinite(startedAt)) {
    return baseSeconds;
  }

  return baseSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function appendTaskMetadata(container, task) {
  const assigneeText = task.assignees?.length
    ? task.assignees.map(displayUser).join(", ")
    : "Unassigned";
  const items = [
    { label: "Scope", value: formatScope(task), className: "task-scope-cell" },
    { label: "Assignees", value: assigneeText, className: "task-assignee-cell" },
    { label: "Status", value: formatToken(task.status) },
    { label: "Priority", value: formatToken(task.priority) },
    { label: "Due", value: formatDue(task) },
  ];

  items.forEach((item) => {
    const node = document.createElement("span");
    node.className = ["task-meta-item", item.className].filter(Boolean).join(" ");
    node.textContent = `${item.label}: ${item.value}`;
    node.title = `${item.label}: ${item.value}`;
    container.appendChild(node);
  });
}

function appendTaskContext(container, task) {
  const chips = [];

  if (task.next_action) {
    chips.push({ label: "Next", value: task.next_action, className: "is-next" });
  }

  if (task.status === "blocked" && task.blocked_reason) {
    chips.push({ label: "Blocked", value: task.blocked_reason, className: "is-blocked" });
  }

  const checklistText = checklistProgressText(task.checklistProgress);
  if (checklistText) {
    chips.push({ label: "Checklist", value: checklistText, className: "is-progress" });
  }

  const blockingText = blockingSummaryText(task.relationshipSummary);
  if (blockingText) {
    chips.push({ label: "Blocking", value: blockingText, className: "is-blocked" });
  }

  if (task.resume_note) {
    chips.push({ label: "Resume", value: "Note saved", title: task.resume_note, className: "is-resume" });
  }

  if (chips.length === 0) {
    return;
  }

  const summary = typeof view?.createDetailBadgeRow === "function"
    ? view.createDetailBadgeRow({
        ariaLabel: "Task context",
        className: "task-context-summary",
        badges: chips.map(taskContextBadge),
      })
    : taskContextSummaryFallback(chips);
  container.appendChild(summary);
}

function taskContextBadge(chip) {
  return {
    className: ["task-context-chip", chip.className],
    label: chip.label,
    title: chip.title || `${chip.label}: ${chip.value}`,
    value: chip.value,
  };
}

function taskContextSummaryFallback(chips) {
  const summary = document.createElement("div");

  summary.className = "task-context-summary";
  chips.forEach((chip) => {
    const node = document.createElement("span");
    node.className = ["task-context-chip", chip.className].filter(Boolean).join(" ");
    node.textContent = `${chip.label}: ${chip.value}`;
    node.title = chip.title || `${chip.label}: ${chip.value}`;
    summary.appendChild(node);
  });
  return summary;
}

function actionButton(label, handler, options = {}) {
  const button = window.LongtailForge.icons?.createIconButton
    ? window.LongtailForge.icons.createIconButton({
      icon: options.icon || taskActionIcon(label),
      label,
      title: options.title || label,
      variant: label === "Archive" ? "danger" : "",
    })
    : document.createElement("button");

  button.type = "button";
  if (!window.LongtailForge.icons?.createIconButton) {
    button.textContent = label;
  }
  button.addEventListener("click", handler);
  return button;
}

function taskActionIcon(label) {
  return {
    Archive: "archive",
    Complete: "complete",
    "Copy Link": "copy",
    Duplicate: "duplicate",
    Edit: "edit",
    "Follow Notifications": "bell",
    Block: "pause",
    Reopen: "restore",
    Restore: "restore",
    Unblock: "restore",
  }[label] || "more";
}

function checklistProgressText(progress = {}) {
  const total = Number(progress.total_count) || 0;

  if (total <= 0) {
    return "";
  }

  const completed = Number(progress.completed_count) || 0;
  const next = progress.next_incomplete_item_label ? `, next: ${progress.next_incomplete_item_label}` : "";
  return `${completed}/${total}${next}`;
}

function blockingSummaryText(summary = {}) {
  const blockers = Number(summary.incomplete_blocking_child_count) || 0;

  if (blockers <= 0) {
    return "";
  }

  return `${blockers} child${blockers === 1 ? "" : "ren"}`;
}

async function loadAttachmentCounts(tasks) {
  const targetIds = tasks.map((task) => task.task_id).filter(Boolean);

  if (targetIds.length === 0) {
    return {};
  }

  try {
    const result = await api.getJson(`/api/files/attachments/counts?${new URLSearchParams({
      moduleId: "tasks",
      targetType: "task",
      targetIds: targetIds.join(","),
    }).toString()}`, { cache: "no-store" });

    return result.counts || {};
  } catch {
    return {};
  }
}

async function loadNoteCounts(tasks) {
  const counts = {};

  await Promise.all(tasks.map(async (task) => {
    if (!task.task_id) {
      return;
    }
    try {
      const result = await api.getJson(`/api/notes/for-target?${new URLSearchParams({
        moduleId: "tasks",
        targetType: "task",
        targetId: task.task_id,
      }).toString()}`, { cache: "no-store" });
      counts[task.task_id] = Number(result.count) || 0;
    } catch {
      counts[task.task_id] = 0;
    }
  }));

  return counts;
}

function appendAttachmentCount(target, task) {
  const count = Number(state.attachmentCounts[task.task_id] || 0);

  if (count <= 0) {
    return;
  }

  const chip = document.createElement("span");

  chip.className = "task-attachment-count";
  chip.textContent = `${count} file${count === 1 ? "" : "s"}`;
  target.appendChild(chip);
}

function appendNoteCount(target, task) {
  const count = Number(state.noteCounts[task.task_id] || 0);

  if (count <= 0) {
    return;
  }

  const chip = document.createElement("button");

  chip.type = "button";
  chip.className = "task-note-count";
  chip.textContent = `${count} note${count === 1 ? "" : "s"}`;
  chip.title = "Open task notes";
  chip.addEventListener("click", () => openTaskDialog(task, { focusNotes: true }));
  target.appendChild(chip);
}

async function followTaskNotifications(task) {
  if (!window.LongtailForge.notificationSubscriptions) {
    setStatus("Notification following is unavailable.", { isError: true });
    return;
  }

  setStatus("Following task notifications...");

  try {
    await window.LongtailForge.notificationSubscriptions.follow(
      window.LongtailForge.notificationSubscriptions.taskTarget(task.task_id),
    );
    setStatus("Task notifications followed.");
  } catch (error) {
    setStatus(error.message || "Task notifications were not followed.", { isError: true });
  }
}

async function confirmTaskLifecycleAction(action, task) {
  const confirmOptions = typeof action.confirm === "object" ? action.confirm : {};
  const message = typeof confirmOptions.message === "function"
    ? confirmOptions.message(task)
    : confirmOptions.message || `Continue with ${action.label || action.id}?`;
  if (modal?.confirm) {
    return modal.confirm({
      title: confirmOptions.title || action.label || "Confirm task action",
      message,
      confirmLabel: confirmOptions.confirmLabel || action.label || "Continue",
      danger: confirmOptions.danger === true || action.role === "destructive",
    });
  }
  if (typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return true;
}

async function postTaskAction(task, action) {
  setStatus(`${formatToken(action)} task...`);

  try {
    const result = await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/${action}`, {});
    upsertTask(result.task);
    if (result.createdTask) {
      upsertTask(result.createdTask);
      setStatus(`Created next recurring task: ${result.createdTask.title}`);
    }
    await reloadTaskList();
    if (!result.createdTask) {
      setStatus("");
    }
  } catch (error) {
    setStatus(error.message || "Task action failed.", { isError: true });
  }
}

async function updateTaskLifecycleStatus(task, payload) {
  setStatus(`${formatToken(payload.status)} task...`);

  try {
    const result = await api.putJson(`/api/tasks/${encodeURIComponent(task.task_id)}`, payload);
    upsertTask(result.task);
    await reloadTaskList();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task action failed.", { isError: true });
  }
}

function duplicateTask(task) {
  openTaskDialog(task, { duplicate: true });
}

function openTaskDialog(task = null, options = {}) {
  state.editingTaskId = options.duplicate === true ? "" : task?.task_id || "";
  configureTaskDialog();
  return window.LongtailForge.tasksDialog.openTaskEditor({
    defaults: options.defaults || {},
    duplicate: options.duplicate === true,
    focusNotes: options.focusNotes === true,
    focusTarget: options.focusTarget || "",
    mode: task && options.duplicate !== true ? "edit" : "add",
    returnFocusTo: options.returnFocusTo || document.activeElement,
    task,
  }, options.hostContext || null);
}

function configureTaskDialog() {
  window.LongtailForge.tasksDialog?.configure?.({
    currentUserId: currentUserId(),
    onSaved: async (result) => {
      if (result.task) {
        upsertTask(result.task);
      }
      await reloadTaskList();
    },
    onAttachmentsChanged: refreshTaskAttachmentCounts,
    onAttachmentsRefreshed: refreshTaskAttachmentCounts,
    onNotesChanged: refreshTaskNoteCounts,
    options: state.options,
    setStatus,
    tagOptions: state.tagOptions,
    taskTimers: state.taskTimers,
    tasks: state.tasks,
  });
}

async function refreshTaskAttachmentCounts() {
  state.attachmentCounts = await loadAttachmentCounts(state.tasks);
  renderTasks();
}

async function refreshTaskNoteCounts() {
  state.noteCounts = await loadNoteCounts(state.tasks);
  renderTasks();
}

async function loadTaskTimers() {
  try {
    return await api.getJson("/api/tasks/timers", { cache: "no-store" });
  } catch {
    return { timers: [] };
  }
}

async function loadTagOptions() {
  if (!window.LongtailForge.tags?.loadTags) {
    return [];
  }

  try {
    return await window.LongtailForge.tags.loadTags();
  } catch {
    return [];
  }
}

function appendTagChips(container, tags) {
  if (!container || !window.LongtailForge.tags?.renderTagList || !Array.isArray(tags) || tags.length === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "tag-chip-list";
  window.LongtailForge.tags.renderTagList(list, tags);
  container.appendChild(list);
}

async function applyBulkAction() {
  const taskIds = [...state.selectedTaskIds];
  const actions = selectedBulkActions(taskIds);

  if (actions.length === 0) {
    return;
  }

  if (!await confirmMixedBulkActions(actions, taskIds)) {
    return;
  }

  setStatus("Updating selected tasks...");

  try {
    const results = [];
    const errors = [];

    for (const payload of actions) {
      const result = await api.postJson("/api/tasks/bulk", payload);
      results.push(...(result.tasks || []));
      errors.push(...(result.errors || []));
    }

    results.forEach(upsertTask);
    state.selectedTaskIds.clear();
    resetBulkInputs();
    await reloadTaskList();
    if (errors.length) {
      const firstError = errors[0]?.message ? ` ${errors[0].message}` : "";
      setStatus(`Updated ${results.length} task changes. ${errors.length} changes could not be updated.${firstError}`, {
        isError: results.length === 0,
      });
    } else {
      setStatus(`Updated ${results.length} task changes.`);
    }
  } catch (error) {
    setStatus(error.message || "Selected tasks were not updated.", { isError: true });
  }
}

function updateBulkControls() {
  const taskIds = [...state.selectedTaskIds];
  const selectedCount = taskIds.length;

  updateBulkToolbarSummary(selectedCount);
  updateBulkLifecycleOptions(taskIds);
  const hasSelectedAction = selectedBulkActions(taskIds).length > 0;
  bulkStatusControl?.removeAttribute("hidden");
  bulkPriorityControl?.removeAttribute("hidden");
  bulkDueDateControl?.removeAttribute("hidden");
  bulkDueTimeControl?.removeAttribute("hidden");
  bulkAssigneeControl?.removeAttribute("hidden");
  syncBulkDueControlStates();
  if ((state.tagOptions || []).length > 0) {
    bulkTagActionControl?.removeAttribute("hidden");
    bulkTagsControl?.removeAttribute("hidden");
  }

  if (bulkApplyButton) {
    bulkApplyButton.disabled = selectedCount === 0 || !hasSelectedAction;
    bulkApplyButton.textContent = `Apply to ${selectedCount}`;
  }

  if (bulkToolbar && selectedCount > 0) {
    bulkToolbar.open = true;
  }
}

function updateBulkToolbarSummary(selectedCount) {
  if (!bulkSelectionCount) {
    return;
  }

  bulkSelectionCount.textContent = `${selectedCount} selected`;
  bulkSelectionCount.hidden = selectedCount === 0;
}

function selectedBulkActions(taskIds) {
  if (taskIds.length === 0) {
    return [];
  }

  const actions = [];
  const lifecycleAction = bulkLifecycleInput?.value || "";
  const status = bulkStatusInput?.value || "";
  const priority = bulkPriorityInput?.value || "";
  const dueDate = bulkDueDateInput?.value || "";
  const shouldClearDueDate = Boolean(bulkClearDueDateInput?.checked);
  const dueTime = bulkDueTimeInput?.value || "";
  const shouldClearDueTime = Boolean(bulkClearDueTimeInput?.checked);
  const assigneeIds = selectedBulkAssigneeIds();
  const tagAction = bulkTagActionInput?.value || "";
  const tagIds = selectedBulkTagIds();

  if (lifecycleAction === "restore") {
    pushLifecycleBulkAction(actions, lifecycleAction, taskIds);
  }

  if (status) {
    actions.push({ action: "status", task_ids: taskIds, status });
  }

  if (priority) {
    actions.push({ action: "priority", task_ids: taskIds, priority });
  }

  if (shouldClearDueDate || dueDate) {
    actions.push({ action: "due_date", task_ids: taskIds, due_date: shouldClearDueDate ? "" : dueDate });
  }

  if (!shouldClearDueDate && (shouldClearDueTime || dueTime)) {
    actions.push({ action: "due_time", task_ids: taskIds, due_time: shouldClearDueTime ? "" : dueTime });
  }

  if (assigneeIds.length > 0) {
    actions.push({ action: "assignee_replace", task_ids: taskIds, assignee_ids: assigneeIds });
  }

  if (tagAction && tagIds.length > 0) {
    actions.push({ action: tagAction, task_ids: taskIds, tagIds });
  }

  if (lifecycleAction === "archive") {
    pushLifecycleBulkAction(actions, lifecycleAction, taskIds);
  }

  return actions;
}

function pushLifecycleBulkAction(actions, lifecycleAction, taskIds) {
  const lifecycleTaskIds = bulkLifecycleTaskIds(lifecycleAction, taskIds);

  if (lifecycleTaskIds.length > 0) {
    actions.push({ action: lifecycleAction, task_ids: lifecycleTaskIds });
  }
}

function bulkLifecycleTaskIds(lifecycleAction, taskIds) {
  return selectedTasksForBulk(taskIds)
    .filter((task) => lifecycleAction === "restore"
      ? task.status === "archived"
      : task.status !== "archived")
    .map((task) => task.task_id);
}

function selectedTasksForBulk(taskIds) {
  const ids = new Set(taskIds);
  return state.tasks.filter((task) => ids.has(task.task_id));
}

function updateBulkLifecycleOptions(taskIds) {
  if (!bulkLifecycleControl || !bulkLifecycleInput) {
    return;
  }

  const selectedTasks = selectedTasksForBulk(taskIds);
  const canArchive = selectedTasks.some((task) => task.status !== "archived");
  const canRestore = selectedTasks.some((task) => task.status === "archived");
  const selectedValue = bulkLifecycleInput.value;
  const options = [{ value: "", label: "-" }];

  if (canArchive) {
    options.push({ value: "archive", label: "Archive selected" });
  }

  if (canRestore) {
    options.push({ value: "restore", label: "Restore selected" });
  }

  bulkLifecycleInput.replaceChildren(...options.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    return option;
  }));

  bulkLifecycleInput.value = options.some((entry) => entry.value === selectedValue) ? selectedValue : "";
  bulkLifecycleControl.hidden = selectedTasks.length === 0 || options.length <= 1;
}

async function confirmMixedBulkActions(actions, taskIds) {
  const warnings = mixedBulkActionWarnings(actions, taskIds);

  if (actions.some((action) => action.action === "archive")) {
    return confirmBulkArchive(actions, taskIds, warnings);
  }

  if (warnings.length === 0) {
    return true;
  }

  if (!modal?.confirm) {
    return window.confirm(`${warnings.join(" ")} Apply these bulk changes?`);
  }

  return modal.confirm({
    title: "Apply bulk task changes?",
    message: `${warnings.join(" ")} Apply these bulk changes to ${taskIds.length} selected task${taskIds.length === 1 ? "" : "s"}?`,
    confirmLabel: "Apply Changes",
    cancelLabel: "Review First",
  });
}

async function confirmBulkArchive(actions, taskIds, warnings = []) {
  const archiveAction = actions.find((action) => action.action === "archive");
  const archiveCount = archiveAction?.task_ids?.length || taskIds.length;
  const archiveText = `Archive ${archiveCount} selected task${archiveCount === 1 ? "" : "s"}? Archived tasks move to the Archived view and can be restored later.`;
  const message = [warnings.join(" "), archiveText].filter(Boolean).join(" ");

  if (!modal?.confirm) {
    return window.confirm(message);
  }

  return modal.confirm({
    title: "Archive selected tasks?",
    message,
    confirmLabel: "Archive Tasks",
    cancelLabel: "Review First",
    danger: true,
  });
}

function mixedBulkActionWarnings(actions, taskIds) {
  const selectedTasks = state.tasks.filter((task) => taskIds.includes(task.task_id));
  const warnings = [];

  if (actions.some((action) => action.action === "due_date") && hasMixedValues(selectedTasks, "due_date")) {
    warnings.push("Selected tasks currently have different due dates.");
  }

  if (actions.some((action) => action.action === "due_time") && hasMixedValues(selectedTasks, "due_time")) {
    warnings.push("Selected tasks currently have different due times.");
  }

  if (actions.some((action) => ["tag_add", "tag_remove", "tag_replace"].includes(action.action)) && hasMixedTagValues(selectedTasks)) {
    warnings.push("Selected tasks currently have different tags.");
  }

  return warnings;
}

function hasMixedValues(tasks, fieldName) {
  return new Set(tasks.map((task) => task[fieldName] || "")).size > 1;
}

function hasMixedTagValues(tasks) {
  const values = tasks.map((task) =>
    (task.tags || [])
      .map((tag) => tag.tag_id)
      .filter(Boolean)
      .sort()
      .join("|")
  );
  return new Set(values).size > 1;
}

function syncBulkDueControlStates() {
  if (bulkDueDateInput && bulkClearDueDateInput) {
    bulkDueDateInput.disabled = bulkClearDueDateInput.checked;
  }

  if (bulkDueTimeInput && bulkClearDueTimeInput) {
    bulkDueTimeInput.disabled = bulkClearDueTimeInput.checked || Boolean(bulkClearDueDateInput?.checked);
  }

  if (bulkClearDueTimeInput) {
    bulkClearDueTimeInput.disabled = Boolean(bulkClearDueDateInput?.checked);
  }
}

function selectedBulkAssigneeIds() {
  return [...(bulkAssigneesControl?.querySelectorAll("input[type='checkbox']:checked") || [])]
    .map((input) => input.value)
    .filter(Boolean);
}

function selectedBulkTagIds() {
  return [...(bulkTagsInput?.selectedOptions || [])]
    .map((option) => option.value)
    .filter(Boolean);
}

function resetBulkInputs() {
  if (bulkStatusInput) {
    bulkStatusInput.value = "";
  }
  if (bulkPriorityInput) {
    bulkPriorityInput.value = "";
  }
  if (bulkDueDateInput) {
    bulkDueDateInput.value = "";
  }
  if (bulkClearDueDateInput) {
    bulkClearDueDateInput.checked = false;
  }
  if (bulkDueTimeInput) {
    bulkDueTimeInput.value = "";
  }
  if (bulkClearDueTimeInput) {
    bulkClearDueTimeInput.checked = false;
  }
  bulkAssigneesControl?.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });
  if (bulkTagActionInput) {
    bulkTagActionInput.value = "";
  }
  if (bulkTagsInput) {
    [...bulkTagsInput.options].forEach((entry) => {
      entry.selected = false;
    });
  }
  if (bulkLifecycleInput) {
    bulkLifecycleInput.value = "";
  }
  syncBulkDueControlStates();
}

function toggleVisibleSelection() {
  const tasks = state.tasks;

  tasks.forEach((task) => {
    if (selectAllInput.checked) {
      state.selectedTaskIds.add(task.task_id);
    } else {
      state.selectedTaskIds.delete(task.task_id);
    }
  });
  renderTasks();
}

function updateSelectionControls(tasks) {
  if (!selectAllInput) {
    return;
  }

  const visibleIds = tasks.map((task) => task.task_id);
  const selectedVisibleCount = visibleIds.filter((taskId) => state.selectedTaskIds.has(taskId)).length;

  selectAllInput.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  selectAllInput.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
}

function syncSelectionToTasks(visibleTasks) {
  const validIds = new Set(state.tasks.map((task) => task.task_id));

  [...state.selectedTaskIds].forEach((taskId) => {
    if (!validIds.has(taskId)) {
      state.selectedTaskIds.delete(taskId);
    }
  });

  if (visibleTasks.length === 0) {
    state.selectedTaskIds.clear();
  }
}

function usesClientScope() {
  return state.options.workspaceType === "business";
}

function setClientScopeControlsVisible(isVisible) {
  document.querySelectorAll("[data-client-workspace-control]").forEach((element) => {
    element.hidden = !isVisible;
  });
}

function handleTaskViewChange() {
  if (!taskViewSelector) {
    return;
  }

  const selectedView = TASK_VIEW_VALUES.has(taskViewSelector.value) ? taskViewSelector.value : DEFAULT_TASK_VIEW;
  state.quickFilter = selectedView;
  preserveCompatibleAdvancedFiltersForTaskView(selectedView);
  saveFilterState();
  reloadTaskList();
}

function applyQuickFilterDefaults() {
  setStatusFilterValue(defaultStatusForTaskView(selectedTaskView()));
}

function resetAdvancedTaskFilters() {
  resetAdvancedFilterControlsForTaskView(selectedTaskView());
  saveFilterState();
  reloadTaskList();
}

function resetAdvancedFilterControlsForTaskView(taskView) {
  if (sortInput) {
    sortInput.value = "due_asc";
  }
  setStatusFilterValue(defaultStatusForTaskView(taskView));
  setSelectValue(assigneeFilter, "all");
  setSelectValue(clientFilter, "all");
  setSelectValue(projectFilter, "all");
  setSelectValue(tagFilter, "all");
}

function preserveCompatibleAdvancedFiltersForTaskView(taskView) {
  if (!isStatusFilterCompatibleWithTaskView(taskView, statusFilter?.value || "active")) {
    setStatusFilterValue(defaultStatusForTaskView(taskView));
  }

  if (["my", "unassigned"].includes(taskView)) {
    setSelectValue(assigneeFilter, "all");
  }

  if (!usesClientScope()) {
    setSelectValue(clientFilter, "all");
  }
}

function updateTaskViewSelectorState() {
  if (!taskViewSelector) {
    return;
  }

  const selectedView = selectedTaskView();
  taskViewSelector.value = TASK_VIEW_VALUES.has(selectedView) ? selectedView : DEFAULT_TASK_VIEW;
}

function selectedTaskView() {
  return TASK_VIEW_VALUES.has(state.quickFilter) ? state.quickFilter : DEFAULT_TASK_VIEW;
}

function defaultStatusForTaskView(taskView) {
  if (taskView === "complete") {
    return "complete";
  }

  if (taskView === "archived") {
    return "archived";
  }

  return "active";
}

function isStatusFilterCompatibleWithTaskView(taskView, statusValue) {
  const status = canonicalStatusValue(statusValue);

  if (taskView === "complete") {
    return status === "complete" || status === "all";
  }

  if (taskView === "archived") {
    return status === "archived" || status === "all";
  }

  return !["complete", "archived"].includes(status);
}

function setStatusFilterValue(value) {
  setSelectValue(statusFilter, value);
}

function setSelectValue(select, value) {
  if (!select) {
    return;
  }

  if ([...select.options].some((item) => item.value === value)) {
    select.value = value;
  }
}

function upsertTask(task) {
  const existingIndex = state.tasks.findIndex((item) => item.task_id === task.task_id);

  if (existingIndex >= 0) {
    state.tasks.splice(existingIndex, 1, task);
    return;
  }

  state.tasks.unshift(task);
}

function openTaskFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");

  if (params.get("new") === "1") {
    openTaskDialog();
    return;
  }

  if (!taskId) {
    return;
  }

  const task = state.tasks.find((item) => item.task_id === taskId);
  if (task) {
    openTaskDialog(task);
  }
}

async function copyTaskLink(task) {
  const url = new window.URL(window.location.href);
  url.searchParams.set("task", task.task_id);

  try {
    await navigator.clipboard.writeText(url.toString());
    setStatus("Task link copied.");
  } catch {
    setStatus(url.toString());
  }
}

function restoreFilterState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(TASK_FILTER_STORAGE_KEY) || "{}");
    if (saved.sort && sortInput) {
      sortInput.value = saved.sort;
    }
    if (Object.hasOwn(saved, "quickFilter")) {
      state.quickFilter = saved.quickFilter === "" ? "all" : TASK_VIEW_VALUES.has(saved.quickFilter)
        ? saved.quickFilter
        : DEFAULT_TASK_VIEW;
    } else {
      state.quickFilter = DEFAULT_TASK_VIEW;
    }
  } catch {
    state.quickFilter = DEFAULT_TASK_VIEW;
  }
  applyQuickFilterDefaults();
  updateTaskViewSelectorState();
}

function saveFilterState() {
  window.localStorage.setItem(TASK_FILTER_STORAGE_KEY, JSON.stringify({
    sort: sortInput?.value || "due_asc",
    quickFilter: state.quickFilter,
  }));
}

function replaceOptions(select, options) {
  if (!select) {
    return;
  }

  const previousValues = [...select.selectedOptions].map((item) => item.value);
  select.replaceChildren(...options);

  if (select.multiple) {
    [...select.options].forEach((item) => {
      item.selected = previousValues.includes(item.value);
    });
    return;
  }

  if ([...select.options].some((item) => item.value === previousValues[0])) {
    select.value = previousValues[0];
  }
}

function option(value, label) {
  return pageController.createOption(value, label);
}

function optionLabel(record) {
  return record?.optionLabel || record?.display_label || record?.displayName || record?.name || record?.title || "";
}

function displayUser(user) {
  const displayName = String(user.displayName || user.display_name || user.username || user.user_id || "").trim();
  const email = String(user.username || user.email || "").trim();

  if (displayName && email && displayName !== email) {
    return `${displayName} (${email})`;
  }

  return displayName || email || user.user_id;
}

function getWorkspaceScopeLabel() {
  if (window.LongtailForge?.getWorkspaceProjectsLabel) {
    return window.LongtailForge.getWorkspaceProjectsLabel();
  }

  const workspaceName = String(window.LongtailForge?.workspaceContext?.workspaceName || "").trim() ||
    document.querySelector("[data-workspace-selector]")?.selectedOptions?.[0]?.textContent?.trim() ||
    document.querySelector("[data-workspace-name]")?.textContent?.trim() ||
    "Workspace";

  return `${workspaceName} Projects`;
}

function formatScope(task) {
  if (task.project_name && task.client_name) {
    return `${task.client_name} / ${task.project_name}`;
  }

  if (task.project_name) {
    return task.project_name;
  }

  if (task.client_name) {
    return task.client_name;
  }

  return getWorkspaceScopeLabel();
}

function formatDue(task) {
  if (!task.due_date) {
    return "None";
  }

  if (!task.due_time) {
    return task.due_date;
  }

  return window.LongtailForge.timezones?.formatDateTime?.(task.due_at_utc, task.due_timezone) ||
    `${task.due_date} ${task.due_time}`;
}

function formatToken(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function currentUserId() {
  return state.currentUserId ||
    window.LongtailForge?.workspaceContext?.userId ||
    window.LongtailForge?.workspaceContext?.user_id ||
    "";
}

function setStatus(message, options = {}) {
  pageController.setStatus(taskStatus, message, options);
}

window.LongtailForge.pageController.register("tasks", {
  snapshot: () => ({
    taskCount: state.tasks.length,
    visibleTaskCount: state.tasks.length,
    selectedTaskCount: state.selectedTaskIds.size,
    quickFilter: state.quickFilter,
    sort: sortInput?.value || "due_asc",
    optionCounts: {
      clients: state.options.clients.length,
      projects: state.options.projects.length,
      users: state.options.users.length,
    },
  }),
  runSmoke: () => {
    const checks = [
      { name: "task list exists", ok: Boolean(taskList) },
      { name: "add button exists", ok: Boolean(addTaskButton) },
      { name: "task dialog exists", ok: Boolean(taskDialog) },
      { name: "task view selector exists", ok: Boolean(taskViewSelector) },
      { name: "sort select exists", ok: Boolean(sortInput) },
      { name: "bulk controls exist", ok: Boolean(bulkToolbar && bulkStatusInput && bulkPriorityInput && bulkAssigneesControl && bulkLifecycleInput && bulkApplyButton) },
      { name: "copy link exists", ok: Boolean(copyTaskLinkButton) },
      { name: "recurrence controls exist", ok: Boolean(recurringInput && recurrenceDetailsButton && recurrenceDialog) },
    ];

    return {
      ok: checks.every((check) => check.ok),
      pageId: "tasks",
      checks,
    };
  },
});
