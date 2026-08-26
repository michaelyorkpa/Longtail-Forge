(function () {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script
  // leaks into the shared type environment the way a top-level `const` leaks into the
  // shared lexical one, which is the thing `0.33.33.33` removed from this estate.
  /** @typedef {import("../../../src/types/browser-contracts.js").ModuleActionDependency} ModuleActionDependency */

  const namespace = window.LongtailForge || {};
  const registeredActions = new Map();
  /** @type {Map<string, Promise<void>>} */
  const dependencyScriptLoads = new Map();

  /**
   * Scripts a host page must load before the named action can be opened, in the order
   * they must run.
   *
   * `0.33.33.34` moved this out of `public/js/workbench.js`, where it was a private
   * constant read at one site. It is framework machinery: which script publishes which
   * opener is a property of the registry, not of the one surface that happened to
   * declare it first.
   *
   * Entries with `module: true` are loaded through dynamic `import()` rather than a
   * classic `<script>` element, because those adapters would otherwise collide in the
   * shared lexical environment.
   * @type {Readonly<Record<string, readonly ModuleActionDependency[]>>}
   */
  const MODULE_ACTION_DEPENDENCIES = Object.freeze({
    "notes.view": [
      { src: "js/shared/notification-subscriptions.js", surface: "notificationSubscriptions" },
      { src: "js/shared/notes-editor.js", surface: "notesEditor" },
      { member: "openNoteViewer", module: true, src: "js/notes.js", surface: "notesDialog" },
    ],
    "notes.edit": [
      { src: "js/shared/notification-subscriptions.js", surface: "notificationSubscriptions" },
      { src: "js/shared/notes-editor.js", surface: "notesEditor" },
      { member: "openNoteEditor", module: true, src: "js/notes.js", surface: "notesDialog" },
    ],
    "lists.edit": [
      { src: "js/shared/client-project-options.js", surface: "clientProjectOptions" },
      { member: "openListEditor", module: true, src: "js/lists.js", surface: "listsDialog" },
    ],
    "tasks.add": [
      { src: "js/shared/capture-prompt.js", surface: "capturePrompt" },
      { src: "js/task-resume-note-capture.js", surface: "taskResumeNoteCapture" },
      { member: "openTaskEditor", src: "js/task-dialog.js", surface: "tasksDialog" },
    ],
    "tasks.edit": [
      { src: "js/shared/capture-prompt.js", surface: "capturePrompt" },
      { src: "js/task-resume-note-capture.js", surface: "taskResumeNoteCapture" },
      { member: "openTaskEditor", src: "js/task-dialog.js", surface: "tasksDialog" },
    ],
    // Files publishes the whole editor and preview surface, but a host page must not
    // load the Files page controller to preview one attachment: it self-initializes
    // with its own fetches. The action-shaped opener therefore lives in the shared
    // preview helper, which is what this entry loads.
    "files.preview": [
      { member: "openFilePreviewAction", src: "js/shared/file-preview.js", surface: "filePreview" },
    ],
    "time-entries.add": [
      { src: "js/time-entry-dialog.js", surface: "timeEntryDialog" },
    ],
    "time-entries.edit": [
      { src: "js/time-entry-dialog.js", surface: "timeEntryDialog" },
    ],
    "clients.add": [
      { src: "js/clients-projects.js", surface: "clientProjectDialog" },
    ],
    "clients.edit": [
      { src: "js/clients-projects.js", surface: "clientProjectDialog" },
    ],
    "projects.add": [
      { src: "js/clients-projects.js", surface: "clientProjectDialog" },
    ],
    "projects.edit": [
      { src: "js/clients-projects.js", surface: "clientProjectDialog" },
    ],
  });

  const FIRST_PARTY_ACTIONS = [
    {
      id: "tasks.add",
      moduleId: "tasks",
      label: "Add Task",
      title: "Add Task",
      mode: "add",
      recordType: "task",
      requiredModules: ["tasks"],
      requiredPermissions: ["tasks.create"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      open: (params, hostContext) => namespace.tasksDialog.openTaskEditor({ ...params, mode: "add" }, hostContext),
    },
    {
      id: "tasks.edit",
      moduleId: "tasks",
      label: "Edit Task",
      title: "Edit Task",
      mode: "edit",
      recordType: "task",
      requiredModules: ["tasks"],
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      open: (params, hostContext) => namespace.tasksDialog.openTaskEditor({ ...params, mode: "edit" }, hostContext),
    },
    {
      id: "time-entries.add",
      moduleId: "time-tracking",
      label: "Add Time Entry",
      title: "Add Time Entry",
      mode: "add",
      recordType: "time_entry",
      requiredModules: ["time-tracking"],
      requiredPermissions: ["time_entries.create"],
      requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
      open: (params, hostContext) => namespace.timeEntryDialog.openAdd(params, hostContext),
    },
    {
      id: "time-tracking.timer.create",
      moduleId: "time-tracking",
      label: "Create Timer",
      title: "Create Timer",
      mode: "create",
      recordType: "active_timer",
      requiredModules: ["time-tracking"],
      requiredPermissions: ["time_entries.create"],
      requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
      open: (params, hostContext) => namespace.timeTrackingTimerDialog.openCreate(params, hostContext),
    },
    {
      id: "time-entries.edit",
      moduleId: "time-tracking",
      label: "Edit Time Entry",
      title: "Edit Time Entry",
      mode: "edit",
      recordType: "time_entry",
      requiredModules: ["time-tracking"],
      requiredPermissions: ["time_entries.edit_own", "time_entries.edit_all"],
      requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
      open: (params, hostContext) => namespace.timeEntryDialog.openEdit(params, hostContext),
    },
    {
      id: "notes.add",
      moduleId: "notes",
      label: "Add Note",
      title: "Add Note",
      mode: "add",
      recordType: "note",
      requiredModules: ["notes"],
      requiredPermissions: ["notes.create"],
      open: (params, hostContext) => namespace.notesDialog.openNoteEditor({ ...params, mode: "add" }, hostContext),
    },
    {
      id: "notes.edit",
      moduleId: "notes",
      label: "Edit Note",
      title: "Edit Note",
      mode: "edit",
      recordType: "note",
      requiredModules: ["notes"],
      requiredPermissions: ["notes.view"],
      open: (params, hostContext) => namespace.notesDialog.openNoteEditor({ ...params, mode: "edit" }, hostContext),
    },
    {
      id: "notes.view",
      moduleId: "notes",
      label: "View Note",
      title: "View Note",
      mode: "view",
      recordType: "note",
      requiredModules: ["notes"],
      requiredPermissions: ["notes.view"],
      open: (params, hostContext) => namespace.notesDialog.openNoteViewer(params, hostContext),
    },
    {
      id: "lists.add",
      moduleId: "lists",
      label: "Add List",
      title: "Add List",
      mode: "add",
      recordType: "list",
      requiredModules: ["lists"],
      requiredPermissions: ["lists.create"],
      open: (params, hostContext) => namespace.listsDialog.openListEditor({ ...params, mode: "add" }, hostContext),
    },
    {
      id: "lists.edit",
      moduleId: "lists",
      label: "Edit List",
      title: "Edit List",
      mode: "edit",
      recordType: "list",
      requiredModules: ["lists"],
      requiredPermissions: ["lists.view"],
      open: (params, hostContext) => namespace.listsDialog.openListEditor({ ...params, mode: "edit" }, hostContext),
    },
    {
      id: "projects.add",
      moduleId: "client-projects",
      label: "Add Project",
      title: "Add Project",
      mode: "add",
      recordType: "project",
      requiredModules: ["client-projects"],
      requiredPermissions: ["projects.manage"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      open: (params, hostContext) => namespace.clientProjectDialog.openAddProject(params, hostContext),
    },
    {
      id: "projects.edit",
      moduleId: "client-projects",
      label: "Edit Project",
      title: "Edit Project",
      mode: "edit",
      recordType: "project",
      requiredModules: ["client-projects"],
      requiredPermissions: ["projects.manage"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      open: (params, hostContext) => namespace.clientProjectDialog.openEditProject(params, hostContext),
    },
    {
      id: "clients.add",
      moduleId: "client-projects",
      label: "Add Client",
      title: "Add Client",
      mode: "add",
      recordType: "client",
      requiredModules: ["client-projects"],
      requiredPermissions: ["clients.manage"],
      requiredWorkspaceCapabilities: ["clients_projects"],
      open: (params, hostContext) => namespace.clientProjectDialog.openAddClient(params, hostContext),
      workspaceTypes: ["business"],
    },
    {
      id: "clients.edit",
      moduleId: "client-projects",
      label: "Edit Client",
      title: "Edit Client",
      mode: "edit",
      recordType: "client",
      requiredModules: ["client-projects"],
      requiredPermissions: ["clients.manage"],
      requiredWorkspaceCapabilities: ["clients_projects"],
      open: (params, hostContext) => namespace.clientProjectDialog.openEditClient(params, hostContext),
      workspaceTypes: ["business"],
    },
    {
      id: "files.edit",
      moduleId: "framework",
      label: "Edit File Context",
      title: "Edit File Context",
      mode: "edit",
      recordType: "file_attachment",
      requiredPermissions: ["files.view"],
      open: (params, hostContext) => namespace.filesDialog.openFileEditorAction(params, hostContext),
    },
    {
      id: "files.preview",
      moduleId: "framework",
      label: "Preview File",
      title: "Preview File",
      mode: "preview",
      recordType: "file_attachment",
      requiredPermissions: ["files.view"],
      open: (params, hostContext) => namespace.filePreview.openFilePreviewAction(params, hostContext),
    },
  ];

  function register(action) {
    const actionId = action?.actionId || action?.id || "";
    const hasDialogOpener = typeof action?.open === "function";

    if (!actionId || !hasDialogOpener) {
      return null;
    }

    const normalized = {
      actionId,
      id: actionId,
      moduleId: "",
      recordType: "",
      mode: "",
      label: actionId,
      title: action.label || actionId,
      requiredModules: [],
      requiredPermissions: [],
      requiredWorkspaceCapabilities: [],
      workspaceTypes: [],
      ...action,
      actionId,
      id: actionId,
    };
    registeredActions.set(normalized.actionId, normalized);
    return normalized;
  }

  function list(options = {}) {
    return [...registeredActions.values()]
      .filter((action) => options.includeUnavailable || isActionAvailable(action))
      .map((action) => ({
        actionId: action.actionId,
        id: action.actionId,
        label: action.label,
        mode: action.mode,
        moduleId: action.moduleId,
        recordType: action.recordType,
        requiredModules: [...action.requiredModules],
        requiredPermissions: [...action.requiredPermissions],
        requiredWorkspaceCapabilities: [...action.requiredWorkspaceCapabilities],
        title: action.title,
      }));
  }

  async function open(actionId, params = {}, options = {}) {
    const action = registeredActions.get(actionId);

    if (!action) {
      throw new Error(`Module action '${actionId}' is not registered.`);
    }

    if (!isActionAvailable(action)) {
      throw new Error(`Module action '${actionId}' is not available in this workspace.`);
    }

    const hostContext = createHostContext(action, params, options);
    if (typeof action.canOpen === "function" && !await action.canOpen(params, hostContext)) {
      throw new Error(`Module action '${actionId}' cannot be opened in the current context.`);
    }

    if (typeof action.open === "function") {
      return openRegisteredDialog(action, params, hostContext);
    }

    throw new Error(`Module action '${actionId}' does not provide a dialog opener.`);
  }

  async function openRegisteredDialog(action, params, hostContext) {
    try {
      const returnedResult = await action.open(params, hostContext);

      if (returnedResult && typeof returnedResult === "object" && !Object.hasOwn(returnedResult, "completed")) {
        hostContext.complete(returnedResult);
      }
    } catch (error) {
      hostContext.setStatus(error.message || "Module action could not be opened.", { isError: true });
      throw error;
    }

    return hostContext.result;
  }

  function createHostContext(action, params, options) {
    const trigger = document.activeElement;
    let settle = () => {};
    const result = new Promise((resolve) => {
      settle = resolve;
    });
    let settled = false;

    function finish(completed, detail = {}) {
      if (settled) {
        return;
      }

      settled = true;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
      if (completed && typeof options.onComplete === "function") {
        options.onComplete(detail);
      }
      if (!completed && typeof options.onCancel === "function") {
        options.onCancel(detail);
      }
      settle({
        actionId: action.actionId,
        completed,
        detail,
      });
    }

    return {
      action: toPublicAction(action),
      cancel: (detail = {}) => finish(false, detail),
      complete: (detail = {}) => finish(true, detail),
      params: { ...params },
      refresh: options.refresh || null,
      result,
      setStatus: (message, statusOptions = {}) => {
        if (typeof options.setStatus === "function") {
          options.setStatus(message, statusOptions);
        } else if (options.statusElement && namespace.pageController?.setStatus) {
          namespace.pageController.setStatus(options.statusElement, message, statusOptions);
        }
      },
      trigger,
    };
  }

  function isActionAvailable(action) {
    return isModuleAvailable(action.moduleId) &&
      (action.requiredModules || []).every((moduleId) => isModuleAvailable(moduleId)) &&
      hasRequiredWorkspaceCapabilities(action.requiredWorkspaceCapabilities) &&
      isWorkspaceTypeAvailable(action.workspaceTypes);
  }

  function isModuleAvailable(moduleId) {
    if (!moduleId || moduleId === "framework") {
      return true;
    }

    const context = namespace.workspaceContext || {};
    const enabledModules = Array.isArray(context.enabledModules) ? context.enabledModules : [];

    if (enabledModules.length === 0) {
      return true;
    }

    return enabledModules.includes(moduleId);
  }

  function isWorkspaceTypeAvailable(workspaceTypes = []) {
    if (!Array.isArray(workspaceTypes) || workspaceTypes.length === 0) {
      return true;
    }

    const workspaceType = namespace.workspaceContext?.workspaceType || document.body.dataset.workspaceType || "business";
    return workspaceTypes.includes(workspaceType);
  }

  function hasRequiredWorkspaceCapabilities(requiredCapabilities = []) {
    if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0) {
      return true;
    }

    const capabilities = namespace.workspaceContext?.workspaceCapabilities?.availableTools || [];
    return requiredCapabilities.some((capability) => capabilities.includes(capability));
  }

  function toPublicAction(action) {
    return {
      actionId: action.actionId,
      id: action.actionId,
      label: action.label,
      mode: action.mode,
      moduleId: action.moduleId,
      recordType: action.recordType,
      requiredModules: [...action.requiredModules],
      requiredPermissions: [...action.requiredPermissions],
      requiredWorkspaceCapabilities: [...action.requiredWorkspaceCapabilities],
      title: action.title,
    };
  }

  /**
   * The namespace is late-bound: every entry in the dependency table names a member
   * some other script publishes after this one has run. Reading it through an explicit
   * unknown-typed lookup is what keeps the table data rather than a closure.
   * @param {unknown} host
   * @param {string} key
   * @returns {unknown}
   */
  function publishedMember(host, key) {
    if (!host || (typeof host !== "object" && typeof host !== "function")) {
      return undefined;
    }

    return /** @type {Record<string, unknown>} */ (host)[key];
  }

  /**
   * @param {ModuleActionDependency} dependency
   * @returns {boolean}
   */
  function dependencyIsSatisfied(dependency) {
    const surface = publishedMember(namespace, dependency.surface);

    return Boolean(dependency.member ? publishedMember(surface, dependency.member) : surface);
  }

  /**
   * @param {ModuleActionDependency} dependency
   * @returns {Promise<void>}
   */
  function loadDependency(dependency) {
    if (dependencyIsSatisfied(dependency)) {
      return Promise.resolve();
    }

    const versionedSrc = window.LongtailForge?.assetVersion?.url(dependency.src) || dependency.src;
    const key = new window.URL(versionedSrc, document.baseURI).href;
    const inFlight = dependencyScriptLoads.get(key);
    if (inFlight) {
      return inFlight;
    }

    const loaded = dependency.module
      ? import(key).then(() => undefined)
      : appendClassicScript(dependency, versionedSrc);

    const checkedPromise = loaded.then(() => {
      if (!dependencyIsSatisfied(dependency)) {
        throw new Error(`Loaded ${dependency.src}, but the expected helper is unavailable.`);
      }
    });

    dependencyScriptLoads.set(key, checkedPromise);
    return checkedPromise;
  }

  /**
   * @param {ModuleActionDependency} dependency
   * @param {string} versionedSrc
   * @returns {Promise<void>}
   */
  function appendClassicScript(dependency, versionedSrc) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = versionedSrc;
      script.async = false;
      script.addEventListener("load", () => resolve());
      script.addEventListener("error", () => reject(new Error(`Could not load ${dependency.src}.`)));
      document.body.appendChild(script);
    });
  }

  /**
   * @param {string} actionId
   * @returns {ModuleActionDependency[]}
   */
  function dependenciesFor(actionId) {
    return [...(MODULE_ACTION_DEPENDENCIES[actionId] || [])];
  }

  /**
   * @param {string} actionId
   * @returns {Promise<void>}
   */
  async function ensureDependencies(actionId) {
    for (const dependency of dependenciesFor(actionId)) {
      await loadDependency(dependency);
    }
  }

  FIRST_PARTY_ACTIONS.forEach(register);

  namespace.moduleActions = {
    dependenciesFor,
    ensureDependencies,
    list,
    open,
    register,
  };
  window.LongtailForge = namespace;
}());
