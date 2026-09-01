(function attachListsPage() {

  const LIST_TYPE_LABELS = {
    bill_of_materials: "Bill of Materials",
    checklist: "Checklist",
    packing: "Packing",
    parts: "Parts",
    procurement: "Procurement",
    shopping: "Shopping",
    supplies: "Supplies",
  };
  const STATUS_LABELS = {
    active: "Active",
    archived: "Archived",
    completed: "Completed",
    deleted: "Deleted",
    finalized: "Finalized",
  };
  const PURCHASE_STATUS_LABELS = {
    cancelled: "Cancelled",
    needed: "Needed",
    not_needed: "Not Needed",
    ordered: "Ordered",
    planned: "Planned",
    received: "Received",
  };
  const LIST_LINK_TYPE_LABELS = {
    client: "Client",
    note: "Note",
    project: "Project",
    task: "Task",
  };
  const LIST_LINK_TARGET_ORDER = ["task", "note", "project", "client"];

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this controller cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it.
   * @returns {BrowserViewFactory}
   */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewDescriptorRenderers} BrowserViewDescriptorRenderers */
  
  /**
   * Whether this page received `view-renderer.js` as well as `view-builder.js`.
   *
   * Ten of the eighteen builder pages do not load the renderer, so its members are
   * genuinely partial on the shared factory type. This predicate checks the ones
   * Lists uses, so the narrowing is earned rather than asserted.
   * @param {BrowserViewFactory} factory
   * @returns {factory is BrowserViewFactory & BrowserViewDescriptorRenderers}
   */
  function hasDescriptorRenderers(factory) {
    return typeof factory.registerBehavior === "function"
      && typeof factory.renderDescriptorActionMenu === "function"
      && typeof factory.renderDescriptorDataTable === "function"
      && typeof factory.renderDescriptorFieldGrid === "function"
      && typeof factory.renderDescriptorInlineActions === "function"
      && typeof factory.renderDescriptorModalForm === "function"
      && typeof factory.renderSurface === "function";
  }
  
  /** @returns {BrowserViewFactory & BrowserViewDescriptorRenderers} */
  function requireDescriptorRenderers() {
    const factory = requireView();
    if (!hasDescriptorRenderers(factory)) {
      throw new Error("Lists requires the LongtailForge.view descriptor renderers.");
    }
    return factory;
  }

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
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Lists requires LongtailForge.api.");
    }
    return apiClient;
  }
  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Lists requires LongtailForge.view.");
    }
    return factory;
  }
  let activeListsViewDescriptor = null;
  const listsWorkspaceHost = document.querySelector("[data-lists-host]");
  const isListsWorkspaceSurface = Boolean(listsWorkspaceHost);

  let state = {
    /** @type {import("../../src/types/browser-contracts.js").NormalizedClientOption[]} */
    clients: [],
    currentUserId: "",
    dialogDataReady: null,
    editingListId: "",
    editorList: null,
    editorStagedTargets: [],
    itemDialogList: null,
    itemSuggestions: new Map(),
    linkTargetSearchTimer: null,
    linkTargets: [],
    listDialogHostContext: null,
    listDialogHostContextSettled: false,
    lists: [],
    selectedListId: new URLSearchParams(window.location.search).get("list") || "",
    users: [],
    workspaceType: "business",
  };

  // 0.33.33.35.1.1: the workspace surface is built from a server-delivered descriptor, so
  // the shell and every binding that reads the DOM it creates wait for the workspace
  // context. Before this, the shell was built synchronously against a context hydrated
  // from localStorage, which is empty on a cold load - the case the fallback covers.
  //
  // The dialog-only path reads no descriptor - buildListsViewShell() returns early without a
  // host - so it keeps its synchronous bootstrap. That is the path the registry uses when
  // it lazily imports this controller for a module action, and it must stay immediate.
  if (isListsWorkspaceSurface) {
    initializeListsWorkspace();
  } else {
    ensureListsDialogShell();
    cacheListsElements();
    bindListsEvents();
  }

  async function initializeListsWorkspace() {
    try {
      await window.LongtailForge?.workspaceContextReady;
    } catch {
      // A rejected context must not strand the page; the descriptor fallback still renders,
      // and initialize() below reports the failure through the surface it just built.
    }
    buildListsViewShell();
    cacheListsElements();
    bindListsEvents();
    await initialize();
  }

  /** @type {Element | null} */
  let pageTitle = null;
  /** @type {Element | null} */
  let createButton = null;
  /** @type {Element | null} */
  let statusMessage = null;
  /** @type {Element | null} */
  let filtersForm = null;
  /** @type {Element | null} */
  let statusFilter = null;
  /** @type {Element | null} */
  let typeFilter = null;
  /** @type {Element | null} */
  let reusableFilter = null;
  /** @type {Element | null} */
  let clientFilter = null;
  /** @type {Element | null} */
  let projectFilter = null;
  /** @type {Element | null} */
  let assigneeFilter = null;
  /** @type {Element | null} */
  let neededFilter = null;
  /** @type {Element | null} */
  let archiveFilter = null;
  /** @type {Element | null} */
  let sortSelect = null;
  /** @type {Element | null} */
  let indexPanel = null;
  /** @type {Element | null} */
  let countLabel = null;
  /** @type {Element | null} */
  let listMount = null;
  /** @type {Element | null} */
  let detailPanel = null;
  /** @type {Element | null} */
  let listDialog = null;
  /** @type {Element | null} */
  let listForm = null;
  /** @type {Element | null} */
  let listDialogTitle = null;
  /** @type {Element | null} */
  let listDialogClose = null;
  /** @type {Element | null} */
  let listTitleInput = null;
  /** @type {Element | null} */
  let listTypeInput = null;
  /** @type {Element | null} */
  let listClientInput = null;
  /** @type {Element | null} */
  let listProjectInput = null;
  /** @type {Element | null} */
  let listDescriptionInput = null;
  /** @type {Element | null} */
  let listLinkPicker = null;
  /** @type {Element | null} */
  let listLinkTargetTypeInput = null;
  /** @type {Element | null} */
  let listLinkSearchInput = null;
  /** @type {Element | null} */
  let listLinkResultsInput = null;
  /** @type {Element | null} */
  let listLinkApplyButton = null;
  /** @type {Element | null} */
  let listFormStatus = null;
  /** @type {Element | null} */
  let listCancelButton = null;
  /** @type {Element | null} */
  let listSaveButton = null;
  /** @type {Element | null} */
  let itemDialog = null;
  /** @type {Element | null} */
  let itemDialogForm = null;
  /** @type {Element | null} */
  let itemDialogTitle = null;
  /** @type {Element | null} */
  let itemDialogClose = null;
  /** @type {Element | null} */
  let itemDialogCancel = null;
  /** @type {Element | null} */
  let itemDialogSave = null;
  /** @type {Element | null} */
  let itemDialogFormStatus = null;

  function cacheListsElements() {
    pageTitle = document.querySelector("[data-lists-title]");
    createButton = document.querySelector("[data-list-create]");
    statusMessage = document.querySelector("[data-lists-status]");
    filtersForm = document.querySelector("[data-lists-filters]");
    statusFilter = document.querySelector("[data-list-filter-status]");
    typeFilter = document.querySelector("[data-list-filter-type]");
    reusableFilter = document.querySelector("[data-list-filter-reusable]");
    clientFilter = document.querySelector("[data-list-filter-client]");
    projectFilter = document.querySelector("[data-list-filter-project]");
    assigneeFilter = document.querySelector("[data-list-filter-assignee]");
    neededFilter = document.querySelector("[data-list-filter-needed]");
    archiveFilter = document.querySelector("[data-list-filter-archive]");
    sortSelect = document.querySelector("[data-list-sort]");
    indexPanel = document.querySelector("[data-lists-index-panel]");
    countLabel = document.querySelector("[data-lists-count]");
    listMount = document.querySelector("[data-lists-list]");
    detailPanel = document.querySelector("[data-list-detail]");
    listDialog = document.querySelector("[data-list-dialog]");
    listForm = document.querySelector("[data-list-form]");
    listDialogTitle = document.querySelector("[data-list-dialog-title]");
    listDialogClose = document.querySelector("[data-list-dialog-close]");
    listTitleInput = document.querySelector("[data-list-title]");
    listTypeInput = document.querySelector("[data-list-type]");
    listClientInput = document.querySelector("[data-list-client]");
    listProjectInput = document.querySelector("[data-list-project]");
    listDescriptionInput = document.querySelector("[data-list-description]");
    listLinkPicker = document.querySelector("[data-list-link-picker]");
    listLinkTargetTypeInput = document.querySelector("[data-list-link-target-type]");
    listLinkSearchInput = document.querySelector("[data-list-link-search]");
    listLinkResultsInput = document.querySelector("[data-list-link-results]");
    listLinkApplyButton = document.querySelector("[data-list-link-apply]");
    listFormStatus = document.querySelector("[data-list-form-status]");
    listCancelButton = document.querySelector("[data-list-cancel]");
    listSaveButton = document.querySelector("[data-list-save]");
    itemDialog = document.querySelector("[data-list-item-dialog]");
    itemDialogForm = document.querySelector("[data-list-item-form]");
    itemDialogTitle = document.querySelector("[data-list-item-dialog-title]");
    itemDialogClose = document.querySelector("[data-list-item-dialog-close]");
    itemDialogCancel = document.querySelector("[data-list-item-cancel]");
    itemDialogSave = document.querySelector("[data-list-item-save]");
    itemDialogFormStatus = document.querySelector("[data-list-item-form-status]");
  }

  function bindListsEvents() {
    if (!createButton?.dataset.surfaceAction) {
      createButton?.addEventListener("click", () => openListDialog());
    }
    filtersForm?.addEventListener("change", () => refreshLists());
    sortSelect?.addEventListener("change", () => refreshLists());
    listForm?.addEventListener("submit", saveList);
    listDialogClose?.addEventListener("click", cancelListDialog);
    listCancelButton?.addEventListener("click", cancelListDialog);
    listDialog?.addEventListener("close", handleListDialogClose);
    itemDialogForm?.addEventListener("submit", saveItem);
    itemDialogClose?.addEventListener("click", closeItemDialog);
    itemDialogCancel?.addEventListener("click", closeItemDialog);
    const listClientControl = listClientInput;
    const listTypeControl = listTypeInput;
    listClientControl?.addEventListener("change", () => populateProjectOptions(listProjectInput, listClientControl.value));
    listProjectInput?.addEventListener("change", syncClientFromProject);
    listTypeControl?.addEventListener("change", () => setContextControlsVisible(shouldShowContextControls(listTypeControl.value)));
    detailPanel?.addEventListener("click", handleDetailClick);
    detailPanel?.addEventListener("submit", handleDetailSubmit);
  }

  const listsDialogApi = Object.freeze({
    openAdd: (params = {}, hostContext = null) => openListEditor({ ...params, mode: "add" }, hostContext),
    openEdit: (params = {}, hostContext = null) => openListEditor({ ...params, mode: "edit" }, hostContext),
    openListEditor,
  });

  // A plain publication, for the reason `public/js/notes.js` records: one writer, two
  // delivery paths, and a readiness probe on `listsDialog.openListEditor` that stops the
  // second one. `0.33.33.38.2.4.4` removed the spread of the previous value.
  window.LongtailForge.listsDialog = Object.freeze({
    ...listsDialogApi,
  });

  window.LongtailForge.moduleActions?.register?.({
    actionId: "lists.add",
    id: "lists.add",
    label: "Add List",
    mode: "add",
    moduleId: "lists",
    open: (params, hostContext) => openListEditor({ ...params, mode: "add" }, hostContext),
    recordType: "list",
    requiredModules: ["lists"],
    requiredPermissions: ["lists.create"],
    title: "Add List",
  });
  window.LongtailForge.moduleActions?.register?.({
    actionId: "lists.edit",
    id: "lists.edit",
    label: "Edit List",
    mode: "edit",
    moduleId: "lists",
    open: (params, hostContext) => openListEditor({ ...params, mode: "edit" }, hostContext),
    recordType: "list",
    requiredModules: ["lists"],
    requiredPermissions: ["lists.view"],
    title: "Edit List",
  });


  function buildListsViewShell() {
    const host = document.querySelector("[data-lists-host]");
    if (!host || host.querySelector("[data-lists-title]")) {
      return;
    }
    activeListsViewDescriptor = listsViewSurfaceDescriptor();
    if (activeListsViewDescriptor) {
      registerListsViewBehaviors();
      // The renderer auto-renders descriptor.modals into the surface; Lists builds and owns its own
      // dialog (createListDialogShell), so suppress the framework duplicate modal shells.
      const renderDescriptor = {
        ...activeListsViewDescriptor,
        dataSource: null,
        modals: [],
      };
      const surface = requireDescriptorRenderers().renderSurface(renderDescriptor, host);
      decorateListsDeclarativeSurface(surface, renderDescriptor);
    }

    // Lists owns its dialogs whether or not the server delivered a workspace surface, so a
    // module action can still open the editor on a page whose surface was not delivered.
    document.body.appendChild(createListDialogShell());
    document.body.appendChild(createItemDialogShell());
  }

  function ensureListsDialogShell() {
    if (!document.querySelector("[data-list-dialog]")) {
      document.body.appendChild(createListDialogShell());
    }
  }

  function registerListsViewBehaviors() {
    const view = requireView();
    if (typeof view.registerBehavior !== "function") {
      return;
    }
    const behaviorActions = {
      "lists.create": "create-list",
      "lists.workflow.duplicate": "duplicate-list",
      "lists.workflow.edit": "edit-list",
      "lists.workflow.complete": "complete-list",
      "lists.workflow.finalize": "finalize-list",
      "lists.workflow.reopen": "reopen-list",
      "lists.workflow.mark-reusable": "mark-reusable-list",
      "lists.workflow.unmark-reusable": "unmark-reusable-list",
      "lists.workflow.archive": "archive-list",
      "lists.workflow.delete": "delete-list",
      "lists.workflow.restore": "restore-list",
      "lists.link.add": "add-link",
      "lists.link.remove": "remove-link",
      "lists.item.save": "save-item",
      "lists.item.edit": "edit-item",
      "lists.item.move-up": "move-item-up",
      "lists.item.move-down": "move-item-down",
      "lists.item.delete": "delete-item",
    };

    Object.entries(behaviorActions).forEach(([behaviorId, action]) => {
      requireDescriptorRenderers().registerBehavior(behaviorId, ({ record }) => runRegisteredListBehavior(action, record));
    });
  }

  async function runRegisteredListBehavior(action, record) {
    if (action === "create-list") {
      openListDialog();
      return;
    }
    const list = resolveListRecord(record);
    if (!list) {
      return;
    }
    if (action === "edit-list") {
      openListDialog(list);
      return;
    }
    const selectedId = await runAction(action, list);
    await refreshLists(selectedId || list.list_id || state.selectedListId);
  }

  async function openListEditor(params = {}, hostContext = null) {
    await prepareListDialogData();

    const mode = normalizeListEditorMode(params);
    const listId = readListEditorId(params);
    let list = params.list || params.record || params.listRecord || null;

    if (mode === "edit") {
      if (!list && listId) {
        list = await loadListDetail(listId);
      }
      if (!list?.list_id) {
        throw new Error("List ID is required.");
      }
    }

    const result = openListDialog(mode === "add" ? null : list, {
      defaults: normalizeListEditorDefaults(params),
      hostContext,
      trigger: params.returnFocusTo || params.trigger || hostContext?.trigger || null,
    });
    return hostContext?.result || result;
  }

  async function prepareListDialogData() {
    if (!state.dialogDataReady) {
      state.dialogDataReady = (async () => {
        await window.LongtailForge.workspaceContextReady;
        applyWorkspaceContext();
        await loadOptions();
      })().catch((error) => {
        state.dialogDataReady = null;
        throw error;
      });
    }

    return state.dialogDataReady;
  }

  function normalizeListEditorMode(params = {}) {
    const mode = String(params.mode || params.actionMode || "").toLowerCase();
    return mode === "edit" ? "edit" : "add";
  }

  function readListEditorId(params = {}) {
    return params.listId || params.list_id || params.recordId || params.id || "";
  }

  function normalizeListEditorDefaults(params = {}) {
    const context = params.context || {};
    return {
      client_id: params.client_id || params.clientId || context.clientId || "",
      description: params.description || "",
      list_type: params.list_type || params.listType || "",
      project_id: params.project_id || params.projectId || context.projectId || "",
      title: params.title || "",
    };
  }

  function resolveListRecord(record) {
    const listId = record?.list_id || record?.id || record?._source?.list_id || record?._source?.id || state.selectedListId;
    return state.lists.find((entry) => entry.list_id === listId) || selectedList();
  }

  // 0.33.33.35.1.2: null means the server did not deliver this surface, which is the whole
  // contract now - there is no local descriptor to fall back to. 0.33.33.35.1.1 made this
  // readable by moving the shell build behind the workspace context, so an absent surface is
  // an answer rather than a not-yet.
  function listsViewSurfaceDescriptor() {
    const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
    return surfaces.find((surface) => surface.id === "lists.workspace" && surface.moduleId === "lists") || null;
  }

  function listsWorkflowActionStripDescriptor() {
    return {
      label: "List actions",
      actions: [
        { id: "duplicate-list", label: "Duplicate", role: "secondary", behavior: "lists.workflow.duplicate" },
        { id: "edit-list", label: "Edit", role: "secondary", behavior: "lists.workflow.edit" },
        { id: "complete-list", label: "Complete", role: "secondary", behavior: "lists.workflow.complete" },
        { id: "finalize-list", label: "Finalize", role: "secondary", behavior: "lists.workflow.finalize" },
        { id: "reopen-list", label: "Reopen", role: "secondary", behavior: "lists.workflow.reopen" },
        { id: "mark-reusable-list", label: "Mark Reusable", role: "secondary", behavior: "lists.workflow.mark-reusable" },
        { id: "unmark-reusable-list", label: "Unmark Reusable", role: "secondary", behavior: "lists.workflow.unmark-reusable" },
        { id: "archive-list", label: "Archive", role: "secondary", behavior: "lists.workflow.archive" },
        { id: "delete-list", label: "Delete", role: "destructive", behavior: "lists.workflow.delete" },
        { id: "restore-list", label: "Restore", role: "secondary", behavior: "lists.workflow.restore" },
      ],
    };
  }

  function listsItemFormDescriptor() {
    return {
      title: "Items",
      fields: [
        { field: "item_name", type: "text", label: "Item", required: true, autocomplete: "off", behavior: "lists.catalog-suggestions", width: "full" },
        { field: "catalog_item_id", type: "hidden", label: "Catalog Item" },
        { field: "quantity", type: "number", label: "Qty", default: "1", min: "0", step: "0.01", width: "narrow" },
        { field: "unit", type: "text", label: "Unit", width: "narrow" },
        { field: "needed_by_date", type: "date", label: "Needed by", width: "compact" },
        { field: "assigned_user_id", type: "select", label: "Assigned", optionsSource: "users", width: "compact" },
        { field: "purchase_status", type: "select", label: "Status", default: "needed", options: Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => [value, label]), width: "compact" },
        { field: "vendor_name", type: "text", label: "Vendor or Store", placement: "advanced", width: "wide" },
        { field: "url", type: "url", label: "URL", placement: "advanced", width: "wide" },
        { field: "estimated_cost", type: "number", label: "Estimated Cost", min: "0", step: "0.01", placement: "advanced", width: "compact" },
        { field: "actual_cost", type: "number", label: "Actual Cost", min: "0", step: "0.01", placement: "advanced", width: "compact" },
        { field: "tracking_id", type: "text", label: "Tracking ID", placement: "advanced", width: "wide" },
        { field: "notes", type: "textarea", label: "Notes", rows: "2", width: "full" },
        { field: "save_to_catalog", type: "checkbox", label: "Save as reusable item", default: "true", width: "full" },
      ],
      actions: [
        { id: "save-item", label: "Add Item", role: "primary", behavior: "lists.item.save" },
      ],
    };
  }

  function listsItemRowsDescriptor() {
    return {
      itemsField: "items",
      columns: [
        { id: "done", label: "Done", type: "checkbox" },
        { id: "item", field: "item_name", label: "Item" },
        { id: "quantity", field: "quantity", label: "Qty" },
        { id: "cost", field: "estimated_cost", label: "Cost" },
        { id: "needed", field: "needed_by_date", label: "Needed By" },
        { id: "status", field: "purchase_status", label: "Status" },
        { id: "actions", label: "Actions", type: "actions" },
      ],
      actions: [
        { id: "edit-item", label: "Edit", role: "secondary", behavior: "lists.item.edit" },
        { id: "move-item-up", label: "Up", role: "utility", behavior: "lists.item.move-up" },
        { id: "move-item-down", label: "Down", role: "utility", behavior: "lists.item.move-down" },
        { id: "delete-item", label: "Delete", role: "destructive", behavior: "lists.item.delete" },
      ],
      emptyState: {
        message: "No items yet.",
      },
    };
  }

  function listsModalDescriptor() {
    return {
      id: "list-editor",
      title: "List",
      size: "wide",
      fields: [
        { field: "title", type: "text", label: "Title", required: true, width: "full" },
        { field: "list_type", type: "select", label: "Type", options: Object.entries(LIST_TYPE_LABELS).map(([value, label]) => [value, label]), width: "compact" },
        { field: "client_id", type: "select", label: "Client", optionsSource: "clients", width: "wide" },
        { field: "project_id", type: "select", label: "Project", optionsSource: "projects", width: "wide" },
        { field: "description", type: "textarea", label: "Description", rows: "4", width: "full" },
      ],
      footerActions: [
        { id: "cancel-list", label: "Cancel", role: "secondary", behavior: "lists.modal.cancel" },
        { id: "save-list", label: "Save List", role: "primary", behavior: "lists.modal.save" },
      ],
    };
  }

  function decorateListsDeclarativeSurface(surface, descriptor = activeListsViewDescriptor) {
    const view = requireView();
    const pageHeading = surface.querySelector(".view-page-title");
    if (pageHeading) {
      pageHeading.dataset.listsTitle = "";
    }

    const createAction = surface.querySelector('[data-surface-action="lists.create"], [data-surface-action="create-list"]');
    if (createAction) {
      createAction.dataset.listCreate = "";
    }

    const header = surface.querySelector(".view-page-header");
    header?.classList.add("lists-page-header");
    const status = view.createStatusMessage({ className: "lists-status-message" });
    status.dataset.listsStatus = "";
    header?.after(status);

    const filterPanel = surface.querySelector('[data-view-sidebar-panel="lists-filters"]')
      || surface.querySelector(".view-filter-panel");
    filterPanel?.classList.add("lists-filters-panel");
    if (filterPanel) {
      filterPanel.dataset.listsFiltersPanel = "";
    }
    const filterForm = surface.querySelector("[data-view-filter-form]");
    filterForm?.classList.add("lists-filters");
    if (filterForm) {
      filterForm.dataset.listsFilters = "";
    }

    decorateFilterControl(surface, "status", "listFilterStatus");
    decorateFilterControl(surface, "listType", "listFilterType");
    decorateFilterControl(surface, "reusable", "listFilterReusable");
    decorateFilterControl(surface, "clientId", "listFilterClient", "listBusinessControl");
    decorateFilterControl(surface, "projectId", "listFilterProject", "listContextControl");
    decorateFilterControl(surface, "assigneeId", "listFilterAssignee");
    decorateFilterControl(surface, "neededByDate", "listFilterNeeded");
    decorateFilterControl(surface, "archiveState", "listFilterArchive");
    decorateFilterControl(surface, "sort", "listSort");

    const workspace = surface.querySelector(".view-slideout-sidebar")
      || surface.querySelector(".view-stacked");
    workspace?.classList.add("lists-workspace");

    const indexPanel = surface.querySelector('[data-view-sidebar-panel="lists-index"]')
      || surface.querySelector(".view-collapsible-index");
    indexPanel?.classList.add("lists-index-panel");
    if (indexPanel) {
      indexPanel.dataset.listsIndexPanel = "";
    }
    const summaryTitle = indexPanel?.querySelector(".view-collapsible-index-title");
    if (summaryTitle) {
      summaryTitle.dataset.listsCount = "";
      summaryTitle.textContent = listSelectorTitle(descriptor);
    }
    const indexBody = indexPanel?.querySelector(".view-collapsible-index-body");
    const mount = view.createElement("div", { className: "lists-index-content" });
    mount.dataset.listsIndexContent = "";
    mount.dataset.listsList = "";
    indexBody?.replaceChildren(mount);

    const detail = surface.querySelector(".view-slideout-sidebar-main")
      || surface.querySelector(".view-stacked-detail");
    detail?.classList.add("lists-detail-panel");
    if (detail) {
      detail.dataset.listDetail = "";
    }
    detail?.replaceChildren(view.createEmptyState({
      message: "Select a list.",
      className: "lists-empty-state",
      headingLevel: 2,
    }));
  }

  function decorateFilterControl(surface, fieldName, datasetName, wrapperDatasetName = "") {
    const wrapper = surface.querySelector(`[data-view-field="${fieldName}"]`);
    const control = wrapper?.querySelector(`[data-view-input="${fieldName}"]`);
    if (control) {
      control.dataset[datasetName] = "";
    }
    if (wrapperDatasetName && wrapper) {
      wrapper.dataset[wrapperDatasetName] = "";
    }
  }

  function createListDialogShell() {
    const view = requireView();
    const modal = listsEditorModalDescriptor();
    const editorFields = requireDescriptorRenderers().renderDescriptorFieldGrid({ fields: modal.fields || [] }, {
      surface: false,
      className: "lists-editor-fields",
    });
    editorFields.dataset.viewFieldWidth = "full";
    decorateListEditorField(editorFields, "title", "listTitle");
    decorateListEditorField(editorFields, "list_type", "listType");
    decorateListEditorField(editorFields, "client_id", "listClient", "listBusinessControl");
    decorateListEditorField(editorFields, "project_id", "listProject", "listContextControl");
    decorateListEditorField(editorFields, "description", "listDescription");

    const picker = view.createLinkedContextPicker({
      ariaLabel: "List linked records",
      emptyMessage: "No linked records yet.",
      linkedItems: [],
      onRemove: handleListEditorLinkedContextRemove,
      onSearchInput: queueListEditorLinkTargetSearch,
      onTargetChange: loadListEditorLinkTargets,
      onUseTarget: applyListEditorLinkTarget,
      providers: listLinkProviderOptions(),
      records: [],
      rowsLabel: "Linked records",
    });
    picker.dataset.listLinkPicker = "";
    picker.viewParts.targetSelect.dataset.listLinkTargetType = "";
    picker.viewParts.searchInput.dataset.listLinkSearch = "";
    picker.viewParts.recordSelect.dataset.listLinkResults = "";
    picker.viewParts.useTargetButton.dataset.listLinkApply = "";
    const linkedRecordsSection = view.createElement("div", {
      className: "lists-editor-linked-records",
      children: [
        view.createElement("h3", { className: "surface-modal-section-heading", text: "Linked Records" }),
        picker,
      ],
    });
    linkedRecordsSection.dataset.viewFieldWidth = "full";

    const formStatus = view.createStatusMessage({ className: "lists-form-status" });
    formStatus.dataset.listFormStatus = "";
    formStatus.dataset.viewFieldWidth = "full";

    const cancelAction = modal.footerActions?.find((action) => action.id === "cancel-list") || {};
    const saveAction = modal.footerActions?.find((action) => action.id === "save-list") || {};
    const cancel = view.createActionButton({ label: cancelAction.label || "Cancel", role: cancelAction.role || "secondary" });
    cancel.dataset.listCancel = "";
    const save = view.createActionButton({ label: saveAction.label || "Save List", type: "submit", role: saveAction.role || "primary" });
    save.dataset.listSave = "";

    const dialog = requireDescriptorRenderers().renderDescriptorModalForm(modal, {
      className: "lists-dialog",
      formClassName: "lists-form",
      fields: [editorFields, linkedRecordsSection, formStatus],
      actions: [cancel, save],
    });
    dialog.dataset.listDialog = "";
    dialog.viewParts.form.dataset.listForm = "";
    dialog.viewParts.title.dataset.listDialogTitle = "";

    const close = view.createActionButton({ label: "Close", className: "lists-dialog-close" });
    close.dataset.listDialogClose = "";
    const heading = view.createElement("div", {
      className: "surface-modal-heading",
      children: [
        dialog.viewParts.title,
        view.createElement("div", {
          className: "surface-modal-heading-actions",
          children: [close],
        }),
      ],
    });
    dialog.viewParts.form.insertBefore(heading, dialog.viewParts.body);
    return dialog;
  }

  function listsEditorModalDescriptor() {
    return listsViewSurfaceDescriptor()?.modals?.find((modal) => modal.id === "list-editor") || listsModalDescriptor();
  }

  function decorateListEditorField(grid, fieldName, dataName, wrapperDataName = "") {
    const wrapper = grid.querySelector(`[data-view-field="${fieldName}"]`);
    const control = wrapper?.querySelector(`[data-view-input="${fieldName}"]`);
    if (control) {
      control.dataset[dataName] = "";
    }
    if (wrapper && wrapperDataName) {
      wrapper.dataset[wrapperDataName] = "";
    }
  }

  async function initialize() {
    setStatus("Loading lists...");

    try {
      await window.LongtailForge.workspaceContextReady;
      applyWorkspaceContext();
      await Promise.all([loadOptions(), loadLists()]);
      populateFilters();
      renderLists();
      openListFromUrl();
      setStatus("");
    } catch (error) {
      renderListPlaceholder(error.message || "Lists could not be loaded.");
      renderDetailPrompt(error.message || "Lists could not be loaded.");
      setStatus(error.message || "Lists could not be loaded.", true);
    }
  }

  function applyWorkspaceContext() {
    const context = window.LongtailForge?.workspaceContext || {};
    const moduleDefinition = (context.modules || []).find((module) => module.id === "lists");
    const terminology = moduleDefinition?.terminology?.[context.workspaceType] || moduleDefinition?.terminology?.default || {};
    const label = terminology.label || moduleDefinition?.displayName || "Lists";

    state.workspaceType = context.workspaceType || "business";
    state.currentUserId = context.userId || context.user_id || "";
    if (pageTitle) {
      pageTitle.textContent = label;
    }
    if (createButton) {
      createButton.textContent = terminology.createButton || "Create List";
    }
    document.body.dataset.listsWorkspaceType = state.workspaceType;
    setBusinessControlsVisible(usesBusinessScope());
    setContextControlsVisible(usesBusinessScope());
  }

  // Every page that loads this controller also loads `js/shared/client-project-options.js`,
  // so this reads a dependency the page guarantees rather than probing for one.
  function requireClientProjectOptions() {
    const clientProjectOptions = window.LongtailForge?.clientProjectOptions;

    if (!clientProjectOptions) {
      throw new Error("Lists requires the client and project option helper.");
    }

    return clientProjectOptions;
  }

  async function loadOptions() {
    const [clientProjects, users] = await Promise.all([
      loadClientProjects(),
      loadUsers(),
    ]);

    state.clients = requireClientProjectOptions().normalizeClients(clientProjects);
    const usersPayload = /** @type {{ users?: unknown[] }} */ (users);
    state.users = usersPayload.users || [];
  }

  async function loadClientProjects() {
    const api = requireApi();
    try {
      return await api.getJson("/api/client-projects?view=options", { cache: "no-store" });
    } catch {
      return { clients: [], workspaceProjects: [] };
    }
  }

  async function loadUsers() {
    const api = requireApi();
    try {
      return await api.getJson("/api/users", { cache: "no-store" });
    } catch {
      return { users: [] };
    }
  }

  async function loadLists() {
    const api = requireApi();
    const result = await api.getJson(`/api/lists?${buildListQueryParams()}`, { cache: "no-store" });
    const summaries = result.lists || [];
    const details = await Promise.all(summaries.map((list) => loadListDetail(list.list_id || list.id, list)));
    state.lists = details.filter(Boolean);
  }

  async function loadListDetail(listId, fallback = null) {
    const api = requireApi();
    try {
      const result = await api.getJson(`/api/lists/${encodeURIComponent(listId)}?includeDeleted=true&includeDeletedItems=true`, {
        cache: "no-store",
      });
      return normalizeListRecord(result.list, result.items || [], result.links || []);
    } catch {
      return fallback ? normalizeListRecord(fallback, []) : null;
    }
  }

  function buildListQueryParams() {
    const params = new URLSearchParams();
    const statusValue = statusFilter?.value || "active";
    const typeValue = typeFilter?.value || "all";
    const reusableValue = reusableFilter?.value || "no";
    const archiveValue = archiveFilter?.value || "current";
    const clientValue = usesBusinessScope() ? clientFilter?.value || "all" : "all";
    const projectValue = projectFilter?.value || "all";
    const assigneeValue = assigneeFilter?.value || "all";
    const neededValue = neededFilter?.value || "";
    const sortValue = sortSelect?.value || "updated_desc";

    params.set("status", archiveValue === "archived" || archiveValue === "deleted" ? archiveValue : statusValue);
    params.set("archiveState", archiveValue);
    params.set("reusable", reusableValue);
    params.set("sort", sortValue);

    if (typeValue !== "all") {
      params.set("listType", typeValue);
    }
    if (clientValue !== "all") {
      params.set("clientId", clientValue);
    }
    if (projectValue !== "all") {
      params.set("projectId", projectValue);
    }
    if (assigneeValue !== "all") {
      params.set("assigneeId", assigneeValue);
    }
    if (neededValue) {
      params.set("neededByDate", neededValue);
    }
    if (archiveValue === "all" || archiveValue === "deleted" || statusValue === "all") {
      params.set("includeDeleted", "true");
    }

    return params;
  }

  function populateFilters() {
    replaceOptions(clientFilter, [
      option("all", "All clients"),
      option("", "Workspace"),
      ...state.clients.filter((client) => !client.isWorkspaceScope).map((client) => option(client.id, client.optionLabel || client.name)),
    ]);
    replaceOptions(projectFilter, [
      option("all", "All projects"),
      option("", "No project"),
      ...allProjects().map((project) => option(project.id, project.optionLabel || project.name)),
    ]);
    replaceOptions(assigneeFilter, [
      option("all", "All assignees"),
      option("me", "Me"),
      option("", "Unassigned"),
      ...state.users.map((user) => option(user.user_id, displayUser(user))),
    ]);
  }

  function renderLists() {
    const view = requireView();
    const lists = state.lists;
    if (countLabel) {
      countLabel.textContent = listSelectorTitle();
    }

    if (lists.length === 0) {
      state.selectedListId = "";
      renderListPlaceholder(emptyListMessage());
      if (!selectedList()) {
        renderDetailPrompt("Create a list or adjust filters to resume one.");
      }
      return;
    }

    listMount.replaceChildren(view.createIndexList({
      ariaLabel: "List index",
      items: lists.map(listIndexItem),
    }));

    if (state.selectedListId && lists.some((list) => list.list_id === state.selectedListId)) {
      renderDetail(selectedList());
      updateListSelectionState();
    } else {
      state.selectedListId = "";
      renderDetailPrompt("Select a list.");
      updateListSelectionState();
    }
  }

  function listIndexItem(list) {
    const view = requireView();
    const typeLabel = LIST_TYPE_LABELS[list.list_type] || list.list_type || "";
    const needed = nextNeededDate(list);
    const chips = [
      statusBadge(list.status),
      typeLabel,
      needed ? `Needed ${needed}` : "",
      itemSummary(list),
      ...listBadges(list),
    ];
    const stateSummary = view.createElement("span", {
      className: ["view-index-list-meta", "lists-state-summary"],
      text: compactStateSummary(list),
    });
    stateSummary.dataset.listStateSummary = "";

    const meta = [
      listContextLabel(list),
      listDescriptionExcerpt(list),
      linkedRecordSummary(list),
      listTimelineSummary(list),
      listCostSummary(list),
      stateSummary,
    ];

    return {
      id: list.list_id,
      label: list.title || "Untitled list",
      selected: list.list_id === state.selectedListId,
      onSelect: () => selectList(list.list_id),
      chips,
      meta,
    };
  }

  function selectList(listId, options = {}) {
    state.selectedListId = listId || "";
    if (options.updateUrl !== false) {
      const params = new URLSearchParams(window.location.search);
      if (state.selectedListId) {
        params.set("list", state.selectedListId);
      } else {
        params.delete("list");
      }
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
    renderDetail(selectedList());
    collapseIndexAfterSelection();
    updateListSelectionState();
  }

  function updateListSelectionState() {
    listMount.querySelectorAll(".view-index-list-button").forEach((button) => {
      const selected = button.dataset.viewIndexId === state.selectedListId;
      button.classList.toggle("is-selected", selected);
      if (selected) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function collapseIndexAfterSelection() {
    if (indexPanel && activeListsViewDescriptor?.indexPanel?.collapseOnSelect && state.selectedListId) {
      indexPanel.open = false;
    }
  }

  function openListFromUrl() {
    if (state.selectedListId && selectedList()) {
      selectList(state.selectedListId, { updateUrl: false });
    }
  }

  function renderDetail(list) {
    const view = requireView();
    if (!list) {
      renderDetailPrompt("Select a list.");
      return;
    }

    const locked = list.status === "archived" || list.status === "deleted" || list.status === "finalized";
    const article = view.createElement("section", { className: "lists-detail-content" });
    const header = createListDetailHeader(list, locked);
    const listDetails = createListDetailsPanel(list);
    const nextAction = createNextActionStrip(list);
    const sourceContext = shouldShowSourceContext(list) ? createSourceContextPanel(list) : null;
    const costSummary = createCostSummaryPanel(list);
    const itemsHeader = createItemsHeader(list, locked);
    const items = view.createElement("div", { className: "lists-items" });

    items.appendChild(createItemsTable(list, locked));

    // Detail order: identity -> details context -> what to do next -> provenance (only when meaningful) ->
    // Items heading + Add Item -> the items table -> the cost rollup beneath the items it totals.
    article.append(...[header, listDetails, nextAction, sourceContext, itemsHeader, items, costSummary]
      .filter((node) => node !== null && node !== undefined));
    detailPanel.replaceChildren(article);
  }

  function createListDetailHeader(list, locked) {
    const view = requireView();
    // Mirrors the Notes detail header: a title row (title + badges on the left, a 3-dot action menu on
    // the right), a rule, then a compact labeled meta line. Keeping the actions in a "..." menu stops the
    // wide action row from overlapping the detail content.
    const title = view.createElement("h2", { className: "lists-detail-title", text: list.title || "Untitled list" });
    const titleGroup = view.createElement("div", {
      className: "lists-detail-title-group",
      children: [title, ...listBadges(list)],
    });
    const titleRow = view.createElement("div", {
      className: "lists-detail-title-row",
      children: [titleGroup, createListActionStrip(list, locked)],
    });
    const rule = view.createElement("hr", { className: "lists-detail-rule" });
    const meta = view.createElement("p", { className: "lists-detail-meta", children: detailMetaItems(list) });
    return view.createElement("header", { className: "lists-detail-header", children: [titleRow, rule, meta] });
  }

  function createListActionStrip(list, locked) {
    const label = listsActionStripSurfaceDescriptor().label || "List actions";
    return requireDescriptorRenderers().renderDescriptorActionMenu(detailActionButtons(list, locked), {
      summaryLabel: "...",
      ariaLabel: label,
      title: label,
    });
  }

  function createListDetailsPanel(list) {
    const view = requireView();
    const panel = view.createInfoPanel({
      title: "List Details",
      className: "lists-details-panel",
      collapsible: true,
      open: true,
      ariaLabel: "List details",
    });
    const description = view.createElement("p", { className: "lists-description" });
    const linkedRecords = view.createLinkedContextList({
      ariaLabel: "Linked records",
      className: "lists-linked-context-list",
      emptyMessage: "No linked records yet.",
      items: linkedContextItems(list),
      readonly: true,
    });

    description.textContent = list.description || "No description.";
    panel.dataset.listDetailsPanel = "";
    panel.append(description, linkedRecords);
    return panel;
  }

  function listsActionStripSurfaceDescriptor() {
    return listsViewSurfaceDescriptor()?.detail?.actionStrip || listsWorkflowActionStripDescriptor();
  }

  function detailActionButtons(list, locked) {
    const actions = listsActionStripSurfaceDescriptor().actions || [];
    const buttons = [];
    const actionById = new Map(actions.map((action) => [action.id, action]));

    if (list.status !== "deleted") {
      buttons.push(listWorkflowActionButton(actionById.get("duplicate-list"), list, {
        label: duplicateActionLabel(list),
      }));
    }
    if (!locked) {
      buttons.push(listWorkflowActionButton(actionById.get("edit-list"), list));
      if (list.status === "active") {
        buttons.push(listWorkflowActionButton(actionById.get("complete-list"), list));
      }
      if (["active", "completed"].includes(list.status)) {
        buttons.push(listWorkflowActionButton(actionById.get("finalize-list"), list));
      }
      const reusableActionId = list.is_reusable ? "unmark-reusable-list" : "mark-reusable-list";
      buttons.push(listWorkflowActionButton(actionById.get(reusableActionId), list));
      buttons.push(listWorkflowActionButton(actionById.get("archive-list"), list));
      buttons.push(listWorkflowActionButton(actionById.get("delete-list"), list));
    }
    if (list.status === "completed") {
      buttons.unshift(listWorkflowActionButton(actionById.get("reopen-list"), list));
    }
    if (list.status === "archived" || list.status === "deleted") {
      buttons.push(listWorkflowActionButton(actionById.get("restore-list"), list));
    }

    return buttons.length > 0 ? buttons : [readonlyBadge(list.status)];
  }

  function listWorkflowActionButton(action = {}, list, options = {}) {
    const actionId = action.id || options.actionId || "";
    return actionButton(options.label || action.label || actionId, actionId, list.list_id, action.role === "destructive" ? "secondary" : "", {
      behavior: action.behavior,
    });
  }

  function createItemsHeader(list, locked) {
    const view = requireView();
    // The item form now lives in a modal; the detail just carries an "Items" heading and an Add Item button
    // that opens it (or a read-only notice when the list is locked).
    const descriptor = listsItemFormSurfaceDescriptor();
    const title = view.createElement("h3", { text: descriptor.title || "Items" });
    /** @type {HTMLElement[]} */
    const children = [title];
    if (locked) {
      children.push(view.createElement("p", { className: "lists-locked-note", text: readOnlyStateMessage(list) }));
    } else {
      const addAction = descriptor.actions?.[0] || {};
      const add = view.createActionButton({ label: addAction.label || "Add Item", role: addAction.role || "primary" });
      add.dataset.listAction = "add-item";
      add.dataset.listId = list.list_id;
      children.push(add);
    }
    return view.createElement("div", { className: "lists-items-header", children });
  }

  // The add/edit item form is a framework-rendered modal (createModalForm via renderDescriptorModalForm);
  // the module supplies the fields from the descriptor and owns the data, validation, and save routes.
  function createItemDialogShell() {
    const view = requireView();
    const descriptor = listsItemFormSurfaceDescriptor();
    const name = createItemFieldFromDescriptor(itemFormField("item_name"));
    const catalogItemId = createItemFieldFromDescriptor(itemFormField("catalog_item_id"));
    const sideBySide = requireDescriptorRenderers().renderDescriptorFieldGrid({ fields: [] }, {
      surface: false,
      className: "lists-item-fields",
      fields: ["quantity", "unit", "needed_by_date", "assigned_user_id", "purchase_status"]
        .map((fieldName) => createItemFieldFromDescriptor(itemFormField(fieldName))),
    });
    const advancedDescriptorFields = (descriptor.fields || []).filter((field) => field.placement === "advanced");
    const advanced = view.createElement("details", { className: ["lists-item-advanced", "surface-modal-group"] });
    const advancedSummary = view.createElement("summary", {
      className: "surface-modal-section-heading",
      text: "Details",
    });
    const advancedFields = requireDescriptorRenderers().renderDescriptorFieldGrid({ fields: advancedDescriptorFields }, {
      surface: false,
      className: ["lists-item-advanced-fields", "surface-modal-section-body"],
      fields: advancedDescriptorFields.map((field) => createItemFieldFromDescriptor(field)),
    });
    advanced.append(advancedSummary, advancedFields);
    const notes = createItemFieldFromDescriptor(itemFormField("notes"));
    const saveToCatalog = createItemFieldFromDescriptor(itemFormField("save_to_catalog"));
    const formStatus = view.createStatusMessage({ className: "lists-form-status" });
    formStatus.dataset.listItemFormStatus = "";

    const saveAction = descriptor.actions?.[0] || {};
    const cancel = view.createActionButton({ label: "Cancel", role: "secondary" });
    cancel.dataset.listItemCancel = "";
    const save = view.createActionButton({ label: saveAction.label || "Add Item", type: "submit", role: saveAction.role || "primary" });
    save.dataset.listItemSave = "";

    const dialog = requireDescriptorRenderers().renderDescriptorModalForm(descriptor, {
      title: descriptor.title || "Item",
      size: "wide",
      className: "lists-item-dialog",
      formClassName: "lists-item-form",
      fields: [name, catalogItemId, sideBySide, advanced, notes, saveToCatalog, formStatus],
      actions: [cancel, save],
    });
    dialog.dataset.listItemDialog = "";
    dialog.viewParts.form.dataset.listItemForm = "";
    dialog.viewParts.title.dataset.listItemDialogTitle = "";

    const close = view.createActionButton({ label: "Close", className: "lists-dialog-close" });
    close.dataset.listItemDialogClose = "";
    const heading = view.createElement("div", {
      className: "surface-modal-heading",
      children: [
        dialog.viewParts.title,
        view.createElement("div", {
          className: "surface-modal-heading-actions",
          children: [close],
        }),
      ],
    });
    dialog.viewParts.form.insertBefore(heading, dialog.viewParts.body);
    return dialog;
  }

  async function openItemDialog(list, item = null) {
    if (!itemDialog || !list) {
      return;
    }
    state.itemDialogList = list;
    itemDialogForm.reset();
    itemDialogForm.dataset.listId = list.list_id;
    itemDialogForm.dataset.editingItemId = item?.list_item_id || "";
    populateItemAssigneeOptions();
    setFormValue(itemDialogForm, "catalog_item_id", item?.catalog_item_id || "");
    itemDialogTitle.textContent = item ? "Edit Item" : "Add Item";
    itemDialogSave.textContent = item ? "Save Item" : (listsItemFormSurfaceDescriptor().actions?.[0]?.label || "Add Item");
    itemDialogFormStatus.textContent = "";
    const advanced = itemDialogForm.querySelector(".lists-item-advanced");
    if (item) {
      fillItemForm(itemDialogForm, item);
      advanced?.setAttribute("open", "open");
    } else {
      advanced?.removeAttribute("open");
    }
    await loadItemSuggestions(list);
    updateSuggestionDatalist(itemDialog, list);
    if (typeof itemDialog.showModal === "function") {
      itemDialog.showModal();
    } else {
      itemDialog.setAttribute("open", "open");
    }
    itemDialogForm.querySelector("[name='item_name']")?.focus();
  }

  function populateItemAssigneeOptions(selectedUserId = "") {
    const select = itemDialogForm?.elements.assigned_user_id;
    if (!select) {
      return;
    }
    replaceOptions(select, [
      option("", "Unassigned"),
      ...state.users.map((user) => option(user.user_id, displayUser(user))),
    ]);
    select.value = selectedUserId || "";
  }

  function closeItemDialog() {
    itemDialog?.close?.();
    itemDialog?.removeAttribute("open");
  }

  async function saveItem(event) {
    const api = requireApi();
    event.preventDefault();
    const form = event.target;
    const listId = form.dataset.listId;
    const editingItemId = form.dataset.editingItemId || "";
    const payload = Object.fromEntries(new FormData(form).entries());

    payload.quantity = payload.quantity || 1;
    payload.save_to_catalog = payload.save_to_catalog === "true";
    try {
      itemDialogSave.disabled = true;
      itemDialogFormStatus.textContent = "Saving item...";
      if (editingItemId) {
        await api.putJson(`/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(editingItemId)}`, payload);
      } else {
        await api.postJson(`/api/lists/${encodeURIComponent(listId)}/items`, payload);
      }
      closeItemDialog();
      await refreshLists(listId);
      setStatus("");
    } catch (error) {
      itemDialogFormStatus.textContent = error.message || "Item could not be saved.";
    } finally {
      itemDialogSave.disabled = false;
    }
  }

  function listsItemFormSurfaceDescriptor() {
    return listsViewSurfaceDescriptor()?.detail?.itemForm || listsItemFormDescriptor();
  }

  function itemFormField(fieldName) {
    return listsItemFormSurfaceDescriptor().fields?.find((field) => field.field === fieldName) || { field: fieldName, type: "text", label: fieldName };
  }

  function createItemFieldFromDescriptor(field) {
    const node = buildItemFieldNode(field);
    if (field.width && node && node.dataset) {
      node.dataset.viewFieldWidth = field.width;
    }
    return node;
  }

  function buildItemFieldNode(field) {
    const view = requireView();
    if (field.field === "item_name") {
      return createItemNameField(field);
    }
    if (field.field === "catalog_item_id") {
      const input = view.createElement("input");
      input.type = "hidden";
      input.name = field.field;
      input.dataset.listCatalogItemId = "";
      return input;
    }
    if (field.field === "assigned_user_id") {
      // Built once (before users load) with just the placeholder; openItemDialog fills the user options.
      return selectField(field.label || "Assigned", field.field, [option("", "Unassigned")]);
    }
    if (field.type === "select") {
      const node = selectField(field.label || field.field, field.field, optionsFromDescriptor(field).map(([value, label]) => option(value, label)));
      applySelectDefault(node, field.default);
      return node;
    }
    if (field.type === "textarea") {
      return textareaField(field.label || field.field, field.field, { rows: field.rows });
    }
    if (field.type === "checkbox") {
      // For checkboxes the descriptor `default` carries the checked-by-default state; the submitted value
      // stays "true" so the save handler's `=== "true"` check is unaffected.
      return checkboxField(field.label || field.field, field.field, "true", { checked: field.default === "true" || field.default === true });
    }
    return inputField(field.label || field.field, field.type || "text", field.field, {
      autocomplete: field.autocomplete,
      min: field.min,
      required: field.required,
      step: field.step,
      value: field.default,
    });
  }

  function optionsFromDescriptor(field = {}) {
    return (field.options || []).map((entry) => {
      if (Array.isArray(entry)) {
        return entry;
      }
      return [entry.value ?? entry.id ?? "", entry.label ?? entry.text ?? entry.value ?? ""];
    });
  }

  function createItemNameField(field = {}) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const dataList = document.createElement("datalist");
    // Fixed datalist id (the modal is built once and reused); suggestions are repopulated per open for the
    // list currently in the dialog (state.itemDialogList).
    const listId = "list-item-suggestions";

    input.type = "text";
    input.name = "item_name";
    input.required = true;
    input.setAttribute("list", listId);
    input.autocomplete = "off";
    input.dataset.listItemName = "";
    dataList.id = listId;
    dataList.dataset.listItemSuggestions = "";
    label.append(field.label || "Item", input, dataList);
    input.addEventListener("input", () => applySuggestionSelection(input.form, state.itemDialogList, input.value));
    return label;
  }

  function checkboxField(labelText, name, value, options = {}) {
    const label = document.createElement("label");
    const input = document.createElement("input");

    label.className = "lists-checkbox-field";
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    if (options.checked) {
      // defaultChecked so form.reset() (after adding an item) restores the on state.
      input.checked = true;
      input.defaultChecked = true;
    }
    label.append(input, labelText);
    return label;
  }

  function createItemsTable(list, locked) {
    const items = visibleItems(list);
    const descriptor = listsItemRowsSurfaceDescriptor();
    const table = requireDescriptorRenderers().renderDescriptorDataTable(descriptor, {
      rows: [],
      emptyMessage: descriptor.emptyState?.message || "No items yet.",
      className: "lists-items-table-wrap",
      tableClassName: "list-table lists-items-table",
    });
    const tbody = table.querySelector("tbody");

    if (items.length > 0 && tbody) {
      tbody.replaceChildren(...items.map((item, index) => createItemRow(list, item, index, items.length, locked)));
    }

    return table;
  }

  function listsItemRowsSurfaceDescriptor() {
    return listsViewSurfaceDescriptor()?.detail?.itemRows || listsItemRowsDescriptor();
  }

  function linkedContextItems(list) {
    return (list.links || []).map((link) => {
      const target = link.target || {};
      const targetType = link.target_type || "";
      const typeLabel = LIST_LINK_TYPE_LABELS[targetType] || formatToken(targetType);
      const displayLabel = target.label || unavailableLinkedRecordLabel(targetType);
      return {
        className: "lists-linked-context-row",
        displayLabel,
        fullLabel: displayLabel,
        hintLabel: typeLabel,
        isAvailable: Boolean(target.label),
        moduleId: target.moduleId || target.module_id || targetType || "lists",
        removable: false,
        secondaryLabel: typeLabel,
        sourceUrl: target.url || "",
        targetId: target.id || target.target_id || "",
        targetType,
      };
    });
  }

  function unavailableLinkedRecordLabel(targetType) {
    const typeLabel = LIST_LINK_TYPE_LABELS[targetType] || formatToken(targetType);
    return typeLabel ? `Unavailable ${typeLabel.toLowerCase()}` : "Unavailable linked record";
  }

  function createItemRow(list, item, index, total, locked) {
    const row = document.createElement("tr");
    const doneCell = document.createElement("td");
    const itemCell = document.createElement("td");
    const qtyCell = document.createElement("td");
    const costCell = document.createElement("td");
    const neededCell = document.createElement("td");
    const statusCell = document.createElement("td");
    const actionsCell = document.createElement("td");
    const checkbox = document.createElement("input");
    const itemTitle = document.createElement("strong");

    checkbox.type = "checkbox";
    checkbox.checked = Boolean(item.checked_at);
    checkbox.disabled = locked;
    checkbox.dataset.itemAction = checkbox.checked ? "uncheck-item" : "check-item";
    checkbox.dataset.listId = list.list_id;
    checkbox.dataset.itemId = item.list_item_id;
    doneCell.appendChild(checkbox);

    // Show only the item name (truncated past 20 chars, full name in the cell title); vendor/url/tracking/
    // notes live in the item editor and the cost surfaces in its own column below.
    const itemName = item.item_name || "Untitled item";
    itemTitle.textContent = truncateItemName(itemName, 20);
    if (itemTitle.textContent !== itemName) {
      itemCell.title = itemName;
    }
    itemCell.appendChild(itemTitle);
    qtyCell.textContent = [item.quantity ?? "", item.unit || ""].filter(Boolean).join(" ") || "-";
    applyItemCostCell(costCell, item);
    neededCell.textContent = item.needed_by_date || "-";
    statusCell.textContent = PURCHASE_STATUS_LABELS[item.purchase_status] || item.purchase_status || "-";
    actionsCell.appendChild(createItemRowActions(list, item, index, total, locked));
    row.append(doneCell, itemCell, qtyCell, costCell, neededCell, statusCell, actionsCell);
    return row;
  }

  function createItemRowActions(list, item, index, total, locked) {
    // The reorder controls stay inline (up/down icons); edit and delete fold into a "..." overflow menu.
    const actionById = new Map(listsItemRowsSurfaceDescriptor().actions.map((action) => [action.id, action]));
    const rowActionButton = (id, options) => itemRowActionButton(actionById.get(id), list, item, index, total, locked, options);
    const ariaLabel = `${item.item_name || "Item"} actions`;
    const menu = requireDescriptorRenderers().renderDescriptorActionMenu(
      [rowActionButton("edit-item", { menu: true }), rowActionButton("delete-item", { menu: true })],
      { summaryLabel: "...", ariaLabel, title: "Item actions" },
    );
    return requireDescriptorRenderers().renderDescriptorInlineActions(
      [rowActionButton("move-item-up"), rowActionButton("move-item-down"), menu],
      { className: "lists-item-actions", ariaLabel },
    );
  }

  function truncateItemName(text, max) {
    const value = String(text || "");
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }

  function applyItemCostCell(cell, item) {
    const estimated = Number(item.estimated_cost) || 0;
    const actual = Number(item.actual_cost) || 0;
    const display = actual || estimated;
    cell.textContent = display ? formatCurrency(display) : "-";
    if (estimated && actual) {
      cell.title = `Estimated ${formatCurrency(estimated)} · Actual ${formatCurrency(actual)}`;
    } else if (estimated) {
      cell.title = `Estimated ${formatCurrency(estimated)}`;
    } else if (actual) {
      cell.title = `Actual ${formatCurrency(actual)}`;
    }
  }

  const ITEM_ROW_ACTION_ICONS = {
    "edit-item": "edit",
    "move-item-up": "up",
    "move-item-down": "down",
    "delete-item": "delete",
  };

  function itemRowActionButton(action, list, item, index, total, locked, options = {}) {
    const disabledByPosition = (action.id === "move-item-up" && index === 0) ||
      (action.id === "move-item-down" && index >= total - 1);
    return actionButton(action.label || action.id, action.id, list.list_id, action.role === "destructive" ? "secondary" : "", {
      itemId: item.list_item_id,
      disabled: locked || disabledByPosition,
      behavior: action.behavior,
      // Menu items render as labeled buttons (Edit/Delete); the inline up/down stay icon-only.
      icon: options.menu ? undefined : ITEM_ROW_ACTION_ICONS[action.id],
    });
  }

  async function handleDetailClick(event) {
    const actionElement = event.target.closest("[data-list-action], [data-item-action]");
    if (!actionElement) {
      return;
    }

    const list = state.lists.find((entry) => entry.list_id === actionElement.dataset.listId);
    const itemId = actionElement.dataset.itemId || "";
    const linkId = actionElement.dataset.linkId || "";
    const action = actionElement.dataset.listAction || actionElement.dataset.itemAction;

    try {
      setStatus("Saving...");
      if (action === "edit-list") {
        openListDialog(list);
        setStatus("");
        return;
      }
      if (action === "add-item") {
        await openItemDialog(list);
        setStatus("");
        return;
      }
      if (action === "edit-item") {
        await openItemDialog(list, list?.items?.find((entry) => entry.list_item_id === itemId) || null);
        setStatus("");
        return;
      }
      const selectedId = await runAction(action, list, itemId, linkId);
      await refreshLists(selectedId || list?.list_id || state.selectedListId);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "List action failed.", true);
    }
  }

  async function runAction(action, list, itemId, linkId = "") {
    const api = requireApi();
    const listId = encodeURIComponent(list.list_id);
    const itemPath = itemId ? `/items/${encodeURIComponent(itemId)}` : "";

    if (action === "complete-list") {
      await api.postJson(`/api/lists/${listId}/complete`, {});
    } else if (action === "finalize-list") {
      await api.postJson(`/api/lists/${listId}/finalize`, {});
    } else if (action === "reopen-list") {
      await api.postJson(`/api/lists/${listId}/reopen`, {});
    } else if (action === "duplicate-list") {
      const result = await api.postJson(`/api/lists/${listId}/duplicate`, {});
      if (reusableFilter) {
        reusableFilter.value = "no";
      }
      if (statusFilter) {
        statusFilter.value = "active";
      }
      if (archiveFilter) {
        archiveFilter.value = "current";
      }
      setStatus("Created active working copy.");
      return result.list?.list_id || result.list?.id || "";
    } else if (action === "mark-reusable-list") {
      await api.postJson(`/api/lists/${listId}/mark-reusable`, {});
    } else if (action === "unmark-reusable-list") {
      await api.postJson(`/api/lists/${listId}/unmark-reusable`, {});
    } else if (action === "archive-list") {
      await api.postJson(`/api/lists/${listId}/archive`, {});
    } else if (action === "restore-list") {
      await api.postJson(`/api/lists/${listId}/restore`, {});
    } else if (action === "delete-list") {
      await api.deleteJson(`/api/lists/${listId}`);
    } else if (action === "check-item" || action === "uncheck-item") {
      await api.postJson(`/api/lists/${listId}${itemPath}/${action.replace("-item", "")}`, {});
    } else if (action === "delete-item") {
      await api.deleteJson(`/api/lists/${listId}${itemPath}`);
    } else if (action === "move-item-up" || action === "move-item-down") {
      await moveItem(list, itemId, action === "move-item-up" ? -1 : 1);
    } else if (action === "remove-link") {
      if (linkId) {
        await api.postJson(`/api/lists/${listId}/links/${encodeURIComponent(linkId)}/remove`, {});
      }
    }
    return "";
  }

  async function moveItem(list, itemId, direction) {
    const api = requireApi();
    const items = visibleItems(list);
    const index = items.findIndex((item) => item.list_item_id === itemId);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const ordered = [...items];
    const [item] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, item);
    await api.postJson(`/api/lists/${encodeURIComponent(list.list_id)}/items/reorder`, {
      items: ordered.map((entry, orderIndex) => ({
        list_item_id: entry.list_item_id,
        sort_order: orderIndex * 10,
      })),
    });
  }

  async function handleDetailSubmit(event) {
    const api = requireApi();
    if (event.target.matches("[data-list-link-form]")) {
      event.preventDefault();
      const form = event.target;
      const listId = form.dataset.listId;
      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.target_type === "task" && !payload.target_id) {
        setStatus("Select a task to link.", true);
        return;
      }

      try {
        setStatus("Adding link...");
        await api.postJson(`/api/lists/${encodeURIComponent(listId)}/links`, payload);
        form.reset();
        await refreshLists(listId);
        setStatus("");
      } catch (error) {
        setStatus(error.message || "Link could not be added.", true);
      }
    }
    // The item add/edit form is a modal appended to the body (saved via saveItem); only the linked-records
    // form is submitted from inside the detail panel.
  }

  function fillItemForm(form, item) {
    setFormValue(form, "item_name", item.item_name);
    setFormValue(form, "quantity", item.quantity ?? 1);
    setFormValue(form, "unit", item.unit);
    setFormValue(form, "needed_by_date", item.needed_by_date);
    setFormValue(form, "assigned_user_id", item.assigned_user_id);
    setFormValue(form, "catalog_item_id", item.catalog_item_id);
    setFormValue(form, "purchase_status", item.purchase_status || "needed");
    setFormValue(form, "vendor_name", item.vendor_name);
    setFormValue(form, "url", item.url);
    setFormValue(form, "estimated_cost", item.estimated_cost);
    setFormValue(form, "actual_cost", item.actual_cost);
    setFormValue(form, "tracking_id", item.tracking_id);
    setFormValue(form, "notes", item.notes);
    setFormValue(form, "save_to_catalog", "");
  }

  async function loadItemSuggestions(list) {
    const api = requireApi();
    if (!list?.list_id) {
      return [];
    }

    const params = new URLSearchParams({
      limit: "12",
      listId: list.list_id,
    });
    try {
      const result = await api.getJson(`/api/lists/item-suggestions?${params}`, { cache: "no-store" });
      const suggestions = result.suggestions || [];
      state.itemSuggestions.set(list.list_id, suggestions);
      return suggestions;
    } catch {
      state.itemSuggestions.set(list.list_id, []);
      return [];
    }
  }

  function updateSuggestionDatalist(container, list) {
    const dataList = container.querySelector("[data-list-item-suggestions]");
    if (!dataList) {
      return;
    }

    dataList.replaceChildren(...itemSuggestionsForList(list).map((suggestion) => {
      const entry = option(suggestion.item_name, suggestionLabel(suggestion));
      entry.dataset.catalogItemId = suggestion.catalog_item_id;
      return entry;
    }));
  }

  function applySuggestionSelection(form, list, value) {
    const suggestion = itemSuggestionsForList(list).find((entry) => (
      (entry.item_name || "").toLowerCase() === String(value || "").trim().toLowerCase()
    ));

    setFormValue(form, "catalog_item_id", suggestion?.catalog_item_id || "");
    if (!suggestion) {
      return;
    }

    setFormValue(form, "quantity", suggestion.quantity ?? 1);
    setFormValue(form, "unit", suggestion.unit || "");
    setFormValue(form, "vendor_name", suggestion.vendor_name || "");
    setFormValue(form, "url", suggestion.url || "");
    setFormValue(form, "estimated_cost", suggestion.estimated_cost ?? "");
    setFormValue(form, "notes", suggestion.notes || "");
  }

  function itemSuggestionsForList(list) {
    return state.itemSuggestions.get(list?.list_id) || [];
  }

  function suggestionLabel(suggestion) {
    const pieces = [
      [suggestion.quantity ?? "", suggestion.unit || ""].filter(Boolean).join(" "),
      suggestion.vendor_name || "",
      suggestion.use_count ? `used ${suggestion.use_count}` : "",
    ].filter(Boolean);

    return pieces.length > 0 ? `${suggestion.item_name} - ${pieces.join(" / ")}` : suggestion.item_name;
  }

  function formatToken(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function listEditorPickerParts() {
    return listLinkPicker?.viewParts || {};
  }

  function listLinkProviderOptions(providers = []) {
    const source = providers.length > 0
      ? providers
      : LIST_LINK_TARGET_ORDER.map((targetType) => ({
          label: LIST_LINK_TYPE_LABELS[targetType],
          moduleId: moduleIdForListLinkTarget(targetType),
          targetType,
        }));
    const providersByType = new Map(source.map((provider) => [provider.targetType, provider]));

    return LIST_LINK_TARGET_ORDER
      .filter((targetType) => targetType !== "client" || usesBusinessScope())
      .map((targetType) => providersByType.get(targetType))
      .filter(Boolean)
      .map((provider) => ({
        label: provider.label || LIST_LINK_TYPE_LABELS[provider.targetType] || formatToken(provider.targetType),
        moduleId: provider.moduleId || moduleIdForListLinkTarget(provider.targetType),
        providerId: provider.providerId || provider.provider || provider.id || "",
        targetType: provider.targetType,
        value: provider.targetType,
      }));
  }

  function moduleIdForListLinkTarget(targetType) {
    return {
      client: "client-projects",
      note: "notes",
      project: "client-projects",
      task: "tasks",
    }[targetType] || "";
  }

  function queueListEditorLinkTargetSearch() {
    window.clearTimeout(state.linkTargetSearchTimer);
    state.linkTargetSearchTimer = window.setTimeout(() => loadListEditorLinkTargets(), 180);
  }

  async function loadListEditorLinkTargets() {
    const api = requireApi();
    const parts = listEditorPickerParts();
    const targetType = listLinkTargetTypeInput?.value || "task";
    if (!parts.setRecords || !canManageListLinks()) {
      parts.setRecords?.([]);
      return;
    }

    listLinkResultsInput.disabled = true;
    listLinkApplyButton.disabled = true;
    parts.setRecords([{ targetId: "", displayLabel: "Loading records...", disabled: true }]);

    const params = new URLSearchParams({
      limit: "40",
      targetType,
    });
    if (listLinkSearchInput?.value.trim()) {
      params.set("q", listLinkSearchInput.value.trim());
    }

    try {
      const result = await api.getJson(`/api/lists/link-targets?${params.toString()}`, { cache: "no-store" });
      const providerOptions = listLinkProviderOptions(result.providers || []);
      parts.setTargets?.(providerOptions);
      if (listLinkTargetTypeInput) {
        listLinkTargetTypeInput.value = providerOptions.some((provider) => provider.targetType === targetType)
          ? targetType
          : providerOptions[0]?.targetType || "";
      }
      state.linkTargets = result.targets || [];
      parts.setRecords(state.linkTargets);
      listLinkApplyButton.disabled = state.linkTargets.length === 0;
      listFormStatus.textContent = "";
    } catch (error) {
      state.linkTargets = [];
      parts.setRecords([]);
      listLinkApplyButton.disabled = true;
      listFormStatus.textContent = error.message || "Linked records could not be loaded.";
    } finally {
      listLinkResultsInput.disabled = false;
    }
  }

  function selectedListEditorLinkTarget() {
    const targetId = listLinkResultsInput?.value || "";
    const targetType = listLinkTargetTypeInput?.value || "";
    return state.linkTargets.find((target) => target.targetId === targetId && target.targetType === targetType) || null;
  }

  async function applyListEditorLinkTarget() {
    const api = requireApi();
    const target = selectedListEditorLinkTarget();
    if (!target?.targetType || !target.targetId || listEditorHasLinkTarget(target)) {
      listFormStatus.textContent = target ? "Linked record is already added." : "Choose a linked record first.";
      return;
    }

    if (!state.editingListId) {
      state.editorStagedTargets = [...state.editorStagedTargets, target];
      renderListEditorLinkedItems();
      listFormStatus.textContent = "";
      return;
    }

    listLinkApplyButton.disabled = true;
    listFormStatus.textContent = "Adding linked record...";
    try {
      await api.postJson(`/api/lists/${encodeURIComponent(state.editingListId)}/links`, listLinkPayload(target));
      await refreshListEditor(state.editingListId);
      listFormStatus.textContent = "";
    } catch (error) {
      listFormStatus.textContent = error.message || "Linked record could not be added.";
    } finally {
      listLinkApplyButton.disabled = false;
    }
  }

  function handleListEditorLinkedContextRemove(item = {}) {
    if (item.link) {
      void removeListEditorLink(item.link);
      return;
    }
    if (item.target) {
      state.editorStagedTargets = state.editorStagedTargets.filter((target) => !sameListLinkTarget(target, item.target));
      renderListEditorLinkedItems();
    }
  }

  async function removeListEditorLink(link = {}) {
    const api = requireApi();
    const linkId = link.list_link_id || link.id || "";
    if (!state.editingListId || !linkId) {
      return;
    }

    listFormStatus.textContent = "Removing linked record...";
    try {
      await api.postJson(`/api/lists/${encodeURIComponent(state.editingListId)}/links/${encodeURIComponent(linkId)}/remove`, {});
      await refreshListEditor(state.editingListId);
      listFormStatus.textContent = "";
    } catch (error) {
      listFormStatus.textContent = error.message || "Linked record could not be removed.";
    }
  }

  function listEditorHasLinkTarget(target = {}) {
    return [
      ...(state.editorList?.links || []),
      ...state.editorStagedTargets,
    ].some((entry) => sameListLinkTarget(entry, target));
  }

  function sameListLinkTarget(left = {}, right = {}) {
    const leftType = left.targetType || left.target_type || left.target?.target_type || "";
    const rightType = right.targetType || right.target_type || right.target?.target_type || "";
    const leftId = left.targetId || left.target_id || left.target?.target_id || "";
    const rightId = right.targetId || right.target_id || right.target?.target_id || "";
    return leftType === rightType && leftId === rightId;
  }

  function listLinkPayload(target = {}) {
    return {
      moduleId: target.moduleId || moduleIdForListLinkTarget(target.targetType),
      targetId: target.targetId,
      targetType: target.targetType,
    };
  }

  function renderListEditorLinkedItems() {
    const parts = listEditorPickerParts();
    const removable = canManageListLinks();
    const savedItems = linkedContextItems(state.editorList || {}).map((item, index) => ({
      ...item,
      link: state.editorList?.links?.[index],
      removable,
    }));
    const stagedItems = state.editorStagedTargets.map((target) => ({
      ...target,
      displayLabel: target.displayLabel || unavailableLinkedRecordLabel(target.targetType),
      removable,
      target,
    }));
    parts.setLinkedItems?.([...savedItems, ...stagedItems]);
  }

  async function refreshListEditor(listId) {
    const list = await loadListDetail(listId);
    if (!list) {
      throw new Error("List could not be refreshed.");
    }
    state.editorList = list;
    const index = state.lists.findIndex((entry) => entry.list_id === listId);
    if (index >= 0) {
      state.lists.splice(index, 1, list);
      renderLists();
    }
    if (state.selectedListId === listId) {
      renderDetail(list);
    }
    renderListEditorLinkedItems();
    return list;
  }

  function configureListEditorPicker(list = null) {
    const parts = listEditorPickerParts();
    state.linkTargets = [];
    state.editorStagedTargets = [];
    parts.setTargets?.(listLinkProviderOptions());
    if (listLinkTargetTypeInput) {
      listLinkTargetTypeInput.value = "task";
    }
    if (listLinkSearchInput) {
      listLinkSearchInput.value = "";
    }
    parts.setRecords?.([]);
    parts.setReadonly?.(!canManageListLinks(list));
    renderListEditorLinkedItems();
    if (canManageListLinks(list)) {
      void loadListEditorLinkTargets();
    }
  }

  function canManageListLinks(list = state.editorList) {
    if (list && ["archived", "deleted", "finalized"].includes(list.status)) {
      return false;
    }
    const permissionValues = window.LongtailForge?.workspaceContext?.permissionIds
      || window.LongtailForge?.workspaceContext?.permissions;
    if (!permissionValues) {
      return true;
    }
    const permissions = permissionValues instanceof Set
      ? permissionValues
      : new Set(Array.isArray(permissionValues)
          ? permissionValues
          : Object.entries(permissionValues).filter(([, allowed]) => Boolean(allowed)).map(([permissionId]) => permissionId));
    return permissions.has("lists.manage_links");
  }

  function openListDialog(list = null, options = {}) {
    const view = requireView();
    const defaults = options.defaults || {};
    state.editingListId = list?.list_id || "";
    state.editorList = list;
    state.listDialogHostContext = options.hostContext || null;
    state.listDialogHostContextSettled = false;
    listDialogTitle.textContent = list ? "Edit List" : "Create List";
    listTitleInput.value = list?.title || defaults.title || "";
    listDescriptionInput.value = list?.description || defaults.description || "";
    listTypeInput.value = list?.list_type || defaults.list_type || defaultListType();
    setContextControlsVisible(shouldShowContextControls(listTypeInput.value));
    populateClientOptions(list?.client_id || defaults.client_id || "");
    populateProjectOptions(listProjectInput, list?.client_id || defaults.client_id || "", list?.project_id || defaults.project_id || "");
    listFormStatus.textContent = "";
    listSaveButton.textContent = list ? "Save List" : "Create List";
    configureListEditorPicker(list);
    const openDialog = listDialog;
    const closeResult = new Promise((resolve) => {
      openDialog?.addEventListener("close", () => resolve(openDialog.returnValue || "closed"), { once: true });
    });
    view.showModal(listDialog, { trigger: options.trigger || null });
    listTitleInput.focus();
    return closeResult;
  }

  function closeListDialog(options = {}) {
    const view = requireView();
    if (options.cancelHost) {
      cancelListDialogHostContext({
        actionId: state.editingListId ? "lists.edit" : "lists.add",
        recordId: state.editingListId || "",
      });
    }
    view.closeModal(listDialog, options.returnValue || "");
  }

  function cancelListDialog() {
    closeListDialog({ cancelHost: true, returnValue: "cancel" });
  }

  function handleListDialogClose() {
    cancelListDialogHostContext({
      actionId: state.editingListId ? "lists.edit" : "lists.add",
      recordId: state.editingListId || "",
    });
  }

  function completeListDialogHostContext(detail = {}) {
    if (!state.listDialogHostContext || state.listDialogHostContextSettled) {
      return;
    }

    state.listDialogHostContextSettled = true;
    state.listDialogHostContext.complete?.(detail);
    state.listDialogHostContext = null;
  }

  function cancelListDialogHostContext(detail = {}) {
    if (!state.listDialogHostContext || state.listDialogHostContextSettled) {
      return;
    }

    state.listDialogHostContextSettled = true;
    state.listDialogHostContext.cancel?.(detail);
    state.listDialogHostContext = null;
  }

  async function saveList(event) {
    const api = requireApi();
    event.preventDefault();
    const payload = {
      client_id: usesBusinessScope() ? listClientInput.value : "",
      description: listDescriptionInput.value,
      list_type: listTypeInput.value,
      project_id: listProjectInput.value,
      title: listTitleInput.value,
    };
    const wasEditing = Boolean(state.editingListId);
    let savedListId = state.editingListId || "";
    let createdDuringSave = false;

    try {
      listSaveButton.disabled = true;
      listFormStatus.textContent = "Saving...";
      if (state.editingListId) {
        await api.putJson(`/api/lists/${encodeURIComponent(state.editingListId)}`, payload);
      } else {
        const result = await api.postJson("/api/lists", payload);
        savedListId = result.list?.list_id || "";
        createdDuringSave = Boolean(savedListId);
        state.editingListId = savedListId;
        state.editorList = normalizeListRecord(result.list, [], []);
        state.selectedListId = savedListId || state.selectedListId;
      }
      for (const target of state.editorStagedTargets) {
        await api.postJson(`/api/lists/${encodeURIComponent(savedListId)}/links`, listLinkPayload(target));
      }
      state.editorStagedTargets = [];
      if (typeof state.listDialogHostContext?.refresh === "function") {
        await state.listDialogHostContext.refresh({ list: { ...payload, list_id: savedListId } });
      }
      completeListDialogHostContext({
        actionId: wasEditing ? "lists.edit" : "lists.add",
        recordId: savedListId,
        title: payload.title || "",
      });
      closeListDialog({ returnValue: "complete" });
      if (isListsWorkspaceSurface) {
        await refreshLists(state.selectedListId);
      }
      setStatus("");
    } catch (error) {
      listFormStatus.textContent = error.message || "List could not be saved.";
      if (createdDuringSave && savedListId) {
        listDialogTitle.textContent = "Edit List";
        listSaveButton.textContent = "Save List";
        try {
          await refreshListEditor(savedListId);
        } catch {
          // Preserve the original save/link error; the normal page refresh can recover the created list.
        }
      }
    } finally {
      listSaveButton.disabled = false;
    }
  }

  async function refreshLists(selectedId = state.selectedListId) {
    setStatus("Loading lists...");
    await loadLists();
    state.selectedListId = selectedId || state.selectedListId;
    renderLists();
    setStatus("");
  }

  function populateClientOptions(selectedClientId = "") {
    replaceOptions(listClientInput, [
      option("", "Workspace"),
      ...state.clients.filter((client) => !client.isWorkspaceScope).map((client) => option(client.id, client.optionLabel || client.name)),
    ]);
    listClientInput.value = selectedClientId || "";
  }

  function populateProjectOptions(select, selectedClientId = "all", selectedProjectId = "") {
    const projects = allProjects().filter((project) => {
      if (!usesBusinessScope()) {
        return true;
      }
      if (!selectedClientId || selectedClientId === "all") {
        return true;
      }
      return (project.client_id || "") === selectedClientId;
    });

    replaceOptions(select, [
      option("", "No project"),
      ...projects.map((project) => option(project.id, project.optionLabel || project.name)),
    ]);
    select.value = projects.some((project) => project.id === selectedProjectId) ? selectedProjectId : "";
  }

  function syncClientFromProject() {
    const project = allProjects().find((entry) => entry.id === listProjectInput.value);
    if (project?.client_id && listClientInput) {
      listClientInput.value = project.client_id;
    }
  }

  function setBusinessControlsVisible(visible) {
    document.querySelectorAll("[data-list-business-control]").forEach((element) => {
      element.hidden = !visible;
    });
  }

  function setContextControlsVisible(visible) {
    document.querySelectorAll("[data-list-context-control]").forEach((element) => {
      element.hidden = !visible;
    });
  }

  function shouldShowContextControls(listType = defaultListType()) {
    return !usesBusinessScope() || ["procurement", "parts", "supplies", "bill_of_materials"].includes(listType);
  }

  function normalizeListRecord(list = {}, items = [], links = []) {
    const normalizedItems = items.map((item) => ({ ...item, id: item.list_item_id || item.id }));
    const progress = normalizeListProgress(list.progress, normalizedItems);
    const normalizedLinks = links.map((link) => ({ ...link, id: link.list_link_id || link.id }));
    const resumeContext = list.resumeContext || list.resume_context || {};

    return {
      ...list,
      id: list.list_id || list.id,
      isBillOfMaterials: Boolean(list.isBillOfMaterials || list.list_type === "bill_of_materials"),
      is_reusable: Boolean(list.is_reusable ?? list.isReusable),
      items: normalizedItems,
      links: normalizedLinks,
      list_id: list.list_id || list.id,
      progress,
      resumeContext: {
        ...resumeContext,
        progress: resumeContext.progress || progress,
        sourceUrl: resumeContext.sourceUrl || resumeContext.source_url || `lists.html?list=${encodeURIComponent(list.list_id || list.id || "")}`,
      },
      sourceContext: list.sourceContext || list.source_context || { duplicatedFrom: null, sourceList: null },
    };
  }

  function normalizeListProgress(progress = {}, items = []) {
    const visible = items.filter((item) => !item.deleted_at);
    const checkedCount = visible.filter((item) => item.checked_at).length;
    const completedCount = visible.filter((item) => item.completed_at).length;
    const nextUnchecked = visible
      .slice()
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .find((item) => !item.checked_at && !item.completed_at);

    return {
      assignedUserIds: progress.assignedUserIds || progress.assigned_user_ids || [],
      checkedItemCount: Number(progress.checkedItemCount ?? progress.checked_item_count ?? checkedCount),
      completedItemCount: Number(progress.completedItemCount ?? progress.completed_item_count ?? completedCount),
      earliestNeededByDate: progress.earliestNeededByDate || progress.earliest_needed_by_date || nextNeededDateFromItems(visible) || null,
      incompleteItemCount: Number(progress.incompleteItemCount ?? progress.incomplete_item_count ?? visible.filter((item) => !item.checked_at && !item.completed_at).length),
      lastActivityAt: progress.lastActivityAt || progress.last_activity_at || "",
      neededByDates: progress.neededByDates || progress.needed_by_dates || [],
      nextUncheckedItemLabel: progress.nextUncheckedItemLabel || progress.next_unchecked_item_label || nextUnchecked?.item_name || "",
      totalItemCount: Number(progress.totalItemCount ?? progress.total_item_count ?? visible.length),
      unassignedItemCount: Number(progress.unassignedItemCount ?? progress.unassigned_item_count ?? visible.filter((item) => !item.assigned_user_id).length),
    };
  }

  function renderListPlaceholder(message) {
    const view = requireView();
    const placeholder = view.createElement("p", {
      className: "view-index-list-empty",
      text: message,
      attrs: { role: "status", "aria-live": "polite" },
    });
    listMount.replaceChildren(placeholder);
  }

  function emptyListMessage() {
    if (reusableFilter?.value === "yes") {
      return "No reusable lists match the current filters. Create a reusable checklist so routine work does not have to be rebuilt from memory.";
    }
    if (archiveFilter?.value === "archived") {
      return "No archived lists match the current filters.";
    }
    if (archiveFilter?.value === "deleted") {
      return "No deleted lists match the current filters.";
    }
    return "No lists match the current filters. Create a list or adjust filters to resume work.";
  }

  function renderDetailPrompt(message) {
    const view = requireView();
    const prompt = view.createEmptyState({
      message,
      className: "lists-empty-state",
      headingLevel: 2,
    });
    prompt.dataset.listNextAction = "";
    detailPanel.replaceChildren(prompt);
  }

  function actionButton(label, action, listId, variant = "", options = {}) {
    const view = requireView();
    const button = view.createActionButton({
      label,
      text: options.icon ? "" : undefined,
      role: variant === "secondary" ? "secondary" : "",
      disabled: Boolean(options.disabled),
      icon: options.icon,
      iconOnly: Boolean(options.icon),
      title: options.icon ? label : undefined,
    });
    if (options.itemId) {
      button.dataset.itemAction = action;
      button.dataset.itemId = options.itemId;
    } else {
      button.dataset.listAction = action;
    }
    button.dataset.listId = listId;
    if (variant) {
      button.classList.add(variant);
    }
    if (options.behavior) {
      button.dataset.surfaceAction = options.behavior;
    }
    return button;
  }

  function readonlyBadge(status) {
    const badge = document.createElement("span");
    badge.className = "lists-readonly-badge";
    badge.textContent = `${STATUS_LABELS[status] || "Read-only"}`;
    return badge;
  }

  function statusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `lists-status-badge is-${status || "unknown"}`;
    badge.textContent = STATUS_LABELS[status] || status || "Unknown";
    return badge;
  }

  function createNextActionStrip(list) {
    const view = requireView();
    const section = view.createInfoPanel({
      title: "Next",
      message: nextActionText(list),
      className: "lists-next-action",
      ariaLabel: "Next list action",
    });
    const facts = view.createElement("div", { className: "lists-next-action-facts" });

    section.dataset.listNextAction = "";
    facts.append(...stateFacts(list).map((fact) => {
      return view.createElement("span", { text: fact });
    }));
    section.appendChild(facts);
    return section;
  }

  function createCostSummaryPanel(list) {
    const view = requireView();
    const costText = listCostSummary(list);
    const section = view.createInfoPanel({
      title: "Costs",
      message: costText || "No item costs recorded.",
      className: "lists-cost-summary",
      ariaLabel: "List cost summary",
    });

    section.dataset.listCostSummary = "";
    return section;
  }

  function nextActionText(list) {
    const state = listState(list);
    if (list.status === "deleted") {
      return "Restore this list if it still belongs in the workspace.";
    }
    if (list.status === "archived") {
      return "Restore to resume work, or duplicate it as a new active list.";
    }
    if (list.status === "finalized") {
      return "Create an active working copy when this historical record should be used again.";
    }
    if (list.status === "completed") {
      return "Reopen if more work is needed, or duplicate this list for a new run.";
    }
    if (state.totalItems === 0) {
      return list.is_reusable
        ? "Add starter items so this reusable list can become a useful working copy later."
        : "Add the first item so this list is ready to use.";
    }
    if (state.incompleteItems > 0) {
      return `Resume with ${state.incompleteItems} incomplete ${state.incompleteItems === 1 ? "item" : "items"}.`;
    }
    return "Everything is checked. Complete or finalize the list when it is ready.";
  }

  function shouldShowSourceContext(list) {
    // Only surface the Source panel when it carries real provenance or usage context. For a plain
    // independent active list it would just repeat the "independent list" boilerplate already implied by
    // the badges and the Next panel, so the section is deprecated for that case.
    return Boolean(sourceContextLabel(list)) ||
      list.is_reusable ||
      list.status === "finalized" ||
      list.isBillOfMaterials ||
      list.list_type === "bill_of_materials";
  }

  function createSourceContextPanel(list) {
    const view = requireView();
    const sourceContext = sourceContextLabel(list);
    const section = view.createInfoPanel({
      title: list.is_reusable ? "Reusable workflow" : "Source",
      message: sourceContext || defaultSourceContextText(list),
      className: "lists-source-context",
      ariaLabel: "List source context",
    });

    section.dataset.listSourceContext = "";
    return section;
  }

  function sourceContextLabel(list) {
    const context = list.sourceContext || {};
    const duplicatedFrom = context.duplicatedFrom || context.duplicated_from;
    const sourceList = context.sourceList || context.source_list;

    if (duplicatedFrom?.title && sourceList?.title && duplicatedFrom.list_id !== sourceList.list_id) {
      return `Independent working copy from ${duplicatedFrom.title}; original template ${sourceList.title}.`;
    }
    if (duplicatedFrom?.title) {
      return `Independent working copy from ${duplicatedFrom.title}.`;
    }
    if (sourceList?.title) {
      return `Independent working copy from reusable source ${sourceList.title}.`;
    }
    return "";
  }

  function defaultSourceContextText(list) {
    if (list.is_reusable) {
      return "Template for repeatable work. Duplicate it to create an independent active list.";
    }
    if (list.status === "finalized" || list.isBillOfMaterials || list.list_type === "bill_of_materials") {
      return "Historical context is preserved here. Duplicate it to start new active work.";
    }
    return "This active list is independent. Future template edits will not change it.";
  }

  function duplicateActionLabel(list) {
    if (list.is_reusable) {
      return "Create Working Copy";
    }
    if (list.status === "finalized" || list.isBillOfMaterials || list.list_type === "bill_of_materials") {
      return "Duplicate into Active Work";
    }
    return "Duplicate";
  }

  function compactStateSummary(list) {
    const state = listState(list);
    const pieces = [
      `${state.checkedItems} checked`,
      `${state.incompleteItems} open`,
    ];
    if (state.nextNeededDate) {
      pieces.push(`next ${state.nextNeededDate}`);
    }
    if (state.assignedUsers > 0) {
      pieces.push(`${state.assignedUsers} assigned`);
    }
    pieces.push(state.resumeLabel);
    return pieces.join(" / ");
  }

  function listDescriptionExcerpt(list) {
    const text = String(list.description || "").trim().replace(/\s+/g, " ");
    if (!text) {
      return "";
    }
    return text.length > 96 ? `${text.slice(0, 93)}...` : text;
  }

  function linkedRecordSummary(list) {
    const links = list.links || [];
    const available = links.filter((link) => link.target?.label).length;
    const unavailable = links.length - available;
    if (links.length === 0) {
      return "";
    }
    return `${available} linked ${available === 1 ? "record" : "records"}${unavailable > 0 ? `, ${unavailable} unavailable` : ""}`;
  }

  function listTimelineSummary(list) {
    const pieces = [];
    if (list.updated_at) {
      pieces.push(`Updated ${formatDateTime(list.updated_at)}`);
    }
    if (list.finalized_at) {
      pieces.push(`Finalized ${formatDateTime(list.finalized_at)}`);
    }
    return pieces.join(" / ");
  }

  function listCostSummary(list) {
    const totals = visibleItems(list).reduce((accumulator, item) => {
      accumulator.estimated += Number(item.estimated_cost) || 0;
      accumulator.actual += Number(item.actual_cost) || 0;
      return accumulator;
    }, { actual: 0, estimated: 0 });
    const pieces = [];
    if (totals.estimated > 0) {
      pieces.push(`Estimated ${formatCurrency(totals.estimated)}`);
    }
    if (totals.actual > 0) {
      pieces.push(`Actual ${formatCurrency(totals.actual)}`);
    }
    return pieces.join(" / ");
  }

  function stateFacts(list) {
    // A short fact run for the (now half-width) Next panel: progress, the next date, and assignment.
    // The context chip lives in the meta line and the source/independent chip in the Source panel, so
    // they are no longer repeated here.
    const state = listState(list);
    return [
      `${state.checkedItems}/${state.totalItems} checked`,
      `${state.incompleteItems} incomplete`,
      state.nextNeededDate ? `Next needed ${state.nextNeededDate}` : "No needed date",
      state.assignedUsers > 0 ? `${state.assignedUsers} assigned` : "No assignee",
    ];
  }

  function listState(list) {
    const items = visibleItems(list);
    const checkedItems = list.progress
      ? Math.max(list.progress.checkedItemCount || 0, list.progress.completedItemCount || 0)
      : items.filter((item) => item.checked_at || item.completed_at).length;
    const totalItems = list.progress?.totalItemCount ?? items.length;
    const incompleteItems = Math.max(totalItems - checkedItems, 0);
    const assignedUsers = new Set(items.map((item) => item.assigned_user_id).filter(Boolean)).size;
    const nextDate = nextNeededDate(list);
    const context = listContextLabel(list);
    const interrupted = list.status === "active" && totalItems > 0 && incompleteItems > 0 && checkedItems > 0;
    const resumeLabel = interrupted ? "Resume" : STATUS_LABELS[list.status] || "Review";
    return {
      assignedUsers,
      checkedItems,
      contextLabel: context,
      incompleteItems,
      interrupted,
      nextNeededDate: nextDate,
      resumeLabel,
      totalItems,
    };
  }

  function readOnlyStateMessage(list) {
    if (list.status === "finalized") {
      return "Finalized lists are read-only. Duplicate this record to start new active work.";
    }
    if (list.status === "archived") {
      return "Archived lists are read-only. Restore or duplicate this list to resume work.";
    }
    if (list.status === "deleted") {
      return "Deleted lists are read-only. Restore this list before continuing.";
    }
    return `${STATUS_LABELS[list.status] || "Locked"} lists are read-only.`;
  }

  function listBadges(list) {
    const badges = [];
    if (list.is_reusable) {
      badges.push(badge("Reusable List", "is-reusable"));
    }
    if (list.isBillOfMaterials || list.list_type === "bill_of_materials") {
      badges.push(badge("BOM", "is-bom"));
    }
    if (list.duplicated_from_list_id) {
      badges.push(badge("Working Copy", "is-duplicated"));
    }
    return badges;
  }

  function badge(label, modifier) {
    const element = document.createElement("span");
    element.className = `lists-badge ${modifier}`;
    element.textContent = label;
    return element;
  }

  function inputField(labelText, type, name, attributes = {}) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = type;
    input.name = name;
    Object.entries(attributes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) {
        return;
      }
      input.setAttribute(key, value);
    });
    label.append(labelText, input);
    return label;
  }

  function textareaField(labelText, name, attributes = {}) {
    const label = document.createElement("label");
    const textarea = document.createElement("textarea");
    textarea.name = name;
    Object.entries(attributes).forEach(([key, value]) => {
      textarea.setAttribute(key, value);
    });
    label.append(labelText, textarea);
    return label;
  }

  function selectField(labelText, name, options) {
    const label = document.createElement("label");
    const select = document.createElement("select");
    select.name = name;
    select.append(...options);
    label.append(labelText, select);
    return label;
  }

  function applySelectDefault(node, value) {
    if (value === undefined || value === null || value === "") {
      return;
    }
    const select = node.querySelector?.("select");
    const optionEl = select ? [...select.options].find((entry) => entry.value === String(value)) : null;
    if (select && optionEl) {
      // defaultSelected so a new item starts on this option and form.reset() restores it.
      optionEl.defaultSelected = true;
      select.value = String(value);
    }
  }

  function setFormValue(form, name, value) {
    const input = form.elements[name];
    if (input) {
      if (input.type === "checkbox") {
        input.checked = value === true || value === "true";
      } else {
        input.value = value ?? "";
      }
    }
  }

  function replaceOptions(select, options) {
    if (!select) {
      return;
    }
    const previousValue = select.value;
    select.replaceChildren(...options);
    if ([...select.options].some((entry) => entry.value === previousValue)) {
      select.value = previousValue;
    }
  }

  function option(value, label) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
  }

  function selectedList() {
    return state.lists.find((list) => list.list_id === state.selectedListId) || null;
  }

  function listSelectorTitle(descriptor = activeListsViewDescriptor) {
    return descriptor?.indexPanel?.title || descriptor?.indexPanel?.label || "List Selector";
  }

  function visibleItems(list) {
    return (list.items || []).filter((item) => !item.deleted_at);
  }

  function allProjects() {
    return state.clients.flatMap((client) => (client.projects || []).map((project) => ({
      ...project,
      client_id: client.isWorkspaceScope ? "" : client.id,
      optionLabel: `${client.isWorkspaceScope ? "" : `${client.name} / `}${project.name}`,
    })));
  }

  function usesBusinessScope() {
    return state.workspaceType === "business";
  }

  function defaultListType() {
    return usesBusinessScope() ? "procurement" : "shopping";
  }

  function nextNeededDate(list) {
    if (list.progress?.earliestNeededByDate) {
      return list.progress.earliestNeededByDate;
    }
    return nextNeededDateFromItems(visibleItems(list));
  }

  function nextNeededDateFromItems(items = []) {
    return items
      .map((item) => item.needed_by_date)
      .filter(Boolean)
      .sort()[0] || "";
  }

  function itemSummary(list) {
    if (list.progress) {
      const checked = Math.max(list.progress.checkedItemCount || 0, list.progress.completedItemCount || 0);
      return `${checked}/${list.progress.totalItemCount || 0}`;
    }
    const items = visibleItems(list);
    const checked = items.filter((item) => item.checked_at || item.completed_at).length;
    return `${checked}/${items.length}`;
  }

  function listContextLabel(list) {
    const client = state.clients.find((entry) => entry.id === list.client_id);
    const project = allProjects().find((entry) => entry.id === list.project_id);
    return [client?.name, project?.name, list.is_reusable ? "Reusable" : ""].filter(Boolean).join(" / ") || "Workspace";
  }

  function detailMetaItems(list) {
    // Compact labeled meta line (Notes format): each value is a span with a "Label: value" tooltip,
    // separated by " - ", instead of the long pre-labeled run the header used to print.
    const items = [
      ["Status", STATUS_LABELS[list.status] || list.status],
      ["Type", LIST_TYPE_LABELS[list.list_type] || list.list_type],
      ["Context", listContextLabel(list)],
      ["Created", list.created_at ? formatDateTime(list.created_at) : ""],
      ["Updated", list.updated_at ? formatDateTime(list.updated_at) : ""],
      ["Finalized", list.finalized_at ? formatDateTime(list.finalized_at) : ""],
    ].filter(([, value]) => value);

    return items.flatMap(([label, value], index) => {
      const item = document.createElement("span");
      const nodes = [];

      item.textContent = value;
      item.title = `${label}: ${value}`;
      item.setAttribute("aria-label", `${label}: ${value}`);
      nodes.push(item);
      if (index < items.length - 1) {
        nodes.push(document.createTextNode(" - "));
      }
      return nodes;
    });
  }

  function displayUser(user) {
    if (!user) {
      return "";
    }
    return user.display_name || user.displayName || user.username || user.user_id || "";
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "";
    }
    return new Intl.NumberFormat(undefined, {
      currency: "USD",
      maximumFractionDigits: 2,
      style: "currency",
    }).format(number);
  }

  function setStatus(message, isError = false) {
    if (!statusMessage) {
      return;
    }
    statusMessage.textContent = message;
    statusMessage.classList.toggle("is-error", isError);
  }
})();
