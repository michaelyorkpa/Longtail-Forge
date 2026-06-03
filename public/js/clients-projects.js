// Clients & Projects is the main editor for client, project, and billing metadata.
const clientList = document.querySelector("[data-client-list]");
const addClientButton = document.querySelector("[data-add-client]");
const addProjectTopButton = document.querySelector("[data-add-project-top]");
const clientStatusFilter = document.querySelector("[data-client-status-filter]");
const projectClientFilter = document.querySelector("[data-project-client-filter]");
const openProjectBulkButton = document.querySelector("[data-open-project-bulk]");
const statusMessage = document.querySelector("[data-client-project-status]");
const clientModal = document.querySelector("[data-client-modal]");
const clientForm = document.querySelector("[data-client-form]");
const newClientNameInput = document.querySelector("[data-new-client-name]");
const newParentClientSelect = document.querySelector("[data-new-parent-client]");
const newProjectNameInput = document.querySelector("[data-new-project-name]");
const newProjectBillingRateInput = document.querySelector(
  "[data-new-project-billing-rate]",
);
const newProjectStatusSelect = document.querySelector("[data-new-project-status]");
const cancelClientButton = document.querySelector("[data-cancel-client]");
const pageMode = document.body.dataset.clientProjectPage || "combined";
const isClientsPage = pageMode === "clients";
const isProjectsPage = pageMode === "projects";
const clientStatuses = ["Active", "Inactive"];
const projectStatuses = ["Active", "Inactive", "Completed"];
const billingContactFields = [
  ["name", "Name"],
  ["email", "Email"],
  ["alternate_name", "Alternate Name"],
  ["alternate_email", "Alternate Email"],
  ["phone_number", "Phone Number"],
  ["alternate_phone_number", "Alternate Phone Number"],
  ["street_address_1", "Street Address 1"],
  ["street_address_2", "Street Address 2"],
  ["city", "City"],
  ["state", "State"],
  ["zip_code", "Zip Code"],
];

let clientProjectData = { clients: [] };
let workspaceSettings = {
  defaultBillingRate: "",
  billingPeriod: { type: "calendarMonth", startDay: 1 },
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
  workspaceType: "business",
};
let openClientId = "";
let openBillingClientId = "";
let openClientBillingSettingsId = "";
let openedAddClientFromQuery = false;
let openedClientDetailFromQuery = false;

loadPageData();

clientStatusFilter.addEventListener("change", renderClients);

if (projectClientFilter) {
  projectClientFilter.addEventListener("change", renderClients);
}

if (openProjectBulkButton) {
  openProjectBulkButton.addEventListener("click", openProjectBulkEditor);
}

if (addClientButton) {
  addClientButton.addEventListener("click", openAddClientModal);
}

if (addProjectTopButton) {
  addProjectTopButton.addEventListener("click", () => openAddProjectDialog(getWorkspaceProjectClient()));
}

if (cancelClientButton) {
  cancelClientButton.addEventListener("click", async () => {
    const shouldDiscard = !isAddClientFormDirty() ||
      await window.LongtailForge.modal.confirm({
        title: "Discard new client?",
        message: "Discard this new client?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        danger: true,
      });

    if (!shouldDiscard) {
      return;
    }

    clientForm.reset();
    clientModal.close();
  });
}

if (clientForm) {
  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addClient();
  });
}

async function loadPageData() {
  setStatus("Loading clients and projects...");

  try {
    const [settingsData, clientsData] = await Promise.all([
      window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/client-projects", { cache: "no-store" }),
    ]);

    workspaceSettings = normalizeSettings(settingsData);
    clientProjectData = normalizeData(clientsData);
    renderProjectClientFilter();
    applyInitialClientParam();
    renderClients();
    openAddClientModalFromQuery();
    openClientDetailModalFromQuery();
    setStatus("");
  } catch (error) {
    setStatus("Client and project data could not be loaded.");
    console.error(error);
  }
}

function renderClients() {
  // Rendering is state-driven; save operations can set open IDs before calling this.
  clientList.innerHTML = "";

  if (isClientsPage && !clientsEnabledForWorkspace()) {
    if (addClientButton) {
      addClientButton.hidden = true;
    }

    const emptyMessage = document.createElement("p");
    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "Clients are disabled for this workspace type.";
    clientList.appendChild(emptyMessage);
    return;
  }

  if (isClientsPage && addClientButton) {
    addClientButton.hidden = false;
  }

  if (isProjectsPage) {
    renderProjectsPage();
    return;
  }

  if (isClientsPage) {
    renderClientsPage();
    return;
  }

  const visibleClients = sortClientTree(clientProjectData.clients).filter((client) =>
    clientStatusFilter.value === "All" || client.status === clientStatusFilter.value,
  );

  if (visibleClients.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No clients match this filter.";
    clientList.appendChild(emptyMessage);
    return;
  }

  visibleClients.forEach((client) => {
    const clientItem = document.createElement("details");
    clientItem.className = "client-item";
    clientItem.dataset.clientId = client.id;
    clientItem.open = client.id === openClientId;

    const summary = document.createElement("summary");
    summary.textContent = client.name;

    const editor = document.createElement("div");
    editor.className = "client-editor";

    if (isProjectsPage) {
      editor.append(
        createProjectClientActions(client),
        createProjectCards(client),
        createAddProjectForm(client),
      );
    } else if (isClientsPage) {
      editor.append(
        createClientNameEditor(client, { showSaveButton: false }),
        createBillingContactEditor(client, { showSaveButton: false }),
        createClientBillingSettingsEditor(client, { showSaveButton: false }),
        createClientPageActions(client),
      );
    } else {
      editor.append(
        createClientNameEditor(client),
        createBillingContactEditor(client),
        createClientBillingSettingsEditor(client),
        createProjectList(client),
        createAddProjectForm(client),
      );
    }

    clientItem.append(summary, editor);
    clientList.appendChild(clientItem);
  });
}

function renderProjectsPage() {
  const projects = getProjectsForCurrentFilters();
  clientList.appendChild(createProjectInlineBulkControls());

  if (projects.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No projects match this filter.";
    clientList.appendChild(emptyMessage);
    return;
  }

  clientList.appendChild(createProjectTable(projects));
}

function createProjectInlineBulkControls() {
  const wrapper = document.createElement("div");
  const heading = document.createElement("h2");
  const bulkStatusSelect = createBulkStatusSelect();
  const bulkClientSelect = createBulkClientSelect();
  const bulkBillableSelect = createBulkBillableSelect();

  wrapper.className = "inline-bulk-controls";
  heading.textContent = "Bulk Changes";
  wrapper.appendChild(heading);
  bulkStatusSelect.label.classList.add("inline-bulk-field");
  bulkStatusSelect.select.disabled = true;
  bulkStatusSelect.select.addEventListener("change", async () => {
    if (!bulkStatusSelect.select.value) {
      return;
    }

    await applyProjectTableBulkUpdate({
      status: bulkStatusSelect.select.value,
      clientId: "",
      shouldChangeClient: false,
      billable: "",
    });
    bulkStatusSelect.select.value = "";
  });
  wrapper.appendChild(bulkStatusSelect.label);

  if (bulkClientSelect) {
    bulkClientSelect.label.classList.add("inline-bulk-field");
    bulkClientSelect.select.disabled = true;
    bulkClientSelect.select.addEventListener("change", async () => {
      if (bulkClientSelect.select.selectedIndex === 0) {
        return;
      }

      await applyProjectTableBulkUpdate({
        status: "",
        clientId: bulkClientSelect.select.value,
        shouldChangeClient: true,
        billable: "",
      });
      bulkClientSelect.select.value = "";
    });
    wrapper.appendChild(bulkClientSelect.label);
  }

  if (bulkBillableSelect) {
    bulkBillableSelect.label.classList.add("inline-bulk-field");
    bulkBillableSelect.select.disabled = true;
    bulkBillableSelect.select.addEventListener("change", async () => {
      if (!bulkBillableSelect.select.value) {
        return;
      }

      await applyProjectTableBulkUpdate({
        status: "",
        clientId: "",
        shouldChangeClient: false,
        billable: bulkBillableSelect.select.value,
      });
      bulkBillableSelect.select.value = "";
    });
    wrapper.appendChild(bulkBillableSelect.label);
  }

  return wrapper;
}

async function applyProjectTableBulkUpdate({ status, clientId, shouldChangeClient, billable }) {
  await applyBulkProjectUpdate({
    selectedProjectIds: getSelectedProjectIds(),
    status,
    clientId,
    shouldChangeClient,
    billable,
  });
}

