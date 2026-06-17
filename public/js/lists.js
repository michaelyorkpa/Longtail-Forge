const api = window.LongtailForge.api;

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
const TASK_STATUS_LABELS = {
  archived: "Archived",
  blocked: "Blocked",
  complete: "Complete",
  in_progress: "In Progress",
  open: "Open",
};
const LIST_LINK_TYPE_LABELS = {
  client: "Client",
  note: "Note",
  project: "Project",
  task: "Task",
};

const view = window.LongtailForge?.view;
let activeListsViewDescriptor = null;

buildListsViewShell();

const pageTitle = document.querySelector("[data-lists-title]");
const createButton = document.querySelector("[data-list-create]");
const statusMessage = document.querySelector("[data-lists-status]");
const filtersForm = document.querySelector("[data-lists-filters]");
const statusFilter = document.querySelector("[data-list-filter-status]");
const typeFilter = document.querySelector("[data-list-filter-type]");
const reusableFilter = document.querySelector("[data-list-filter-reusable]");
const clientFilter = document.querySelector("[data-list-filter-client]");
const projectFilter = document.querySelector("[data-list-filter-project]");
const assigneeFilter = document.querySelector("[data-list-filter-assignee]");
const neededFilter = document.querySelector("[data-list-filter-needed]");
const archiveFilter = document.querySelector("[data-list-filter-archive]");
const sortSelect = document.querySelector("[data-list-sort]");
const indexPanel = document.querySelector("[data-lists-index-panel]");
const countLabel = document.querySelector("[data-lists-count]");
const listMount = document.querySelector("[data-lists-list]");
const detailPanel = document.querySelector("[data-list-detail]");
const listDialog = document.querySelector("[data-list-dialog]");
const listForm = document.querySelector("[data-list-form]");
const listDialogTitle = document.querySelector("[data-list-dialog-title]");
const listDialogClose = document.querySelector("[data-list-dialog-close]");
const listTitleInput = document.querySelector("[data-list-title]");
const listTypeInput = document.querySelector("[data-list-type]");
const listClientInput = document.querySelector("[data-list-client]");
const listProjectInput = document.querySelector("[data-list-project]");
const listDescriptionInput = document.querySelector("[data-list-description]");
const listFormStatus = document.querySelector("[data-list-form-status]");
const listCancelButton = document.querySelector("[data-list-cancel]");
const listSaveButton = document.querySelector("[data-list-save]");
const itemDialog = document.querySelector("[data-list-item-dialog]");
const itemDialogForm = document.querySelector("[data-list-item-form]");
const itemDialogTitle = document.querySelector("[data-list-item-dialog-title]");
const itemDialogClose = document.querySelector("[data-list-item-dialog-close]");
const itemDialogCancel = document.querySelector("[data-list-item-cancel]");
const itemDialogSave = document.querySelector("[data-list-item-save]");
const itemDialogFormStatus = document.querySelector("[data-list-item-form-status]");

let state = {
  clients: [],
  currentUserId: "",
  editingListId: "",
  itemDialogList: null,
  itemSuggestions: new Map(),
  lists: [],
  selectedListId: new URLSearchParams(window.location.search).get("list") || "",
  taskLinkTargets: [],
  users: [],
  workspaceType: "business",
};

if (!createButton?.dataset.surfaceAction) {
  createButton?.addEventListener("click", () => openListDialog());
}
filtersForm?.addEventListener("change", () => refreshLists());
sortSelect?.addEventListener("change", () => refreshLists());
listForm?.addEventListener("submit", saveList);
listDialogClose?.addEventListener("click", closeListDialog);
listCancelButton?.addEventListener("click", closeListDialog);
itemDialogForm?.addEventListener("submit", saveItem);
itemDialogClose?.addEventListener("click", closeItemDialog);
itemDialogCancel?.addEventListener("click", closeItemDialog);
listClientInput?.addEventListener("change", () => populateProjectOptions(listProjectInput, listClientInput.value));
listProjectInput?.addEventListener("change", syncClientFromProject);
listTypeInput?.addEventListener("change", () => setContextControlsVisible(shouldShowContextControls(listTypeInput.value)));
detailPanel?.addEventListener("click", handleDetailClick);
detailPanel?.addEventListener("submit", handleDetailSubmit);

initialize();

