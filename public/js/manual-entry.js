// Manual entries use the same time-entry API as the timer, but collect times from form fields.
const manualEntryForm = document.querySelector("[data-manual-entry-form]");
const entryClientSelect = document.querySelector("[data-entry-client]");
const entryProjectSelect = document.querySelector("[data-entry-project]");
const entryDateInput = document.querySelector("[data-entry-date]");
const entryStartTimeInput = document.querySelector("[data-entry-start-time]");
const entryEndTimeInput = document.querySelector("[data-entry-end-time]");
const entryDescriptionInput = document.querySelector("[data-entry-description]");
const entryBillableSelect = document.querySelector("[data-entry-billable]");
const entryInvoiceStatusSelect = document.querySelector("[data-entry-invoice-status]");
const entryStatus = document.querySelector("[data-entry-status]");
const saveEntryButton = document.querySelector("[data-save-entry]");

let entryClients = [];

initializeManualEntry();

entryClientSelect.addEventListener("change", () => {
  populateProjectOptions();
  updateBillableDefault();
});

entryProjectSelect.addEventListener("change", updateBillableDefault);

manualEntryForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    setDefaultEntryDate();
    populateProjectOptions();
    setEntryStatus("");
  }, 0);
});

manualEntryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveManualEntry();
});

async function initializeManualEntry() {
  await window.LongtailForge.timezones.loadSessionTimezone();
  await window.LongtailForge.workspaceContextReady;
  setDefaultEntryDate();
  await loadEntryClients();
}

async function loadEntryClients() {
  setEntryStatus("Loading clients and projects...");

  try {
    const response = await fetch("/api/client-projects", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load client data: ${response.status}`);
    }

    const data = await response.json();
    entryClients = normalizeClients(data);
    populateClientOptions();
    setEntryStatus("");
  } catch (error) {
    setEntryStatus("Clients and projects could not be loaded.");
    console.error(error);
  }
}

function populateClientOptions() {
  entryClientSelect.replaceChildren(createOption("", "Select a client"));

  sortByName(entryClients).forEach((client) => {
    entryClientSelect.appendChild(createOption(client.id, client.name));
  });

  selectWorkspaceScopeClientIfNeeded();
}

function populateProjectOptions() {
  const client = getSelectedClient();
  entryProjectSelect.replaceChildren(createOption("", "Select a project"));
  entryProjectSelect.disabled = !client;

  if (!client) {
    return;
  }

  sortByName(client.projects).forEach((project) => {
    entryProjectSelect.appendChild(createOption(project.id, project.name));
  });

  updateBillableDefault();
}

function selectWorkspaceScopeClientIfNeeded() {
  if (workspaceShowsClientTools()) {
    return;
  }

  const workspaceClient = entryClients.find((client) => client.isWorkspaceScope);

  if (workspaceClient) {
    entryClientSelect.value = workspaceClient.id;
    populateProjectOptions();
  }
}

async function saveManualEntry() {
  const client = getSelectedClient();
  const project = getSelectedProject(client);
  const startTime = createZonedDateTime(entryDateInput.value, entryStartTimeInput.value);
  const endTime = createZonedDateTime(entryDateInput.value, entryEndTimeInput.value);

  // Validate before calculating duration so bad inputs never reach the API.
  if (!project) {
    setEntryStatus("Select a project.");
    return;
  }

  if (!startTime || !endTime) {
    setEntryStatus("Enter a valid date, start time, and end time.");
    return;
  }

  if (endTime <= startTime) {
    setEntryStatus("End time must be after start time.");
    return;
  }

  const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  const entry = {
    client_id: client.isWorkspaceScope ? "" : client.id,
    client_name: client.isWorkspaceScope ? "" : client.name,
    project_id: project.id,
    project_name: project.name,
    description: entryDescriptionInput.value.trim(),
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_seconds: durationSeconds,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    billable: entryBillableSelect.value,
    invoice_status: entryInvoiceStatusSelect.value,
  };

  saveEntryButton.disabled = true;
  setEntryStatus("Saving time entry...");

  try {
    const response = await fetch("/api/time-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      throw new Error(`Could not save time entry: ${response.status}`);
    }

    const result = await response.json();
    manualEntryForm.reset();
    setDefaultEntryDate();
    populateProjectOptions();
    flashSavedButton();
    setEntryStatus(`Saved ${result.entry_id} to the database.`);
  } catch (error) {
    setEntryStatus("Time entry was not saved. Start the local server and try again.");
    console.error(error);
  } finally {
    saveEntryButton.disabled = false;
  }
}

function normalizeClients(data) {
  // The selectors only need IDs and names; billing details stay on reporting/editor screens.
  const clients = Array.isArray(data?.clients)
    ? data.clients
        .filter((client) => !isInactiveRecord(client))
        .map((client) => ({
          id: String(client.id || "").trim(),
          name: String(client.name || "").trim(),
          billable: normalizeBillableFlag(client.billable),
          projects: Array.isArray(client.projects)
            ? client.projects
                .filter((project) => !isInactiveRecord(project))
                .map((project) => ({
                  id: String(project.id || "").trim(),
                  name: String(project.name || "").trim(),
                  billable: normalizeBillableFlag(project.billable, client.billable),
                }))
            : [],
        }))
    : [];
  const workspaceProjects = Array.isArray(data?.workspaceProjects)
    ? data.workspaceProjects.filter((project) => !isInactiveRecord(project))
    : [];

  if (workspaceProjects.length > 0) {
    clients.unshift({
      id: "__workspace_projects__",
      name: workspaceProjectsLabel(),
      billable: "yes",
      isWorkspaceScope: true,
      projects: workspaceProjects.map((project) => ({
        id: String(project.id || "").trim(),
        name: String(project.name || "").trim(),
        billable: normalizeBillableFlag(project.billable),
      })),
    });
  }

  return clients;
}

function workspaceProjectsLabel() {
  return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
}

function isInactiveRecord(record) {
  return String(record?.status || "").trim().toLowerCase() === "inactive";
}

function getSelectedClient() {
  return entryClients.find((client) => client.id === entryClientSelect.value);
}

function getSelectedProject(client) {
  return client?.projects.find((project) => project.id === entryProjectSelect.value);
}

function updateBillableDefault() {
  const client = getSelectedClient();
  const project = getSelectedProject(client);
  entryBillableSelect.value = normalizeBillableFlag(project?.billable, client?.billable);
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

function createZonedDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const date = new Date(window.LongtailForge.timezones.zonedDateTimeToUtcIso(dateValue, timeValue));

  return Number.isFinite(date.getTime()) ? date : null;
}

function setDefaultEntryDate() {
  entryDateInput.value = window.LongtailForge.timezones.formatDateInput(new Date());
}

function flashSavedButton() {
  const originalText = saveEntryButton.textContent;
  saveEntryButton.textContent = "Saved.";
  saveEntryButton.classList.add("is-saved");

  window.setTimeout(() => {
    saveEntryButton.textContent = originalText;
    saveEntryButton.classList.remove("is-saved");
  }, 1600);
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

function workspaceShowsClientTools() {
  const context = window.LongtailForge?.workspaceContext || {};
  const tools = context.workspaceCapabilities?.availableTools || [];

  return Array.isArray(tools) && tools.includes("clients_projects");
}

function setEntryStatus(message) {
  entryStatus.textContent = message;
}