function createProjectTable(projects) {
  const tableWrap = document.createElement("div");
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  tableWrap.className = "list-table-wrap";
  table.className = "list-table";
  thead.innerHTML = "<tr><th>Select</th><th>Project</th><th>Edit</th></tr>";
  sortProjectRows(projects).forEach(({ client, project }) => {
    const row = document.createElement("tr");
    const selectCell = document.createElement("td");
    const nameCell = document.createElement("td");
    const editCell = document.createElement("td");
    const checkbox = document.createElement("input");
    const editButton = document.createElement("button");
    const clientName = client.isWorkspaceScope ? "Workspace Project" : client.name;

    checkbox.type = "checkbox";
    checkbox.dataset.projectTableSelect = project.id;
    checkbox.addEventListener("change", updateProjectTableBulkState);
    nameCell.textContent = clientsEnabledForWorkspace()
      ? `${treeIndent(getProjectDepth(project, client))}${project.name} (${clientName})`
      : `${treeIndent(getProjectDepth(project, client))}${project.name}`;
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openProjectDetailDialog(client, project));
    selectCell.appendChild(checkbox);
    editCell.appendChild(editButton);
    row.append(selectCell, nameCell, editCell);
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}

function sortProjectRows(projects) {
  return [...projects].sort((left, right) => {
    const clientCompare = String(left.client.name || "").localeCompare(String(right.client.name || ""), undefined, { sensitivity: "base" });

    if (clientCompare !== 0) {
      return clientCompare;
    }

    return getProjectTreeSortKey(left.project, left.client)
      .localeCompare(getProjectTreeSortKey(right.project, right.client), undefined, { sensitivity: "base" });
  });
}

function getSelectedProjectIds() {
  return [...clientList.querySelectorAll("[data-project-table-select]:checked")]
    .map((checkbox) => checkbox.dataset.projectTableSelect);
}

function updateProjectTableBulkState() {
  const hasSelection = getSelectedProjectIds().length > 0;

  clientList.querySelectorAll(".inline-bulk-controls select").forEach((select) => {
    select.disabled = !hasSelection;
  });
}

function openProjectDetailDialog(client, project) {
  const dialog = document.createElement("dialog");
  const projectEditor = createProjectEditor(client, project);
  const closeActions = document.createElement("div");
  const closeButton = document.createElement("button");

  dialog.className = "project-form-dialog detail-edit-dialog";
  projectEditor.open = true;
  closeActions.className = "form-actions detail-modal-actions";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => dialog.close());
  closeActions.appendChild(closeButton);
  dialog.append(projectEditor, closeActions);
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function renderClientsPage() {
  const visibleClients = getVisibleClientsForClientPage();

  clientList.appendChild(createClientInlineBulkControls());

  if (visibleClients.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No clients match this filter.";
    clientList.appendChild(emptyMessage);
    return;
  }

  clientList.appendChild(createClientTable(visibleClients));
}

function getVisibleClientsForClientPage() {
  return sortClientTree(getRealClients()).filter((client) =>
    clientStatusFilter.value === "All" || client.status === clientStatusFilter.value,
  );
}

function createClientInlineBulkControls() {
  const wrapper = document.createElement("div");
  const statusField = createClientBulkStatusSelect();
  const billableField = createClientBulkBillableSelect();

  wrapper.className = "inline-bulk-controls";
  statusField.label.classList.add("inline-bulk-field");
  statusField.select.disabled = true;
  statusField.select.addEventListener("change", async () => {
    if (!statusField.select.value) {
      return;
    }

    await applyBulkClientUpdate({
      selectedClientIds: getSelectedClientIds(),
      status: statusField.select.value,
      billable: "",
    });
    statusField.select.value = "";
  });
  wrapper.appendChild(statusField.label);

  billableField.label.classList.add("inline-bulk-field");
  billableField.select.disabled = true;
  billableField.select.addEventListener("change", async () => {
    if (!billableField.select.value) {
      return;
    }

    await applyBulkClientUpdate({
      selectedClientIds: getSelectedClientIds(),
      status: "",
      billable: billableField.select.value,
    });
    billableField.select.value = "";
  });
  wrapper.appendChild(billableField.label);

  return wrapper;
}

function createClientBulkStatusSelect() {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Bulk Status";
  select.append(
    createOption("", "No status change"),
    createOption("Active", "Active"),
    createOption("Inactive", "Inactive"),
  );
  label.appendChild(select);
  return { label, select };
}

function createClientBulkBillableSelect() {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Bulk Billable";
  select.append(
    createOption("", "No billing change"),
    createOption("yes", "Billable"),
    createOption("no", "Non-billable"),
  );
  label.appendChild(select);
  return { label, select };
}

function createClientTable(clients) {
  const tableWrap = document.createElement("div");
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  tableWrap.className = "list-table-wrap";
  table.className = "list-table";
  thead.innerHTML = "<tr><th>Select</th><th>Client</th><th>Edit</th></tr>";
  clients.forEach((client) => {
    const row = document.createElement("tr");
    const selectCell = document.createElement("td");
    const nameCell = document.createElement("td");
    const editCell = document.createElement("td");
    const checkbox = document.createElement("input");
    const editButton = document.createElement("button");

    checkbox.type = "checkbox";
    checkbox.dataset.clientTableSelect = client.id;
    checkbox.addEventListener("change", updateClientTableBulkState);
    nameCell.textContent = `${treeIndent(getClientDepth(client))}${client.name}`;
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openClientDetailDialog(client));
    selectCell.appendChild(checkbox);
    editCell.appendChild(editButton);
    row.append(selectCell, nameCell, editCell);
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}

function getSelectedClientIds() {
  return [...clientList.querySelectorAll("[data-client-table-select]:checked")]
    .map((checkbox) => checkbox.dataset.clientTableSelect);
}

function updateClientTableBulkState() {
  const hasSelection = getSelectedClientIds().length > 0;

  clientList.querySelectorAll(".inline-bulk-controls select").forEach((select) => {
    select.disabled = !hasSelection;
  });
}

function openClientDetailDialog(client) {
  const dialog = document.createElement("dialog");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const editor = document.createElement("div");
  const closeActions = document.createElement("div");
  const closeButton = document.createElement("button");

  dialog.className = "client-detail-dialog detail-edit-dialog";
  details.className = "client-item";
  details.open = true;
  summary.textContent = client.name;
  editor.className = "client-editor";
  editor.append(
    createClientNameEditor(client, { showSaveButton: false }),
    createBillingContactEditor(client, { showSaveButton: false }),
    createClientBillingSettingsEditor(client, { showSaveButton: false }),
    createClientPageActions(client),
  );
  closeActions.className = "form-actions detail-modal-actions";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => dialog.close());
  closeActions.appendChild(closeButton);
  details.append(summary, editor);
  dialog.append(details, closeActions);
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

async function applyBulkClientUpdate({ selectedClientIds, status, billable }) {
  if (selectedClientIds.length === 0) {
    setStatus("Select at least one client.");
    return;
  }

  if (!status && !billable) {
    setStatus("Choose a bulk change before applying.");
    return;
  }

  setStatus("Updating selected clients...");
  try {
    for (const clientId of selectedClientIds) {
      const client = getRealClients().find((item) => item.id === clientId);

      if (!client) {
        continue;
      }

      const nextClient = {
        ...client,
        status: status || client.status,
        billable: billable || client.billable,
        action: {
          action: "clients_bulk_updated",
          client_id: client.id,
          client_name: client.name,
          details: `bulk_status=${status || "unchanged"};bulk_billable=${billable || "unchanged"}`,
        },
      };

      await window.LongtailForge.api.putJson(
        `/api/clients/${encodeURIComponent(client.id)}`,
        nextClient,
      );
    }

    await refreshClientProjectData();
    renderClients();
    setStatus("Updated selected clients.");
  } catch (error) {
    setStatus("Selected clients were not updated.");
    console.error(error);
  }
}

function openAddProjectDialog(client) {
  const dialog = document.createElement("dialog");
  const form = createAddProjectForm(client, {
    onSaved: () => dialog.close(),
    showClientAssignment: true,
  });
  const heading = document.createElement("h2");
  const closeButton = document.createElement("button");
  const actions = document.createElement("div");

  dialog.className = "project-form-dialog";
  form.classList.add("project-modal-form");
  heading.textContent = "Add Project";
  closeButton.type = "button";
  closeButton.textContent = "Cancel";
  actions.className = "form-actions";
  actions.classList.add("project-modal-actions");
  closeButton.addEventListener("click", () => dialog.close());
  const submitButton = form.querySelector("[data-add-project-button]") || createAddProjectSubmitButton(client.id);
  submitButton.remove();
  actions.append(submitButton, closeButton);
  form.prepend(heading);
  form.appendChild(actions);
  dialog.appendChild(form);
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function openAddClientModal() {
  if (!clientForm || !clientModal) {
    return;
  }

  clientForm.reset();
  populateParentClientSelect(newParentClientSelect);

  if (newProjectBillingRateInput) {
    newProjectBillingRateInput.value = workspaceSettings.defaultBillingRate;
  }

  clientModal.showModal();
  newClientNameInput?.focus();
}

function openAddClientModalFromQuery() {
  if (!isClientsPage || openedAddClientFromQuery || !clientsEnabledForWorkspace()) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("addClient") !== "true") {
    return;
  }

  openedAddClientFromQuery = true;
  openAddClientModal();
}

function openClientDetailModalFromQuery() {
  if (!isClientsPage || openedClientDetailFromQuery || !clientsEnabledForWorkspace()) {
    return;
  }

  const clientId = new URLSearchParams(window.location.search).get("client") || "";
  const client = getRealClients().find((item) => item.id === clientId);

  if (!client) {
    return;
  }

  openedClientDetailFromQuery = true;
  openClientDetailDialog(client);
}

function getProjectsForCurrentFilters() {
  return getAllProjects()
    .filter(({ project }) => clientStatusFilter.value === "All" || project.status === clientStatusFilter.value)
    .filter(({ client }) => (
      !projectClientFilter ||
      !clientsEnabledForWorkspace() ||
      projectClientFilter.value === "All" ||
      client.id === projectClientFilter.value
    ));
}

function openProjectBulkEditor() {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  const title = document.createElement("h2");
  const projectFilterRow = document.createElement("div");
  const actionRow = document.createElement("div");
  const selectAllRow = document.createElement("label");
  const selectAllCheckbox = document.createElement("input");
  const projectList = document.createElement("div");
  const actions = document.createElement("div");
  const cancelButton = document.createElement("button");
  const applyButton = document.createElement("button");
  const modalClientFilter = createBulkClientFilter();
  const modalStatusFilter = createBulkStatusFilter();
  const bulkStatusSelect = createBulkStatusSelect();
  const bulkClientSelect = createBulkClientSelect();
  const bulkBillableSelect = createBulkBillableSelect();

  dialog.className = "project-bulk-dialog";
  form.method = "dialog";
  form.className = "project-bulk-form";
  title.textContent = "Bulk Edit Projects";
  projectFilterRow.className = "project-bulk-filter-row";
  actionRow.className = "project-bulk-action-row";
  selectAllRow.className = "project-bulk-select-all";
  projectList.className = "project-bulk-list";
  actions.className = "form-actions";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  applyButton.type = "submit";
  applyButton.textContent = "Apply to Selected";
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.dataset.projectBulkSelectAll = "";
  selectAllRow.append(
    selectAllCheckbox,
    document.createTextNode("All projects"),
  );

  if (modalClientFilter) {
    projectFilterRow.appendChild(modalClientFilter.label);
  }

  projectFilterRow.appendChild(modalStatusFilter.label);

  actionRow.appendChild(bulkStatusSelect.label);

  if (bulkClientSelect) {
    actionRow.appendChild(bulkClientSelect.label);
  }

  if (bulkBillableSelect) {
    actionRow.appendChild(bulkBillableSelect.label);
  }

  const renderBulkProjects = () => {
    renderBulkProjectList(
      projectList,
      modalClientFilter?.select?.value || "All",
      modalStatusFilter.select.value,
    );
    updateBulkSelectAllState(projectList, selectAllCheckbox);
  };

  modalClientFilter?.select?.addEventListener("change", renderBulkProjects);
  modalStatusFilter.select.addEventListener("change", renderBulkProjects);
  selectAllCheckbox.addEventListener("change", () => {
    projectList.querySelectorAll("[data-project-bulk-select]").forEach((checkbox) => {
      checkbox.checked = selectAllCheckbox.checked;
    });
    updateBulkSelectAllState(projectList, selectAllCheckbox);
  });
  projectList.addEventListener("change", (event) => {
    if (event.target.matches("[data-project-bulk-select]")) {
      updateBulkSelectAllState(projectList, selectAllCheckbox);
    }
  });
  renderBulkProjects();

  cancelButton.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    applyButton.disabled = true;

    try {
      await applyBulkProjectUpdate({
        selectedProjectIds: [...projectList.querySelectorAll("[data-project-bulk-select]:checked")]
          .map((checkbox) => checkbox.dataset.projectBulkSelect),
        status: bulkStatusSelect.select.value,
        clientId: bulkClientSelect?.select.selectedIndex > 0
          ? bulkClientSelect.select.value
          : "",
        shouldChangeClient: Boolean(bulkClientSelect && bulkClientSelect.select.selectedIndex > 0),
        billable: bulkBillableSelect?.select.value || "",
      });
      dialog.close();
    } finally {
      applyButton.disabled = false;
    }
  });

  actions.append(cancelButton, applyButton);
  form.append(title, projectFilterRow, actionRow, selectAllRow, projectList, actions);
  dialog.appendChild(form);
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function updateBulkSelectAllState(projectList, selectAllCheckbox) {
  const checkboxes = [...projectList.querySelectorAll("[data-project-bulk-select]")];
  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;

  selectAllCheckbox.disabled = checkboxes.length === 0;
  selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
  selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function createBulkStatusFilter() {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Filter by Status";
  select.append(
    createOption("All", "All statuses"),
    createOption("Active", "Active"),
    createOption("Inactive", "Inactive"),
    createOption("Completed", "Completed"),
  );
  select.value = [...select.options].some((option) => option.value === clientStatusFilter.value)
    ? clientStatusFilter.value
    : "All";
  label.appendChild(select);
  return { label, select };
}

function createBulkClientFilter() {
  if (!clientsEnabledForWorkspace()) {
    return null;
  }

  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Filter by Client";
  select.append(
    createOption("All", "All projects"),
    createOption("__workspace_projects__", workspaceProjectsLabel()),
  );
  getRealClients().filter((client) => isActiveStatus(client.status)).forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
  select.value = [...select.options].some((option) => option.value === projectClientFilter?.value)
    ? projectClientFilter.value
    : "All";
  label.appendChild(select);
  return { label, select };
}

function createBulkStatusSelect() {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Bulk Status";
  select.append(
    createOption("", "No status change"),
    createOption("Active", "Active"),
    createOption("Inactive", "Inactive"),
    createOption("Completed", "Completed"),
  );
  label.appendChild(select);
  return { label, select };
}

function createBulkClientSelect() {
  if (!clientsEnabledForWorkspace()) {
    return null;
  }

  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Bulk Client";
  select.append(
    createOption("", "No client change"),
    createOption("__workspace__", "Workspace project"),
  );
  getRealClients().filter((client) => isActiveStatus(client.status)).forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
  label.appendChild(select);
  return { label, select };
}

function createBulkBillableSelect() {
  if (!clientsEnabledForWorkspace()) {
    return null;
  }

  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Bulk Billable";
  select.append(
    createOption("", "No billing change"),
    createOption("yes", "Billable"),
    createOption("no", "Non-billable"),
  );
  label.appendChild(select);
  return { label, select };
}

function renderBulkProjectList(container, clientFilterValue, statusFilterValue) {
  const projects = getAllProjects()
    .filter(({ project }) => statusFilterValue === "All" || project.status === statusFilterValue)
    .filter(({ client }) => (
      !clientsEnabledForWorkspace() ||
      clientFilterValue === "All" ||
      client.id === clientFilterValue
    ));

  container.replaceChildren();

  if (projects.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No projects match this filter.";
    container.appendChild(emptyMessage);
    return;
  }

  sortByName(projects.map(({ project }) => project)).forEach((project) => {
    const row = document.createElement("label");
    const checkbox = document.createElement("input");
    const projectName = document.createElement("span");
    const projectClient = projects.find((item) => item.project.id === project.id)?.client;
    const clientName = projectClient?.isWorkspaceScope ? "Workspace Project" : projectClient?.name || "";

    row.className = "project-bulk-row";
    checkbox.type = "checkbox";
    checkbox.dataset.projectBulkSelect = project.id;
    projectName.textContent = clientName ? `${project.name} (${clientName})` : project.name;
    row.append(checkbox, projectName);
    container.appendChild(row);
  });
}

async function applyBulkProjectUpdate({
  selectedProjectIds,
  status,
  clientId,
  shouldChangeClient,
  billable,
}) {
  const nextClientId = clientId === "__workspace__" ? "" : clientId || "";
  const nextBillable = clientsEnabledForWorkspace() ? billable : "no";

  if (selectedProjectIds.length === 0) {
    setStatus("Select at least one project.");
    return;
  }

  if (!status && !shouldChangeClient && !billable && clientsEnabledForWorkspace()) {
    setStatus("Choose a bulk change before applying.");
    return;
  }

  setStatus("Updating selected projects...");
  try {
    for (const projectId of selectedProjectIds) {
      const project = findProjectById(projectId);

      if (!project) {
        continue;
      }

      const nextProject = {
        ...project,
        status: status || project.status,
        client_id: shouldChangeClient ? nextClientId : project.client_id,
        confirm_downstream_update: shouldChangeClient,
        billable: nextBillable || project.billable,
        action: {
          action: "projects_bulk_updated",
          project_id: project.id,
          project_name: project.name,
          client_id: shouldChangeClient ? nextClientId : project.client_id,
          client_name: shouldChangeClient ? getProjectClientName(nextClientId) : getProjectClientName(project.client_id),
          details: `bulk_status=${status || "unchanged"};bulk_client=${shouldChangeClient ? nextClientId || "workspace" : "unchanged"};bulk_billable=${nextBillable || "unchanged"}`,
        },
      };

      await window.LongtailForge.api.putJson(
        `/api/projects/${encodeURIComponent(project.id)}`,
        nextProject,
      );
    }

    await refreshClientProjectData();
    renderClients();
    setStatus("Updated selected projects.");
  } catch (error) {
    setStatus("Selected projects were not updated.");
    console.error(error);
  }
}

function findProjectById(projectId) {
  return getAllProjects().find(({ project }) => project.id === projectId)?.project || null;
}

function renderProjectClientFilter() {
  if (!projectClientFilter) {
    return;
  }

  const clientFilterLabel = projectClientFilter.closest("label");
  const shouldShowClientFilter = clientsEnabledForWorkspace();
  clientFilterLabel.hidden = !shouldShowClientFilter;
  projectClientFilter.hidden = !shouldShowClientFilter;
  projectClientFilter.disabled = !shouldShowClientFilter;

  const previousValue = projectClientFilter.value || "All";
  projectClientFilter.replaceChildren(createOption("All", "All clients"));
  projectClientFilter.appendChild(createOption("__workspace_projects__", workspaceProjectsLabel()));

  getRealClients().forEach((client) => {
    projectClientFilter.appendChild(createOption(client.id, `${treeIndent(getClientDepth(client))}${client.name}`));
  });

  projectClientFilter.value = clientsEnabledForWorkspace() && [...projectClientFilter.options].some((option) => option.value === previousValue)
    ? previousValue
    : "All";
}

function getAllProjects() {
  return clientProjectData.clients.flatMap((client) => (
    (client.projects || []).map((project) => ({ client, project }))
  ));
}

function getRealClients() {
  return clientProjectData.clients.filter((client) => !client.isWorkspaceScope);
}

function getClientDepth(client, visited = new Set()) {
  if (!client?.parent_client_id || visited.has(client.id)) {
    return 0;
  }

  visited.add(client.id);
  const parent = getRealClients().find((item) => item.id === client.parent_client_id);
  return parent ? 1 + getClientDepth(parent, visited) : 0;
}

function getProjectDepth(project, client, visited = new Set()) {
  if (!project?.parent_project_id || visited.has(project.id)) {
    return 0;
  }

  visited.add(project.id);
  const parent = (client?.projects || []).find((item) => item.id === project.parent_project_id);
  return parent ? 1 + getProjectDepth(parent, client, visited) : 0;
}

function treeIndent(depth) {
  return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
}

function getProjectTreeSortKey(project, client) {
  const names = [];
  let currentProject = project;
  const visited = new Set();

  while (currentProject && !visited.has(currentProject.id)) {
    visited.add(currentProject.id);
    names.unshift(currentProject.name || "");
    currentProject = (client?.projects || []).find((item) => item.id === currentProject.parent_project_id);
  }

  return names.join("/");
}

function sortClientTree(clients) {
  return [...clients].sort((left, right) =>
    getClientTreeSortKey(left).localeCompare(getClientTreeSortKey(right), undefined, { sensitivity: "base" }),
  );
}

function sortProjectsForClient(client) {
  return [...(client.projects || [])].sort((left, right) =>
    getProjectTreeSortKey(left, client).localeCompare(getProjectTreeSortKey(right, client), undefined, { sensitivity: "base" }),
  );
}

function getClientTreeSortKey(client) {
  const names = [];
  let currentClient = client;
  const visited = new Set();

  while (currentClient && !visited.has(currentClient.id)) {
    visited.add(currentClient.id);
    names.unshift(currentClient.name || "");
    currentClient = getRealClients().find((item) => item.id === currentClient.parent_client_id);
  }

  return names.join("/");
}

function getClientDescendantIds(clientId) {
  const descendants = new Set();
  const pending = [clientId];

  while (pending.length > 0) {
    const currentId = pending.pop();
    getRealClients()
      .filter((client) => client.parent_client_id === currentId)
      .forEach((client) => {
        if (!descendants.has(client.id)) {
          descendants.add(client.id);
          pending.push(client.id);
        }
      });
  }

  return [...descendants];
}

function getProjectDescendantIds(projectId, client) {
  if (!projectId) {
    return [];
  }

  const descendants = new Set();
  const pending = [projectId];

  while (pending.length > 0) {
    const currentId = pending.pop();
    (client?.projects || [])
      .filter((project) => project.parent_project_id === currentId)
      .forEach((project) => {
        if (!descendants.has(project.id)) {
          descendants.add(project.id);
          pending.push(project.id);
        }
      });
  }

  return [...descendants];
}

function getWorkspaceProjectClient() {
  const simplifiedBilling = usesProjectRoundingOnly();

  return clientProjectData.clients.find((client) => client.isWorkspaceScope) || {
    id: "__workspace_projects__",
    name: workspaceProjectsLabel(),
    status: "Active",
    billable: simplifiedBilling ? "no" : "yes",
    billing_rate: simplifiedBilling ? null : normalizeBillingRate(workspaceSettings.defaultBillingRate),
    billing_period: simplifiedBilling ? null : normalizeOptionalBillingPeriod(workspaceSettings.billingPeriod),
    billing_rounding: normalizeOptionalBillingRounding(workspaceSettings.billingRounding),
    billing_contact: normalizeBillingContact({}),
    isWorkspaceScope: true,
    projects: [],
  };
}

function createClientNameEditor(client, options = {}) {
  const showSaveButton = options.showSaveButton !== false;
  const wrapper = document.createElement("div");
  wrapper.className = "edit-row client-name-row";

  const label = document.createElement("label");
  label.textContent = "Client Name";

  const input = document.createElement("input");
  input.value = client.name;
  input.dataset.clientNameInput = client.id;
  label.appendChild(input);

  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Status";

  const statusSelect = createClientStatusSelect(client.status);
  statusSelect.dataset.clientStatusInput = client.id;
  statusLabel.appendChild(statusSelect);

  wrapper.append(label, createParentClientField(client), statusLabel);

  if (showSaveButton) {
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Client";
    saveButton.dataset.saveClientButton = client.id;
    saveButton.addEventListener("click", async () => {
      await saveClientSettings(client, wrapper, {
        action: "client_updated",
        flashSelector: `[data-save-client-button="${client.id}"]`,
      });
    });
    wrapper.appendChild(saveButton);
  }

  return wrapper;
}

function createParentClientField(client) {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Parent Client";
  label.hidden = !clientsEnabledForWorkspace();
  populateParentClientSelect(select, client.id);
  select.dataset.clientParentInput = client.id;
  select.dataset.clientParentField = "";
  select.value = client.parent_client_id || "";
  label.appendChild(select);
  return label;
}

function populateParentClientSelect(select, excludedClientId = "") {
  if (!select) {
    return;
  }

  const excludedIds = new Set([excludedClientId, ...getClientDescendantIds(excludedClientId)]);
  const currentValue = select.value || "";
  select.replaceChildren(createOption("", "No parent client"));
  getRealClients()
    .filter((client) => !excludedIds.has(client.id) && isActiveStatus(client.status))
    .forEach((client) => {
      select.appendChild(createOption(client.id, `${treeIndent(getClientDepth(client))}${client.name}`));
    });
  select.value = [...select.options].some((option) => option.value === currentValue)
    ? currentValue
    : "";
}

function createClientPageActions(client) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-actions client-page-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save Client";
  saveButton.dataset.saveClientSettingsButton = client.id;
  saveButton.addEventListener("click", async () => {
    await saveClientSettings(client, wrapper.closest(".client-editor"), {
      action: "client_settings_updated",
      openBillingClientId: client.id,
      openClientBillingSettingsId: client.id,
      flashSelector: `[data-save-client-settings-button="${client.id}"]`,
    });
  });

  const editProjectsButton = document.createElement("button");
  editProjectsButton.type = "button";
  editProjectsButton.textContent = "Edit Projects";
  editProjectsButton.addEventListener("click", () => {
    window.location.href = `projects.html?client=${encodeURIComponent(client.id)}`;
  });

  wrapper.append(saveButton, editProjectsButton);
  return wrapper;
}

function createProjectClientActions(client) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-actions project-client-actions";

  if (client.isWorkspaceScope) {
    return wrapper;
  }

  const editClientButton = document.createElement("button");
  editClientButton.type = "button";
  editClientButton.textContent = "Edit Client";
  editClientButton.addEventListener("click", () => {
    window.location.href = `clients.html?client=${encodeURIComponent(client.id)}`;
  });

  wrapper.append(editClientButton);
  return wrapper;
}

