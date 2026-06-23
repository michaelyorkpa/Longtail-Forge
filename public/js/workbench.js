const WORKBENCH_CARD_STATE_KEY = "lf_workbench_cards_v1";
const WORKBENCH_TASK_FILTER_KEY = "lf_workbench_task_filter_v1";
const TASK_FILTERS = new Set(["assigned", "today", "soon", "overdue", "in_progress", "has_timer", "all"]);

const statusText = document.querySelector("[data-workbench-status]");
const timerCountText = document.querySelector("[data-workbench-timer-count]");
const taskCountText = document.querySelector("[data-workbench-task-count]");
const timerList = document.querySelector("[data-workbench-timer-list]");
const taskList = document.querySelector("[data-workbench-task-list]");
const taskFilters = document.querySelector("[data-workbench-task-filters]");
const taskSortInput = document.querySelector("[data-workbench-task-sort]");
const addTaskButton = document.querySelector("[data-workbench-add-task]");
const manualTimerForm = document.querySelector("[data-workbench-manual-timer-form]");
const manualClientInput = document.querySelector("[data-workbench-manual-client]");
const manualProjectInput = document.querySelector("[data-workbench-manual-project]");
const manualDescriptionInput = document.querySelector("[data-workbench-manual-description]");
const manualBillableInput = document.querySelector("[data-workbench-manual-billable]");
const timeTrackingModuleLink = document.querySelector('[data-workbench-module-link="time-tracking"]');

const api = window.LongtailForge.api;
const modal = window.LongtailForge.modal;

let state = {
  clients: [],
  currentUserId: "",
  modules: {
    tasks: { enabled: false },
    timeTracking: { enabled: false },
  },
  registry: {
    workbenchCards: [],
    timerSources: [],
    workItemSources: [],
  },
  taskFilter: "assigned",
  taskItems: [],
  taskOptions: { projects: [] },
  timers: [],
};
let tickIntervalId = null;
let pendingActivatedTimerKey = "";

const workbenchCardRenderers = {
  "active-work-timers": () => {
    renderTimers();
    updateManualTimerState();
  },
  "task-workbench-items": renderTasks,
};

document.querySelectorAll("[data-workbench-card]").forEach((card) => {
  card.addEventListener("toggle", persistCardState);
});
taskFilters?.addEventListener("click", handleTaskFilterClick);
taskSortInput?.addEventListener("change", () => renderTasks());
addTaskButton?.addEventListener("click", openAddTaskAction);
manualTimerForm?.addEventListener("submit", startManualTimer);
manualClientInput?.addEventListener("change", () => populateManualProjects({ notifyBillableChange: true }));
manualProjectInput?.addEventListener("change", () => updateManualBillableDefault({ notify: true }));

loadWorkbench();

async function loadWorkbench() {
  setStatus("Loading Workbench...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
    restoreCardState();
    restoreTaskFilter();
    const [bootstrap, clientProjectData] = await Promise.all([
      api.getJson("/api/workbench/bootstrap", { cache: "no-store" }),
      loadClientProjectData(),
    ]);

    state = {
      ...state,
      clients: normalizeClientProjectOptions(clientProjectData),
      currentUserId: bootstrap.currentUserId || "",
      modules: bootstrap.modules || state.modules,
      registry: bootstrap.registry || state.registry,
      taskItems: bootstrap.taskItems || [],
      taskOptions: bootstrap.taskOptions || { projects: [] },
      timers: bootstrap.timers || [],
    };
    populateManualTimerForm();
    renderWorkbench();
    startTicking();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Workbench could not be loaded.", { isError: true });
  }
}

async function loadClientProjectData() {
  try {
    return await api.getJson("/api/client-projects", { cache: "no-store" });
  } catch {
    return { clients: [], workspaceProjects: [] };
  }
}

function renderWorkbench() {
  renderRegisteredWorkbenchCards();
  updateModuleLinks();
}

