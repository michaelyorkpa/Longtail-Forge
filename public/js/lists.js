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
const LIST_LINK_TYPE_LABELS = {
  client: "Client",
  note: "Note",
  project: "Project",
  task: "Task",
};

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
const countLabel = document.querySelector("[data-lists-count]");
const listTableBody = document.querySelector("[data-lists-list]");
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

let state = {
  clients: [],
  currentUserId: "",
  editingListId: "",
  itemSuggestions: new Map(),
  lists: [],
  selectedListId: new URLSearchParams(window.location.search).get("list") || "",
  users: [],
  workspaceType: "business",
};

createButton?.addEventListener("click", () => openListDialog());
filtersForm?.addEventListener("change", renderLists);
sortSelect?.addEventListener("change", renderLists);
listForm?.addEventListener("submit", saveList);
listDialogClose?.addEventListener("click", closeListDialog);
listCancelButton?.addEventListener("click", closeListDialog);
listClientInput?.addEventListener("change", () => populateProjectOptions(listProjectInput, listClientInput.value));
listProjectInput?.addEventListener("change", syncClientFromProject);
listTypeInput?.addEventListener("change", () => setContextControlsVisible(shouldShowContextControls(listTypeInput.value)));
detailPanel?.addEventListener("click", handleDetailClick);
detailPanel?.addEventListener("submit", handleDetailSubmit);

initialize();

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
  const [clientProjects, users] = await Promise.all([
    usesBusinessScope() ? loadClientProjects() : Promise.resolve({ clients: [] }),
    loadUsers(),
  ]);

  state.clients = usesBusinessScope()
    ? window.LongtailForge.clientProjectOptions.normalizeClients(clientProjects)
    : [];
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

async function loadLists() {
  const result = await api.getJson("/api/lists?includeDeleted=true", { cache: "no-store" });
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
  const lists = sortedLists(filteredLists());

  countLabel.textContent = `${lists.length} ${lists.length === 1 ? "List" : "Lists"}`;
  listTableBody.replaceChildren();

  if (lists.length === 0) {
    renderListPlaceholder(emptyListMessage());
    if (!selectedList()) {
      renderDetailPrompt("Create a list or adjust filters to resume one.");
    }
    return;
  }

  lists.forEach((list) => listTableBody.appendChild(createListRow(list)));

  if (!selectedList() || !lists.some((list) => list.list_id === state.selectedListId)) {
    selectList(lists[0].list_id, { updateUrl: false });
  } else {
    renderDetail(selectedList());
  }
}

function filteredLists() {
  const statusValue = statusFilter?.value || "active";
  const typeValue = typeFilter?.value || "all";
  const reusableValue = reusableFilter?.value || "no";
  const clientValue = usesBusinessScope() ? clientFilter?.value || "all" : "all";
  const projectValue = projectFilter?.value || "all";
  const assigneeValue = assigneeFilter?.value || "all";
  const neededValue = neededFilter?.value || "";
  const archiveValue = archiveFilter?.value || "current";

  return state.lists.filter((list) => {
    const statusMatch = statusValue === "all" || list.status === statusValue;
    const typeMatch = typeValue === "all" || list.list_type === typeValue;
    const reusableMatch = reusableValue === "all" ||
      (reusableValue === "yes" ? list.is_reusable === true : list.is_reusable !== true);
    const clientMatch = clientValue === "all" || (list.client_id || "") === clientValue;
    const projectMatch = projectValue === "all" || (list.project_id || "") === projectValue;
    const assigneeMatch = assigneeValue === "all" ||
      (assigneeValue === "me"
        ? list.items.some((item) => (item.assigned_user_id || "") === state.currentUserId)
        : list.items.some((item) => (item.assigned_user_id || "") === assigneeValue));
    const neededMatch = !neededValue || list.items.some((item) => item.needed_by_date === neededValue);
    const archiveMatch = archiveValue === "all" ||
      (archiveValue === "current" ? !["archived", "deleted"].includes(list.status) : list.status === archiveValue);

    return statusMatch && typeMatch && reusableMatch && clientMatch && projectMatch && assigneeMatch && neededMatch && archiveMatch;
  });
}

