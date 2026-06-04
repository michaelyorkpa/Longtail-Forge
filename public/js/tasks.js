const TASK_FILTER_STORAGE_KEY = "lf_tasks_filters_v1";
const QUICK_FILTERS = new Set(["my", "unassigned", "overdue", "today", "week", "complete", "archived"]);

const taskStatus = document.querySelector("[data-task-status]");
const taskList = document.querySelector("[data-task-list]");
const addTaskButton = document.querySelector("[data-add-task]");
const taskDialog = document.querySelector("[data-task-dialog]");
const taskForm = document.querySelector("[data-task-form]");
const taskDialogTitle = document.querySelector("[data-task-dialog-title]");
const cancelTaskButton = document.querySelector("[data-cancel-task]");
const copyTaskLinkButton = document.querySelector("[data-copy-task-link]");
const quickFilters = document.querySelector("[data-task-quick-filters]");
const filterDetails = document.querySelector("[data-task-filter-details]");
const sortInput = document.querySelector("[data-task-sort]");
const statusFilter = document.querySelector("[data-task-status-filter]");
const assigneeFilter = document.querySelector("[data-task-assignee-filter]");
const clientFilter = document.querySelector("[data-task-client-filter]");
const projectFilter = document.querySelector("[data-task-project-filter]");
const selectAllInput = document.querySelector("[data-task-select-all]");
const bulkActionInput = document.querySelector("[data-task-bulk-action]");
const bulkStatusControl = document.querySelector("[data-task-bulk-status-control]");
const bulkStatusInput = document.querySelector("[data-task-bulk-status]");
const bulkPriorityControl = document.querySelector("[data-task-bulk-priority-control]");
const bulkPriorityInput = document.querySelector("[data-task-bulk-priority]");
const bulkAssigneeControl = document.querySelector("[data-task-bulk-assignee-control]");
const bulkAssigneesInput = document.querySelector("[data-task-bulk-assignees]");
const bulkApplyButton = document.querySelector("[data-task-bulk-apply]");
const titleInput = document.querySelector("[data-task-title]");
const formStatusInput = document.querySelector("[data-task-form-status]");
const priorityInput = document.querySelector("[data-task-priority]");
const clientInput = document.querySelector("[data-task-client]");
const projectInput = document.querySelector("[data-task-project]");
const dueDateInput = document.querySelector("[data-task-due-date]");
const dueTimeInput = document.querySelector("[data-task-due-time]");
const assigneesInput = document.querySelector("[data-task-assignees]");
const reminderOverrideInput = document.querySelector("[data-task-reminder-override]");
const reminderOverrideFields = document.querySelector("[data-task-reminder-override-fields]");
const effectiveRemindersText = document.querySelector("[data-task-effective-reminders]");
const recurringInput = document.querySelector("[data-task-recurring]");
const recurrenceDetailsButton = document.querySelector("[data-task-recurrence-details]");
const recurrenceSummaryText = document.querySelector("[data-task-recurrence-summary]");
const recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");
const recurrenceForm = document.querySelector("[data-task-recurrence-form]");
const recurrenceCancelButton = document.querySelector("[data-task-recurrence-cancel]");
const recurrenceFrequencyInput = document.querySelector("[data-task-recurrence-frequency]");
const recurrenceIntervalInput = document.querySelector("[data-task-recurrence-interval]");
const recurrenceEndDateInput = document.querySelector("[data-task-recurrence-end-date]");
const taskTimerField = document.querySelector("[data-task-timer-field]");
const taskTimerStatusText = document.querySelector("[data-task-timer-status]");
const taskTimerDisplay = document.querySelector("[data-task-timer-display]");
const taskTimerStartButton = document.querySelector("[data-task-timer-start]");
const taskTimerPauseButton = document.querySelector("[data-task-timer-pause]");
const taskTimerFinalizeButton = document.querySelector("[data-task-timer-finalize]");
const taskTimerResetButton = document.querySelector("[data-task-timer-reset]");
const taskReminderDateTimeHours1Input = document.querySelector("[data-task-reminder-date-time-hours-1]");
const taskReminderDateTimeHours2Input = document.querySelector("[data-task-reminder-date-time-hours-2]");
const taskReminderDateOnlyDays1Input = document.querySelector("[data-task-reminder-date-only-days-1]");
const taskReminderDateOnlyDays2Input = document.querySelector("[data-task-reminder-date-only-days-2]");
const descriptionInput = document.querySelector("[data-task-description]");

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
  recurrenceDraft: defaultRecurrenceDraft(),
  taskTimers: [],
  taskTimerIntervalId: null,
};