function renderRegisteredWorkbenchCards() {
  const activeCards = new Map((state.registry.workbenchCards || []).map((card) => [card.renderer, card]));

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    const rendererId = card.dataset.workbenchRenderer || "";
    const contribution = activeCards.get(rendererId);
    const renderer = workbenchCardRenderers[rendererId];

    card.hidden = !contribution || !renderer;

    if (contribution && renderer) {
      renderer(contribution);
    }
  });
}

function renderTimers() {
  const timers = sortedTimers(state.timers);
  timerCountText.textContent = String(timers.length);
  timerList.replaceChildren();

  if (timers.length === 0) {
    timerList.appendChild(emptyState("No active or paused timers."));
    return;
  }

  timers.forEach((timer) => timerList.appendChild(createTimerCard(timer)));
  flashActivatedTimer(timers);
}

function createTimerCard(timer) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const body = document.createElement("div");
  const title = document.createElement("span");
  const meta = document.createElement("span");
  const sourceBadge = badge(sourceLabel(timer), timer.source_enabled ? "" : "disabled");
  const stateBadge = badge(formatToken(timer.timer_status), timer.timer_status);
  const duration = document.createElement("strong");
  const context = document.createElement("p");
  const description = document.createElement("p");
  const actions = document.createElement("div");

  details.className = "workbench-timer-card";
  details.dataset.workbenchTimerKey = timerKey(timer);
  details.open = true;
  body.className = "workbench-timer-body";
  meta.className = "workbench-card-meta";
  duration.className = "workbench-duration";
  duration.dataset.workbenchDuration = timer.active_timer_id;
  duration.textContent = formatDuration(readElapsedSeconds(timer));
  context.textContent = [timer.client_name, timer.project_name].filter(Boolean).join(" / ") || "Project timer";
  description.textContent = timer.description || timer.source_label || "";
  title.textContent = timer.source_label || timer.description || "Project timer";
  meta.append(sourceBadge, stateBadge);
  if (!timer.source_enabled) {
    meta.append(badge("Recovery", "recovery"));
  }
  summary.append(title, meta);

  actions.className = "workbench-actions";
  const running = timer.timer_status === "running";
  const canUseSourceActions = timer.source_type === "manual" || timer.source_enabled;
  const startButton = actionButton("Start", () => startExistingTimer(timer));
  const pauseButton = actionButton("Pause", () => pauseExistingTimer(timer));
  const saveButton = actionButton("Save & End", () => finalizeTimer(timer));
  const discardButton = actionButton("Discard", () => discardTimer(timer), { danger: true });

  startButton.disabled = running || !state.modules.timeTracking.enabled || !canUseSourceActions;
  pauseButton.disabled = !running || !state.modules.timeTracking.enabled;
  saveButton.disabled = !state.modules.timeTracking.enabled;
  discardButton.disabled = !state.modules.timeTracking.enabled;
  actions.append(startButton, pauseButton, saveButton, discardButton);
  body.append(duration, context, description, actions);
  details.append(summary, body);
  return details;
}

function renderTasks() {
  const tasksEnabled = cardContributionActive("task-workbench-items");
  const taskCard = document.querySelector('[data-workbench-renderer="task-workbench-items"]');
  const tasks = tasksEnabled ? sortedTasks(filteredTasks()) : [];

  taskCard.hidden = !tasksEnabled;
  taskCountText.textContent = String(tasks.length);
  taskList.replaceChildren();
  updateTaskFilterState();

  if (!tasksEnabled) {
    return;
  }

  if (tasks.length === 0) {
    taskList.appendChild(emptyState("No tasks match the current filters."));
    return;
  }

  tasks.forEach((task) => taskList.appendChild(createTaskItem(task)));
}

function cardContributionActive(rendererId) {
  return (state.registry.workbenchCards || []).some((card) => card.renderer === rendererId);
}

function updateModuleLinks() {
  if (timeTrackingModuleLink) {
    timeTrackingModuleLink.hidden = !cardContributionActive("active-work-timers");
  }
}