function sortedLists(lists) {
  const sortValue = sortSelect?.value || "updated_desc";
  const copy = [...lists];

  copy.sort((left, right) => {
    if (sortValue === "title_asc") {
      return compareText(left.title, right.title);
    }
    if (sortValue === "type_asc") {
      return compareText(left.list_type, right.list_type) || compareText(left.title, right.title);
    }
    if (sortValue === "status_asc") {
      return compareText(left.status, right.status) || compareText(left.title, right.title);
    }
    if (sortValue === "needed_asc") {
      return compareText(nextNeededDate(left), nextNeededDate(right)) || compareText(left.title, right.title);
    }
    if (sortValue === "finalized_desc") {
      return compareText(right.finalized_at, left.finalized_at) || compareText(left.title, right.title);
    }

    return compareText(right.updated_at, left.updated_at) || compareText(left.title, right.title);
  });

  return copy;
}

function createListRow(list) {
  const row = document.createElement("tr");
  const titleCell = document.createElement("td");
  const titleButton = document.createElement("button");
  const badges = document.createElement("span");
  const meta = document.createElement("span");
  const summary = document.createElement("span");
  const statusCell = document.createElement("td");
  const typeCell = document.createElement("td");
  const neededCell = document.createElement("td");
  const itemsCell = document.createElement("td");

  row.dataset.listId = list.list_id;
  row.className = list.list_id === state.selectedListId ? "is-selected" : "";
  titleButton.type = "button";
  titleButton.className = "lists-row-title";
  titleButton.textContent = list.title || "Untitled list";
  titleButton.addEventListener("click", () => selectList(list.list_id));
  badges.className = "lists-badges";
  badges.append(...listBadges(list));
  meta.className = "lists-row-meta";
  meta.textContent = listContextLabel(list);
  summary.className = "lists-state-summary";
  summary.dataset.listStateSummary = "";
  summary.textContent = compactStateSummary(list);
  titleCell.append(titleButton, badges, meta, summary);
  statusCell.appendChild(statusBadge(list.status));
  typeCell.textContent = LIST_TYPE_LABELS[list.list_type] || list.list_type || "";
  neededCell.textContent = nextNeededDate(list) || "-";
  itemsCell.textContent = itemSummary(list);
  row.append(titleCell, statusCell, typeCell, neededCell, itemsCell);
  return row;
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
  listTableBody.querySelectorAll("tr").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.listId === state.selectedListId);
  });
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
  const article = document.createElement("section");
  const header = document.createElement("div");
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  const badges = document.createElement("span");
  const meta = document.createElement("p");
  const actions = document.createElement("div");
  const nextAction = createNextActionStrip(list);
  const sourceContext = createSourceContextPanel(list);
  const linkedRecords = createLinkedRecordsPanel(list, locked);
  const description = document.createElement("p");
  const itemForm = createItemForm(list, locked);
  const items = document.createElement("div");

  header.className = "lists-detail-header";
  heading.className = "lists-detail-heading";
  title.textContent = list.title || "Untitled list";
  badges.className = "lists-badges";
  badges.append(...listBadges(list));
  meta.textContent = detailMeta(list);
  heading.append(title, badges, meta);
  actions.className = "lists-detail-actions";
  actions.append(...detailActionButtons(list, locked));
  header.append(heading, actions);

  description.className = "lists-description";
  description.textContent = list.description || "No description.";
  items.className = "lists-items";
  items.appendChild(createItemsTable(list, locked));

  article.append(header, nextAction, sourceContext, linkedRecords, description, itemForm, items);
  detailPanel.replaceChildren(article);
  void loadItemSuggestions(list).then(() => updateSuggestionDatalist(itemForm, list));
}

function detailActionButtons(list, locked) {
  const buttons = [];

  if (list.status !== "deleted") {
    buttons.push(actionButton(duplicateActionLabel(list), "duplicate-list", list.list_id));
  }
  if (!locked) {
    buttons.push(actionButton("Edit", "edit-list", list.list_id));
    if (list.status === "active") {
      buttons.push(actionButton("Complete", "complete-list", list.list_id));
    }
    if (["active", "completed"].includes(list.status)) {
      buttons.push(actionButton("Finalize", "finalize-list", list.list_id));
    }
    buttons.push(actionButton(list.is_reusable ? "Unmark Reusable" : "Mark Reusable", list.is_reusable ? "unmark-reusable-list" : "mark-reusable-list", list.list_id));
    buttons.push(actionButton("Archive", "archive-list", list.list_id));
    buttons.push(actionButton("Delete", "delete-list", list.list_id, "secondary"));
  }
  if (list.status === "completed") {
    buttons.unshift(actionButton("Reopen", "reopen-list", list.list_id));
  }
  if (list.status === "archived" || list.status === "deleted") {
    buttons.push(actionButton("Restore", "restore-list", list.list_id));
  }

  return buttons.length > 0 ? buttons : [readonlyBadge(list.status)];
}