function createBillingContactEditor(client, options = {}) {
  const showSaveButton = options.showSaveButton !== false;
  const details = document.createElement("details");
  details.className = "billing-details";
  details.open = client.id === openBillingClientId;

  const summary = document.createElement("summary");
  summary.textContent = "Billing Contact";

  const form = document.createElement("form");
  form.className = "billing-editor";

  const inputs = new Map();

  billingContactFields.forEach(([fieldName, labelText]) => {
    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.value = client.billing_contact[fieldName];
    input.dataset.billingContactField = fieldName;

    if (fieldName.includes("email")) {
      input.type = "email";
    } else if (fieldName.includes("phone")) {
      input.type = "tel";
    }

    label.appendChild(input);
    inputs.set(fieldName, input);
    form.appendChild(label);
  });

  if (showSaveButton) {
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "Save Contact";
    saveButton.dataset.saveBillingContactButton = client.id;
    form.appendChild(saveButton);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!showSaveButton) {
      await saveClientSettings(client, form.closest(".client-editor"), {
        action: "client_settings_updated",
        openBillingClientId: client.id,
        openClientBillingSettingsId: client.id,
        flashSelector: `[data-save-client-settings-button="${client.id}"]`,
      });
      return;
    }

    billingContactFields.forEach(([fieldName]) => {
      client.billing_contact[fieldName] = inputs.get(fieldName).value.trim();
    });

    await saveClientRecord(client, {
      action: "client_billing_contact_updated",
      client_id: client.id,
      client_name: client.name,
      details: "billing_contact_updated=true",
    }, {
      openClientId: client.id,
      openBillingClientId: client.id,
      flashSelector: `[data-save-billing-contact-button="${client.id}"]`,
    });
  });

  details.append(summary, form);
  return details;
}

