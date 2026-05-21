const clientList = document.querySelector("[data-client-list]");
const addClientButton = document.querySelector("[data-add-client]");
const clientStatusFilter = document.querySelector("[data-client-status-filter]");
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
let appSettings = {
  defaultBillingRate: "",
  billingPeriod: { type: "calendarMonth", startDay: 1 },
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
};
let openClientId = "";
let openBillingClientId = "";
let openClientBillingSettingsId = "";

loadPageData();

clientStatusFilter.addEventListener("change", renderClients);

addClientButton.addEventListener("click", () => {
  clientForm.reset();
  newProjectBillingRateInput.value = appSettings.defaultBillingRate;
  clientModal.showModal();
  newClientNameInput.focus();
});

cancelClientButton.addEventListener("click", () => {
  if (isAddClientFormDirty() && !window.confirm("Discard this new client?")) {
    return;
  }

  clientForm.reset();
  clientModal.close();
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addClient();
});

async function loadPageData() {
  setStatus("Loading clients and projects...");

  try {
    const [settingsResponse, clientsResponse] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("/api/client-projects", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    appSettings = settingsResponse.ok
      ? normalizeSettings(await settingsResponse.json())
      : normalizeSettings({});
    clientProjectData = normalizeData(await clientsResponse.json());
    renderClients();
    setStatus("");
  } catch (error) {
    setStatus("Client and project data could not be loaded.");
    console.error(error);
  }
}

function renderClients() {
  clientList.innerHTML = "";

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
    editor.append(
      createClientNameEditor(client),
      createBillingContactEditor(client),
      createClientBillingSettingsEditor(client),
      createProjectList(client),
      createAddProjectForm(client),
    );

    clientItem.append(summary, editor);
    clientList.appendChild(clientItem);
  });
}

function createClientNameEditor(client) {
  const wrapper = document.createElement("div");
  wrapper.className = "edit-row client-name-row";

  const label = document.createElement("label");
  label.textContent = "Client Name";

  const input = document.createElement("input");
  input.value = client.name;
  label.appendChild(input);

  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Status";

  const statusSelect = createClientStatusSelect(client.status);
  statusLabel.appendChild(statusSelect);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save Client";
  saveButton.dataset.saveClientButton = client.id;
  saveButton.addEventListener("click", async () => {
    if (!input.value.trim()) {
      setStatus("Client name is required.");
      return;
    }

    const oldClient = { ...client };
    client.name = input.value.trim();
    client.status = statusSelect.value;
    client.id = createUniqueId(client.name, getOtherClientIds(client.id));

    await saveClientProjectData({
      action: "client_updated",
      client_id: client.id,
      client_name: client.name,
      details: `old_client_id=${oldClient.id};old_client_name=${oldClient.name};old_status=${oldClient.status};new_status=${client.status}`,
    }, {
      openClientId: client.id,
      flashSelector: `[data-save-client-button="${client.id}"]`,
    });
  });

  wrapper.append(label, statusLabel, saveButton);
  return wrapper;
}

