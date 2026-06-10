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
const bulkAssigneeControl = document.querySelector("[data-task-bulk-assignee-control]");
const bulkAssigneesControl = document.querySelector("[data-task-bulk-assignees]");
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
  taskTimers: [],
  tagOptions: [],
};

addTaskButton?.addEventListener("click", () => openTaskDialog());
quickFilters?.addEventListener("click", handleQuickFilterClick);
filterDetails?.addEventListener("toggle", handleFilterDetailsToggle);
bulkStatusInput?.addEventListener("change", updateBulkControls);
bulkPriorityInput?.addEventListener("change", updateBulkControls);
bulkAssigneesControl?.addEventListener("change", updateBulkControls);
bulkApplyButton?.addEventListener("click", applyBulkAction);
selectAllInput?.addEventListener("change", toggleVisibleSelection);
[sortInput, statusFilter, assigneeFilter, clientFilter, projectFilter, tagFilter].forEach((input) => {
  input?.addEventListener("change", () => {
    saveFilterState();
    renderTasks();
  });
});

loadTasks();

async function loadTasks() {
  setStatus("Loading tasks...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
    const result = await api.getJson("/api/tasks", { cache: "no-store" });
    const tagOptions = await loadTagOptions();
    const timersResult = await loadTaskTimers();
    const attachmentCounts = await loadAttachmentCounts(result.tasks || []);
    state = {
      ...state,
      tasks: result.tasks || [],
      taskTimers: timersResult.timers || [],
      currentUserId: result.currentUserId || state.currentUserId,
      options: result.options || state.options,
      attachmentCounts,
      tagOptions,
    };
    restoreFilterState();
    populateFilters();
    configureTaskDialog();
    renderTasks();
    openTaskFromUrl();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Tasks could not be loaded.", { isError: true });
  }
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
      ...sortClientOptions(state.options.clients).map((client) => option(client.id, `${treeIndent(getClientDepth(client))}${client.name}`)),
    ]);
  } else {
    replaceOptions(clientFilter, [option("all", "All")]);
  }
  replaceOptions(projectFilter, [
    option("all", "All Projects"),
    option("", "No project"),
    ...sortProjectOptions(state.options.projects).map((project) => option(project.id, `${treeIndent(getProjectDepth(project))}${project.name}`)),
  ]);
  populateTagFilter();
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
    option("all", "All tags"),
    option("__no_effective_tags__", "No tags"),
    ...tags.map((tag) => option(tag.tag_id, tag.name || tag.slug)),
  ]);
  tagFilter.value = previousValue === "__no_effective_tags__" || tags.some((tag) => tag.tag_id === previousValue) ? previousValue : "all";
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

function renderTasks() {
  const tasks = sortedTasks(filteredTasks());

  syncSelectionToTasks(tasks);
  updateQuickFilterState();
  updateBulkControls();
  taskList.replaceChildren();

  if (tasks.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.textContent = "No tasks match the current filters.";
    row.appendChild(cell);
    taskList.appendChild(row);
    updateSelectionControls(tasks);
    return;
  }

  tasks.forEach((task) => taskList.append(...createTaskRow(task)));
  updateSelectionControls(tasks);
}

function filteredTasks() {
  const statusValue = statusFilter?.value || "active";
  const assigneeValue = assigneeFilter?.value || "all";
  const clientValue = usesClientScope() ? clientFilter?.value || "all" : "all";
  const projectValue = projectFilter?.value || "all";
  const tagValue = tagFilter?.value || "all";

  return state.tasks.filter((task) => {
    const activeStatus = task.status !== "complete" && task.status !== "archived";
    const statusMatch = statusValue === "all" ||
      (statusValue === "active" ? activeStatus : task.status === statusValue);
    const assigneeIds = task.assignee_ids || [];
    const assigneeMatch = assigneeValue === "all" ||
      (assigneeValue === "me" ? assigneeIds.includes(currentUserId()) : (
        assigneeValue === "unassigned" ? assigneeIds.length === 0 : assigneeIds.includes(assigneeValue)
      ));
    const clientMatch = clientValue === "all" || (task.client_id || "") === clientValue;
    const projectMatch = projectValue === "all" || (task.project_id || "") === projectValue;
    const tagMatch = tagValue === "all" ||
      (tagValue === "__no_effective_tags__" ? (task.tags || []).length === 0 : (task.tags || []).some((tag) => tag.tag_id === tagValue));
    const quickMatch = matchesQuickFilter(task);

    return statusMatch && assigneeMatch && clientMatch && projectMatch && tagMatch && quickMatch;
  });
}

function matchesQuickFilter(task) {
  const today = todayKey();
  const weekEnd = addDaysKey(today, 7);
  const overdue = isTaskOverdue(task);

  if (state.quickFilter === "my") {
    return (task.assignee_ids || []).includes(currentUserId()) && isActiveTask(task);
  }

  if (state.quickFilter === "unassigned") {
    return (task.assignee_ids || []).length === 0 && isActiveTask(task);
  }

  if (state.quickFilter === "overdue") {
    return overdue;
  }

  if (state.quickFilter === "today") {
    return task.due_date === today && isActiveTask(task) && !overdue;
  }

  if (state.quickFilter === "week") {
    return Boolean(task.due_date && task.due_date >= today && task.due_date <= weekEnd && isActiveTask(task) && !overdue);
  }

  if (state.quickFilter === "complete") {
    return task.status === "complete";
  }

  if (state.quickFilter === "archived") {
    return task.status === "archived";
  }

  return true;
}

