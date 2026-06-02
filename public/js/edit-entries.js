// Edit Entries reuses the reporting data sources, then writes changes back by entry ID.
const filterClientSelect = document.querySelector("[data-edit-filter-client]");
const filterProjectSelect = document.querySelector("[data-edit-filter-project]");
const filterStatusSelect = document.querySelector("[data-edit-filter-status]");
const filterPeriodSelect = document.querySelector("[data-edit-filter-period]");
const filterCustomDates = document.querySelector("[data-edit-filter-custom-dates]");
const filterStartDateInput = document.querySelector("[data-edit-filter-start-date]");
const filterEndDateInput = document.querySelector("[data-edit-filter-end-date]");
const filterUsersSelect = document.querySelector("[data-edit-filter-users]");
const editEntryStatus = document.querySelector("[data-edit-entry-status]");
const editEntryTable = document.querySelector("[data-edit-entry-table]");
const editEntryForm = document.querySelector("[data-edit-entry-form]");
const editEntryHeading = document.querySelector("[data-edit-entry-heading]");
const editEntryClientSelect = document.querySelector("[data-edit-entry-client]");
const editEntryProjectSelect = document.querySelector("[data-edit-entry-project]");
const editEntryDateInput = document.querySelector("[data-edit-entry-date]");
const editEntryStartTimeInput = document.querySelector("[data-edit-entry-start-time]");
const editEntryEndTimeInput = document.querySelector("[data-edit-entry-end-time]");
const editEntryDurationHoursInput = document.querySelector("[data-edit-entry-duration-hours]");
const editEntryDurationMinutesInput = document.querySelector("[data-edit-entry-duration-minutes]");
const editEntryDurationSecondsInput = document.querySelector("[data-edit-entry-duration-seconds]");
const editEntryDescriptionInput = document.querySelector("[data-edit-entry-description]");
const editEntryBillableSelect = document.querySelector("[data-edit-entry-billable]");
const editEntryInvoiceStatusSelect = document.querySelector("[data-edit-entry-invoice-status]");
const cancelEditEntryButton = document.querySelector("[data-cancel-edit-entry]");
const saveEditEntryButton = document.querySelector("[data-save-edit-entry]");

let editClients = [];
let editSettings = {
  billingPeriod: { type: "calendarMonth", startDay: 1 },
};
let timeEntries = [];
let editUsers = [];
let selectedEntryId = "";

initializeEditEntries();

filterStatusSelect.addEventListener("change", renderEntries);
filterPeriodSelect.addEventListener("change", () => {
  updateFilterDateState();
  renderEntries();
});
filterStartDateInput.addEventListener("change", renderEntries);
filterEndDateInput.addEventListener("change", renderEntries);
filterUsersSelect.addEventListener("change", renderEntries);
filterClientSelect.addEventListener("change", () => {
  populateFilterProjects();
  renderEntries();
});
filterProjectSelect.addEventListener("change", renderEntries);
editEntryClientSelect.addEventListener("change", () => {
  populateEditProjects();
  updateEditBillableDefault();
});
editEntryProjectSelect.addEventListener("change", updateEditBillableDefault);
editEntryDateInput.addEventListener("change", updateEndTimeFromDuration);
editEntryStartTimeInput.addEventListener("change", updateEndTimeFromDuration);
editEntryEndTimeInput.addEventListener("change", updateDurationFromTimeRange);
editEntryDurationHoursInput.addEventListener("input", updateEndTimeFromDuration);
editEntryDurationMinutesInput.addEventListener("input", updateEndTimeFromDuration);
editEntryDurationSecondsInput.addEventListener("input", updateEndTimeFromDuration);
cancelEditEntryButton.addEventListener("click", closeEditForm);
editEntryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveEditedEntry();
});

