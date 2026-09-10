// Time Entries reuses the reporting data sources, then writes changes back by entry ID.
(function attachTimeEntriesPage() {
  /**
   * One filter control, at the subtype `views/protected/time-entries.html` renders, or `null`.
   *
   * **Typed-or-null on purpose**, the same reading `0.33.33.44.5` settled for User Administration.
   * The markup is static and always carries these controls, but acquisition runs at module
   * evaluation - outside the `try` in `loadTimeEntryData` - so refusing here would turn a missing
   * control into a dead page instead of the "Entries could not be loaded." status it produces
   * today. The subtype is settled here; presence is settled at the statement that already
   * dereferenced it.
   * @template T
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function findTimeEntryControl(selector, constructor) {
    const element = document.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * Narrow at an access this page already made unguarded.
   *
   * Controls the page already guarded keep their guards - the tag filter is read through `?.` and
   * an explicit absence check, and stays optional. This is only for the statements that
   * dereferenced a control directly, which is what makes it required.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireTimeEntryValue(value, name) {
    if (value === null) {
      throw new TypeError(`Time Entries requires its ${name}.`);
    }

    return value;
  }

  const filterClientSelect = findTimeEntryControl("[data-time-entry-filter-client]", HTMLSelectElement);
  const filterProjectSelect = findTimeEntryControl("[data-time-entry-filter-project]", HTMLSelectElement);
  const filterStatusSelect = findTimeEntryControl("[data-time-entry-filter-status]", HTMLSelectElement);
  const filterPeriodSelect = findTimeEntryControl("[data-time-entry-filter-period]", HTMLSelectElement);
  const filterCustomDates = findTimeEntryControl("[data-time-entry-filter-custom-dates]", HTMLElement);
  const filterStartDateInput = findTimeEntryControl("[data-time-entry-filter-start-date]", HTMLInputElement);
  const filterEndDateInput = findTimeEntryControl("[data-time-entry-filter-end-date]", HTMLInputElement);
  const filterUsersSelect = findTimeEntryControl("[data-time-entry-filter-users]", HTMLSelectElement);
  const filterTagControl = findTimeEntryControl("[data-time-entry-filter-tag-control]", HTMLElement);
  const filterTagSelect = findTimeEntryControl("[data-time-entry-filter-tag]", HTMLSelectElement);
  const sortSelect = findTimeEntryControl("[data-time-entry-sort]", HTMLSelectElement);
  const addTimeEntryButton = document.querySelector("[data-add-time-entry]");
  const timeEntryStatus = document.querySelector("[data-time-entry-status]");
  const timeEntryTable = document.querySelector("[data-time-entry-table]");
  const bulkToolbar = findTimeEntryControl("[data-time-entry-bulk-toolbar]", HTMLDetailsElement);
  const bulkActionSelect = findTimeEntryControl("[data-time-entry-bulk-action]", HTMLSelectElement);
  const bulkTagsControl = findTimeEntryControl("[data-time-entry-bulk-tags]", HTMLElement);
  const bulkApplyButton = findTimeEntryControl("[data-time-entry-bulk-apply]", HTMLButtonElement);
  const selectAllInput = findTimeEntryControl("[data-time-entry-select-all]", HTMLInputElement);

  let timeEntryClients = [];
  let timeEntrySettings = {
    billingPeriod: { type: "calendarMonth", startDay: 1 },
  };
  /**
   * The rows this page filters, orders and renders.
   *
   * Typed from what `normalizeTimeEntries` establishes rather than from the wire: every element
   * has been through the checked row predicate, so each declared member is a fact the compiler
   * can hold the readers to.
   * @type {NormalizedTimeEntry[]}
   */
  let timeEntries = [];
  let timeEntryUsers = [];

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagCatalogRecord} BrowserTagCatalogRecord */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagPickerController} BrowserTagPickerController */

  /**
   * The tag catalogue this page offers, both in the filter and in the bulk picker.
   *
   * Established by the published surface rather than by this page: `loadTags` answers
   * `Promise<BrowserTagCatalogRecord[]>`, and `loadTagOptions` returns that or an empty list on
   * either refusal path, so `tag_id`, `name` and `slug` are facts here rather than hopes.
   * @type {BrowserTagCatalogRecord[]}
   */
  let timeEntryTagOptions = [];
  /**
   * The mounted bulk picker, or `null` before it mounts and when the surface declines.
   *
   * `mountPicker` is declared to answer `BrowserTagPickerController | null`, so absence is a
   * state this page has always had to hold. The reads below keep their optional calls: this
   * checkpoint types the slot, and does not re-decide how a mounted picker is spoken to.
   * @type {BrowserTagPickerController | null}
   */
  let bulkTagPicker = null;
  /** @type {MutationObserver | null} */
  let bulkTagObserver = null;
  const selectedEntryIds = new Set();

  initializeTimeEntries();

  requireTimeEntryValue(filterStatusSelect, "status filter").addEventListener("change", renderEntries);
  requireTimeEntryValue(filterPeriodSelect, "period filter").addEventListener("change", () => {
    updateFilterDateState();
    renderEntries();
  });
  requireTimeEntryValue(filterStartDateInput, "custom start date").addEventListener("change", renderEntries);
  requireTimeEntryValue(filterEndDateInput, "custom end date").addEventListener("change", renderEntries);
  requireTimeEntryValue(filterUsersSelect, "user filter").addEventListener("change", renderEntries);
  filterTagSelect?.addEventListener("change", renderEntries);
  requireTimeEntryValue(sortSelect, "sort control").addEventListener("change", renderEntries);
  addTimeEntryButton.addEventListener("click", openAddDialog);
  requireTimeEntryValue(filterClientSelect, "client filter").addEventListener("change", () => {
    populateFilterProjects();
    renderEntries();
  });
  requireTimeEntryValue(filterProjectSelect, "project filter").addEventListener("change", renderEntries);
  bulkActionSelect?.addEventListener("change", updateBulkControls);
  bulkApplyButton?.addEventListener("click", applyBulkTagAction);
  selectAllInput?.addEventListener("change", toggleVisibleSelection);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimezones} BrowserTimezones */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  /** @typedef {import("../../src/types/browser-contracts.js").LongtailForgeBrowserNamespace} LongtailForgeBrowserNamespace */

  /**
   * The namespace root this page awaits its workspace-context readiness through.
   *
   * **The root is checked and the member is not, because those are different facts.** A missing
   * root failed at this property read before and still fails here, in the same expression and so
   * inside the same `try` region. A present root that publishes no `workspaceContextReady` never
   * failed - `await undefined` is a real state this page has always tolerated, and it still
   * continues one microtask later exactly as it did.
   *
   * Read per call rather than captured, so a root replaced between invocations is seen.
   * @returns {LongtailForgeBrowserNamespace}
   */
  function requireNamespace() {
    const namespace = window.LongtailForge;

    if (!namespace) {
      throw new Error("Time Entries requires the LongtailForge namespace.");
    }

    return namespace;
  }

  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Time Entries requires LongtailForge.errors.");
    }
    return errors;
  }

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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagBulkAssignmentResult} BrowserTagBulkAssignmentResult */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagBulkAction} BrowserTagBulkAction */

  /**
   * The three words `normalizeBulkTagAction` answers before it throws.
   * @type {readonly BrowserTagBulkAction[]}
   */
  const TAG_BULK_ACTIONS = Object.freeze(["add", "remove", "replace"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   *
   * Named for the page rather than for its first caller: the bulk response and the entries
   * response ask the same question, and `0.33.33.44.12` found this one already here rather than
   * adding a second predicate beside it.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isTimeEntryRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * What the bulk tag route answered, or `null` when it cannot be vouched for.
   *
   * **Refused rather than defaulted, because the numbers are the message.** The raw
   * `Number(...) || 0` reads turned an unreadable body into "Updated tags on 0 time entries",
   * which reports a specific outcome the response never stated. `null` takes the mutation's own
   * error path, which says the tags could not be updated.
   *
   * The failure list is checked through the surface `0.33.33.38.4.11` published for it rather
   * than re-validated here.
   * @param {unknown} body
   * @returns {BrowserTagBulkAssignmentResult | null}
   */
  function readTagBulkAssignment(body) {
    if (!isTimeEntryRecord(body)) {
      return null;
    }
    const { action: actionWord, changed, changed_count: changedCount, errors, skipped_count: skippedCount, target_type: targetType } = body;
    if (typeof actionWord !== "string"
      || !Array.isArray(changed)
      || !Array.isArray(errors)
      || typeof targetType !== "string" || targetType === ""
      || ![changedCount, skippedCount].every((count) => typeof count === "number" && Number.isFinite(count))
      || changedCount !== changed.length
      || skippedCount !== errors.length) {
      return null;
    }
    // Searched rather than tested for membership, because a membership test answers a boolean
    // and leaves the word as bare `string`; the search answers the vocabulary's own member.
    const action = TAG_BULK_ACTIONS.find((word) => word === actionWord);
    if (!action) {
      return null;
    }
    // `readBulkFailures` drops any entry it cannot vouch for, and this producer builds every
    // failure with a message fallback. A shorter list therefore means the body did not come
    // from this producer, and the count would be describing failures the browser cannot see.
    const failures = requireErrors().readBulkFailures(body);
    if (failures.length !== skippedCount) {
      return null;
    }
    return {
      action,
      changed,
      changed_count: changedCount,
      errors: failures,
      skipped_count: skippedCount,
      target_type: targetType,
    };
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
    await requireNamespace().workspaceContextReady;
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
    const projectFilter = requireTimeEntryValue(filterProjectSelect, "project filter");
    const client = getClient(requireTimeEntryValue(filterClientSelect, "client filter").value);
    projectFilter.replaceChildren(createOption("", "All projects"));
    const projects = client
      ? client.projects
      : getAllFilterProjects();
    projectFilter.disabled = projects.length === 0;

    sortByName(projects).forEach((project) => {
      projectFilter.appendChild(createOption(project.id, project.name));
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

  /** @param {NormalizedTimeEntry} entry */
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

  /**
   * A tag carrying the identity the tag filter compares against.
   *
   * The entry's `tags` are `unknown[]` because only the array itself was ever checked. This
   * narrows at the one read that takes a member off an element, so an element without a string
   * `tag_id` simply does not match - which is what the unchecked read did too.
   * @param {unknown} value
   * @returns {value is { tag_id: string }}
   */
  function isTagWithIdentity(value) {
    return isTimeEntryRecord(value) && typeof value.tag_id === "string";
  }

  /** @returns {NormalizedTimeEntry[]} */
  function getFilteredEntries() {
    const clientFilter = requireTimeEntryValue(filterClientSelect, "client filter");
    const projectFilter = requireTimeEntryValue(filterProjectSelect, "project filter");
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
        return (entry.tags || []).some((tag) => isTagWithIdentity(tag) && tag.tag_id === selectedTagId);
      })
      .filter((entry) => !clientFilter.value || matchesClient(entry, getClient(clientFilter.value)))
      .filter((entry) => !projectFilter.value || matchesProject(entry, getProject(clientFilter.value, projectFilter.value)))
      .sort(compareEntries);
  }

  /**
   * @param {NormalizedTimeEntry} firstEntry
   * @param {NormalizedTimeEntry} secondEntry
   * @returns {number}
   */
  function compareEntries(firstEntry, secondEntry) {
    switch (requireTimeEntryValue(sortSelect, "sort control").value) {
      // `endTime` is a `Date`, and the subtraction that ordered these rows was always calling
      // `valueOf`. Stating `getTime()` is the same number, now written where it happens.
      case "end_asc":
        return firstEntry.endTime.getTime() - secondEntry.endTime.getTime();
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
        return secondEntry.endTime.getTime() - firstEntry.endTime.getTime();
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
    const timeEntryDialog = requireNamespace().timeEntryDialog;

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
      setTimeEntryStatus(requireErrors().caughtMessage(error, "Entry could not be opened."));
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
      setTimeEntryStatus(requireErrors().caughtMessage(error, "Entry could not be opened."));
    }
  }

  function createProjectCell(entry) {
    const cell = createTableCell(entry.projectName);

    const tagSurface = requireNamespace().tags;

    if (tagSurface?.renderTagList && Array.isArray(entry.tags) && entry.tags.length > 0) {
      const tagList = document.createElement("div");
      tagList.className = "tag-chip-list";
      tagSurface.renderTagList(tagList, entry.tags);
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

  /**
   * The wire columns `/api/time-entries` guarantees as text.
   *
   * Traced rather than assumed, and the same ten `0.33.33.44.6` settled for the dialog: the route
   * maps every row through `timeEntryRowToAppValue`, which calls `normalizeTimeEntry` in
   * `src/utils/normalizers.js`, and that returns `String(...).trim()` for each of these. It is the
   * same producer feeding both pages, so both check the same list.
   *
   * `duration_seconds` is deliberately string-valued on the wire and is read here through
   * `Number(...) || 0`, and `billable` and `tags` reach their own checks below, so none of the
   * three belongs in this list.
   */
  const TIME_ENTRY_TEXT_COLUMNS = Object.freeze([
    "client_id", "client_name", "description", "end_time", "entry_id",
    "invoice_status", "project_id", "project_name", "start_time", "user_id",
  ]);

  /**
   * @typedef {{
   *   billable: "yes" | "no" | "",
   *   clientId: string,
   *   clientName: string,
   *   description: string,
   *   durationSeconds: number,
   *   endTime: Date,
   *   entryId: string,
   *   invoiceStatus: string,
   *   projectId: string,
   *   projectName: string,
   *   startTime: Date,
   *   tags: unknown[],
   *   userId: string,
   * }} NormalizedTimeEntry
   *
   * `tags` stays `unknown[]` because nothing establishes its elements: the body is only checked
   * with `Array.isArray`, and the shared `renderTagList` takes `unknown[]` too. The one place a
   * member is read off an element narrows at that read instead of declaring over it.
   */

  /**
   * @typedef {{
   *   client_id: string, client_name: string, description: string, end_time: string,
   *   entry_id: string, invoice_status: string, project_id: string, project_name: string,
   *   start_time: string, user_id: string,
   * }} TimeEntryTextColumns
   */

  /**
   * A row this page can read every declared member off.
   *
   * Checked, not coerced: the predicate carries the ten columns it proved, so the mapping below
   * reads them as the strings the check established rather than re-asserting them. Against the
   * real producer nothing is dropped - the server already guarantees all ten - so this refuses a
   * body that never reaches the page in practice rather than silently building a row whose
   * declared members were never established.
   * @param {unknown} value
   * @returns {value is Record<string, unknown> & TimeEntryTextColumns}
   */
  function isTimeEntryRow(value) {
    return isTimeEntryRecord(value)
      && TIME_ENTRY_TEXT_COLUMNS.every((column) => typeof value[column] === "string");
  }

  /**
   * @param {unknown} data
   * @returns {NormalizedTimeEntry[]}
   */
  function normalizeTimeEntries(data) {
    const entries = isTimeEntryRecord(data) && Array.isArray(data.entries) ? data.entries : [];

    return entries.filter(isTimeEntryRow).map((entry) => ({
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
    }));
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

    const userFilter = requireTimeEntryValue(filterUsersSelect, "user filter");

    userFilter.replaceChildren();

    [...usersById.entries()]
      .sort((firstUser, secondUser) => firstUser[1].localeCompare(secondUser[1], undefined, {
        sensitivity: "base",
      }))
      .forEach(([userId, label]) => {
        userFilter.appendChild(createOption(userId, label));
      });
  }

  /** @returns {Promise<BrowserTagCatalogRecord[]>} */
  async function loadTagOptions() {
    const tagSurface = requireNamespace().tags;

    if (!tagSurface?.loadTags) {
      return [];
    }

    try {
      return await tagSurface.loadTags();
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
    if (!bulkTagsControl) {
      return;
    }

    const tagSurface = requireNamespace().tags;

    if (!tagSurface?.mountPicker) {
      return;
    }

    bulkTagObserver?.disconnect();
    bulkTagPicker = await tagSurface.mountPicker(bulkTagsControl, {
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
      const assignment = readTagBulkAssignment(result);
      if (!assignment) {
        throw new Error("The bulk tag response could not be read.");
      }
      const changedCount = assignment.changed_count;
      const skippedCount = assignment.skipped_count;
      selectedEntryIds.clear();
      bulkTagPicker?.setSelected?.([]);
      await loadTimeEntryData();
      const skippedText = skippedCount > 0 ? ` ${skippedCount} skipped.` : "";
      setTimeEntryStatus(`Updated tags on ${changedCount} time ${changedCount === 1 ? "entry" : "entries"}.${skippedText}`);
    } catch (error) {
      setTimeEntryStatus(requireErrors().caughtMessage(error, "Time entry tags could not be updated."));
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

  /** @param {NormalizedTimeEntry[]} entries */
  function syncSelectionToEntries(entries) {
    const visibleIds = new Set(entries.map((entry) => entry.entryId));
    [...selectedEntryIds].forEach((entryId) => {
      if (!visibleIds.has(entryId)) {
        selectedEntryIds.delete(entryId);
      }
    });
  }

  /** @param {NormalizedTimeEntry[]} [entries] */
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

  /** @returns {string[]} */
  function getSelectedUserIds() {
    const userFilter = requireTimeEntryValue(filterUsersSelect, "user filter");

    return [...userFilter.selectedOptions].map((option) => option.value);
  }

  /**
   * @param {NormalizedTimeEntry} entry
   * @returns {boolean}
   */
  function matchesStatusFilter(entry) {
    const statusFilter = requireTimeEntryValue(filterStatusSelect, "status filter");

    if (getEffectiveEntryBillable(entry) !== "yes") {
      return !statusFilter.value;
    }

    return !statusFilter.value || entry.invoiceStatus === statusFilter.value;
  }

  /**
   * The two answers a date filter can give, kept as one discriminated shape because
   * `isEntryInRange` branches on exactly that: `invalid` first, then the window.
   *
   * `start` and `end` are declared absent on the invalid side rather than omitted, so reading
   * `range?.invalid` stays legal on both and the guard narrows instead of asserting.
   * @typedef {{ invalid: true, start?: undefined, end?: undefined }} TimeEntryInvalidRange
   * @typedef {{ invalid?: false, start: Date, end: Date }} TimeEntryWindow
   * @typedef {TimeEntryInvalidRange | TimeEntryWindow} TimeEntryDateRange
   */

  /**
   * The window the list is filtered to, or `null` for every entry.
   *
   * `invalid` is its own answer rather than an empty window: `isEntryInRange` refuses every row
   * for it, which is how a half-typed custom range shows nothing instead of everything.
   * @returns {TimeEntryDateRange | null}
   */
  function getSelectedDateRange() {
    const periodFilter = requireTimeEntryValue(filterPeriodSelect, "period filter");

    if (periodFilter.value === "all") {
      return null;
    }

    if (periodFilter.value === "custom") {
      return getCustomDateRange();
    }

    return getBillingPeriodRange(timeEntrySettings.billingPeriod, periodFilter.value);
  }

  /** @returns {TimeEntryDateRange} */
  function getCustomDateRange() {
    const endDateInput = requireTimeEntryValue(filterEndDateInput, "custom end date");
    const startDate = parseDateInput(requireTimeEntryValue(filterStartDateInput, "custom start date").value);
    const endDate = parseDateInput(endDateInput.value);

    if (!startDate || !endDate || startDate > endDate) {
      return { invalid: true };
    }

    const exclusiveEndDate = new Date(
      requireTimezones().zonedDateTimeToUtcIso(addDateInputDays(endDateInput.value, 1), "00:00:00"),
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

  /**
   * @param {NormalizedTimeEntry} entry
   * @param {TimeEntryDateRange | null} range
   * @returns {boolean}
   */
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

  /**
   * @param {unknown} value
   * @returns {"yes" | "no" | ""}
   */
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
    requireTimeEntryValue(filterStartDateInput, "custom start date").value =
      formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
    requireTimeEntryValue(filterEndDateInput, "custom end date").value = formatDateInput(today);
  }

  function updateFilterDateState() {
    const isCustom = requireTimeEntryValue(filterPeriodSelect, "period filter").value === "custom";
    requireTimeEntryValue(filterCustomDates, "custom date fields").hidden = !isCustom;
    requireTimeEntryValue(filterStartDateInput, "custom start date").disabled = !isCustom;
    requireTimeEntryValue(filterEndDateInput, "custom end date").disabled = !isCustom;
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
      sortMode: requireTimeEntryValue(sortSelect, "sort control").value,
      userCount: timeEntryUsers.length,
      workspaceShowsClientTools: workspaceShowsClientTools(),
    }),
    runSmoke: () => {
      const checks = [
        { name: "toolbar controls exist", ok: Boolean(addTimeEntryButton && sortSelect) },
        { name: "filter controls exist", ok: Boolean(filterStatusSelect && filterPeriodSelect && filterUsersSelect) },
        { name: "bulk tag controls exist", ok: Boolean(bulkToolbar && bulkActionSelect && bulkTagsControl && bulkApplyButton && selectAllInput) },
        { name: "entry table exists", ok: Boolean(timeEntryTable) },
        { name: "time entry dialog helper exists", ok: Boolean(requireNamespace().timeEntryDialog) },
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