addTaskButton?.addEventListener("click", () => openTaskDialog());
cancelTaskButton?.addEventListener("click", () => taskDialog?.close());
copyTaskLinkButton?.addEventListener("click", copyCurrentTaskLink);
taskForm?.addEventListener("submit", saveTask);
quickFilters?.addEventListener("click", handleQuickFilterClick);
filterDetails?.addEventListener("toggle", handleFilterDetailsToggle);
bulkActionInput?.addEventListener("change", updateBulkControls);
bulkAssigneesInput?.addEventListener("change", updateBulkControls);
bulkApplyButton?.addEventListener("click", applyBulkAction);
selectAllInput?.addEventListener("change", toggleVisibleSelection);
reminderOverrideInput?.addEventListener("change", updateReminderOverrideState);
recurringInput?.addEventListener("change", updateRecurrenceState);
recurrenceDetailsButton?.addEventListener("click", openRecurrenceDialog);
recurrenceCancelButton?.addEventListener("click", () => recurrenceDialog?.close());
recurrenceForm?.addEventListener("submit", saveRecurrenceDraft);
taskTimerStartButton?.addEventListener("click", () => saveTaskTimer("running"));
taskTimerPauseButton?.addEventListener("click", () => saveTaskTimer("paused"));
taskTimerFinalizeButton?.addEventListener("click", finalizeTaskTimer);
taskTimerResetButton?.addEventListener("click", resetTaskTimer);
[sortInput, statusFilter, assigneeFilter, clientFilter, projectFilter].forEach((input) => {
  input?.addEventListener("change", () => {
    saveFilterState();
    renderTasks();
  });
});
clientInput?.addEventListener("change", () => populateProjectInput(projectInput.value));

loadTasks();

async function loadTasks() {
  setStatus("Loading tasks...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
    const result = await api.getJson("/api/tasks", { cache: "no-store" });
    const timersResult = await loadTaskTimers();
    state = {
      ...state,
      tasks: result.tasks || [],
      taskTimers: timersResult.timers || [],
      currentUserId: result.currentUserId || state.currentUserId,
      options: result.options || state.options,
    };
    restoreFilterState();
    populateFilters();
    renderTasks();
    openTaskFromUrl();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Tasks could not be loaded.", { isError: true });
  }
}

function populateFilters() {
  const workspaceScopeLabel = getWorkspaceScopeLabel();

  replaceOptions(assigneeFilter, [
    option("all", "All assignees"),
    option("me", "Me"),
    option("unassigned", "Unassigned"),
    ...state.options.users.map((user) => option(user.user_id, displayUser(user))),
  ]);
  replaceOptions(clientFilter, [
    option("all", "All clients"),
    option("", workspaceScopeLabel),
    ...state.options.clients.map((client) => option(client.id, client.name)),
  ]);
  replaceOptions(projectFilter, [
    option("all", "All projects"),
    option("", "No project"),
    ...state.options.projects.map((project) => option(project.id, project.name)),
  ]);
  populateTaskFormOptions();
}

function populateTaskFormOptions() {
  replaceOptions(clientInput, [
    option("", "All projects"),
    ...state.options.clients.map((client) => option(client.id, client.name)),
  ]);
  populateProjectInput(projectInput?.value || "");
  const userOptions = state.options.users.map((user) => option(user.user_id, displayUser(user)));
  replaceOptions(assigneesInput, userOptions.map((item) => item.cloneNode(true)));
  replaceOptions(bulkAssigneesInput, userOptions);
}

function populateProjectInput(selectedProjectId = "") {
  const selectedClientId = clientInput?.value || "";
  const projects = state.options.projects.filter((project) =>
    !selectedClientId || (project.client_id || "") === selectedClientId,
  );

  replaceOptions(projectInput, [
    option("", "No project"),
    ...projects.map((project) => option(project.id, project.name)),
  ]);

  if (projects.some((project) => project.id === selectedProjectId)) {
    projectInput.value = selectedProjectId;
  }
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

    cell.colSpan = 8;
    cell.textContent = "No tasks match the current filters.";
    row.appendChild(cell);
    taskList.appendChild(row);
    updateSelectionControls(tasks);
    return;
  }

  tasks.forEach((task) => taskList.appendChild(createTaskRow(task)));
  updateSelectionControls(tasks);
}

