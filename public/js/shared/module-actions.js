(function () {
  const namespace = window.LongtailForge || {};
  const registeredActions = new Map();

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
      open: (params, hostContext) => namespace.tasksDialog.openAdd(params, hostContext),
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
      open: (params, hostContext) => namespace.tasksDialog.openEdit(params, hostContext),
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
    };
  }

  function isActionAvailable(action) {
    return isModuleAvailable(action.moduleId) &&
      (action.requiredModules || []).every((moduleId) => isModuleAvailable(moduleId)) &&
      hasRequiredWorkspaceCapabilities(action.requiredWorkspaceCapabilities) &&
      isWorkspaceTypeAvailable(action.workspaceTypes);
  }

  function isModuleAvailable(moduleId) {
    if (!moduleId) {
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

  FIRST_PARTY_ACTIONS.forEach(register);

  namespace.moduleActions = {
    list,
    open,
    register,
  };
  window.LongtailForge = namespace;
}());
