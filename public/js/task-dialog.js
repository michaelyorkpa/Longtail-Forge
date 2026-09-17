(function attachTaskDialog(global) {
  // 0.33.33.37 moved status legality into LongtailForge.taskLifecycleLegality. DOM state
  // updating stays here: it is this dialog's responsibility, not duplication.
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskLifecycleLegality} BrowserTaskLifecycleLegality */
  const namespace = global.LongtailForge || {};
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskRecords} BrowserTaskRecords */

  /**
   * The shared single-task narrowing surface.
   *
   * `shared/task-records.js` is installed by the framework script block on every page, so this
   * read fails exactly where the raw `result.task` read failed before.
   * @returns {BrowserTaskRecords}
   */
  function requireTaskRecords() {
    const taskRecords = window.LongtailForge?.taskRecords;
    if (!taskRecords) {
      throw new Error("LongtailForge.taskRecords is unavailable.");
    }

    return taskRecords;
  }

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = namespace?.errors;
    if (!errors) {
      throw new Error("Task dialog requires LongtailForge.errors.");
    }
    return errors;
  }

  /**
   * The alert and confirmation dialogs this file cannot ask a question without. Acquired per call
   * rather than once at module scope, so a missing surface still fails at exactly the moment it
   * failed before.
   * @returns {BrowserModalDialogs}
   */
  function requireModalDialogs() {
    const dialogs = namespace?.modal;
    if (!dialogs) {
      throw new Error("Task dialog requires LongtailForge.modal.");
    }
    return dialogs;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} BrowserPageController */
  const pageController = namespace.pageController;

  /**
   * The page-controller helper this dialog's option builders cannot run without.
   *
   * **Checked at use, not at capture, because the capture never threw.** `pageController` is
   * bound during module evaluation, when the shared script may not have run yet; reading an
   * absent member there produced `undefined` and only the first method call failed. This checks
   * that same captured binding at that same first call, so the moment of failure is unchanged.
   *
   * **The captured binding is deliberately not re-read.** Re-reading `namespace.pageController`
   * per call would give this dialog a live dependency it has never had, and a helper published
   * after module evaluation would silently start working. That is a different lifetime, not a
   * narrowing.
   * @returns {BrowserPageController}
   */
  function requirePageController() {
    if (!pageController) {
      throw new Error("Task dialog requires LongtailForge.pageController.");
    }
    return pageController;
  }

  /**
   * Required controls are checked at their first dereference, not at lookup.
   * @template T
   * @param {T | null | undefined} value
   * @returns {T}
   */
  function requireTaskControl(value) {
    if (value === null || value === undefined) {
      throw new TypeError("Task dialog control is unavailable.");
    }
    return value;
  }

  /**
   * Preserve assignment ordering and native setter coercion: evaluate the value before
   * refusing a missing receiver, and leave inherited setters on their original object.
   * @param {Element | null | undefined} control
   * @param {keyof HTMLElement | keyof HTMLInputElement | keyof HTMLSelectElement | keyof HTMLTextAreaElement | keyof HTMLDetailsElement} member
   * @param {unknown} value
   */
  function writeTaskControl(control, member, value) {
    Reflect.set(requireTaskControl(control), member, value);
  }

  /** @param {Element | null | undefined} control @returns {HTMLButtonElement} */
  function requireTaskIconButton(control) {
    /** @param {Element | null | undefined} value @returns {value is HTMLButtonElement} */
    function isButton(value) {
      return Boolean(value && value.nodeType === 1 && String(value.tagName || "").toLowerCase() === "button");
    }
    if (!isButton(control)) {
      throw new Error("decorateButton requires a button element.");
    }
    return control;
  }

  /**
   * Dataset is inherited on native controls, including SVG controls.
   * @param {Element | null} element
   * @returns {Record<string, unknown>}
   */
  function requireTaskControlDataset(element) {
    /** @param {unknown} value @returns {value is Record<string, unknown>} */
    function isDataset(value) {
      return value !== null && (typeof value === "object" || typeof value === "function");
    }
    const control = requireTaskControl(element);
    const dataset = "dataset" in control ? control.dataset : undefined;
    if (isDataset(dataset)) {
      return dataset;
    }
    throw new TypeError("Task dialog control dataset is unavailable.");
  }

  /** @param {Element | null} element */
  function taskDialogCloseReason(element) {
    const control = requireTaskControl(element);
    const value = "returnValue" in control ? control.returnValue : undefined;
    if (!value) {
      return "closed";
    }
    if (typeof value === "string") {
      return value;
    }
    throw new TypeError("Task dialog close reason must be text.");
  }

  /** @param {Element | null | undefined} element */
  function focusTaskControl(element) {
    if (element === null || element === undefined) {
      return;
    }
    if ("focus" in element && typeof element.focus === "function") {
      element.focus();
      return;
    }
    throw new TypeError("Task dialog control cannot receive focus.");
  }

  /**
   * Open host members stay opaque. The tag catalog is the local caller precondition:
   * configure defaults it to [], and both in-repo loaders return the shared catalog or [].
   * Optional because the host-only open writer can start without configure.
   * This declaration does not validate or rewrite the host spread.
   * @typedef {Record<string, unknown> & {tagOptions?: unknown[]}} TaskDialogContext
   */
  /** @type {TaskDialogContext | null} */
  let context = null;
  /** @type {import("../../src/types/browser-contracts.js").BrowserMountedPanel | null} */
  let fileAttachmentsController = null;
  /** @type {import("../../src/types/browser-contracts.js").BrowserMountedPanel | null} */
  let notesPanelController = null;
  /** @type {import("../../src/types/browser-contracts.js").BrowserTagPickerController | null} */
  let tagPicker = null;
  /** @type {{enabled: unknown, frequency: unknown, interval: number, endDate: unknown}} */
  let recurrenceDraft = defaultRecurrenceDraft();
  /** @type {ReturnType<import("../../src/types/browser-contracts.js").BrowserTaskRecords["readTaskTimers"]>} */
  let taskTimers = [];
  /** @type {ReturnType<typeof global.setInterval> | null} */
  let taskTimerIntervalId = null;
  /**
   * Local editor state also accepts caller seeds and base-record timer responses.
   * Detail projections retain the published reader's unknown members until consumed.
   * @typedef {Partial<NonNullable<ReturnType<import("../../src/types/browser-contracts.js").BrowserTaskRecords["readTaskDetail"]>>>} TaskDialogRecord
   */
  /**
   * Read an opaque detail projection with the same boxing and inherited-member behavior
   * as ordinary property access. This does not validate or claim a wire member's type.
   * Nullish required rows still throw; optional projections pass their existing fallback.
   * @param {unknown} value @returns {Record<string, unknown>}
   */
  function taskProjectionFields(value) {
    if (value === null || value === undefined) {
      throw new TypeError("Task detail projection is unavailable.");
    }
    /** @type {Record<string, unknown>} */
    const fields = Object(value);
    return fields;
  }

  /** @param {unknown} value */
  function optionalTaskProjectionFields(value) {
    return value === null || value === undefined ? undefined : taskProjectionFields(value);
  }

  /**
   * Invoke an opaque collection operation at its existing consumption point.
   * The result stays unknown: a callable member does not establish its output.
   * @param {unknown} collection @param {string} name @param {unknown[]} args
   * @returns {unknown}
   */
  function callTaskContextCollection(collection, name, args) {
    const method = taskProjectionFields(collection)[name];
    if (typeof method !== "function") {
      throw new TypeError(`Task context collection ${name} is not callable.`);
    }
    return Reflect.apply(method, collection, args);
  }

  /**
   * Materialize only the iterable result that the select-option spread already consumed.
   * Keep iterator/next receivers, lookup counts, and abrupt completion order intact.
   * @param {unknown} value @returns {unknown[]}
   */
  function taskContextOptionItems(value) {
    const object = taskProjectionFields(value);
    /** @type {unknown} */
    const iteratorMethod = Reflect.get(object, Symbol.iterator);
    if (typeof iteratorMethod !== "function") throw new TypeError("Task options are not iterable.");
    /** @type {unknown} */
    const iterator = Reflect.apply(iteratorMethod, value, []);
    if (iterator === null || (typeof iterator !== "object" && typeof iterator !== "function")) {
      throw new TypeError("Task option iterator is not an object.");
    }
    const next = taskProjectionFields(iterator).next;
    /** @type {unknown[]} */
    const items = [];
    while (true) {
      if (typeof next !== "function") throw new TypeError("Task option iterator next is not callable.");
      /** @type {unknown} */
      const step = Reflect.apply(next, iterator, []);
      if (step === null || (typeof step !== "object" && typeof step !== "function")) {
        throw new TypeError("Task option iterator result is not an object.");
      }
      const fields = taskProjectionFields(step);
      if (fields.done) return items;
      items.push(fields.value);
    }
  }

  /** @type {TaskDialogRecord | null} */
  let currentTask = null;
  let currentTaskId = "";
  /** @type {unknown} The parent selector may be supplied by a host. */
  let currentParentTaskId = "";
  /** @type {Element | null} */
  let dialog = null;
  /** @type {Element | null} */
  let recurrenceDialog = null;
  /** @type {Element | null} */
  let tagsDialog = null;
  /** @type {Element | null} */
  let filesDialog = null;
  /** @type {Element | null} */
  let form = null;
  /**
   * Capture HTML handles without claiming control subtypes; optional matches stay nullable.
   * @typedef {Object} TaskDialogFields
   * @property {HTMLElement | null} [assignees]
   * @property {HTMLElement | null} [block]
   * @property {HTMLElement | null} [cancel]
   * @property {HTMLElement | null} [client]
   * @property {HTMLElement | null} [checklistAdd]
   * @property {HTMLElement | null} [checklistField]
   * @property {HTMLElement | null} [checklistInput]
   * @property {HTMLElement | null} [checklistList]
   * @property {HTMLElement | null} [checklistStatus]
   * @property {HTMLElement | null} [complete]
   * @property {HTMLElement | null} [copyLink]
   * @property {HTMLElement | null} [description]
   * @property {HTMLElement | null} [dueDate]
   * @property {HTMLElement | null} [dueTime]
   * @property {HTMLElement | null} [estimate]
   * @property {HTMLElement | null} [effectiveReminders]
   * @property {HTMLElement | null} [fileContainer]
   * @property {HTMLElement | null} [fileDialogClose]
   * @property {HTMLElement | null} [fileToggle]
   * @property {HTMLElement | null} [notesContainer]
   * @property {HTMLElement | null} [notesPanel]
   * @property {HTMLElement | null} [priority]
   * @property {HTMLElement | null} [project]
   * @property {HTMLElement | null} [parentTask]
   * @property {HTMLElement | null} [recurrenceDetails]
   * @property {HTMLElement | null} [recurrenceContinuity]
   * @property {HTMLElement | null} [recurrenceSkipCurrent]
   * @property {HTMLElement | null} [recurrenceField]
   * @property {HTMLElement | null} [recurrenceSummary]
   * @property {HTMLElement | null} [recurring]
   * @property {HTMLElement | null} [reminderDateOnlyDays1]
   * @property {HTMLElement | null} [reminderDateOnlyDays2]
   * @property {HTMLElement | null} [reminderDateOnlyDays2Enabled]
   * @property {HTMLElement | null} [reminderDateTimeHours1]
   * @property {HTMLElement | null} [reminderDateTimeHours2]
   * @property {HTMLElement | null} [reminderDateTimeHours2Enabled]
   * @property {HTMLElement | null} [reminderOverride]
   * @property {HTMLElement | null} [reminderOverrideFields]
   * @property {HTMLElement | null} [status]
   * @property {HTMLElement | null} [tagContainer]
   * @property {HTMLElement | null} [tagDialogClose]
   * @property {HTMLElement | null} [tagToggle]
   * @property {HTMLElement | null} [taskDetailsPanel]
   * @property {HTMLElement | null} [notificationToggle]
   * @property {HTMLElement | null} [blockedReason]
   * @property {HTMLElement | null} [blockedReasonField]
   * @property {HTMLElement | null} [continuityRow]
   * @property {HTMLElement | null} [metadataRibbon]
   * @property {HTMLElement | null} [nextAction]
   * @property {HTMLElement | null} [resumeNote]
   * @property {HTMLElement | null} [save]
   * @property {HTMLElement | null} [saveClose]
   * @property {HTMLElement | null} [timerDisplay]
   * @property {HTMLElement | null} [timerField]
   * @property {HTMLElement | null} [timerFinalize]
   * @property {HTMLElement | null} [timerPause]
   * @property {HTMLElement | null} [timerReset]
   * @property {HTMLElement | null} [timerStart]
   * @property {HTMLElement | null} [timerStatus]
   * @property {HTMLElement | null} [title]
   * @property {HTMLElement | null} [titleInput]
   * @property {HTMLElement | null} [workbenchOpen]
   * @property {{cancel: HTMLElement | null, endDate: HTMLElement | null, form: HTMLElement | null, frequency: HTMLElement | null, interval: HTMLElement | null}} [recurrence]
   */
  /** @type {TaskDialogFields} */
  let fields = {};
  /** @typedef {ReturnType<typeof normalizeTaskEditorRequest> & {materializationRefreshPending?: boolean}} TaskEditorRequest */
  /** @type {TaskEditorRequest | null} */
  let currentTaskEditorRequest = null;
  /** @type {ReturnType<typeof taskFormSnapshot> | null} */
  let initialTaskFormSnapshot = null;
  /** @type {unknown} Preserve the host control value until the consuming comparison or write. */
  let previousTaskEditorStatus = "open";
  /** @type {ReturnType<typeof performBlockCapture> | null} */
  let activeBlockCapture = null;


  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = namespace?.api;
    if (!apiClient) {
      throw new Error("Task Dialog requires LongtailForge.api.");
    }
    return apiClient;
  }
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

  /**
   * @param {*} [params]
   * @param {*} [hostContext]
   * @returns {Promise<string>} the dialog's close reason
   */
  async function openTaskEditor(params = {}, hostContext = null) {
    const api = requireApi();
    /** @type {TaskEditorRequest} */
    const request = normalizeTaskEditorRequest(params, hostContext);
    currentTaskEditorRequest = request;

    try {
      let materializationResult = null;
      if (!request.taskId && request.templateId && request.instanceDate) {
        materializationResult = await api.postJson("/api/tasks/recurrence-instances/materialize", {
          instanceDate: request.instanceDate,
          templateId: request.templateId,
        });
        request.task = materializationResult?.task || null;
        request.taskId = request.task?.task_id || "";
        request.needsStandaloneContext = true;
        request.materializationRefreshPending = true;

        if (!request.taskId) {
          throw new Error("The planned recurrence occurrence could not be opened.");
        }
      }

      if (request.needsStandaloneContext) {
        const prepared = await prepareStandaloneContext({ hostContext, params: request.defaults, taskId: request.taskId });
        configure(prepared);
        // Prefer the freshly fetched task detail (which includes checklistItems and
        // other detail-only fields) over any list-row object passed in by the caller.
        request.task = prepared.task || request.task || null;
      } else {
        configure({ hostContext: hostContext || context?.hostContext || null });
        if (request.taskId && request.mode === "edit") {
          // The caller may have handed us a list-row payload (checklistProgress but no
          // checklistItems). Refresh the single task detail so the editor renders items.
          const detail = await api.getJson(`/api/tasks/${encodeURIComponent(`${request.taskId}`)}`, { cache: "no-store" });
          request.task = detail?.task || request.task;
        }
      }

      const closeResult = await open({
        defaults: request.defaults,
        duplicate: request.duplicate,
        focusNotes: request.focusNotes,
        focusTarget: request.focusTarget,
        hostContext,
        promptBlockedReason: request.promptBlockedReason,
        returnFocusTo: request.returnFocusTo,
        task: request.task,
      });

      if (request.materializationRefreshPending) {
        await refreshMaterializedTaskRequest(request, materializationResult);
      }

      return closeResult;
    } catch (error) {
      if (currentTaskEditorRequest === request) {
        currentTaskEditorRequest = null;
      }
      throw error;
    }
  }

  function openAdd(params = {}, hostContext = null) {
    return openTaskEditor({ ...params, mode: "add" }, hostContext);
  }

  function openEdit(params = {}, hostContext = null) {
    return openTaskEditor({ ...params, mode: "edit" }, hostContext);
  }

  /**
   * Task seeds use the same local record precondition as currentTask; other host values stay opaque.
   * @param {Record<string, unknown> & {task?: TaskDialogRecord | null}} [params]
   * @param {unknown} [hostContext]
   */
  function normalizeTaskEditorRequest(params = {}, hostContext = null) {
    const mode = normalizeTaskEditorMode(params);
    const duplicate = params.duplicate === true || mode === "duplicate";
    const task = params.task || null;
    const taskId = task?.task_id || params.taskId || params.task_id || params.recordId || params.id || "";
    const templateId = String(params.templateId || params.template_id || "").trim();
    const instanceDate = String(params.instanceDate || params.instance_date || "").trim();
    const hasPlannedOccurrence = Boolean(templateId && instanceDate);
    const defaults = normalizeTaskEditorDefaults(params);
    const returnFocusTo = params.returnFocusTo || params.trigger || optionalTaskProjectionFields(hostContext)?.trigger || document.activeElement || null;
    const needsTaskFetch = Boolean(taskId) && !task && (mode === "edit" || duplicate);

    if (mode === "edit" && !task && !taskId && !hasPlannedOccurrence) {
      throw new Error("Task ID is required.");
    }

    return {
      context: params.context || params.sourceContext || null,
      defaults,
      duplicate,
      focusNotes: params.focusNotes === true,
      focusTarget: normalizeTaskEditorFocusTarget(params.focusTarget || params.focusField || params.focus),
      instanceDate,
      mode: duplicate ? "add" : mode,
      needsStandaloneContext: Boolean(hostContext) || !context || needsTaskFetch,
      onSaved: typeof params.onSaved === "function" ? params.onSaved : null,
      promptBlockedReason: params.promptBlockedReason === true,
      refresh: typeof params.refresh === "function" ? params.refresh : null,
      returnFocusTo,
      task,
      taskId,
      templateId,
    };
  }

  /** @param {Record<string, unknown>} [params] */
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

  /** @param {unknown} value */
  function normalizeTaskEditorFocusTarget(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");
    const aliases = {
      assign: "assignees",
      assignee: "assignees",
      assignees: "assignees",
      block: "blocked_reason",
      blocked: "blocked_reason",
      blocked_reason: "blocked_reason",
      blockedreason: "blocked_reason",
      due: "due_date",
      due_date: "due_date",
      duedate: "due_date",
      due_time: "due_time",
      duetime: "due_time",
      next: "next_action",
      next_action: "next_action",
      nextaction: "next_action",
      notes: "notes",
      recurrence: "recurrence",
      recurring: "recurrence",
      timer: "timer",
    };
    // Only authored aliases identify controls; inherited object names use the title fallback.
    return Object.entries(aliases).find(([key]) => key === normalized)?.[1] || "";
  }

  /** @param {Record<string, unknown>} [params] */
  function normalizeTaskEditorDefaults(params = {}) {
    /**
     * Object boxes primitives and leaves objects intact, matching property access/spread.
     * Values remain opaque: these are host defaults, not a validated task response.
     * @param {unknown} value @returns {Record<string, unknown>}
     */
    function inputFields(value) {
      return Object(value);
    }
    const sourceContext = inputFields(params.context || params.sourceContext || {});
    const defaults = {
      ...inputFields(sourceContext.defaults || {}),
      ...inputFields(params.defaults || {}),
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
      "estimateMinutes",
      "estimate_minutes",
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

  /** @param {{hostContext?: unknown, taskId?: unknown, params?: unknown}} [options] */
  async function prepareStandaloneContext({ hostContext = null, taskId = "" } = {}) {
    const api = requireApi();
    await namespace.workspaceContextReady;
    await namespace.timezones?.loadSessionTimezone?.();
    const [taskResult, tasksResult, timersResult, tagOptions] = await Promise.all([
      taskId ? api.getJson(`/api/tasks/${encodeURIComponent(`${taskId}`)}`, { cache: "no-store" }) : Promise.resolve(null),
      api.getJson("/api/tasks", { cache: "no-store" }),
      loadTaskTimers(),
      loadTagOptions(),
    ]);
    const taskBody = isReadableJsonObject(taskResult) ? taskResult : null;
    const listBody = isReadableJsonObject(tasksResult) ? tasksResult : null;
    /** @type {Record<string, unknown>} */
    const noBootstrapBody = {};
    const source = taskBody || listBody || noBootstrapBody;
    const task = taskBody?.task || null;

    return {
      currentUserId: source.currentUserId || readCurrentUserId(),
      hostContext,
      options: source.options || defaultTaskOptions(),
      setStatus: (/** @type {unknown} */ message, options = {}) => {
        const callback = optionalTaskProjectionFields(hostContext)?.setStatus;
        if (callback === null || callback === undefined) return undefined;
        if (typeof callback !== "function") throw new TypeError("Task host setStatus is not callable.");
        return Reflect.apply(callback, hostContext, [message, options]);
      },
      tagOptions,
      task,
      taskTimers: requireTaskRecords().readTaskTimers(timersResult),
      tasks: listBody?.tasks || (task ? [task] : source.tasks || []),
    };
  }

  /**
   * @param {Partial<Pick<TaskEditorRequest, "task" | "duplicate" | "defaults" | "focusNotes" | "focusTarget" | "promptBlockedReason" | "returnFocusTo">> & {hostContext?: unknown}} [options]
   * @returns {Promise<string>} the dialog's close reason
   */
  async function open({ task = null, duplicate = false, defaults = {}, focusNotes = false, focusTarget = "", hostContext = null, promptBlockedReason = false, returnFocusTo = null } = {}) {
    ensureDialog();
    const isDuplicate = duplicate === true;
    /** @type {readonly unknown[]} */
    const statuses = taskDefaultStatuses();
    const statusDefault = statuses.includes(defaults.status) ? defaults.status : "";
    /** @type {readonly unknown[]} */
    const priorities = taskDefaultPriorities();
    const priorityDefault = priorities.includes(defaults.priority) ? defaults.priority : "";

    currentTask = isDuplicate ? null : task;
    currentTaskId = isDuplicate ? "" : task?.task_id || "";
    currentParentTaskId = "";
    initialTaskFormSnapshot = null;
    context = {
      ...context,
      hostContext: hostContext || context?.hostContext || null,
    };

    writeTaskControl(fields.title, "textContent", isDuplicate ? "Duplicate Task" : task ? "Edit Task" : "Add Task");
    writeTaskControl(fields.copyLink, "hidden", !task || isDuplicate);
    // Workbench handoff only works for a persisted task: hidden on the create
    // and duplicate dialogs. Workbench itself is an unconditional framework
    // surface for every authenticated user, so no extra reachability gate.
    writeTaskControl(fields.workbenchOpen, "hidden", !currentTaskId);
    writeTaskControl(fields.titleInput, "value", isDuplicate && task?.title ? `Copy of ${task.title}` : task?.title || defaults.title || "");
    writeTaskControl(fields.status, "value", isDuplicate ? "open" : statusDefault || task?.status || "open");
    previousTaskEditorStatus = isDuplicate ? "open" : task?.status || taskProjectionFields(requireTaskControl(fields.status)).value || "open";
    writeTaskControl(fields.priority, "value", task?.priority || priorityDefault || "normal");
    writeTaskControl(fields.estimate, "value", task?.estimate_minutes ?? defaults.estimateMinutes ?? defaults.estimate_minutes ?? "");
    const selectedClientId = task ? task.client_id || "" : defaults.clientId || defaults.client_id || "";
    const selectedProjectId = task?.project_id || defaults.projectId || defaults.project_id || "";
    ensureClientOption(selectedClientId, task);
    writeTaskControl(fields.client, "value", selectedClientId);
    populateProjectInput(selectedProjectId, task, { allowFallback: true });
    syncClientFromSelectedProject();
    if (!task && !statusDefault && !priorityDefault) {
      applySelectedProjectTaskDefaults();
    }
    writeTaskControl(fields.dueDate, "value", task?.due_date || defaults.dueDate || defaults.due_date || "");
    writeTaskControl(fields.dueTime, "value", task?.due_time || defaults.dueTime || defaults.due_time || "");
    writeTaskControl(fields.nextAction, "value", task?.next_action || defaults.nextAction || defaults.next_action || "");
    writeTaskControl(fields.blockedReason, "value", defaults.blockedReason || defaults.blocked_reason || task?.blocked_reason || "");
    writeTaskControl(fields.resumeNote, "value", task?.resume_note || defaults.resumeNote || defaults.resume_note || "");
    writeTaskControl(fields.description, "value", task?.description || defaults.description || "");
    writeTaskControl(fields.taskDetailsPanel, "open", !task || isDuplicate);
    closeTaskUtilityDialogs();
    updateBlockedReasonState();
    await writeParentTaskFields(isDuplicate ? null : task);
    writeTaskCompletionFields(isDuplicate ? null : task);
    writeTaskMetadataRibbon(isDuplicate ? null : task);
    writeChecklistFields(isDuplicate ? null : task);
    selectAssignees(optionalTaskProjectionFields(task)?.assignee_ids || (task ? [] : [currentUserId()]));
    writeRecurrenceFields(isDuplicate ? null : task?.recurrenceDetails);
    writeRecurrenceContinuity(isDuplicate ? null : task?.recurrenceContinuity);
    writeRecurrenceRecovery(isDuplicate ? null : task?.recurrenceRecovery);
    writeReminderFields(task?.reminderDetails);
    writeTaskTimerFields(isDuplicate ? null : task);
    await mountTaskTagPicker(isDuplicate ? [] : task?.tags || []);
    mountTaskFileAttachments(isDuplicate ? null : task);
    mountTaskNotesPanel(isDuplicate ? null : task, { focus: focusNotes === true });
    writeTaskNotificationFollowFields(isDuplicate ? null : task);
    updateCompleteTaskActionState();
    updateBlockTaskActionState();
    initialTaskFormSnapshot = taskFormSnapshot();

    showTaskModal(dialog, { trigger: returnFocusTo });

    focusTaskEditorTarget(focusNotes ? "notes" : focusTarget);
    if (promptBlockedReason) {
      void promptAndBlockCurrentTask({
        statusBefore: previousTaskEditorStatus,
        trigger: returnFocusTo,
      });
    }
    return new Promise((resolve, reject) => {
      requireTaskControl(dialog).addEventListener("close", () => {
        closeTaskUtilityDialogs();
        clearTaskTimerInterval();
        fileAttachmentsController?.destroy?.();
        fileAttachmentsController = null;
        notesPanelController?.destroy?.();
        notesPanelController = null;
        restoreTaskEditorFocus(returnFocusTo);
        currentTaskEditorRequest = null;
        try {
          resolve(taskDialogCloseReason(dialog));
        } catch (error) {
          reject(error);
        }
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = document.querySelector("[data-task-dialog]");
    recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");
    tagsDialog = document.querySelector("[data-task-tags-dialog]");
    filesDialog = document.querySelector("[data-task-files-dialog]");

    if (!dialog || !recurrenceDialog || !tagsDialog || !filesDialog) {
      document.body.append(...createTaskDialogElements({
        includeEditor: !dialog,
        includeFiles: !filesDialog,
        includeRecurrence: !recurrenceDialog,
        includeTags: !tagsDialog,
      }).filter((element) => element !== null && element !== undefined));
      dialog = document.querySelector("[data-task-dialog]");
      recurrenceDialog = document.querySelector("[data-task-recurrence-dialog]");
      tagsDialog = document.querySelector("[data-task-tags-dialog]");
      filesDialog = document.querySelector("[data-task-files-dialog]");
    }

    dialog = requireTaskControl(dialog);
    form = dialog.querySelector("[data-task-form]");
    fields = {
      assignees: dialog.querySelector("[data-task-assignees]"),
      block: dialog.querySelector("[data-block-task]"),
      cancel: dialog.querySelector("[data-cancel-task]"),
      client: dialog.querySelector("[data-task-client]"),
      checklistAdd: dialog.querySelector("[data-task-checklist-add]"),
      checklistField: dialog.querySelector("[data-task-checklist-field]"),
      checklistInput: dialog.querySelector("[data-task-checklist-input]"),
      checklistList: dialog.querySelector("[data-task-checklist-list]"),
      checklistStatus: dialog.querySelector("[data-task-checklist-status]"),
      complete: dialog.querySelector("[data-complete-task]"),
      copyLink: dialog.querySelector("[data-copy-task-link]"),
      description: dialog.querySelector("[data-task-description]"),
      dueDate: dialog.querySelector("[data-task-due-date]"),
      dueTime: dialog.querySelector("[data-task-due-time]"),
      estimate: dialog.querySelector("[data-task-estimate-minutes]"),
      effectiveReminders: dialog.querySelector("[data-task-effective-reminders]"),
      fileContainer: filesDialog?.querySelector("[data-task-files]"),
      fileDialogClose: filesDialog?.querySelector("[data-task-files-dialog-close]"),
      fileToggle: dialog.querySelector("[data-task-files-toggle]"),
      notesContainer: dialog.querySelector("[data-task-notes]"),
      notesPanel: dialog.querySelector("[data-task-notes-panel]"),
      priority: dialog.querySelector("[data-task-priority]"),
      project: dialog.querySelector("[data-task-project]"),
      parentTask: dialog.querySelector("[data-task-parent-task]"),
      recurrenceDetails: dialog.querySelector("[data-task-recurrence-details]"),
      recurrenceContinuity: dialog.querySelector("[data-task-recurrence-continuity]"),
      recurrenceSkipCurrent: dialog.querySelector("[data-task-recurrence-skip-current]"),
      recurrenceField: dialog.querySelector("[data-task-recurrence-panel]"),
      recurrenceSummary: dialog.querySelector("[data-task-recurrence-summary]"),
      recurring: dialog.querySelector("[data-task-recurring]"),
      reminderDateOnlyDays1: dialog.querySelector("[data-task-reminder-date-only-days-1]"),
      reminderDateOnlyDays2: dialog.querySelector("[data-task-reminder-date-only-days-2]"),
      reminderDateOnlyDays2Enabled: dialog.querySelector("[data-task-reminder-date-only-days-2-enabled]"),
      reminderDateTimeHours1: dialog.querySelector("[data-task-reminder-date-time-hours-1]"),
      reminderDateTimeHours2: dialog.querySelector("[data-task-reminder-date-time-hours-2]"),
      reminderDateTimeHours2Enabled: dialog.querySelector("[data-task-reminder-date-time-hours-2-enabled]"),
      reminderOverride: dialog.querySelector("[data-task-reminder-override]"),
      reminderOverrideFields: dialog.querySelector("[data-task-reminder-override-fields]"),
      status: dialog.querySelector("[data-task-form-status]"),
      tagContainer: tagsDialog?.querySelector("[data-task-tags]"),
      tagDialogClose: tagsDialog?.querySelector("[data-task-tags-dialog-close]"),
      tagToggle: dialog.querySelector("[data-task-tags-toggle]"),
      taskDetailsPanel: dialog.querySelector("[data-task-details-panel]"),
      notificationToggle: dialog.querySelector("[data-task-notification-toggle]"),
      blockedReason: dialog.querySelector("[data-task-blocked-reason]"),
      blockedReasonField: dialog.querySelector("[data-task-blocked-reason-field]"),
      continuityRow: dialog.querySelector("[data-task-continuity-row]"),
      metadataRibbon: dialog.querySelector("[data-task-metadata-ribbon]"),
      nextAction: dialog.querySelector("[data-task-next-action]"),
      resumeNote: dialog.querySelector("[data-task-resume-note]"),
      save: dialog.querySelector("[data-save-task]"),
      saveClose: dialog.querySelector("[data-save-close-task]"),
      timerDisplay: dialog.querySelector("[data-task-timer-display]"),
      timerField: dialog.querySelector("[data-task-timer-field]"),
      timerFinalize: dialog.querySelector("[data-task-timer-finalize]"),
      timerPause: dialog.querySelector("[data-task-timer-pause]"),
      timerReset: dialog.querySelector("[data-task-timer-reset]"),
      timerStart: dialog.querySelector("[data-task-timer-start]"),
      timerStatus: dialog.querySelector("[data-task-timer-status]"),
      title: dialog.querySelector("[data-task-dialog-title]"),
      titleInput: dialog.querySelector("[data-task-title]"),
      workbenchOpen: dialog.querySelector("[data-task-workbench-open]"),
    };
    recurrenceDialog = requireTaskControl(recurrenceDialog);
    fields.recurrence = {
      cancel: recurrenceDialog.querySelector("[data-task-recurrence-cancel]"),
      endDate: recurrenceDialog.querySelector("[data-task-recurrence-end-date]"),
      form: recurrenceDialog.querySelector("[data-task-recurrence-form]"),
      frequency: recurrenceDialog.querySelector("[data-task-recurrence-frequency]"),
      interval: recurrenceDialog.querySelector("[data-task-recurrence-interval]"),
    };
    decorateTaskDialogControls();
    bindRecurrenceDialogEvents();
    bindTaskUtilityDialogEvents();

    if (requireTaskControlDataset(form).taskDialogBound === "true") {
      return;
    }

    requireTaskControlDataset(form).taskDialogBound = "true";
    requireTaskControl(form).addEventListener("submit", saveTask);
    fields.cancel?.addEventListener("click", () => {
      const host = context?.hostContext;
      const callback = optionalTaskProjectionFields(host)?.cancel;
      if (callback !== null && callback !== undefined) {
        const args = [{ actionId: currentTaskId ? "tasks.edit" : "tasks.add" }];
        if (typeof callback !== "function") {
          throw new TypeError("Task host cancel is not callable.");
        }
        Reflect.apply(callback, host, args);
      }
      closeTaskModal(dialog, "cancel");
    });
    fields.copyLink?.addEventListener("click", copyCurrentTaskLink);
    fields.client?.addEventListener("change", () => {
      populateProjectInput(taskProjectionFields(requireTaskControl(fields.project)).value);
      refreshParentTaskOptions();
    });
    fields.project?.addEventListener("change", () => {
      syncClientFromSelectedProject();
      applySelectedProjectTaskDefaults();
      refreshParentTaskOptions();
    });
    fields.parentTask?.addEventListener("change", applySelectedParentTaskInheritance);
    fields.status?.addEventListener("change", handleTaskStatusChange);
    fields.priority?.addEventListener("change", writeTaskMetadataRibbon);
    fields.estimate?.addEventListener("change", writeTaskMetadataRibbon);
    fields.client?.addEventListener("change", writeTaskMetadataRibbon);
    fields.project?.addEventListener("change", writeTaskMetadataRibbon);
    fields.dueDate?.addEventListener("change", writeTaskMetadataRibbon);
    fields.dueTime?.addEventListener("change", writeTaskMetadataRibbon);
    fields.reminderOverride?.addEventListener("change", updateReminderOverrideState);
    fields.reminderDateTimeHours2Enabled?.addEventListener("change", updateSecondaryReminderState);
    fields.reminderDateOnlyDays2Enabled?.addEventListener("change", updateSecondaryReminderState);
    fields.recurring?.addEventListener("change", updateRecurrenceState);
    fields.checklistAdd?.addEventListener("click", addChecklistItem);
    fields.checklistInput?.addEventListener("keydown", handleChecklistInputKeydown);
    fields.checklistList?.addEventListener("click", handleChecklistClick);
    fields.checklistList?.addEventListener("change", handleChecklistChange);
    fields.checklistList?.addEventListener("keydown", handleChecklistListKeydown);
    fields.recurrenceDetails?.addEventListener("click", openRecurrenceDialog);
    fields.recurrenceSkipCurrent?.addEventListener("click", skipRecurrenceToCurrent);
    fields.timerStart?.addEventListener("click", () => saveTaskTimer("running"));
    fields.timerPause?.addEventListener("click", () => saveTaskTimer("paused"));
    fields.timerFinalize?.addEventListener("click", finalizeTaskTimer);
    fields.timerReset?.addEventListener("click", resetTaskTimer);
    fields.complete?.addEventListener("click", saveAndCompleteTask);
    fields.block?.addEventListener("click", handleBlockResumeAction);
    fields.saveClose?.addEventListener("click", saveAndCloseTask);
    fields.tagToggle?.addEventListener("click", openTaskTagsDialog);
    fields.fileToggle?.addEventListener("click", openTaskFilesDialog);
    fields.notificationToggle?.addEventListener("click", toggleTaskNotificationFollow);
    fields.workbenchOpen?.addEventListener("click", openTaskInWorkbench);
    fields.notesContainer?.addEventListener("notes-linked-panel:link", () => {
      const owner = context;
      const callback = owner?.onNotesChanged;
      if (callback === null || callback === undefined) return undefined;
      if (typeof callback !== "function") throw new TypeError("Task notes callback is not callable.");
      return Reflect.apply(callback, owner, []);
    });
    fields.notesContainer?.addEventListener("notes-linked-panel:unlink", () => {
      const owner = context;
      const callback = owner?.onNotesChanged;
      if (callback === null || callback === undefined) return undefined;
      if (typeof callback !== "function") throw new TypeError("Task notes callback is not callable.");
      return Reflect.apply(callback, owner, []);
    });
  }

  function decorateTaskDialogControls() {
    const icons = namespace.icons;

    if (!icons?.decorateButton) {
      return;
    }

    icons.decorateButton(requireTaskIconButton(fields.timerStart), { icon: "start", label: "Start task timer", text: "Start", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.timerPause), { icon: "pause", label: "Pause task timer", text: "Pause", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.timerFinalize), { icon: "save", label: "Save task timer as time", text: "Save Time", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.timerReset), { icon: "restore", label: "Reset task timer", text: "Reset", iconOnly: false, variant: "danger" });
    icons.decorateButton(requireTaskIconButton(fields.notificationToggle), { icon: "bell", label: "Follow task notifications", text: "", title: "Follow task notifications", iconOnly: true });
    icons.decorateButton(requireTaskIconButton(fields.workbenchOpen), { icon: "anvil", label: "Open in Workbench", text: "", title: "Open in Workbench", iconOnly: true });
    icons.decorateButton(requireTaskIconButton(fields.tagToggle), { icon: "tag", label: "Task tags", text: "Tags", title: "Task tags", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.fileToggle), { icon: "file", label: "Task files", text: "Files", title: "Task files", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.copyLink), { icon: "copy", label: "Copy task link", text: "Copy Link", title: "Copy task link", iconOnly: false });
    icons.decorateButton(requireTaskIconButton(fields.complete), { icon: "complete", label: "Complete task", text: "", title: "Complete task", iconOnly: true });
    icons.decorateButton(requireTaskIconButton(fields.cancel), { icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true });
    icons.decorateButton(requireTaskIconButton(fields.save), { icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true });
    icons.decorateButton(requireTaskIconButton(fields.saveClose), { icon: "save", label: "Save and close task", text: "Save & Close", title: "Save and close task", iconOnly: false });
  }

  function bindRecurrenceDialogEvents() {
    if (!fields.recurrence?.form || fields.recurrence.form.dataset.taskRecurrenceBound === "true") {
      return;
    }

    fields.recurrence.form.dataset.taskRecurrenceBound = "true";
    fields.recurrence.cancel?.addEventListener("click", () => closeTaskModal(recurrenceDialog, "cancel"));
    fields.recurrence.form.addEventListener("submit", saveRecurrenceDraft);
  }

  function bindTaskUtilityDialogEvents() {
    if (tagsDialog && requireTaskControlDataset(tagsDialog).taskTagsDialogBound !== "true") {
      requireTaskControlDataset(tagsDialog).taskTagsDialogBound = "true";
      fields.tagDialogClose?.addEventListener("click", closeTaskTagsDialog);
      tagsDialog.addEventListener("close", handleTaskTagsDialogClose);
    }

    if (filesDialog && requireTaskControlDataset(filesDialog).taskFilesDialogBound !== "true") {
      requireTaskControlDataset(filesDialog).taskFilesDialogBound = "true";
      fields.fileDialogClose?.addEventListener("click", closeTaskFilesDialog);
      filesDialog.addEventListener("close", handleTaskFilesDialogClose);
    }
  }

  function populateFormOptions() {
    if (!form) {
      return;
    }

    const options = taskProjectionFields(context?.options || defaultTaskOptions());
    const hasClientScope = usesClientScope();

    requireTaskControl(dialog).querySelectorAll("[data-client-workspace-control]").forEach((element) => {
      Reflect.set(element, "hidden", !hasClientScope);
    });

    replaceOptions(fields.client, hasClientScope
      ? [
        option("", workspaceProjectsLabel()),
        ...taskContextOptionItems(callTaskContextCollection(options.clients || [], "map", [
          (/** @type {unknown} */ client) => option(taskProjectionFields(client).id, optionLabel(client)),
        ])),
      ]
      : [option("", "No client")]);
    populateProjectInput(optionalTaskProjectionFields(fields.project)?.value || "");
    replaceOptions(
      fields.assignees,
      callTaskContextCollection(options.users || [], "map", [
        (/** @type {unknown} */ user) => option(taskProjectionFields(user).user_id, displayUser(user)),
      ]),
    );
  }

  /** @param {unknown} [selectedProjectId] @param {unknown} [sourceTask] */
  function populateProjectInput(selectedProjectId = "", sourceTask = currentTask, { allowFallback = false } = {}) {
    const selectedClientId = usesClientScope() ? optionalTaskProjectionFields(fields.client)?.value || "" : "";
    const projects = callTaskContextCollection(optionalTaskProjectionFields(context?.options)?.projects || [], "filter", [
      (/** @type {unknown} */ project) => !usesClientScope() || (taskProjectionFields(project).client_id || "") === selectedClientId,
    ]);
    const projectOptions = [
      option("", "No project"),
      ...taskContextOptionItems(callTaskContextCollection(projects, "map", [
        (/** @type {unknown} */ project) => option(taskProjectionFields(project).id, optionLabel(project)),
      ])),
    ];

    if (allowFallback && selectedProjectId && !optionListHasValue(projectOptions, selectedProjectId)) {
      const fallback = option(selectedProjectId, projectFallbackLabel(sourceTask, selectedProjectId));
      fallback.dataset.contextFallback = "project";
      projectOptions.push(fallback);
    }

    replaceOptions(fields.project, projectOptions);

    if (optionListHasValue([...taskContextOptionItems(taskProjectionFields(requireTaskControl(fields.project)).options)], selectedProjectId)) {
      writeTaskControl(fields.project, "value", selectedProjectId);
    }
    writeTaskMetadataRibbon();
  }

  /** @param {unknown} [selectedClientId] @param {unknown} [sourceTask] */
  function ensureClientOption(selectedClientId = "", sourceTask = currentTask) {
    if (!fields.client || !usesClientScope() || !selectedClientId || optionListHasValue([...taskContextOptionItems(taskProjectionFields(fields.client).options)], selectedClientId)) {
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

    if (!optionalTaskProjectionFields(fields.project)?.value) {
      writeTaskMetadataRibbon();
      return;
    }

    const project = findProjectOption(taskProjectionFields(fields.project).value);
    if (!project) {
      writeTaskMetadataRibbon();
      return;
    }

    const derivedClientId = taskProjectionFields(project).client_id || "";
    if (taskProjectionFields(fields.client).value !== derivedClientId) {
      ensureClientOption(derivedClientId, {
        client_id: derivedClientId,
        client_name: taskProjectionFields(project).client_name || taskProjectionFields(project).clientName || "",
      });
      writeTaskControl(fields.client, "value", derivedClientId);
      populateProjectInput(taskProjectionFields(fields.project).value);
    } else {
      writeTaskMetadataRibbon();
    }
  }

  /** @param {unknown} [projectId] */
  function findProjectOption(projectId = "") {
    return callTaskContextCollection(optionalTaskProjectionFields(context?.options)?.projects || [], "find", [
      (/** @type {unknown} */ project) => taskProjectionFields(project).id === projectId,
    ]) || null;
  }

  function workspaceProjectsLabel() {
    if (typeof namespace.getWorkspaceProjectsLabel === "function") {
      return namespace.getWorkspaceProjectsLabel();
    }
    const workspaceName = String(namespace.workspaceContext?.workspaceName || "").trim() || "Workspace";
    return `${workspaceName} Projects`;
  }

  function applySelectedProjectTaskDefaults() {
    if (currentTaskId) {
      return;
    }

    const project = callTaskContextCollection(optionalTaskProjectionFields(context?.options)?.projects || [], "find", [
      (/** @type {unknown} */ item) => taskProjectionFields(item).id === optionalTaskProjectionFields(fields.project)?.value,
    ]);
    const defaults = taskProjectionFields(optionalTaskProjectionFields(project)?.taskDefaults || {});

    /** @type {readonly unknown[]} */
    const statuses = taskDefaultStatuses();
    writeTaskControl(fields.status, "value", statuses.includes(defaults.status) ? defaults.status : "open");
    /** @type {readonly unknown[]} */
    const priorities = taskDefaultPriorities();
    writeTaskControl(fields.priority, "value", priorities.includes(defaults.priority) ? defaults.priority : "normal");
    writeTaskMetadataRibbon();
  }

  async function saveTask(event) {
    event.preventDefault();
    try {
      await saveTaskForm({ closeOnSuccess: false });
    } catch {
      // saveTaskForm reports validation and route errors through the modal status.
    }
  }

  async function saveAndCloseTask(event) {
    event?.preventDefault();
    try {
      await saveTaskForm({ closeOnSuccess: true });
    } catch {
      // saveTaskForm reports validation and route errors through the modal status.
    }
  }

  async function saveTaskForm({ closeOnSuccess = true, statusMessage = "" } = {}) {
    const modal = requireModalDialogs();
    const api = requireApi();
    const payload = readTaskFormPayload();
    const editingTask = currentTask || callTaskContextCollection(context?.tasks || [], "find", [
      (/** @type {unknown} */ task) => taskProjectionFields(task).task_id === currentTaskId,
    ]);
    const wasEditing = Boolean(currentTaskId);
    const formChanges = taskFormChangeState(payload);

    if (optionalTaskProjectionFields(editingTask)?.recurrence_template_id && formChanges.recurrenceTemplateChanged) {
      const applyFuture = await modal.confirm({
        title: "Update recurring task",
        message: "Apply these changes to all future tasks in this recurrence?",
        confirmLabel: "All Future",
        cancelLabel: "Only This Task",
      });
      payload.recurrence.applyTo = applyFuture ? "future" : "instance";
    }

    setStatus(statusMessage || (wasEditing ? "Saving task..." : "Creating task..."));

    try {
      const result = wasEditing
        ? await api.putJson(`/api/tasks/${encodeURIComponent(currentTaskId)}`, payload)
        : await api.postJson("/api/tasks", payload);
      const savedTask = requireTaskRecords().readTaskDetail(result);
      await syncParentTaskRelationship(savedTask?.task_id || "");
      currentTask = savedTask;
      currentTaskId = savedTask?.task_id || "";
      rememberTaskInContext(currentTask);
      if (currentTask?.status === "blocked") {
        await refreshTaskTimers();
      }
      updateCompleteTaskActionState();
      updateBlockTaskActionState();
      if (!wasEditing) {
        await transitionCreatedTaskToEdit(savedTask);
      }
      initialTaskFormSnapshot = taskFormSnapshot(payload);
      await notifyTaskEditorSaved(result);
      if (closeOnSuccess) {
        const completedBySave = wasEditing && optionalTaskProjectionFields(editingTask)?.status !== "complete" && savedTask?.status === "complete";
        if (completedBySave) {
          applyTaskCompletionResult(result);
          setTaskCompletionStatus(result);
          const host = context?.hostContext;
          const callback = optionalTaskProjectionFields(host)?.complete;
          if (callback !== null && callback !== undefined) {
            const args = [taskCompletionHostDetail(result)];
            if (typeof callback !== "function") {
              throw new TypeError("Task host complete is not callable.");
            }
            Reflect.apply(callback, host, args);
          }
          closeTaskModal(dialog, "complete");
          return result;
        }
        const host = context?.hostContext;
        const callback = optionalTaskProjectionFields(host)?.complete;
        if (callback !== null && callback !== undefined) {
          const args = [{
          actionId: wasEditing ? "tasks.edit" : "tasks.add",
          recordId: savedTask?.task_id || "",
          title: savedTask?.title || "",
        }];
          if (typeof callback !== "function") {
            throw new TypeError("Task host complete is not callable.");
          }
          Reflect.apply(callback, host, args);
        }
        closeTaskModal(dialog, "complete");
        setStatus("");
      }
      if (!closeOnSuccess && !wasEditing) {
        setStatus("Task saved. Continue editing or choose Save & Close.");
      }
      return result;
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Task was not saved."), { isError: true });
      throw error;
    }
  }

  async function transitionCreatedTaskToEdit(task) {
    if (!task?.task_id) {
      return;
    }

    writeTaskControl(fields.title, "textContent", "Edit Task");
    writeTaskControl(fields.copyLink, "hidden", false);
    writeTaskControl(fields.workbenchOpen, "hidden", false);
    updateBlockTaskActionState();
    currentTaskEditorRequest = currentTaskEditorRequest
      ? { ...currentTaskEditorRequest, mode: "edit", task, taskId: task.task_id }
      : currentTaskEditorRequest;
    writeTaskMetadataRibbon(task);
    writeChecklistFields(task);
    writeTaskTimerFields(task);
    mountTaskFileAttachments(task);
    mountTaskNotesPanel(task);
    await writeTaskNotificationFollowFields(task);
  }

  async function saveAndCompleteTask(event) {
    const api = requireApi();
    event?.preventDefault();
    if (!canCompleteCurrentTask()) {
      setStatus("Task cannot be completed from this state.", { isError: true });
      updateCompleteTaskActionState();
      return;
    }

    if (fields.complete) {
      writeTaskControl(fields.complete, "disabled", true);
    }

    try {
      if (taskFormChangeState().hasChanges) {
        await saveTaskForm({
          closeOnSuccess: false,
          statusMessage: "Saving task before completion...",
        });
      }
      const taskId = currentTask?.task_id || currentTaskId;
      setStatus("Completing task...");
      const result = await api.postJson(`/api/tasks/${encodeURIComponent(taskId)}/complete`, {});
      applyTaskCompletionResult(result);
      await notifyTaskEditorSaved(result);
      setTaskCompletionStatus(result);
      const host = context?.hostContext;
      const callback = optionalTaskProjectionFields(host)?.complete;
      if (callback !== null && callback !== undefined) {
        const args = [taskCompletionHostDetail(result)];
        if (typeof callback !== "function") {
          throw new TypeError("Task host complete is not callable.");
        }
        Reflect.apply(callback, host, args);
      }
      closeTaskModal(dialog, "complete");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Task was not completed."), { isError: true });
      updateCompleteTaskActionState();
    }
  }

  /** @param {{task?: TaskDialogRecord | null, recurrenceContinuity?: TaskDialogRecord["recurrenceContinuity"]}} [result] */
  function applyTaskCompletionResult(result = {}) {
    if (!result.task) {
      return;
    }

    currentTask = result.task;
    currentTask.recurrenceContinuity = result.recurrenceContinuity || currentTask.recurrenceContinuity || null;
    currentTaskId = result.task.task_id || currentTaskId;
    rememberTaskInContext(currentTask);
    syncTaskStatusField(currentTask);
    updateBlockedReasonState();
    writeTaskCompletionFields(currentTask);
    writeTaskMetadataRibbon(currentTask);
    writeRecurrenceContinuity(currentTask.recurrenceContinuity);
    writeTaskTimerFields(currentTask);
    updateCompleteTaskActionState();
  }

  function taskCompletionHostDetail(result = {}) {
    return {
      actionId: "tasks.complete",
      createdTask: result.createdTask
        ? {
            task_id: result.createdTask.task_id || "",
            title: result.createdTask.title || "",
          }
        : null,
      recordId: result.task?.task_id || currentTaskId || "",
      recurrenceQueued: result.recurrenceJob?.queued === true,
      recurrenceContinuity: result.recurrenceContinuity || null,
      taskLifecycleAction: "complete",
      title: result.task?.title || currentTask?.title || "",
    };
  }

  function setTaskCompletionStatus(result = {}) {
    const continuityMessage = recurrenceContinuityMessage(result.recurrenceContinuity);
    setStatus(continuityMessage || "Task completed.");
  }

  async function writeParentTaskFields(task) {
    if (!fields.parentTask) {
      return;
    }

    currentParentTaskId = task?.task_id ? await readCurrentParentTaskId(task.task_id) : "";
    replaceOptions(fields.parentTask, [
      option("", "No parent task"),
      ...parentTaskOptions(task?.task_id || "").map((candidate) => option(candidate.task_id, candidate.optionLabel || candidate.title)),
    ]);
    writeTaskControl(fields.parentTask, "value", [...taskContextOptionItems(taskProjectionFields(fields.parentTask).options)].some((item) => taskProjectionFields(item).value === currentParentTaskId)
      ? currentParentTaskId
      : "");
  }

  function refreshParentTaskOptions() {
    if (!fields.parentTask) {
      return;
    }

    const previousValue = taskProjectionFields(fields.parentTask).value;
    replaceOptions(fields.parentTask, [
      option("", "No parent task"),
      ...parentTaskOptions(currentTaskId).map((candidate) => option(candidate.task_id, candidate.optionLabel || candidate.title)),
    ]);
    writeTaskControl(fields.parentTask, "value", [...taskContextOptionItems(taskProjectionFields(fields.parentTask).options)].some((item) => taskProjectionFields(item).value === previousValue)
      ? previousValue
      : "");
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskRelationship} BrowserTaskRelationship */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskRelationshipDirection} BrowserTaskRelationshipDirection */

  /** The two directions the producer writes from one comparison. @type {readonly BrowserTaskRelationshipDirection[]} */
  const TASK_RELATIONSHIP_DIRECTIONS = Object.freeze(["child", "parent"]);

  /** The relationship members the producer always writes as text. */
  const TASK_RELATIONSHIP_TEXT_MEMBERS = Object.freeze([
    "child_task_id", "created_at", "parent_task_id", "related_task_id",
    "task_relationship_id", "updated_at",
  ]);

  /** The related-task summary members it always writes as text. */
  const RELATED_TASK_TEXT_MEMBERS = Object.freeze([
    "client_id", "client_name", "project_id", "project_name", "status", "task_id", "title", "url",
  ]);

  /**
   * A JSON value this dialog can read members off.
   *
   * It serves the relationship reads it was written for and the standalone bootstrap, whose four
   * requests resolve through one `Promise.all`: TypeScript widens that tuple's heterogeneous
   * elements to `{}`, which was masked while the tag load answered `any`. The check the bootstrap
   * needed was already here, so it is reused and renamed rather than written twice.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isReadableJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasTaskRelationshipText(value, keys) {
    return keys.every((key) => typeof value[key] === "string");
  }

  /**
   * The related-task summary, as `taskRelationshipTaskSummary` reconstructs it.
   *
   * `estimate_minutes` is the only member the task record itself allows to be null, so it is
   * the only one checked as nullable here.
   * @param {unknown} value
   * @returns {boolean}
   */
  function isRelatedTaskSummary(value) {
    return isReadableJsonObject(value)
      && hasTaskRelationshipText(value, RELATED_TASK_TEXT_MEMBERS)
      && (value.estimate_minutes === null || typeof value.estimate_minutes === "number");
  }

  /**
   * One relationship as `readableRelationshipsForTask` builds it.
   *
   * The readability flag and the summary are checked against each other rather than
   * separately. The producer writes the summary only when its `tasks.view` check passed and
   * the related task exists, and writes the flag from that same check - so a row claiming the
   * related task was unreadable while carrying its title, client and project is one where a
   * withheld task's details arrived anyway, and this refuses it.
   * @param {unknown} value
   * @returns {value is BrowserTaskRelationship}
   */
  function isTaskRelationship(value) {
    if (!isReadableJsonObject(value)
      || !hasTaskRelationshipText(value, TASK_RELATIONSHIP_TEXT_MEMBERS)
      || typeof value.is_blocking !== "boolean"
      || !TASK_RELATIONSHIP_DIRECTIONS.some((word) => word === value.direction)) {
      return false;
    }

    return value.related_task_readable === true
      ? isRelatedTaskSummary(value.related_task)
      : value.related_task_readable === false && value.related_task === null;
  }

  /**
   * The relationship list, or `null` when the body is not one this producer sends.
   *
   * `relationshipSummary` is not read: it is a different producer's record, and this reader
   * refusing a body over a member nothing on this path uses would be inventing a contract for
   * it. The array and its elements are what the caller relies on, and every element is
   * checked - an array whose container is right and whose contents are not is the shape a
   * length check alone would wave through.
   * @param {unknown} body
   * @returns {BrowserTaskRelationship[] | null}
   */
  function readTaskRelationships(body) {
    if (!isReadableJsonObject(body) || !Array.isArray(body.relationships)) {
      return null;
    }

    const relationships = body.relationships.filter(isTaskRelationship);

    return relationships.length === body.relationships.length ? relationships : null;
  }

  async function readCurrentParentTaskId(taskId) {
    const api = requireApi();
    try {
      const relationships = readTaskRelationships(
        await api.getJson(`/api/tasks/${encodeURIComponent(taskId)}/relationships`, { cache: "no-store" }),
      );

      if (!relationships) {
        throw new Error("The task relationship list could not be read.");
      }

      const parent = relationships.find((relationship) => relationship.direction === "parent");
      return parent?.parent_task_id || parent?.related_task?.task_id || "";
    } catch {
      return "";
    }
  }

  /** @param {unknown} taskId */
  function parentTaskOptions(taskId) {
    const selectedClientId = optionalTaskProjectionFields(fields.client)?.value === "all" ? "" : optionalTaskProjectionFields(fields.client)?.value || "";
    const selectedProjectId = optionalTaskProjectionFields(fields.project)?.value || "";

    let candidates = callTaskContextCollection(context?.tasks || [], "filter", [
      (/** @type {unknown} */ task) => optionalTaskProjectionFields(task)?.task_id && taskProjectionFields(task).task_id !== taskId,
    ]);
    candidates = callTaskContextCollection(candidates, "filter", [
      (/** @type {unknown} */ task) => taskId || !requireTaskLifecycleLegality().isTerminalStatus(taskProjectionFields(task).status),
    ]);
    candidates = callTaskContextCollection(candidates, "filter", [
      (/** @type {unknown} */ task) => !selectedClientId || !taskProjectionFields(task).client_id || taskProjectionFields(task).client_id === selectedClientId,
    ]);
    candidates = callTaskContextCollection(candidates, "filter", [
      (/** @type {unknown} */ task) => !selectedProjectId || !taskProjectionFields(task).project_id || taskProjectionFields(task).project_id === selectedProjectId,
    ]);

    // The native Map constructor, not a declaration over the host collection, consumes entries.
    /** @type {Map<unknown, unknown>} */
    const byId = Reflect.construct(Map, [callTaskContextCollection(candidates, "map", [
      (/** @type {unknown} */ task) => [taskProjectionFields(task).task_id, task],
    ])]);
    /** @type {Map<unknown, unknown[]>} */
    const childrenByParent = new Map();
    callTaskContextCollection(candidates, "forEach", [(/** @type {unknown} */ task) => {
      const parentId = taskProjectionFields(task).parent_task_id || optionalTaskProjectionFields(taskProjectionFields(task).parentTask)?.task_id || optionalTaskProjectionFields(taskProjectionFields(task).parent_task)?.task_id || "";
      const key = byId.has(parentId) ? parentId : "";
      if (!childrenByParent.has(key)) {
        childrenByParent.set(key, []);
      }
      requireTaskControl(childrenByParent.get(key)).push(task);
    }]);
    const compareByTitle = (/** @type {unknown} */ left, /** @type {unknown} */ right) => String(optionalTaskProjectionFields(left)?.title || "").localeCompare(String(optionalTaskProjectionFields(right)?.title || ""), undefined, { sensitivity: "base" });
    childrenByParent.forEach((children) => children.sort(compareByTitle));
    /** @type {Array<Record<string, unknown> & {optionLabel: string}>} */
    const ordered = [];
    const visited = new Set();
    const appendBranch = (/** @type {unknown} */ task, /** @type {number} */ depth) => {
      if (!optionalTaskProjectionFields(task)?.task_id || visited.has(taskProjectionFields(task).task_id)) {
        return;
      }
      visited.add(taskProjectionFields(task).task_id);
      ordered.push({
        ...taskProjectionFields(task),
        optionLabel: `${depth > 0 ? `${"  ".repeat(depth)}- ` : ""}${taskProjectionFields(task).title || "Untitled Task"}`,
      });
      (childrenByParent.get(taskProjectionFields(task).task_id) || []).forEach((child) => appendBranch(child, depth + 1));
    };
    (childrenByParent.get("") || []).forEach((task) => appendBranch(task, 0));
    const remaining = callTaskContextCollection(candidates, "filter", [
      (/** @type {unknown} */ task) => !visited.has(taskProjectionFields(task).task_id),
    ]);
    const sorted = callTaskContextCollection(remaining, "sort", [compareByTitle]);
    callTaskContextCollection(sorted, "forEach", [(/** @type {unknown} */ task) => appendBranch(task, 0)]);
    return ordered;
  }

  function applySelectedParentTaskInheritance() {
    const parentTaskId = optionalTaskProjectionFields(fields.parentTask)?.value || "";
    const parentTask = callTaskContextCollection(context?.tasks || [], "find", [
      (/** @type {unknown} */ task) => taskProjectionFields(task).task_id === parentTaskId,
    ]);

    if (!parentTask) {
      return;
    }

    writeTaskControl(fields.dueDate, "value", taskProjectionFields(parentTask).due_date || "");
    writeTaskControl(fields.dueTime, "value", taskProjectionFields(parentTask).due_time || "");
    /** @type {readonly unknown[]} */
    const priorities = taskDefaultPriorities();
    writeTaskControl(fields.priority, "value", priorities.includes(taskProjectionFields(parentTask).priority) ? taskProjectionFields(parentTask).priority : "normal");

    if (usesClientScope() && !taskProjectionFields(requireTaskControl(fields.client)).value && taskProjectionFields(parentTask).client_id) {
      ensureClientOption(taskProjectionFields(parentTask).client_id, parentTask);
      writeTaskControl(fields.client, "value", taskProjectionFields(parentTask).client_id);
      populateProjectInput(taskProjectionFields(requireTaskControl(fields.project)).value);
    }

    if (!taskProjectionFields(requireTaskControl(fields.project)).value && taskProjectionFields(parentTask).project_id) {
      populateProjectInput(taskProjectionFields(parentTask).project_id, parentTask, { allowFallback: true });
      syncClientFromSelectedProject();
    } else {
      writeTaskMetadataRibbon();
    }
  }

  async function syncParentTaskRelationship(taskId) {
    const api = requireApi();
    if (!taskId || !fields.parentTask) {
      return;
    }

    const nextParentTaskId = taskProjectionFields(fields.parentTask).value || "";

    if (nextParentTaskId === currentParentTaskId) {
      return;
    }

    if (currentParentTaskId) {
      await api.deleteJson(`/api/tasks/${encodeURIComponent(`${currentParentTaskId}`)}/children/${encodeURIComponent(taskId)}`);
    }

    if (nextParentTaskId) {
      await api.postJson(`/api/tasks/${encodeURIComponent(`${nextParentTaskId}`)}/children`, {
        child_task_id: taskId,
        is_blocking: false,
      });
    }

    currentParentTaskId = nextParentTaskId;
  }

  function readTaskFormPayload() {
    return {
      title: taskProjectionFields(requireTaskControl(fields.titleInput)).value,
      status: taskProjectionFields(requireTaskControl(fields.status)).value,
      priority: taskProjectionFields(requireTaskControl(fields.priority)).value,
      estimate_minutes: taskProjectionFields(requireTaskControl(fields.estimate)).value === "" ? null : Number(taskProjectionFields(requireTaskControl(fields.estimate)).value),
      client_id: usesClientScope() ? taskProjectionFields(requireTaskControl(fields.client)).value : "",
      project_id: taskProjectionFields(requireTaskControl(fields.project)).value,
      due_date: taskProjectionFields(requireTaskControl(fields.dueDate)).value,
      due_time: taskProjectionFields(requireTaskControl(fields.dueTime)).value,
      next_action: taskProjectionFields(requireTaskControl(fields.nextAction)).value,
      blocked_reason: taskProjectionFields(requireTaskControl(fields.blockedReason)).value,
      resume_note: taskProjectionFields(requireTaskControl(fields.resumeNote)).value,
      description: taskProjectionFields(requireTaskControl(fields.description)).value,
      assignee_ids: [...taskContextOptionItems(taskProjectionFields(requireTaskControl(fields.assignees)).selectedOptions)].map((selected) => taskProjectionFields(selected).value),
      recurrence: readRecurrencePayload(),
      reminderOverrideEnabled: taskProjectionFields(requireTaskControl(fields.reminderOverride)).checked,
      reminderPolicy: readReminderPolicy(),
      tagIds: readTaskTagIds(),
    };
  }

  function taskFormChangeState(payload = readTaskFormPayload()) {
    const snapshot = taskFormSnapshot(payload);

    if (!initialTaskFormSnapshot) {
      return {
        hasChanges: true,
        recurrenceTemplateChanged: Boolean(currentTask?.recurrence_template_id),
      };
    }

    return {
      hasChanges: snapshot.all !== initialTaskFormSnapshot.all,
      recurrenceTemplateChanged: snapshot.recurrenceTemplate !== initialTaskFormSnapshot.recurrenceTemplate,
    };
  }

  function taskFormSnapshot(payload = readTaskFormPayload()) {
    const recurrence = payload.recurrence || {};
    const normalized = {
      ...payload,
      assignee_ids: [...(payload.assignee_ids || [])].sort(),
      parent_task_id: optionalTaskProjectionFields(fields.parentTask)?.value || "",
      recurrence: {
        enabled: recurrence.enabled === true,
        endDate: recurrence.endDate || "",
        frequency: recurrence.frequency || "WEEKLY",
        interval: Number.parseInt(recurrence.interval, 10) || 1,
      },
      tagIds: [...(payload.tagIds || [])].sort(),
    };
    const recurrenceTemplate = {
      assignee_ids: normalized.assignee_ids,
      client_id: normalized.client_id || "",
      description: normalized.description || "",
      due_date: normalized.due_date || "",
      due_time: normalized.due_time || "",
      estimate_minutes: normalized.estimate_minutes,
      priority: normalized.priority || "normal",
      project_id: normalized.project_id || "",
      recurrence: normalized.recurrence,
      title: normalized.title || "",
    };

    return {
      all: JSON.stringify(normalized),
      recurrenceTemplate: JSON.stringify(recurrenceTemplate),
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
      closeTaskTagsDialog();
      return;
    }

    if (fields.tagToggle) {
      fields.tagToggle.hidden = false;
    }
    fields.tagContainer.hidden = false;
    tagPicker = await namespace.tags.mountPicker(fields.tagContainer, {
      tags: requireTaskControl(context).tagOptions || [],
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
      closeTaskFilesDialog();
      return;
    }

    if (fields.fileToggle) {
      fields.fileToggle.hidden = false;
    }
    fileAttachmentsController = namespace.fileAttachments.mount(fields.fileContainer, {
      acceptedCategories: ["document", "image", "pdf", "text", "other"],
      canRemove: Boolean(task?.task_id),
      canUpload: Boolean(task?.task_id),
      clientId: task?.client_id || optionalTaskProjectionFields(fields.client)?.value || "",
      emptyMessage: "No files attached to this task.",
      moduleId: "tasks",
      projectId: task?.project_id || optionalTaskProjectionFields(fields.project)?.value || "",
      saveFirstMessage: "Save the task before adding files.",
      targetId: task?.task_id || "",
      targetType: "task",
      title: "Task Files",
      visibility: "private",
      onAttachmentAdded: (detail) => {
        const owner = context;
        const callback = owner?.onAttachmentsChanged;
        if (callback === null || callback === undefined) return undefined;
        if (typeof callback !== "function") throw new TypeError("Task attachment callback is not callable.");
        return Reflect.apply(callback, owner, [detail]);
      },
      onAttachmentRemoved: (detail) => {
        const owner = context;
        const callback = owner?.onAttachmentsChanged;
        if (callback === null || callback === undefined) return undefined;
        if (typeof callback !== "function") throw new TypeError("Task attachment callback is not callable.");
        return Reflect.apply(callback, owner, [detail]);
      },
      onRefresh: (detail) => {
        const owner = context;
        const callback = owner?.onAttachmentsRefreshed;
        if (callback === null || callback === undefined) return undefined;
        if (typeof callback !== "function") throw new TypeError("Task attachment callback is not callable.");
        return Reflect.apply(callback, owner, [detail]);
      },
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
      writeTaskControl(fields.notesPanel, "open", options.focus === true);
    }

    notesPanelController = namespace.notesLinkedPanel.mount(fields.notesContainer, {
      clientId: task?.client_id || optionalTaskProjectionFields(fields.client)?.value || "",
      moduleId: "tasks",
      projectId: task?.project_id || optionalTaskProjectionFields(fields.project)?.value || "",
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
    writeTaskControl(fields.notificationToggle, "disabled", !canToggleNotifications);

    if (!namespace.notificationSubscriptions || !canToggleNotifications) {
      return;
    }

    writeTaskControl(fields.notificationToggle, "disabled", true);
    fields.notificationToggle.title = "Checking notification follow state";
    fields.notificationToggle.setAttribute("aria-label", "Checking notification follow state");

    try {
      const result = await namespace.notificationSubscriptions.readStatus(namespace.notificationSubscriptions.taskTarget(taskId));
      writeNotificationFollowState(result.isFollowing === true);
    } catch {
      writeTaskControl(fields.notificationToggle, "disabled", true);
      fields.notificationToggle.title = "Notification follow state unavailable";
      fields.notificationToggle.setAttribute("aria-label", "Notification follow state unavailable");
    }
  }

  function openTaskTagsDialog() {
    if (!tagsDialog || fields.tagToggle?.hidden) {
      return;
    }

    closeTaskFilesDialog();
    fields.tagToggle?.setAttribute("aria-expanded", "true");
    showTaskModal(tagsDialog, { parent: dialog, trigger: fields.tagToggle });
    focusTaskControl(tagsDialog.querySelector("[data-tag-picker-input]"));
  }

  function closeTaskTagsDialog() {
    if (!tagsDialog) {
      return;
    }

    closeTaskModal(tagsDialog);
  }

  function handleTaskTagsDialogClose() {
    fields.tagToggle?.setAttribute("aria-expanded", "false");
  }

  function openTaskFilesDialog() {
    if (!filesDialog || fields.fileToggle?.hidden) {
      return;
    }

    closeTaskTagsDialog();
    fields.fileToggle?.setAttribute("aria-expanded", "true");
    showTaskModal(filesDialog, { parent: dialog, trigger: fields.fileToggle });
    const focusTarget = currentTaskId
      ? filesDialog.querySelector("[data-file-attachment-input]")
      : fields.fileDialogClose;
    focusTaskControl(focusTarget);
  }

  function closeTaskFilesDialog() {
    if (!filesDialog) {
      return;
    }

    closeTaskModal(filesDialog);
  }

  function handleTaskFilesDialogClose() {
    fields.fileToggle?.setAttribute("aria-expanded", "false");
  }

  function closeTaskUtilityDialogs() {
    fields.tagToggle?.setAttribute("aria-expanded", "false");
    fields.fileToggle?.setAttribute("aria-expanded", "false");
    closeTaskTagsDialog();
    closeTaskFilesDialog();
  }

  async function toggleTaskNotificationFollow() {
    if (!currentTaskId || !namespace.notificationSubscriptions || !fields.notificationToggle) {
      return;
    }

    const isFollowing = fields.notificationToggle.dataset.isFollowing === "true";
    writeTaskControl(fields.notificationToggle, "disabled", true);
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
      setStatus(requireErrors().caughtMessage(error, "Notification follow change failed."), { isError: true });
    }
  }

  function writeNotificationFollowState(isFollowing) {
    if (!fields.notificationToggle) {
      return;
    }

    const label = isFollowing ? "Unfollow task notifications" : "Follow task notifications";
    fields.notificationToggle.dataset.isFollowing = String(isFollowing);
    fields.notificationToggle.classList.toggle("is-following", isFollowing);
    writeTaskControl(fields.notificationToggle, "disabled", false);
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
    const api = requireApi();
    try {
      return await api.getJson("/api/tasks/timers", { cache: "no-store" });
    } catch {
      return { timers: [] };
    }
  }

  async function refreshTaskTimers() {
    const result = await loadTaskTimers();
    taskTimers = requireTaskRecords().readTaskTimers(result);
    requireTaskControl(context).taskTimers = taskTimers;
    writeTaskTimerFields(currentTask);
  }

  async function saveTaskTimer(timerStatus) {
    const api = requireApi();
    const task = currentTask;

    if (!task) {
      return;
    }

    const timer = currentTaskTimer(task.task_id);
    const elapsedSeconds = readTaskTimerElapsedSeconds(timer);

    setStatus(timerStatus === "running" ? "Starting task timer..." : "Pausing task timer...");

    try {
      const result = await api.putJson(`/api/tasks/${encodeURIComponent(`${task.task_id}`)}/timer`, {
        active_task_timer_id: timer?.active_task_timer_id || "",
        timer_status: timerStatus,
        accumulated_elapsed_seconds: elapsedSeconds,
        last_active_start_time: new Date().toISOString(),
      });
      applyTaskTimerMutationResult(result, task);
      if (timerStatus === "paused") {
        offerTaskResumeNote(requireTaskRecords().readTask(result) || task);
      }
      setStatus("");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Task timer was not saved."), { isError: true });
    }
  }

  async function finalizeTaskTimer(event) {
    const api = requireApi();
    const task = currentTask;
    const timer = task ? currentTaskTimer(task.task_id) : null;

    if (!task || !timer) {
      return;
    }

    const durationSeconds = readTaskTimerElapsedSeconds(timer);

    setStatus("Saving task timer...");

    try {
      const result = await api.postJson(`/api/tasks/${encodeURIComponent(`${task.task_id}`)}/timer/finalize`, {
        duration_seconds: durationSeconds,
        end_time: new Date().toISOString(),
      });
      removeTaskTimer(task.task_id);
      applyTaskTimerMutationResult(result, task);
      offerTaskResumeNote(requireTaskRecords().readTask(result) || task, event?.currentTarget || null);
      setStatus("Task time saved.");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Task time was not saved."), { isError: true });
    }
  }

  async function resetTaskTimer() {
    const modal = requireModalDialogs();
    const api = requireApi();
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
      const result = await api.deleteJson(`/api/tasks/${encodeURIComponent(`${task.task_id}`)}/timer`);
      removeTaskTimer(task.task_id);
      applyTaskTimerMutationResult(result, task);
      setStatus("Task timer reset.");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Task timer was not reset."), { isError: true });
    }
  }

  function applyTaskTimerMutationResult(result, fallbackTask = currentTask) {
    if (result?.timer) {
      upsertTaskTimer(result.timer);
    }

    if (result?.task) {
      currentTask = {
        ...(currentTask || {}),
        ...result.task,
      };
      currentTaskId = result.task.task_id || currentTaskId;
      rememberTaskInContext(currentTask);
      syncTaskStatusField(currentTask);
      updateBlockedReasonState();
      writeTaskMetadataRibbon(currentTask);
      notifyTaskEditorSaved(result).catch((error) => {
        setStatus(error.message || "Task refresh hook failed.", { isError: true });
      });
      writeTaskTimerFields(currentTask);
      return currentTask;
    }

    writeTaskTimerFields(fallbackTask);
    return fallbackTask;
  }

  function syncTaskStatusField(task) {
    if (!fields.status || !task?.status) {
      return;
    }

    if ([...taskContextOptionItems(taskProjectionFields(fields.status).options)].some((item) => taskProjectionFields(item).value === task.status)) {
      writeTaskControl(fields.status, "value", task.status);
      previousTaskEditorStatus = task.status;
    }
    updateCompleteTaskActionState();
    updateBlockTaskActionState();
  }

  function offerTaskResumeNote(task, trigger = null) {
    void namespace.taskResumeNoteCapture?.offer({
      task,
      parent: dialog,
      trigger,
      onSaved(updatedTask) {
        if (updatedTask?.task_id === currentTask?.task_id) {
          applyTaskTimerMutationResult({ task: updatedTask }, currentTask);
          if (fields.resumeNote) {
            writeTaskControl(fields.resumeNote, "value", updatedTask.resume_note || "");
          }
        }
      },
      onError(error) {
        setStatus(error.message || "Resume note could not be saved.", { isError: true });
      },
    });
  }

  /** @returns {BrowserTaskLifecycleLegality} */
  function requireTaskLifecycleLegality() {
    const legality = window.LongtailForge?.taskLifecycleLegality;
    if (typeof legality?.isTerminalStatus !== "function") {
      throw new Error("Task actions require LongtailForge.taskLifecycleLegality.");
    }
    return legality;
  }

  function updateCompleteTaskActionState() {
    if (!fields.complete) {
      return;
    }

    const visible = canCompleteCurrentTask();
    fields.complete.hidden = !visible;
    writeTaskControl(fields.complete, "disabled", !visible);
  }

  function updateBlockTaskActionState() {
    if (!fields.block) {
      return;
    }

    const status = optionalTaskProjectionFields(fields.status)?.value || currentTask?.status || "";
    const isBlocked = status === "blocked";
    const visible = Boolean(
      currentTaskId &&
      !requireTaskLifecycleLegality().isTerminalStatus(status),
    );
    const label = isBlocked ? "Resume task" : "Block task";
    namespace.icons?.decorateButton?.(requireTaskIconButton(fields.block), {
      icon: isBlocked ? "start" : "pause",
      iconOnly: true,
      label,
      text: "",
      title: label,
    });
    fields.block.dataset.taskBlockMode = isBlocked ? "resume" : "block";
    fields.block.hidden = !visible;
    writeTaskControl(fields.block, "disabled", !visible);
  }

  function canCompleteCurrentTask() {
    const status = optionalTaskProjectionFields(fields.status)?.value || currentTask?.status || "";
    return Boolean(
      currentTaskId &&
      requireTaskLifecycleLegality().canCompleteStatus(status),
    );
  }

  function rememberTaskInContext(task) {
    if (!task?.task_id || !Array.isArray(context?.tasks)) {
      return;
    }

    const existingIndex = context.tasks.findIndex((item) => item.task_id === task.task_id);
    if (existingIndex >= 0) {
      context.tasks.splice(existingIndex, 1, task);
      return;
    }

    context.tasks.unshift(task);
  }

  function writeTaskTimerFields(task) {
    clearTaskTimerInterval();

    if (!fields.timerField) {
      return;
    }

    const options = taskProjectionFields(context?.options || defaultTaskOptions());
    const timerSurfaceAvailable = options.taskTimersEnabled !== false && options.timeTrackingEnabled !== false;
    const eligible = Boolean(
      task?.task_id &&
      task.project_id &&
      task.status !== "complete" &&
      task.status !== "archived" &&
      options.taskTimersEnabled !== false &&
      options.timeTrackingEnabled !== false,
    );
    const timer = task ? currentTaskTimer(task.task_id) : null;

    fields.timerField.hidden = !task?.task_id || !timerSurfaceAvailable;
    writeTaskControl(fields.timerStart, "disabled", !eligible || timer?.timer_status === "running");
    writeTaskControl(fields.timerPause, "disabled", !eligible || timer?.timer_status !== "running");
    writeTaskControl(fields.timerFinalize, "disabled", !eligible || !timer);
    writeTaskControl(fields.timerReset, "disabled", !timer);

    if (!timerSurfaceAvailable) {
      writeTaskControl(fields.timerStatus, "textContent", "");
      updateTaskTimerDisplay(timer);
      return;
    }

    if (!task?.task_id) {
      writeTaskControl(fields.timerStatus, "textContent", "Save the task before using a task timer.");
    } else if (!eligible) {
      writeTaskControl(fields.timerStatus, "textContent", readTaskTimerIneligibleReason(task));
    } else if (timer?.timer_status === "running") {
      writeTaskControl(fields.timerStatus, "textContent", "Running.");
    } else if (timer) {
      writeTaskControl(fields.timerStatus, "textContent", "Paused.");
    } else {
      writeTaskControl(fields.timerStatus, "textContent", "No active timer.");
    }

    updateTaskTimerDisplay(timer);
    if (timer?.timer_status === "running") {
      taskTimerIntervalId = global.setInterval(() => updateTaskTimerDisplay(timer), 1000);
    }
  }

  async function addChecklistItem() {
    const api = requireApi();
    if (!currentTaskId || !fields.checklistInput) {
      return;
    }

    const label = callTaskContextCollection(taskProjectionFields(fields.checklistInput).value, "trim", []);
    if (!label) {
      fields.checklistInput.focus();
      return;
    }

    setStatus("Adding checklist item...");

    try {
      const result = await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist`, { label });
      applyChecklistResult(result);
      writeTaskControl(fields.checklistInput, "value", "");
      setStatus("");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Checklist item was not added."), { isError: true });
    }
  }

  async function handleChecklistInputKeydown(event) {
    if (event.key !== "Enter" || event.isComposing) {
      return;
    }

    event.preventDefault();
    await addChecklistItem();
  }

  async function handleChecklistListKeydown(event) {
    const input = event.target.closest("[data-task-checklist-label]");
    if (!input || event.key !== "Enter" || event.isComposing) {
      return;
    }

    const row = input.closest("[data-task-checklist-item]");
    const itemId = row?.dataset.taskChecklistItem || "";
    if (!row || !itemId) {
      return;
    }

    event.preventDefault();
    await saveChecklistItemLabel(row, itemId);
  }

  async function handleChecklistChange(event) {
    const api = requireApi();
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
      setStatus(requireErrors().caughtMessage(error, "Checklist item was not updated."), { isError: true });
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
    const api = requireApi();
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
      setStatus(requireErrors().caughtMessage(error, "Checklist item was not saved."), { isError: true });
    }
  }

  async function deleteChecklistItem(row, itemId) {
    const modal = requireModalDialogs();
    const api = requireApi();
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
      setStatus(requireErrors().caughtMessage(error, "Checklist item was not removed."), { isError: true });
    }
  }

  async function moveChecklistItem(itemId, direction) {
    const api = requireApi();
    const items = [...(currentTask?.checklistItems || [])];
    const index = items.findIndex((item) => taskProjectionFields(item).task_checklist_item_id === itemId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const [item] = items.splice(index, 1);
    items.splice(nextIndex, 0, item);
    setStatus("Reordering checklist...");

    try {
      applyChecklistResult(await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/checklist/reorder`, {
        item_ids: items.map((candidate) => taskProjectionFields(candidate).task_checklist_item_id),
      }));
      setStatus("");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Checklist was not reordered."), { isError: true });
    }
  }

  function applyChecklistResult(result) {
    if (result?.task) {
      currentTask = result.task;
      currentTaskId = result.task.task_id || currentTaskId;
      rememberTaskInContext(currentTask);
    } else if (currentTask) {
      currentTask = {
        ...currentTask,
        checklistItems: result?.items || currentTask.checklistItems || [],
        checklistProgress: result?.checklistProgress || currentTask.checklistProgress,
      };
    }

    writeChecklistFields(currentTask);

    if (result?.task) {
      syncTaskStatusField(currentTask);
      updateBlockedReasonState();
      writeTaskMetadataRibbon(currentTask);
      writeTaskTimerFields(currentTask);
      notifyTaskEditorSaved(result).catch((error) => {
        setStatus(error.message || "Task refresh hook failed.", { isError: true });
      });
    }
  }

  async function notifyTaskEditorSaved(result) {
    if (currentTaskEditorRequest) {
      currentTaskEditorRequest.materializationRefreshPending = false;
    }
    const configuredCallback = context?.onSaved;
    const requestCallback = currentTaskEditorRequest?.onSaved;
    const requestRefresh = currentTaskEditorRequest?.refresh;
    const hostRefresh = optionalTaskProjectionFields(context?.hostContext)?.refresh;

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

  async function refreshMaterializedTaskRequest(request, result) {
    if (typeof request?.onSaved === "function") {
      await request.onSaved(result);
    }
    if (typeof request?.refresh === "function" && request.refresh !== request.onSaved) {
      await request.refresh(result);
    }
  }

  function restoreTaskEditorFocus(target) {
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus();
    }
  }

  function readTaskTimerIneligibleReason(task) {
    const options = taskProjectionFields(context?.options || defaultTaskOptions());

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
    requireTaskControl(context).taskTimers = taskTimers;
  }

  function removeTaskTimer(taskId) {
    taskTimers = taskTimers.filter((timer) => timer.task_id !== taskId);
    requireTaskControl(context).taskTimers = taskTimers;
  }

  function clearTaskTimerInterval() {
    if (taskTimerIntervalId) {
      global.clearInterval(taskTimerIntervalId);
      taskTimerIntervalId = null;
    }
  }

  function updateTaskTimerDisplay(timer) {
    writeTaskControl(fields.timerDisplay, "textContent", formatDuration(readTaskTimerElapsedSeconds(timer)));
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

    [...taskContextOptionItems(taskProjectionFields(requireTaskControl(fields.assignees)).options)].forEach((item) => {
      const option = taskProjectionFields(item);
      option.selected = selectedIds.has(option.value);
    });
  }

  function openRecurrenceDialog() {
    writeTaskControl(requireTaskControl(fields.recurrence).frequency, "value", recurrenceDraft.frequency || "WEEKLY");
    writeTaskControl(requireTaskControl(fields.recurrence).interval, "value", String(recurrenceDraft.interval || 1));
    writeTaskControl(requireTaskControl(fields.recurrence).endDate, "value", recurrenceDraft.endDate || "");

    showTaskModal(recurrenceDialog, { parent: dialog, trigger: fields.recurrenceDetails });
  }

  /** @param {Event} event */
  function saveRecurrenceDraft(event) {
    event.preventDefault();
    recurrenceDraft = {
      enabled: taskProjectionFields(requireTaskControl(fields.recurring)).checked,
      frequency: taskProjectionFields(requireTaskControl(requireTaskControl(fields.recurrence).frequency)).value || "WEEKLY",
      interval: readPositiveInteger(requireTaskControl(fields.recurrence).interval, 1),
      endDate: taskProjectionFields(requireTaskControl(requireTaskControl(fields.recurrence).endDate)).value || "",
    };
    updateRecurrenceState();
    closeTaskModal(recurrenceDialog, "saved");
  }

  /** @param {unknown} [details] */
  function writeRecurrenceFields(details = {}) {
    const detail = optionalTaskProjectionFields(details);
    const parsed = {
      ...defaultRecurrenceDraft(),
      enabled: Boolean(detail?.enabled),
      frequency: detail?.frequency || "WEEKLY",
      interval: Number.parseInt(`${detail?.interval}`, 10) || 1,
      endDate: detail?.endDate || detail?.end_date || "",
    };

    recurrenceDraft = parsed;
    writeTaskControl(fields.recurring, "checked", parsed.enabled);
    updateRecurrenceState();
  }

  function updateRecurrenceState() {
    if (!fields.recurring || !fields.recurrenceDetails) {
      return;
    }

    writeTaskControl(fields.recurrenceDetails, "disabled", !taskProjectionFields(fields.recurring).checked);
    writeTaskControl(fields.recurrenceSummary, "textContent", taskProjectionFields(fields.recurring).checked
      ? formatRecurrenceSummary(recurrenceDraft)
      : "Not recurring.");
  }

  function writeRecurrenceContinuity(continuity) {
    renderRecurrenceContinuity(fields.recurrenceContinuity, continuity);
  }

  function writeRecurrenceRecovery(recovery) {
    if (!fields.recurrenceSkipCurrent) {
      return;
    }
    fields.recurrenceSkipCurrent.hidden = !recovery?.available;
    writeTaskControl(fields.recurrenceSkipCurrent, "disabled", recovery?.blockedByActiveTimer === true);
    fields.recurrenceSkipCurrent.title = recovery?.blockedByActiveTimer
      ? "Stop or save active timers on earlier tasks first."
      : "Complete earlier active instances and keep the next occurrence that has not passed.";
  }

  async function skipRecurrenceToCurrent(event) {
    const modal = requireModalDialogs();
    const api = requireApi();
    event?.preventDefault();
    const recovery = optionalTaskProjectionFields(currentTask?.recurrenceRecovery);
    if (!currentTaskId || !recovery?.available || recovery.blockedByActiveTimer) {
      return;
    }

    const currentDescription = recovery.seriesEnded
      ? "The series has ended, so no new task will be kept."
      : `The ${recovery.targetDate} occurrence will be kept as the current task.`;
    const confirmed = await modal.confirm({
      title: "Skip to current task?",
      message: `${recovery.completedTaskCount} earlier active task${recovery.completedTaskCount === 1 ? "" : "s"} will be completed and ${recovery.skippedOccurrenceCount} unmaterialized occurrence${recovery.skippedOccurrenceCount === 1 ? "" : "s"} will be skipped. ${currentDescription}`,
      confirmLabel: "Skip to current",
      cancelLabel: "Cancel",
    });
    if (!confirmed) {
      return;
    }

    writeTaskControl(fields.recurrenceSkipCurrent, "disabled", true);
    setStatus("Recovering recurring task...");
    try {
      const result = await api.postJson(`/api/tasks/${encodeURIComponent(currentTaskId)}/skip-to-current`, {});
      const skipTarget = requireTaskRecords().readSkipToCurrentTarget(result);
      const targetTaskId = skipTarget?.task_id || "";
      const host = context?.hostContext;
      const callback = optionalTaskProjectionFields(host)?.complete;
      if (callback !== null && callback !== undefined) {
        const args = [{
        actionId: "tasks.skip-to-current",
        recordId: targetTaskId || currentTaskId,
        taskLifecycleAction: "skip-to-current",
        title: skipTarget?.title || currentTask?.title || "",
      }];
        if (typeof callback !== "function") {
          throw new TypeError("Task host complete is not callable.");
        }
        Reflect.apply(callback, host, args);
      }
      closeTaskModal(dialog, "complete");
      if (targetTaskId) {
        global.setTimeout(() => {
          void openTaskEditor({ mode: "edit", taskId: targetTaskId }, context?.hostContext || null);
        }, 0);
      }
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "The recurring task could not be recovered."), { isError: true });
      writeRecurrenceRecovery(recovery);
    }
  }

  function recurrenceContinuityMessage(continuity = {}) {
    if (!continuity?.isRecurring) {
      return "";
    }

    if (continuity.status === "ended") {
      return "Task completed. Recurring series ended.";
    }

    const scheduled = continuity.nextScheduledDate
      ? `Next scheduled ${continuity.nextScheduledDate}`
      : "Recurring follow-up";

    if (continuity.status === "available" && continuity.nextTask) {
      return `Task completed. ${scheduled}.`;
    }
    if (continuity.status === "handoff_failed") {
      return `Task completed. ${scheduled}; automatic recovery is pending.`;
    }
    return `Task completed. ${scheduled} (creating now).`;
  }

  function renderRecurrenceContinuity(container, continuity = {}) {
    if (!container) {
      return;
    }

    const message = recurrenceContinuityMessage(continuity);
    container.replaceChildren();
    container.hidden = !message;
    if (!message) {
      return;
    }

    container.append(document.createTextNode(message));
    if (continuity.status === "available" && continuity.nextTask?.url) {
      const link = document.createElement("a");
      link.className = "button button-secondary button-compact";
      link.href = continuity.nextTask.url;
      link.textContent = "Open next task";
      container.append(document.createTextNode(" "), link);
    }
  }

  async function pollRecurrenceContinuity(taskId, options = {}) {
    const api = requireApi();
    const attempts = Math.max(1, Number.parseInt(options.attempts, 10) || 7);
    const delayMs = Math.max(100, Number.parseInt(options.delayMs, 10) || 1500);
    let continuity = options.initialContinuity || null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => global.setTimeout(resolve, delayMs));
      }

      const result = await api.getJson(
        `/api/tasks/${encodeURIComponent(taskId)}/recurrence-continuity`,
        { cache: "no-store" },
      );
      continuity = result?.recurrenceContinuity || continuity;
      if (typeof options.onUpdate === "function") {
        await options.onUpdate(continuity, attempt);
      }
      if (["available", "ended"].includes(continuity?.status)) {
        break;
      }
    }

    return continuity;
  }

  function readRecurrencePayload() {
    return {
      enabled: Boolean(taskProjectionFields(requireTaskControl(fields.recurring)).checked),
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

  /** @param {typeof recurrenceDraft} recurrence */
  function formatRecurrenceSummary(recurrence) {
    const interval = Number.parseInt(`${recurrence.interval}`, 10) || 1;
    const frequency = String(recurrence.frequency || "WEEKLY").toUpperCase();
    const cadence = recurrenceCadenceLabel(frequency, interval);

    return recurrence.endDate ? `${cadence} until ${recurrence.endDate}.` : `${cadence}.`;
  }

  /** @param {string} frequency @param {number} interval */
  function recurrenceCadenceLabel(frequency, interval) {
    if (frequency === "WEEKDAYS") {
      return interval === 1 ? "Every weekday" : `Every ${interval} weekdays`;
    }

    if (frequency === "WEEKENDS") {
      return interval === 1 ? "Every weekend day" : `Every ${interval} weekend days`;
    }

    /** @type {Record<string, unknown>} */
    const units = {
      DAILY: "day",
      WEEKLY: "week",
      MONTHLY: "month",
    };
    const unit = units[frequency] || "week";

    return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  }

  /** @param {unknown} [details] */
  function writeReminderFields(details = {}) {
    const detail = optionalTaskProjectionFields(details);
    const policySource = detail?.overrideEnabled
      ? detail?.taskPolicy
      : optionalTaskProjectionFields(detail?.effectivePolicy)?.offsets;
    const taskPolicy = normalizeReminderPolicy(policySource || {});
    const effectivePolicy = normalizeReminderPolicy(optionalTaskProjectionFields(detail?.effectivePolicy)?.offsets || {});
    const timedHours = taskPolicy.dateTime.map((minutes) => Math.round(minutes / 60));
    const dateOnlyDays = taskPolicy.dateOnly.map((minutes) => Math.round(minutes / 1440));

    writeTaskControl(fields.reminderOverride, "checked", Boolean(detail?.overrideEnabled));
    writeTaskControl(fields.reminderDateTimeHours1, "value", String(timedHours[0] || 2));
    writeTaskControl(fields.reminderDateTimeHours2, "value", String(timedHours[1] || 24));
    writeTaskControl(fields.reminderDateTimeHours2Enabled, "checked", timedHours.length > 1);
    writeTaskControl(fields.reminderDateOnlyDays1, "value", String(dateOnlyDays[0] || 3));
    writeTaskControl(fields.reminderDateOnlyDays2, "value", String(dateOnlyDays[1] || 1));
    writeTaskControl(fields.reminderDateOnlyDays2Enabled, "checked", dateOnlyDays.length > 1);
    writeTaskControl(fields.effectiveReminders, "textContent", `Effective: timed ${formatOffsetList(effectivePolicy.dateTime, "hours")}; date-only ${formatOffsetList(effectivePolicy.dateOnly, "days")}.`);
    updateReminderOverrideState();
    updateSecondaryReminderState();
  }

  function updateReminderOverrideState() {
    writeTaskControl(fields.reminderOverrideFields, "hidden", !taskProjectionFields(requireTaskControl(fields.reminderOverride)).checked);
  }

  function updateSecondaryReminderState() {
    writeTaskControl(fields.reminderDateTimeHours2, "disabled", !taskProjectionFields(requireTaskControl(fields.reminderDateTimeHours2Enabled)).checked);
    writeTaskControl(fields.reminderDateOnlyDays2, "disabled", !taskProjectionFields(requireTaskControl(fields.reminderDateOnlyDays2Enabled)).checked);
  }

  function readReminderPolicy() {
    return {
      dateTime: [
        readPositiveInteger(fields.reminderDateTimeHours1, 2) * 60,
        ...(taskProjectionFields(requireTaskControl(fields.reminderDateTimeHours2Enabled)).checked
          ? [readPositiveInteger(fields.reminderDateTimeHours2, 24) * 60]
          : []),
      ],
      dateOnly: [
        readPositiveInteger(fields.reminderDateOnlyDays1, 3) * 1440,
        ...(taskProjectionFields(requireTaskControl(fields.reminderDateOnlyDays2Enabled)).checked
          ? [readPositiveInteger(fields.reminderDateOnlyDays2, 1) * 1440]
          : []),
      ],
    };
  }

  /** @param {unknown} [policy] */
  function normalizeReminderPolicy(policy = {}) {
    const offsets = taskProjectionFields(policy);
    return {
      dateTime: normalizeOffsetList(offsets.dateTime || offsets.date_time, [120, 1440]),
      dateOnly: normalizeOffsetList(offsets.dateOnly || offsets.date_only, [4320, 1440]),
    };
  }

  /** @param {unknown} values @param {readonly number[]} fallback */
  function normalizeOffsetList(values, fallback) {
    const offsets = (Array.isArray(values) ? values : [])
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 2);

    return offsets.length > 0 ? offsets : [...fallback];
  }

  /** @param {Element | null | undefined} input @param {number} fallback */
  function readPositiveInteger(input, fallback) {
    return Math.max(1, Number.parseInt(`${optionalTaskProjectionFields(input)?.value}`, 10) || fallback);
  }

  /** @param {readonly number[]} offsets @param {string} unit */
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

  function openTaskInWorkbench() {
    // Reuses the Workbench task-focus deep-link contract so an unreadable or
    // stale task degrades to Focus Selection there instead of erroring here.
    if (!currentTaskId) {
      return;
    }

    const url = new global.URL("workbench.html", global.location.href);
    url.searchParams.set("taskId", currentTaskId);
    global.location.assign(url.toString());
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

    if ([...select.options].some((item) => taskProjectionFields(item).value === previousValues[0])) {
      select.value = previousValues[0];
    }
  }

  function option(value, label) {
    return requirePageController().createOption(value, label);
  }

  function optionLabel(record) {
    return record?.optionLabel || record?.display_label || record?.displayName || record?.name || record?.title || "";
  }

  /** @param {unknown} [value] */
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
    return namespace.workspaceContext?.userId || "";
  }

  function usesClientScope() {
    return taskProjectionFields(context?.options || defaultTaskOptions()).workspaceType === "business";
  }

  function setStatus(message, options = {}) {
    if (typeof context?.setStatus === "function") {
      context.setStatus(message, options);
      return;
    }

    const host = context?.hostContext;
    const callback = optionalTaskProjectionFields(host)?.setStatus;
    if (callback !== null && callback !== undefined) {
      const args = [message, options];
      if (typeof callback !== "function") {
        throw new TypeError("Task host setStatus is not callable.");
      }
      Reflect.apply(callback, host, args);
    }
  }

  function focusTaskEditorTarget(target) {
    const focusTarget = normalizeTaskEditorFocusTarget(target);
    const targetMap = {
      assignees: fields.assignees,
      blocked_reason: fields.blockedReason,
      due_date: fields.dueDate,
      due_time: fields.dueTime,
      next_action: fields.nextAction,
      recurrence: fields.recurring || fields.recurrenceDetails,
      timer: fields.timerStart,
    };
    const panelMap = {
      assignees: fields.taskDetailsPanel,
      blocked_reason: fields.taskDetailsPanel,
      due_date: fields.taskDetailsPanel,
      due_time: fields.taskDetailsPanel,
      next_action: fields.taskDetailsPanel,
      recurrence: fields.recurrenceField,
      timer: fields.timerField,
    };

    if (focusTarget === "notes") {
      fields.notesPanel?.scrollIntoView?.({ block: "nearest" });
      requireTaskControl(fields.titleInput).focus();
      return;
    }

    const panel = panelMap[focusTarget];
    if (panel && "open" in panel) {
      panel.open = true;
    }

    const targetElement = targetMap[focusTarget] || fields.titleInput;
    targetElement?.scrollIntoView?.({ block: "nearest" });
    targetElement?.focus?.();
  }

  function updateBlockedReasonState() {
    if (!fields?.blockedReasonField || !fields?.blockedReason) {
      return;
    }

    const isBlocked = optionalTaskProjectionFields(fields.status)?.value === "blocked";
    fields.blockedReasonField.hidden = !isBlocked;
    writeTaskControl(fields.blockedReason, "disabled", !isBlocked);
    writeTaskControl(fields.blockedReason, "required", isBlocked);
    fields.continuityRow?.classList.toggle("is-blocked", isBlocked);

    if (isBlocked && !callTaskContextCollection(taskProjectionFields(fields.blockedReason).value, "trim", []) && document.activeElement === fields.status) {
      fields.blockedReason.focus();
    }
  }

  async function handleTaskStatusChange(event) {
    const nextStatus = optionalTaskProjectionFields(fields.status)?.value || "";
    updateBlockedReasonState();
    writeTaskMetadataRibbon();
    updateCompleteTaskActionState();
    updateBlockTaskActionState();

    if (nextStatus !== "blocked") {
      previousTaskEditorStatus = nextStatus || previousTaskEditorStatus;
      return;
    }

    await promptAndBlockCurrentTask({
      statusBefore: previousTaskEditorStatus,
      trigger: event?.currentTarget || fields.status,
    });
  }

  async function handleBlockResumeAction(event) {
    const status = optionalTaskProjectionFields(fields.status)?.value || currentTask?.status || "";
    if (status === "blocked") {
      await resumeBlockedTask();
      return;
    }
    await promptAndBlockCurrentTask({
      statusBefore: previousTaskEditorStatus,
      trigger: event?.currentTarget || fields.block,
    });
  }

  async function resumeBlockedTask() {
    const previousReason = optionalTaskProjectionFields(fields.blockedReason)?.value || currentTask?.blocked_reason || "";

    writeTaskControl(fields.status, "value", "in_progress");
    writeTaskControl(fields.blockedReason, "value", "");
    updateBlockedReasonState();
    writeTaskMetadataRibbon();
    updateCompleteTaskActionState();
    updateBlockTaskActionState();

    try {
      await saveTaskForm({
        closeOnSuccess: false,
        statusMessage: "Resuming task...",
      });
      previousTaskEditorStatus = "in_progress";
      setStatus("Task resumed.");
      return true;
    } catch {
      writeTaskControl(fields.status, "value", "blocked");
      writeTaskControl(fields.blockedReason, "value", previousReason);
      previousTaskEditorStatus = "blocked";
      updateBlockedReasonState();
      writeTaskMetadataRibbon();
      updateCompleteTaskActionState();
      updateBlockTaskActionState();
      return false;
    }
  }

  function promptAndBlockCurrentTask(options = {}) {
    if (activeBlockCapture) {
      return activeBlockCapture;
    }

    activeBlockCapture = performBlockCapture(options).finally(() => {
      activeBlockCapture = null;
    });
    return activeBlockCapture;
  }

  async function performBlockCapture({ statusBefore = "open", trigger = null } = {}) {
    const priorStatus = statusBefore && statusBefore !== "blocked" ? statusBefore : "open";
    const previousReason = optionalTaskProjectionFields(fields.blockedReason)?.value || "";
    let blockedReason = callTaskContextCollection(previousReason, "trim", []);

    writeTaskControl(fields.status, "value", "blocked");
    updateBlockedReasonState();
    writeTaskMetadataRibbon();
    updateCompleteTaskActionState();
    updateBlockTaskActionState();

    if (!blockedReason) {
      const capturePrompt = namespace.capturePrompt;
      if (!capturePrompt?.open) {
        throw new Error("Blocking a task requires the shared capture prompt.");
      }
      const result = await capturePrompt.open({
        cancelLabel: "Cancel",
        confirmLabel: "Continue",
        label: "Blocked reason",
        parent: dialog,
        prompt: "Why is the task now blocked?",
        trigger,
      });
      if (!result.confirmed) {
        writeTaskControl(fields.status, "value", priorStatus);
        writeTaskControl(fields.blockedReason, "value", previousReason);
        previousTaskEditorStatus = priorStatus;
        updateBlockedReasonState();
        writeTaskMetadataRibbon();
        updateCompleteTaskActionState();
        updateBlockTaskActionState();
        setStatus("");
        return false;
      }
      blockedReason = result.value;
      writeTaskControl(fields.blockedReason, "value", blockedReason);
    }

    try {
      await saveTaskForm({
        closeOnSuccess: false,
        statusMessage: "Blocking task...",
      });
      previousTaskEditorStatus = "blocked";
      updateBlockedReasonState();
      writeTaskMetadataRibbon(currentTask);
      updateCompleteTaskActionState();
      updateBlockTaskActionState();
      setStatus("Task blocked.");
      return true;
    } catch {
      updateBlockTaskActionState();
      return false;
    }
  }

  function writeChecklistFields(task) {
    if (!fields?.checklistField || !fields?.checklistList || !fields?.checklistStatus) {
      return;
    }

    const canUseChecklist = Boolean(task?.task_id);
    const items = task?.checklistItems || [];
    const progress = task?.checklistProgress || checklistProgress(items);

    writeTaskControl(fields.checklistInput, "disabled", !canUseChecklist);
    writeTaskControl(fields.checklistAdd, "disabled", !canUseChecklist);
    fields.checklistStatus.textContent = canUseChecklist
      ? formatChecklistProgress(progress)
      : "Save the task before adding checklist items.";
    fields.checklistList.replaceChildren(...items.map((item, index) => checklistItemRow(item, index, items.length)));
    writeTaskControl(fields.checklistField, "open", items.length > 0);
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

    const save = checklistActionButton("save", "Save checklist item");
    const up = checklistActionButton("up", "Move checklist item up");
    const down = checklistActionButton("down", "Move checklist item down");
    const remove = checklistActionButton("delete", "Remove checklist item");
    up.disabled = index === 0;
    down.disabled = index >= totalItems - 1;

    row.append(toggle, label, save, up, down, remove);
    return row;
  }

  function checklistActionButton(action, label) {
    if (!namespace.icons?.createIconButton) {
      throw new Error("Task checklist actions require LongtailForge.icons.createIconButton.");
    }

    const button = namespace.icons.createIconButton({
      icon: checklistActionIcon(action),
      iconOnly: true,
      label,
      text: "",
      title: label,
      type: "button",
      variant: action === "delete" ? "danger" : "",
    });
    button.classList.add("task-checklist-action");
    button.dataset.taskChecklistAction = action;
    return button;
  }

  function checklistActionIcon(action) {
    return {
      delete: "delete",
      down: "down",
      save: "save",
      up: "up",
    }[action] || "more";
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

  /** @param {unknown} [task] The change listener also supplies its Event unchanged. */
  function writeTaskMetadataRibbon(task = currentTask) {
    if (!fields?.metadataRibbon) {
      return;
    }

    const completionSeconds = hasCompletedTaskMetrics(task)
      ? optionalTaskProjectionFields(optionalTaskProjectionFields(task)?.completionMetrics)?.duration_seconds
      : null;
    const badges = [
      { label: "Status", value: selectedText(fields.status) || formatToken(optionalTaskProjectionFields(fields.status)?.value) },
      { label: "Priority", value: selectedText(fields.priority) || formatToken(optionalTaskProjectionFields(fields.priority)?.value) },
      optionalTaskProjectionFields(fields.estimate)?.value !== "" ? { label: "Estimate", value: formatEstimateMinutes(taskProjectionFields(requireTaskControl(fields.estimate)).value) } : null,
      usesClientScope() ? { label: "Client", value: selectedText(fields.client) || "No client" } : null,
      { label: "Project", value: selectedText(fields.project) || "No project" },
      optionalTaskProjectionFields(fields.dueDate)?.value ? { label: "Due Date", value: taskProjectionFields(fields.dueDate).value } : null,
      optionalTaskProjectionFields(fields.dueTime)?.value ? { label: "Due Time", value: taskProjectionFields(fields.dueTime).value } : null,
      completionSeconds !== null && completionSeconds !== undefined && Number.isFinite(Number(completionSeconds))
        ? { label: "TTC", value: formatDaysDuration(Number(completionSeconds)), className: "is-completion" }
        : null,
    ].filter((badge) => badge && badge.value);

    const ribbon = requireTaskDialogView().createDetailBadgeRow({
      ariaLabel: "Task summary",
      className: "task-metadata-ribbon",
      badges: badges.map(createMetadataBadge),
    });
    fields.metadataRibbon.className = ribbon.className;
    fields.metadataRibbon.replaceChildren(...Array.from(ribbon.children));
  }

  function createMetadataBadge(badge) {
    return {
      className: ["task-metadata-chip", badge.className],
      focusable: true,
      label: badge.label,
      value: badge.value,
      title: `${badge.label}: ${badge.value}`,
    };
  }

  /** @param {Element | null | undefined} select */
  function selectedText(select) {
    const selected = optionalTaskProjectionFields(optionalTaskProjectionFields(select)?.selectedOptions)?.[0];
    const text = optionalTaskProjectionFields(selected)?.textContent;
    return (text === null || text === undefined ? undefined : callTaskContextCollection(text, "trim", [])) || "";
  }

  function hasCompletedTaskMetrics(task) {
    return optionalTaskProjectionFields(fields.status)?.value === "complete" &&
      task?.status === "complete" &&
      Boolean(task?.completed_at || task?.completionMetrics?.completed_at);
  }

  /** @param {unknown} [value] */
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

  function formatEstimateMinutes(value) {
    const minutes = Math.max(0, Number(value) || 0);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    return hours > 0
      ? [`${hours}h`, remainder ? `${remainder}m` : ""].filter(Boolean).join(" ")
      : `${minutes}m`;
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

  /**
   * @param {{includeEditor?: unknown, includeRecurrence?: unknown, includeTags?: unknown, includeFiles?: unknown}} [options]
   */
  function createTaskDialogElements(options = {}) {
    const includeEditor = options.includeEditor !== false;
    const includeRecurrence = options.includeRecurrence !== false;
    const includeTags = options.includeTags !== false;
    const includeFiles = options.includeFiles !== false;
    return [
      includeEditor ? createTaskEditorDialog() : null,
      includeRecurrence ? createTaskRecurrenceDialog() : null,
      includeTags ? createTaskTagsDialog() : null,
      includeFiles ? createTaskFilesDialog() : null,
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
    const workbenchOpen = view.createActionButton({
      action: "open-task-in-workbench",
      className: "task-workbench-open",
      icon: "anvil",
      iconOnly: true,
      label: "Open in Workbench",
      role: "utility",
      title: "Open in Workbench",
    });
    const complete = view.createActionButton({
      action: "complete-task",
      className: "task-complete-action",
      icon: "complete",
      iconOnly: true,
      label: "Complete task",
      role: "primary",
      title: "Complete task",
    });
    const block = view.createActionButton({
      action: "block-task",
      className: "task-block-action",
      icon: "pause",
      iconOnly: true,
      label: "Block task",
      role: "secondary",
      title: "Block task",
    });
    const heading = view.createElement("div", {
      className: "surface-modal-heading",
      children: [
        dialog.viewParts.title,
        view.createElement("div", {
          className: "surface-modal-heading-actions",
          children: [block, complete, workbenchOpen, notificationToggle],
        }),
      ],
    });

    dialog.dataset.taskDialog = "";
    dialog.viewParts.form.dataset.taskForm = "";
    dialog.viewParts.title.dataset.taskDialogTitle = "";
    dialog.viewParts.body.classList.add("task-form-fields");
    dialog.viewParts.body.dataset.taskFormFields = "";
    dialog.viewParts.footer.classList.add("form-actions", "task-modal-actions", "surface-modal-footer--dense");
    dialog.viewParts.footer.dataset.modalFooter = "";
    heading.dataset.taskDialogHeading = "";
    block.dataset.blockTask = "";
    block.hidden = true;
    complete.dataset.completeTask = "";
    complete.hidden = true;
    workbenchOpen.dataset.taskWorkbenchOpen = "";
    workbenchOpen.hidden = true;
    notificationToggle.dataset.taskNotificationToggle = "";
    notificationToggle.hidden = true;
    notificationToggle.setAttribute("aria-pressed", "false");
    dialog.viewParts.form.insertBefore(heading, dialog.viewParts.body);
    return dialog;
  }

  function createTaskTagsDialog() {
    const view = requireTaskDialogView();
    const tagsMount = view.createElement("div", {
      attrs: { "data-task-tags": "" },
    });
    const close = view.createActionButton({
      label: "Done",
      role: "primary",
    });
    close.dataset.taskTagsDialogClose = "";
    const dialog = view.createModal({
      title: "Task Tags",
      className: "task-tags-dialog",
      body: [tagsMount],
      actions: [close],
    });
    dialog.dataset.taskTagsDialog = "";
    return dialog;
  }

  function createTaskFilesDialog() {
    const view = requireTaskDialogView();
    const filesMount = view.createElement("div", {
      attrs: { "data-task-files": "" },
    });
    const close = view.createActionButton({
      label: "Done",
      role: "primary",
    });
    close.dataset.taskFilesDialogClose = "";
    const dialog = view.createModal({
      title: "Task Files",
      className: "task-files-dialog",
      body: [filesMount],
      actions: [close],
    });
    dialog.dataset.taskFilesDialog = "";
    return dialog;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewActionButtonOptions} BrowserViewActionButtonOptions */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewElementOptions} BrowserViewElementOptions */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewDescriptorRenderers} BrowserViewDescriptorRenderers */

  /**
   * Whether this page received `view-renderer.js` as well as `view-builder.js`. Ten of the
   * eighteen builder pages do not, so `renderDescriptorModalForm` is genuinely partial on the
   * shared factory type and this predicate earns the narrowing rather than asserting it.
   * @param {BrowserViewFactory} factory
   * @returns {factory is BrowserViewFactory & BrowserViewDescriptorRenderers}
   */
  function hasDescriptorRenderers(factory) {
    return typeof factory.renderDescriptorModalForm === "function";
  }

  function requireTaskDialogView() {
    const view = namespace.view;
    if (!view?.renderDescriptorModalForm || !view?.createModal || !view?.createModalForm || !view?.showModal || !view?.closeModal || !view?.createActionButton || !view?.createElement || !view?.createDetailBadgeRow) {
      throw new Error("Task dialog requires LongtailForge.view modal helpers.");
    }
    if (!hasDescriptorRenderers(view)) {
      throw new Error("Task dialog requires LongtailForge.view.renderDescriptorModalForm.");
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
        { id: "tags", label: "Task tags", icon: "tag", role: "utility", text: "Tags" },
        { id: "files", label: "Task files", icon: "file", role: "utility", text: "Files" },
        { id: "copy-link", label: "Copy task link", icon: "copy", role: "utility", text: "Copy Link" },
      ],
      footerActions: [
        { id: "cancel", label: "Cancel", role: "secondary" },
        { id: "save-close", label: "Save & Close", icon: "save", role: "secondary" },
        { id: "save", label: "Save task", role: "primary" },
      ],
    };
  }

  /** @param {ReturnType<typeof taskEditorModalDescriptor>} descriptor */
  function taskEditorUtilityActions(descriptor) {
    const view = requireTaskDialogView();
    return descriptor.utilityActions.map((action) => {
      const button = view.createActionButton({
        action: action.id,
        className: "surface-modal-footer-action",
        icon: action.icon,
        iconOnly: false,
        label: action.label,
        role: action.role,
        text: action.text || action.label,
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

  /**
   * @param {{footerActions: readonly (ReturnType<typeof taskEditorModalDescriptor>["footerActions"][number] & Pick<BrowserViewActionButtonOptions, "iconOnly" | "text" | "title">)[]}} descriptor
   */
  function taskEditorCommitActions(descriptor) {
    const view = requireTaskDialogView();
    return descriptor.footerActions.map((action) => {
      const button = view.createActionButton({
        action: action.id,
        className: "surface-modal-footer-action",
        icon: action.icon,
        iconOnly: action.iconOnly === true,
        label: action.label,
        role: action.role,
        text: action.text === undefined ? (action.icon ? action.label : action.label) : action.text,
        title: action.title || action.label,
        type: action.id === "save" ? "submit" : "button",
      });

      if (action.id === "cancel") {
        button.dataset.cancelTask = "";
      } else if (action.id === "complete") {
        button.dataset.completeTask = "";
        button.hidden = true;
      } else if (action.id === "save-close") {
        button.dataset.saveCloseTask = "";
      } else if (action.id === "save") {
        button.dataset.saveTask = "";
      }
      return button;
    });
  }

  function taskEditorFieldNodes() {
    const view = requireTaskDialogView();
    return [
      taskEditorTitleField(view),
      taskEditorMetadataRibbon(view),
      taskEditorContinuitySection(view),
      taskEditorDetailsSection(view),
      taskEditorChecklistSection(view),
      taskEditorRecurrenceSection(view),
      taskEditorTimerSection(view),
      taskEditorReminderSection(view),
      taskEditorNotesSection(view),
    ];
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorTitleField(view) {
    return taskEditorLabel(view, "Title", view.createElement("input", {
      attrs: {
        type: "text",
        "data-task-title": "",
        required: true,
      },
    }), { className: "task-title-field" });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorMetadataRibbon(view) {
    return view.createElement("div", {
      className: ["task-metadata-ribbon", "view-detail-badges", "surface-chip-row"],
      attrs: {
        "data-task-metadata-ribbon": "",
        "aria-label": "Task summary",
      },
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorDetailsSection(view) {
    return view.createElement("details", {
      className: ["task-details-field", "surface-modal-group"],
      attrs: {
        "data-task-details-panel": "",
        open: true,
      },
      children: [
        taskEditorSectionHeading(view, "summary", "Task Details"),
        view.createElement("div", {
          className: ["task-details-grid", "surface-modal-section-body"],
          children: [
            taskEditorLabel(view, "Status", taskEditorSelect(view, { "data-task-form-status": "" }, [
              ["open", "Open"],
              ["in_progress", "In Progress"],
              ["blocked", "Blocked"],
              ["complete", "Complete"],
              ["archived", "Archived"],
            ])),
            taskEditorLabel(view, "Priority", taskEditorSelect(view, { "data-task-priority": "" }, [
              ["low", "Low"],
              ["normal", "Normal"],
              ["high", "High"],
              ["urgent", "Urgent"],
            ])),
            taskEditorLabel(view, "Estimate (minutes)", taskEditorInput(view, "number", {
              "data-task-estimate-minutes": "",
              inputmode: "numeric",
              min: "0",
              placeholder: "15-minute increments",
              step: "15",
            })),
            taskEditorLabel(view, "Client", taskEditorSelect(view, { "data-task-client": "" }), {
              attrs: { "data-client-workspace-control": "" },
            }),
            taskEditorLabel(view, "Project", taskEditorSelect(view, { "data-task-project": "" })),
            taskEditorLabel(view, "Parent Task", taskEditorSelect(view, { "data-task-parent-task": "" }), {
              className: "task-parent-field",
            }),
            taskEditorLabel(view, "Due Date", taskEditorInput(view, "date", { "data-task-due-date": "" }), {
              className: "task-due-date-field",
            }),
            taskEditorLabel(view, "Due Time", taskEditorInput(view, "time", { "data-task-due-time": "" }), {
              className: "task-due-time-field",
            }),
            taskEditorLabel(view, "Description", taskEditorTextarea(view, {
              rows: "5",
              "data-task-description": "",
            }), { className: "task-description-field" }),
            taskEditorLabel(view, "Assignees", taskEditorSelect(view, {
              "data-task-assignees": "",
              "aria-label": "Assignees",
              multiple: true,
            }), { className: "task-assignee-field" }),
          ],
        }),
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorChecklistSection(view) {
    return view.createElement("details", {
      className: ["task-checklist-field", "surface-modal-group"],
      attrs: { "data-task-checklist-field": "" },
      children: [
        taskEditorSectionHeading(view, "summary", "Checklist"),
        view.createElement("p", {
          className: "surface-modal-section-help",
          attrs: { "data-task-checklist-status": "" },
          text: "0 / 0 complete",
        }),
        view.createElement("div", {
          className: ["task-checklist-add-row", "surface-modal-section-body"],
          children: [
            taskEditorInput(view, "text", {
              maxlength: "240",
              "data-task-checklist-input": "",
              "aria-label": "Checklist item",
              placeholder: "Add checklist item",
            }),
            taskEditorChecklistAddButton(view),
          ],
        }),
        view.createElement("div", {
          className: "task-checklist-list",
          attrs: { "data-task-checklist-list": "" },
        }),
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorChecklistAddButton(view) {
    const button = view.createActionButton({
      className: "task-checklist-add-button",
      icon: "add",
      iconOnly: true,
      label: "Add checklist item",
      text: "",
      title: "Add checklist item",
      type: "button",
    });
    button.dataset.taskChecklistAdd = "";
    return button;
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorRecurrenceSection(view) {
    return view.createElement("details", {
      className: ["task-recurrence-field", "surface-modal-group", "surface-divider-top"],
      attrs: { "data-task-recurrence-panel": "" },
      children: [
        taskEditorSectionHeading(view, "summary", "Recurrence"),
        view.createElement("div", {
          className: ["task-recurrence-controls", "surface-modal-section-body"],
          children: [
            taskEditorInlineCheckbox(view, "Recurring?", { "data-task-recurring": "" }),
            taskEditorButton(view, "Details", { "data-task-recurrence-details": "", disabled: true }),
            taskEditorButton(view, "Skip to current", {
              "data-task-recurrence-skip-current": "",
              hidden: true,
            }),
          ],
        }),
        view.createElement("p", {
          className: "surface-modal-section-help",
          attrs: { "data-task-recurrence-summary": "" },
          text: "Not recurring.",
        }),
        view.createElement("p", {
          className: "surface-modal-section-help task-recurrence-continuity",
          attrs: { "data-task-recurrence-continuity": "" },
          hidden: true,
        }),
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorTimerSection(view) {
    return view.createElement("section", {
      className: ["task-timer-field", "surface-modal-group"],
      attrs: { "data-task-timer-field": "" },
      hidden: true,
      children: [
        taskEditorSectionHeading(view, "h3", "Task Timer"),
        view.createElement("p", {
          className: "surface-modal-section-help",
          attrs: { "data-task-timer-status": "" },
          text: "No active timer.",
        }),
        view.createElement("div", {
          className: ["task-timer-controls", "surface-modal-section-body", "surface-dense-actions"],
          children: [
            view.createElement("strong", {
              className: "surface-chip",
              attrs: { "data-task-timer-display": "" },
              text: "00:00:00",
            }),
            taskEditorButton(view, "Start", { "data-task-timer-start": "" }),
            taskEditorButton(view, "Pause", { "data-task-timer-pause": "", disabled: true }),
            taskEditorButton(view, "Save Time", { "data-task-timer-finalize": "", disabled: true }),
            taskEditorButton(view, "Reset", { "data-task-timer-reset": "", disabled: true }),
          ],
        }),
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorReminderSection(view) {
    return view.createElement("details", {
      className: ["task-reminder-field", "surface-modal-group", "surface-divider-top"],
      attrs: { "data-task-reminder-details": "" },
      children: [
        taskEditorSectionHeading(view, "summary", "Reminders"),
        view.createElement("p", {
          className: "surface-modal-section-help",
          attrs: { "data-task-effective-reminders": "" },
        }),
        taskEditorInlineCheckbox(view, "Override reminder defaults", { "data-task-reminder-override": "" }),
        view.createElement("div", {
          className: ["reminder-offset-grid", "surface-modal-section-body"],
          attrs: { "data-task-reminder-override-fields": "" },
          hidden: true,
          children: [
            taskEditorLabel(view, "Timed Reminder 1 (hours before)", taskEditorInput(view, "number", {
              min: "1",
              step: "1",
              "data-task-reminder-date-time-hours-1": "",
            })),
            taskEditorOptionalReminderField(view, "Timed Reminder 2 (hours before)", taskEditorInput(view, "number", {
              id: "task-reminder-date-time-hours-2",
              min: "1",
              step: "1",
              "data-task-reminder-date-time-hours-2": "",
            }), {
              "aria-label": "Enable Timed Reminder 2",
              "data-task-reminder-date-time-hours-2-enabled": "",
            }),
            taskEditorLabel(view, "Date-Only Reminder 1 (days before)", taskEditorInput(view, "number", {
              min: "1",
              step: "1",
              "data-task-reminder-date-only-days-1": "",
            })),
            taskEditorOptionalReminderField(view, "Date-Only Reminder 2 (days before)", taskEditorInput(view, "number", {
              id: "task-reminder-date-only-days-2",
              min: "1",
              step: "1",
              "data-task-reminder-date-only-days-2": "",
            }), {
              "aria-label": "Enable Date-Only Reminder 2",
              "data-task-reminder-date-only-days-2-enabled": "",
            }),
          ],
        }),
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorNotesSection(view) {
    return view.createElement("details", {
      className: ["task-notes-field", "surface-modal-group", "surface-divider-top"],
      attrs: { "data-task-notes-panel": "" },
      children: [
        taskEditorSectionHeading(view, "summary", "Notes"),
        view.createElement("div", {
          className: "surface-modal-section-body",
          attrs: { "data-task-notes": "" },
        }),
      ],
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {string} tagName
   * @param {BrowserViewElementOptions["text"]} text
   */
  function taskEditorSectionHeading(view, tagName, text) {
    return view.createElement(tagName, {
      className: "surface-modal-section-heading",
      text,
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {BrowserViewElementOptions["text"]} label
   * @param {BrowserViewElementOptions["children"]} controls
   * @param {Pick<BrowserViewElementOptions, "className" | "attrs" | "hidden">} [options]
   */
  function taskEditorLabel(view, label, controls, options = {}) {
    return view.createElement("label", {
      className: options.className,
      attrs: options.attrs,
      hidden: options.hidden,
      children: [label, controls],
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {BrowserViewElementOptions["text"]} label
   * @param {BrowserViewElementOptions["attrs"]} [attrs]
   */
  function taskEditorInlineCheckbox(view, label, attrs = {}) {
    return view.createElement("label", {
      className: "inline-option",
      children: [
        taskEditorInput(view, "checkbox", attrs),
        label,
      ],
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {BrowserViewElementOptions["text"]} label
   * @param {ReturnType<typeof taskEditorInput>} control
   * @param {BrowserViewElementOptions["attrs"]} enableAttrs
   */
  function taskEditorOptionalReminderField(view, label, control, enableAttrs) {
    return view.createElement("div", {
      className: "task-reminder-offset-field",
      children: [
        view.createElement("div", {
          className: "task-reminder-offset-heading",
          children: [
            view.createElement("label", {
              attrs: { for: control.id },
              text: label,
            }),
            taskEditorInlineCheckbox(view, "Enabled", enableAttrs),
          ],
        }),
        control,
      ],
    });
  }

  /** @param {BrowserViewFactory} view */
  function taskEditorContinuitySection(view) {
    return view.createElement("section", {
      className: ["task-continuity-row", "surface-modal-group"],
      attrs: {
        "data-view-field-width": "full",
        "data-task-continuity-row": "",
        "aria-label": "Work continuity",
      },
      children: [
        taskEditorLabel(view, "Resume note", taskEditorTextarea(view, {
          rows: "2",
          "data-task-resume-note": "",
          placeholder: "Where did you leave off?",
        }), { className: "task-resume-note-field" }),
        taskEditorLabel(view, "Next action", taskEditorTextarea(view, {
          rows: "2",
          maxlength: "240",
          "data-task-next-action": "",
          placeholder: "What's the next thing?",
        }), { className: "task-next-action-field" }),
        taskEditorLabel(view, "Blocked reason", taskEditorTextarea(view, {
          rows: "1",
          "data-task-blocked-reason": "",
        }), {
          className: "task-blocked-reason-field",
          attrs: { "data-task-blocked-reason-field": "" },
          hidden: true,
        }),
      ],
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {BrowserViewElementOptions["attrs"]} [attrs]
   * @param {readonly (readonly [unknown, unknown])[]} [options]
   */
  function taskEditorSelect(view, attrs = {}, options = []) {
    return view.createElement("select", {
      attrs,
      children: options.map(([value, label]) => view.createElement("option", {
        attrs: { value },
        text: label,
      })),
    });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {unknown} type
   * @param {BrowserViewElementOptions["attrs"]} [attrs]
   */
  function taskEditorInput(view, type, attrs = {}) {
    return view.createElement("input", {
      attrs: {
        type,
        ...attrs,
      },
    });
  }

  /** @param {BrowserViewFactory} view @param {BrowserViewElementOptions["attrs"]} [attrs] */
  function taskEditorTextarea(view, attrs = {}) {
    return view.createElement("textarea", { attrs });
  }

  /**
   * @param {BrowserViewFactory} view
   * @param {BrowserViewElementOptions["text"]} label
   * @param {BrowserViewElementOptions["attrs"]} [attrs]
   */
  function taskEditorButton(view, label, attrs = {}) {
    return view.createElement("button", {
      attrs: {
        type: "button",
        ...attrs,
      },
      text: label,
    });
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

  /** @param {ReturnType<typeof taskRecurrenceModalDescriptor>} descriptor */
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
    pollRecurrenceContinuity,
    recurrenceContinuityMessage,
    renderRecurrenceContinuity,
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