function createAddProjectSubmitButton(clientId) {
  const button = document.createElement("button");

  button.type = "submit";
  button.textContent = "Add Project";
  button.dataset.addProjectButton = clientId;
  return button;
}

function createClientBillingSettingsEditor(client, options = {}) {
  // Client billing values override app defaults but can still inherit period/rounding.
  const showSaveButton = options.showSaveButton !== false;
  const details = document.createElement("details");
  details.className = "billing-details";
  details.open = client.id === openClientBillingSettingsId;

  const summary = document.createElement("summary");
  summary.textContent = "Client Billing Settings";

  const form = document.createElement("form");
  form.className = "billing-editor billing-settings-editor";

  const billingRateLabel = document.createElement("label");
  billingRateLabel.textContent = "Billing Rate ($/hour)";

  const billingRateInput = document.createElement("input");
  billingRateInput.inputMode = "decimal";
  billingRateInput.value = client.billing_rate;
  billingRateInput.dataset.clientBillingRateInput = client.id;
  billingRateLabel.appendChild(billingRateInput);

  const billableLabel = createBillableCheckbox(client.billable);
  const billableInput = billableLabel.querySelector("input");
  billableInput.dataset.clientBillableInput = client.id;

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: `Use workspace billing period (${formatBillingPeriod(workspaceSettings.billingPeriod)})`,
    value: client.billing_period,
    inheritedPeriod: workspaceSettings.billingPeriod,
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: `Use workspace rounding (${formatBillingRounding(workspaceSettings.billingRounding)})`,
    value: client.billing_rounding,
    inheritedRounding: workspaceSettings.billingRounding,
  });
  const reminderPolicyEditor = createTaskReminderPolicyEditor({
    legend: "Task Reminder Defaults",
    inheritLabel: "Use workspace task reminder defaults",
    value: client.taskReminderPolicy,
  });

  let saveButton = null;

  if (showSaveButton) {
    saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "Save Billing Settings";
    saveButton.dataset.saveBillingSettingsButton = client.id;
  }

  const updateBillableState = () => {
    const isBillable = billableInput.checked;
    billingRateInput.disabled = !isBillable;
    billingPeriodEditor.setDisabled(!isBillable);
    billingRoundingEditor.setBillableMode(isBillable);
  };

  billableInput.addEventListener("change", updateBillableState);
  updateBillableState();

  form.append(
    billableLabel,
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
    reminderPolicyEditor.element,
  );

  if (saveButton) {
    form.appendChild(saveButton);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!showSaveButton) {
      await saveClientSettings(client, form.closest(".client-editor"), {
        action: "client_settings_updated",
        openBillingClientId: client.id,
        openClientBillingSettingsId: client.id,
        flashSelector: `[data-save-client-settings-button="${client.id}"]`,
      });
      return;
    }

    client.billing_rate = normalizeBillingRate(billingRateInput.value);
    client.billing_period = billingPeriodEditor.getValue();
    client.billable = normalizeBillableFlag(billableInput.checked);
    client.billing_rounding = billingRoundingEditor.getValue();
    client.taskReminderPolicy = reminderPolicyEditor.getValue();

    await saveClientRecord(client, {
      action: "client_billing_settings_updated",
      client_id: client.id,
      client_name: client.name,
      details: `billable=${client.billable};billing_rate=${client.billing_rate};billing_period=${formatBillingPeriod(getEffectiveClientBillingPeriod(client))};rounding=${formatBillingRounding(getEffectiveClientBillingRounding(client))};round_hours=${getEffectiveClientBillingRounding(client).enabled ? "yes" : "no"}`,
      taskReminderPolicy: client.taskReminderPolicy,
    }, {
      openClientId: client.id,
      openClientBillingSettingsId: client.id,
      flashSelector: `[data-save-billing-settings-button="${client.id}"]`,
    });
  });

  details.append(summary, form);
  return details;
}

