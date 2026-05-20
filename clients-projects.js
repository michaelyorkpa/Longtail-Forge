const clientList = document.querySelector("[data-client-list]");
const addClientButton = document.querySelector("[data-add-client]");
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
let openClientId = "";
let openBillingClientId = "";

loadClientsAndProjects();

addClientButton.addEventListener("click", () => {
  clientForm.reset();
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

async function loadClientsAndProjects() {
  setStatus("Loading clients and projects...");

  try {
    const response = await fetch("data/client-project.json");

    if (!response.ok) {
      throw new Error(`Could not load client data: ${response.status}`);
    }

    clientProjectData = normalizeData(await response.json());
    renderClients();
    setStatus("");
  } catch (error) {
    setStatus("Client and project data could not be loaded.");
    console.error(error);
  }
}

function renderClients() {
  clientList.innerHTML = "";

  sortByName(clientProjectData.clients).forEach((client) => {
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
      createBillingEditor(client),
      createProjectList(client),
      createAddProjectForm(client),
    );

    clientItem.append(summary, editor);
    clientList.appendChild(clientItem);
  });
}

function createClientNameEditor(client) {
  const wrapper = document.createElement("div");
  wrapper.className = "edit-row";

  const label = document.createElement("label");
  label.textContent = "Client Name";

  const input = document.createElement("input");
  input.value = client.name;
  label.appendChild(input);

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
    client.id = createUniqueId(client.name, getOtherClientIds(client.id));

    await saveClientProjectData({
      action: "client_updated",
      client_id: client.id,
      client_name: client.name,
      details: `old_client_id=${oldClient.id};old_client_name=${oldClient.name}`,
    }, {
      openClientId: client.id,
      flashSelector: `[data-save-client-button="${client.id}"]`,
    });
  });

  wrapper.append(label, saveButton);
  return wrapper;
}

function createBillingEditor(client) {
  const details = document.createElement("details");
  details.className = "billing-details";
  details.open = client.id === openBillingClientId;

  const summary = document.createElement("summary");
  summary.textContent = "Billing Contact";

  const form = document.createElement("form");
  form.className = "billing-editor";

  const billingRateLabel = document.createElement("label");
  billingRateLabel.textContent = "Billing Rate ($/hour)";

  const billingRateInput = document.createElement("input");
  billingRateInput.inputMode = "decimal";
  billingRateInput.value = client.billing_rate;
  billingRateLabel.appendChild(billingRateInput);
  form.appendChild(billingRateLabel);

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
  saveButton.textContent = "Save Billing";
  saveButton.dataset.saveBillingButton = client.id;
  form.appendChild(saveButton);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    client.billing_rate = billingRateInput.value.trim();
    billingContactFields.forEach(([fieldName]) => {
      client.billing_contact[fieldName] = inputs.get(fieldName).value.trim();
    });

    await saveClientProjectData({
      action: "client_billing_updated",
      client_id: client.id,
      client_name: client.name,
      details: `billing_rate=${client.billing_rate}`,
    }, {
      openClientId: client.id,
      openBillingClientId: client.id,
      flashSelector: `[data-save-billing-button="${client.id}"]`,
    });
  });

  details.append(summary, form);
  return details;
}

function createProjectList(client) {
  const list = document.createElement("div");
  list.className = "project-list";

  sortByName(client.projects).forEach((project) => {
    list.appendChild(createProjectEditor(client, project));
  });

  return list;
}

function createProjectEditor(client, project) {
  const wrapper = document.createElement("div");
  wrapper.className = "project-editor";
  wrapper.dataset.projectId = project.id;

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
    project.billing_rate = billingRateInput.value.trim();
    project.id = createUniqueId(project.name, getOtherProjectIds(project.id));

    await saveClientProjectData({
      action: "project_updated",
      client_id: client.id,
      client_name: client.name,
      project_id: project.id,
      project_name: project.name,
      details: `old_project_id=${oldProject.id};old_project_name=${oldProject.name};old_status=${oldProject.status};old_billing_rate=${oldProject.billing_rate};new_status=${project.status};new_billing_rate=${project.billing_rate}`,
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
  wrapper.append(nameLabel, billingRateLabel, statusLabel, actionGroup);
  return wrapper;
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
  billingRateLabel.appendChild(billingRateInput);

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Add Project";
  saveButton.dataset.addProjectButton = client.id;

  form.append(nameLabel, billingRateLabel, statusLabel, saveButton);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const project = {
      id: createUniqueId(nameInput.value, getProjectIds()),
      name: nameInput.value.trim(),
      billing_rate: billingRateInput.value.trim(),
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
    billing_rate: "",
    billing_contact: createEmptyBillingContact(),
    projects: [
      {
        id: createUniqueId(projectName, getProjectIds()),
        name: projectName,
        billing_rate: newProjectBillingRateInput.value.trim(),
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
          billing_rate: client.billing_rate || "",
          billing_contact: normalizeBillingContact(client.billing_contact),
          projects: Array.isArray(client.projects)
            ? client.projects.map((project) => ({
                id: project.id,
                name: project.name,
                billing_rate: project.billing_rate || "",
                status: projectStatuses.includes(project.status)
                  ? project.status
                  : "Active",
              }))
            : [],
        }))
      : [],
  };
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
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    option.selected = status === value;
    select.appendChild(option);
  });

  return select;
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
