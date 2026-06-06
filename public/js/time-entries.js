// Time Entries reuses the reporting data sources, then writes changes back by entry ID.
const filterClientSelect = document.querySelector("[data-time-entry-filter-client]");
const filterProjectSelect = document.querySelector("[data-time-entry-filter-project]");
const filterStatusSelect = document.querySelector("[data-time-entry-filter-status]");
const filterPeriodSelect = document.querySelector("[data-time-entry-filter-period]");
const filterCustomDates = document.querySelector("[data-time-entry-filter-custom-dates]");
const filterStartDateInput = document.querySelector("[data-time-entry-filter-start-date]");
const filterEndDateInput = document.querySelector("[data-time-entry-filter-end-date]");
const filterUsersSelect = document.querySelector("[data-time-entry-filter-users]");
const filterTagControl = document.querySelector("[data-time-entry-filter-tag-control]");
const filterTagSelect = document.querySelector("[data-time-entry-filter-tag]");
const sortSelect = document.querySelector("[data-time-entry-sort]");
const addTimeEntryButton = document.querySelector("[data-add-time-entry]");
const timeEntryStatus = document.querySelector("[data-time-entry-status]");
const timeEntryTable = document.querySelector("[data-time-entry-table]");

let timeEntryClients = [];
let timeEntrySettings = {
  billingPeriod: { type: "calendarMonth", startDay: 1 },
};
let timeEntries = [];
let timeEntryUsers = [];
let timeEntryTagOptions = [];

initializeTimeEntries();

filterStatusSelect.addEventListener("change", renderEntries);
filterPeriodSelect.addEventListener("change", () => {
  updateFilterDateState();
  renderEntries();
});
filterStartDateInput.addEventListener("change", renderEntries);
filterEndDateInput.addEventListener("change", renderEntries);
filterUsersSelect.addEventListener("change", renderEntries);
filterTagSelect?.addEventListener("change", renderEntries);
sortSelect.addEventListener("change", renderEntries);
addTimeEntryButton.addEventListener("click", openAddDialog);
filterClientSelect.addEventListener("change", () => {
  populateFilterProjects();
  renderEntries();
});
filterProjectSelect.addEventListener("change", renderEntries);

async function loadTimeEntryData() {
  setTimeEntryStatus("Loading entries...");

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

    timeEntrySettings = settingsResponse.ok
      ? normalizeSettings(await settingsResponse.json())
      : normalizeSettings({});
    timeEntryClients = normalizeClients(await clientsResponse.json());
    timeEntries = entriesResponse.ok
      ? normalizeTimeEntries(await entriesResponse.json())
      : [];
    timeEntryTagOptions = await loadTagOptions();
    timeEntryUsers = usersResponse.ok
      ? normalizeUsers(await usersResponse.json())
      : [];

    populateClientOptions(filterClientSelect, "All clients");
    selectWorkspaceScopeClientIfNeeded(filterClientSelect);
    populateFilterProjects();
    populateUserOptions();
    populateTagFilter();
    setDefaultCustomDates();
    updateFilterDateState();
    renderEntries();
    setTimeEntryStatus("");
  } catch (error) {
    setTimeEntryStatus("Entries could not be loaded.");
    console.error(error);
  }
}

async function initializeTimeEntries() {
  await window.LongtailForge.timezones.loadSessionTimezone();
  await window.LongtailForge.workspaceContextReady;
  await loadTimeEntryData();
  openAddFromUrl();
  openEntryFromUrl();
}

function populateClientOptions(select, placeholder) {
  select.replaceChildren(createOption("", placeholder));

  sortByName(timeEntryClients).forEach((client) => {
    select.appendChild(createOption(client.id, client.name));
  });
}

