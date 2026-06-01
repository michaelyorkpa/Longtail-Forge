// Clients & Projects is the main editor for client, project, and billing metadata.
const clientList = document.querySelector("[data-client-list]");
const addClientButton = document.querySelector("[data-add-client]");
const clientStatusFilter = document.querySelector("[data-client-status-filter]");
const projectClientFilter = document.querySelector("[data-project-client-filter]");
const bulkProjectStatusSelect = document.querySelector("[data-bulk-project-status]");
const bulkProjectClientSelect = document.querySelector("[data-bulk-project-client]");
const bulkProjectBillableSelect = document.querySelector("[data-bulk-project-billable]");
const applyProjectBulkButton = document.querySelector("[data-apply-project-bulk]");
const statusMessage = document.querySelector("[data-client-project-status]");
const clientModal = document.querySelector("[data-client-modal]");
const clientForm = document.querySelector("[data-client-form]");
const newClientNameInput = document.querySelector("[data-new-client-name]");
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
let organizationSettings = {
  defaultBillingRate: "",
  billingPeriod: { type: "calendarMonth", startDay: 1 },
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
  workspaceType: "business",
};
let openClientId = "";
let openBillingClientId = "";
let openClientBillingSettingsId = "";

loadPageData();

clientStatusFilter.addEventListener("change", renderClients);

if (projectClientFilter) {
  projectClientFilter.addEventListener("change", renderClients);
}

if (applyProjectBulkButton) {
  applyProjectBulkButton.addEventListener("click", applyBulkProjectUpdate);
}

