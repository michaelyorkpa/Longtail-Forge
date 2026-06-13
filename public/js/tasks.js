const TASK_FILTER_STORAGE_KEY = "lf_tasks_filters_v1";
const QUICK_FILTERS = new Set(["my", "unassigned", "overdue", "today", "week", "complete", "archived"]);

const taskStatus = document.querySelector("[data-task-status]");
const taskList = document.querySelector("[data-task-list]");
const addTaskButton = document.querySelector("[data-add-task]");
const taskDialog = document.querySelector("[data-task-dialog]");
const copyTaskLinkButton = document.querySelector("[data-copy-task-link]");
const quickFilters = document.querySelector("[data-task-quick-filters]");
const filterDetails = document.querySelector("[data-task-filter-details]");
const sortInput = document.querySelector("[data-task-sort]");
const statusFilter = document.querySelector("[data-task-status-filter]");
const assigneeFilter = document.querySelector("[data-task-assignee-filter]");
const clientFilter = document.querySelector("[data-task-client-filter]");
const projectFilter = document.querySelector("[data-task-project-filter]");
const tagFilterControl = document.querySelector("[data-task-tag-filter-control]");
const tagFilter = document.querySelector("[data-task-tag-filter]");
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
const bulkApplyButton = document.querySelector("[data-task-bulk-apply]");
const recurringInput = document.querySelector("[data-task-recurring]");
const recurrenceDetailsButton = document.querySelector("[data-task-recurrence-details]");
const recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");

const api = window.LongtailForge.api;
const pageController = window.LongtailForge.pageController;
const modal = window.LongtailForge.modal;
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
  quickFilter: "",
  selectedTaskIds: new Set(),
  attachmentCounts: {},
  noteCounts: {},
  taskTimers: [],
  tagOptions: [],
};
let hasLoadedTasks = false;

addTaskButton?.addEventListener("click", () => openTaskDialog());
quickFilters?.addEventListener("click", handleQuickFilterClick);
filterDetails?.addEventListener("toggle", handleFilterDetailsToggle);
bulkStatusInput?.addEventListener("change", updateBulkControls);
bulkPriorityInput?.addEventListener("change", updateBulkControls);
bulkDueDateInput?.addEventListener("change", updateBulkControls);
bulkClearDueDateInput?.addEventListener("change", updateBulkControls);
bulkDueTimeInput?.addEventListener("change", updateBulkControls);
bulkClearDueTimeInput?.addEventListener("change", updateBulkControls);
bulkAssigneesControl?.addEventListener("change", updateBulkControls);
bulkTagActionInput?.addEventListener("change", updateBulkControls);
bulkTagsInput?.addEventListener("change", updateBulkControls);
bulkApplyButton?.addEventListener("click", applyBulkAction);
selectAllInput?.addEventListener("change", toggleVisibleSelection);
[sortInput, statusFilter, assigneeFilter, clientFilter, projectFilter, tagFilter].forEach((input) => {
  input?.addEventListener("change", async () => {
    saveFilterState();
    await reloadTaskList();
  });
});

