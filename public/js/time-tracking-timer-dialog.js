/* global CustomEvent */

(function attachTimeTrackingTimerDialog(global) {
  const namespace = global.LongtailForge || {};
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
      throw new Error("The time tracking timer dialog requires LongtailForge.pageController.");
    }
    return pageController;
  }

  const TIMER_ACTION_ID = "time-tracking.timer.create";
  const MAX_MANUAL_TIMER_SLOTS = 4;

  /** @typedef {import("../../src/types/browser-contracts.js").NormalizedClientOption} NormalizedClientOption */
  /** @typedef {import("../../src/types/browser-contracts.js").NormalizedProjectOption} NormalizedProjectOption */

  /**
   * The four callbacks this dialog offers back to whichever host opened it.
   *
   * **Every member is optional and none is given a signature**, which is the whole point.
   * `0.33.33.38.2.2.6.4.1` withdrew the published `ModuleActionHostOptions` because a
   * host-supplied callback shape is read defensively and typing it constrains callers the
   * runtime does not constrain. This is file-local and names only what this dialog itself
   * reaches for, so it constrains no caller and reinstates no shared contract - a host that
   * offers none of them, or offers others besides, is unaffected.
   *
   * The optional-call spelling at each site is kept rather than replaced by a checked reader:
   * `host?.complete?.(...)` throws when the member exists but is not callable, and a reader
   * answering null would have turned that into a silent skip. That is a behaviour change, and
   * this checkpoint is typing the dialog rather than deciding how it should fail.
   * @typedef {object} TimerDialogHost
   * @property {((detail?: unknown) => unknown)} [cancel]
   * @property {((detail?: unknown) => unknown)} [complete]
   * @property {((...args: unknown[]) => unknown)} [refresh]
   * @property {((message?: unknown, options?: unknown) => unknown)} [setStatus]
   */

  /**
   * The first of several spellings a record carries, as text.
   *
   * Two producers need this and neither is a declared record: the parameters come from whichever
   * surface asked for this dialog, and the task rows come off the wire. Own members only, and
   * falsy answers keep falling through exactly as the `||` chains they replace did - so a `0` or
   * an empty string still yields to the next spelling rather than being coerced into truthy text.
   * @param {unknown} source
   * @param {...string} names
   * @returns {string}
   */
  function readText(source, ...names) {
    if (typeof source !== "object" || source === null) {
      return "";
    }

    for (const name of names) {
      const value = Object.hasOwn(source, name)
        ? /** @type {Record<string, unknown>} */ (source)[name]
        : undefined;
      if (value) {
        return String(value);
      }
    }

    return "";
  }

  /**
   * The task rows a task-options response carries, before any of them is read.
   * @param {unknown} data
   * @returns {unknown[]}
   */
  function taskOptionRows(data) {
    if (typeof data !== "object" || data === null || !Object.hasOwn(data, "options")) {
      return [];
    }

    const options = /** @type {Record<string, unknown>} */ (data).options;
    if (typeof options !== "object" || options === null || !Object.hasOwn(options, "tasks")) {
      return [];
    }

    const tasks = /** @type {Record<string, unknown>} */ (options).tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  /**
   * The nine controls this dialog renders, each at the subtype `dialogMarkup` writes.
   *
   * **Typed-or-null on purpose**, the reading `0.33.33.44.5` settled and this lane has reused
   * since - but the reason is unusual here and worth stating: this dialog authors its own markup
   * and appends it, so the controls exist because `ensureDialog` just created them. They are
   * still acquired as nullable, because the surface can also be found already in the document
   * from an earlier open, and that copy is whatever the document actually holds rather than what
   * this file last wrote. The subtype is settled at acquisition; presence is settled at the
   * statement that already dereferenced it.
   * @typedef {object} TimerDialogFields
   * @property {HTMLSelectElement | null} billable
   * @property {HTMLElement | null} billableControl
   * @property {HTMLButtonElement | null} cancel
   * @property {HTMLSelectElement | null} client
   * @property {HTMLTextAreaElement | null} description
   * @property {HTMLSelectElement | null} project
   * @property {HTMLButtonElement | null} save
   * @property {HTMLElement | null} status
   * @property {HTMLSelectElement | null} task
   */

  /**
   * One task this dialog can start a timer against, as `normalizeTaskOptions` rebuilds it.
   * @typedef {object} TimerTaskOption
   * @property {string} client_id
   * @property {string} id
   * @property {string} label
   * @property {string} optionLabel
   * @property {string} project_id
   * @property {string} status
   */

  /**
   * What `prepareContext` settles before the dialog opens: the host that asked for it, the
   * parameters it was asked with, and the status writer that reports back to that host.
   * @typedef {object} TimerDialogContext
   * @property {TimerDialogHost | null} hostContext
   * @property {Record<string, unknown>} params
   * @property {(message: string, options?: Record<string, unknown>) => void} setStatus
   */

  /** @type {TimerDialogContext | null} */
  let context = null;
  /** @type {HTMLDialogElement | null} */
  let dialog = null;
  /** @type {HTMLFormElement | null} */
  let form = null;
  /** @type {TimerDialogFields} */
  let fields = emptyTimerDialogFields();
  /** @type {NormalizedClientOption[]} */
  let clients = [];
  /** @type {TimerTaskOption[]} */
  let taskOptions = [];
  /** @type {BrowserActiveTimerSlotRecord[]} */
  let activeManualTimers = [];
  let dialogSettled = false;

  /**
   * The record before any control is acquired, so the shape is the same in every state rather
   * than an empty object that later grows nine members.
   * @returns {TimerDialogFields}
   */
  function emptyTimerDialogFields() {
    return {
      billable: null,
      billableControl: null,
      cancel: null,
      client: null,
      description: null,
      project: null,
      save: null,
      status: null,
      task: null,
    };
  }

  /**
   * Acquire one control from a named root, at the subtype the caller names.
   *
   * The root is a parameter because this dialog queries two of them: the document, for the
   * surface itself, and that surface, for the nine controls inside it.
   * @template {Element} T
   * @param {ParentNode} root
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function findTimerControl(root, selector, constructor) {
    const element = root.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * Narrow at an access this dialog already made unguarded.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireTimerValue(value, name) {
    if (value === null) {
      throw new TypeError(`The time tracking timer dialog requires its ${name}.`);
    }

    return value;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

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
      throw new Error("The time tracking timer dialog requires LongtailForge.errors.");
    }
    return errors;
  }

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
      throw new Error("The time tracking timer dialog requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @param {Record<string, unknown>} [params] @param {TimerDialogHost | null} [hostContext] */
  async function openCreate(params = {}, hostContext = null) {
    await prepareContext({ hostContext, params });
    return openDialog(params);
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserActiveTimerSlotRecord} BrowserActiveTimerSlotRecord */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserActiveTimerList} BrowserActiveTimerList */

  /**
   * A plain JSON object, which is the least a wire value can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isActiveTimerRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One active timer, vouched for only as far as its slot.
   *
   * The response carries a much richer row; this promises the one member both list consumers
   * rely on, and the record travels onward with everything else it arrived with.
   * @param {unknown} value
   * @returns {value is BrowserActiveTimerSlotRecord}
   */
  function isActiveTimerSlotRecord(value) {
    return isActiveTimerRecord(value) && typeof value.timer_slot === "string" && value.timer_slot !== "";
  }

  /**
   * The active manual timers, or `null` when the list cannot be vouched for.
   *
   * **An unreadable list is not an empty one, and the difference is a write hazard.** Slot
   * occupancy is decided from this response: read as empty, the page concludes that every manual
   * slot is free. So a missing or non-array `timers`, or one element without a usable slot,
   * refuses the whole response rather than being filtered - this is state restoration, not a
   * candidate picker, and a dropped timer is a slot the page would then believe is free.
   *
   * `{ timers: [] }` is a real answer and is accepted.
   * @param {unknown} body
   * @returns {BrowserActiveTimerList | null}
   */
  function readActiveTimerList(body) {
    if (!isActiveTimerRecord(body) || !Array.isArray(body.timers)) {
      return null;
    }
    // Filtered and length-checked rather than rebuilt: the elements pass through by reference,
    // so the richer payload later code still reads is not truncated by narrowing its type.
    const timers = body.timers.filter(isActiveTimerSlotRecord);
    return timers.length === body.timers.length ? { timers } : null;
  }

  /** @param {{ hostContext?: TimerDialogHost | null, params?: Record<string, unknown> }} [options] */
  async function prepareContext({ hostContext = null, params = {} } = {}) {
    const api = requireApi();
    await namespace.workspaceContextReady;
    const [clientProjectData, taskOptionsData, activeTimersData] = await Promise.all([
      api.getJson("/api/client-projects?view=options", { cache: "no-store" }),
      loadTaskOptions(),
      api.getJson("/api/active-timers", { cache: "no-store" }),
    ]);

    clients = requireClientProjectOptions().normalizeClients(clientProjectData);
    taskOptions = normalizeTaskOptions(taskOptionsData);
    // The same producer and the same hazard as the stopwatch: if this list reads as empty when
    // it could not be read, `nextManualTimerSlot` hands back a slot the server may already be
    // running a timer in. Preparation fails instead, which the caller already handles.
    const activeTimerList = readActiveTimerList(activeTimersData);
    if (!activeTimerList) {
      throw new Error("Active timers could not be read.");
    }
    activeManualTimers = activeTimerList.timers;
    context = {
      hostContext,
      params,
      setStatus: (message, options = {}) => hostContext?.setStatus?.(message, options),
    };
    ensureDialog();
  }

  async function loadTaskOptions() {
    const api = requireApi();
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

  /** @param {Record<string, unknown>} [params] */
  function openDialog(params = {}) {
    ensureDialog();
    dialogSettled = false;

    const surface = requireTimerValue(dialog, "dialog");
    const clientSelect = requireTimerValue(fields.client, "client select");
    const taskSelect = requireTimerValue(fields.task, "task select");

    populateClientOptions();
    clientSelect.value = readText(params, "clientId", "client_id");
    selectWorkspaceScopeClientIfNeeded();
    populateProjectOptions(readText(params, "projectId", "project_id"));
    taskSelect.value = readText(params, "taskId", "task_id");
    populateTaskOptions(taskSelect.value);
    requireTimerValue(fields.description, "description field").value = readText(params, "description");
    if (taskSelect.value) {
      handleTaskChange();
    } else {
      updateBillableDefault();
    }
    requireTimerValue(fields.billableControl, "billable control").hidden = !workspaceUsesBillableFlag();
    if (!workspaceUsesBillableFlag()) {
      requireTimerValue(fields.billable, "billable select").value = "no";
    }
    setStatus("");
    requireTimerValue(fields.save, "save button").disabled = false;

    if (typeof surface.showModal === "function") {
      surface.showModal();
    } else {
      surface.setAttribute("open", "");
    }

    clientSelect.focus();

    return new Promise((resolve) => {
      surface.addEventListener("close", () => {
        if (!dialogSettled) {
          context?.hostContext?.cancel?.({ actionId: TIMER_ACTION_ID });
        }
        resolve(surface.returnValue || "closed");
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = findTimerControl(document, "[data-time-tracking-timer-dialog]", HTMLDialogElement);

    if (!dialog) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = dialogMarkup();
      document.body.append(...wrapper.children);
      dialog = findTimerControl(document, "[data-time-tracking-timer-dialog]", HTMLDialogElement);
    }

    const surface = requireTimerValue(dialog, "dialog");

    form = findTimerControl(surface, "[data-time-tracking-timer-dialog-form]", HTMLFormElement);
    fields = {
      billable: findTimerControl(surface, "[data-time-tracking-timer-dialog-billable]", HTMLSelectElement),
      billableControl: findTimerControl(surface, "[data-time-tracking-timer-dialog-billable-control]", HTMLElement),
      cancel: findTimerControl(surface, "[data-time-tracking-timer-dialog-cancel]", HTMLButtonElement),
      client: findTimerControl(surface, "[data-time-tracking-timer-dialog-client]", HTMLSelectElement),
      description: findTimerControl(surface, "[data-time-tracking-timer-dialog-description]", HTMLTextAreaElement),
      project: findTimerControl(surface, "[data-time-tracking-timer-dialog-project]", HTMLSelectElement),
      save: findTimerControl(surface, "[data-time-tracking-timer-dialog-save]", HTMLButtonElement),
      status: findTimerControl(surface, "[data-time-tracking-timer-dialog-status]", HTMLElement),
      task: findTimerControl(surface, "[data-time-tracking-timer-dialog-task]", HTMLSelectElement),
    };

    const boundForm = requireTimerValue(form, "dialog form");

    if (boundForm.dataset.timeTrackingTimerDialogBound === "true") {
      return;
    }

    boundForm.dataset.timeTrackingTimerDialogBound = "true";
    boundForm.addEventListener("submit", startTimer);
    requireTimerValue(fields.cancel, "cancel button").addEventListener("click", cancelDialog);
    requireTimerValue(fields.client, "client select").addEventListener("change", () => {
      populateProjectOptions();
      populateTaskOptions();
      updateBillableDefault();
    });
    requireTimerValue(fields.project, "project select").addEventListener("change", () => {
      populateTaskOptions();
      updateBillableDefault();
    });
    requireTimerValue(fields.task, "task select").addEventListener("change", handleTaskChange);
  }

  function cancelDialog() {
    dialogSettled = true;
    context?.hostContext?.cancel?.({ actionId: TIMER_ACTION_ID });
    requireTimerValue(dialog, "dialog").close("cancel");
  }

  function populateClientOptions() {
    const clientSelect = requireTimerValue(fields.client, "client select");

    clientSelect.replaceChildren(createOption("", "Select a client"));
    clients.forEach((client) => {
      clientSelect.appendChild(createOption(client.id, clientOptionLabel(client)));
    });
    clientSelect.disabled = clients.length === 0;
  }

  /** @param {string} [projectId] */
  function populateProjectOptions(projectId = "") {
    const projectSelect = requireTimerValue(fields.project, "project select");
    const client = getClient(requireTimerValue(fields.client, "client select").value);

    projectSelect.replaceChildren(createOption("", "Select a project"));
    projectSelect.disabled = !client;

    if (!client) {
      return;
    }

    client.projects.forEach((project) => {
      projectSelect.appendChild(createOption(project.id, projectOptionLabel(project)));
    });
    projectSelect.value = client.projects.some((project) => project.id === projectId) ? projectId : "";
  }

  /** @param {string} [taskId] */
  function populateTaskOptions(taskId = requireTimerValue(fields.task, "task select").value) {
    const taskSelect = requireTimerValue(fields.task, "task select");
    const selectedProjectId = requireTimerValue(fields.project, "project select").value;
    const taskCandidates = taskOptions.filter((task) => (
      task.project_id && (!selectedProjectId || task.project_id === selectedProjectId)
    ));

    taskSelect.replaceChildren(createOption("", "No task"));
    taskCandidates.forEach((task) => {
      taskSelect.appendChild(createOption(task.id, task.optionLabel || task.label || "Untitled Task"));
    });
    taskSelect.value = taskCandidates.some((task) => task.id === taskId) ? taskId : "";
    taskSelect.disabled = taskOptions.length === 0;
  }

  function handleTaskChange() {
    const description = requireTimerValue(fields.description, "description field");
    const task = getTask(requireTimerValue(fields.task, "task select").value);

    if (!task) {
      updateBillableDefault();
      return;
    }

    const clientId = findClientIdForTask(task);
    if (clientId) {
      requireTimerValue(fields.client, "client select").value = clientId;
      populateProjectOptions(task.project_id || "");
      requireTimerValue(fields.project, "project select").value = task.project_id || "";
    }
    populateTaskOptions(task.id);
    if (!description.value.trim()) {
      description.value = task.label || "";
    }
    updateBillableDefault();
  }

  /** @param {Event} event */
  async function startTimer(event) {
    event.preventDefault();
    const clientId = requireTimerValue(fields.client, "client select").value;
    const task = getTask(requireTimerValue(fields.task, "task select").value);
    const client = getClient(clientId);
    const project = getProject(clientId, requireTimerValue(fields.project, "project select").value);

    if (!project) {
      setStatus("Select a project.", { isError: true });
      return;
    }

    requireTimerValue(fields.save, "save button").disabled = true;
    setStatus("Starting timer...");

    try {
      const result = task
        ? await startTaskTimer(task)
        : await startManualTimer({ client, project });
      await notifyTimerStarted(result);
      dialogSettled = true;
      context?.hostContext?.complete?.({
        actionId: TIMER_ACTION_ID,
        recordId: task?.id || startedTimerId(result),
        sourceType: task ? "task" : "manual",
        timer: startedTimerRecord(result),
      });
      requireTimerValue(dialog, "dialog").close("complete");
      setStatus("");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Timer could not be started."), { isError: true });
    } finally {
      requireTimerValue(fields.save, "save button").disabled = false;
    }
  }

  /**
   * The identifier a started timer acknowledged, when the acknowledgment carries one.
   *
   * **The acknowledgment is not cast to a timer record.** `putJson` answers `unknown`, and what
   * comes back is a write receipt rather than a row this dialog renders; the one member read
   * here is the id the host is told about, and everything else travels on untouched.
   * @param {unknown} result
   * @returns {string}
   */
  function startedTimerId(result) {
    if (typeof result !== "object" || result === null || !Object.hasOwn(result, "timer")) {
      return "";
    }

    const timer = /** @type {Record<string, unknown>} */ (result).timer;
    if (typeof timer !== "object" || timer === null || !Object.hasOwn(timer, "active_timer_id")) {
      return "";
    }

    // Coerced rather than required to be text, because the expression this replaces passed the
    // member straight to the host whatever it was. A falsy id still answers "", as `|| ""` did.
    const id = /** @type {Record<string, unknown>} */ (timer).active_timer_id;
    return id ? String(id) : "";
  }

  /**
   * The timer the acknowledgment carried, passed on exactly as it arrived.
   * @param {unknown} result
   * @returns {unknown}
   */
  function startedTimerRecord(result) {
    if (typeof result !== "object" || result === null || !Object.hasOwn(result, "timer")) {
      return null;
    }

    return /** @type {Record<string, unknown>} */ (result).timer || null;
  }

  /** @param {TimerTaskOption} task @returns {Promise<unknown>} */
  function startTaskTimer(task) {
    const api = requireApi();
    const now = new Date().toISOString();

    return api.putJson(`/api/tasks/${encodeURIComponent(task.id)}/timer`, {
      active_task_timer_id: "",
      accumulated_elapsed_seconds: 0,
      billable: workspaceBillableValue(),
      description: requireTimerValue(fields.description, "description field").value.trim(),
      last_active_start_time: now,
      timer_status: "running",
    });
  }

  /**
   * @param {{ client: NormalizedClientOption | undefined, project: NormalizedProjectOption }} selection
   * @returns {Promise<unknown>}
   */
  function startManualTimer({ client, project }) {
    const api = requireApi();
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
      description: requireTimerValue(fields.description, "description field").value.trim(),
      last_active_start_time: new Date().toISOString(),
      project_id: project.id,
      project_name: project.name,
      timer_slot: timerSlot,
      timer_status: "running",
    });
  }

  /** @param {unknown} result @returns {Promise<void>} */
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
      requireTimerValue(fields.client, "client select").value = workspaceClient.id;
      populateProjectOptions();
    }
  }

  function updateBillableDefault() {
    const billable = requireTimerValue(fields.billable, "billable select");

    if (!workspaceUsesBillableFlag()) {
      billable.value = "no";
      return;
    }

    const clientId = requireTimerValue(fields.client, "client select").value;
    const client = getClient(clientId);
    const project = getProject(clientId, requireTimerValue(fields.project, "project select").value);
    const billableSource = project || client;
    billable.value = billableSource?.billable === "no" ? "no" : "yes";
  }

  /** @param {string} clientId @returns {NormalizedClientOption | undefined} */
  function getClient(clientId) {
    return clients.find((client) => client.id === clientId);
  }

  /** @param {string} clientId @param {string} projectId @returns {NormalizedProjectOption | null} */
  function getProject(clientId, projectId) {
    return getClient(clientId)?.projects.find((project) => project.id === projectId) || null;
  }

  /** @param {string} taskId @returns {TimerTaskOption | null} */
  function getTask(taskId) {
    return taskOptions.find((task) => task.id === taskId) || null;
  }

  /** @param {TimerTaskOption} task @returns {string} */
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

  /** @param {unknown} data @returns {TimerTaskOption[]} */
  function normalizeTaskOptions(data) {
    return taskOptionRows(data)
      .filter((task) => {
        const status = readText(task, "status");
        return readText(task, "id", "task_id") && status !== "complete" && status !== "archived";
      })
      .map((task) => ({
        client_id: readText(task, "client_id"),
        id: readText(task, "id", "task_id"),
        label: readText(task, "label", "title") || "Untitled Task",
        optionLabel: readText(task, "optionLabel", "displayName", "label") || "Untitled Task",
        project_id: readText(task, "project_id"),
        status: readText(task, "status") || "open",
      }));
  }

  // Every page that loads this controller also loads `js/shared/client-project-options.js`,
  // so this reads a dependency the page guarantees rather than probing for one.
  function requireClientProjectOptions() {
    const clientProjectOptions = namespace?.clientProjectOptions;

    if (!clientProjectOptions) {
      throw new Error("The timer dialog requires the client and project option helper.");
    }

    return clientProjectOptions;
  }

  /** @param {NormalizedClientOption} client @returns {string} */
  function clientOptionLabel(client) {
    return requireClientProjectOptions().optionLabel(client);
  }

  /** @param {NormalizedProjectOption} project @returns {string} */
  function projectOptionLabel(project) {
    return requireClientProjectOptions().optionLabel(project);
  }

  function workspaceShowsClientTools() {
    const tools = namespace.workspaceContext?.workspaceCapabilities?.availableTools || [];
    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  function workspaceUsesBillableFlag() {
    return namespace.workspaceContext?.workspaceType === "business";
  }

  function workspaceBillableValue() {
    return workspaceUsesBillableFlag()
      && requireTimerValue(fields.billable, "billable select").value === "yes" ? "yes" : "no";
  }

  /** @param {string} value @param {string} text @returns {HTMLOptionElement} */
  function createOption(value, text) {
    return requirePageController().createOption(value, text);
  }

  /** @param {string} message @param {{ isError?: boolean }} [options] @returns {void} */
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
