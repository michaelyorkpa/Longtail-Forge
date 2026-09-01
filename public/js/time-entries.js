// Time Entries reuses the reporting data sources, then writes changes back by entry ID.
(function attachTimeEntriesPage() {
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
  const bulkToolbar = document.querySelector("[data-time-entry-bulk-toolbar]");
  const bulkActionSelect = document.querySelector("[data-time-entry-bulk-action]");
  const bulkTagsControl = document.querySelector("[data-time-entry-bulk-tags]");
  const bulkApplyButton = document.querySelector("[data-time-entry-bulk-apply]");
  const selectAllInput = document.querySelector("[data-time-entry-select-all]");

  let timeEntryClients = [];
  let timeEntrySettings = {
    billingPeriod: { type: "calendarMonth", startDay: 1 },
  };
  let timeEntries = [];
  let timeEntryUsers = [];
  let timeEntryTagOptions = [];
  let bulkTagPicker = null;
  let bulkTagObserver = null;
  const selectedEntryIds = new Set();

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
  bulkActionSelect?.addEventListener("change", updateBulkControls);
  bulkApplyButton?.addEventListener("click", applyBulkTagAction);
  selectAllInput?.addEventListener("change", toggleVisibleSelection);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimezones} BrowserTimezones */

  /**
   * The timezone state and formatters this page cannot render dates without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.2.6.2` made the read checked. Every page that loads this script
   * loads `shared/timezones.js` ahead of it.
   *
   * `navigation.js`, `shared/settings-host.js`, `tasks.js`, and `task-dialog.js` read the same
   * surface optionally and fall back, and they keep doing so: absence is a real state there.
   * @returns {BrowserTimezones}
   */
  function requireTimezones() {
    const timezones = window.LongtailForge?.timezones;
    if (!timezones) {
      throw new Error("Time Entries requires LongtailForge.timezones.");
    }
    return timezones;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFormatters} BrowserFormatters */

  /**
   * The value formatters this page cannot render an invoice status without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.6.6` made the read checked. `time-entries.html` loads
   * `shared/formatters.js` ahead of this script.
   *
   * `time-tracking-dashboard.js` and `time-tracking-reporting.js` read the same surface through
   * `|| {}` and fall back, and they are right to: both are module-contributed scripts injected
   * into views by capability and permission, and **the dashboard view never receives
   * `shared/formatters.js` at all**. `reporting.js` guards it for the same reason.
   * @returns {BrowserFormatters}
   */
  function requireFormatters() {
    const formatters = window.LongtailForge?.formatters;
    if (!formatters) {
      throw new Error("Time Entries requires LongtailForge.formatters.");
    }
    return formatters;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserRecords} BrowserRecords */

  /**
   * The record matchers this page cannot filter without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.6.4` made the read checked. `time-entries.html` is the only page
   * that loads `shared/records.js`, and it loads it ahead of this script.
   *
   * `shared/page-controller.js` and `time-entry-dialog.js` guard the same members and fall back,
   * and they are right to: six of the seven pages that load the page controller never receive
   * `records.js` at all. **This page does, so here the dependency is real.**
   * @returns {BrowserRecords}
   */
  function requireRecords() {
    const records = window.LongtailForge?.records;
    if (!records) {
      throw new Error("Time Entries requires LongtailForge.records.");
    }
    return records;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} BrowserPageController */

  /**
   * The page controller registry this page cannot run without.
   *
   * Acquired at the point of use rather than stored at module scope, so a missing surface still
   * fails at exactly the moment it failed before `0.33.33.38.2.6.2` made the read checked. Every
   * page that loads this script loads `shared/page-controller.js` ahead of it.
   * @returns {BrowserPageController}
   */
  function requirePageController() {
    const controller = window.LongtailForge?.pageController;
    if (!controller) {
      throw new Error("Time Entries requires LongtailForge.pageController.");
    }
    return controller;
  }

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Time entries requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

  /**
   * The alert and confirmation dialogs this file cannot ask a question without. Every page that
   * loads this script also loads `shared/modal.js`, so the checked read fails exactly where the
   * raw read failed before.
   * @returns {BrowserModalDialogs}
   */
  function requireModalDialogs() {
    const dialogs = window.LongtailForge?.modal;
    if (!dialogs) {
      throw new Error("Time entries requires LongtailForge.modal.");
    }
    return dialogs;
  }

  async function loadTimeEntryData() {
    setTimeEntryStatus("Loading entries...");

    try {
      const [settingsResponse, clientsResponse, entriesResponse, usersResponse] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/client-projects?view=options", { cache: "no-store" }),
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
      await mountBulkTagPicker();
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
    await requireTimezones().loadSessionTimezone();
    await window.LongtailForge.workspaceContextReady;
    await loadTimeEntryData();
    openAddFromUrl();
    openEntryFromUrl();
  }

  function populateClientOptions(select, placeholder) {
    select.replaceChildren(createOption("", placeholder));

    timeEntryClients.forEach((client) => {
      select.appendChild(createOption(client.id, clientOptionLabel(client)));
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
    syncSelectionToEntries(entries);
    updateSelectionControls(entries);
    updateBulkControls();

    if (!entries.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "No entries match these filters.";
      row.appendChild(cell);
      timeEntryTable.appendChild(row);
      return;
    }

    entries.forEach((entry) => {
      const row = document.createElement("tr");
      row.append(
        createSelectionCell(entry),
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

  function createSelectionCell(entry) {
    const cell = document.createElement("td");
    const checkbox = document.createElement("input");

    cell.className = "time-entry-selection-cell";
    checkbox.type = "checkbox";
    checkbox.value = entry.entryId;
    checkbox.checked = selectedEntryIds.has(entry.entryId);
    checkbox.setAttribute("aria-label", `Select ${entry.projectName || "time entry"} from ${formatDate(entry.endTime)}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedEntryIds.add(entry.entryId);
      } else {
        selectedEntryIds.delete(entry.entryId);
      }
      updateSelectionControls(getFilteredEntries());
      updateBulkControls();
    });
    cell.appendChild(checkbox);
    return cell;
  }

  function getFilteredEntries() {
    const selectedUsers = getSelectedUserIds();
    const selectedDateRange = getSelectedDateRange();
    const selectedTagId = filterTagSelect?.value || "";
    const noTagsValue = noTagsFilterValue();

    return timeEntries
      .filter((entry) => matchesStatusFilter(entry))
      .filter((entry) => isEntryInRange(entry, selectedDateRange))
      .filter((entry) => selectedUsers.length === 0 || selectedUsers.includes(entry.userId))
      .filter((entry) => {
        if (!selectedTagId) {
          return true;
        }
        if (selectedTagId === noTagsValue || selectedTagId === "__no_effective_tags__") {
          return (entry.tags || []).length === 0;
        }
        return (entry.tags || []).some((tag) => tag.tag_id === selectedTagId);
      })
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
    const editButton = createTimeEntryActionButton("Edit", "edit");
    const deleteButton = createTimeEntryActionButton("Delete", "delete", { danger: true });

    actions.className = "table-actions";
    editButton.addEventListener("click", () => openEditDialog(entry.entryId));

    deleteButton.addEventListener("click", () => deleteEntry(entry));

    actions.append(editButton, deleteButton);
    cell.appendChild(actions);
    return cell;
  }

  function createTimeEntryActionButton(label, icon, options = {}) {
    if (window.LongtailForge?.icons?.createIconButton) {
      return window.LongtailForge.icons.createIconButton({
        icon,
        label,
        title: label,
        variant: options.danger ? "danger" : "",
      });
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("danger-button", options.danger === true);
    return button;
  }

  // `time-entries.html` loads `js/time-entry-dialog.js` itself, so this reads a dependency the
  // page guarantees rather than probing for one. It throws where the property access used to
  // throw, inside the same try/catch that already reported the failure.
  /** @returns {import("../../src/types/browser-contracts.js").BrowserTimeEntryDialog} */
  function requireTimeEntryDialog() {
    const timeEntryDialog = window.LongtailForge.timeEntryDialog;

    if (!timeEntryDialog) {
      throw new Error("The time entry dialog is required to open an entry.");
    }

    return timeEntryDialog;
  }

  async function openEditDialog(entryId) {
    setTimeEntryStatus("Opening entry...");

    try {
      const result = await requireTimeEntryDialog().openEdit({ entryId }, {
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
      const result = await requireTimeEntryDialog().openAdd({}, {
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
    const shouldDelete = await requireModalDialogs().confirm({
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
      await requireApi().deleteJson(
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

  // Every page that loads this controller also loads `js/shared/client-project-options.js`,
  // so this reads a dependency the page guarantees rather than probing for one.
  function requireClientProjectOptions() {
    const clientProjectOptions = window.LongtailForge?.clientProjectOptions;

    if (!clientProjectOptions) {
      throw new Error("Time Entries requires the client and project option helper.");
    }

    return clientProjectOptions;
  }

  function normalizeClients(data) {
    return requireClientProjectOptions().normalizeClients(data);
  }

  function clientOptionLabel(client) {
    return requireClientProjectOptions().optionLabel(client);
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
    const billingPeriodType = readModuleSettingValue(settings, "client-projects", "billingPeriodType", "calendarMonth");
    const billingPeriodStartDay = readModuleSettingValue(settings, "client-projects", "billingPeriodStartDay", 1);
    return {
      billingPeriod: normalizeBillingPeriod({ type: billingPeriodType, startDay: billingPeriodStartDay }),
      workspaceCapabilities: settings?.workspaceCapabilities || {},
    };
  }

  function readModuleSettingValue(settings, moduleId, settingId, fallback) {
    const moduleDefinition = (settings?.moduleSettings || []).find((item) => item.moduleId === moduleId);
    const setting = (moduleDefinition?.settings || []).find((item) => item.id === settingId);
    return setting && Object.hasOwn(setting, "value") ? setting.value : fallback;
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
      tagFilterAllOption(),
      tagFilterNoTagsOption(),
      ...timeEntryTagOptions.map((tag) => createOption(tag.tag_id, tag.name || tag.slug)),
    );
    filterTagSelect.value = previousValue === noTagsFilterValue() || previousValue === "__no_effective_tags__" || timeEntryTagOptions.some((tag) => tag.tag_id === previousValue)
      ? normalizeTagFilterValue(previousValue)
      : "";
  }

  async function mountBulkTagPicker() {
    if (!bulkTagsControl || !window.LongtailForge.tags?.mountPicker) {
      return;
    }

    bulkTagObserver?.disconnect();
    bulkTagPicker = await window.LongtailForge.tags.mountPicker(bulkTagsControl, {
      allowCreate: false,
      label: "Tags",
      placeholder: "Find tags",
      tags: timeEntryTagOptions,
    });
    if (window.MutationObserver) {
      bulkTagObserver = new window.MutationObserver(updateBulkControls);
      bulkTagObserver.observe(bulkTagsControl, {
        childList: true,
        subtree: true,
      });
    }
    updateBulkControls();
  }

  async function applyBulkTagAction() {
    const targetIds = [...selectedEntryIds];
    const tagIds = bulkTagPicker?.readTagIds?.() || [];
    const action = bulkActionSelect?.value === "remove" ? "remove" : "add";

    if (targetIds.length === 0 || tagIds.length === 0) {
      updateBulkControls();
      return;
    }

    setTimeEntryStatus("Updating time entry tags...");
    if (bulkApplyButton) {
      bulkApplyButton.disabled = true;
    }

    try {
      const result = await requireApi().postJson("/api/tags/bulk-assignments", {
        action,
        tagIds,
        targetIds,
        targetType: "time_entry",
      });
      const changedCount = Number(result.changed_count) || 0;
      const skippedCount = Number(result.skipped_count) || 0;
      selectedEntryIds.clear();
      bulkTagPicker?.setSelected?.([]);
      await loadTimeEntryData();
      const skippedText = skippedCount > 0 ? ` ${skippedCount} skipped.` : "";
      setTimeEntryStatus(`Updated tags on ${changedCount} time ${changedCount === 1 ? "entry" : "entries"}.${skippedText}`);
    } catch (error) {
      setTimeEntryStatus(error.message || "Time entry tags could not be updated.");
      console.error(error);
    } finally {
      updateBulkControls();
    }
  }

  function toggleVisibleSelection() {
    const entries = getFilteredEntries();
    const shouldSelect = selectAllInput?.checked === true;

    entries.forEach((entry) => {
      if (shouldSelect) {
        selectedEntryIds.add(entry.entryId);
      } else {
        selectedEntryIds.delete(entry.entryId);
      }
    });
    renderEntries();
  }

  function syncSelectionToEntries(entries) {
    const visibleIds = new Set(entries.map((entry) => entry.entryId));
    [...selectedEntryIds].forEach((entryId) => {
      if (!visibleIds.has(entryId)) {
        selectedEntryIds.delete(entryId);
      }
    });
  }

  function updateSelectionControls(entries = getFilteredEntries()) {
    if (!selectAllInput) {
      return;
    }

    const selectedVisibleCount = entries.filter((entry) => selectedEntryIds.has(entry.entryId)).length;
    selectAllInput.checked = entries.length > 0 && selectedVisibleCount === entries.length;
    selectAllInput.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < entries.length;
    selectAllInput.disabled = entries.length === 0;
  }

  function updateBulkControls() {
    const selectedCount = selectedEntryIds.size;
    const tagIds = bulkTagPicker?.readTagIds?.() || [];
    const hasTags = tagIds.length > 0;

    if (bulkToolbar && selectedCount > 0) {
      bulkToolbar.open = true;
    }
    if (bulkApplyButton) {
      bulkApplyButton.disabled = selectedCount === 0 || !hasTags;
      bulkApplyButton.textContent = `Apply to ${selectedCount}`;
    }
  }

  function tagFilterAllOption() {
    return window.LongtailForge?.tags?.allTagsOption?.() || createOption("", "All tags");
  }

  function tagFilterNoTagsOption() {
    return window.LongtailForge?.tags?.noTagsOption?.() || createOption(noTagsFilterValue(), "No Tags");
  }

  function noTagsFilterValue() {
    return window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
  }

  function normalizeTagFilterValue(value) {
    return value === "__no_effective_tags__" ? noTagsFilterValue() : value;
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
      requireTimezones().zonedDateTimeToUtcIso(addDateInputDays(filterEndDateInput.value, 1), "00:00:00"),
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
    return requireRecords().matchesClient(entry, client);
  }

  function matchesProject(entry, project) {
    return requireRecords().matchesProject(entry, project);
  }

  function parseDateInput(value) {
    if (!value) {
      return null;
    }

    const date = new Date(requireTimezones().zonedDateTimeToUtcIso(value, "00:00:00"));

    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDate(date) {
    return Number.isFinite(date.getTime())
      ? requireTimezones().formatDate(date)
      : "";
  }

  function formatHours(seconds) {
    return formatDuration(seconds);
  }

  function formatInvoiceStatus(status) {
    return requireFormatters().entryStatus(status);
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
    return requireTimezones().formatDateInput(date);
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
    return requirePageController().createOption(value, text);
  }

  function createTableCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function sortByName(items) {
    return requirePageController().sortByName(items);
  }

  function setTimeEntryStatus(message) {
    requirePageController().setStatus(timeEntryStatus, message);
  }

  function workspaceShowsClientTools() {
    const tools = timeEntrySettings.workspaceCapabilities?.availableTools || [];

    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  requirePageController().register("time-entries", {
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
        { name: "bulk tag controls exist", ok: Boolean(bulkToolbar && bulkActionSelect && bulkTagsControl && bulkApplyButton && selectAllInput) },
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
})();