function createTaskItem(task) {
  const item = document.createElement("article");
  const header = document.createElement("div");
  const titleBlock = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("div");
  const detail = document.createElement("p");
  const actions = document.createElement("div");
  const timer = task.timer;
  const running = timer?.timer_status === "running";

  item.className = "workbench-task-item";
  header.className = "workbench-task-header";
  titleBlock.className = "workbench-task-title-block";
  meta.className = "workbench-card-meta";
  actions.className = "workbench-actions";
  title.textContent = task.title;
  meta.append(
    badge(formatToken(task.status), task.status),
    badge(formatToken(task.priority), task.priority),
  );
  if (timer) {
    meta.append(badge(running ? "Timer running" : "Timer paused", running ? "running" : "paused"));
  }
  titleBlock.append(title);
  appendTaskTagChips(titleBlock, task);
  header.append(titleBlock, meta);
  detail.textContent = taskDetailText(task);

  const startButton = actionButton(running ? "Running" : "Start Timer", () => startTaskTimer(task));
  const pauseButton = actionButton("Pause", () => pauseTaskTimer(task));
  const saveButton = actionButton("Save & End", () => finalizeTaskTimer(task));
  const completeButton = actionButton("Complete", () => completeTask(task));
  const openButton = actionButton("Open Task", () => openTaskAction(task));

  startButton.disabled = running || !taskCanUseTimer(task);
  pauseButton.disabled = !running || !taskCanUseTimer(task);
  saveButton.disabled = !timer || !taskCanUseTimer(task);
  completeButton.disabled = task.status === "complete" || task.status === "archived" || Boolean(timer);
  completeButton.title = timer ? "Save or discard the task timer before completing this task." : "";
  actions.append(startButton, pauseButton, saveButton, completeButton, openButton);
  item.append(header, detail, actions);
  return item;
}

function appendTaskTagChips(container, task) {
  const directTags = Array.isArray(task.directTags)
    ? task.directTags
    : Array.isArray(task.direct_tags) ? task.direct_tags : [];
  const visibleTags = directTags.slice(0, 2);
  const hiddenCount = Math.max(0, directTags.length - visibleTags.length);

  if (visibleTags.length === 0 && hiddenCount === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "workbench-task-tag-list";

  visibleTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip workbench-task-tag-chip";
    chip.textContent = tag.name || tag.slug || "Tag";
    if (tag.color) {
      chip.style.setProperty("--tag-color", tag.color);
    }
    list.appendChild(chip);
  });

  if (hiddenCount > 0) {
    const overflow = document.createElement("span");
    overflow.className = "tag-chip workbench-task-tag-chip workbench-task-tag-overflow";
    overflow.textContent = `+${hiddenCount}`;
    overflow.title = `${hiddenCount} more direct ${hiddenCount === 1 ? "tag" : "tags"}`;
    list.appendChild(overflow);
  }

  container.appendChild(list);
}

async function startManualTimer(event) {
  event.preventDefault();
  const selectedClient = currentManualClient();
  const selectedProject = currentManualProject(selectedClient);
  const timerSlot = nextManualTimerSlot();

  if (!selectedProject) {
    setStatus("Select a project before starting a timer.", { isError: true });
    return;
  }

  pendingActivatedTimerKey = `manual-slot:${timerSlot}`;
  setStatus("Starting timer...");
  try {
    await api.putJson(`/api/active-timers/${encodeURIComponent(timerSlot)}`, {
      client_id: selectedClient?.isWorkspaceScope ? "" : selectedClient?.id || "",
      client_name: selectedClient?.isWorkspaceScope ? "" : selectedClient?.name || "",
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      description: manualDescriptionInput.value.trim(),
      billable: manualBillableInput.checked ? "yes" : "no",
      accumulated_elapsed_seconds: 0,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    });
    manualDescriptionInput.value = "";
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Timer could not be started.", { isError: true });
  }
}

async function startExistingTimer(timer) {
  pendingActivatedTimerKey = timerKey(timer);
  if (timer.source_type === "task" && timer.source_enabled) {
    await saveTaskTimer(timer.source_id, "running", readElapsedSeconds(timer), timer.active_timer_id);
    return;
  }

  await updateTimerStatus(timer, "running");
}