function selectWorkspaceScopeClientIfNeeded(select) {
  if (workspaceShowsClientTools()) {
    return;
  }

  const workspaceClient = timeEntryClients.find((client) => client.isWorkspaceScope);

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

function renderEntries() {
  // The table is rebuilt from state after every filter change or save.
  timeEntryTable.innerHTML = "";
  const entries = getFilteredEntries();

  if (!entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No entries match these filters.";
    row.appendChild(cell);
    timeEntryTable.appendChild(row);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");
    row.append(
      createTableCell(formatDate(entry.endTime)),
      createTableCell(entry.clientName),
      createProjectCell(entry),
      createTableCell(formatHours(entry.durationSeconds)),
      createTableCell(formatEntryStatus(entry)),
      createActionsCell(entry),
    );
    timeEntryTable.appendChild(row);
  });
}

function getFilteredEntries() {
  const selectedUsers = getSelectedUserIds();
  const selectedDateRange = getSelectedDateRange();
  const selectedTagId = filterTagSelect?.value || "";

  return timeEntries
    .filter((entry) => matchesStatusFilter(entry))
    .filter((entry) => isEntryInRange(entry, selectedDateRange))
    .filter((entry) => selectedUsers.length === 0 || selectedUsers.includes(entry.userId))
    .filter((entry) => !selectedTagId || (entry.tags || []).some((tag) => tag.tag_id === selectedTagId))
    .filter((entry) => !filterClientSelect.value || matchesClient(entry, getClient(filterClientSelect.value)))
    .filter((entry) => !filterProjectSelect.value || matchesProject(entry, getProject(filterClientSelect.value, filterProjectSelect.value)))
    .sort(compareEntries);
}

function compareEntries(firstEntry, secondEntry) {
  switch (sortSelect.value) {
    case "end_asc":
      return firstEntry.endTime - secondEntry.endTime;
    case "duration_desc":
      return secondEntry.durationSeconds - firstEntry.durationSeconds;
    case "duration_asc":
      return firstEntry.durationSeconds - secondEntry.durationSeconds;
    case "project_asc":
      return String(firstEntry.projectName || "").localeCompare(
        String(secondEntry.projectName || ""),
        undefined,
        { sensitivity: "base" },
      );
    case "end_desc":
    default:
      return secondEntry.endTime - firstEntry.endTime;
  }
}

function createActionsCell(entry) {
  const cell = document.createElement("td");
  const actions = document.createElement("div");
  const editButton = document.createElement("button");
  const deleteButton = document.createElement("button");

  actions.className = "table-actions";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openEditDialog(entry.entryId));

  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "danger-button";
  deleteButton.addEventListener("click", () => deleteEntry(entry));

  actions.append(editButton, deleteButton);
  cell.appendChild(actions);
  return cell;
}

async function openEditDialog(entryId) {
  setTimeEntryStatus("Opening entry...");

  try {
    const result = await window.LongtailForge.timeEntryDialog.openEdit({ entryId }, {
      complete: async () => {
        await loadTimeEntryData();
        setTimeEntryStatus(`Saved ${entryId}.`);
      },
      setStatus: setTimeEntryStatus,
    });
    if (result !== "complete") {
      setTimeEntryStatus("");
    }
  } catch (error) {
    setTimeEntryStatus(error.message || "Entry could not be opened.");
  }
}

async function openAddDialog() {
  setTimeEntryStatus("Opening entry...");

  try {
    const result = await window.LongtailForge.timeEntryDialog.openAdd({}, {
      complete: async () => {
        await loadTimeEntryData();
        setTimeEntryStatus("Entry saved.");
      },
      setStatus: setTimeEntryStatus,
    });
    if (result !== "complete") {
      setTimeEntryStatus("");
    }
  } catch (error) {
    setTimeEntryStatus(error.message || "Entry could not be opened.");
  }
}