function createBillingContactEditor(client) {
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

    if (fieldName.includes("email")) {
      input.type = "email";
    } else if (fieldName.includes("phone")) {
      input.type = "tel";
    }

    label.appendChild(input);
    inputs.set(fieldName, input);
    form.appendChild(label);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save Contact";
  saveButton.dataset.saveBillingContactButton = client.id;
  form.appendChild(saveButton);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    billingContactFields.forEach(([fieldName]) => {
      client.billing_contact[fieldName] = inputs.get(fieldName).value.trim();
    });

    await saveClientProjectData({
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

function createClientBillingSettingsEditor(client) {
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
  billingRateLabel.appendChild(billingRateInput);

  const billingPeriodEditor = createBillingPeriodEditor({
    legend: "Billing Period",
    inheritLabel: `Use app billing period (${formatBillingPeriod(appSettings.billingPeriod)})`,
    value: client.billing_period,
    inheritedPeriod: appSettings.billingPeriod,
  });

  const billingRoundingEditor = createBillingRoundingEditor({
    legend: "Rounding",
    inheritLabel: `Use app rounding (${formatBillingRounding(appSettings.billingRounding)})`,
    value: client.billing_rounding,
    inheritedRounding: appSettings.billingRounding,
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save Billing Settings";
  saveButton.dataset.saveBillingSettingsButton = client.id;

  form.append(
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
    saveButton,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    client.billing_rate = normalizeBillingRate(billingRateInput.value);
    client.billing_period = billingPeriodEditor.getValue();
    client.billing_rounding = billingRoundingEditor.getValue();

    await saveClientProjectData({
      action: "client_billing_settings_updated",
      client_id: client.id,
      client_name: client.name,
      details: `billing_rate=${client.billing_rate};billing_period=${formatBillingPeriod(getEffectiveClientBillingPeriod(client))};rounding=${formatBillingRounding(getEffectiveClientBillingRounding(client))}`,
    }, {
      openClientId: client.id,
      openClientBillingSettingsId: client.id,
      flashSelector: `[data-save-billing-settings-button="${client.id}"]`,
    });
  });

  details.append(summary, form);
  return details;
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

function createProjectEditor(client, project) {
  const details = document.createElement("details");
  details.className = "project-item";
  details.dataset.projectId = project.id;

  const summary = document.createElement("summary");
  summary.textContent = project.name;

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
  });

  billingSettings.append(
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
  );
  billingDetails.append(billingSummary, billingSettings);

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
    project.status = statusSelect.value;
    project.billing_rate = normalizeBillingRate(billingRateInput.value);
    project.billing_period = billingPeriodEditor.getValue();
    project.billing_rounding = billingRoundingEditor.getValue();
    project.id = createUniqueId(project.name, getOtherProjectIds(project.id));

    await saveClientProjectData({
      action: "project_updated",
      client_id: client.id,
      client_name: client.name,
      project_id: project.id,
      project_name: project.name,
      details: `old_project_id=${oldProject.id};old_project_name=${oldProject.name};old_status=${oldProject.status};old_billing_rate=${oldProject.billing_rate};new_status=${project.status};new_billing_rate=${project.billing_rate};billing_period=${formatBillingPeriod(getEffectiveProjectBillingPeriod(client, project))};rounding=${formatBillingRounding(getEffectiveProjectBillingRounding(client, project))}`,
    }, {
      openClientId: client.id,
      flashSelector: `[data-save-project-button="${project.id}"]`,
    });
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger-button";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Delete project "${project.name}"?`)) {
      return;
    }

    client.projects = client.projects.filter(
      (currentProject) => currentProject.id !== project.id,
    );

    await saveClientProjectData({
      action: "project_deleted",
      client_id: client.id,
      client_name: client.name,
      project_id: project.id,
      project_name: project.name,
      details: `status=${project.status};billing_rate=${project.billing_rate}`,
    }, {
      openClientId: client.id,
    });
  });

  actionGroup.append(saveButton, deleteButton);
  wrapper.append(
    nameLabel,
    statusLabel,
    billingDetails,
    actionGroup,
  );
  details.append(summary, wrapper);
  return details;
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
  });

  billingSettings.append(
    billingRateLabel,
    billingPeriodEditor.element,
    billingRoundingEditor.element,
  );
  billingDetails.append(billingSummary, billingSettings);

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
      id: createUniqueId(nameInput.value, getProjectIds()),
      name: nameInput.value.trim(),
      billing_rate: normalizeBillingRate(billingRateInput.value),
      billing_period: billingPeriodEditor.getValue(),
      billing_rounding: billingRoundingEditor.getValue(),
      status: statusSelect.value,
    };

    client.projects.push(project);

    await saveClientProjectData({
      action: "project_created",
      client_id: client.id,
      client_name: client.name,
      project_id: project.id,
      project_name: project.name,
      details: `status=${project.status};billing_rate=${project.billing_rate}`,
    }, {
      openClientId: client.id,
      flashSelector: `[data-add-project-button="${client.id}"]`,
    });
  });

  return form;
}

async function addClient() {
  const clientName = newClientNameInput.value.trim();
  const projectName = newProjectNameInput.value.trim();

  if (!clientName || !projectName) {
    setStatus("Client name and project name are required.");
    return;
  }

  const client = {
    id: createUniqueId(clientName, getClientIds()),
    name: clientName,
    billing_rate: appSettings.defaultBillingRate,
    billing_period: null,
    billing_rounding: null,
    billing_contact: createEmptyBillingContact(),
    projects: [
      {
        id: createUniqueId(projectName, getProjectIds()),
        name: projectName,
        billing_rate: normalizeBillingRate(newProjectBillingRateInput.value),
        billing_period: null,
        billing_rounding: null,
        status: newProjectStatusSelect.value,
      },
    ],
  };

  clientProjectData.clients.push(client);

  const saved = await saveClientProjectData({
    action: "client_created",
    client_id: client.id,
    client_name: client.name,
    project_id: client.projects[0].id,
    project_name: client.projects[0].name,
    details: `initial_project_status=${client.projects[0].status};initial_project_billing_rate=${client.projects[0].billing_rate}`,
  });

  if (saved) {
    clientForm.reset();
    clientModal.close();
  }
}