function createItemForm(list, locked) {
  const section = document.createElement("section");
  const title = document.createElement("h3");
  const form = document.createElement("form");
  const name = createItemNameField(list);
  const catalogItemId = document.createElement("input");
  const quantity = inputField("Qty", "number", "quantity", { min: "0", step: "0.01", value: "1" });
  const unit = inputField("Unit", "text", "unit");
  const needed = inputField("Needed", "date", "needed_by_date");
  const assigned = selectField("Assigned", "assigned_user_id", [
    option("", "Unassigned"),
    ...state.users.map((user) => option(user.user_id, displayUser(user))),
  ]);
  const purchase = selectField("Status", "purchase_status", Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => option(value, label)));
  const saveToCatalog = checkboxField("Save as reusable item", "save_to_catalog", "true");
  const submit = document.createElement("button");

  catalogItemId.type = "hidden";
  catalogItemId.name = "catalog_item_id";
  catalogItemId.dataset.listCatalogItemId = "";
  section.className = "lists-item-entry";
  title.textContent = "Items";
  form.dataset.listItemForm = "";
  form.dataset.listId = list.list_id;
  form.className = "lists-item-form";
  submit.type = "submit";
  submit.textContent = "Add Item";
  submit.disabled = locked;
  form.append(name, catalogItemId, quantity, unit, needed, assigned, purchase, saveToCatalog, submit);
  if (locked) {
    const notice = document.createElement("p");
    notice.className = "lists-locked-note";
    notice.textContent = readOnlyStateMessage(list);
    section.append(title, notice);
  } else {
    section.append(title);
  }
  section.appendChild(form);
  return section;
}

function createItemNameField(list) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const dataList = document.createElement("datalist");
  const listId = `list-item-suggestions-${list.list_id}`;

  input.type = "text";
  input.name = "item_name";
  input.required = true;
  input.setAttribute("list", listId);
  input.autocomplete = "off";
  input.dataset.listItemName = "";
  dataList.id = listId;
  dataList.dataset.listItemSuggestions = "";
  label.append("Item", input, dataList);
  input.addEventListener("input", () => applySuggestionSelection(input.form, list, input.value));
  return label;
}

function checkboxField(labelText, name, value) {
  const label = document.createElement("label");
  const input = document.createElement("input");

  label.className = "lists-checkbox-field";
  input.type = "checkbox";
  input.name = name;
  input.value = value;
  label.append(input, labelText);
  return label;
}

function createItemsTable(list, locked) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");

  table.className = "list-table lists-items-table";
  ["Done", "Item", "Qty", "Needed", "Status", "Assigned", "Actions"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  if (visibleItems(list).length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No items yet.";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    visibleItems(list).forEach((item, index, items) => {
      tbody.appendChild(createItemRow(list, item, index, items.length, locked));
    });
  }

  table.append(thead, tbody);
  return table;
}

function createLinkedRecordsPanel(list, locked) {
  const section = document.createElement("section");
  const title = document.createElement("h3");
  const records = document.createElement("div");
  const form = document.createElement("form");
  const targetType = selectField("Type", "target_type", [
    option("task", "Task"),
    option("note", "Note"),
    option("project", "Project"),
    option("client", "Client"),
  ]);
  const targetId = inputField("Record ID", "text", "target_id", { required: true });
  const submit = document.createElement("button");

  section.className = "lists-links-panel";
  section.dataset.listLinksPanel = "";
  title.textContent = "Linked Records";
  records.className = "lists-link-list";
  records.replaceChildren(...(list.links || []).map((link) => createLinkItem(list, link, locked)));
  if ((list.links || []).length === 0) {
    const empty = document.createElement("p");
    empty.className = "lists-empty-state";
    empty.textContent = "No linked records yet.";
    records.appendChild(empty);
  }

  form.className = "lists-link-form";
  form.dataset.listLinkForm = "";
  form.dataset.listId = list.list_id;
  form.hidden = locked;
  submit.type = "submit";
  submit.textContent = "Add Link";
  form.append(targetType, targetId, submit);
  section.append(title, records, form);
  return section;
}