function buildListsViewShell() {
  const host = document.querySelector("[data-lists-host]");
  if (!host || host.querySelector("[data-lists-title]")) {
    return;
  }
  if (!view) {
    throw new Error("Lists requires LongtailForge.view to build the protected workspace.");
  }
  registerListsViewBehaviors();

  activeListsViewDescriptor = listsViewSurfaceDescriptor();
  // The renderer auto-renders descriptor.modals into the surface; Lists builds and owns its own
  // dialog (createListDialogShell), so suppress the framework duplicate modal shells.
  const renderDescriptor = {
    ...activeListsViewDescriptor,
    dataSource: null,
    modals: [],
  };
  const surface = view.renderSurface(renderDescriptor, host);
  decorateListsDeclarativeSurface(surface, renderDescriptor);
  document.body.appendChild(createListDialogShell());
  document.body.appendChild(createItemDialogShell());
}

function registerListsViewBehaviors() {
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
    view.registerBehavior(behaviorId, ({ record }) => runRegisteredListBehavior(action, record));
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

function resolveListRecord(record) {
  const listId = record?.list_id || record?.id || record?._source?.list_id || record?._source?.id || state.selectedListId;
  return state.lists.find((entry) => entry.list_id === listId) || selectedList();
}

function listsViewSurfaceDescriptor() {
  const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
  return surfaces.find((surface) => surface.id === "lists.workspace" && surface.moduleId === "lists") || fallbackListsViewSurfaceDescriptor();
}

function fallbackListsViewSurfaceDescriptor() {
  return {
    id: "lists.workspace",
    moduleId: "lists",
    viewId: "lists",
    layout: "stacked",
    pageHeader: {
      title: "Lists",
      primaryAction: {
        id: "create-list",
        label: "Create List",
        role: "primary",
        behavior: "lists.create",
      },
    },
    filters: [
      descriptorSelect("status", "Status", [["active", "Active", true], ["completed", "Completed"], ["finalized", "Finalized"], ["archived", "Archived"], ["deleted", "Deleted"], ["all", "All visible"]]),
      descriptorSelect("listType", "Type", [["all", "All types", true], ...Object.entries(LIST_TYPE_LABELS).map(([value, label]) => [value, label])]),
      descriptorSelect("reusable", "Reusable", [["no", "Normal lists", true], ["yes", "Reusable only"], ["all", "All"]]),
      descriptorSelect("clientId", "Client", [["all", "All clients", true]]),
      descriptorSelect("projectId", "Project", [["all", "All projects", true]]),
      descriptorSelect("assigneeId", "Assigned", [["all", "All assignees", true]]),
      { id: "needed-filter", field: "neededByDate", type: "date", label: "Needed By" },
      descriptorSelect("archiveState", "Archived State", [["current", "Current", true], ["archived", "Archived"], ["deleted", "Deleted"], ["all", "All states"]]),
      descriptorSelect("sort", "Sort", [["updated_desc", "Updated", true], ["title_asc", "Title"], ["type_asc", "Type"], ["status_asc", "Status"], ["needed_asc", "Needed Date"], ["finalized_desc", "Finalized Date"]]),
    ],
    indexPanel: {
      title: "List Selector",
      initialSelection: "none",
      collapseOnSelect: true,
      emptyState: {
        message: "No lists match the current filters.",
      },
    },
    detail: {
      header: {
        title: "Selected list",
        description: "Choose a list to inspect.",
      },
      summaryPanels: [
        { title: "Next", description: "List progress and next action context." },
        { title: "Source", description: "Template and working-copy context." },
        { title: "Costs", description: "Estimated and actual item costs." },
        { title: "Linked Records", description: "Task, note, project, and client links." },
      ],
      actionStrip: listsWorkflowActionStripDescriptor(),
      linkedRecords: listsLinkedRecordsDescriptor(),
      emptyState: {
        message: "Select a list to review its context.",
      },
      itemForm: listsItemFormDescriptor(),
      itemRows: listsItemRowsDescriptor(),
    },
    modals: [listsModalDescriptor()],
    dataSource: {
      route: "/api/lists",
      method: "GET",
      fieldBindings: {
        id: "list_id",
        title: "title",
      },
    },
  };
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

function listsLinkedRecordsDescriptor() {
  return {
    title: "Linked Records",
    recordsField: "links",
    targetTypeField: "target_type",
    targetLabelField: "target.label",
    targetUrlField: "target.url",
    targetIdField: "list_link_id",
    emptyState: {
      message: "No linked records yet.",
    },
    fields: [
      { field: "target_type", type: "select", label: "Type", default: "task", options: [["task", "Task"], ["note", "Note"], ["project", "Project"], ["client", "Client"]] },
      { field: "task_search", type: "search", label: "Search tasks", placeholder: "Search tasks", autocomplete: "off", behavior: "lists.link.task-search" },
      { field: "task_picker", type: "select", label: "Task", optionsSource: "taskLinkTargets", behavior: "lists.link.task-picker" },
      { field: "target_id", type: "text", label: "Record ID", required: true, placeholder: "Paste record ID", behavior: "lists.link.raw-record-id" },
    ],
    actions: [
      { id: "add-link", label: "Add Link", role: "primary", behavior: "lists.link.add" },
      { id: "remove-link", label: "Remove", role: "destructive", behavior: "lists.link.remove" },
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
      { field: "vendor_name", type: "text", label: "Vendor or Store", placement: "advanced" },
      { field: "url", type: "url", label: "URL", placement: "advanced" },
      { field: "estimated_cost", type: "number", label: "Estimated Cost", min: "0", step: "0.01", placement: "advanced" },
      { field: "actual_cost", type: "number", label: "Actual Cost", min: "0", step: "0.01", placement: "advanced" },
      { field: "tracking_id", type: "text", label: "Tracking ID", placement: "advanced" },
      { field: "notes", type: "textarea", label: "Notes", rows: "2", width: "full" },
      { field: "save_to_catalog", type: "checkbox", label: "Save as reusable item", default: "true" },
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
    fields: [
      { field: "title", type: "text", label: "Title", required: true },
      { field: "list_type", type: "select", label: "Type", options: Object.entries(LIST_TYPE_LABELS).map(([value, label]) => [value, label]) },
      { field: "client_id", type: "select", label: "Client", optionsSource: "clients" },
      { field: "project_id", type: "select", label: "Project", optionsSource: "projects" },
      { field: "description", type: "textarea", label: "Description", rows: "4" },
    ],
    footerActions: [
      { id: "cancel-list", label: "Cancel", role: "secondary", behavior: "lists.modal.cancel" },
      { id: "save-list", label: "Save List", role: "primary", behavior: "lists.modal.save" },
    ],
  };
}

function descriptorSelect(field, label, options) {
  return {
    id: `${field}-filter`,
    field,
    type: "select",
    label,
    options,
  };
}

function decorateListsDeclarativeSurface(surface, descriptor = activeListsViewDescriptor) {
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

  const filterPanel = surface.querySelector(".view-filter-panel");
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

  const workspace = surface.querySelector(".view-stacked");
  workspace?.classList.add("lists-workspace");

  const indexPanel = surface.querySelector(".view-collapsible-index");
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

  const detail = surface.querySelector(".view-stacked-detail");
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
  const modal = listsEditorModalDescriptor();
  const title = listModalField("title", "listTitle", { required: true });
  const type = listModalField("list_type", "listType");
  const client = listModalField("client_id", "listClient", {}, { listBusinessControl: "" }, []);
  const project = listModalField("project_id", "listProject", {}, { listContextControl: "" }, []);
  const contextFields = view.renderDescriptorFieldGrid({ fields: modal.fields || [] }, {
    surface: false,
    className: "lists-form-grid",
    fields: [type, client, project],
  });
  const description = listModalField("description", "listDescription");
  const formStatus = view.createStatusMessage({ className: "lists-form-status" });
  formStatus.dataset.listFormStatus = "";

  const cancelAction = modal.footerActions?.find((action) => action.id === "cancel-list") || {};
  const saveAction = modal.footerActions?.find((action) => action.id === "save-list") || {};
  const cancel = view.createActionButton({ label: cancelAction.label || "Cancel", role: cancelAction.role || "secondary" });
  cancel.dataset.listCancel = "";
  const save = view.createActionButton({ label: saveAction.label || "Save List", type: "submit", role: saveAction.role || "primary" });
  save.dataset.listSave = "";

  const dialog = view.renderDescriptorModalForm(modal, {
    className: "lists-dialog",
    formClassName: "lists-form",
    fields: [title, contextFields, description, formStatus],
    actions: [cancel, save],
  });
  dialog.dataset.listDialog = "";
  dialog.viewParts.form.dataset.listForm = "";
  dialog.viewParts.title.dataset.listDialogTitle = "";

  const close = view.createActionButton({ label: "Close", className: "lists-dialog-close" });
  close.dataset.listDialogClose = "";
  const heading = view.createElement("div", {
    className: "lists-dialog-heading",
    children: [dialog.viewParts.title, close],
  });
  dialog.viewParts.form.insertBefore(heading, dialog.viewParts.body);
  return dialog;
}

function listsEditorModalDescriptor() {
  return listsViewSurfaceDescriptor().modals?.find((modal) => modal.id === "list-editor") || listsModalDescriptor();
}

function listModalField(fieldName, dataName, attrs = {}, wrapperDataset = {}, optionEntries = null) {
  const field = listsEditorModalDescriptor().fields?.find((entry) => entry.field === fieldName) || {};
  if (field.type === "textarea") {
    return textareaControl(field.label || fieldName, dataName, {
      rows: field.rows,
      ...attrs,
    }, wrapperDataset);
  }
  if (field.type === "select") {
    return selectControl(
      field.label || fieldName,
      dataName,
      optionEntries || optionsFromDescriptor(field),
      wrapperDataset,
    );
  }
  return inputControl(field.label || fieldName, field.type || "text", dataName, {
    required: field.required,
    min: field.min,
    step: field.step,
    autocomplete: field.autocomplete,
    ...attrs,
  }, wrapperDataset);
}

function inputControl(labelText, type, dataName, attributes = {}, wrapperDataset = {}) {
  const label = view.createElement("label", { dataset: wrapperDataset });
  const input = view.createElement("input", { attrs: attributes });
  input.type = type;
  input.dataset[dataName] = "";
  label.append(labelText, input);
  return label;
}

function textareaControl(labelText, dataName, attributes = {}, wrapperDataset = {}) {
  const label = view.createElement("label", { dataset: wrapperDataset });
  const textarea = view.createElement("textarea", { attrs: attributes });
  textarea.dataset[dataName] = "";
  label.append(labelText, textarea);
  return label;
}

function selectControl(labelText, dataName, entries = [], wrapperDataset = {}) {
  const label = view.createElement("label", { dataset: wrapperDataset });
  const select = document.createElement("select");
  select.dataset[dataName] = "";
  select.append(...entries.map(([value, text, selected]) => {
    const entry = option(value, text);
    entry.selected = Boolean(selected);
    return entry;
  }));
  label.append(labelText, select);
  return label;
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

async function loadOptions() {
  const [clientProjects, users, taskLinkTargets] = await Promise.all([
    loadClientProjects(),
    loadUsers(),
    loadTaskLinkTargets(),
  ]);

  state.clients = window.LongtailForge.clientProjectOptions.normalizeClients(clientProjects);
  state.taskLinkTargets = taskLinkTargets;
  state.users = users.users || [];
}

async function loadClientProjects() {
  try {
    return await api.getJson("/api/client-projects", { cache: "no-store" });
  } catch {
    return { clients: [], workspaceProjects: [] };
  }
}

async function loadUsers() {
  try {
    return await api.getJson("/api/users", { cache: "no-store" });
  } catch {
    return { users: [] };
  }
}

async function loadTaskLinkTargets() {
  try {
    const result = await api.getJson("/api/tasks?status=active&sort=updated_desc", { cache: "no-store" });
    return result.tasks || [];
  } catch {
    return [];
  }
}

async function loadLists() {
  const result = await api.getJson(`/api/lists?${buildListQueryParams()}`, { cache: "no-store" });
  const summaries = result.lists || [];
  const details = await Promise.all(summaries.map((list) => loadListDetail(list.list_id || list.id, list)));
  state.lists = details.filter(Boolean);
}

async function loadListDetail(listId, fallback = null) {
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
  if (!list) {
    renderDetailPrompt("Select a list.");
    return;
  }

  const locked = list.status === "archived" || list.status === "deleted" || list.status === "finalized";
  const article = view.createElement("section", { className: "lists-detail-content" });
  const header = createListDetailHeader(list, locked);
  const nextAction = createNextActionStrip(list);
  const sourceContext = shouldShowSourceContext(list) ? createSourceContextPanel(list) : null;
  const linkedRecords = createLinkedRecordsPanel(list, locked);
  const costSummary = createCostSummaryPanel(list);
  const description = view.createElement("p", { className: "lists-description" });
  const itemsHeader = createItemsHeader(list, locked);
  const items = view.createElement("div", { className: "lists-items" });

  description.textContent = list.description || "No description.";
  items.appendChild(createItemsTable(list, locked));

  // Reorganized detail order: identity (header) -> what it is (description) -> what to do next ->
  // provenance (only when meaningful) -> linked records -> Items heading + Add Item -> the items table ->
  // the cost rollup beneath the items it totals. The add/edit item form opens as a modal.
  article.append(...[header, description, nextAction, sourceContext, linkedRecords, itemsHeader, items, costSummary].filter(Boolean));
  detailPanel.replaceChildren(article);
}

function createListDetailHeader(list, locked) {
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
  return view.renderDescriptorActionMenu(detailActionButtons(list, locked), {
    summaryLabel: "...",
    ariaLabel: label,
    title: label,
  });
}

function listsActionStripSurfaceDescriptor() {
  return listsViewSurfaceDescriptor().detail?.actionStrip || listsWorkflowActionStripDescriptor();
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
  // The item form now lives in a modal; the detail just carries an "Items" heading and an Add Item button
  // that opens it (or a read-only notice when the list is locked).
  const descriptor = listsItemFormSurfaceDescriptor();
  const title = view.createElement("h3", { text: descriptor.title || "Items" });
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
  const descriptor = listsItemFormSurfaceDescriptor();
  const name = createItemFieldFromDescriptor(itemFormField("item_name"));
  const catalogItemId = createItemFieldFromDescriptor(itemFormField("catalog_item_id"));
  const sideBySide = view.renderDescriptorFieldGrid({ fields: [] }, {
    surface: false,
    className: "lists-item-fields",
    fields: ["quantity", "unit", "needed_by_date", "assigned_user_id", "purchase_status"]
      .map((fieldName) => createItemFieldFromDescriptor(itemFormField(fieldName))),
  });
  const advancedDescriptorFields = (descriptor.fields || []).filter((field) => field.placement === "advanced");
  const advanced = view.createElement("details", { className: "lists-item-advanced" });
  const advancedSummary = view.createElement("summary", { text: "Details" });
  const advancedFields = view.renderDescriptorFieldGrid({ fields: advancedDescriptorFields }, {
    surface: false,
    className: "lists-item-advanced-fields",
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

  const dialog = view.renderDescriptorModalForm(descriptor, {
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
    className: "lists-dialog-heading",
    children: [dialog.viewParts.title, close],
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
  return listsViewSurfaceDescriptor().detail?.itemForm || listsItemFormDescriptor();
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
  const table = view.renderDescriptorDataTable(descriptor, {
    rows: [],
    emptyMessage: descriptor.emptyState?.message || "No items yet.",
    className: "lists-items-table-wrap",
    tableClassName: "list-table lists-items-table",
  });
  const tbody = table.querySelector("tbody");

  if (items.length > 0) {
    tbody.replaceChildren(...items.map((item, index) => createItemRow(list, item, index, items.length, locked)));
  }

  return table;
}

function listsItemRowsSurfaceDescriptor() {
  return listsViewSurfaceDescriptor().detail?.itemRows || listsItemRowsDescriptor();
}

function createLinkedRecordsPanel(list, locked) {
  const descriptor = listsLinkedRecordsSurfaceDescriptor();
  const targetType = createLinkedRecordField(linkedRecordField("target_type"), linkTargetTypeOptions());
  const taskSearch = createLinkedRecordField(linkedRecordField("task_search"));
  const taskPicker = createLinkedRecordField(linkedRecordField("task_picker"), []);
  const targetId = createLinkedRecordField(linkedRecordField("target_id"));
  const targetTypeSelect = targetType.querySelector("select");
  const taskSearchInput = taskSearch.querySelector("input");
  const taskPickerSelect = taskPicker.querySelector("select");
  const targetIdInput = targetId.querySelector("input");
  const addAction = descriptor.actions?.find((action) => action.id === "add-link") || {};
  const submit = view.createActionButton({
    icon: "add",
    iconOnly: true,
    label: addAction.label || "Add Link",
    title: addAction.label || "Add Link",
    type: "submit",
    role: addAction.role || "primary",
    action: addAction.behavior || addAction.id,
  });
  const section = view.renderDescriptorLinkedRecordsPanel(descriptor, {
    className: "lists-links-panel",
    collapsible: true,
    open: false,
    recordsClassName: "lists-link-list",
    formClassName: "lists-link-form view-field-grid surface-modal-section-body",
    formDataset: {
      listLinkForm: "",
      listId: list.list_id,
    },
    formFields: [targetType, taskSearch, taskPicker, targetId],
    formActions: [submit],
    locked,
    emptyClassName: "lists-empty-state",
  });
  const form = section.querySelector("[data-list-link-form]");

  section.dataset.listLinksPanel = "";
  section.querySelector(".lists-link-list")?.replaceChildren(...linkRecordNodes(list, descriptor, locked));

  taskSearch.dataset.listTaskPickerControl = "";
  taskPicker.dataset.listTaskPickerControl = "";
  targetId.dataset.listRawLinkControl = "";
  taskPickerSelect.dataset.listTaskPicker = "";
  taskSearchInput.addEventListener("input", () => populateTaskLinkPicker(taskPickerSelect, taskSearchInput.value));
  taskPickerSelect.addEventListener("change", () => {
    targetIdInput.value = taskPickerSelect.value;
  });
  targetTypeSelect.addEventListener("change", () => {
    targetIdInput.value = "";
    syncLinkPickerMode(form);
  });
  populateTaskLinkPicker(taskPickerSelect);
  syncLinkPickerMode(form);
  return section;
}

function listsLinkedRecordsSurfaceDescriptor() {
  return listsViewSurfaceDescriptor().detail?.linkedRecords || listsLinkedRecordsDescriptor();
}

function linkedRecordField(fieldName) {
  return listsLinkedRecordsSurfaceDescriptor().fields?.find((field) => field.field === fieldName) || { field: fieldName, type: "text", label: fieldName };
}

function createLinkedRecordField(field, optionEntries = null) {
  if (field.type === "select") {
    return selectField(field.label || field.field, field.field, optionEntries || optionsFromDescriptor(field).map(([value, label]) => option(value, label)));
  }
  return inputField(field.label || field.field, field.type || "text", field.field, {
    autocomplete: field.autocomplete,
    placeholder: field.placeholder,
    required: field.required,
  });
}

function linkRecordNodes(list, descriptor, locked) {
  const links = list.links || [];
  if (links.length === 0) {
    return [view.createElement("p", {
      className: "lists-empty-state",
      text: descriptor.emptyState?.message || "No linked records yet.",
    })];
  }
  return links.map((link) => createLinkItem(list, link, locked));
}

function linkTargetTypeOptions() {
  return [
    option("task", "Task"),
    option("note", "Note"),
    option("project", "Project"),
    ...(usesBusinessScope() ? [option("client", "Client")] : []),
  ];
}

function syncLinkPickerMode(form) {
  const targetType = form.elements.target_type?.value || "task";
  const taskControls = form.querySelectorAll("[data-list-task-picker-control]");
  const rawControl = form.querySelector("[data-list-raw-link-control]");
  const targetIdInput = form.elements.target_id;
  const taskPicker = form.elements.task_picker;
  const usesTaskPicker = targetType === "task";

  taskControls.forEach((control) => {
    control.hidden = !usesTaskPicker;
  });
  if (rawControl) {
    rawControl.hidden = usesTaskPicker;
  }
  if (targetIdInput) {
    targetIdInput.required = !usesTaskPicker;
    targetIdInput.value = usesTaskPicker ? taskPicker?.value || "" : targetIdInput.value;
  }
}

function populateTaskLinkPicker(select, search = "") {
  if (!select) {
    return;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const tasks = state.taskLinkTargets
    .filter((task) => taskMatchesLinkSearch(task, normalizedSearch))
    .slice(0, 40);

  replaceOptions(select, [
    option("", tasks.length > 0 ? "Select a task" : "No matching tasks"),
    ...tasks.map((task) => option(task.task_id, taskLinkOptionLabel(task))),
  ]);
  if (select.form?.elements.target_type?.value === "task" && select.form.elements.target_id) {
    select.form.elements.target_id.value = select.value;
  }
}

function taskMatchesLinkSearch(task, search) {
  if (!search) {
    return true;
  }

  return [
    task.title,
    task.client_name,
    task.project_name,
    task.status,
    task.priority,
    task.due_date,
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

function taskLinkOptionLabel(task = {}) {
  const context = [task.client_name, task.project_name].filter(Boolean).join(" / ");
  const meta = [context, TASK_STATUS_LABELS[task.status] || task.status, task.due_date ? `due ${task.due_date}` : ""].filter(Boolean).join(" - ");
  return `${task.title || "Untitled task"}${meta ? ` (${meta})` : ""}`;
}

function createLinkItem(list, link, locked) {
  const item = view.createElement("div", { className: "lists-link-item" });
  const label = view.createElement("span");
  const anchor = view.createElement("a");
  const removeAction = listsLinkedRecordsSurfaceDescriptor().actions?.find((action) => action.id === "remove-link") || {};
  const remove = actionButton(removeAction.label || "Remove", removeAction.id || "remove-link", list.list_id, removeAction.role === "destructive" ? "secondary" : "", {
    disabled: locked,
    behavior: removeAction.behavior,
    icon: "delete",
  });
  const target = link.target || {};
  const typeLabel = LIST_LINK_TYPE_LABELS[link.target_type] || formatToken(link.target_type);
  const unavailable = !target.label;

  item.dataset.linkAccess = unavailable ? "unavailable" : "available";
  anchor.href = target.url || "#";
  anchor.textContent = target.label || "Unavailable linked record";
  if (!target.url) {
    anchor.removeAttribute("href");
  }
  label.append(`${typeLabel}: `, anchor);
  remove.dataset.linkId = link.list_link_id;
  remove.hidden = locked;
  item.append(label, remove);
  return item;
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
  const menu = view.renderDescriptorActionMenu(
    [rowActionButton("edit-item", { menu: true }), rowActionButton("delete-item", { menu: true })],
    { summaryLabel: "...", ariaLabel, title: "Item actions" },
  );
  return view.renderDescriptorInlineActions(
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

function openListDialog(list = null) {
  state.editingListId = list?.list_id || "";
  listDialogTitle.textContent = list ? "Edit List" : "Create List";
  listTitleInput.value = list?.title || "";
  listDescriptionInput.value = list?.description || "";
  listTypeInput.value = list?.list_type || defaultListType();
  setContextControlsVisible(shouldShowContextControls(listTypeInput.value));
  populateClientOptions(list?.client_id || "");
  populateProjectOptions(listProjectInput, list?.client_id || "", list?.project_id || "");
  listFormStatus.textContent = "";
  listSaveButton.textContent = list ? "Save List" : "Create List";
  if (typeof listDialog.showModal === "function") {
    listDialog.showModal();
  } else {
    listDialog.setAttribute("open", "open");
  }
  listTitleInput.focus();
}

function closeListDialog() {
  listDialog.close?.();
  listDialog.removeAttribute("open");
}

async function saveList(event) {
  event.preventDefault();
  const payload = {
    client_id: usesBusinessScope() ? listClientInput.value : "",
    description: listDescriptionInput.value,
    list_type: listTypeInput.value,
    project_id: listProjectInput.value,
    title: listTitleInput.value,
  };

  try {
    listSaveButton.disabled = true;
    listFormStatus.textContent = "Saving...";
    if (state.editingListId) {
      await api.putJson(`/api/lists/${encodeURIComponent(state.editingListId)}`, payload);
    } else {
      const result = await api.postJson("/api/lists", payload);
      state.selectedListId = result.list?.list_id || state.selectedListId;
    }
    closeListDialog();
    await refreshLists(state.selectedListId);
    setStatus("");
  } catch (error) {
    listFormStatus.textContent = error.message || "List could not be saved.";
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
  const prompt = view.createEmptyState({
    message,
    className: "lists-empty-state",
    headingLevel: 2,
  });
  prompt.dataset.listNextAction = "";
  detailPanel.replaceChildren(prompt);
}

function actionButton(label, action, listId, variant = "", options = {}) {
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