function createProjectCell(entry) {
  const cell = createTableCell(entry.projectName);

  if (window.LongtailForge.tags?.renderTagList && Array.isArray(entry.tags) && entry.tags.length > 0) {
    const tagList = document.createElement("div");
    tagList.className = "tag-chip-list";
    window.LongtailForge.tags.renderTagList(tagList, entry.tags);
    cell.appendChild(tagList);
  }

  return cell;
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

  setTimeEntryStatus("Deleting entry...");

  try {
    await window.LongtailForge.api.deleteJson(
      `/api/time-entries/${encodeURIComponent(entry.entryId)}`,
    );

    await loadTimeEntryData();
    setTimeEntryStatus("Entry deleted.");
  } catch (error) {
    setTimeEntryStatus("Entry was not deleted. Start the local server and try again.");
    console.error(error);
  }
}

function openEntryFromUrl() {
  const entryId = new URLSearchParams(window.location.search).get("entry") || "";

  if (entryId) {
    openEditDialog(entryId);
  }
}

function openAddFromUrl() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("new") === "1" || params.get("add") === "1") {
    openAddDialog();
  }
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
      name: workspaceProjectsLabel(),
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

function workspaceProjectsLabel() {
  return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
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
        tags: Array.isArray(entry.tags) ? entry.tags : [],
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

  timeEntryUsers.forEach((user) => {
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

async function loadTagOptions() {
  if (!window.LongtailForge.tags?.loadTags) {
    return [];
  }

  try {
    return await window.LongtailForge.tags.loadTags();
  } catch {
    return [];
  }
}

function populateTagFilter() {
  if (!filterTagSelect || !filterTagControl) {
    return;
  }

  const previousValue = filterTagSelect.value || "";
  filterTagControl.hidden = timeEntryTagOptions.length === 0;
  filterTagSelect.replaceChildren(
    createOption("", "All tags"),
    ...timeEntryTagOptions.map((tag) => createOption(tag.tag_id, tag.name || tag.slug)),
  );
  filterTagSelect.value = timeEntryTagOptions.some((tag) => tag.tag_id === previousValue) ? previousValue : "";
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

  return getBillingPeriodRange(timeEntrySettings.billingPeriod, filterPeriodSelect.value);
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
  return timeEntryClients.find((client) => client.id === clientId);
}

function getProject(clientId, projectId) {
  if (clientId) {
    return getClient(clientId)?.projects.find((project) => project.id === projectId);
  }

  return getAllFilterProjects().find((project) => project.id === projectId);
}

function getAllFilterProjects() {
  return timeEntryClients.flatMap((client) => client.projects || []);
}

function matchesClient(entry, client) {
  return window.LongtailForge.records.matchesClient(entry, client);
}

function matchesProject(entry, project) {
  return window.LongtailForge.records.matchesProject(entry, project);
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
  const client = timeEntryClients.find((currentClient) => matchesClient(entry, currentClient));
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

function setTimeEntryStatus(message) {
  window.LongtailForge.pageController.setStatus(timeEntryStatus, message);
}

function workspaceShowsClientTools() {
  const tools = timeEntrySettings.workspaceCapabilities?.availableTools || [];

  return Array.isArray(tools) && tools.includes("clients_projects");
}

window.LongtailForge.pageController.register("time-entries", {
  snapshot: () => ({
    clientCount: timeEntryClients.length,
    entryCount: timeEntries.length,
    selectedEntryId: "",
    sortMode: sortSelect.value,
    userCount: timeEntryUsers.length,
    workspaceShowsClientTools: workspaceShowsClientTools(),
  }),
  runSmoke: () => {
    const checks = [
      { name: "toolbar controls exist", ok: Boolean(addTimeEntryButton && sortSelect) },
      { name: "filter controls exist", ok: Boolean(filterStatusSelect && filterPeriodSelect && filterUsersSelect) },
      { name: "entry table exists", ok: Boolean(timeEntryTable) },
      { name: "time entry dialog helper exists", ok: Boolean(window.LongtailForge.timeEntryDialog) },
      { name: "entry data is an array", ok: Array.isArray(timeEntries) },
    ];

    return {
      ok: checks.every((check) => check.ok),
      pageId: "time-entries",
      checks,
    };
  },
});