async function saveClientSettings(client, container, options = {}) {
  const nameInput = container?.querySelector("[data-client-name-input]");
  const statusSelect = container?.querySelector("[data-client-status-input]");
  const parentClientSelect = container?.querySelector("[data-client-parent-field]");
  const billingRateInput = container?.querySelector("[data-client-billing-rate-input]");
  const billableInput = container?.querySelector("[data-client-billable-input]");

  if (!nameInput?.value.trim()) {
    setStatus("Client name is required.");
    return false;
  }

  const oldClient = { ...client };
  client.name = nameInput.value.trim();
  client.status = statusSelect?.value || client.status;
  client.parent_client_id = parentClientSelect?.value || "";

  if ((oldClient.parent_client_id || "") !== (client.parent_client_id || "")) {
    const confirmed = await window.LongtailForge.modal.confirm({
      title: "Move client?",
      message: "Move this client in the client hierarchy? Existing records keep their saved client and project names; future rollups follow the updated hierarchy.",
      confirmLabel: "Move",
      cancelLabel: "Cancel",
      danger: false,
    });

    if (!confirmed) {
      client.parent_client_id = oldClient.parent_client_id || "";
      return false;
    }
  }

  container?.querySelectorAll("[data-billing-contact-field]").forEach((input) => {
    client.billing_contact[input.dataset.billingContactField] = input.value.trim();
  });

  if (billingRateInput && billableInput) {
    const billingPeriodEditor = container.querySelector("[data-billing-period-editor]")
      ?.billingPeriodEditor;
    const billingRoundingEditor = container.querySelector("[data-billing-rounding-editor]")
      ?.billingRoundingEditor;

    client.billing_rate = normalizeBillingRate(billingRateInput.value);
    client.billable = normalizeBillableFlag(billableInput.checked);

    if (billingPeriodEditor) {
      client.billing_period = billingPeriodEditor.getValue();
    }

    if (billingRoundingEditor) {
      client.billing_rounding = billingRoundingEditor.getValue();
    }
  }

  const action = options.action || "client_settings_updated";

  return saveClientRecord(client, {
    action,
    client_id: client.id,
    client_name: client.name,
    details: [
      `old_client_id=${oldClient.id}`,
      `old_client_name=${oldClient.name}`,
      `old_status=${oldClient.status}`,
      `old_parent_client_id=${oldClient.parent_client_id || ""}`,
      `new_parent_client_id=${client.parent_client_id || ""}`,
      `new_status=${client.status}`,
      "billing_contact_updated=true",
      `billable=${client.billable}`,
      `billing_rate=${client.billing_rate}`,
      `billing_period=${formatBillingPeriod(getEffectiveClientBillingPeriod(client))}`,
      `rounding=${formatBillingRounding(getEffectiveClientBillingRounding(client))}`,
      `round_hours=${getEffectiveClientBillingRounding(client).enabled ? "yes" : "no"}`,
    ].join(";"),
  }, {
    openClientId: client.id,
    openBillingClientId: options.openBillingClientId || "",
    openClientBillingSettingsId: options.openClientBillingSettingsId || "",
    flashSelector: options.flashSelector,
  });
}

function createProjectList(client) {
  const details = document.createElement("details");
  details.className = "project-section";

  const summary = document.createElement("summary");
  summary.textContent = "Projects";

  const list = document.createElement("div");
  list.className = "project-list";

  sortProjectsForClient(client).forEach((project) => {
    list.appendChild(createProjectEditor(client, project));
  });

  details.append(summary, list);
  return details;
}

function createProjectCards(client) {
  const list = document.createElement("div");
  list.className = "project-list project-list-flat";

  if (client.projects.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No projects yet.";
    list.appendChild(emptyMessage);
    return list;
  }

  sortProjectsForClient(client).forEach((project) => {
    list.appendChild(createProjectEditor(client, project));
  });

  return list;
}

function createProjectEditor(client, project) {
  // Project settings sit closest to the work and override client/app defaults.
  const details = document.createElement("details");
  details.className = "project-item";
  details.dataset.projectId = project.id;

  const summary = document.createElement("summary");
  const summaryLabel = document.createElement("span");
  const usesSimplifiedBilling = usesProjectRoundingOnly();

  summaryLabel.textContent = project.name;
  summary.appendChild(summaryLabel);

  const wrapper = document.createElement("div");
  wrapper.className = "project-editor";

  const nameLabel = document.createElement("label");
  nameLabel.className = "project-name-field";
  nameLabel.textContent = "Project Name";

  const nameInput = document.createElement("input");
  nameInput.value = project.name;
  nameLabel.appendChild(nameInput);

  const statusLabel = document.createElement("label");
  statusLabel.className = "project-status-field";
  statusLabel.textContent = "Status";

  const statusSelect = createStatusSelect(project.status);
  statusLabel.appendChild(statusSelect);

  const billingRateLabel = document.createElement("label");
  billingRateLabel.textContent = "Billing Rate ($/hour)";

  const billingRateInput = document.createElement("input");
  billingRateInput.inputMode = "decimal";
  billingRateInput.value = project.billing_rate;
  billingRateLabel.appendChild(billingRateInput);

  const billableLabel = createBillableCheckbox(project.billable);
  const billableInput = billableLabel.querySelector("input");
  const clientAssignmentLabel = createProjectClientAssignment(project);
  const parentProjectLabel = createProjectParentAssignment(project, client);
  const clientAssignmentSelect = clientAssignmentLabel.querySelector("select");
  const parentProjectSelect = parentProjectLabel.querySelector("select");
  const clientActions = createProjectClientShortcutActions(project);

  clientAssignmentSelect.addEventListener("change", () => {
    populateParentProjectSelect(parentProjectSelect, {
      excludedProjectId: project.id,
      clientId: clientAssignmentSelect.value,
    });
  });

  const billingDetails = document.createElement("details");
  billingDetails.className = "project-billing-details";

  const billingSummary = document.createElement("summary");
  billingSummary.textContent = usesSimplifiedBilling ? "Project Rounding" : "Project Billing Settings";

  const billingSettings = document.createElement("div");
  billingSettings.className = "project-billing-settings";

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: getProjectBillingPeriodInheritLabel(client),
    value: project.billing_period,
    inheritedPeriod: getEffectiveClientBillingPeriod(client),
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: getProjectRoundingInheritLabel(client, project),
    value: project.billing_rounding,
    inheritedRounding: project.client_id ? getEffectiveClientBillingRounding(client) : workspaceSettings.billingRounding,
    showModeWhenUnbillable: true,
  });
  const reminderPolicyEditor = createTaskReminderPolicyEditor({
    legend: "Task Reminder Defaults",
    inheritLabel: project.client_id ? "Use client task reminder defaults" : "Use workspace task reminder defaults",
    value: project.taskReminderPolicy,
  });

  billingSettings.append(
    billingRoundingEditor.element,
    reminderPolicyEditor.element,
  );

  if (!usesSimplifiedBilling) {
    billingSettings.prepend(
      billableLabel,
      billingRateLabel,
      billingPeriodEditor.element,
    );
  }

  billingDetails.append(billingSummary, billingSettings);

  const updateBillableState = () => {
    const isBillable = usesSimplifiedBilling ? false : billableInput.checked;

    billableInput.checked = !usesSimplifiedBilling && isBillable;
    billingRateInput.disabled = !isBillable;
    billingPeriodEditor.setDisabled(!isBillable);
    billingRoundingEditor.setBillableMode(usesSimplifiedBilling ? false : isBillable);
  };

  billableInput.addEventListener("change", updateBillableState);
  updateBillableState();

  const actionGroup = document.createElement("div");
  actionGroup.className = "project-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save Project";
  saveButton.dataset.saveProjectButton = project.id;
  saveButton.addEventListener("click", async () => {
    if (!nameInput.value.trim()) {
      setStatus("Project name is required.");
      return;
    }

    const oldProject = { ...project };
    project.name = nameInput.value.trim();
    project.client_id = clientAssignmentSelect.value;
    project.parent_project_id = parentProjectSelect.value;
    project.status = statusSelect.value;
    project.billable = usesSimplifiedBilling ? "no" : normalizeBillableFlag(billableInput.checked);
    project.billing_rate = usesSimplifiedBilling ? null : normalizeBillingRate(billingRateInput.value);
    project.billing_period = usesSimplifiedBilling ? null : billingPeriodEditor.getValue();
    project.billing_rounding = billingRoundingEditor.getValue();
    project.taskReminderPolicy = reminderPolicyEditor.getValue();

    if ((oldProject.client_id || "") !== (project.client_id || "") || (oldProject.parent_project_id || "") !== (project.parent_project_id || "")) {
      const confirmed = await window.LongtailForge.modal.confirm({
        title: "Move project?",
        message: "Move this project in the client/project hierarchy? Existing time entries assigned to this project will be updated to the new client and project names.",
        confirmLabel: "Move",
        cancelLabel: "Cancel",
      });

      if (!confirmed) {
        project.client_id = oldProject.client_id || "";
        project.parent_project_id = oldProject.parent_project_id || "";
        return;
      }
    }

    await saveProjectRecord(project, {
      action: "project_updated",
      client_id: project.client_id,
      client_name: getProjectClientName(project.client_id),
      project_id: project.id,
      project_name: project.name,
      confirm_downstream_update: true,
      taskReminderPolicy: project.taskReminderPolicy,
      details: `old_project_id=${oldProject.id};old_project_name=${oldProject.name};old_status=${oldProject.status};old_parent_project_id=${oldProject.parent_project_id || ""};new_parent_project_id=${project.parent_project_id || ""};old_billable=${oldProject.billable};old_billing_rate=${oldProject.billing_rate};new_status=${project.status};new_billable=${project.billable};new_billing_rate=${project.billing_rate};billing_period=${formatBillingPeriod(getEffectiveProjectBillingPeriod(client, project))};rounding=${formatBillingRounding(getEffectiveProjectBillingRounding(client, project))};round_hours=${getEffectiveProjectBillingRounding(client, project).enabled ? "yes" : "no"}`,
    }, {
      openClientId: project.client_id || "__workspace_projects__",
      flashSelector: `[data-save-project-button="${project.id}"]`,
    });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Archive";
  deleteButton.className = "danger-button";
  deleteButton.addEventListener("click", async () => {
    const shouldDelete = await window.LongtailForge.modal.confirm({
      title: "Archive project?",
      message: `Archive project "${project.name}"?`,
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      danger: true,
    });

    if (!shouldDelete) {
      return;
    }

    await archiveProjectRecord(project, {
      action: "project_archived",
      client_id: client.isWorkspaceScope ? "" : client.id,
      client_name: client.isWorkspaceScope ? "" : client.name,
      project_id: project.id,
      project_name: project.name,
      details: `status=${project.status};billable=${project.billable};billing_rate=${project.billing_rate}`,
    }, {
      openClientId: client.id,
    });
  });

  actionGroup.append(saveButton, deleteButton);
  if (clientAssignmentLabel.hidden) {
    wrapper.classList.add("project-editor-no-client");
  }
  wrapper.append(
    nameLabel,
    clientAssignmentLabel,
    parentProjectLabel,
    statusLabel,
    clientActions,
    billingDetails,
    actionGroup,
  );
  details.append(summary, wrapper);
  return details;
}

function createProjectClientAssignment(project) {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.className = "project-client-field";
  label.textContent = "Client";
  label.hidden = !clientsEnabledForWorkspace();
  select.appendChild(createOption("", "Workspace project"));
  getRealClients().filter((client) => isActiveStatus(client.status)).forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
  select.value = project.client_id || "";
  label.appendChild(select);
  return label;
}

function createProjectParentAssignment(project, client) {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.className = "project-parent-field";
  label.textContent = "Parent Project";
  populateParentProjectSelect(select, {
    excludedProjectId: project.id,
    clientId: project.client_id || (client.isWorkspaceScope ? "" : client.id),
  });
  select.value = project.parent_project_id || "";
  label.appendChild(select);
  return label;
}

function populateParentProjectSelect(select, { excludedProjectId = "", clientId = "" } = {}) {
  if (!select) {
    return;
  }

  const targetClient = getProjectTargetClient(clientId);
  const excludedIds = excludedProjectId
    ? new Set([excludedProjectId, ...getProjectDescendantIds(excludedProjectId, targetClient)])
    : new Set();
  const currentValue = select.value || "";
  select.replaceChildren(createOption("", "No parent project"));
  sortProjectsForClient(targetClient)
    .filter((project) => !excludedIds.has(project.id) && isActiveStatus(project.status))
    .forEach((project) => {
      select.appendChild(createOption(project.id, `${treeIndent(getProjectDepth(project, targetClient))}${project.name}`));
    });
  select.value = [...select.options].some((option) => option.value === currentValue)
    ? currentValue
    : "";
}

function createAddProjectClientAssignment(client) {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  const select = document.createElement("select");

  wrapper.className = "project-add-client-field";
  wrapper.hidden = !clientsEnabledForWorkspace();
  label.textContent = "Client";
  select.appendChild(createOption("", "Workspace project"));
  getRealClients().filter((realClient) => isActiveStatus(realClient.status)).forEach((realClient) => {
    select.appendChild(createOption(realClient.id, realClient.name));
  });
  select.value = getDefaultProjectClientId(client);
  label.appendChild(select);
  wrapper.append(label, createAddClientShortcutButton());

  return { element: wrapper, select };
}

function createProjectClientShortcutActions(project) {
  const wrapper = document.createElement("div");

  wrapper.className = "project-add-client-actions";
  wrapper.hidden = !clientsEnabledForWorkspace();
  const editClientButton = createEditClientShortcutButton(project.client_id);

  if (editClientButton) {
    wrapper.appendChild(editClientButton);
  }

  wrapper.appendChild(createAddClientShortcutButton());
  return wrapper;
}

function createEditClientShortcutButton(clientId) {
  if (!clientId || !clientsEnabledForWorkspace()) {
    return null;
  }

  const button = document.createElement("button");

  button.type = "button";
  button.textContent = "Edit Client";
  button.addEventListener("click", () => {
    window.location.href = `clients.html?client=${encodeURIComponent(clientId)}`;
  });
  return button;
}

function createAddClientShortcutButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = "Add Client";
  button.addEventListener("click", () => {
    window.location.href = "clients.html?addClient=true";
  });
  return button;
}