async function pauseExistingTimer(timer) {
  if (timer.source_type === "task" && timer.source_enabled) {
    await saveTaskTimer(timer.source_id, "paused", readElapsedSeconds(timer), timer.active_timer_id);
    return;
  }

  await updateTimerStatus(timer, "paused");
}

async function updateTimerStatus(timer, timerStatus) {
  setStatus(timerStatus === "running" ? "Starting timer..." : "Pausing timer...");
  try {
    await api.putJson(`/api/workbench/timers/${encodeURIComponent(timer.timer_slot)}/status`, {
      accumulated_elapsed_seconds: readElapsedSeconds(timer),
      last_active_start_time: new Date().toISOString(),
      timer_status: timerStatus,
    });
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Timer could not be updated.", { isError: true });
  }
}

async function saveTaskTimer(taskId, timerStatus, elapsedSeconds, activeTimerId = "") {
  setStatus(timerStatus === "running" ? "Starting task timer..." : "Pausing task timer...");
  try {
    await api.putJson(`/api/tasks/${encodeURIComponent(taskId)}/timer`, {
      active_timer_id: activeTimerId,
      timer_status: timerStatus,
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: new Date().toISOString(),
    });
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Task timer could not be updated.", { isError: true });
  }
}

async function startTaskTimer(task) {
  pendingActivatedTimerKey = `task:${task.task_id}`;
  await saveTaskTimer(task.task_id, "running", task.timer ? readElapsedSeconds(task.timer) : 0, task.timer?.active_timer_id || "");
}

async function pauseTaskTimer(task) {
  if (task.timer) {
    await saveTaskTimer(task.task_id, "paused", readElapsedSeconds(task.timer), task.timer.active_timer_id);
  }
}

async function finalizeTaskTimer(task) {
  if (!task.timer) {
    return;
  }

  setStatus("Saving task time...");
  try {
    await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer/finalize`, {
      duration_seconds: Math.max(1, readElapsedSeconds(task.timer)),
      end_time: new Date().toISOString(),
    });
    await loadWorkbench();
    setStatus("Task time saved.");
  } catch (error) {
    setStatus(error.message || "Task time could not be saved.", { isError: true });
  }
}

async function completeTask(task) {
  const confirmed = await modal.confirm({
    title: "Complete task",
    message: `Complete "${task.title}"?`,
    confirmLabel: "Complete",
  });

  if (!confirmed) {
    return;
  }

  setStatus("Completing task...");
  try {
    await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/complete`, {});
    await loadWorkbench();
    setStatus("Task completed.");
  } catch (error) {
    setStatus(error.message || "Task could not be completed.", { isError: true });
  }
}