function sortedTasks(tasks) {
  const projectSortOrder = getActiveProjectSortOrder();

  return [...tasks].sort((firstTask, secondTask) => {
    if (sortInput?.value === "priority_desc") {
      return priorityRank(secondTask.priority) - priorityRank(firstTask.priority) ||
        dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
    }

    if (sortInput?.value === "status_asc") {
      return String(firstTask.status || "").localeCompare(String(secondTask.status || "")) ||
        dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
    }

    if (sortInput?.value === "newest") {
      return String(secondTask.created_at || "").localeCompare(String(firstTask.created_at || ""));
    }

    if (sortInput?.value === "oldest") {
      return String(firstTask.created_at || "").localeCompare(String(secondTask.created_at || ""));
    }

    if (projectSortOrder.length > 0) {
      return compareByProjectSortOrder(firstTask, secondTask, projectSortOrder) ||
        String(secondTask.updated_at || "").localeCompare(String(firstTask.updated_at || ""));
    }

    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask)) ||
      priorityRank(secondTask.priority) - priorityRank(firstTask.priority) ||
      String(secondTask.updated_at || "").localeCompare(String(firstTask.updated_at || ""));
  });
}

function getActiveProjectSortOrder() {
  if ((sortInput?.value || "due_asc") !== "due_asc" || (projectFilter?.value || "all") === "all") {
    return [];
  }

  const project = state.options.projects.find((item) => item.id === projectFilter.value);
  return normalizeProjectTaskSortOrder(project?.taskDefaults?.sortOrder || []);
}

function compareByProjectSortOrder(firstTask, secondTask, sortOrder) {
  return sortOrder.reduce((result, sortItem) => {
    if (result !== 0) {
      return result;
    }

    if (sortItem === "priority") {
      return priorityRank(secondTask.priority) - priorityRank(firstTask.priority);
    }

    if (sortItem === "status") {
      return String(firstTask.status || "").localeCompare(String(secondTask.status || ""));
    }

    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
  }, 0);
}

function createTaskRow(task) {
  const row = document.createElement("tr");
  const actionsRow = document.createElement("tr");
  const selectCell = document.createElement("td");
  const titleCell = document.createElement("td");
  const scopeCell = document.createElement("td");
  const assigneeCell = document.createElement("td");
  const statusCell = document.createElement("td");
  const priorityCell = document.createElement("td");
  const dueCell = document.createElement("td");
  const actionsCell = document.createElement("td");
  const checkbox = document.createElement("input");
  const titleButton = document.createElement("button");
  const scopeText = formatScope(task);

  row.dataset.taskStatus = task.status || "open";
  actionsRow.dataset.taskStatus = task.status || "open";
  row.classList.toggle("is-task-complete", task.status === "complete");
  row.classList.toggle("is-task-archived", task.status === "archived");
  actionsRow.classList.toggle("is-task-complete", task.status === "complete");
  actionsRow.classList.toggle("is-task-archived", task.status === "archived");
  actionsRow.classList.add("task-actions-row");

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
    updateSelectionControls(sortedTasks(filteredTasks()));
  });
  selectCell.appendChild(checkbox);

  titleButton.type = "button";
  titleButton.className = "link-button";
  titleButton.textContent = task.title;
  titleButton.addEventListener("click", () => openTaskDialog(task));
  titleCell.className = "task-title-cell";
  titleCell.appendChild(titleButton);
  appendTagChips(titleCell, task.tags);
  appendAttachmentCount(titleCell, task);
  scopeCell.className = "task-scope-cell";
  scopeCell.textContent = scopeText;
  scopeCell.title = scopeText;
  const assigneeText = task.assignees?.length
    ? task.assignees.map(displayUser).join(", ")
    : "Unassigned";
  assigneeCell.className = "task-assignee-cell";
  assigneeCell.textContent = assigneeText;
  assigneeCell.title = assigneeText;
  statusCell.textContent = formatToken(task.status);
  priorityCell.textContent = formatToken(task.priority);
  dueCell.textContent = formatDue(task);

  actionsCell.colSpan = 7;
  actionsCell.appendChild(createActions(task));

  row.append(selectCell, titleCell, scopeCell, assigneeCell, statusCell, priorityCell, dueCell);
  actionsRow.appendChild(actionsCell);
  return [row, actionsRow];
}