loadTasks();

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
  const statusValue = statusFilter?.value || "active";
  const assigneeValue = assigneeFilter?.value || "all";
  const clientValue = usesClientScope() ? clientFilter?.value || "all" : "all";
  const projectValue = projectFilter?.value || "all";
  const tagValue = tagFilter?.value || "all";

  params.set("status", canonicalStatusValue(statusValue));
  params.set("sort", canonicalSortValue(sortInput?.value || "due_asc"));

  if (state.quickFilter) {
    const quickFilter = canonicalQuickFilterValue(state.quickFilter);
    if (quickFilter) {
      params.set("quick_filter", quickFilter);
    }
  }

  if (assigneeValue === "me") {
    params.set("quick_filter", "assigned_to_me");
  } else if (assigneeValue === "unassigned") {
    params.set("quick_filter", "unassigned");
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

function canonicalQuickFilterValue(value) {
  return {
    my: "assigned_to_me",
    unassigned: "unassigned",
    complete: "",
    archived: "",
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
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const name = document.createElement("span");
    const labelText = displayUser(user);

    checkbox.type = "checkbox";
    checkbox.value = user.user_id;
    checkbox.checked = selectedIds.has(user.user_id);
    name.className = "task-bulk-assignee-name";
    name.textContent = labelText;
    name.title = labelText;
    label.className = "task-bulk-assignee-option";
    label.append(checkbox, name);
    return label;
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
  updateQuickFilterState();
  updateBulkControls();
  taskList.replaceChildren();

  if (tasks.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.textContent = emptyTaskMessage();
    row.appendChild(cell);
    taskList.appendChild(row);
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
  const completeButton = task.status === "complete"
    ? actionButton("Reopen", () => postTaskAction(task, "reopen"))
    : actionButton("Complete", () => postTaskAction(task, "complete"));
  const archiveButton = task.status === "archived"
    ? actionButton("Restore", () => postTaskAction(task, "restore"))
    : actionButton("Archive", () => confirmArchive(task));

  wrap.className = "task-row-actions";
  wrap.append(editButton, duplicateButton, copyButton, followButton, completeButton, archiveButton);
  return wrap;
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

  const summary = document.createElement("div");
  summary.className = "task-context-summary";
  chips.forEach((chip) => {
    const node = document.createElement("span");
    node.className = ["task-context-chip", chip.className].filter(Boolean).join(" ");
    node.textContent = `${chip.label}: ${chip.value}`;
    node.title = chip.title || `${chip.label}: ${chip.value}`;
    summary.appendChild(node);
  });
  container.appendChild(summary);
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
    Reopen: "restore",
    Restore: "restore",
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

async function confirmArchive(task) {
  const confirmed = await modal.confirm({
    title: "Archive task",
    message: `Archive "${task.title}"?`,
    confirmLabel: "Archive",
    danger: true,
  });

  if (confirmed) {
    await postTaskAction(task, "archive");
  }
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

function duplicateTask(task) {
  openTaskDialog(task, { duplicate: true });
}

function openTaskDialog(task = null, options = {}) {
  state.editingTaskId = options.duplicate === true ? "" : task?.task_id || "";
  configureTaskDialog();
  return window.LongtailForge.tasksDialog.open({
    duplicate: options.duplicate === true,
    focusNotes: options.focusNotes === true,
    task,
  });
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
  const selectedCount = state.selectedTaskIds.size;
  const hasSelectedAction = selectedBulkActions([...state.selectedTaskIds]).length > 0;

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

function selectedBulkActions(taskIds) {
  if (taskIds.length === 0) {
    return [];
  }

  const actions = [];
  const status = bulkStatusInput?.value || "";
  const priority = bulkPriorityInput?.value || "";
  const dueDate = bulkDueDateInput?.value || "";
  const shouldClearDueDate = Boolean(bulkClearDueDateInput?.checked);
  const dueTime = bulkDueTimeInput?.value || "";
  const shouldClearDueTime = Boolean(bulkClearDueTimeInput?.checked);
  const assigneeIds = selectedBulkAssigneeIds();
  const tagAction = bulkTagActionInput?.value || "";
  const tagIds = selectedBulkTagIds();

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

  return actions;
}

async function confirmMixedBulkActions(actions, taskIds) {
  const warnings = mixedBulkActionWarnings(actions, taskIds);

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

function handleQuickFilterClick(event) {
  const button = event.target.closest("[data-task-quick-filter]");

  if (!button) {
    return;
  }

  const quickFilter = button.dataset.taskQuickFilter || "";
  state.quickFilter = quickFilter === "all"
    ? ""
    : state.quickFilter === quickFilter
      ? ""
      : quickFilter;
  applyQuickFilterDefaults();
  saveFilterState();
  reloadTaskList();
}

function handleFilterDetailsToggle() {
  if (!filterDetails.open || state.quickFilter === "") {
    return;
  }

  state.quickFilter = "";
  applyQuickFilterDefaults();
  saveFilterState();
  reloadTaskList();
}

function applyQuickFilterDefaults() {
  if (!state.quickFilter) {
    statusFilter.value = "all";
  } else if (state.quickFilter === "complete") {
    statusFilter.value = "complete";
  } else if (state.quickFilter === "archived") {
    statusFilter.value = "archived";
  } else if (QUICK_FILTERS.has(state.quickFilter)) {
    statusFilter.value = "active";
  }
}

function updateQuickFilterState() {
  quickFilters?.querySelectorAll("[data-task-quick-filter]").forEach((button) => {
    const quickFilter = button.dataset.taskQuickFilter || "";
    button.dataset.active = (quickFilter === "all" ? state.quickFilter === "" : quickFilter === state.quickFilter)
      ? "true"
      : "false";
  });
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
    state.quickFilter = QUICK_FILTERS.has(saved.quickFilter) ? saved.quickFilter : "";
  } catch {
    state.quickFilter = "";
  }
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
      { name: "quick filters exist", ok: Boolean(quickFilters?.querySelector("[data-task-quick-filter]")) },
      { name: "sort select exists", ok: Boolean(sortInput) },
      { name: "bulk controls exist", ok: Boolean(bulkToolbar && bulkStatusInput && bulkPriorityInput && bulkAssigneesControl && bulkApplyButton) },
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