async function saveClientProjectData(action, viewState = {}) {
  setStatus("Saving clients and projects...");

  try {
    const response = await fetch("/api/client-projects", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: clientProjectData,
        actions: [action],
      }),
    });

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    const result = await response.json();
    clientProjectData = normalizeData(result.data);
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

function flashSavedButton(selector) {
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

function normalizeData(data) {
  return {
    clients: Array.isArray(data.clients)
      ? data.clients.map((client) => ({
          id: client.id,
          name: client.name,
          status: clientStatuses.includes(client.status) ? client.status : "Active",
          billing_rate: normalizeBillingRate(client.billing_rate),
          billing_period: normalizeOptionalBillingPeriod(client.billing_period),
          billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
          billing_contact: normalizeBillingContact(client.billing_contact),
          projects: Array.isArray(client.projects)
            ? client.projects.map((project) => ({
                id: project.id,
                name: project.name,
                billing_rate: normalizeBillingRate(project.billing_rate),
                billing_period: normalizeOptionalBillingPeriod(project.billing_period),
                billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
                status: projectStatuses.includes(project.status)
                  ? project.status
                  : "Active",
              }))
            : [],
        }))
      : [],
  };
}

function normalizeSettings(settings) {
  return {
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
}

function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
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
  const fieldset = document.createElement("fieldset");
  fieldset.className = "billing-period-editor";

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

  return {
    element: fieldset,
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
}

function createBillingRoundingEditor({ legend, inheritLabel, value, inheritedRounding }) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "billing-period-editor";

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

  const updateState = () => {
    incrementLabel.hidden = modeSelect.value !== "round";
    incrementSelect.disabled = modeSelect.value !== "round";
    inheritedHint.textContent = modeSelect.value === "inherit"
      ? `Effective rounding: ${formatBillingRounding(inheritedRounding)}`
      : "";
  };

  modeSelect.addEventListener("change", updateState);
  updateState();

  fieldset.append(legendElement, modeLabel, incrementLabel, inheritedHint);

  return {
    element: fieldset,
    getValue() {
      if (modeSelect.value === "inherit") {
        return null;
      }

      return normalizeBillingRounding({
        enabled: modeSelect.value === "round",
        increment: incrementSelect.value,
      });
    },
  };
}

function populateBillingPeriodStartDays(select) {
  for (let day = 1; day <= 28; day += 1) {
    select.appendChild(createOption(String(day), formatOrdinal(day)));
  }
}

function getEffectiveClientBillingPeriod(client) {
  return client.billing_period || appSettings.billingPeriod;
}

function getEffectiveClientBillingRate(client) {
  return client.billing_rate || appSettings.defaultBillingRate;
}

function getEffectiveProjectBillingPeriod(client, project) {
  return project.billing_period || getEffectiveClientBillingPeriod(client);
}

function getEffectiveClientBillingRounding(client) {
  return client.billing_rounding || appSettings.billingRounding;
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

function createUniqueId(name, existingIds) {
  const baseId = createId(name);
  let candidate = baseId;
  let nextNumber = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${baseId}_${nextNumber}`;
    nextNumber += 1;
  }

  return candidate;
}

function createId(name) {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return id || "item";
}

function getClientIds() {
  return clientProjectData.clients.map((client) => client.id);
}

function getOtherClientIds(clientId) {
  return clientProjectData.clients
    .filter((client) => client.id !== clientId)
    .map((client) => client.id);
}

function getProjectIds() {
  return clientProjectData.clients.flatMap((client) =>
    client.projects.map((project) => project.id),
  );
}

function getOtherProjectIds(projectId) {
  return clientProjectData.clients
    .flatMap((client) => client.projects)
    .filter((project) => project.id !== projectId)
    .map((project) => project.id);
}

function isAddClientFormDirty() {
  return Boolean(
      newClientNameInput.value.trim() ||
      newProjectNameInput.value.trim() ||
      newProjectBillingRateInput.value.trim() ||
      newProjectStatusSelect.value !== "Active",
  );
}

function setStatus(message) {
  statusMessage.textContent = message;
}