function createLinkItem(list, link, locked) {
  const item = document.createElement("div");
  const label = document.createElement("span");
  const anchor = document.createElement("a");
  const remove = document.createElement("button");
  const target = link.target || {};
  const typeLabel = LIST_LINK_TYPE_LABELS[link.target_type] || formatToken(link.target_type);
  const unavailable = !target.label;

  item.className = "lists-link-item";
  item.dataset.linkAccess = unavailable ? "unavailable" : "available";
  anchor.href = target.url || "#";
  anchor.textContent = target.label || "Unavailable linked record";
  if (!target.url) {
    anchor.removeAttribute("href");
  }
  label.append(`${typeLabel}: `, anchor);
  remove.type = "button";
  remove.textContent = "Remove";
  remove.dataset.listAction = "remove-link";
  remove.dataset.listId = list.list_id;
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
  const neededCell = document.createElement("td");
  const statusCell = document.createElement("td");
  const assignedCell = document.createElement("td");
  const actionsCell = document.createElement("td");
  const checkbox = document.createElement("input");
  const itemTitle = document.createElement("strong");
  const itemNotes = document.createElement("span");

  checkbox.type = "checkbox";
  checkbox.checked = Boolean(item.checked_at);
  checkbox.disabled = locked;
  checkbox.dataset.itemAction = checkbox.checked ? "uncheck-item" : "check-item";
  checkbox.dataset.listId = list.list_id;
  checkbox.dataset.itemId = item.list_item_id;
  doneCell.appendChild(checkbox);

  itemTitle.textContent = item.item_name || "Untitled item";
  itemNotes.className = "lists-row-meta";
  itemNotes.textContent = [item.vendor_name, item.notes].filter(Boolean).join(" - ");
  itemCell.append(itemTitle, itemNotes);
  qtyCell.textContent = [item.quantity ?? "", item.unit || ""].filter(Boolean).join(" ") || "-";
  neededCell.textContent = item.needed_by_date || "-";
  statusCell.textContent = PURCHASE_STATUS_LABELS[item.purchase_status] || item.purchase_status || "-";
  assignedCell.textContent = displayUser(findUser(item.assigned_user_id)) || "Unassigned";
  actionsCell.className = "lists-item-actions";
  actionsCell.append(
    actionButton("Edit", "edit-item", list.list_id, "", { itemId: item.list_item_id, disabled: locked }),
    actionButton("Done", "complete-item", list.list_id, "", { itemId: item.list_item_id, disabled: locked || Boolean(item.completed_at) }),
    actionButton("Up", "move-item-up", list.list_id, "", { itemId: item.list_item_id, disabled: locked || index === 0 }),
    actionButton("Down", "move-item-down", list.list_id, "", { itemId: item.list_item_id, disabled: locked || index >= total - 1 }),
    actionButton("Delete", "delete-item", list.list_id, "secondary", { itemId: item.list_item_id, disabled: locked }),
  );
  row.append(doneCell, itemCell, qtyCell, neededCell, statusCell, assignedCell, actionsCell);
  return row;
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
    if (action === "edit-item") {
      populateItemForm(list, itemId);
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
  } else if (action === "check-item" || action === "uncheck-item" || action === "complete-item") {
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

    try {
      setStatus("Adding link...");
      await api.postJson(`/api/lists/${encodeURIComponent(listId)}/links`, payload);
      form.reset();
      await refreshLists(listId);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Link could not be added.", true);
    }
    return;
  }

  if (!event.target.matches("[data-list-item-form]")) {
    return;
  }

  event.preventDefault();
  const form = event.target;
  const listId = form.dataset.listId;
  const editingItemId = form.dataset.editingItemId || "";
  const payload = Object.fromEntries(new FormData(form).entries());

  payload.quantity = payload.quantity || 1;
  payload.save_to_catalog = payload.save_to_catalog === "true";
  try {
    setStatus("Saving item...");
    if (editingItemId) {
      await api.putJson(`/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(editingItemId)}`, payload);
    } else {
      await api.postJson(`/api/lists/${encodeURIComponent(listId)}/items`, payload);
    }
    form.reset();
    form.dataset.editingItemId = "";
    setFormValue(form, "catalog_item_id", "");
    form.querySelector("button[type='submit']").textContent = "Add Item";
    await refreshLists(listId);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Item could not be saved.", true);
  }
}