function filteredTasks() {
  const statusValue = statusFilter?.value || "active";
  const assigneeValue = assigneeFilter?.value || "all";
  const clientValue = clientFilter?.value || "all";
  const projectValue = projectFilter?.value || "all";

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
    const quickMatch = matchesQuickFilter(task);

    return statusMatch && assigneeMatch && clientMatch && projectMatch && quickMatch;
  });
}

function matchesQuickFilter(task) {
  const today = todayKey();
  const weekEnd = addDaysKey(today, 7);

  if (state.quickFilter === "my") {
    return (task.assignee_ids || []).includes(currentUserId()) && isActiveTask(task);
  }

  if (state.quickFilter === "unassigned") {
    return (task.assignee_ids || []).length === 0 && isActiveTask(task);
  }

  if (state.quickFilter === "overdue") {
    return Boolean(task.due_date && task.due_date < today && isActiveTask(task));
  }

  if (state.quickFilter === "today") {
    return task.due_date === today && isActiveTask(task);
  }

  if (state.quickFilter === "week") {
    return Boolean(task.due_date && task.due_date >= today && task.due_date <= weekEnd && isActiveTask(task));
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

    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask)) ||
      priorityRank(secondTask.priority) - priorityRank(firstTask.priority) ||
      String(secondTask.updated_at || "").localeCompare(String(firstTask.updated_at || ""));
  });
}

function createTaskRow(task) {
  const row = document.createElement("tr");
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

  row.dataset.taskStatus = task.status || "open";
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
    updateSelectionControls(sortedTasks(filteredTasks()));
  });
  selectCell.appendChild(checkbox);

  titleButton.type = "button";
  titleButton.className = "link-button";
  titleButton.textContent = task.title;
  titleButton.addEventListener("click", () => openTaskDialog(task));
  titleCell.appendChild(titleButton);
  scopeCell.textContent = formatScope(task);
  assigneeCell.textContent = task.assignees?.length
    ? task.assignees.map(displayUser).join(", ")
    : "Unassigned";
  statusCell.textContent = formatToken(task.status);
  priorityCell.textContent = formatToken(task.priority);
  dueCell.textContent = formatDue(task);
  actionsCell.appendChild(createActions(task));
  row.append(selectCell, titleCell, scopeCell, assigneeCell, statusCell, priorityCell, dueCell, actionsCell);
  return row;
}

function createActions(task) {
  const wrap = document.createElement("div");
  const editButton = actionButton("Edit", () => openTaskDialog(task));
  const copyButton = actionButton("Copy Link", () => copyTaskLink(task));
  const completeButton = task.status === "complete"
    ? actionButton("Reopen", () => postTaskAction(task, "reopen"))
    : actionButton("Complete", () => postTaskAction(task, "complete"));
  const archiveButton = task.status === "archived"
    ? actionButton("Restore", () => postTaskAction(task, "restore"))
    : actionButton("Archive", () => confirmArchive(task));

  wrap.className = "task-row-actions";
  wrap.append(editButton, copyButton, completeButton, archiveButton);
  return wrap;
}

function actionButton(label, handler) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
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

function openTaskDialog(task = null) {
  state.editingTaskId = task?.task_id || "";
  taskDialogTitle.textContent = task ? "Edit Task" : "Add Task";
  copyTaskLinkButton.hidden = !task;
  titleInput.value = task?.title || "";
  formStatusInput.value = task?.status || "open";
  priorityInput.value = task?.priority || "normal";
  clientInput.value = task?.client_id || "";
  populateProjectInput(task?.project_id || "");
  dueDateInput.value = task?.due_date || "";
  dueTimeInput.value = task?.due_time || "";
  descriptionInput.value = task?.description || "";
  selectAssignees(task?.assignee_ids || []);
  writeRecurrenceFields(task?.recurrenceDetails);
  writeReminderFields(task?.reminderDetails);
  writeTaskTimerFields(task);

  if (typeof taskDialog.showModal === "function") {
    taskDialog.showModal();
  } else {
    taskDialog.setAttribute("open", "");
  }

  titleInput.focus();
}

async function loadTaskTimers() {
  try {
    return await api.getJson("/api/tasks/timers", { cache: "no-store" });
  } catch {
    return { timers: [] };
  }
}

