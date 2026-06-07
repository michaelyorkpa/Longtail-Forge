(function attachTaskDialog(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const modal = namespace.modal;
  const pageController = namespace.pageController;

  let context = null;
  let tagPicker = null;
  let recurrenceDraft = defaultRecurrenceDraft();
  let taskTimers = [];
  let taskTimerIntervalId = null;
  let currentTask = null;
  let currentTaskId = "";
  let dialog = null;
  let recurrenceDialog = null;
  let form = null;
  let fields = {};

  function configure(options = {}) {
    context = {
      currentUserId: "",
      hostContext: null,
      onSaved: null,
      options: defaultTaskOptions(),
      setStatus: null,
      taskTimers: [],
      tasks: [],
      ...context,
      ...options,
    };
    taskTimers = Array.isArray(context.taskTimers) ? context.taskTimers : taskTimers;
    ensureDialog();
    populateFormOptions();
    return taskDialogApi;
  }

  async function openAdd(params = {}, hostContext = null) {
    const prepared = await prepareStandaloneContext({ hostContext, params });
    configure(prepared);
    return open({
      defaults: params,
      hostContext,
      task: null,
    });
  }

  async function openEdit(params = {}, hostContext = null) {
    const taskId = params.taskId || params.recordId || params.id || "";
    if (!taskId) {
      throw new Error("Task ID is required.");
    }

    const prepared = await prepareStandaloneContext({ hostContext, params, taskId });
    configure(prepared);
    return open({
      hostContext,
      task: prepared.task,
    });
  }

  async function prepareStandaloneContext({ hostContext = null, taskId = "" } = {}) {
    await namespace.workspaceContextReady;
    await namespace.timezones?.loadSessionTimezone?.();
    const [taskResult, tasksResult, timersResult, tagOptions] = await Promise.all([
      taskId ? api.getJson(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" }) : Promise.resolve(null),
      taskId ? Promise.resolve(null) : api.getJson("/api/tasks", { cache: "no-store" }),
      loadTaskTimers(),
      loadTagOptions(),
    ]);
    const source = taskResult || tasksResult || {};
    const task = taskResult?.task || null;

    return {
      currentUserId: source.currentUserId || readCurrentUserId(),
      hostContext,
      options: source.options || defaultTaskOptions(),
      setStatus: (message, options = {}) => hostContext?.setStatus?.(message, options),
      tagOptions,
      task,
      taskTimers: timersResult.timers || [],
      tasks: task ? [task] : source.tasks || [],
    };
  }

  function open({ task = null, duplicate = false, defaults = {}, hostContext = null } = {}) {
    ensureDialog();
    const isDuplicate = duplicate === true;

    currentTask = isDuplicate ? null : task;
    currentTaskId = isDuplicate ? "" : task?.task_id || "";
    context = {
      ...context,
      hostContext: hostContext || context?.hostContext || null,
    };

    fields.title.textContent = isDuplicate ? "Duplicate Task" : task ? "Edit Task" : "Add Task";
    fields.copyLink.hidden = !task || isDuplicate;
    fields.titleInput.value = isDuplicate && task?.title ? `Copy of ${task.title}` : task?.title || "";
    fields.status.value = isDuplicate ? "open" : task?.status || "open";
    fields.priority.value = task?.priority || "normal";
    fields.client.value = task ? task.client_id || "" : defaults.clientId || defaults.client_id || "all";
    populateProjectInput(task?.project_id || defaults.projectId || defaults.project_id || "");
    if (!task) {
      applySelectedProjectTaskDefaults();
    }
    fields.dueDate.value = task?.due_date || defaults.dueDate || defaults.due_date || "";
    fields.dueTime.value = task?.due_time || defaults.dueTime || defaults.due_time || "";
    fields.description.value = task?.description || defaults.description || "";
    selectAssignees(task?.assignee_ids || (task ? [] : [currentUserId()]));
    writeRecurrenceFields(isDuplicate ? null : task?.recurrenceDetails);
    writeReminderFields(task?.reminderDetails);
    writeTaskTimerFields(isDuplicate ? null : task);
    mountTaskTagPicker(isDuplicate ? [] : task?.tags || []);
    writeTaskNotificationFollowFields(isDuplicate ? null : task);

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    fields.titleInput.focus();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        clearTaskTimerInterval();
        resolve(dialog.returnValue || "closed");
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = document.querySelector("[data-task-dialog]");
    recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");

    if (!dialog) {
      const fragment = document.createElement("div");
      fragment.innerHTML = taskDialogMarkup();
      document.body.append(...fragment.children);
      dialog = document.querySelector("[data-task-dialog]");
      recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");
    }

    form = dialog.querySelector("[data-task-form]");
    fields = {
      assignees: dialog.querySelector("[data-task-assignees]"),
      cancel: dialog.querySelector("[data-cancel-task]"),
      client: dialog.querySelector("[data-task-client]"),
      copyLink: dialog.querySelector("[data-copy-task-link]"),
      description: dialog.querySelector("[data-task-description]"),
      dueDate: dialog.querySelector("[data-task-due-date]"),
      dueTime: dialog.querySelector("[data-task-due-time]"),
      effectiveReminders: dialog.querySelector("[data-task-effective-reminders]"),
      priority: dialog.querySelector("[data-task-priority]"),
      project: dialog.querySelector("[data-task-project]"),
      recurrenceDetails: dialog.querySelector("[data-task-recurrence-details]"),
      recurrenceSummary: dialog.querySelector("[data-task-recurrence-summary]"),
      recurring: dialog.querySelector("[data-task-recurring]"),
      reminderDateOnlyDays1: dialog.querySelector("[data-task-reminder-date-only-days-1]"),
      reminderDateOnlyDays2: dialog.querySelector("[data-task-reminder-date-only-days-2]"),
      reminderDateTimeHours1: dialog.querySelector("[data-task-reminder-date-time-hours-1]"),
      reminderDateTimeHours2: dialog.querySelector("[data-task-reminder-date-time-hours-2]"),
      reminderOverride: dialog.querySelector("[data-task-reminder-override]"),
      reminderOverrideFields: dialog.querySelector("[data-task-reminder-override-fields]"),
      status: dialog.querySelector("[data-task-form-status]"),
      tagContainer: dialog.querySelector("[data-task-tags]"),
      notificationField: dialog.querySelector("[data-task-notification-field]"),
      notificationFollow: dialog.querySelector("[data-task-notification-follow]"),
      notificationStatus: dialog.querySelector("[data-task-notification-status]"),
      timerDisplay: dialog.querySelector("[data-task-timer-display]"),
      timerField: dialog.querySelector("[data-task-timer-field]"),
      timerFinalize: dialog.querySelector("[data-task-timer-finalize]"),
      timerPause: dialog.querySelector("[data-task-timer-pause]"),
      timerReset: dialog.querySelector("[data-task-timer-reset]"),
      timerStart: dialog.querySelector("[data-task-timer-start]"),
      timerStatus: dialog.querySelector("[data-task-timer-status]"),
      title: dialog.querySelector("[data-task-dialog-title]"),
      titleInput: dialog.querySelector("[data-task-title]"),
    };
    fields.recurrence = {
      cancel: recurrenceDialog.querySelector("[data-task-recurrence-cancel]"),
      endDate: recurrenceDialog.querySelector("[data-task-recurrence-end-date]"),
      form: recurrenceDialog.querySelector("[data-task-recurrence-form]"),
      frequency: recurrenceDialog.querySelector("[data-task-recurrence-frequency]"),
      interval: recurrenceDialog.querySelector("[data-task-recurrence-interval]"),
    };
    decorateTaskDialogControls();

    if (form.dataset.taskDialogBound === "true") {
      return;
    }

    form.dataset.taskDialogBound = "true";
    form.addEventListener("submit", saveTask);
    fields.cancel?.addEventListener("click", () => {
      context?.hostContext?.cancel?.({ actionId: currentTaskId ? "tasks.edit" : "tasks.add" });
      dialog.close("cancel");
    });
    fields.copyLink?.addEventListener("click", copyCurrentTaskLink);
    fields.client?.addEventListener("change", () => populateProjectInput(fields.project.value));
    fields.project?.addEventListener("change", applySelectedProjectTaskDefaults);
    fields.reminderOverride?.addEventListener("change", updateReminderOverrideState);
    fields.recurring?.addEventListener("change", updateRecurrenceState);
    fields.recurrenceDetails?.addEventListener("click", openRecurrenceDialog);
    fields.recurrence.cancel?.addEventListener("click", () => recurrenceDialog?.close());
    fields.recurrence.form?.addEventListener("submit", saveRecurrenceDraft);
    fields.timerStart?.addEventListener("click", () => saveTaskTimer("running"));
    fields.timerPause?.addEventListener("click", () => saveTaskTimer("paused"));
    fields.timerFinalize?.addEventListener("click", finalizeTaskTimer);
    fields.timerReset?.addEventListener("click", resetTaskTimer);
    fields.notificationFollow?.addEventListener("click", toggleTaskNotificationFollow);
  }

  function decorateTaskDialogControls() {
    const icons = namespace.icons;

    if (!icons?.decorateButton) {
      return;
    }

    icons.decorateButton(fields.timerStart, { icon: "start", label: "Start task timer", text: "Start", iconOnly: false });
    icons.decorateButton(fields.timerPause, { icon: "pause", label: "Pause task timer", text: "Pause", iconOnly: false });
    icons.decorateButton(fields.timerFinalize, { icon: "save", label: "Save task timer as time", text: "Save Time", iconOnly: false });
    icons.decorateButton(fields.timerReset, { icon: "restore", label: "Reset task timer", text: "Reset", iconOnly: false, variant: "danger" });
  }

  function populateFormOptions() {
    if (!form) {
      return;
    }

    const options = context?.options || defaultTaskOptions();
    const hasClientScope = usesClientScope();

    dialog.querySelectorAll("[data-client-workspace-control]").forEach((element) => {
      element.hidden = !hasClientScope;
    });

    replaceOptions(fields.client, hasClientScope
      ? [
        option("all", "All Projects"),
        option("", getWorkspaceScopeLabel()),
        ...sortClientOptions(options.clients).map((client) => option(client.id, `${treeIndent(getClientDepth(client))}${client.name}`)),
      ]
      : [option("all", "All Projects")]);
    populateProjectInput(fields.project?.value || "");
    replaceOptions(
      fields.assignees,
      (options.users || []).map((user) => option(user.user_id, displayUser(user))),
    );
  }

  function populateProjectInput(selectedProjectId = "") {
    const selectedClientId = usesClientScope() ? fields.client?.value || "all" : "all";
    const projects = (context?.options?.projects || []).filter((project) =>
      selectedClientId === "all" || (project.client_id || "") === selectedClientId,
    );

    replaceOptions(fields.project, [
      option("", selectedClientId === "" ? getWorkspaceScopeLabel() : "No project"),
      ...sortProjectOptions(projects).map((project) => option(project.id, `${treeIndent(getProjectDepth(project))}${project.name}`)),
    ]);

    if (projects.some((project) => project.id === selectedProjectId)) {
      fields.project.value = selectedProjectId;
    }
  }

  function applySelectedProjectTaskDefaults() {
    if (currentTaskId) {
      return;
    }

    const project = (context?.options?.projects || []).find((item) => item.id === fields.project?.value);
    const defaults = project?.taskDefaults || {};

    fields.status.value = taskDefaultStatuses().includes(defaults.status) ? defaults.status : "open";
    fields.priority.value = taskDefaultPriorities().includes(defaults.priority) ? defaults.priority : "normal";
  }

  async function saveTask(event) {
    event.preventDefault();
    const payload = readTaskFormPayload();
    const editingTask = currentTask || (context?.tasks || []).find((task) => task.task_id === currentTaskId);
    const wasEditing = Boolean(currentTaskId);

    if (editingTask?.recurrence_template_id) {
      const applyFuture = await modal.confirm({
        title: "Update recurring task",
        message: "Apply these changes to all future tasks in this recurrence?",
        confirmLabel: "All Future",
        cancelLabel: "Only This Task",
      });
      payload.recurrence.applyTo = applyFuture ? "future" : "instance";
    }

    setStatus(wasEditing ? "Saving task..." : "Creating task...");

    try {
      const result = wasEditing
        ? await api.putJson(`/api/tasks/${encodeURIComponent(currentTaskId)}`, payload)
        : await api.postJson("/api/tasks", payload);
      currentTask = result.task;
      currentTaskId = result.task?.task_id || "";
      if (typeof context?.onSaved === "function") {
        await context.onSaved(result);
      }
      context?.hostContext?.complete?.({
        actionId: wasEditing ? "tasks.edit" : "tasks.add",
        recordId: result.task?.task_id || "",
        title: result.task?.title || "",
      });
      dialog.close("complete");
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Task was not saved.", { isError: true });
    }
  }

  function readTaskFormPayload() {
    return {
      title: fields.titleInput.value,
      status: fields.status.value,
      priority: fields.priority.value,
      client_id: fields.client.value === "all" ? "" : fields.client.value,
      project_id: fields.project.value,
      due_date: fields.dueDate.value,
      due_time: fields.dueTime.value,
      description: fields.description.value,
      assignee_ids: [...fields.assignees.selectedOptions].map((selected) => selected.value),
      recurrence: readRecurrencePayload(),
      reminderOverrideEnabled: fields.reminderOverride.checked,
      reminderPolicy: readReminderPolicy(),
      tagIds: readTaskTagIds(),
    };
  }

  async function mountTaskTagPicker(tags) {
    tagPicker = null;
    if (!fields.tagContainer || !namespace.tags?.mountPicker) {
      fields.tagContainer?.replaceChildren();
      return;
    }

    tagPicker = await namespace.tags.mountPicker(fields.tagContainer, {
      selectedTags: tags,
    });
  }

  function readTaskTagIds() {
    return tagPicker?.readTagIds?.() || [];
  }

  async function writeTaskNotificationFollowFields(task) {
    if (!fields.notificationField || !fields.notificationFollow || !fields.notificationStatus) {
      return;
    }

    const taskId = task?.task_id || "";
    fields.notificationField.hidden = !taskId || !namespace.notificationSubscriptions;

    if (!taskId || !namespace.notificationSubscriptions) {
      return;
    }

    fields.notificationFollow.disabled = true;
    fields.notificationFollow.textContent = "Loading";
    fields.notificationStatus.textContent = "Checking notification follow state...";

    try {
      const result = await namespace.notificationSubscriptions.readStatus(namespace.notificationSubscriptions.taskTarget(taskId));
      writeNotificationFollowState(result.isFollowing === true);
    } catch {
      fields.notificationStatus.textContent = "Notification follow state unavailable.";
      fields.notificationFollow.textContent = "Follow Notifications";
      fields.notificationFollow.disabled = true;
    }
  }

  async function toggleTaskNotificationFollow() {
    if (!currentTaskId || !namespace.notificationSubscriptions) {
      return;
    }

    const isFollowing = fields.notificationFollow?.dataset.isFollowing === "true";
    fields.notificationFollow.disabled = true;
    fields.notificationStatus.textContent = isFollowing ? "Unfollowing task..." : "Following task...";

    try {
      const target = namespace.notificationSubscriptions.taskTarget(currentTaskId);
      const result = isFollowing
        ? await namespace.notificationSubscriptions.unfollow(target)
        : await namespace.notificationSubscriptions.follow(target);

      writeNotificationFollowState(result.isFollowing === true);
      setStatus(result.isFollowing ? "Task notifications followed." : "Task notifications unfollowed.");
    } catch (error) {
      fields.notificationStatus.textContent = error.message || "Notification follow change failed.";
      fields.notificationFollow.disabled = false;
    }
  }

  function writeNotificationFollowState(isFollowing) {
    fields.notificationFollow.dataset.isFollowing = String(isFollowing);
    fields.notificationFollow.textContent = isFollowing ? "Unfollow Notifications" : "Follow Notifications";
    fields.notificationFollow.disabled = false;
    fields.notificationStatus.textContent = isFollowing
      ? "You are following this task and will receive update notifications."
      : "Follow this task to receive update notifications for yourself.";
  }

  async function loadTagOptions() {
    if (!namespace.tags?.loadTags) {
      return [];
    }

    try {
      return await namespace.tags.loadTags();
    } catch {
      return [];
    }
  }

  async function loadTaskTimers() {
    try {
      return await api.getJson("/api/tasks/timers", { cache: "no-store" });
    } catch {
      return { timers: [] };
    }
  }

  async function saveTaskTimer(timerStatus) {
    const task = currentTask;

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
    const task = currentTask;
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
    const task = currentTask;

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

    if (!fields.timerField) {
      return;
    }

    const options = context?.options || defaultTaskOptions();
    const eligible = Boolean(
      task?.task_id &&
      task.project_id &&
      task.status !== "complete" &&
      task.status !== "archived" &&
      options.taskTimersEnabled !== false &&
      options.timeTrackingEnabled !== false,
    );
    const timer = task ? currentTaskTimer(task.task_id) : null;

    fields.timerField.hidden = !task?.task_id;
    fields.timerStart.disabled = !eligible || timer?.timer_status === "running";
    fields.timerPause.disabled = !eligible || timer?.timer_status !== "running";
    fields.timerFinalize.disabled = !eligible || !timer;
    fields.timerReset.disabled = !timer;

    if (!task?.task_id) {
      fields.timerStatus.textContent = "Save the task before using a task timer.";
    } else if (!eligible) {
      fields.timerStatus.textContent = readTaskTimerIneligibleReason(task);
    } else if (timer?.timer_status === "running") {
      fields.timerStatus.textContent = "Running.";
    } else if (timer) {
      fields.timerStatus.textContent = "Paused.";
    } else {
      fields.timerStatus.textContent = "No active timer.";
    }

    updateTaskTimerDisplay(timer);
    if (timer?.timer_status === "running") {
      taskTimerIntervalId = global.setInterval(() => updateTaskTimerDisplay(timer), 1000);
    }
  }

  function readTaskTimerIneligibleReason(task) {
    const options = context?.options || defaultTaskOptions();

    if (options.taskTimersEnabled === false) {
      return "Task timers are disabled.";
    }

    if (options.timeTrackingEnabled === false) {
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

  function currentTaskTimer(taskId) {
    return taskTimers.find((timer) => timer.task_id === taskId);
  }

  function upsertTaskTimer(timer) {
    const existingIndex = taskTimers.findIndex((item) => item.task_id === timer.task_id);
    taskTimers = taskTimers.map((item) =>
      item.timer_status === "running" && item.task_id !== timer.task_id
        ? { ...item, timer_status: "paused", last_active_start_time: null }
        : item,
    );

    if (existingIndex >= 0) {
      taskTimers.splice(existingIndex, 1, timer);
    } else {
      taskTimers.push(timer);
    }
    context.taskTimers = taskTimers;
  }

  function removeTaskTimer(taskId) {
    taskTimers = taskTimers.filter((timer) => timer.task_id !== taskId);
    context.taskTimers = taskTimers;
  }

  function clearTaskTimerInterval() {
    if (taskTimerIntervalId) {
      global.clearInterval(taskTimerIntervalId);
      taskTimerIntervalId = null;
    }
  }

  function updateTaskTimerDisplay(timer) {
    fields.timerDisplay.textContent = formatDuration(readTaskTimerElapsedSeconds(timer));
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

  function selectAssignees(assigneeIds) {
    const selectedIds = new Set(assigneeIds);

    [...fields.assignees.options].forEach((item) => {
      item.selected = selectedIds.has(item.value);
    });
  }

  function openRecurrenceDialog() {
    fields.recurrence.frequency.value = recurrenceDraft.frequency || "WEEKLY";
    fields.recurrence.interval.value = String(recurrenceDraft.interval || 1);
    fields.recurrence.endDate.value = recurrenceDraft.endDate || "";

    if (typeof recurrenceDialog.showModal === "function") {
      recurrenceDialog.showModal();
    } else {
      recurrenceDialog.setAttribute("open", "");
    }
  }

  function saveRecurrenceDraft(event) {
    event.preventDefault();
    recurrenceDraft = {
      enabled: fields.recurring.checked,
      frequency: fields.recurrence.frequency.value || "WEEKLY",
      interval: readPositiveInteger(fields.recurrence.interval, 1),
      endDate: fields.recurrence.endDate.value || "",
    };
    updateRecurrenceState();
    recurrenceDialog.close();
  }

  function writeRecurrenceFields(details = {}) {
    const parsed = {
      ...defaultRecurrenceDraft(),
      enabled: Boolean(details?.enabled),
      frequency: details?.frequency || "WEEKLY",
      interval: Number.parseInt(details?.interval, 10) || 1,
      endDate: details?.endDate || details?.end_date || "",
    };

    recurrenceDraft = parsed;
    fields.recurring.checked = parsed.enabled;
    updateRecurrenceState();
  }

  function updateRecurrenceState() {
    if (!fields.recurring || !fields.recurrenceDetails) {
      return;
    }

    fields.recurrenceDetails.disabled = !fields.recurring.checked;
    fields.recurrenceSummary.textContent = fields.recurring.checked
      ? formatRecurrenceSummary(recurrenceDraft)
      : "Not recurring.";
  }

  function readRecurrencePayload() {
    return {
      enabled: Boolean(fields.recurring.checked),
      applyTo: "instance",
      frequency: recurrenceDraft.frequency || "WEEKLY",
      interval: recurrenceDraft.interval || 1,
      endDate: recurrenceDraft.endDate || "",
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

  function writeReminderFields(details = {}) {
    const taskPolicy = normalizeReminderPolicy(details?.taskPolicy || details?.effectivePolicy?.offsets || {});
    const effectivePolicy = normalizeReminderPolicy(details?.effectivePolicy?.offsets || {});
    const timedHours = taskPolicy.dateTime.map((minutes) => Math.round(minutes / 60));
    const dateOnlyDays = taskPolicy.dateOnly.map((minutes) => Math.round(minutes / 1440));

    fields.reminderOverride.checked = Boolean(details?.overrideEnabled);
    fields.reminderDateTimeHours1.value = String(timedHours[0] || 2);
    fields.reminderDateTimeHours2.value = String(timedHours[1] || 24);
    fields.reminderDateOnlyDays1.value = String(dateOnlyDays[0] || 3);
    fields.reminderDateOnlyDays2.value = String(dateOnlyDays[1] || 1);
    fields.effectiveReminders.textContent = `Effective: timed ${formatOffsetList(effectivePolicy.dateTime, "hours")}; date-only ${formatOffsetList(effectivePolicy.dateOnly, "days")}.`;
    updateReminderOverrideState();
  }

  function updateReminderOverrideState() {
    fields.reminderOverrideFields.hidden = !fields.reminderOverride.checked;
  }

  function readReminderPolicy() {
    return {
      dateTime: [
        readPositiveInteger(fields.reminderDateTimeHours1, 2) * 60,
        readPositiveInteger(fields.reminderDateTimeHours2, 24) * 60,
      ],
      dateOnly: [
        readPositiveInteger(fields.reminderDateOnlyDays1, 3) * 1440,
        readPositiveInteger(fields.reminderDateOnlyDays2, 1) * 1440,
      ],
    };
  }

  function normalizeReminderPolicy(policy = {}) {
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

  async function copyCurrentTaskLink() {
    if (currentTask) {
      await copyTaskLink(currentTask);
    }
  }

  async function copyTaskLink(task) {
    const url = new global.URL("tasks.html", global.location.href);
    url.searchParams.set("task", task.task_id);

    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Task link copied.");
    } catch {
      setStatus(url.toString());
    }
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

  function sortClientOptions(clients = []) {
    return [...clients].sort((left, right) =>
      getClientTreeSortKey(left).localeCompare(getClientTreeSortKey(right), undefined, { sensitivity: "base" }),
    );
  }

  function sortProjectOptions(projects = []) {
    return [...projects].sort((left, right) =>
      getProjectTreeSortKey(left).localeCompare(getProjectTreeSortKey(right), undefined, { sensitivity: "base" }),
    );
  }

  function getClientTreeSortKey(client) {
    const names = [];
    let currentClient = client;
    const visited = new Set();
    const clients = context?.options?.clients || [];

    while (currentClient && !visited.has(currentClient.id)) {
      visited.add(currentClient.id);
      names.unshift(currentClient.name || "");
      currentClient = clients.find((item) => item.id === currentClient.parent_client_id);
    }

    return names.join("/");
  }

  function getProjectTreeSortKey(project) {
    const names = [];
    let currentProject = project;
    const visited = new Set();
    const projects = context?.options?.projects || [];

    while (currentProject && !visited.has(currentProject.id)) {
      visited.add(currentProject.id);
      names.unshift(currentProject.name || "");
      currentProject = projects.find((item) => item.id === currentProject.parent_project_id);
    }

    return names.join("/");
  }

  function getClientDepth(client, visited = new Set()) {
    if (!client?.parent_client_id || visited.has(client.id)) {
      return 0;
    }

    visited.add(client.id);
    const parent = (context?.options?.clients || []).find((item) => item.id === client.parent_client_id);
    return parent ? 1 + getClientDepth(parent, visited) : 0;
  }

  function getProjectDepth(project, visited = new Set()) {
    if (!project?.parent_project_id || visited.has(project.id)) {
      return 0;
    }

    visited.add(project.id);
    const parent = (context?.options?.projects || []).find((item) => item.id === project.parent_project_id);
    return parent ? 1 + getProjectDepth(parent, visited) : 0;
  }

  function treeIndent(depth) {
    return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
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
    if (namespace.getWorkspaceProjectsLabel) {
      return namespace.getWorkspaceProjectsLabel();
    }

    const workspaceName = String(namespace.workspaceContext?.workspaceName || "").trim() ||
      document.querySelector("[data-workspace-selector]")?.selectedOptions?.[0]?.textContent?.trim() ||
      document.querySelector("[data-workspace-name]")?.textContent?.trim() ||
      "Workspace";

    return `${workspaceName} Projects`;
  }

  function taskDefaultStatuses() {
    return ["open", "in_progress", "blocked", "complete", "archived"];
  }

  function taskDefaultPriorities() {
    return ["low", "normal", "high", "urgent"];
  }

  function currentUserId() {
    return context?.currentUserId || readCurrentUserId();
  }

  function readCurrentUserId() {
    return namespace.workspaceContext?.userId || namespace.workspaceContext?.user_id || "";
  }

  function usesClientScope() {
    return (context?.options || defaultTaskOptions()).workspaceType === "business";
  }

  function setStatus(message, options = {}) {
    if (typeof context?.setStatus === "function") {
      context.setStatus(message, options);
      return;
    }

    context?.hostContext?.setStatus?.(message, options);
  }

  function defaultTaskOptions() {
    return {
      clients: [],
      projects: [],
      taskTimersEnabled: true,
      timeTrackingEnabled: true,
      users: [],
      workspaceType: "business",
    };
  }

  function taskDialogMarkup() {
    return `
      <dialog class="task-detail-dialog" data-task-dialog>
        <form method="dialog" class="task-form" data-task-form>
          <h2 data-task-dialog-title>Task</h2>
          <label class="task-title-field">Title<input type="text" data-task-title required></label>
          <label>Status<select data-task-form-status><option value="open">Open</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label>
          <label>Priority<select data-task-priority><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label data-client-workspace-control>Client<select data-task-client></select></label>
          <label>Project<select data-task-project></select></label>
          <label>Due Date<input type="date" data-task-due-date></label>
          <label>Due Time<input type="time" data-task-due-time></label>
          <label class="task-assignee-field">Assignees<select multiple data-task-assignees></select></label>
          <details class="task-recurrence-field" data-task-recurrence-panel><summary>Recurrence</summary><div class="task-recurrence-controls"><label class="inline-option"><input type="checkbox" data-task-recurring>Recurring?</label><button type="button" data-task-recurrence-details disabled>Details</button></div><p data-task-recurrence-summary>Not recurring.</p></details>
          <fieldset class="task-timer-field" data-task-timer-field hidden><legend>Task Timer</legend><p data-task-timer-status>No active timer.</p><div class="task-timer-controls"><strong data-task-timer-display>00:00:00</strong><button type="button" data-task-timer-start>Start</button><button type="button" data-task-timer-pause disabled>Pause</button><button type="button" data-task-timer-finalize disabled>Save Time</button><button type="button" data-task-timer-reset disabled>Reset</button></div></fieldset>
          <details class="task-reminder-field" data-task-reminder-details><summary>Reminders</summary><p data-task-effective-reminders></p><label class="inline-option"><input type="checkbox" data-task-reminder-override>Override reminder defaults</label><div class="reminder-offset-grid" data-task-reminder-override-fields hidden><label>Timed Reminder 1 (hours before)<input type="number" min="1" step="1" data-task-reminder-date-time-hours-1></label><label>Timed Reminder 2 (hours before)<input type="number" min="1" step="1" data-task-reminder-date-time-hours-2></label><label>Date-Only Reminder 1 (days before)<input type="number" min="1" step="1" data-task-reminder-date-only-days-1></label><label>Date-Only Reminder 2 (days before)<input type="number" min="1" step="1" data-task-reminder-date-only-days-2></label></div></details>
          <div class="task-tags-field" data-task-tags></div>
          <fieldset class="task-notification-field" data-task-notification-field hidden><legend>Notifications</legend><p data-task-notification-status>Follow this task to receive update notifications for yourself.</p><button type="button" data-task-notification-follow>Follow Notifications</button></fieldset>
          <label class="task-description-field">Description<textarea rows="5" data-task-description></textarea></label>
          <div class="form-actions task-modal-actions"><button type="button" data-copy-task-link hidden>Copy Link</button><button type="button" data-cancel-task>Cancel</button><button type="submit" data-save-task>Save Task</button></div>
        </form>
      </dialog>
      <dialog class="task-recurrence-dialog" data-task-recurrence-dialog>
        <form method="dialog" class="task-recurrence-form" data-task-recurrence-form>
          <h2>Recurrence</h2>
          <label>Frequency<select data-task-recurrence-frequency><option value="DAILY">Daily</option><option value="WEEKLY" selected>Weekly</option><option value="MONTHLY">Monthly</option></select></label>
          <label>Every<input type="number" min="1" step="1" value="1" data-task-recurrence-interval></label>
          <label>End Date<input type="date" data-task-recurrence-end-date></label>
          <div class="form-actions task-modal-actions"><button type="button" data-task-recurrence-cancel>Cancel</button><button type="submit">Save Recurrence</button></div>
        </form>
      </dialog>
    `;
  }

  const taskDialogApi = {
    configure,
    open,
    openAdd,
    openEdit,
  };

  namespace.tasksDialog = taskDialogApi;

  namespace.moduleActions?.register?.({
    actionId: "tasks.add",
    id: "tasks.add",
    label: "Add Task",
    mode: "add",
    moduleId: "tasks",
    open: openAdd,
    recordType: "task",
    requiredModules: ["tasks"],
    requiredPermissions: ["tasks.create"],
    requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    title: "Add Task",
  });
  namespace.moduleActions?.register?.({
    actionId: "tasks.edit",
    id: "tasks.edit",
    label: "Edit Task",
    mode: "edit",
    moduleId: "tasks",
    open: openEdit,
    recordType: "task",
    requiredModules: ["tasks"],
    requiredPermissions: ["tasks.view"],
    requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    title: "Edit Task",
  });

  global.LongtailForge = namespace;
}(window));
