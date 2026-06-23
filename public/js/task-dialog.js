(function attachTaskDialog(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const modal = namespace.modal;
  const pageController = namespace.pageController;

  let context = null;
  let fileAttachmentsController = null;
  let notesPanelController = null;
  let taskOverlayHost = null;
  let tagPicker = null;
  let recurrenceDraft = defaultRecurrenceDraft();
  let taskTimers = [];
  let taskTimerIntervalId = null;
  let currentTask = null;
  let currentTaskId = "";
  let currentParentTaskId = "";
  let dialog = null;
  let recurrenceDialog = null;
  let form = null;
  let fields = {};
  let currentTaskEditorRequest = null;

  function configure(options = {}) {
    context = {
      currentUserId: "",
      hostContext: null,
      onSaved: null,
      onNotesChanged: null,
      options: defaultTaskOptions(),
      setStatus: null,
      tagOptions: [],
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

  async function openTaskEditor(params = {}, hostContext = null) {
    const request = normalizeTaskEditorRequest(params, hostContext);
    currentTaskEditorRequest = request;

    if (request.needsStandaloneContext) {
      const prepared = await prepareStandaloneContext({ hostContext, params: request.defaults, taskId: request.taskId });
      configure(prepared);
      request.task = request.task || prepared.task || null;
    } else {
      configure({ hostContext: hostContext || context?.hostContext || null });
    }

    return open({
      defaults: request.defaults,
      duplicate: request.duplicate,
      focusNotes: request.focusNotes,
      hostContext,
      returnFocusTo: request.returnFocusTo,
      task: request.task,
    });
  }

  function openAdd(params = {}, hostContext = null) {
    return openTaskEditor({ ...params, mode: "add" }, hostContext);
  }

  function openEdit(params = {}, hostContext = null) {
    return openTaskEditor({ ...params, mode: "edit" }, hostContext);
  }

  function normalizeTaskEditorRequest(params = {}, hostContext = null) {
    const mode = normalizeTaskEditorMode(params);
    const duplicate = params.duplicate === true || mode === "duplicate";
    const task = params.task || null;
    const taskId = task?.task_id || params.taskId || params.task_id || params.recordId || params.id || "";
    const defaults = normalizeTaskEditorDefaults(params);
    const returnFocusTo = params.returnFocusTo || params.trigger || hostContext?.trigger || document.activeElement || null;
    const needsTaskFetch = Boolean(taskId) && !task && (mode === "edit" || duplicate);

    if (mode === "edit" && !task && !taskId) {
      throw new Error("Task ID is required.");
    }

    return {
      context: params.context || params.sourceContext || null,
      defaults,
      duplicate,
      focusNotes: params.focusNotes === true,
      mode: duplicate ? "add" : mode,
      needsStandaloneContext: Boolean(hostContext) || !context || needsTaskFetch,
      onSaved: typeof params.onSaved === "function" ? params.onSaved : null,
      refresh: typeof params.refresh === "function" ? params.refresh : null,
      returnFocusTo,
      task,
      taskId,
    };
  }

  function normalizeTaskEditorMode(params = {}) {
    const explicitMode = String(params.mode || params.action || "").toLowerCase();
    if (["add", "create", "new"].includes(explicitMode)) {
      return "add";
    }
    if (["edit", "update"].includes(explicitMode)) {
      return "edit";
    }
    if (["duplicate", "copy"].includes(explicitMode)) {
      return "duplicate";
    }
    if (params.duplicate === true) {
      return "duplicate";
    }
    return params.task || params.taskId || params.task_id || params.recordId || params.id ? "edit" : "add";
  }

  function normalizeTaskEditorDefaults(params = {}) {
    const sourceContext = params.context || params.sourceContext || {};
    const defaults = {
      ...(sourceContext.defaults || {}),
      ...(params.defaults || {}),
    };
    for (const key of [
      "blockedReason",
      "blocked_reason",
      "clientId",
      "client_id",
      "description",
      "dueDate",
      "due_date",
      "dueTime",
      "due_time",
      "nextAction",
      "next_action",
      "priority",
      "projectId",
      "project_id",
      "resumeNote",
      "resume_note",
      "status",
      "title",
    ]) {
      if (params[key] !== undefined) {
        defaults[key] = params[key];
      } else if (sourceContext[key] !== undefined) {
        defaults[key] = sourceContext[key];
      }
    }
    return defaults;
  }

  async function prepareStandaloneContext({ hostContext = null, taskId = "" } = {}) {
    await namespace.workspaceContextReady;
    await namespace.timezones?.loadSessionTimezone?.();
    const [taskResult, tasksResult, timersResult, tagOptions] = await Promise.all([
      taskId ? api.getJson(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" }) : Promise.resolve(null),
      api.getJson("/api/tasks", { cache: "no-store" }),
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
      tasks: tasksResult?.tasks || (task ? [task] : source.tasks || []),
    };
  }

  async function open({ task = null, duplicate = false, defaults = {}, focusNotes = false, hostContext = null, returnFocusTo = null } = {}) {
    ensureDialog();
    const isDuplicate = duplicate === true;
    const statusDefault = taskDefaultStatuses().includes(defaults.status) ? defaults.status : "";
    const priorityDefault = taskDefaultPriorities().includes(defaults.priority) ? defaults.priority : "";

    currentTask = isDuplicate ? null : task;
    currentTaskId = isDuplicate ? "" : task?.task_id || "";
    currentParentTaskId = "";
    context = {
      ...context,
      hostContext: hostContext || context?.hostContext || null,
    };

    fields.title.textContent = isDuplicate ? "Duplicate Task" : task ? "Edit Task" : "Add Task";
    fields.copyLink.hidden = !task || isDuplicate;
    fields.titleInput.value = isDuplicate && task?.title ? `Copy of ${task.title}` : task?.title || defaults.title || "";
    fields.status.value = isDuplicate ? "open" : task?.status || statusDefault || "open";
    fields.priority.value = task?.priority || priorityDefault || "normal";
    const selectedClientId = task ? task.client_id || "" : defaults.clientId || defaults.client_id || "";
    const selectedProjectId = task?.project_id || defaults.projectId || defaults.project_id || "";
    ensureClientOption(selectedClientId, task);
    fields.client.value = selectedClientId;
    populateProjectInput(selectedProjectId, task, { allowFallback: true });
    syncClientFromSelectedProject();
    if (!task && !statusDefault && !priorityDefault) {
      applySelectedProjectTaskDefaults();
    }
    fields.dueDate.value = task?.due_date || defaults.dueDate || defaults.due_date || "";
    fields.dueTime.value = task?.due_time || defaults.dueTime || defaults.due_time || "";
    fields.nextAction.value = task?.next_action || defaults.nextAction || defaults.next_action || "";
    fields.blockedReason.value = task?.blocked_reason || defaults.blockedReason || defaults.blocked_reason || "";
    fields.resumeNote.value = task?.resume_note || defaults.resumeNote || defaults.resume_note || "";
    fields.description.value = task?.description || defaults.description || "";
    fields.taskDetailsPanel.open = !task || isDuplicate;
    hideTaskFooterPanels();
    updateBlockedReasonState();
    await writeParentTaskFields(isDuplicate ? null : task);
    writeTaskCompletionFields(isDuplicate ? null : task);
    writeTaskMetadataRibbon(isDuplicate ? null : task);
    writeChecklistFields(isDuplicate ? null : task);
    selectAssignees(task?.assignee_ids || (task ? [] : [currentUserId()]));
    writeRecurrenceFields(isDuplicate ? null : task?.recurrenceDetails);
    writeReminderFields(task?.reminderDetails);
    writeTaskTimerFields(isDuplicate ? null : task);
    mountTaskTagPicker(isDuplicate ? [] : task?.tags || []);
    mountTaskFileAttachments(isDuplicate ? null : task);
    mountTaskNotesPanel(isDuplicate ? null : task, { focus: focusNotes === true });
    writeTaskNotificationFollowFields(isDuplicate ? null : task);

    showTaskModal(dialog, { trigger: returnFocusTo });

    fields.titleInput.focus();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        taskOverlayHost?.closeAll?.();
        clearTaskTimerInterval();
        fileAttachmentsController?.destroy?.();
        fileAttachmentsController = null;
        notesPanelController?.destroy?.();
        notesPanelController = null;
        restoreTaskEditorFocus(returnFocusTo);
        currentTaskEditorRequest = null;
        resolve(dialog.returnValue || "closed");
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = document.querySelector("[data-task-dialog]");
    recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");

    if (!dialog || !recurrenceDialog) {
      document.body.append(...createTaskDialogElements({ includeEditor: !dialog, includeRecurrence: !recurrenceDialog }));
      dialog = document.querySelector("[data-task-dialog]");
      recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");
    }

    form = dialog.querySelector("[data-task-form]");
    fields = {
      assignees: dialog.querySelector("[data-task-assignees]"),
      cancel: dialog.querySelector("[data-cancel-task]"),
      client: dialog.querySelector("[data-task-client]"),
      checklistAdd: dialog.querySelector("[data-task-checklist-add]"),
      checklistField: dialog.querySelector("[data-task-checklist-field]"),
      checklistInput: dialog.querySelector("[data-task-checklist-input]"),
      checklistList: dialog.querySelector("[data-task-checklist-list]"),
      checklistStatus: dialog.querySelector("[data-task-checklist-status]"),
      copyLink: dialog.querySelector("[data-copy-task-link]"),
      description: dialog.querySelector("[data-task-description]"),
      dueDate: dialog.querySelector("[data-task-due-date]"),
      dueTime: dialog.querySelector("[data-task-due-time]"),
      effectiveReminders: dialog.querySelector("[data-task-effective-reminders]"),
      fileContainer: dialog.querySelector("[data-task-files]"),
      filePanel: dialog.querySelector("[data-task-files-panel]"),
      fileToggle: dialog.querySelector("[data-task-files-toggle]"),
      notesContainer: dialog.querySelector("[data-task-notes]"),
      notesPanel: dialog.querySelector("[data-task-notes-panel]"),
      priority: dialog.querySelector("[data-task-priority]"),
      project: dialog.querySelector("[data-task-project]"),
      parentTask: dialog.querySelector("[data-task-parent-task]"),
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
      tagPanel: dialog.querySelector("[data-task-tags-panel]"),
      tagToggle: dialog.querySelector("[data-task-tags-toggle]"),
      taskDetailsPanel: dialog.querySelector("[data-task-details-panel]"),
      notificationToggle: dialog.querySelector("[data-task-notification-toggle]"),
      blockedReason: dialog.querySelector("[data-task-blocked-reason]"),
      blockedReasonField: dialog.querySelector("[data-task-blocked-reason-field]"),
      metadataRibbon: dialog.querySelector("[data-task-metadata-ribbon]"),
      nextAction: dialog.querySelector("[data-task-next-action]"),
      resumeNote: dialog.querySelector("[data-task-resume-note]"),
      save: dialog.querySelector("[data-save-task]"),
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
    configureTaskOverlayHost();
    bindRecurrenceDialogEvents();

    if (form.dataset.taskDialogBound === "true") {
      return;
    }

    form.dataset.taskDialogBound = "true";
    form.addEventListener("submit", saveTask);
    fields.cancel?.addEventListener("click", () => {
      context?.hostContext?.cancel?.({ actionId: currentTaskId ? "tasks.edit" : "tasks.add" });
      closeTaskModal(dialog, "cancel");
    });
    fields.copyLink?.addEventListener("click", copyCurrentTaskLink);
    fields.client?.addEventListener("change", () => {
      populateProjectInput(fields.project.value);
      refreshParentTaskOptions();
    });
    fields.project?.addEventListener("change", () => {
      syncClientFromSelectedProject();
      applySelectedProjectTaskDefaults();
      refreshParentTaskOptions();
    });
    fields.status?.addEventListener("change", updateBlockedReasonState);
    fields.status?.addEventListener("change", writeTaskMetadataRibbon);
    fields.priority?.addEventListener("change", writeTaskMetadataRibbon);
    fields.client?.addEventListener("change", writeTaskMetadataRibbon);
    fields.project?.addEventListener("change", writeTaskMetadataRibbon);
    fields.dueDate?.addEventListener("change", writeTaskMetadataRibbon);
    fields.dueTime?.addEventListener("change", writeTaskMetadataRibbon);
    fields.reminderOverride?.addEventListener("change", updateReminderOverrideState);
    fields.recurring?.addEventListener("change", updateRecurrenceState);
    fields.checklistAdd?.addEventListener("click", addChecklistItem);
    fields.checklistList?.addEventListener("click", handleChecklistClick);
    fields.checklistList?.addEventListener("change", handleChecklistChange);
    fields.recurrenceDetails?.addEventListener("click", openRecurrenceDialog);
    fields.timerStart?.addEventListener("click", () => saveTaskTimer("running"));
    fields.timerPause?.addEventListener("click", () => saveTaskTimer("paused"));
    fields.timerFinalize?.addEventListener("click", finalizeTaskTimer);
    fields.timerReset?.addEventListener("click", resetTaskTimer);
    fields.tagToggle?.addEventListener("click", () => toggleTaskFooterPanel("tags"));
    fields.fileToggle?.addEventListener("click", () => toggleTaskFooterPanel("files"));
    fields.notificationToggle?.addEventListener("click", toggleTaskNotificationFollow);
    fields.notesContainer?.addEventListener("notes-linked-panel:link", () => context?.onNotesChanged?.());
    fields.notesContainer?.addEventListener("notes-linked-panel:unlink", () => context?.onNotesChanged?.());
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
    icons.decorateButton(fields.notificationToggle, { icon: "bell", label: "Follow task notifications", text: "", title: "Follow task notifications", iconOnly: true });
    icons.decorateButton(fields.tagToggle, { icon: "tag", label: "Task tags", text: "", title: "Task tags", iconOnly: true });
    icons.decorateButton(fields.fileToggle, { icon: "file", label: "Task files", text: "", title: "Task files", iconOnly: true });
    icons.decorateButton(fields.copyLink, { icon: "copy", label: "Copy task link", text: "", title: "Copy task link", iconOnly: true });
    icons.decorateButton(fields.cancel, { icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true });
    icons.decorateButton(fields.save, { icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true });
  }

  function configureTaskOverlayHost() {
    if (!namespace.overlayHost?.create || !form) {
      return;
    }

    taskOverlayHost = namespace.overlayHost.create({ host: form });

    if (fields.tagPanel && fields.tagToggle) {
      taskOverlayHost.register({
        name: "tags",
        panel: fields.tagPanel,
        title: "Task tags",
        trigger: fields.tagToggle,
      });
    }

    if (fields.filePanel && fields.fileToggle) {
      taskOverlayHost.register({
        name: "files",
        panel: fields.filePanel,
        title: "Task files",
        trigger: fields.fileToggle,
      });
    }
  }

  function bindRecurrenceDialogEvents() {
    if (!fields.recurrence?.form || fields.recurrence.form.dataset.taskRecurrenceBound === "true") {
      return;
    }

    fields.recurrence.form.dataset.taskRecurrenceBound = "true";
    fields.recurrence.cancel?.addEventListener("click", () => closeTaskModal(recurrenceDialog, "cancel"));
    fields.recurrence.form.addEventListener("submit", saveRecurrenceDraft);
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
        option("", "No client"),
        ...(options.clients || []).map((client) => option(client.id, optionLabel(client))),
      ]
      : [option("", "No client")]);
    populateProjectInput(fields.project?.value || "");
    replaceOptions(
      fields.assignees,
      (options.users || []).map((user) => option(user.user_id, displayUser(user))),
    );
  }

  function populateProjectInput(selectedProjectId = "", sourceTask = currentTask, { allowFallback = false } = {}) {
    const selectedClientId = usesClientScope() ? fields.client?.value || "" : "";
    const projects = (context?.options?.projects || []).filter((project) =>
      !selectedClientId || (project.client_id || "") === selectedClientId,
    );
    const projectOptions = [
      option("", "No project"),
      ...projects.map((project) => option(project.id, optionLabel(project))),
    ];

    if (allowFallback && selectedProjectId && !optionListHasValue(projectOptions, selectedProjectId)) {
      const fallback = option(selectedProjectId, projectFallbackLabel(sourceTask, selectedProjectId));
      fallback.dataset.contextFallback = "project";
      projectOptions.push(fallback);
    }

    replaceOptions(fields.project, projectOptions);

    if (optionListHasValue([...fields.project.options], selectedProjectId)) {
      fields.project.value = selectedProjectId;
    }
    writeTaskMetadataRibbon();
  }

  function ensureClientOption(selectedClientId = "", sourceTask = currentTask) {
    if (!fields.client || !usesClientScope() || !selectedClientId || optionListHasValue([...fields.client.options], selectedClientId)) {
      return;
    }

    const fallback = option(selectedClientId, clientFallbackLabel(sourceTask, selectedClientId));
    fallback.dataset.contextFallback = "client";
    fields.client.appendChild(fallback);
  }

  function syncClientFromSelectedProject() {
    if (!usesClientScope() || !fields.client) {
      writeTaskMetadataRibbon();
      return;
    }

    if (!fields.project?.value) {
      writeTaskMetadataRibbon();
      return;
    }

    const project = findProjectOption(fields.project.value);
    if (!project) {
      writeTaskMetadataRibbon();
      return;
    }

    const derivedClientId = project.client_id || "";
    if (fields.client.value !== derivedClientId) {
      ensureClientOption(derivedClientId, {
        client_id: derivedClientId,
        client_name: project.client_name || project.clientName || "",
      });
      fields.client.value = derivedClientId;
      populateProjectInput(fields.project.value);
    } else {
      writeTaskMetadataRibbon();
    }
  }

  function findProjectOption(projectId = "") {
    return (context?.options?.projects || []).find((project) => project.id === projectId) || null;
  }

  function applySelectedProjectTaskDefaults() {
    if (currentTaskId) {
      return;
    }

    const project = (context?.options?.projects || []).find((item) => item.id === fields.project?.value);
    const defaults = project?.taskDefaults || {};

    fields.status.value = taskDefaultStatuses().includes(defaults.status) ? defaults.status : "open";
    fields.priority.value = taskDefaultPriorities().includes(defaults.priority) ? defaults.priority : "normal";
    writeTaskMetadataRibbon();
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
      await syncParentTaskRelationship(result.task?.task_id || "");
      currentTask = result.task;
      currentTaskId = result.task?.task_id || "";
      await notifyTaskEditorSaved(result);
      context?.hostContext?.complete?.({
        actionId: wasEditing ? "tasks.edit" : "tasks.add",
        recordId: result.task?.task_id || "",
        title: result.task?.title || "",
      });
      closeTaskModal(dialog, "complete");
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Task was not saved.", { isError: true });
    }
  }

  async function writeParentTaskFields(task) {
    if (!fields.parentTask) {
      return;
    }

    currentParentTaskId = task?.task_id ? await readCurrentParentTaskId(task.task_id) : "";
    replaceOptions(fields.parentTask, [
      option("", "No parent task"),
      ...parentTaskOptions(task?.task_id || "").map((candidate) => option(candidate.task_id, candidate.title)),
    ]);
    fields.parentTask.value = [...fields.parentTask.options].some((item) => item.value === currentParentTaskId)
      ? currentParentTaskId
      : "";
  }

  function refreshParentTaskOptions() {
    if (!fields.parentTask) {
      return;
    }

    const previousValue = fields.parentTask.value;
    replaceOptions(fields.parentTask, [
      option("", "No parent task"),
      ...parentTaskOptions(currentTaskId).map((candidate) => option(candidate.task_id, candidate.title)),
    ]);
    fields.parentTask.value = [...fields.parentTask.options].some((item) => item.value === previousValue)
      ? previousValue
      : "";
  }

  async function readCurrentParentTaskId(taskId) {
    try {
      const result = await api.getJson(`/api/tasks/${encodeURIComponent(taskId)}/relationships`, { cache: "no-store" });
      const parent = (result.relationships || []).find((relationship) => relationship.direction === "parent");
      return parent?.parent_task_id || parent?.related_task?.task_id || "";
    } catch {
      return "";
    }
  }

  function parentTaskOptions(taskId) {
    const selectedClientId = fields.client?.value === "all" ? "" : fields.client?.value || "";
    const selectedProjectId = fields.project?.value || "";

    return (context?.tasks || [])
      .filter((task) => task?.task_id && task.task_id !== taskId)
      .filter((task) => !selectedClientId || !task.client_id || task.client_id === selectedClientId)
      .filter((task) => !selectedProjectId || !task.project_id || task.project_id === selectedProjectId)
      .sort((left, right) => String(left.title || "").localeCompare(String(right.title || "")));
  }

  async function syncParentTaskRelationship(taskId) {
    if (!taskId || !fields.parentTask) {
      return;
    }

    const nextParentTaskId = fields.parentTask.value || "";

    if (nextParentTaskId === currentParentTaskId) {
      return;
    }

    if (currentParentTaskId) {
      await api.deleteJson(`/api/tasks/${encodeURIComponent(currentParentTaskId)}/children/${encodeURIComponent(taskId)}`);
    }

    if (nextParentTaskId) {
      await api.postJson(`/api/tasks/${encodeURIComponent(nextParentTaskId)}/children`, {
        child_task_id: taskId,
        is_blocking: false,
      });
    }

    currentParentTaskId = nextParentTaskId;
  }

  function readTaskFormPayload() {
    return {
      title: fields.titleInput.value,
      status: fields.status.value,
      priority: fields.priority.value,
      client_id: usesClientScope() ? fields.client.value : "",
      project_id: fields.project.value,
      due_date: fields.dueDate.value,
      due_time: fields.dueTime.value,
      next_action: fields.nextAction.value,
      blocked_reason: fields.blockedReason.value,
      resume_note: fields.resumeNote.value,
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
      if (fields.tagContainer) {
        fields.tagContainer.hidden = true;
      }
      if (fields.tagToggle) {
        fields.tagToggle.hidden = true;
      }
      if (fields.tagPanel) {
        fields.tagPanel.hidden = true;
      }
      return;
    }

    if (fields.tagToggle) {
      fields.tagToggle.hidden = false;
    }
    fields.tagContainer.hidden = false;
    tagPicker = await namespace.tags.mountPicker(fields.tagContainer, {
      tags: context.tagOptions || [],
      selectedTags: tags,
    });
  }

  function mountTaskFileAttachments(task) {
    fileAttachmentsController?.destroy?.();
    fileAttachmentsController = null;

    if (!fields.fileContainer || !namespace.fileAttachments?.mount) {
      fields.fileContainer?.replaceChildren();
      if (fields.fileToggle) {
        fields.fileToggle.hidden = true;
      }
      if (fields.filePanel) {
        fields.filePanel.hidden = true;
      }
      return;
    }

    if (fields.fileToggle) {
      fields.fileToggle.hidden = false;
    }
    fileAttachmentsController = namespace.fileAttachments.mount(fields.fileContainer, {
      acceptedCategories: ["document", "image", "pdf", "text", "other"],
      canRemove: Boolean(task?.task_id),
      canUpload: Boolean(task?.task_id),
      clientId: task?.client_id || fields.client?.value || "",
      emptyMessage: "No files attached to this task.",
      moduleId: "tasks",
      projectId: task?.project_id || fields.project?.value || "",
      saveFirstMessage: "Save the task before adding files.",
      targetId: task?.task_id || "",
      targetType: "task",
      title: "Task Files",
      visibility: "private",
      onAttachmentAdded: (detail) => context?.onAttachmentsChanged?.(detail),
      onAttachmentRemoved: (detail) => context?.onAttachmentsChanged?.(detail),
      onRefresh: (detail) => context?.onAttachmentsRefreshed?.(detail),
      onUploadFailed: ({ error } = {}) => setStatus(error?.message || "Task file upload failed.", { isError: true }),
      onUploadStarted: () => setStatus("Uploading task file..."),
      onUploadCompleted: () => setStatus("Task file uploaded."),
    });
  }

  function mountTaskNotesPanel(task, options = {}) {
    notesPanelController?.destroy?.();
    notesPanelController = null;

    if (!fields.notesContainer || !namespace.notesLinkedPanel?.mount) {
      fields.notesContainer?.replaceChildren();
      if (fields.notesPanel) {
        fields.notesPanel.hidden = true;
      }
      return;
    }

    if (fields.notesPanel) {
      fields.notesPanel.hidden = false;
      fields.notesPanel.open = options.focus === true;
    }

    notesPanelController = namespace.notesLinkedPanel.mount(fields.notesContainer, {
      clientId: task?.client_id || fields.client?.value || "",
      moduleId: "tasks",
      projectId: task?.project_id || fields.project?.value || "",
      readonly: task?.status === "archived",
      saveFirstMessage: "Save the task before adding notes.",
      targetId: task?.task_id || "",
      targetType: "task",
      title: "Task Notes",
    });

    if (options.focus === true) {
      fields.notesPanel?.scrollIntoView?.({ block: "nearest" });
    }
  }

  function readTaskTagIds() {
    return tagPicker?.readTagIds?.() || [];
  }

  async function writeTaskNotificationFollowFields(task) {
    if (!fields.notificationToggle) {
      return;
    }

    const taskId = task?.task_id || "";
    const canToggleNotifications = Boolean(taskId && namespace.notificationSubscriptions);
    writeNotificationFollowState(false);
    fields.notificationToggle.hidden = !canToggleNotifications;
    fields.notificationToggle.disabled = !canToggleNotifications;

    if (!canToggleNotifications) {
      return;
    }

    fields.notificationToggle.disabled = true;
    fields.notificationToggle.title = "Checking notification follow state";
    fields.notificationToggle.setAttribute("aria-label", "Checking notification follow state");

    try {
      const result = await namespace.notificationSubscriptions.readStatus(namespace.notificationSubscriptions.taskTarget(taskId));
      writeNotificationFollowState(result.isFollowing === true);
    } catch {
      fields.notificationToggle.disabled = true;
      fields.notificationToggle.title = "Notification follow state unavailable";
      fields.notificationToggle.setAttribute("aria-label", "Notification follow state unavailable");
    }
  }

  function toggleTaskFooterPanel(panelName) {
    if (taskOverlayHost) {
      taskOverlayHost.toggle(panelName);
      return;
    }

    toggleTaskFooterPanelFallback(panelName);
  }

  function hideTaskFooterPanels() {
    taskOverlayHost?.closeAll?.();

    if (fields.tagPanel) {
      fields.tagPanel.hidden = true;
      fields.tagToggle?.setAttribute("aria-expanded", "false");
    }
    if (fields.filePanel) {
      fields.filePanel.hidden = true;
      fields.fileToggle?.setAttribute("aria-expanded", "false");
    }
  }

  function toggleTaskFooterPanelFallback(panelName) {
    const nextPanel = panelName === "files" ? fields.filePanel : fields.tagPanel;
    const nextToggle = panelName === "files" ? fields.fileToggle : fields.tagToggle;
    const otherPanel = panelName === "files" ? fields.tagPanel : fields.filePanel;
    const otherToggle = panelName === "files" ? fields.tagToggle : fields.fileToggle;

    if (!nextPanel) {
      return;
    }

    const shouldOpen = nextPanel.hidden;
    if (otherPanel) {
      otherPanel.hidden = true;
      otherToggle?.setAttribute("aria-expanded", "false");
    }
    nextPanel.hidden = !shouldOpen;
    nextToggle?.setAttribute("aria-expanded", String(shouldOpen));
  }

  async function toggleTaskNotificationFollow() {
    if (!currentTaskId || !namespace.notificationSubscriptions || !fields.notificationToggle) {
      return;
    }

    const isFollowing = fields.notificationToggle.dataset.isFollowing === "true";
    fields.notificationToggle.disabled = true;
    fields.notificationToggle.title = isFollowing ? "Unfollowing task notifications" : "Following task notifications";
    fields.notificationToggle.setAttribute("aria-label", isFollowing ? "Unfollowing task notifications" : "Following task notifications");
    setStatus(isFollowing ? "Unfollowing task notifications..." : "Following task notifications...");

    try {
      const target = namespace.notificationSubscriptions.taskTarget(currentTaskId);
      const result = isFollowing
        ? await namespace.notificationSubscriptions.unfollow(target)
        : await namespace.notificationSubscriptions.follow(target);

      writeNotificationFollowState(result.isFollowing === true);
      setStatus(result.isFollowing ? "Task notifications followed." : "Task notifications unfollowed.");
    } catch (error) {
      writeNotificationFollowState(isFollowing);
      setStatus(error.message || "Notification follow change failed.", { isError: true });
    }
  }

  function writeNotificationFollowState(isFollowing) {
    if (!fields.notificationToggle) {
      return;
    }

    const label = isFollowing ? "Unfollow task notifications" : "Follow task notifications";
    fields.notificationToggle.dataset.isFollowing = String(isFollowing);
    fields.notificationToggle.classList.toggle("is-following", isFollowing);
    fields.notificationToggle.disabled = false;
    fields.notificationToggle.title = label;
    fields.notificationToggle.setAttribute("aria-label", label);
    fields.notificationToggle.setAttribute("aria-pressed", String(isFollowing));
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

  async function addChecklistItem() {
    if (!currentTaskId || !fields.checklistInput) {
      return;
    }

    const label = fields.checklistInput.value.trim();
    if (!label) {
      fields.checklistInput.focus();
      return;
    }

    setStatus("Adding checklist item...");

    try {
      const result = await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist`, { label });
      applyChecklistResult(result);
      fields.checklistInput.value = "";
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Checklist item was not added.", { isError: true });
    }
  }

  async function handleChecklistChange(event) {
    const checkbox = event.target.closest("[data-task-checklist-toggle]");
    if (!checkbox || !currentTaskId) {
      return;
    }

    const itemId = checkbox.closest("[data-task-checklist-item]")?.dataset.taskChecklistItem || "";
    if (!itemId) {
      return;
    }

    const action = checkbox.checked ? "check" : "uncheck";
    setStatus(checkbox.checked ? "Checking item..." : "Unchecking item...");

    try {
      applyChecklistResult(await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist/${encodeURIComponent(itemId)}/${action}`, {}));
      setStatus("");
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      setStatus(error.message || "Checklist item was not updated.", { isError: true });
    }
  }

  async function handleChecklistClick(event) {
    const button = event.target.closest("[data-task-checklist-action]");
    if (!button || !currentTaskId) {
      return;
    }

    const row = button.closest("[data-task-checklist-item]");
    const itemId = row?.dataset.taskChecklistItem || "";
    const action = button.dataset.taskChecklistAction;

    if (!itemId) {
      return;
    }

    if (action === "save") {
      await saveChecklistItemLabel(row, itemId);
    } else if (action === "delete") {
      await deleteChecklistItem(row, itemId);
    } else if (action === "up" || action === "down") {
      await moveChecklistItem(itemId, action);
    }
  }

  async function saveChecklistItemLabel(row, itemId) {
    const input = row.querySelector("[data-task-checklist-label]");
    const label = input?.value.trim() || "";

    if (!label) {
      input?.focus();
      return;
    }

    setStatus("Saving checklist item...");

    try {
      applyChecklistResult(await api.putJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist/${encodeURIComponent(itemId)}`, { label }));
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Checklist item was not saved.", { isError: true });
    }
  }

  async function deleteChecklistItem(row, itemId) {
    const label = row.querySelector("[data-task-checklist-label]")?.value || "this checklist item";
    const confirmed = await modal.confirm({
      title: "Remove checklist item",
      message: `Remove "${label}" from this task?`,
      confirmLabel: "Remove",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    setStatus("Removing checklist item...");

    try {
      applyChecklistResult(await api.deleteJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist/${encodeURIComponent(itemId)}`));
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Checklist item was not removed.", { isError: true });
    }
  }

  async function moveChecklistItem(itemId, direction) {
    const items = [...(currentTask?.checklistItems || [])];
    const index = items.findIndex((item) => item.task_checklist_item_id === itemId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const [item] = items.splice(index, 1);
    items.splice(nextIndex, 0, item);
    setStatus("Reordering checklist...");

    try {
      applyChecklistResult(await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist/reorder`, {
        item_ids: items.map((candidate) => candidate.task_checklist_item_id),
      }));
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Checklist was not reordered.", { isError: true });
    }
  }

  function applyChecklistResult(result) {
    if (result?.task) {
      currentTask = result.task;
      currentTaskId = result.task.task_id || currentTaskId;
    } else if (currentTask) {
      currentTask = {
        ...currentTask,
        checklistItems: result?.items || currentTask.checklistItems || [],
        checklistProgress: result?.checklistProgress || currentTask.checklistProgress,
      };
    }

    writeChecklistFields(currentTask);

    if (result?.task) {
      notifyTaskEditorSaved(result).catch((error) => {
        setStatus(error.message || "Task refresh hook failed.", { isError: true });
      });
    }
  }

  async function notifyTaskEditorSaved(result) {
    const configuredCallback = context?.onSaved;
    const requestCallback = currentTaskEditorRequest?.onSaved;
    const requestRefresh = currentTaskEditorRequest?.refresh;
    const hostRefresh = context?.hostContext?.refresh;

    if (typeof configuredCallback === "function") {
      await configuredCallback(result);
    }
    if (typeof requestCallback === "function" && requestCallback !== configuredCallback) {
      await requestCallback(result);
    }
    if (typeof requestRefresh === "function") {
      await requestRefresh(result);
    }
    if (typeof hostRefresh === "function" && hostRefresh !== requestRefresh) {
      await hostRefresh(result);
    }
  }

  function restoreTaskEditorFocus(target) {
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus();
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

    showTaskModal(recurrenceDialog, { parent: dialog, trigger: fields.recurrenceDetails });
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
    closeTaskModal(recurrenceDialog, "saved");
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
    const frequency = String(recurrence.frequency || "WEEKLY").toUpperCase();
    const cadence = recurrenceCadenceLabel(frequency, interval);

    return recurrence.endDate ? `${cadence} until ${recurrence.endDate}.` : `${cadence}.`;
  }

  function recurrenceCadenceLabel(frequency, interval) {
    if (frequency === "WEEKDAYS") {
      return interval === 1 ? "Every weekday" : `Every ${interval} weekdays`;
    }

    if (frequency === "WEEKENDS") {
      return interval === 1 ? "Every weekend day" : `Every ${interval} weekend days`;
    }

    const unit = {
      DAILY: "day",
      WEEKLY: "week",
      MONTHLY: "month",
    }[frequency] || "week";

    return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
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

  function option(value, label) {
    return pageController.createOption(value, label);
  }

  function optionLabel(record) {
    return record?.optionLabel || record?.display_label || record?.displayName || record?.name || record?.title || "";
  }

  function optionListHasValue(options = [], value = "") {
    return options.some((item) => item.value === value);
  }

  function clientFallbackLabel(sourceTask = null) {
    return sourceTask?.client_name || sourceTask?.clientName || "Unavailable client";
  }

  function projectFallbackLabel(sourceTask = null) {
    const projectName = sourceTask?.project_name || sourceTask?.projectName || "";
    const clientName = sourceTask?.client_name || sourceTask?.clientName || "";

    if (projectName && usesClientScope() && clientName) {
      return `${projectName} - ${clientName}`;
    }

    return projectName || "Unavailable project";
  }

  function displayUser(user) {
    const displayName = String(user.displayName || user.display_name || user.username || user.user_id || "").trim();
    const email = String(user.username || user.email || "").trim();

    if (displayName && email && displayName !== email) {
      return `${displayName} (${email})`;
    }

    return displayName || email || user.user_id;
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

  function updateBlockedReasonState() {
    if (!fields?.blockedReasonField || !fields?.blockedReason) {
      return;
    }

    const isBlocked = fields.status?.value === "blocked";
    fields.blockedReasonField.hidden = !isBlocked;
    fields.blockedReason.disabled = !isBlocked;

    if (isBlocked && !fields.blockedReason.value.trim() && document.activeElement === fields.status) {
      fields.blockedReason.focus();
    }
  }

  function writeChecklistFields(task) {
    if (!fields?.checklistField || !fields?.checklistList || !fields?.checklistStatus) {
      return;
    }

    const canUseChecklist = Boolean(task?.task_id);
    const items = task?.checklistItems || [];
    const progress = task?.checklistProgress || checklistProgress(items);

    fields.checklistInput.disabled = !canUseChecklist;
    fields.checklistAdd.disabled = !canUseChecklist;
    fields.checklistStatus.textContent = canUseChecklist
      ? formatChecklistProgress(progress)
      : "Save the task before adding checklist items.";
    fields.checklistList.replaceChildren(...items.map((item, index) => checklistItemRow(item, index, items.length)));
    fields.checklistField.open = items.length > 0;
  }

  function checklistItemRow(item, index, totalItems) {
    const row = document.createElement("div");
    row.className = "task-checklist-item";
    row.dataset.taskChecklistItem = item.task_checklist_item_id;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = Boolean(item.is_checked);
    toggle.dataset.taskChecklistToggle = "true";
    toggle.setAttribute("aria-label", `Mark ${item.label} complete`);

    const label = document.createElement("input");
    label.type = "text";
    label.value = item.label || "";
    label.maxLength = 240;
    label.dataset.taskChecklistLabel = "true";
    label.setAttribute("aria-label", "Checklist item label");

    const save = checklistActionButton("save", "Save", "Save checklist item");
    const up = checklistActionButton("up", "Up", "Move checklist item up");
    const down = checklistActionButton("down", "Down", "Move checklist item down");
    const remove = checklistActionButton("delete", "Remove", "Remove checklist item");
    up.disabled = index === 0;
    down.disabled = index >= totalItems - 1;

    row.append(toggle, label, save, up, down, remove);
    return row;
  }

  function checklistActionButton(action, text, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.taskChecklistAction = action;
    button.setAttribute("aria-label", label);
    return button;
  }

  function formatChecklistProgress(progress) {
    const total = Number(progress?.total_count) || 0;
    const completed = Number(progress?.completed_count) || 0;
    const nextLabel = progress?.next_incomplete_item_label || "";
    const base = `${completed} / ${total} complete`;

    return nextLabel ? `${base}. Next: ${nextLabel}` : base;
  }

  function checklistProgress(items = []) {
    const activeItems = Array.isArray(items) ? items : [];
    const completed = activeItems.filter((item) => item.is_checked).length;
    const next = activeItems.find((item) => !item.is_checked);

    return {
      total_count: activeItems.length,
      completed_count: completed,
      next_incomplete_item_label: next?.label || "",
    };
  }

  function writeTaskCompletionFields() {
    if (!fields?.metadataRibbon) {
      return;
    }

    const show = hasCompletedTaskMetrics(currentTask);

    if (!show) {
      return;
    }
  }

  function writeTaskMetadataRibbon(task = currentTask) {
    if (!fields?.metadataRibbon) {
      return;
    }

    const completionSeconds = hasCompletedTaskMetrics(task)
      ? task?.completionMetrics?.duration_seconds
      : null;
    const chips = [
      { label: "Status", value: selectedText(fields.status) || formatToken(fields.status?.value) },
      { label: "Priority", value: selectedText(fields.priority) || formatToken(fields.priority?.value) },
      usesClientScope() ? { label: "Client", value: selectedText(fields.client) || "No client" } : null,
      { label: "Project", value: selectedText(fields.project) || "No project" },
      fields.dueDate?.value ? { label: "Due Date", value: fields.dueDate.value } : null,
      fields.dueTime?.value ? { label: "Due Time", value: fields.dueTime.value } : null,
      completionSeconds !== null && completionSeconds !== undefined && Number.isFinite(Number(completionSeconds))
        ? { label: "TTC", value: formatDaysDuration(Number(completionSeconds)), className: "is-completion" }
        : null,
    ].filter((chip) => chip && chip.value);

    fields.metadataRibbon.replaceChildren(...chips.map(createMetadataChip));
  }

  function createMetadataChip(chip) {
    const node = document.createElement("span");
    node.className = ["task-metadata-chip", chip.className].filter(Boolean).join(" ");
    node.tabIndex = 0;
    node.textContent = `${chip.label}: ${chip.value}`;
    node.title = `${chip.label}: ${chip.value}`;
    return node;
  }

  function selectedText(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || "";
  }

  function hasCompletedTaskMetrics(task) {
    return fields.status?.value === "complete" &&
      task?.status === "complete" &&
      Boolean(task?.completed_at || task?.completionMetrics?.completed_at);
  }

  function formatToken(value = "") {
    return String(value || "")
      .split("_")
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  }

  function formatDaysDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    return `${days}:${hours}:${minutes}:${remainder}`;
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

  function createTaskDialogElements(options = {}) {
    const includeEditor = options.includeEditor !== false;
    const includeRecurrence = options.includeRecurrence !== false;
    return [
      includeEditor ? createTaskEditorDialog() : null,
      includeRecurrence ? createTaskRecurrenceDialog() : null,
    ].filter(Boolean);
  }

  function createTaskEditorDialog() {
    const view = requireTaskDialogView();
    const descriptor = taskEditorModalDescriptor();
    const dialog = view.renderDescriptorModalForm(descriptor, {
      title: descriptor.title,
      className: "task-detail-dialog",
      formClassName: "task-form",
      size: descriptor.size,
      fields: taskEditorFieldNodes(),
      utilityActions: taskEditorUtilityActions(descriptor),
      actions: taskEditorCommitActions(descriptor),
    });
    const notificationToggle = view.createActionButton({
      action: "follow-task-notifications",
      className: "task-notification-toggle",
      icon: "bell",
      iconOnly: true,
      label: "Follow task notifications",
      role: "utility",
      title: "Follow task notifications",
    });
    const heading = view.createElement("div", {
      className: "surface-modal-heading",
      children: [dialog.viewParts.title, notificationToggle],
    });

    dialog.dataset.taskDialog = "";
    dialog.viewParts.form.dataset.taskForm = "";
    dialog.viewParts.title.dataset.taskDialogTitle = "";
    dialog.viewParts.body.classList.add("task-form-fields");
    dialog.viewParts.body.dataset.taskFormFields = "";
    dialog.viewParts.footer.classList.add("form-actions", "task-modal-actions", "surface-modal-footer--dense");
    dialog.viewParts.footer.dataset.modalFooter = "";
    heading.dataset.taskDialogHeading = "";
    notificationToggle.dataset.taskNotificationToggle = "";
    notificationToggle.hidden = true;
    notificationToggle.setAttribute("aria-pressed", "false");
    dialog.viewParts.form.insertBefore(heading, dialog.viewParts.body);
    return dialog;
  }

  function requireTaskDialogView() {
    const view = namespace.view;
    if (!view?.renderDescriptorModalForm || !view?.createModalForm || !view?.showModal || !view?.closeModal || !view?.createActionButton || !view?.createElement) {
      throw new Error("Task dialog requires LongtailForge.view modal helpers.");
    }
    return view;
  }

  function showTaskModal(targetDialog, options = {}) {
    requireTaskDialogView().showModal(targetDialog, options);
  }

  function closeTaskModal(targetDialog, value = "") {
    requireTaskDialogView().closeModal(targetDialog, value);
  }

  function taskEditorModalDescriptor() {
    return {
      id: "task.editor",
      title: "Task",
      size: "wide",
      fields: [
        { id: "title", label: "Title", type: "text", required: true, width: "full" },
        { id: "metadata", label: "Task summary", type: "region", width: "full" },
        { id: "task_details", label: "Task Details", type: "section", width: "full" },
        { id: "checklist", label: "Checklist", type: "section", width: "full" },
        { id: "recurrence", label: "Recurrence", type: "section", width: "full" },
        { id: "timer", label: "Task Timer", type: "section", width: "full" },
        { id: "reminders", label: "Reminders", type: "section", width: "full" },
        { id: "notes", label: "Notes", type: "section", width: "full" },
      ],
      utilityActions: [
        { id: "tags", label: "Task tags", icon: "tag", role: "utility" },
        { id: "files", label: "Task files", icon: "file", role: "utility" },
        { id: "copy-link", label: "Copy task link", icon: "copy", role: "utility" },
      ],
      footerActions: [
        { id: "cancel", label: "Cancel", role: "secondary" },
        { id: "save", label: "Save task", role: "primary" },
      ],
    };
  }

  function taskEditorUtilityActions(descriptor) {
    const view = requireTaskDialogView();
    return descriptor.utilityActions.map((action) => {
      const button = view.createActionButton({
        action: action.id,
        className: "surface-modal-footer-action",
        icon: action.icon,
        iconOnly: true,
        label: action.label,
        role: action.role,
        title: action.label,
      });

      if (action.id === "tags") {
        button.dataset.taskTagsToggle = "";
      } else if (action.id === "files") {
        button.dataset.taskFilesToggle = "";
      } else if (action.id === "copy-link") {
        button.dataset.copyTaskLink = "";
        button.hidden = true;
      }
      return button;
    });
  }

  function taskEditorCommitActions(descriptor) {
    const view = requireTaskDialogView();
    return descriptor.footerActions.map((action) => {
      const button = view.createActionButton({
        action: action.id,
        className: "surface-modal-footer-action",
        label: action.label,
        role: action.role,
        type: action.id === "save" ? "submit" : "button",
      });

      if (action.id === "cancel") {
        button.dataset.cancelTask = "";
      } else if (action.id === "save") {
        button.dataset.saveTask = "";
      }
      return button;
    });
  }

  function taskEditorFieldNodes() {
    return taskTemplateElements(taskEditorFieldMarkup());
  }

  function taskTemplateElements(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    return [...template.content.children];
  }

  function taskEditorFieldMarkup() {
    return `
      <label class="task-title-field">Title<input type="text" data-task-title required></label>
      <div class="task-metadata-ribbon surface-chip-row" data-task-metadata-ribbon aria-label="Task summary"></div>
      <details class="task-details-field surface-modal-group" data-task-details-panel open><summary class="surface-modal-section-heading">Task Details</summary><div class="task-details-grid surface-modal-section-body"><label>Status<select data-task-form-status><option value="open">Open</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label><label>Priority<select data-task-priority><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label class="task-parent-field">Parent Task<select data-task-parent-task></select></label><label>Due Date<input type="date" data-task-due-date></label><label>Due Time<input type="time" data-task-due-time></label><label class="task-resume-note-field">Resume note<textarea rows="2" data-task-resume-note placeholder="Where did you leave off?"></textarea></label><label class="task-next-action-field">Next action<textarea rows="2" maxlength="240" data-task-next-action placeholder="What's the next thing?"></textarea></label><label data-client-workspace-control>Client<select data-task-client></select></label><label>Project<select data-task-project></select></label><label class="task-description-field">Description<textarea rows="5" data-task-description></textarea></label><label class="task-assignee-field">Assignees<select multiple data-task-assignees aria-label="Assignees"></select></label><label class="task-blocked-reason-field" data-task-blocked-reason-field hidden>Blocked reason<textarea rows="1" data-task-blocked-reason></textarea></label></div></details>
      <details class="task-checklist-field surface-modal-group" data-task-checklist-field><summary class="surface-modal-section-heading">Checklist</summary><p class="surface-modal-section-help" data-task-checklist-status>0 / 0 complete</p><div class="task-checklist-add-row surface-modal-section-body"><input type="text" maxlength="240" data-task-checklist-input aria-label="Checklist item" placeholder="Add checklist item"><button type="button" data-task-checklist-add>Add</button></div><div class="task-checklist-list" data-task-checklist-list></div></details>
      <details class="task-recurrence-field surface-modal-group surface-divider-top" data-task-recurrence-panel><summary class="surface-modal-section-heading">Recurrence</summary><div class="task-recurrence-controls surface-modal-section-body"><label class="inline-option"><input type="checkbox" data-task-recurring>Recurring?</label><button type="button" data-task-recurrence-details disabled>Details</button></div><p class="surface-modal-section-help" data-task-recurrence-summary>Not recurring.</p></details>
      <section class="task-timer-field surface-modal-group" data-task-timer-field hidden><h3 class="surface-modal-section-heading">Task Timer</h3><p class="surface-modal-section-help" data-task-timer-status>No active timer.</p><div class="task-timer-controls surface-modal-section-body surface-dense-actions"><strong class="surface-chip" data-task-timer-display>00:00:00</strong><button type="button" data-task-timer-start>Start</button><button type="button" data-task-timer-pause disabled>Pause</button><button type="button" data-task-timer-finalize disabled>Save Time</button><button type="button" data-task-timer-reset disabled>Reset</button></div></section>
      <details class="task-reminder-field surface-modal-group surface-divider-top" data-task-reminder-details><summary class="surface-modal-section-heading">Reminders</summary><p class="surface-modal-section-help" data-task-effective-reminders></p><label class="inline-option"><input type="checkbox" data-task-reminder-override>Override reminder defaults</label><div class="reminder-offset-grid surface-modal-section-body" data-task-reminder-override-fields hidden><label>Timed Reminder 1 (hours before)<input type="number" min="1" step="1" data-task-reminder-date-time-hours-1></label><label>Timed Reminder 2 (hours before)<input type="number" min="1" step="1" data-task-reminder-date-time-hours-2></label><label>Date-Only Reminder 1 (days before)<input type="number" min="1" step="1" data-task-reminder-date-only-days-1></label><label>Date-Only Reminder 2 (days before)<input type="number" min="1" step="1" data-task-reminder-date-only-days-2></label></div></details>
      <section class="task-footer-panel task-tags-field surface-overlay-panel" data-task-tags-panel hidden><div data-task-tags></div></section>
      <section class="task-footer-panel task-files-field surface-overlay-panel" data-task-files-panel hidden><div data-task-files></div></section>
      <details class="task-notes-field surface-modal-group surface-divider-top" data-task-notes-panel><summary class="surface-modal-section-heading">Notes</summary><div class="surface-modal-section-body" data-task-notes></div></details>
    `;
  }

  function createTaskRecurrenceDialog() {
    const view = requireTaskDialogView();
    const descriptor = taskRecurrenceModalDescriptor();
    const dialog = view.createModalForm({
      title: descriptor.title,
      className: "task-recurrence-dialog",
      formClassName: "task-recurrence-form",
      fields: taskRecurrenceFieldNodes(),
      actions: taskRecurrenceActions(descriptor),
    });

    dialog.dataset.taskRecurrenceDialog = "";
    dialog.viewParts.form.dataset.taskRecurrenceForm = "";
    dialog.viewParts.body.classList.add("task-recurrence-fields");
    dialog.viewParts.footer.classList.add("task-modal-actions");
    dialog.viewParts.footer.dataset.modalFooter = "";
    return dialog;
  }

  function taskRecurrenceModalDescriptor() {
    return {
      id: "task.recurrence",
      title: "Recurrence",
      fields: [
        { id: "frequency", label: "Frequency", width: "compact" },
        { id: "interval", label: "Every", width: "compact" },
        { id: "end_date", label: "End Date", width: "full" },
      ],
      footerActions: [
        { id: "cancel", label: "Cancel", role: "secondary" },
        { id: "save", label: "Save Recurrence", role: "primary" },
      ],
    };
  }

  function taskRecurrenceFieldNodes() {
    const view = requireTaskDialogView();
    const descriptor = taskRecurrenceModalDescriptor();
    const fieldById = Object.fromEntries(descriptor.fields.map((field) => [field.id, field]));
    return [
      view.createElement("label", {
        attrs: { "data-view-field-width": fieldById.frequency.width },
        children: [
          fieldById.frequency.label,
          view.createElement("select", {
            dataset: { taskRecurrenceFrequency: "" },
            children: taskRecurrenceFrequencyOptions().map((item) => view.createElement("option", {
              attrs: { value: item.value, selected: item.selected },
              text: item.label,
            })),
          }),
        ],
      }),
      view.createElement("label", {
        attrs: { "data-view-field-width": fieldById.interval.width },
        children: [
          fieldById.interval.label,
          view.createElement("input", {
            attrs: { type: "number", min: "1", step: "1", value: "1" },
            dataset: { taskRecurrenceInterval: "" },
          }),
        ],
      }),
      view.createElement("label", {
        className: "task-recurrence-end-date-field",
        attrs: { "data-view-field-width": fieldById.end_date.width },
        children: [
          fieldById.end_date.label,
          view.createElement("input", {
            attrs: { type: "date" },
            dataset: { taskRecurrenceEndDate: "" },
          }),
        ],
      }),
    ];
  }

  function taskRecurrenceFrequencyOptions() {
    return [
      { value: "DAILY", label: "Daily" },
      { value: "WEEKDAYS", label: "Weekdays" },
      { value: "WEEKENDS", label: "Weekends" },
      { value: "WEEKLY", label: "Weekly", selected: true },
      { value: "MONTHLY", label: "Monthly" },
    ];
  }

  function taskRecurrenceActions(descriptor) {
    const view = requireTaskDialogView();
    return descriptor.footerActions.map((action) => {
      const button = view.createActionButton({
        action: action.id,
        className: "surface-modal-footer-action",
        label: action.label,
        role: action.role,
        type: action.id === "save" ? "submit" : "button",
      });

      if (action.id === "cancel") {
        button.dataset.taskRecurrenceCancel = "";
      }
      return button;
    });
  }

  const taskDialogApi = {
    configure,
    open,
    openAdd,
    openEdit,
    openTaskEditor,
  };

  namespace.tasksDialog = taskDialogApi;

  namespace.moduleActions?.register?.({
    actionId: "tasks.add",
    id: "tasks.add",
    label: "Add Task",
    mode: "add",
    moduleId: "tasks",
    open: (params, hostContext) => openTaskEditor({ ...params, mode: "add" }, hostContext),
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
    open: (params, hostContext) => openTaskEditor({ ...params, mode: "edit" }, hostContext),
    recordType: "task",
    requiredModules: ["tasks"],
    requiredPermissions: ["tasks.view"],
    requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    title: "Edit Task",
  });

  global.LongtailForge = namespace;
}(window));