async function saveTask(event) {
  event.preventDefault();
  const payload = readTaskFormPayload();
  const editingTask = state.tasks.find((task) => task.task_id === state.editingTaskId);

  if (editingTask?.recurrence_template_id) {
    const applyFuture = await modal.confirm({
      title: "Update recurring task",
      message: "Apply these changes to all future tasks in this recurrence?",
      confirmLabel: "All Future",
      cancelLabel: "Only This Task",
    });
    payload.recurrence.applyTo = applyFuture ? "future" : "instance";
  }

  setStatus(state.editingTaskId ? "Saving task..." : "Creating task...");

  try {
    const result = state.editingTaskId
      ? await api.putJson(`/api/tasks/${encodeURIComponent(state.editingTaskId)}`, payload)
      : await api.postJson("/api/tasks", payload);
    upsertTask(result.task);
    taskDialog.close();
    renderTasks();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task was not saved.", { isError: true });
  }
}

function readTaskFormPayload() {
  return {
    title: titleInput.value,
    status: formStatusInput.value,
    priority: priorityInput.value,
    client_id: clientInput.value,
    project_id: projectInput.value,
    due_date: dueDateInput.value,
    due_time: dueTimeInput.value,
    description: descriptionInput.value,
    assignee_ids: [...assigneesInput.selectedOptions].map((selected) => selected.value),
    recurrence: readRecurrencePayload(),
    reminderOverrideEnabled: reminderOverrideInput.checked,
    reminderPolicy: readReminderPolicy(),
  };
}

async function applyBulkAction() {
  const action = bulkActionInput.value;
  const taskIds = [...state.selectedTaskIds];

  if (!action || taskIds.length === 0) {
    return;
  }

  const payload = {
    action,
    task_ids: taskIds,
  };

  if (action === "status") {
    payload.status = bulkStatusInput.value;
  }

  if (action === "priority") {
    payload.priority = bulkPriorityInput.value;
  }

  if (action === "assignee_add" || action === "assignee_remove") {
    payload.assignee_ids = [...bulkAssigneesInput.selectedOptions].map((selected) => selected.value);
  }

  setStatus("Updating selected tasks...");

  try {
    const result = await api.postJson("/api/tasks/bulk", payload);
    (result.tasks || []).forEach(upsertTask);
    state.selectedTaskIds.clear();
    renderTasks();
    setStatus(result.errors?.length
      ? `Updated ${result.tasks?.length || 0} tasks. ${result.errors.length} tasks could not be updated.`
      : `Updated ${result.tasks?.length || 0} tasks.`);
  } catch (error) {
    setStatus(error.message || "Selected tasks were not updated.", { isError: true });
  }
}