function getDefaultProjectClientId(client) {
  if (!clientsEnabledForWorkspace()) {
    return "";
  }

  if (!client.isWorkspaceScope) {
    return client.id;
  }

  const filteredClientId = projectClientFilter?.value || "";
  return getRealClients().some((realClient) => realClient.id === filteredClientId)
    ? filteredClientId
    : "";
}

function getProjectTargetClient(clientId) {
  if (!clientId) {
    return getWorkspaceProjectClient();
  }

  return getRealClients().find((client) => client.id === clientId) || getWorkspaceProjectClient();
}

function getProjectClientName(clientId) {
  if (!clientId) {
    return "";
  }

  return getRealClients().find((client) => client.id === clientId)?.name || "";
}

function createAddProjectForm(client, { onSaved = null, showClientAssignment = false } = {}) {
  const form = document.createElement("form");
  form.className = "add-project-form";
  const usesSimplifiedBilling = usesProjectRoundingOnly();
  const clientAssignment = showClientAssignment
    ? createAddProjectClientAssignment(client)
    : null;
  const parentProjectLabel = createProjectParentAssignment({
    id: "",
    client_id: client.isWorkspaceScope ? "" : client.id,
    parent_project_id: "",
  }, client);

  const nameLabel = document.createElement("label");
  nameLabel.className = "project-name-field";
  nameLabel.textContent = "New Project Name";

  const nameInput = document.createElement("input");
  nameInput.required = true;
  nameLabel.appendChild(nameInput);

  const statusLabel = document.createElement("label");
  statusLabel.className = "project-status-field";
  statusLabel.textContent = "Status";

  const statusSelect = createStatusSelect("Active");
  statusLabel.appendChild(statusSelect);

  const billingRateLabel = document.createElement("label");
  billingRateLabel.textContent = "Billing Rate ($/hour)";

  const billingRateInput = document.createElement("input");
  billingRateInput.inputMode = "decimal";
  billingRateInput.value = getEffectiveClientBillingRate(client);
  billingRateLabel.appendChild(billingRateInput);

  const billableLabel = createBillableCheckbox(client.billable);
  const billableInput = billableLabel.querySelector("input");

  const billingDetails = document.createElement("details");
  billingDetails.className = "project-billing-details";

  const billingSummary = document.createElement("summary");
  billingSummary.textContent = usesSimplifiedBilling ? "Project Rounding" : "Project Billing Settings";

  const billingSettings = document.createElement("div");
  billingSettings.className = "project-billing-settings";

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: getProjectBillingPeriodInheritLabel(client),
    value: null,
    inheritedPeriod: getEffectiveClientBillingPeriod(client),
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: getProjectRoundingInheritLabel(client, { client_id: client.isWorkspaceScope ? "" : client.id }),
    value: null,
    inheritedRounding: client.isWorkspaceScope ? workspaceSettings.billingRounding : getEffectiveClientBillingRounding(client),
    showModeWhenUnbillable: true,
  });

  billingSettings.append(
    billingRoundingEditor.element,
  );

  if (!usesSimplifiedBilling) {
    billingSettings.prepend(
      billableLabel,
      billingRateLabel,
      billingPeriodEditor.element,
    );
  }

  billingDetails.append(billingSummary, billingSettings);

  const updateBillableState = () => {
    const isBillable = usesSimplifiedBilling ? false : billableInput.checked;

    billableInput.checked = !usesSimplifiedBilling && isBillable;
    billingRateInput.disabled = !isBillable;
    billingPeriodEditor.setDisabled(!isBillable);
    billingRoundingEditor.setDisabled(false);
    billingRoundingEditor.setBillableMode(!usesSimplifiedBilling && isBillable);
  };

  billableInput.addEventListener("change", updateBillableState);
  updateBillableState();

  const saveButton = createAddProjectSubmitButton(client.id);
  const formFields = [
    nameLabel,
  ];

  if (clientAssignment) {
    formFields.push(clientAssignment.element);
    clientAssignment.select.addEventListener("change", () => {
      populateParentProjectSelect(parentProjectLabel.querySelector("select"), {
        clientId: clientAssignment.select.value,
      });
    });
    populateParentProjectSelect(parentProjectLabel.querySelector("select"), {
      clientId: clientAssignment.select.value,
    });
  }

  form.append(
    ...formFields,
    parentProjectLabel,
    statusLabel,
    billingDetails,
    saveButton,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedClientId = clientAssignment?.select.value ?? (client.isWorkspaceScope ? "" : client.id);
    const targetClient = getProjectTargetClient(selectedClientId);
    const parentProjectId = parentProjectLabel.querySelector("select").value;
    const project = {
      id: createUuid(),
      client_id: targetClient.isWorkspaceScope ? "" : targetClient.id,
      parent_project_id: parentProjectId,
      name: nameInput.value.trim(),
      billable: usesSimplifiedBilling ? "no" : normalizeBillableFlag(billableInput.checked),
      billing_rate: usesSimplifiedBilling ? null : normalizeBillingRate(billingRateInput.value),
      billing_period: usesSimplifiedBilling ? null : billingPeriodEditor.getValue(),
      billing_rounding: billingRoundingEditor.getValue(),
      status: statusSelect.value,
    };

    targetClient.projects.push(project);

    await createProjectRecord(targetClient, project, {
      action: "project_created",
      client_id: targetClient.isWorkspaceScope ? "" : targetClient.id,
      client_name: targetClient.isWorkspaceScope ? "" : targetClient.name,
      project_id: project.id,
      project_name: project.name,
      details: `status=${project.status};parent_project_id=${project.parent_project_id || ""};billable=${project.billable};billing_rate=${project.billing_rate}`,
    }, {
      openClientId: targetClient.id,
      flashSelector: `[data-add-project-button="${client.id}"]`,
    });
    onSaved?.();
  });

  return form;
}

async function addClient() {
  const clientName = newClientNameInput.value.trim();
  const projectName = newProjectNameInput?.value.trim() || "";

  if (!clientName) {
    setStatus("Client name is required.");
    return;
  }

  if (!isClientsPage && !projectName) {
    setStatus("Client name and project name are required.");
    return;
  }

  const client = {
    id: createUuid(),
    name: clientName,
    parent_client_id: newParentClientSelect?.value || "",
    billable: "yes",
    billing_rate: workspaceSettings.defaultBillingRate,
    billing_period: null,
    billing_rounding: null,
    billing_contact: createEmptyBillingContact(),
    projects: isClientsPage
      ? []
      : [
          {
            id: createUuid(),
            client_id: "",
            name: projectName,
            billable: "yes",
            billing_rate: normalizeBillingRate(newProjectBillingRateInput?.value),
            billing_period: null,
            billing_rounding: null,
            status: newProjectStatusSelect?.value || "Active",
          },
        ],
  };

  clientProjectData.clients.push(client);

  const saved = await createClientRecord(client, {
    action: "client_created",
    client_id: client.id,
    client_name: client.name,
    parent_client_id: client.parent_client_id || "",
    project_id: client.projects[0]?.id || "",
    project_name: client.projects[0]?.name || "",
    details: client.projects[0]
      ? `initial_project_status=${client.projects[0].status};initial_project_billable=${client.projects[0].billable};initial_project_billing_rate=${client.projects[0].billing_rate}`
      : "initial_project_created=false",
  });

  if (saved) {
    clientForm.reset();
    clientModal.close();
  }
}