function createActions(task) {
  const wrap = document.createElement("div");
  const editButton = actionButton("Edit", () => openTaskDialog(task));
  const duplicateButton = actionButton("Duplicate", () => duplicateTask(task));
  const copyButton = actionButton("Copy Link", () => copyTaskLink(task));
  const followButton = actionButton("Follow Notifications", () => followTaskNotifications(task));
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

function actionButton(label, handler) {
  const button = window.LongtailForge.icons?.createIconButton
    ? window.LongtailForge.icons.createIconButton({
      icon: taskActionIcon(label),
      label,
      title: label,
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
    "Follow Notifications": "more",
    Reopen: "restore",
    Restore: "restore",
  }[label] || "more";
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
    renderTasks();
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
  return window.LongtailForge.tasksDialog.open({ duplicate: options.duplicate === true, task });
}

function configureTaskDialog() {
  window.LongtailForge.tasksDialog?.configure?.({
    currentUserId: currentUserId(),
    onSaved: (result) => {
      if (result.task) {
        upsertTask(result.task);
      }
      renderTasks();
    },
    onAttachmentsChanged: refreshTaskAttachmentCounts,
    onAttachmentsRefreshed: refreshTaskAttachmentCounts,
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
    renderTasks();
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
  bulkAssigneeControl?.removeAttribute("hidden");

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
  const assigneeIds = selectedBulkAssigneeIds();

  if (status) {
    actions.push({ action: "status", task_ids: taskIds, status });
  }

  if (priority) {
    actions.push({ action: "priority", task_ids: taskIds, priority });
  }

  if (assigneeIds.length > 0) {
    actions.push({ action: "assignee_replace", task_ids: taskIds, assignee_ids: assigneeIds });
  }

  return actions;
}

function selectedBulkAssigneeIds() {
  return [...(bulkAssigneesControl?.querySelectorAll("input[type='checkbox']:checked") || [])]
    .map((input) => input.value)
    .filter(Boolean);
}

function resetBulkInputs() {
  if (bulkStatusInput) {
    bulkStatusInput.value = "";
  }
  if (bulkPriorityInput) {
    bulkPriorityInput.value = "";
  }
  bulkAssigneesControl?.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });
}

function toggleVisibleSelection() {
  const tasks = sortedTasks(filteredTasks());

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
  renderTasks();
}

function handleFilterDetailsToggle() {
  if (!filterDetails.open || state.quickFilter === "") {
    return;
  }

  state.quickFilter = "";
  saveFilterState();
  renderTasks();
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

function sortClientOptions(clients) {
  return [...(clients || [])].sort((left, right) =>
    getClientTreeSortKey(left).localeCompare(getClientTreeSortKey(right), undefined, { sensitivity: "base" }),
  );
}

function sortProjectOptions(projects) {
  return [...(projects || [])].sort((left, right) =>
    getProjectTreeSortKey(left).localeCompare(getProjectTreeSortKey(right), undefined, { sensitivity: "base" }),
  );
}

function getClientTreeSortKey(client) {
  const names = [];
  let currentClient = client;
  const visited = new Set();

  while (currentClient && !visited.has(currentClient.id)) {
    visited.add(currentClient.id);
    names.unshift(currentClient.name || "");
    currentClient = state.options.clients.find((item) => item.id === currentClient.parent_client_id);
  }

  return names.join("/");
}

function getProjectTreeSortKey(project) {
  const names = [];
  let currentProject = project;
  const visited = new Set();

  while (currentProject && !visited.has(currentProject.id)) {
    visited.add(currentProject.id);
    names.unshift(currentProject.name || "");
    currentProject = state.options.projects.find((item) => item.id === currentProject.parent_project_id);
  }

  return names.join("/");
}

function getClientDepth(client, visited = new Set()) {
  if (!client?.parent_client_id || visited.has(client.id)) {
    return 0;
  }

  visited.add(client.id);
  const parent = state.options.clients.find((item) => item.id === client.parent_client_id);
  return parent ? 1 + getClientDepth(parent, visited) : 0;
}

function getProjectDepth(project, visited = new Set()) {
  if (!project?.parent_project_id || visited.has(project.id)) {
    return 0;
  }

  visited.add(project.id);
  const parent = state.options.projects.find((item) => item.id === project.parent_project_id);
  return parent ? 1 + getProjectDepth(parent, visited) : 0;
}

function treeIndent(depth) {
  return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
}

function normalizeProjectTaskSortOrder(value) {
  const allowed = ["due_date", "priority", "status"];
  const ordered = (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter((item) => allowed.includes(item));

  allowed.forEach((item) => {
    if (!ordered.includes(item)) {
      ordered.push(item);
    }
  });

  return ordered.slice(0, allowed.length);
}

function option(value, label) {
  return pageController.createOption(value, label);
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

function dueSortValue(task) {
  return task.due_date ? `${task.due_date} ${task.due_time || "99:99"}` : "9999-12-31 99:99";
}

function priorityRank(priority) {
  return {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  }[priority] || 0;
}

function isActiveTask(task) {
  return task.status !== "complete" && task.status !== "archived";
}

function isTaskOverdue(task) {
  if (!task.due_date || !isActiveTask(task)) {
    return false;
  }

  if (task.due_time && task.due_at_utc) {
    const dueAt = new Date(task.due_at_utc);
    return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now();
  }

  return task.due_date < todayKey();
}

function todayKey() {
  return window.LongtailForge.timezones?.formatDateInput?.(new Date()) || new Date().toISOString().slice(0, 10);
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    visibleTaskCount: filteredTasks().length,
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
