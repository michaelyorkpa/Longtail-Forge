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

setDefaultEntryDate();
loadEntryClients();

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

async function saveManualEntry() {
  const client = getSelectedClient();
  const project = getSelectedProject(client);
  const startTime = createLocalDateTime(entryDateInput.value, entryStartTimeInput.value);
  const endTime = createLocalDateTime(entryDateInput.value, entryEndTimeInput.value);

  // Validate before calculating duration so bad inputs never reach the API.
  if (!client || !project) {
    setEntryStatus("Select a client and project.");
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
    client_id: client.id,
    client_name: client.name,
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
  return Array.isArray(data?.clients)
    ? data.clients.map((client) => ({
        id: String(client.id || "").trim(),
        name: String(client.name || "").trim(),
        billable: normalizeBillableFlag(client.billable),
        projects: Array.isArray(client.projects)
          ? client.projects.map((project) => ({
              id: String(project.id || "").trim(),
              name: String(project.name || "").trim(),
              billable: normalizeBillableFlag(project.billable, client.billable),
            }))
          : [],
      }))
    : [];
}

function getSelectedClient() {
  return entryClients.find((client) => client.id === entryClientSelect.value);
}

function getSelectedProject(client) {
  return client?.projects.find((project) => project.id === entryProjectSelect.value);
}

function updateBillableDefault() {
  const project = getSelectedProject(getSelectedClient());
  entryBillableSelect.value = project?.billable === "no" ? "no" : "yes";
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

function createLocalDateTime(dateValue, timeValue) {
  // Date inputs are parsed manually to preserve the user's local time zone.
  if (!dateValue || !timeValue) {
    return null;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  return Number.isFinite(date.getTime()) ? date : null;
}

function setDefaultEntryDate() {
  const today = new Date();
  entryDateInput.value = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
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

function setEntryStatus(message) {
  entryStatus.textContent = message;
}