function populateItemForm(list, itemId) {
  const form = detailPanel.querySelector("[data-list-item-form]");
  const item = list.items.find((entry) => entry.list_item_id === itemId);

  if (!form || !item) {
    return;
  }

  form.dataset.editingItemId = itemId;
  setFormValue(form, "item_name", item.item_name);
  setFormValue(form, "quantity", item.quantity ?? 1);
  setFormValue(form, "unit", item.unit);
  setFormValue(form, "needed_by_date", item.needed_by_date);
  setFormValue(form, "assigned_user_id", item.assigned_user_id);
  setFormValue(form, "catalog_item_id", item.catalog_item_id);
  setFormValue(form, "purchase_status", item.purchase_status || "needed");
  setFormValue(form, "save_to_catalog", "");
  form.querySelector("button[type='submit']").textContent = "Save Item";
  form.querySelector("[name='item_name']")?.focus();
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
  await loadLists();
  state.selectedListId = selectedId || state.selectedListId;
  renderLists();
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
  return usesBusinessScope() || ["procurement", "parts", "supplies", "bill_of_materials"].includes(listType);
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
    checkedItemCount: Number(progress.checkedItemCount ?? progress.checked_item_count ?? checkedCount),
    completedItemCount: Number(progress.completedItemCount ?? progress.completed_item_count ?? completedCount),
    earliestNeededByDate: progress.earliestNeededByDate || progress.earliest_needed_by_date || nextNeededDateFromItems(visible) || null,
    lastActivityAt: progress.lastActivityAt || progress.last_activity_at || "",
    nextUncheckedItemLabel: progress.nextUncheckedItemLabel || progress.next_unchecked_item_label || nextUnchecked?.item_name || "",
    totalItemCount: Number(progress.totalItemCount ?? progress.total_item_count ?? visible.length),
  };
}

function renderListPlaceholder(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.textContent = message;
  row.appendChild(cell);
  listTableBody.replaceChildren(row);
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
  const prompt = document.createElement("p");
  prompt.className = "lists-empty-state";
  prompt.dataset.listNextAction = "";
  prompt.textContent = message;
  detailPanel.replaceChildren(prompt);
}

function actionButton(label, action, listId, variant = "", options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (options.itemId) {
    button.dataset.itemAction = action;
    button.dataset.itemId = options.itemId;
  } else {
    button.dataset.listAction = action;
  }
  button.dataset.listId = listId;
  button.disabled = Boolean(options.disabled);
  if (variant) {
    button.classList.add(variant);
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
  const section = document.createElement("section");
  const heading = document.createElement("strong");
  const message = document.createElement("span");
  const facts = document.createElement("div");

  section.className = "lists-next-action";
  section.dataset.listNextAction = "";
  heading.textContent = "Next";
  message.textContent = nextActionText(list);
  facts.className = "lists-next-action-facts";
  facts.append(...stateFacts(list).map((fact) => {
    const chip = document.createElement("span");
    chip.textContent = fact;
    return chip;
  }));
  section.append(heading, message, facts);
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

function createSourceContextPanel(list) {
  const sourceContext = sourceContextLabel(list);
  const section = document.createElement("section");
  const title = document.createElement("strong");
  const message = document.createElement("span");

  section.className = "lists-source-context";
  section.dataset.listSourceContext = "";
  title.textContent = list.is_reusable ? "Reusable workflow" : "Source";
  message.textContent = sourceContext || defaultSourceContextText(list);
  section.append(title, message);
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

function stateFacts(list) {
  const state = listState(list);
  return [
    `${state.checkedItems}/${state.totalItems} checked`,
    `${state.incompleteItems} incomplete`,
    state.nextNeededDate ? `Next needed ${state.nextNeededDate}` : "No needed date",
    state.assignedUsers > 0 ? `${state.assignedUsers} assigned` : "No assignee",
    state.contextLabel,
    sourceContextLabel(list) ? "Has source context" : "Independent list",
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
    input.setAttribute(key, value);
  });
  label.append(labelText, input);
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

function detailMeta(list) {
  return [
    STATUS_LABELS[list.status] || list.status,
    LIST_TYPE_LABELS[list.list_type] || list.list_type,
    listContextLabel(list),
    list.updated_at ? `Updated ${formatDateTime(list.updated_at)}` : "",
  ].filter(Boolean).join(" - ");
}

function findUser(userId) {
  return state.users.find((user) => user.user_id === userId) || null;
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

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}