async function openAddTaskAction() {
  setStatus("Opening task form...");
  try {
    const result = await window.LongtailForge.moduleActions.open("tasks.add", {
      context: { source: "workbench" },
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      setStatus("Task created.");
      return;
    }
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task form could not be opened.", { isError: true });
  }
}

async function openTaskAction(task) {
  setStatus("Opening task...");
  try {
    const result = await window.LongtailForge.moduleActions.open("tasks.edit", {
      context: { source: "workbench", sourceType: "task-workbench-item" },
      recordId: task.task_id,
      taskId: task.task_id,
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      setStatus("Task updated.");
      return;
    }
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task could not be opened.", { isError: true });
  }
}

async function finalizeTimer(timer) {
  const durationSeconds = Math.max(1, readElapsedSeconds(timer));
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - durationSeconds * 1000);

  setStatus("Saving time...");
  try {
    await api.postJson(`/api/active-timers/${encodeURIComponent(timer.timer_slot)}/finalize`, {
      client_id: timer.client_id,
      client_name: timer.client_name,
      project_id: timer.project_id,
      project_name: timer.project_name,
      description: timer.description || timer.source_label,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
      duration_hours: (durationSeconds / 3600).toFixed(4),
      billable: timer.billable,
      invoice_status: "unbilled",
    });
    await loadWorkbench();
    setStatus("Time saved.");
  } catch (error) {
    setStatus(error.message || "Time could not be saved.", { isError: true });
  }
}

async function discardTimer(timer) {
  const confirmed = await modal.confirm({
    title: "Discard timer",
    message: `Discard "${timer.source_label || timer.description || "this timer"}"?`,
    confirmLabel: "Discard",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Discarding timer...");
  try {
    await api.deleteJson(`/api/active-timers/${encodeURIComponent(timer.timer_slot)}`);
    await loadWorkbench();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Timer could not be discarded.", { isError: true });
  }
}

function populateManualTimerForm() {
  replaceOptions(manualClientInput, [
    option("", "Select a client"),
    ...state.clients.map((client) => option(client.id, clientOptionLabel(client))),
  ]);
  if (state.clients.length === 1 && state.clients[0].isWorkspaceScope) {
    manualClientInput.value = state.clients[0].id;
  }
  populateManualProjects();
}

function populateManualProjects(options = {}) {
  const client = currentManualClient();
  const projects = client?.projects || [];

  replaceOptions(manualProjectInput, [
    option("", "Select a project"),
    ...projects.map((project) => option(project.id, project.name)),
  ]);
  updateManualBillableDefault({ notify: Boolean(options.notifyBillableChange) });
}

function updateManualTimerState() {
  const enabled = state.modules.timeTracking?.enabled === true && state.clients.length > 0;
  manualTimerForm.hidden = !enabled;
}

function currentManualClient() {
  return state.clients.find((client) => client.id === manualClientInput.value);
}

function currentManualProject(client) {
  return (client?.projects || []).find((project) => project.id === manualProjectInput.value);
}

function nextManualTimerSlot() {
  const manualSlots = new Set(state.timers
    .filter((timer) => timer.source_type === "manual")
    .map((timer) => Number.parseInt(timer.timer_slot, 10))
    .filter(Number.isFinite));
  let slot = 1;

  while (manualSlots.has(slot)) {
    slot += 1;
  }

  return String(slot);
}

function updateManualBillableDefault(options = {}) {
  const selectedClient = currentManualClient();
  const selectedProject = currentManualProject(selectedClient);
  const billableSource = selectedProject || selectedClient;
  const nextChecked = billableSource?.billable !== "no";
  const changed = manualBillableInput.checked !== nextChecked;

  manualBillableInput.checked = nextChecked;
  if (changed && options.notify) {
    flashManualBillableFlag();
  }
}

function flashManualBillableFlag() {
  const label = manualBillableInput.closest("label");

  if (!label) {
    return;
  }

  flashElement(label, "is-billable-inherited");
}

function flashActivatedTimer(timers) {
  if (!pendingActivatedTimerKey) {
    return;
  }

  const activatedTimer = timers.find((timer) =>
    timer.timer_status === "running" && timerKey(timer) === pendingActivatedTimerKey,
  );
  pendingActivatedTimerKey = "";

  if (!activatedTimer) {
    return;
  }

  const card = timerList.querySelector(`[data-workbench-timer-key="${cssEscape(timerKey(activatedTimer))}"]`);
  if (card) {
    flashElement(card, "is-newly-active");
  }
}

function flashElement(element, className) {
  element.classList.remove(className);
  window.setTimeout(() => {
    const handleAnimationEnd = () => {
      element.classList.remove(className);
      element.removeEventListener("animationend", handleAnimationEnd);
    };

    element.addEventListener("animationend", handleAnimationEnd);
    element.classList.add(className);
  }, 0);
}

function filteredTasks() {
  const today = todayKey();
  const soon = addDaysKey(today, 7);

  return state.taskItems.filter((task) => {
    if (state.taskFilter === "assigned") {
      return task.assigned_to_current_user && isActiveTask(task);
    }
    if (state.taskFilter === "today") {
      return task.due_date === today && isActiveTask(task);
    }
    if (state.taskFilter === "soon") {
      return Boolean(task.due_date && task.due_date >= today && task.due_date <= soon && isActiveTask(task));
    }
    if (state.taskFilter === "overdue") {
      return Boolean(task.due_date && task.due_date < today && isActiveTask(task));
    }
    if (state.taskFilter === "in_progress") {
      return task.status === "in_progress";
    }
    if (state.taskFilter === "has_timer") {
      return Boolean(task.timer);
    }

    return isActiveTask(task);
  });
}

function sortedTasks(tasks) {
  const projectSortOrders = readTaskProjectSortOrders(tasks);

  return [...tasks].sort((first, second) => {
    if (taskSortInput?.value === "priority_desc") {
      return priorityRank(second.priority) - priorityRank(first.priority) || dueSortValue(first).localeCompare(dueSortValue(second));
    }
    if (taskSortInput?.value === "status_asc") {
      return String(first.status || "").localeCompare(String(second.status || "")) || dueSortValue(first).localeCompare(dueSortValue(second));
    }
    if (projectSortOrders.size > 0) {
      const projectOrderResult = compareByProjectSortOrder(first, second, projectSortOrders);
      if (projectOrderResult !== 0) {
        return projectOrderResult;
      }
    }
    return dueSortValue(first).localeCompare(dueSortValue(second)) || priorityRank(second.priority) - priorityRank(first.priority);
  });
}

function readTaskProjectSortOrders(tasks) {
  if ((taskSortInput?.value || "due_asc") !== "due_asc") {
    return new Map();
  }

  const projectsById = new Map((state.taskOptions?.projects || []).map((project) => [project.id, project]));
  const projectSortOrders = new Map();

  tasks.forEach((task) => {
    const projectId = task.project_id || "";
    if (!projectId || projectSortOrders.has(projectId)) {
      return;
    }

    const sortOrder = normalizeProjectTaskSortOrder(projectsById.get(projectId)?.taskDefaults?.sortOrder || []);
    if (sortOrder.length > 0) {
      projectSortOrders.set(projectId, sortOrder);
    }
  });

  return projectSortOrders;
}

function compareByProjectSortOrder(firstTask, secondTask, projectSortOrders) {
  if ((firstTask.project_id || "") !== (secondTask.project_id || "")) {
    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
  }

  const sortOrder = projectSortOrders.get(firstTask.project_id || "");
  if (!sortOrder) {
    return 0;
  }

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

function normalizeProjectTaskSortOrder(value) {
  const rawItems = Array.isArray(value) ? value : [];
  const allowed = ["due_date", "priority", "status"];
  const ordered = rawItems.filter((item) => allowed.includes(item));

  allowed.forEach((item) => {
    if (!ordered.includes(item)) {
      ordered.push(item);
    }
  });

  return ordered.length === allowed.length ? ordered : [];
}

function sortedTimers(timers) {
  return [...timers].sort((first, second) => {
    if (first.timer_status !== second.timer_status) {
      return first.timer_status === "running" ? -1 : 1;
    }
    return String(second.updated_at || "").localeCompare(String(first.updated_at || ""));
  });
}

function timerKey(timer) {
  if (timer.source_type === "task" && timer.source_id) {
    return `task:${timer.source_id}`;
  }

  if (timer.source_type === "manual") {
    return `manual-slot:${timer.timer_slot}`;
  }

  return `timer:${timer.active_timer_id || timer.timer_slot || ""}`;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replaceAll('"', '\\"');
}

function handleTaskFilterClick(event) {
  const button = event.target.closest("[data-workbench-task-filter]");

  if (!button) {
    return;
  }

  const filter = TASK_FILTERS.has(button.dataset.workbenchTaskFilter) ? button.dataset.workbenchTaskFilter : "assigned";
  state.taskFilter = filter;
  window.localStorage.setItem(WORKBENCH_TASK_FILTER_KEY, filter);
  renderTasks();
}

function updateTaskFilterState() {
  taskFilters?.querySelectorAll("[data-workbench-task-filter]").forEach((button) => {
    button.dataset.active = button.dataset.workbenchTaskFilter === state.taskFilter ? "true" : "false";
  });
}

function restoreTaskFilter() {
  const saved = window.localStorage.getItem(WORKBENCH_TASK_FILTER_KEY);
  state.taskFilter = TASK_FILTERS.has(saved) ? saved : "assigned";
}

function restoreCardState() {
  const savedState = readCardState();

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    const cardId = card.dataset.workbenchCard;
    if (Object.hasOwn(savedState, cardId)) {
      card.open = Boolean(savedState[cardId]);
    }
  });
}

function persistCardState() {
  const stateByCard = {};

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    stateByCard[card.dataset.workbenchCard] = card.open;
  });
  window.localStorage.setItem(WORKBENCH_CARD_STATE_KEY, JSON.stringify(stateByCard));
}