async function loadEditEntryData() {
  setEditEntryStatus("Loading entries...");

  try {
    const [settingsResponse, clientsResponse, entriesResponse, usersResponse] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("/api/client-projects", { cache: "no-store" }),
      fetch("/api/time-entries", { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    editSettings = settingsResponse.ok
      ? normalizeSettings(await settingsResponse.json())
      : normalizeSettings({});
    editClients = normalizeClients(await clientsResponse.json());
    timeEntries = entriesResponse.ok
      ? normalizeTimeEntries(await entriesResponse.json())
      : [];
    editUsers = usersResponse.ok
      ? normalizeUsers(await usersResponse.json())
      : [];

    populateClientOptions(filterClientSelect, "All clients");
    populateClientOptions(editEntryClientSelect, "Select a client");
    selectWorkspaceScopeClientIfNeeded(filterClientSelect);
    selectWorkspaceScopeClientIfNeeded(editEntryClientSelect);
    populateFilterProjects();
    populateUserOptions();
    setDefaultCustomDates();
    updateFilterDateState();
    renderEntries();
    setEditEntryStatus("");
  } catch (error) {
    setEditEntryStatus("Entries could not be loaded.");
    console.error(error);
  }
}

async function initializeEditEntries() {
  await window.LongtailForge.timezones.loadSessionTimezone();
  await window.LongtailForge.workspaceContextReady;
  await loadEditEntryData();
}

function populateClientOptions(select, placeholder) {
  select.replaceChildren(createOption("", placeholder));

  sortByName(editClients).forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
}

function selectWorkspaceScopeClientIfNeeded(select) {
  if (workspaceShowsClientTools()) {
    return;
  }

  const workspaceClient = editClients.find((client) => client.isWorkspaceScope);

  if (workspaceClient) {
    select.value = workspaceClient.id;
  }
}

function populateFilterProjects() {
  const client = getClient(filterClientSelect.value);
  filterProjectSelect.replaceChildren(createOption("", "All projects"));
  const projects = client
    ? client.projects
    : getAllFilterProjects();
  filterProjectSelect.disabled = projects.length === 0;

  sortByName(projects).forEach((project) => {
    filterProjectSelect.appendChild(createOption(project.id, project.name));
  });
}

function populateEditProjects(projectId = "") {
  const client = getClient(editEntryClientSelect.value);
  editEntryProjectSelect.replaceChildren(createOption("", "Select a project"));
  editEntryProjectSelect.disabled = !client;

  if (!client) {
    return;
  }

  sortByName(client.projects).forEach((project) => {
    editEntryProjectSelect.appendChild(createOption(project.id, project.name));
  });

  editEntryProjectSelect.value = projectId;
}

function renderEntries() {
  // The table is rebuilt from state after every filter change or save.
  editEntryTable.innerHTML = "";
  const entries = getFilteredEntries();

  if (!entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No entries match these filters.";
    row.appendChild(cell);
    editEntryTable.appendChild(row);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");
    row.append(
      createTableCell(formatDate(entry.endTime)),
      createTableCell(entry.clientName),
      createTableCell(entry.projectName),
      createTableCell(formatHours(entry.durationSeconds)),
      createTableCell(formatEntryStatus(entry)),
      createActionsCell(entry),
    );
    editEntryTable.appendChild(row);
  });
}

function getFilteredEntries() {
  const selectedUsers = getSelectedUserIds();
  const selectedDateRange = getSelectedDateRange();

  return timeEntries
    .filter((entry) => matchesStatusFilter(entry))
    .filter((entry) => isEntryInRange(entry, selectedDateRange))
    .filter((entry) => selectedUsers.length === 0 || selectedUsers.includes(entry.userId))
    .filter((entry) => !filterClientSelect.value || matchesClient(entry, getClient(filterClientSelect.value)))
    .filter((entry) => !filterProjectSelect.value || matchesProject(entry, getProject(filterClientSelect.value, filterProjectSelect.value)))
    .sort((firstEntry, secondEntry) => secondEntry.endTime - firstEntry.endTime);
}

function createActionsCell(entry) {
  const cell = document.createElement("td");
  const actions = document.createElement("div");
  const editButton = document.createElement("button");
  const deleteButton = document.createElement("button");

  actions.className = "table-actions";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openEditForm(entry.entryId));

  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger-button";
  deleteButton.addEventListener("click", () => deleteEntry(entry));

  actions.append(editButton, deleteButton);
  cell.appendChild(actions);
  return cell;
}