async function createClientRecord(client, action, viewState = {}) {
  return persistClientProjectChange(action, viewState, async () => {
    const result = await window.LongtailForge.api.postJson("/api/clients", {
      ...client,
      action,
    });

    if (client.projects.length > 0) {
      await window.LongtailForge.api.postJson(
        `/api/clients/${encodeURIComponent(result.client.id)}/projects`,
        {
          ...client.projects[0],
          action: {
            action: "project_created",
            client_id: client.id,
            client_name: client.name,
            project_id: client.projects[0].id,
            project_name: client.projects[0].name,
            details: action.details,
          },
        },
      );
    }
  });
}

async function saveClientRecord(client, action, viewState = {}) {
  return persistClientProjectChange(action, viewState, async () => {
    await window.LongtailForge.api.putJson(
      `/api/clients/${encodeURIComponent(client.id)}`,
      {
        ...client,
        action,
      },
    );
  });
}

async function createProjectRecord(client, project, action, viewState = {}) {
  return persistClientProjectChange(action, viewState, async () => {
    const url = client.isWorkspaceScope
      ? "/api/projects"
      : `/api/clients/${encodeURIComponent(client.id)}/projects`;

    await window.LongtailForge.api.postJson(
      url,
      {
        ...project,
        action,
      },
    );
  });
}

async function saveProjectRecord(project, action, viewState = {}) {
  return persistClientProjectChange(action, viewState, async () => {
    await window.LongtailForge.api.putJson(
      `/api/projects/${encodeURIComponent(project.id)}`,
      {
        ...project,
        action,
      },
    );
  });
}

async function archiveProjectRecord(project, action, viewState = {}) {
  return persistClientProjectChange(action, viewState, async () => {
    await window.LongtailForge.api.deleteJson(
      `/api/projects/${encodeURIComponent(project.id)}`,
    );
  });
}

async function persistClientProjectChange(action, viewState = {}, request) {
  // Mutations are record-level; the nested tree is refreshed only as a read model.
  setStatus("Saving clients and projects...");

  try {
    await request();
    await refreshClientProjectData();
    openClientId = viewState.openClientId || action.client_id || "";
    openBillingClientId = viewState.openBillingClientId || "";
    openClientBillingSettingsId = viewState.openClientBillingSettingsId || "";
    renderClients();
    setStatus("");
    flashSavedButton(viewState.flashSelector);
    return true;
  } catch (error) {
    setStatus(error.message || "Clients and projects were not saved. Start the local server and try again.");
    console.error(error);
    return false;
  }
}

async function refreshClientProjectData() {
  const result = await window.LongtailForge.api.getJson("/api/client-projects", {
    cache: "no-store",
  });

  clientProjectData = normalizeData(result);
  renderProjectClientFilter();
}

function flashSavedButton(selector) {
  // Keep success feedback attached to the button that initiated the save.
  if (!selector) {
    return;
  }

  const button = document.querySelector(selector);

  if (!button) {
    return;
  }

  const originalText = button.textContent;
  button.textContent = "Saved.";
  button.classList.add("is-saved");

  window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove("is-saved");
  }, 1600);
}

function applyInitialClientParam() {
  const clientId = new URLSearchParams(window.location.search).get("client") || "";

  if (clientProjectData.clients.some((client) => client.id === clientId)) {
    openClientId = clientId;
    if (isProjectsPage && projectClientFilter) {
      projectClientFilter.value = clientId;
    }
  }
}

function normalizeData(data) {
  // Normalize immediately after every load/save so render code can trust field shapes.
  const workspaceProjects = normalizeProjects(data.workspaceProjects || [], "yes", "");
  const clients = Array.isArray(data.clients)
    ? data.clients.map((client) => {
        const clientBillable = normalizeBillableFlag(client.billable);

        return {
          id: client.id,
          name: client.name,
          parent_client_id: client.parent_client_id || "",
          status: clientStatuses.includes(client.status) ? client.status : "Active",
          billable: clientBillable,
          billing_rate: normalizeBillingRate(client.billing_rate),
          billing_period: normalizeOptionalBillingPeriod(client.billing_period),
          billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
          billing_contact: normalizeBillingContact(client.billing_contact),
          taskReminderPolicy: normalizeTaskReminderPolicy(client.taskReminderPolicy),
          projects: normalizeProjects(client.projects || [], clientBillable, client.id),
        };
      })
    : [];

  if (isProjectsPage && (workspaceProjects.length > 0 || clients.length === 0)) {
    const simplifiedBilling = usesProjectRoundingOnly();

    clients.unshift({
      id: "__workspace_projects__",
      name: workspaceProjectsLabel(),
      status: "Active",
      billable: simplifiedBilling ? "no" : "yes",
      billing_rate: simplifiedBilling ? null : normalizeBillingRate(workspaceSettings.defaultBillingRate),
      billing_period: simplifiedBilling ? null : normalizeOptionalBillingPeriod(workspaceSettings.billingPeriod),
      billing_rounding: normalizeOptionalBillingRounding(workspaceSettings.billingRounding),
      billing_contact: normalizeBillingContact({}),
      taskReminderPolicy: normalizeTaskReminderPolicy({ inherited: true }),
      isWorkspaceScope: true,
      projects: workspaceProjects,
    });
  }

  return {
    clients,
  };
}

function normalizeProjects(projects, clientBillable, clientId) {
  return Array.isArray(projects)
    ? projects.map((project) => ({
        id: project.id,
        client_id: project.client_id || clientId || "",
        parent_project_id: project.parent_project_id || "",
        name: project.name,
        billable: usesProjectRoundingOnly() ? "no" : normalizeBillableFlag(project.billable, clientBillable),
        billing_rate: usesProjectRoundingOnly() ? null : normalizeBillingRate(project.billing_rate),
        billing_period: usesProjectRoundingOnly() ? null : normalizeOptionalBillingPeriod(project.billing_period),
        billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
        taskReminderPolicy: normalizeTaskReminderPolicy(project.taskReminderPolicy),
        status: projectStatuses.includes(project.status)
          ? project.status
          : "Active",
      }))
    : [];
}

function normalizeSettings(settings) {
  return {
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    workspaceType: ["business", "personal", "family"].includes(settings?.workspaceType)
      ? settings.workspaceType
      : "business",
  };
}

function normalizeTaskReminderPolicy(policy) {
  return {
    inherited: policy?.inherited !== false,
    dateTime: normalizeReminderOffsetList(policy?.offsets?.dateTime || policy?.dateTime || policy?.date_time, [120, 1440]),
    dateOnly: normalizeReminderOffsetList(policy?.offsets?.dateOnly || policy?.dateOnly || policy?.date_only, [4320, 1440]),
  };
}

function normalizeReminderOffsetList(values, fallback) {
  const offsets = (Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 2);

  return offsets.length > 0 ? offsets : [...fallback];
}

function clientsEnabledForWorkspace() {
  return workspaceSettings.workspaceType === "business";
}

function isActiveStatus(status) {
  return String(status || "").trim().toLowerCase() === "active";
}

function usesProjectRoundingOnly() {
  return !clientsEnabledForWorkspace();
}

function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeBillableFlag(value, fallback = "yes") {
  if (value === false || value === "no") {
    return "no";
  }

  if (value === true || value === "yes") {
    return "yes";
  }

  return fallback === "no" ? "no" : "yes";
}

function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return normalizeBillingPeriod(period);
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment)
    ? rounding.increment
    : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

function normalizeOptionalBillingRounding(rounding) {
  if (!rounding || rounding.type === "inherit") {
    return null;
  }

  return normalizeBillingRounding(rounding);
}

function createTaskReminderPolicyEditor({ legend, inheritLabel, value }) {
  const fieldset = document.createElement("fieldset");
  const legendElement = document.createElement("legend");
  const inheritOption = document.createElement("label");
  const inheritInput = document.createElement("input");
  const grid = document.createElement("div");
  const normalized = normalizeTaskReminderPolicy(value);
  const timedHours = normalized.dateTime.map((minutes) => Math.round(minutes / 60));
  const dateOnlyDays = normalized.dateOnly.map((minutes) => Math.round(minutes / 1440));
  const timedFirst = createNumberField("Timed Reminder 1 (hours before)", timedHours[0] || 2);
  const timedSecond = createNumberField("Timed Reminder 2 (hours before)", timedHours[1] || 24);
  const dateOnlyFirst = createNumberField("Date-Only Reminder 1 (days before)", dateOnlyDays[0] || 3);
  const dateOnlySecond = createNumberField("Date-Only Reminder 2 (days before)", dateOnlyDays[1] || 1);

  fieldset.className = "billing-period-editor task-reminder-policy-editor";
  legendElement.textContent = legend;
  inheritOption.className = "inline-option";
  inheritInput.type = "checkbox";
  inheritInput.checked = normalized.inherited;
  inheritOption.append(inheritInput, document.createTextNode(` ${inheritLabel}`));
  grid.className = "reminder-offset-grid";
  grid.append(timedFirst.label, timedSecond.label, dateOnlyFirst.label, dateOnlySecond.label);

  const updateState = () => {
    grid.hidden = inheritInput.checked;
  };

  inheritInput.addEventListener("change", updateState);
  updateState();
  fieldset.append(legendElement, inheritOption, grid);

  return {
    element: fieldset,
    getValue: () => ({
      inherited: inheritInput.checked,
      dateTime: [
        readPositiveInteger(timedFirst.input, 2) * 60,
        readPositiveInteger(timedSecond.input, 24) * 60,
      ],
      dateOnly: [
        readPositiveInteger(dateOnlyFirst.input, 3) * 1440,
        readPositiveInteger(dateOnlySecond.input, 1) * 1440,
      ],
    }),
  };
}

function createNumberField(text, value) {
  const label = document.createElement("label");
  const input = document.createElement("input");

  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = String(value);
  label.append(text, input);
  return { label, input };
}

function readPositiveInteger(input, fallback) {
  return Math.max(1, Number.parseInt(input?.value, 10) || fallback);
}