function readCardState() {
  try {
    const value = JSON.parse(window.localStorage.getItem(WORKBENCH_CARD_STATE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function startTicking() {
  if (tickIntervalId) {
    window.clearInterval(tickIntervalId);
  }

  tickIntervalId = window.setInterval(() => {
    state.timers.forEach((timer) => {
      const element = document.querySelector(`[data-workbench-duration="${timer.active_timer_id}"]`);
      if (element) {
        element.textContent = formatDuration(readElapsedSeconds(timer));
      }
    });
  }, 1000);
}

function readElapsedSeconds(timer) {
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

function normalizeClientProjectOptions(data) {
  return window.LongtailForge.clientProjectOptions.normalizeClients(data);
}

function clientOptionLabel(client) {
  return window.LongtailForge.clientProjectOptions.optionLabel(client);
}

function taskCanUseTimer(task) {
  return state.modules.tasks?.enabled === true &&
    state.modules.timeTracking?.enabled === true &&
    task.project_id &&
    task.status !== "complete" &&
    task.status !== "archived";
}

function isActiveTask(task) {
  return task.status !== "complete" && task.status !== "archived";
}

function taskDetailText(task) {
  const parts = [
    [task.client_name, task.project_name].filter(Boolean).join(" / "),
    task.due_date ? `Due ${formatDue(task)}` : "",
    task.assignees?.length ? task.assignees.map(displayUser).join(", ") : "Unassigned",
  ].filter(Boolean);

  return parts.join(" | ");
}

function sourceLabel(timer) {
  if (timer.source_type === "task") {
    return "Task";
  }

  return "Manual";
}

function displayUser(user) {
  return String(user.displayName || user.display_name || user.username || user.user_id || "").trim();
}

function formatDue(task) {
  if (!task.due_date) {
    return "No due date";
  }

  return task.due_time ? `${task.due_date} ${task.due_time}` : task.due_date;
}

function dueSortValue(task) {
  return `${task.due_date || "9999-12-31"}T${task.due_time || "23:59"}`;
}

function priorityRank(priority) {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[priority] || 0;
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
}

function badge(label, type = "") {
  const element = document.createElement("span");
  element.className = "workbench-badge";
  if (type) {
    element.dataset.badgeType = type;
  }
  element.textContent = label;
  return element;
}

function actionButton(label, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("danger-button", Boolean(options.danger));
  button.addEventListener("click", handler);
  return button;
}

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "workbench-empty-state";
  element.textContent = message;
  return element;
}

function replaceOptions(select, options) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  select.replaceChildren(...options);
  if ([...select.options].some((item) => item.value === previousValue)) {
    select.value = previousValue;
  }
}

function option(value, label) {
  return window.LongtailForge.pageController.createOption(value, label);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatToken(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setStatus(message, options = {}) {
  statusText.textContent = message;
  statusText.classList.toggle("is-error", Boolean(options.isError));
}

window.LongtailForge.pageController.register("workbench", {
  snapshot: () => ({
    taskCount: state.taskItems.length,
    taskFilter: state.taskFilter,
    timerCount: state.timers.length,
    tasksEnabled: state.modules.tasks?.enabled === true,
    timeTrackingEnabled: state.modules.timeTracking?.enabled === true,
    moduleActionCount: window.LongtailForge.moduleActions?.list?.().length || 0,
  }),
});