function openEditForm(entryId) {
  // Entries may have old client/project names, so IDs are resolved through helper matching.
  const entry = timeEntries.find((currentEntry) => currentEntry.entryId === entryId);

  if (!entry) {
    setEditEntryStatus("Entry could not be found.");
    return;
  }

  selectedEntryId = entry.entryId;
  editEntryHeading.textContent = `Edit Entry - ${getEntryHeadingLabel(entry)}`;
  editEntryClientSelect.value = findClientIdForEntry(entry);
  populateEditProjects(findProjectIdForEntry(entry));
  editEntryDateInput.value = formatDateInput(entry.startTime);
  editEntryStartTimeInput.value = formatTimeInput(entry.startTime);
  editEntryEndTimeInput.value = formatTimeInput(entry.endTime);
  setDurationInputs(entry.durationSeconds);
  editEntryDescriptionInput.value = entry.description;
  editEntryBillableSelect.value = getEffectiveEntryBillable(entry);
  editEntryInvoiceStatusSelect.value = entry.invoiceStatus;
  editEntryForm.hidden = false;
  editEntryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveEditedEntry() {
  const client = getClient(editEntryClientSelect.value);
  const project = getProject(editEntryClientSelect.value, editEntryProjectSelect.value);
  const startTime = createZonedDateTime(editEntryDateInput.value, editEntryStartTimeInput.value);
  const durationSeconds = getDurationInputSeconds();

  // Keep client/project names in the saved entry so reports do not need extra joins.
  if (!project) {
    setEditEntryStatus("Select a project.");
    return;
  }

  if (!startTime || durationSeconds <= 0) {
    setEditEntryStatus("Enter a valid start time and duration.");
    return;
  }

  const endTime = new Date(startTime.getTime() + (durationSeconds * 1000));
  const entry = {
    client_id: client.isWorkspaceScope ? "" : client.id,
    client_name: client.isWorkspaceScope ? "" : client.name,
    project_id: project.id,
    project_name: project.name,
    description: editEntryDescriptionInput.value.trim(),
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_seconds: durationSeconds,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    billable: editEntryBillableSelect.value,
    invoice_status: editEntryInvoiceStatusSelect.value,
  };

  saveEditEntryButton.disabled = true;
  setEditEntryStatus("Saving entry...");

  try {
    await window.LongtailForge.api.putJson(
      `/api/time-entries/${encodeURIComponent(selectedEntryId)}`,
      entry,
    );

    await loadEditEntryData();
    closeEditForm();
    flashSavedButton();
    setEditEntryStatus(`Saved ${selectedEntryId}.`);
  } catch (error) {
    setEditEntryStatus("Entry was not saved. Start the local server and try again.");
    console.error(error);
  } finally {
    saveEditEntryButton.disabled = false;
  }
}

async function deleteEntry(entry) {
  const shouldDelete = await window.LongtailForge.modal.confirm({
    title: "Delete entry?",
    message: `Delete the ${formatDate(entry.endTime)} entry for ${entry.clientName || entry.projectName}?`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!shouldDelete) {
    return;
  }

  setEditEntryStatus("Deleting entry...");

  try {
    await window.LongtailForge.api.deleteJson(
      `/api/time-entries/${encodeURIComponent(entry.entryId)}`,
    );

    if (selectedEntryId === entry.entryId) {
      closeEditForm();
    }

    await loadEditEntryData();
    setEditEntryStatus("Entry deleted.");
  } catch (error) {
    setEditEntryStatus("Entry was not deleted. Start the local server and try again.");
    console.error(error);
  }
}

function closeEditForm() {
  selectedEntryId = "";
  editEntryForm.hidden = true;
  editEntryForm.reset();
}

function normalizeClients(data) {
  const clients = Array.isArray(data?.clients)
    ? data.clients.map((client) => ({
        id: String(client.id || "").trim(),
        name: String(client.name || "").trim(),
        billable: normalizeEntryBillable(client.billable) || "yes",
        projects: Array.isArray(client.projects)
          ? client.projects.map((project) => ({
              id: String(project.id || "").trim(),
              name: String(project.name || "").trim(),
              billable: normalizeEntryBillable(project.billable) || normalizeEntryBillable(client.billable) || "yes",
            }))
          : [],
      }))
    : [];
  const workspaceProjects = Array.isArray(data?.workspaceProjects) ? data.workspaceProjects : [];

  if (workspaceProjects.length > 0) {
    clients.unshift({
      id: "__workspace_projects__",
      name: "Workspace Projects",
      billable: "yes",
      isWorkspaceScope: true,
      projects: workspaceProjects.map((project) => ({
        id: String(project.id || "").trim(),
        name: String(project.name || "").trim(),
        billable: normalizeEntryBillable(project.billable) || "yes",
      })),
    });
  }

  return clients;
}

function normalizeTimeEntries(data) {
  return Array.isArray(data?.entries)
    ? data.entries.map((entry) => ({
        entryId: entry.entry_id,
        userId: entry.user_id,
        clientId: entry.client_id,
        clientName: entry.client_name,
        projectId: entry.project_id,
        projectName: entry.project_name,
        description: entry.description,
        startTime: new Date(entry.start_time),
        endTime: new Date(entry.end_time),
        durationSeconds: Number(entry.duration_seconds) || 0,
        billable: normalizeEntryBillable(entry.billable),
        invoiceStatus: entry.invoice_status || "unbilled",
      }))
    : [];
}

function normalizeSettings(settings) {
  return {
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    workspaceCapabilities: settings?.workspaceCapabilities || {},
  };
}

function normalizeUsers(data) {
  return Array.isArray(data?.users)
    ? data.users.map((user) => ({
        userId: String(user.user_id || "").trim(),
        username: String(user.username || "").trim(),
        userStatus: user.userStatus === "inactive" ? "inactive" : "active",
      }))
    : [];
}

function populateUserOptions() {
  const usersById = new Map();

  editUsers.forEach((user) => {
    usersById.set(user.userId, user.username || user.userId);
  });

  timeEntries.forEach((entry) => {
    if (entry.userId && !usersById.has(entry.userId)) {
      usersById.set(entry.userId, entry.userId);
    }
  });

  filterUsersSelect.replaceChildren();

  [...usersById.entries()]
    .sort((firstUser, secondUser) => firstUser[1].localeCompare(secondUser[1], undefined, {
      sensitivity: "base",
    }))
    .forEach(([userId, label]) => {
      filterUsersSelect.appendChild(createOption(userId, label));
    });
}

function getSelectedUserIds() {
  return [...filterUsersSelect.selectedOptions].map((option) => option.value);
}

function matchesStatusFilter(entry) {
  if (getEffectiveEntryBillable(entry) !== "yes") {
    return !filterStatusSelect.value;
  }

  return !filterStatusSelect.value || entry.invoiceStatus === filterStatusSelect.value;
}

function getSelectedDateRange() {
  if (filterPeriodSelect.value === "all") {
    return null;
  }

  if (filterPeriodSelect.value === "custom") {
    return getCustomDateRange();
  }

  return getBillingPeriodRange(editSettings.billingPeriod, filterPeriodSelect.value);
}

function getCustomDateRange() {
  const startDate = parseDateInput(filterStartDateInput.value);
  const endDate = parseDateInput(filterEndDateInput.value);

  if (!startDate || !endDate || startDate > endDate) {
    return { invalid: true };
  }

  const exclusiveEndDate = new Date(
    window.LongtailForge.timezones.zonedDateTimeToUtcIso(addDateInputDays(filterEndDateInput.value, 1), "00:00:00"),
  );
  return { start: startDate, end: exclusiveEndDate };
}

function addDateInputDays(value, dayCount) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayCount));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getBillingPeriodRange(period, mode) {
  const today = new Date();
  const normalizedPeriod = normalizeBillingPeriod(period);
  let start;

  if (normalizedPeriod.type === "custom") {
    start = getCurrentCustomPeriodStart(today, normalizedPeriod.startDay);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  if (mode === "last") {
    start = addMonths(start, -1);
  }

  return {
    start,
    end: addMonths(start, 1),
  };
}

function getCurrentCustomPeriodStart(date, startDay) {
  const currentMonthStart = new Date(date.getFullYear(), date.getMonth(), startDay);

  if (date >= currentMonthStart) {
    return currentMonthStart;
  }

  return new Date(date.getFullYear(), date.getMonth() - 1, startDay);
}

function addMonths(date, monthCount) {
  return new Date(date.getFullYear(), date.getMonth() + monthCount, date.getDate());
}

function isEntryInRange(entry, range) {
  if (range?.invalid) {
    return false;
  }

  return Boolean(
    !range ||
    (Number.isFinite(entry.endTime.getTime()) &&
      entry.endTime >= range.start &&
      entry.endTime < range.end)
  );
}

function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function getClient(clientId) {
  return editClients.find((client) => client.id === clientId);
}

function getProject(clientId, projectId) {
  if (clientId) {
    return getClient(clientId)?.projects.find((project) => project.id === projectId);
  }

  return getAllFilterProjects().find((project) => project.id === projectId);
}

function getAllFilterProjects() {
  return editClients.flatMap((client) => client.projects || []);
}

function findClientIdForEntry(entry) {
  return editClients.find((client) => matchesClient(entry, client))?.id || "";
}

function findProjectIdForEntry(entry) {
  const client = getClient(editEntryClientSelect.value);
  return client?.projects.find((project) => matchesProject(entry, project))?.id || "";
}

function updateEditBillableDefault() {
  if (!selectedEntryId) {
    return;
  }

  const entry = timeEntries.find((currentEntry) => currentEntry.entryId === selectedEntryId);

  if (!entry || entry.billable) {
    return;
  }

  editEntryBillableSelect.value = getEffectiveEntryBillable(entry);
}

function matchesClient(entry, client) {
  return window.LongtailForge.records.matchesClient(entry, client);
}

function matchesProject(entry, project) {
  return window.LongtailForge.records.matchesProject(entry, project);
}

function createZonedDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const date = new Date(window.LongtailForge.timezones.zonedDateTimeToUtcIso(dateValue, timeValue));

  return Number.isFinite(date.getTime()) ? date : null;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const date = new Date(window.LongtailForge.timezones.zonedDateTimeToUtcIso(value, "00:00:00"));

  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(date) {
  return Number.isFinite(date.getTime())
    ? window.LongtailForge.timezones.formatDate(date)
    : "";
}

function formatHours(seconds) {
  return formatDuration(seconds);
}

function formatInvoiceStatus(status) {
  return window.LongtailForge.formatters.entryStatus(status);
}

function formatEntryStatus(entry) {
  if (getEffectiveEntryBillable(entry) !== "yes") {
    return "N/A";
  }

  return formatInvoiceStatus(entry.invoiceStatus);
}

function getEffectiveEntryBillable(entry) {
  const client = editClients.find((currentClient) => matchesClient(entry, currentClient));
  const project = client?.projects.find((currentProject) => matchesProject(entry, currentProject));
  const billableValues = [
    normalizeEntryBillable(entry.billable),
    normalizeEntryBillable(project?.billable),
    normalizeEntryBillable(client?.billable),
  ];

  return billableValues.includes("no")
    ? "no"
    : billableValues.find((value) => value === "yes") || "yes";
}

function normalizeEntryBillable(value) {
  if (value === "yes" || value === true) {
    return "yes";
  }

  if (value === "no" || value === false) {
    return "no";
  }

  return "";
}

function formatDateInput(date) {
  return window.LongtailForge.timezones.formatDateInput(date);
}

function formatTimeInput(date) {
  return window.LongtailForge.timezones.formatTimeInput(date);
}

function setDurationInputs(totalSeconds) {
  const normalizedSeconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  editEntryDurationHoursInput.value = String(hours);
  editEntryDurationMinutesInput.value = String(minutes);
  editEntryDurationSecondsInput.value = String(seconds);
}

function getDurationInputSeconds() {
  const hours = Math.max(0, Number.parseInt(editEntryDurationHoursInput.value, 10) || 0);
  const minutes = clampDurationPart(editEntryDurationMinutesInput.value);
  const seconds = clampDurationPart(editEntryDurationSecondsInput.value);

  editEntryDurationMinutesInput.value = String(minutes);
  editEntryDurationSecondsInput.value = String(seconds);

  return (hours * 3600) + (minutes * 60) + seconds;
}

function clampDurationPart(value) {
  return Math.min(59, Math.max(0, Number.parseInt(value, 10) || 0));
}

function updateDurationFromTimeRange() {
  const startTime = createZonedDateTime(editEntryDateInput.value, editEntryStartTimeInput.value);
  const endTime = createZonedDateTime(editEntryDateInput.value, editEntryEndTimeInput.value);

  if (!startTime || !endTime || endTime <= startTime) {
    return;
  }

  setDurationInputs(Math.round((endTime.getTime() - startTime.getTime()) / 1000));
}

function updateEndTimeFromDuration() {
  const startTime = createZonedDateTime(editEntryDateInput.value, editEntryStartTimeInput.value);
  const durationSeconds = getDurationInputSeconds();

  if (!startTime || durationSeconds <= 0) {
    return;
  }

  editEntryEndTimeInput.value = formatTimeInput(new Date(startTime.getTime() + (durationSeconds * 1000)));
}

function formatDuration(totalSeconds) {
  const normalizedSeconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function setDefaultCustomDates() {
  const today = new Date();
  filterStartDateInput.value = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
  filterEndDateInput.value = formatDateInput(today);
}

function updateFilterDateState() {
  const isCustom = filterPeriodSelect.value === "custom";
  filterCustomDates.hidden = !isCustom;
  filterStartDateInput.disabled = !isCustom;
  filterEndDateInput.disabled = !isCustom;
}

function flashSavedButton() {
  const originalText = saveEditEntryButton.textContent;
  saveEditEntryButton.textContent = "Saved.";
  saveEditEntryButton.classList.add("is-saved");

  window.setTimeout(() => {
    saveEditEntryButton.textContent = originalText;
    saveEditEntryButton.classList.remove("is-saved");
  }, 1600);
}

function createOption(value, text) {
  return window.LongtailForge.pageController.createOption(value, text);
}

function createTableCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function sortByName(items) {
  return window.LongtailForge.pageController.sortByName(items);
}

function setEditEntryStatus(message) {
  window.LongtailForge.pageController.setStatus(editEntryStatus, message);
}

function getEntryHeadingLabel(entry) {
  return [
    entry.projectName || "",
    formatDate(entry.endTime),
  ].filter(Boolean).join(" - ") || "Selected Entry";
}

function workspaceShowsClientTools() {
  const tools = editSettings.workspaceCapabilities?.availableTools || [];

  return Array.isArray(tools) && tools.includes("clients_projects");
}

window.LongtailForge.pageController.register("edit-entries", {
  snapshot: () => ({
    clientCount: editClients.length,
    entryCount: timeEntries.length,
    selectedEntryId,
    userCount: editUsers.length,
    workspaceShowsClientTools: workspaceShowsClientTools(),
  }),
  runSmoke: () => {
    const checks = [
      { name: "filter controls exist", ok: Boolean(filterStatusSelect && filterPeriodSelect && filterUsersSelect) },
      { name: "entry table exists", ok: Boolean(editEntryTable) },
      { name: "edit form exists", ok: Boolean(editEntryForm) },
      { name: "entry data is an array", ok: Array.isArray(timeEntries) },
    ];

    return {
      ok: checks.every((check) => check.ok),
      pageId: "edit-entries",
      checks,
    };
  },
});