function createBillingPeriodEditor({ legend, inheritLabel, value, inheritedPeriod }) {
  // Reusable editor used at both client and project levels with an explicit inherit mode.
  const fieldset = document.createElement("fieldset");
  fieldset.className = "billing-period-editor";
  fieldset.dataset.billingPeriodEditor = "";

  const legendElement = document.createElement("legend");
  legendElement.textContent = legend;

  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Type";

  const typeSelect = document.createElement("select");
  typeSelect.append(
    createOption("inherit", inheritLabel),
    createOption("calendarMonth", "Calendar month"),
    createOption("custom", "Custom"),
  );
  typeSelect.value = value?.type || "inherit";
  typeLabel.appendChild(typeSelect);

  const startDayLabel = document.createElement("label");
  startDayLabel.textContent = "Start Day";

  const startDaySelect = document.createElement("select");
  populateBillingPeriodStartDays(startDaySelect);
  startDaySelect.value = String(value?.startDay || inheritedPeriod.startDay || 1);
  startDayLabel.appendChild(startDaySelect);

  const inheritedHint = document.createElement("p");
  inheritedHint.className = "inherited-setting";

  const updateState = () => {
    const isCustom = typeSelect.value === "custom";
    startDayLabel.hidden = !isCustom;
    startDaySelect.disabled = !isCustom;
    inheritedHint.textContent = typeSelect.value === "inherit"
      ? `Effective billing period: ${formatBillingPeriod(inheritedPeriod)}`
      : "";

    if (typeSelect.value === "calendarMonth") {
      startDaySelect.value = "1";
    }
  };

  typeSelect.addEventListener("change", updateState);
  updateState();

  fieldset.append(legendElement, typeLabel, startDayLabel, inheritedHint);

  const editor = {
    element: fieldset,
    setDisabled(isDisabled) {
      fieldset.disabled = Boolean(isDisabled);
    },
    getValue() {
      if (typeSelect.value === "inherit") {
        return null;
      }

      return normalizeBillingPeriod({
        type: typeSelect.value,
        startDay: startDaySelect.value,
      });
    },
  };

  fieldset.billingPeriodEditor = editor;
  return editor;
}

function createBillingRoundingEditor({
  legend,
  inheritLabel,
  value,
  inheritedRounding,
  showModeWhenUnbillable = false,
}) {
  // Rounding follows the same inheritance model as billing period.
  const fieldset = document.createElement("fieldset");
  fieldset.className = "billing-period-editor";
  fieldset.dataset.billingRoundingEditor = "";
  let isBillableMode = true;

  const legendElement = document.createElement("legend");
  legendElement.textContent = legend;

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Mode";

  const modeSelect = document.createElement("select");
  modeSelect.append(
    createOption("inherit", inheritLabel),
    createOption("exact", "Do not round"),
    createOption("round", "Round"),
  );
  modeSelect.value = value ? (value.enabled ? "round" : "exact") : "inherit";
  modeLabel.appendChild(modeSelect);

  const roundHoursLabel = document.createElement("label");
  roundHoursLabel.className = "inline-option";

  const roundHoursInput = document.createElement("input");
  roundHoursInput.type = "checkbox";
  roundHoursInput.checked = value ? value.enabled : normalizeBillingRounding(inheritedRounding).enabled;
  roundHoursLabel.append(
    roundHoursInput,
    document.createTextNode("Round hours?"),
  );

  const incrementLabel = document.createElement("label");
  incrementLabel.textContent = "Rounding Increment";

  const incrementSelect = document.createElement("select");
  incrementSelect.append(
    createOption("nearestQuarterHour", "Nearest quarter hour"),
    createOption("nearestHalfHour", "Nearest half hour"),
    createOption("nearestHour", "Nearest hour"),
  );
  incrementSelect.value = value?.increment || inheritedRounding.increment || "nearestQuarterHour";
  incrementLabel.appendChild(incrementSelect);

  const inheritedHint = document.createElement("p");
  inheritedHint.className = "inherited-setting";

  const getSelectedMode = () => (isBillableMode || showModeWhenUnbillable)
    ? modeSelect.value
    : (roundHoursInput.checked ? "round" : "exact");

  const syncRoundHoursFromMode = () => {
    if (modeSelect.value === "inherit") {
      roundHoursInput.checked = normalizeBillingRounding(inheritedRounding).enabled;
      return;
    }

    roundHoursInput.checked = modeSelect.value === "round";
  };

  const updateState = () => {
    const selectedMode = getSelectedMode();
    modeLabel.hidden = !isBillableMode && !showModeWhenUnbillable;
    roundHoursLabel.hidden = isBillableMode;
    incrementLabel.hidden = selectedMode !== "round";
    incrementSelect.disabled = selectedMode !== "round";
    inheritedHint.textContent = selectedMode === "inherit"
      ? `Effective rounding: ${formatBillingRounding(inheritedRounding)}`
      : "";
  };

  modeSelect.addEventListener("change", () => {
    syncRoundHoursFromMode();
    updateState();
  });
  roundHoursInput.addEventListener("change", () => {
    modeSelect.value = roundHoursInput.checked ? "round" : "exact";
    updateState();
  });
  updateState();

  fieldset.append(legendElement, roundHoursLabel, modeLabel, incrementLabel, inheritedHint);

  const editor = {
    element: fieldset,
    setDisabled(isDisabled) {
      fieldset.disabled = Boolean(isDisabled);
    },
    setBillableMode(isBillable) {
      isBillableMode = Boolean(isBillable);
      fieldset.disabled = false;
      syncRoundHoursFromMode();
      updateState();
    },
    getValue() {
      const selectedMode = modeSelect.value;

      if (selectedMode === "inherit") {
        return null;
      }

      return normalizeBillingRounding({
        enabled: selectedMode === "round",
        increment: incrementSelect.value,
      });
    },
  };

  fieldset.billingRoundingEditor = editor;
  return editor;
}

function populateBillingPeriodStartDays(select) {
  for (let day = 1; day <= 28; day += 1) {
    select.appendChild(createOption(String(day), formatOrdinal(day)));
  }
}

function getEffectiveClientBillingPeriod(client) {
  return client.billing_period || workspaceSettings.billingPeriod;
}

function getEffectiveClientBillingRate(client) {
  return client.billing_rate || workspaceSettings.defaultBillingRate;
}

function getEffectiveProjectBillingPeriod(client, project) {
  return project.billing_period || getEffectiveClientBillingPeriod(client);
}

function getProjectBillingPeriodInheritLabel(client) {
  const label = client.isWorkspaceScope ? "workspace" : "client";

  return `Use ${label} billing period (${formatBillingPeriod(getEffectiveClientBillingPeriod(client))})`;
}

function getEffectiveClientBillingRounding(client) {
  return client.billing_rounding || workspaceSettings.billingRounding;
}

function getEffectiveProjectBillingRounding(client, project) {
  if (!project?.client_id) {
    return project.billing_rounding || workspaceSettings.billingRounding;
  }

  return project.billing_rounding || getEffectiveClientBillingRounding(client);
}

function getProjectRoundingInheritLabel(client, project) {
  const inheritsWorkspace = client.isWorkspaceScope || !project?.client_id;
  const inheritedRounding = inheritsWorkspace
    ? workspaceSettings.billingRounding
    : getEffectiveClientBillingRounding(client);
  const label = inheritsWorkspace ? "workspace" : "client";

  return `Use ${label} rounding (${formatBillingRounding(inheritedRounding)})`;
}

function formatBillingPeriod(period) {
  const normalizedPeriod = normalizeBillingPeriod(period);

  if (normalizedPeriod.type === "calendarMonth") {
    return "Calendar month";
  }

  return `Starts on the ${formatOrdinal(normalizedPeriod.startDay)}`;
}

function formatBillingRounding(rounding) {
  const normalizedRounding = normalizeBillingRounding(rounding);

  if (!normalizedRounding.enabled) {
    return "No rounding";
  }

  return {
    nearestHour: "Nearest hour",
    nearestHalfHour: "Nearest half hour",
    nearestQuarterHour: "Nearest quarter hour",
  }[normalizedRounding.increment];
}

function formatOrdinal(day) {
  const suffix = day % 10 === 1 && day !== 11
    ? "st"
    : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
        ? "rd"
        : "th";

  return `${day}${suffix}`;
}

function normalizeBillingContact(contact) {
  return billingContactFields.reduce((billingContact, [fieldName]) => {
    billingContact[fieldName] = contact?.[fieldName] || "";
    return billingContact;
  }, {});
}

function createBillableCheckbox(value) {
  const label = document.createElement("label");
  label.className = "inline-option billable-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = normalizeBillableFlag(value) === "yes";

  label.append(
    input,
    document.createTextNode("Billable?"),
  );

  return label;
}

function createEmptyBillingContact() {
  return normalizeBillingContact({});
}

function createStatusSelect(value) {
  const select = document.createElement("select");

  projectStatuses.forEach((status) => {
    const option = createOption(status, status);
    option.selected = status === value;
    select.appendChild(option);
  });

  return select;
}

function createClientStatusSelect(value) {
  const select = document.createElement("select");

  clientStatuses.forEach((status) => {
    const option = createOption(status, status);
    option.selected = status === value;
    select.appendChild(option);
  });

  return select;
}

function createOption(value, text) {
  return window.LongtailForge.pageController.createOption(value, text);
}

function sortByName(items) {
  return window.LongtailForge.pageController.sortByName(items);
}

function workspaceProjectsLabel() {
  return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
}

function createUuid() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (
      Number(character) ^
      (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(character) / 4)))
    ).toString(16),
  );
}

function isAddClientFormDirty() {
  return Boolean(
      newClientNameInput.value.trim() ||
      newProjectNameInput?.value.trim() ||
      newProjectBillingRateInput?.value.trim() ||
      (newProjectStatusSelect && newProjectStatusSelect.value !== "Active"),
  );
}

function setStatus(message) {
  window.LongtailForge.pageController.setStatus(statusMessage, message);
}

window.LongtailForge.pageController.register("clients-projects", {
  snapshot: () => ({
    clientCount: clientProjectData.clients.length,
    mode: pageMode,
    openClientId,
    workspaceProjectCount: clientProjectData.workspaceProjects?.length || 0,
    workspaceType: workspaceSettings.workspaceType,
  }),
  runSmoke: () => {
    const checks = [
      { name: "client list exists", ok: Boolean(clientList) },
      { name: "status target exists", ok: Boolean(statusMessage) },
      { name: "client data loaded", ok: Array.isArray(clientProjectData.clients) },
      { name: "page mode known", ok: ["combined", "clients", "projects"].includes(pageMode) },
    ];

    return {
      ok: checks.every((check) => check.ok),
      pageId: "clients-projects",
      checks,
    };
  },
});