function updateBulkControls() {
  const action = bulkActionInput?.value || "";
  const selectedCount = state.selectedTaskIds.size;

  if (bulkStatusControl) {
    bulkStatusControl.hidden = action !== "status";
  }
  if (bulkPriorityControl) {
    bulkPriorityControl.hidden = action !== "priority";
  }
  if (bulkAssigneeControl) {
    bulkAssigneeControl.hidden = action !== "assignee_add" && action !== "assignee_remove";
  }

  if (bulkApplyButton) {
    bulkApplyButton.disabled = !action || selectedCount === 0 ||
      ((action === "assignee_add" || action === "assignee_remove") && bulkAssigneesInput.selectedOptions.length === 0);
    bulkApplyButton.textContent = `Apply to ${selectedCount}`;
  }
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
  if (state.quickFilter === "complete") {
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

function selectAssignees(assigneeIds) {
  const selectedIds = new Set(assigneeIds);

  [...assigneesInput.options].forEach((item) => {
    item.selected = selectedIds.has(item.value);
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

async function saveTaskTimer(timerStatus) {
  const task = currentEditingTask();

  if (!task) {
    return;
  }

  const timer = currentTaskTimer(task.task_id);
  const elapsedSeconds = readTaskTimerElapsedSeconds(timer);

  setStatus(timerStatus === "running" ? "Starting task timer..." : "Pausing task timer...");

  try {
    const result = await api.putJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer`, {
      active_task_timer_id: timer?.active_task_timer_id || "",
      timer_status: timerStatus,
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: new Date().toISOString(),
    });
    upsertTaskTimer(result.timer);
    writeTaskTimerFields(task);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task timer was not saved.", { isError: true });
  }
}

async function finalizeTaskTimer() {
  const task = currentEditingTask();
  const timer = task ? currentTaskTimer(task.task_id) : null;

  if (!task || !timer) {
    return;
  }

  const durationSeconds = readTaskTimerElapsedSeconds(timer);

  setStatus("Saving task timer...");

  try {
    await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer/finalize`, {
      duration_seconds: durationSeconds,
      end_time: new Date().toISOString(),
    });
    removeTaskTimer(task.task_id);
    writeTaskTimerFields(task);
    setStatus("Task time saved.");
  } catch (error) {
    setStatus(error.message || "Task time was not saved.", { isError: true });
  }
}

async function resetTaskTimer() {
  const task = currentEditingTask();

  if (!task) {
    return;
  }

  const confirmed = await modal.confirm({
    title: "Reset task timer",
    message: `Reset the timer for "${task.title}"?`,
    confirmLabel: "Reset",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  try {
    await api.deleteJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer`);
    removeTaskTimer(task.task_id);
    writeTaskTimerFields(task);
    setStatus("Task timer reset.");
  } catch (error) {
    setStatus(error.message || "Task timer was not reset.", { isError: true });
  }
}

function writeTaskTimerFields(task) {
  clearTaskTimerInterval();

  if (!taskTimerField) {
    return;
  }

  const eligible = Boolean(
    task?.task_id &&
    task.project_id &&
    task.status !== "complete" &&
    task.status !== "archived" &&
    state.options.taskTimersEnabled !== false &&
    state.options.timeTrackingEnabled !== false,
  );
  const timer = task ? currentTaskTimer(task.task_id) : null;

  taskTimerField.hidden = !task?.task_id;
  taskTimerStartButton.disabled = !eligible || timer?.timer_status === "running";
  taskTimerPauseButton.disabled = !eligible || timer?.timer_status !== "running";
  taskTimerFinalizeButton.disabled = !eligible || !timer;
  taskTimerResetButton.disabled = !timer;

  if (!task?.task_id) {
    taskTimerStatusText.textContent = "Save the task before using a task timer.";
  } else if (!eligible) {
    taskTimerStatusText.textContent = readTaskTimerIneligibleReason(task);
  } else if (timer?.timer_status === "running") {
    taskTimerStatusText.textContent = "Running.";
  } else if (timer) {
    taskTimerStatusText.textContent = "Paused.";
  } else {
    taskTimerStatusText.textContent = "No active timer.";
  }

  updateTaskTimerDisplay(timer);
  if (timer?.timer_status === "running") {
    state.taskTimerIntervalId = window.setInterval(() => updateTaskTimerDisplay(timer), 1000);
  }
}

function readTaskTimerIneligibleReason(task) {
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

  return "Task timer unavailable.";
}

function updateTaskTimerDisplay(timer) {
  taskTimerDisplay.textContent = formatDuration(readTaskTimerElapsedSeconds(timer));
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
  return baseSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function currentEditingTask() {
  return state.tasks.find((task) => task.task_id === state.editingTaskId);
}

function currentTaskTimer(taskId) {
  return state.taskTimers.find((timer) => timer.task_id === taskId);
}

function upsertTaskTimer(timer) {
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

function removeTaskTimer(taskId) {
  state.taskTimers = state.taskTimers.filter((timer) => timer.task_id !== taskId);
}

function clearTaskTimerInterval() {
  if (state.taskTimerIntervalId) {
    window.clearInterval(state.taskTimerIntervalId);
    state.taskTimerIntervalId = null;
  }
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

async function copyCurrentTaskLink() {
  const task = state.tasks.find((item) => item.task_id === state.editingTaskId);

  if (task) {
    await copyTaskLink(task);
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

function writeReminderFields(details = {}) {
  const taskPolicy = normalizeReminderPolicy(details.taskPolicy || details.effectivePolicy?.offsets || {});
  const effectivePolicy = normalizeReminderPolicy(details.effectivePolicy?.offsets || {});
  const timedHours = taskPolicy.dateTime.map((minutes) => Math.round(minutes / 60));
  const dateOnlyDays = taskPolicy.dateOnly.map((minutes) => Math.round(minutes / 1440));

  reminderOverrideInput.checked = Boolean(details.overrideEnabled);
  taskReminderDateTimeHours1Input.value = String(timedHours[0] || 2);
  taskReminderDateTimeHours2Input.value = String(timedHours[1] || 24);
  taskReminderDateOnlyDays1Input.value = String(dateOnlyDays[0] || 3);
  taskReminderDateOnlyDays2Input.value = String(dateOnlyDays[1] || 1);
  effectiveRemindersText.textContent = `Effective: timed ${formatOffsetList(effectivePolicy.dateTime, "hours")}; date-only ${formatOffsetList(effectivePolicy.dateOnly, "days")}.`;
  updateReminderOverrideState();
}

function writeRecurrenceFields(details = {}) {
  const parsed = {
    ...defaultRecurrenceDraft(),
    enabled: Boolean(details.enabled),
    frequency: details.frequency || "WEEKLY",
    interval: Number.parseInt(details.interval, 10) || 1,
    endDate: details.endDate || details.end_date || "",
  };

  state.recurrenceDraft = parsed;
  recurringInput.checked = parsed.enabled;
  updateRecurrenceState();
}

function updateRecurrenceState() {
  if (!recurringInput || !recurrenceDetailsButton) {
    return;
  }

  recurrenceDetailsButton.disabled = !recurringInput.checked;
  recurrenceSummaryText.textContent = recurringInput.checked
    ? formatRecurrenceSummary(state.recurrenceDraft)
    : "Not recurring.";
}

function openRecurrenceDialog() {
  recurrenceFrequencyInput.value = state.recurrenceDraft.frequency || "WEEKLY";
  recurrenceIntervalInput.value = String(state.recurrenceDraft.interval || 1);
  recurrenceEndDateInput.value = state.recurrenceDraft.endDate || "";

  if (typeof recurrenceDialog.showModal === "function") {
    recurrenceDialog.showModal();
  } else {
    recurrenceDialog.setAttribute("open", "");
  }
}

function saveRecurrenceDraft(event) {
  event.preventDefault();
  state.recurrenceDraft = {
    enabled: recurringInput.checked,
    frequency: recurrenceFrequencyInput.value || "WEEKLY",
    interval: readPositiveInteger(recurrenceIntervalInput, 1),
    endDate: recurrenceEndDateInput.value || "",
  };
  updateRecurrenceState();
  recurrenceDialog.close();
}

function readRecurrencePayload() {
  return {
    enabled: Boolean(recurringInput.checked),
    applyTo: "instance",
    frequency: state.recurrenceDraft.frequency || "WEEKLY",
    interval: state.recurrenceDraft.interval || 1,
    endDate: state.recurrenceDraft.endDate || "",
  };
}

function defaultRecurrenceDraft() {
  return {
    enabled: false,
    frequency: "WEEKLY",
    interval: 1,
    endDate: "",
  };
}

function formatRecurrenceSummary(recurrence) {
  const interval = Number.parseInt(recurrence.interval, 10) || 1;
  const frequency = String(recurrence.frequency || "WEEKLY").toLowerCase();
  const unit = {
    daily: "day",
    weekly: "week",
    monthly: "month",
  }[frequency] || "week";
  const cadence = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;

  return recurrence.endDate ? `${cadence} until ${recurrence.endDate}.` : `${cadence}.`;
}

function updateReminderOverrideState() {
  reminderOverrideFields.hidden = !reminderOverrideInput.checked;
}

function readReminderPolicy() {
  return {
    dateTime: [
      readPositiveInteger(taskReminderDateTimeHours1Input, 2) * 60,
      readPositiveInteger(taskReminderDateTimeHours2Input, 24) * 60,
    ],
    dateOnly: [
      readPositiveInteger(taskReminderDateOnlyDays1Input, 3) * 1440,
      readPositiveInteger(taskReminderDateOnlyDays2Input, 1) * 1440,
    ],
  };
}

function normalizeReminderPolicy(policy) {
  return {
    dateTime: normalizeOffsetList(policy.dateTime || policy.date_time, [120, 1440]),
    dateOnly: normalizeOffsetList(policy.dateOnly || policy.date_only, [4320, 1440]),
  };
}

function normalizeOffsetList(values, fallback) {
  const offsets = (Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 2);

  return offsets.length > 0 ? offsets : [...fallback];
}

function readPositiveInteger(input, fallback) {
  return Math.max(1, Number.parseInt(input?.value, 10) || fallback);
}

function formatOffsetList(offsets, unit) {
  const divisor = unit === "days" ? 1440 : 60;
  const label = unit === "days" ? "d" : "h";
  return offsets.map((minutes) => `${Math.round(minutes / divisor)}${label}`).join(", ");
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
      { name: "bulk controls exist", ok: Boolean(bulkActionInput && bulkApplyButton) },
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