if (addClientButton) {
  addClientButton.addEventListener("click", () => {
    clientForm.reset();

    if (newProjectBillingRateInput) {
      newProjectBillingRateInput.value = organizationSettings.defaultBillingRate;
    }

    clientModal.showModal();
    newClientNameInput.focus();
  });
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

    organizationSettings = normalizeSettings(settingsData);
    clientProjectData = normalizeData(clientsData);
    renderProjectClientFilter();
    applyInitialClientParam();
    renderClients();
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

  const visibleClients = sortByName(clientProjectData.clients).filter((client) =>
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
  const projects = getAllProjects()
    .filter(({ project }) => clientStatusFilter.value === "All" || project.status === clientStatusFilter.value)
    .filter(({ client }) => (
      !projectClientFilter ||
      projectClientFilter.value === "All" ||
      client.id === projectClientFilter.value
    ));
  const workspaceClient = getWorkspaceProjectClient();
  const addProjectPanel = document.createElement("details");
  const addProjectSummary = document.createElement("summary");
  const projectList = document.createElement("div");

  addProjectPanel.className = "client-item";
  addProjectSummary.textContent = "Add Workspace Project";
  addProjectPanel.append(addProjectSummary, createAddProjectForm(workspaceClient));
  projectList.className = "project-list project-list-flat";
  clientList.appendChild(addProjectPanel);

  if (projects.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.className = "placeholder-copy";
    emptyMessage.textContent = "No projects match this filter.";
    clientList.appendChild(emptyMessage);
    return;
  }

  sortByName(projects.map(({ project }) => project)).forEach((project) => {
    const projectClient = projects.find((item) => item.project.id === project.id)?.client || workspaceClient;
    projectList.appendChild(createProjectEditor(projectClient, project));
  });
  clientList.appendChild(projectList);
}

async function applyBulkProjectUpdate() {
  const selectedProjectIds = [...document.querySelectorAll("[data-project-bulk-select]:checked")]
    .map((checkbox) => checkbox.dataset.projectBulkSelect);
  const status = bulkProjectStatusSelect?.value || "";
  const clientId = bulkProjectClientSelect?.value === "__workspace__" ? "" : bulkProjectClientSelect?.value || "";
  const billable = bulkProjectBillableSelect?.value || "";
  const shouldChangeClient = bulkProjectClientSelect && bulkProjectClientSelect.selectedIndex > 0;

  if (selectedProjectIds.length === 0) {
    setStatus("Select at least one project.");
    return;
  }

  if (!status && !shouldChangeClient && !billable) {
    setStatus("Choose a bulk change before applying.");
    return;
  }

  setStatus("Updating selected projects...");
  applyProjectBulkButton.disabled = true;

  try {
    for (const projectId of selectedProjectIds) {
      const project = findProjectById(projectId);

      if (!project) {
        continue;
      }

      const nextProject = {
        ...project,
        status: status || project.status,
        client_id: shouldChangeClient ? clientId : project.client_id,
        billable: billable || project.billable,
        action: {
          action: "projects_bulk_updated",
          project_id: project.id,
          project_name: project.name,
          client_id: shouldChangeClient ? clientId : project.client_id,
          client_name: shouldChangeClient ? getProjectClientName(clientId) : getProjectClientName(project.client_id),
          details: `bulk_status=${status || "unchanged"};bulk_client=${shouldChangeClient ? clientId || "workspace" : "unchanged"};bulk_billable=${billable || "unchanged"}`,
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
  } finally {
    applyProjectBulkButton.disabled = false;
  }
}

function findProjectById(projectId) {
  return getAllProjects().find(({ project }) => project.id === projectId)?.project || null;
}

function renderProjectClientFilter() {
  if (!projectClientFilter) {
    return;
  }

  projectClientFilter.closest("label").hidden = !clientsEnabledForWorkspace();

  const previousValue = projectClientFilter.value || "All";
  projectClientFilter.replaceChildren(createOption("All", "All clients"));
  projectClientFilter.appendChild(createOption("__workspace_projects__", "Workspace Projects"));

  getRealClients().forEach((client) => {
    projectClientFilter.appendChild(createOption(client.id, client.name));
  });

  projectClientFilter.value = [...projectClientFilter.options].some((option) => option.value === previousValue)
    ? previousValue
    : "All";

  renderBulkClientOptions();
}

function renderBulkClientOptions() {
  if (!bulkProjectClientSelect) {
    return;
  }

  const previousValue = bulkProjectClientSelect.value || "";
  bulkProjectClientSelect.replaceChildren(
    createOption("", "No client change"),
    createOption("__workspace__", "Workspace project"),
  );

  getRealClients().forEach((client) => {
    bulkProjectClientSelect.appendChild(createOption(client.id, client.name));
  });
  bulkProjectClientSelect.closest("label").hidden = !clientsEnabledForWorkspace();

  bulkProjectClientSelect.value = [...bulkProjectClientSelect.options].some((option) => option.value === previousValue)
    ? previousValue
    : "";
}

function getAllProjects() {
  return clientProjectData.clients.flatMap((client) => (
    (client.projects || []).map((project) => ({ client, project }))
  ));
}

function getRealClients() {
  return clientProjectData.clients.filter((client) => !client.isWorkspaceScope);
}

function getWorkspaceProjectClient() {
  return clientProjectData.clients.find((client) => client.isWorkspaceScope) || {
    id: "__workspace_projects__",
    name: "Workspace Projects",
    status: "Active",
    billable: "yes",
    billing_rate: normalizeBillingRate(organizationSettings.defaultBillingRate),
    billing_period: normalizeOptionalBillingPeriod(organizationSettings.billingPeriod),
    billing_rounding: normalizeOptionalBillingRounding(organizationSettings.billingRounding),
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

  wrapper.append(label, statusLabel);

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
    inheritLabel: `Use workspace billing period (${formatBillingPeriod(organizationSettings.billingPeriod)})`,
    value: client.billing_period,
    inheritedPeriod: organizationSettings.billingPeriod,
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: `Use workspace rounding (${formatBillingRounding(organizationSettings.billingRounding)})`,
    value: client.billing_rounding,
    inheritedRounding: organizationSettings.billingRounding,
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

    await saveClientRecord(client, {
      action: "client_billing_settings_updated",
      client_id: client.id,
      client_name: client.name,
      details: `billable=${client.billable};billing_rate=${client.billing_rate};billing_period=${formatBillingPeriod(getEffectiveClientBillingPeriod(client))};rounding=${formatBillingRounding(getEffectiveClientBillingRounding(client))};round_hours=${getEffectiveClientBillingRounding(client).enabled ? "yes" : "no"}`,
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
  const billingRateInput = container?.querySelector("[data-client-billing-rate-input]");
  const billableInput = container?.querySelector("[data-client-billable-input]");

  if (!nameInput?.value.trim()) {
    setStatus("Client name is required.");
    return false;
  }

  const oldClient = { ...client };
  client.name = nameInput.value.trim();
  client.status = statusSelect?.value || client.status;

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

  sortByName(client.projects).forEach((project) => {
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

  sortByName(client.projects).forEach((project) => {
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

  summaryLabel.textContent = project.name;

  if (isProjectsPage) {
    const bulkCheckbox = document.createElement("input");

    bulkCheckbox.type = "checkbox";
    bulkCheckbox.dataset.projectBulkSelect = project.id;
    bulkCheckbox.addEventListener("click", (event) => event.stopPropagation());
    summary.append(bulkCheckbox, summaryLabel);
  } else {
    summary.appendChild(summaryLabel);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "project-editor";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Project Name";

  const nameInput = document.createElement("input");
  nameInput.value = project.name;
  nameLabel.appendChild(nameInput);

  const statusLabel = document.createElement("label");
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

  const billingDetails = document.createElement("details");
  billingDetails.className = "project-billing-details";

  const billingSummary = document.createElement("summary");
  billingSummary.textContent = "Project Billing Settings";

  const billingSettings = document.createElement("div");
  billingSettings.className = "project-billing-settings";

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: `Use client billing period (${formatBillingPeriod(getEffectiveClientBillingPeriod(client))})`,
    value: project.billing_period,
    inheritedPeriod: getEffectiveClientBillingPeriod(client),
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: `Use client rounding (${formatBillingRounding(getEffectiveClientBillingRounding(client))})`,
    value: project.billing_rounding,
    inheritedRounding: getEffectiveClientBillingRounding(client),
    showModeWhenUnbillable: true,
  });

  billingSettings.append(
    billableLabel,
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
  );
  billingDetails.append(billingSummary, billingSettings);

  const updateBillableState = () => {
    const isBillable = billableInput.checked;
    billingRateInput.disabled = !isBillable;
    billingPeriodEditor.setDisabled(!isBillable);
    billingRoundingEditor.setBillableMode(isBillable);
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
    project.client_id = clientAssignmentLabel.querySelector("select").value;
    project.status = statusSelect.value;
    project.billable = normalizeBillableFlag(billableInput.checked);
    project.billing_rate = normalizeBillingRate(billingRateInput.value);
    project.billing_period = billingPeriodEditor.getValue();
    project.billing_rounding = billingRoundingEditor.getValue();

    await saveProjectRecord(project, {
      action: "project_updated",
      client_id: project.client_id,
      client_name: getProjectClientName(project.client_id),
      project_id: project.id,
      project_name: project.name,
      details: `old_project_id=${oldProject.id};old_project_name=${oldProject.name};old_status=${oldProject.status};old_billable=${oldProject.billable};old_billing_rate=${oldProject.billing_rate};new_status=${project.status};new_billable=${project.billable};new_billing_rate=${project.billing_rate};billing_period=${formatBillingPeriod(getEffectiveProjectBillingPeriod(client, project))};rounding=${formatBillingRounding(getEffectiveProjectBillingRounding(client, project))};round_hours=${getEffectiveProjectBillingRounding(client, project).enabled ? "yes" : "no"}`,
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
  wrapper.append(
    nameLabel,
    clientAssignmentLabel,
    statusLabel,
    billingDetails,
    actionGroup,
  );
  details.append(summary, wrapper);
  return details;
}

function createProjectClientAssignment(project) {
  const label = document.createElement("label");
  const select = document.createElement("select");

  label.textContent = "Client";
  label.hidden = !clientsEnabledForWorkspace();
  select.appendChild(createOption("", "Workspace project"));
  getRealClients().forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
  select.value = project.client_id || "";
  label.appendChild(select);
  return label;
}

function getProjectClientName(clientId) {
  if (!clientId) {
    return "";
  }

  return getRealClients().find((client) => client.id === clientId)?.name || "";
}

function createAddProjectForm(client) {
  const form = document.createElement("form");
  form.className = "add-project-form";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "New Project";

  const nameInput = document.createElement("input");
  nameInput.required = true;
  nameLabel.appendChild(nameInput);

  const statusLabel = document.createElement("label");
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
  billingSummary.textContent = "Project Billing Settings";

  const billingSettings = document.createElement("div");
  billingSettings.className = "project-billing-settings";

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: `Use client billing period (${formatBillingPeriod(getEffectiveClientBillingPeriod(client))})`,
    value: null,
    inheritedPeriod: getEffectiveClientBillingPeriod(client),
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: `Use client rounding (${formatBillingRounding(getEffectiveClientBillingRounding(client))})`,
    value: null,
    inheritedRounding: getEffectiveClientBillingRounding(client),
    showModeWhenUnbillable: true,
  });

  billingSettings.append(
    billableLabel,
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
  );
  billingDetails.append(billingSummary, billingSettings);

  const updateBillableState = () => {
    const isBillable = billableInput.checked;
    billingRateInput.disabled = !isBillable;
    billingPeriodEditor.setDisabled(!isBillable);
    billingRoundingEditor.setDisabled(!isBillable);
  };

  billableInput.addEventListener("change", updateBillableState);
  updateBillableState();

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Add Project";
  saveButton.dataset.addProjectButton = client.id;

  form.append(
    nameLabel,
    statusLabel,
    billingDetails,
    saveButton,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const project = {
      id: createUuid(),
      client_id: client.isWorkspaceScope ? "" : client.id,
      name: nameInput.value.trim(),
      billable: normalizeBillableFlag(billableInput.checked),
      billing_rate: normalizeBillingRate(billingRateInput.value),
      billing_period: billingPeriodEditor.getValue(),
      billing_rounding: billingRoundingEditor.getValue(),
      status: statusSelect.value,
    };

    client.projects.push(project);

    await createProjectRecord(client, project, {
      action: "project_created",
      client_id: client.isWorkspaceScope ? "" : client.id,
      client_name: client.isWorkspaceScope ? "" : client.name,
      project_id: project.id,
      project_name: project.name,
      details: `status=${project.status};billable=${project.billable};billing_rate=${project.billing_rate}`,
    }, {
      openClientId: client.id,
      flashSelector: `[data-add-project-button="${client.id}"]`,
    });
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
    billable: "yes",
    billing_rate: organizationSettings.defaultBillingRate,
    billing_period: null,
    billing_rounding: null,
    billing_contact: createEmptyBillingContact(),
    projects: isClientsPage
      ? []
      : [
          {
            id: createUuid(),
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
    setStatus("Clients and projects were not saved. Start the local server and try again.");
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
          status: clientStatuses.includes(client.status) ? client.status : "Active",
          billable: clientBillable,
          billing_rate: normalizeBillingRate(client.billing_rate),
          billing_period: normalizeOptionalBillingPeriod(client.billing_period),
          billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
          billing_contact: normalizeBillingContact(client.billing_contact),
          projects: normalizeProjects(client.projects || [], clientBillable, client.id),
        };
      })
    : [];

  if (isProjectsPage && (workspaceProjects.length > 0 || clients.length === 0)) {
    clients.unshift({
      id: "__workspace_projects__",
      name: "Workspace Projects",
      status: "Active",
      billable: "yes",
      billing_rate: normalizeBillingRate(organizationSettings.defaultBillingRate),
      billing_period: normalizeOptionalBillingPeriod(organizationSettings.billingPeriod),
      billing_rounding: normalizeOptionalBillingRounding(organizationSettings.billingRounding),
      billing_contact: normalizeBillingContact({}),
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
        name: project.name,
        billable: normalizeBillableFlag(project.billable, clientBillable),
        billing_rate: normalizeBillingRate(project.billing_rate),
        billing_period: normalizeOptionalBillingPeriod(project.billing_period),
        billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
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

function clientsEnabledForWorkspace() {
  return organizationSettings.workspaceType === "business";
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
  return client.billing_period || organizationSettings.billingPeriod;
}

function getEffectiveClientBillingRate(client) {
  return client.billing_rate || organizationSettings.defaultBillingRate;
}

function getEffectiveProjectBillingPeriod(client, project) {
  return project.billing_period || getEffectiveClientBillingPeriod(client);
}

function getEffectiveClientBillingRounding(client) {
  return client.billing_rounding || organizationSettings.billingRounding;
}

function getEffectiveProjectBillingRounding(client, project) {
  return project.billing_rounding || getEffectiveClientBillingRounding(client);
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
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function sortByName(items) {
  return [...items].sort((firstItem, secondItem) =>
    firstItem.name.localeCompare(secondItem.name, undefined, {
      sensitivity: "base",
    }),
  );
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
  statusMessage.textContent = message;
}
