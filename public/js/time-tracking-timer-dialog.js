/* global CustomEvent */

(function attachTimeTrackingTimerDialog(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const pageController = namespace.pageController;

  const TIMER_ACTION_ID = "time-tracking.timer.create";
  const MAX_MANUAL_TIMER_SLOTS = 4;

  let context = null;
  let dialog = null;
  let form = null;
  let fields = {};
  let clients = [];
  let taskOptions = [];
  let activeManualTimers = [];
  let dialogSettled = false;

  async function openCreate(params = {}, hostContext = null) {
    await prepareContext({ hostContext, params });
    return openDialog(params);
  }

  async function prepareContext({ hostContext = null, params = {} } = {}) {
    await namespace.workspaceContextReady;
    const [clientProjectData, taskOptionsData, activeTimersData] = await Promise.all([
      api.getJson("/api/client-projects", { cache: "no-store" }),
      loadTaskOptions(),
      api.getJson("/api/active-timers", { cache: "no-store" }),
    ]);

    clients = namespace.clientProjectOptions.normalizeClients(clientProjectData);
    taskOptions = normalizeTaskOptions(taskOptionsData);
    activeManualTimers = Array.isArray(activeTimersData?.timers) ? activeTimersData.timers : [];
    context = {
      hostContext,
      params,
      setStatus: (message, options = {}) => hostContext?.setStatus?.(message, options),
    };
    ensureDialog();
  }

  async function loadTaskOptions() {
    if (!workspaceHasTasks()) {
      return { options: { tasks: [] } };
    }

    try {
      return await api.getJson("/api/tasks?status=active&limit=200", { cache: "no-store" });
    } catch {
      return { options: { tasks: [] } };
    }
  }

  function workspaceHasTasks() {
    const enabledModules = namespace.workspaceContext?.enabledModules || [];
    return !Array.isArray(enabledModules) || enabledModules.length === 0 || enabledModules.includes("tasks");
  }

  function openDialog(params = {}) {
    ensureDialog();
    dialogSettled = false;

    populateClientOptions();
    fields.client.value = params.clientId || params.client_id || "";
    selectWorkspaceScopeClientIfNeeded();
    populateProjectOptions(params.projectId || params.project_id || "");
    fields.task.value = params.taskId || params.task_id || "";
    populateTaskOptions(fields.task.value);
    fields.description.value = params.description || "";
    if (fields.task.value) {
      handleTaskChange();
    } else {
      updateBillableDefault();
    }
    fields.billableControl.hidden = !workspaceUsesBillableFlag();
    if (!workspaceUsesBillableFlag()) {
      fields.billable.value = "no";
    }
    setStatus("");
    fields.save.disabled = false;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    fields.client.focus();

    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        if (!dialogSettled) {
          context?.hostContext?.cancel?.({ actionId: TIMER_ACTION_ID });
        }
        resolve(dialog.returnValue || "closed");
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = document.querySelector("[data-time-tracking-timer-dialog]");

    if (!dialog) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = dialogMarkup();
      document.body.append(...wrapper.children);
      dialog = document.querySelector("[data-time-tracking-timer-dialog]");
    }

    form = dialog.querySelector("[data-time-tracking-timer-dialog-form]");
    fields = {
      billable: dialog.querySelector("[data-time-tracking-timer-dialog-billable]"),
      billableControl: dialog.querySelector("[data-time-tracking-timer-dialog-billable-control]"),
      cancel: dialog.querySelector("[data-time-tracking-timer-dialog-cancel]"),
      client: dialog.querySelector("[data-time-tracking-timer-dialog-client]"),
      description: dialog.querySelector("[data-time-tracking-timer-dialog-description]"),
      project: dialog.querySelector("[data-time-tracking-timer-dialog-project]"),
      save: dialog.querySelector("[data-time-tracking-timer-dialog-save]"),
      status: dialog.querySelector("[data-time-tracking-timer-dialog-status]"),
      task: dialog.querySelector("[data-time-tracking-timer-dialog-task]"),
    };

    if (form.dataset.timeTrackingTimerDialogBound === "true") {
      return;
    }

    form.dataset.timeTrackingTimerDialogBound = "true";
    form.addEventListener("submit", startTimer);
    fields.cancel.addEventListener("click", cancelDialog);
    fields.client.addEventListener("change", () => {
      populateProjectOptions();
      populateTaskOptions();
      updateBillableDefault();
    });
    fields.project.addEventListener("change", () => {
      populateTaskOptions();
      updateBillableDefault();
    });
    fields.task.addEventListener("change", handleTaskChange);
  }

  function cancelDialog() {
    dialogSettled = true;
    context?.hostContext?.cancel?.({ actionId: TIMER_ACTION_ID });
    dialog.close("cancel");
  }

  function populateClientOptions() {
    fields.client.replaceChildren(createOption("", "Select a client"));
    clients.forEach((client) => {
      fields.client.appendChild(createOption(client.id, clientOptionLabel(client)));
    });
    fields.client.disabled = clients.length === 0;
  }

  function populateProjectOptions(projectId = "") {
    const client = getClient(fields.client.value);
    fields.project.replaceChildren(createOption("", "Select a project"));
    fields.project.disabled = !client;

    if (!client) {
      return;
    }

    client.projects.forEach((project) => {
      fields.project.appendChild(createOption(project.id, projectOptionLabel(project)));
    });
    fields.project.value = client.projects.some((project) => project.id === projectId) ? projectId : "";
  }

  function populateTaskOptions(taskId = fields.task.value) {
    const selectedProjectId = fields.project.value;
    const taskCandidates = taskOptions.filter((task) => (
      task.project_id && (!selectedProjectId || task.project_id === selectedProjectId)
    ));

    fields.task.replaceChildren(createOption("", "No task"));
    taskCandidates.forEach((task) => {
      fields.task.appendChild(createOption(task.id, task.optionLabel || task.label || "Untitled Task"));
    });
    fields.task.value = taskCandidates.some((task) => task.id === taskId) ? taskId : "";
    fields.task.disabled = taskOptions.length === 0;
  }

  function handleTaskChange() {
    const task = getTask(fields.task.value);

    if (!task) {
      updateBillableDefault();
      return;
    }

    const clientId = findClientIdForTask(task);
    if (clientId) {
      fields.client.value = clientId;
      populateProjectOptions(task.project_id || "");
      fields.project.value = task.project_id || "";
    }
    populateTaskOptions(task.id);
    if (!fields.description.value.trim()) {
      fields.description.value = task.label || "";
    }
    updateBillableDefault();
  }

  async function startTimer(event) {
    event.preventDefault();
    const task = getTask(fields.task.value);
    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);

    if (!project) {
      setStatus("Select a project.", { isError: true });
      return;
    }

    fields.save.disabled = true;
    setStatus("Starting timer...");

    try {
      const result = task
        ? await startTaskTimer(task)
        : await startManualTimer({ client, project });
      await notifyTimerStarted(result);
      dialogSettled = true;
      context?.hostContext?.complete?.({
        actionId: TIMER_ACTION_ID,
        recordId: task?.id || result?.timer?.active_timer_id || "",
        sourceType: task ? "task" : "manual",
        timer: result?.timer || null,
      });
      dialog.close("complete");
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Timer could not be started.", { isError: true });
    } finally {
      fields.save.disabled = false;
    }
  }

  function startTaskTimer(task) {
    const now = new Date().toISOString();

    return api.putJson(`/api/tasks/${encodeURIComponent(task.id)}/timer`, {
      active_task_timer_id: "",
      accumulated_elapsed_seconds: 0,
      billable: workspaceBillableValue(),
      description: fields.description.value.trim(),
      last_active_start_time: now,
      timer_status: "running",
    });
  }

  function startManualTimer({ client, project }) {
    const timerSlot = nextManualTimerSlot();
    if (!timerSlot) {
      throw new Error("All manual timer slots are already in use.");
    }

    return api.putJson(`/api/active-timers/${encodeURIComponent(timerSlot)}`, {
      active_timer_id: "",
      accumulated_elapsed_seconds: 0,
      billable: workspaceBillableValue(),
      client_id: client?.isWorkspaceScope ? "" : client?.id || "",
      client_name: client?.isWorkspaceScope ? "" : client?.name || "",
      description: fields.description.value.trim(),
      last_active_start_time: new Date().toISOString(),
      project_id: project.id,
      project_name: project.name,
      timer_slot: timerSlot,
      timer_status: "running",
    });
  }

  async function notifyTimerStarted(result) {
    const detail = {
      actionId: TIMER_ACTION_ID,
      result,
      source: "time-tracking-create-timer",
    };
    const hostRefresh = context?.hostContext?.refresh;

    if (typeof hostRefresh === "function") {
      await hostRefresh(detail);
    }
    global.dispatchEvent?.(new CustomEvent("longtailforge:timers-changed", { detail }));
  }

  function nextManualTimerSlot() {
    const usedSlots = new Set(activeManualTimers.map((timer) => String(timer.timer_slot || "")));
    for (let index = 1; index <= MAX_MANUAL_TIMER_SLOTS; index += 1) {
      const slot = String(index);
      if (!usedSlots.has(slot)) {
        return slot;
      }
    }
    return "";
  }

  function selectWorkspaceScopeClientIfNeeded() {
    if (workspaceShowsClientTools()) {
      return;
    }

    const workspaceClient = clients.find((client) => client.isWorkspaceScope);
    if (workspaceClient) {
      fields.client.value = workspaceClient.id;
      populateProjectOptions();
    }
  }

  function updateBillableDefault() {
    if (!workspaceUsesBillableFlag()) {
      fields.billable.value = "no";
      return;
    }

    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);
    const billableSource = project || client;
    fields.billable.value = billableSource?.billable === "no" ? "no" : "yes";
  }

  function getClient(clientId) {
    return clients.find((client) => client.id === clientId);
  }

  function getProject(clientId, projectId) {
    return getClient(clientId)?.projects.find((project) => project.id === projectId) || null;
  }

  function getTask(taskId) {
    return taskOptions.find((task) => task.id === taskId) || null;
  }

  function findClientIdForTask(task) {
    const taskClientId = task.client_id || "";
    if (taskClientId) {
      const directClient = clients.find((client) => client.id === taskClientId);
      if (directClient) {
        return directClient.id;
      }
    }

    return clients.find((client) => (
      Array.isArray(client.projects) &&
      client.projects.some((project) => project.id === task.project_id)
    ))?.id || "";
  }

  function normalizeTaskOptions(data) {
    return Array.isArray(data?.options?.tasks)
      ? data.options.tasks
          .filter((task) => task?.id && task?.status !== "complete" && task?.status !== "archived")
          .map((task) => ({
            client_id: task.client_id || "",
            id: task.id || task.task_id,
            label: task.label || task.title || "Untitled Task",
            optionLabel: task.optionLabel || task.displayName || task.label || "Untitled Task",
            project_id: task.project_id || "",
            status: task.status || "open",
          }))
      : [];
  }

  function clientOptionLabel(client) {
    return namespace.clientProjectOptions.optionLabel(client);
  }

  function projectOptionLabel(project) {
    return namespace.clientProjectOptions.optionLabel(project);
  }

  function workspaceShowsClientTools() {
    const tools = namespace.workspaceContext?.workspaceCapabilities?.availableTools || [];
    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  function workspaceUsesBillableFlag() {
    return namespace.workspaceContext?.workspaceType === "business";
  }

  function workspaceBillableValue() {
    return workspaceUsesBillableFlag() && fields.billable.value === "yes" ? "yes" : "no";
  }

  function createOption(value, text) {
    return pageController.createOption(value, text);
  }

  function setStatus(message, options = {}) {
    if (fields.status) {
      fields.status.textContent = message || "";
      fields.status.classList.toggle("error-text", Boolean(options.isError));
    }

    context?.setStatus?.(message, options);
  }

  function dialogMarkup() {
    return `
      <dialog class="time-entry-dialog time-tracking-timer-dialog" data-time-tracking-timer-dialog>
        <form method="dialog" class="entry-form" data-time-tracking-timer-dialog-form>
          <h2>Create Timer</h2>
          <label data-client-workspace-control>Client<select data-time-tracking-timer-dialog-client required></select></label>
          <label>Project<select data-time-tracking-timer-dialog-project required disabled></select></label>
          <label>Task<select data-time-tracking-timer-dialog-task><option value="">No task</option></select></label>
          <label data-time-tracking-timer-dialog-billable-control>Billable<select data-time-tracking-timer-dialog-billable><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label class="entry-description">Description<textarea rows="4" data-time-tracking-timer-dialog-description placeholder="What are you working on?"></textarea></label>
          <p data-time-tracking-timer-dialog-status role="status" aria-live="polite"></p>
          <div class="form-actions entry-actions"><button type="button" data-time-tracking-timer-dialog-cancel>Cancel</button><button type="submit" data-time-tracking-timer-dialog-save>Start Timer</button></div>
        </form>
      </dialog>
    `;
  }

  const timeTrackingTimerDialogApi = {
    openCreate,
  };

  namespace.timeTrackingTimerDialog = timeTrackingTimerDialogApi;
  namespace.moduleActions?.register?.({
    actionId: TIMER_ACTION_ID,
    id: TIMER_ACTION_ID,
    label: "Create Timer",
    mode: "create",
    moduleId: "time-tracking",
    open: openCreate,
    recordType: "active_timer",
    requiredModules: ["time-tracking"],
    requiredPermissions: ["time_entries.create"],
    requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
    title: "Create Timer",
  });

  global.LongtailForge = namespace;
}(window));
