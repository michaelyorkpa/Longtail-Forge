(function attachAuditLogPage() {
  const auditFilterForm = findAuditControl("[data-audit-filters]", HTMLFormElement);
  const auditViewSelect = findAuditControl("[data-audit-view-filter]", HTMLSelectElement);
  const dateFromInput = findAuditControl("[data-audit-date-from]", HTMLInputElement);
  const dateToInput = findAuditControl("[data-audit-date-to]", HTMLInputElement);
  const userFilterSelect = findAuditControl("[data-audit-user-filter]", HTMLSelectElement);
  const clientFilterControl = findAuditControl("[data-audit-client-filter-control]", HTMLElement);
  const clientFilterSelect = findAuditControl("[data-audit-client-filter]", HTMLSelectElement);
  const projectFilterSelect = findAuditControl("[data-audit-project-filter]", HTMLSelectElement);
  const recordTypeFilterSelect = findAuditControl("[data-audit-record-type-filter]", HTMLSelectElement);
  const changeTypeFilterSelect = findAuditControl("[data-audit-change-type-filter]", HTMLSelectElement);
  const workspaceFilterControl = findAuditControl("[data-audit-workspace-filter-control]", HTMLElement);
  const workspaceFilterSelect = findAuditControl("[data-audit-workspace-filter]", HTMLSelectElement);
  const showUtcInput = findAuditControl("[data-audit-show-utc]", HTMLInputElement);
  const resetButton = findAuditControl("[data-audit-reset]", HTMLButtonElement);
  const exportFilteredButton = findAuditControl("[data-audit-export-filtered]", HTMLButtonElement);
  const exportAllButton = findAuditControl("[data-audit-export-all]", HTMLButtonElement);
  const pageSizeSelect = findAuditControl("[data-audit-page-size]", HTMLSelectElement);
  const previousPageButton = findAuditControl("[data-audit-previous-page]", HTMLButtonElement);
  const nextPageButton = findAuditControl("[data-audit-next-page]", HTMLButtonElement);
  const pageSummary = findAuditControl("[data-audit-page-summary]", HTMLElement);
  const auditStatus = findAuditControl("[data-audit-status]", HTMLElement);
  const auditLogBody = findAuditControl("[data-audit-log-body]", HTMLElement);

  /**
   * One audit row as this page holds it.
   *
   * `normalizeAuditLog` coerces every member it reads to a string, so the nullable members
   * `BrowserAuditLogEntry` declares - the actor, the record, and the three JSON snapshots - are
   * already resolved to `""` before anything renders them, which is why nothing downstream
   * re-checks them for null. `workspace_id` is not carried: this page never reads it off a row.
   * @typedef {Record<
   *   "action" | "actor_user_id" | "actor_user_name" | "audit_id" | "change_type" | "created_at"
   *   | "ip_address" | "metadata_json" | "new_value_json" | "previous_value_json" | "record_id"
   *   | "record_label" | "record_type" | "record_url",
   *   string
   * >} NormalizedAuditLog
   */

  /** @type {NormalizedAuditLog[]} */
  let auditLogs = [];
  let currentPage = 1;
  let totalAuditLogs = 0;

  /**
   * **Typed-or-null on purpose**, the reading `0.33.33.44.5` settled and `0.33.33.44.12`,
   * `0.33.33.44.18` and `0.33.33.44.19` reused: the markup is static and always carries these
   * controls, but acquisition runs at module evaluation - outside every `try` on this page - so
   * refusing here would turn a missing control into a dead page instead of the status this page
   * already produces. The subtype is settled here; presence is settled at the statement that
   * already dereferenced it.
   * @template T
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function findAuditControl(selector, constructor) {
    const element = document.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * Narrow at an access this page already made unguarded.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireAuditValue(value, name) {
    if (value === null) {
      throw new TypeError(`Audit Log requires its ${name}.`);
    }

    return value;
  }

  initializeAuditLog();

  requireAuditValue(auditFilterForm, "filter form").addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(resetButton, "reset button").addEventListener("click", () => {
    requireAuditValue(auditFilterForm, "filter form").reset();
    setDefaultWorkspaceFilter();
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(exportFilteredButton, "filtered export button").addEventListener("click", () => {
    window.location.href = `${getAuditEndpoint()}/export.csv?${buildFilterParams().toString()}`;
  });

  requireAuditValue(exportAllButton, "full export button").addEventListener("click", () => {
    window.location.href = `${getAuditEndpoint()}/export.csv`;
  });

  requireAuditValue(auditViewSelect, "view filter").addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(pageSizeSelect, "page size select").addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(workspaceFilterSelect, "workspace filter").addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(showUtcInput, "UTC toggle").addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  requireAuditValue(previousPageButton, "previous page button").addEventListener("click", () => {
    if (currentPage <= 1) {
      return;
    }

    currentPage -= 1;
    loadAuditLogs();
  });

  requireAuditValue(nextPageButton, "next page button").addEventListener("click", () => {
    if (currentPage >= getTotalPages()) {
      return;
    }

    currentPage += 1;
    loadAuditLogs();
  });

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
      throw new Error("Audit Log requires the LongtailForge namespace.");
    }

    return namespace;
  }

  function requireTimezones() {
    const timezones = window.LongtailForge?.timezones;
    if (!timezones) {
      throw new Error("Audit Log requires LongtailForge.timezones.");
    }
    return timezones;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

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
      throw new Error("The audit log requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditLogEntry} BrowserAuditLogEntry */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditFilterOption} BrowserAuditFilterOption */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditFilterOptions} BrowserAuditFilterOptions */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserBoundedPagination} BrowserBoundedPagination */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditLogEnvelope} BrowserAuditLogEnvelope */

  /** The six `NOT NULL` columns of `audit_logs`, in the order the query selects them. */
  const AUDIT_ENTRY_TEXT = Object.freeze([
    "audit_id",
    "workspace_id",
    "created_at",
    "action",
    "change_type",
    "record_type",
  ]);

  /** The nine nullable columns beside them, snapshots included. */
  const AUDIT_ENTRY_NULLABLE_TEXT = Object.freeze([
    "actor_user_id",
    "actor_user_name",
    "record_id",
    "record_label",
    "record_url",
    "ip_address",
    "previous_value_json",
    "new_value_json",
    "metadata_json",
  ]);

  /** The four catalogues whose builders write a label beside a value. */
  const AUDIT_LABELLED_FILTERS = Object.freeze(["clients", "projects", "users", "workspaces"]);

  /** The two catalogues the repository maps straight to bare strings. */
  const AUDIT_STRING_FILTERS = Object.freeze(["changeTypes", "recordTypes"]);

  /** The four integers `boundedPaginationEnvelope` coerces itself. */
  const BOUNDED_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * @param {unknown} value
   * @returns {value is string | null}
   */
  function isNullableText(value) {
    return value === null || typeof value === "string";
  }

  /**
   * One audit entry, checked column for column against the table it is selected from.
   *
   * The three snapshot members are checked as **text or null and nothing more**: they carry
   * `JSON.stringify` output the writer produced, and this boundary does not parse them into a
   * shape, because no producer agrees on one.
   * @param {unknown} value
   * @returns {value is BrowserAuditLogEntry}
   */
  function isAuditLogEntry(value) {
    return isResponseRecord(value)
      && AUDIT_ENTRY_TEXT.every((member) => typeof value[member] === "string")
      && value.audit_id !== ""
      && AUDIT_ENTRY_NULLABLE_TEXT.every((member) => isNullableText(value[member]));
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserAuditFilterOption}
   */
  function isAuditFilterOption(value) {
    return isResponseRecord(value) && typeof value.label === "string" && typeof value.value === "string";
  }

  /**
   * The six catalogues, each element vouched for by the vocabulary its builder writes.
   * @param {unknown} value
   * @returns {value is BrowserAuditFilterOptions}
   */
  function isAuditFilterOptions(value) {
    return isResponseRecord(value)
      && AUDIT_LABELLED_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every(isAuditFilterOption);
      })
      && AUDIT_STRING_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every((entry) => typeof entry === "string");
      });
  }

  /**
   * The shared bounded pagination envelope: four integers, a flag, a cursor, and a count or null.
   * @param {unknown} value
   * @returns {value is BrowserBoundedPagination}
   */
  function isBoundedPagination(value) {
    return isResponseRecord(value)
      && BOUNDED_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number" && Number.isFinite(value[member]))
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && (value.total === null || (typeof value.total === "number" && Number.isFinite(value.total)));
  }

  /**
   * The audit envelope, read as a whole or not at all.
   *
   * **An audit page must not present partial history.** The raw reads coerced every member of a
   * malformed row to the empty string, which rendered a blank line indistinguishable from a real
   * entry with nothing recorded. Refusing the response instead sends the caller down the load
   * error path it already had, so the administrator learns the history could not be read rather
   * than reading a shorter or emptier one. This is the same choice `0.33.33.38.4.8.1` made for
   * the Support View audit, and the opposite of the target picker's, where dropping an entry
   * removes a candidate rather than hiding a record.
   * @param {unknown} body
   * @returns {BrowserAuditLogEnvelope | null}
   */
  function readAuditLogEnvelope(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { auditLogs: entries, filterOptions, pagination, workspaceId } = body;
    if (!Array.isArray(entries) || !entries.every(isAuditLogEntry)
      || !isAuditFilterOptions(filterOptions)
      || !isBoundedPagination(pagination)
      || typeof workspaceId !== "string") {
      return null;
    }
    return { auditLogs: entries, filterOptions, pagination, workspaceId };
  }

  async function loadAuditLogs() {
    setStatus("Loading audit log...");

    try {
      const result = readAuditLogEnvelope(await requireApi().getJson(
        `${getAuditEndpoint()}?${buildPageParams().toString()}`,
        { cache: "no-store" },
      ));
      if (!result) {
        throw new Error("The audit log response could not be read.");
      }
      auditLogs = result.auditLogs.map(normalizeAuditLog);
      totalAuditLogs = result.pagination.total ?? 0;
      const normalizedPage = normalizeCurrentPage();

      if (normalizedPage !== currentPage) {
        currentPage = normalizedPage;
        await loadAuditLogs();
        return;
      }

      populateFilterOptions(result.filterOptions, result.workspaceId);
      renderAuditLogs();
    } catch (error) {
      setStatus(requireAuditValue(auditViewSelect, "view filter").value === "security"
        ? "Security events are available only to workspace administrators."
        : "Audit log could not be loaded.");
      console.error(error);
    }
  }

  async function initializeAuditLog() {
    await requireTimezones().loadSessionTimezone();
    await requireNamespace().workspaceContextReady;
    if (new URLSearchParams(window.location.search).get("view") === "security") {
      requireAuditValue(auditViewSelect, "view filter").value = "security";
    }
    await loadAuditLogs();
  }

  function getAuditEndpoint() {
    return requireAuditValue(auditViewSelect, "view filter").value === "security"
      ? "/api/security-events"
      : "/api/audit-logs";
  }

  /**
   * The six catalogues, already vouched for.
   *
   * `readAuditLogEnvelope` refuses a body whose `filterOptions` does not satisfy
   * `isAuditFilterOptions`, and this is that reader's only caller, so the members are typed here
   * rather than re-validated. The two defaults this signature used to carry were unreachable -
   * the single call site passes both - and typing the parameters retires them.
   * @param {BrowserAuditFilterOptions} filterOptions
   * @param {string} selectedWorkspaceId
   * @returns {void}
   */
  function populateFilterOptions(filterOptions, selectedWorkspaceId) {
    replaceSelectOptions(requireAuditValue(userFilterSelect, "user filter"), "All users", normalizeOptions(filterOptions.users));
    replaceSelectOptions(requireAuditValue(clientFilterSelect, "client filter"), "All clients", normalizeOptions(filterOptions.clients));
    replaceSelectOptions(requireAuditValue(projectFilterSelect, "project filter"), "All projects", normalizeOptions(filterOptions.projects));
    requireAuditValue(clientFilterControl, "client filter control").hidden
      = requireAuditValue(clientFilterSelect, "client filter").options.length <= 1;
    replaceSelectOptions(requireAuditValue(recordTypeFilterSelect, "record type filter"), "All record types", normalizeEnumOptions(filterOptions.recordTypes));
    replaceSelectOptions(requireAuditValue(changeTypeFilterSelect, "change type filter"), "All change types", normalizeEnumOptions(filterOptions.changeTypes));
    populateWorkspaceOptions(filterOptions.workspaces, selectedWorkspaceId);
  }

  /**
   * @param {HTMLSelectElement} select
   * @param {string} allLabel
   * @param {BrowserAuditFilterOption[]} options
   * @returns {void}
   */
  function replaceSelectOptions(select, allLabel, options) {
    const selectedValue = select.value;
    select.replaceChildren(createOption("", allLabel));
    options.forEach((option) => {
      select.appendChild(createOption(option.value, option.label));
    });

    if ([...select.options].some((option) => option.value === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function renderAuditLogs() {
    const body = requireAuditValue(auditLogBody, "log table body");

    body.replaceChildren();
    updatePagination();

    if (auditLogs.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 7;
      cell.textContent = requireAuditValue(auditViewSelect, "view filter").value === "security"
        ? "No security events match these filters."
        : "No audit log entries match these filters.";
      row.appendChild(cell);
      body.appendChild(row);
      setStatus("");
      return;
    }

    auditLogs.forEach((log) => {
      body.appendChild(createAuditRow(log));
    });

    updateStatus();
  }

  /** @param {NormalizedAuditLog} log @returns {HTMLTableRowElement} */
  function createAuditRow(log) {
    const row = document.createElement("tr");
    const metadata = parseJson(log.metadata_json);
    const context = getAuditContext(log, metadata);
    const userCell = document.createElement("td");
    const userButton = document.createElement("button");
    const detailsButton = document.createElement("button");

    if (log.actor_user_id) {
      userButton.type = "button";
      userButton.className = "link-button";
      userButton.textContent = log.actor_user_name || log.actor_user_id;
      userButton.addEventListener("click", () => {
        requireAuditValue(userFilterSelect, "user filter").value = log.actor_user_id;
        currentPage = 1;
        loadAuditLogs();
      });
      userCell.appendChild(userButton);
    } else {
      userCell.textContent = "None";
    }

    detailsButton.type = "button";
    detailsButton.textContent = "View";
    detailsButton.addEventListener("click", () => openAuditDetailDialog(log));

    row.append(
      createCell(formatDateTime(log.created_at)),
      userCell,
      createCell(createFilterButton(getClientLabel(log, context), getClientId(log, context), clientFilterSelect)),
      createCell(createFilterButton(getProjectLabel(log, context), getProjectId(log, context), projectFilterSelect)),
      createCell(createFilterButton(formatEnum(log.record_type), log.record_type, recordTypeFilterSelect)),
      createCell(formatEnum(log.change_type)),
      createCell(detailsButton),
    );

    return row;
  }

  /**
   * The outgoing query for both audit endpoints.
   *
   * Every key here is read by one receiver. `listSecurityEvents` calls `list` with `securityOnly`,
   * so `/api/audit-logs` and `/api/security-events` share a single `normalizeFilters`, and these
   * eight names are exactly the ones it consumes. The dates are the subtle pair: this page
   * converts them client-side and emits an absolute instant, which the service normalizes as UTC
   * rather than re-applying a zone - its bare `YYYY-MM-DD` path serves other callers, not this one.
   * @returns {URLSearchParams}
   */
  function buildFilterParams() {
    const params = new URLSearchParams();
    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? "UTC" : undefined;
    const dateFrom = requireAuditValue(dateFromInput, "start date input").value;
    const dateTo = requireAuditValue(dateToInput, "end date input").value;
    const actorUserId = requireAuditValue(userFilterSelect, "user filter").value;
    const clientId = requireAuditValue(clientFilterSelect, "client filter").value;
    const projectId = requireAuditValue(projectFilterSelect, "project filter").value;
    const recordType = requireAuditValue(recordTypeFilterSelect, "record type filter").value;
    const changeType = requireAuditValue(changeTypeFilterSelect, "change type filter").value;
    const workspaceId = requireAuditValue(workspaceFilterSelect, "workspace filter").value;

    if (dateFrom) {
      params.set("dateFrom", requireTimezones().zonedDateTimeToUtcIso(dateFrom, "00:00:00", timezone));
    }

    if (dateTo) {
      params.set("dateTo", requireTimezones().zonedDateTimeToUtcIso(dateTo, "23:59:59", timezone));
    }

    if (actorUserId) {
      params.set("actorUserId", actorUserId);
    }

    if (clientId) {
      params.set("clientId", clientId);
    }

    if (projectId) {
      params.set("projectId", projectId);
    }

    if (recordType) {
      params.set("recordType", recordType);
    }

    if (changeType) {
      params.set("changeType", changeType);
    }

    if (workspaceId) {
      params.set("workspaceId", workspaceId);
    }

    return params;
  }

  function buildPageParams() {
    const params = buildFilterParams();
    const pageSize = getPageSize();

    params.set("limit", String(pageSize));
    params.set("offset", String((currentPage - 1) * pageSize));
    return params;
  }

  /** @param {unknown} options @returns {BrowserAuditFilterOption[]} */
  function normalizeOptions(options) {
    return Array.isArray(options)
      ? options
        .filter((option) => option && option.value)
        .map((option) => ({
          label: String(option.label || option.value),
          value: String(option.value),
        }))
      : [];
  }

  /** @param {unknown} values @returns {BrowserAuditFilterOption[]} */
  function normalizeEnumOptions(values) {
    return Array.isArray(values)
      ? values
        .filter(Boolean)
        .map((value) => String(value))
        .map((value) => ({ value, label: formatEnum(value) }))
      : [];
  }

  /**
   * The workspace catalogue is empty unless the caller is a super administrator, which is why the
   * control is hidden rather than emptied. `selectedWorkspaceId` is the scope the service
   * resolved, so it can be a workspace id or the literal `"all"`; it is honoured only when the
   * catalogue still offers it, and the current selection stands otherwise.
   * @param {BrowserAuditFilterOption[]} workspaces
   * @param {string} selectedWorkspaceId
   * @returns {void}
   */
  function populateWorkspaceOptions(workspaces, selectedWorkspaceId) {
    const options = normalizeOptions(workspaces);
    const select = requireAuditValue(workspaceFilterSelect, "workspace filter");

    requireAuditValue(workspaceFilterControl, "workspace filter control").hidden = options.length === 0;

    if (options.length === 0) {
      select.replaceChildren(createOption("", "Current workspace"));
      return;
    }

    replaceSelectOptions(select, "Current workspace", options);
    select.value = options.some((option) => option.value === selectedWorkspaceId)
      ? selectedWorkspaceId
      : select.value;
  }

  function setDefaultWorkspaceFilter() {
    const contextWorkspaceId = window.LongtailForge?.workspaceContext?.workspaceId || "";

    const select = requireAuditValue(workspaceFilterSelect, "workspace filter");

    if (contextWorkspaceId && [...select.options].some((option) => option.value === contextWorkspaceId)) {
      select.value = contextWorkspaceId;
    }
  }

  function updatePagination() {
    const totalPages = getTotalPages();

    requireAuditValue(previousPageButton, "previous page button").disabled = currentPage <= 1;
    requireAuditValue(nextPageButton, "next page button").disabled = currentPage >= totalPages;
    requireAuditValue(pageSummary, "page summary").textContent
      = `Page ${Math.min(currentPage, totalPages)} of ${totalPages}`;
  }

  function updateStatus() {
    if (totalAuditLogs === 0) {
      setStatus("");
      return;
    }

    const pageSize = getPageSize();
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(start + auditLogs.length - 1, totalAuditLogs);

    const entryLabel = requireAuditValue(auditViewSelect, "view filter").value === "security"
      ? "security events"
      : "audit log entries";
    setStatus(`Showing ${start}-${end} of ${totalAuditLogs} ${entryLabel}.`);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(totalAuditLogs / getPageSize()));
  }

  function normalizeCurrentPage() {
    return Math.min(Math.max(1, currentPage), getTotalPages());
  }

  function getPageSize() {
    return Number.parseInt(requireAuditValue(pageSizeSelect, "page size select").value, 10) || 50;
  }

  /** @param {NormalizedAuditLog} log @returns {void} */
  function openAuditDetailDialog(log) {
    const dialog = createDialog("Audit Details", "audit-detail-dialog");
    const content = document.createElement("div");
    const actionRow = document.createElement("div");
    const closeButton = document.createElement("button");
    const jsonButton = document.createElement("button");
    const metadata = parseJson(log.metadata_json);

    content.className = "audit-detail-grid";
    appendDetail(content, "Date", formatDateTime(log.created_at));
    appendDetail(content, "User", log.actor_user_name || "None");
    appendDetail(content, "Action", log.action);
    appendDetail(content, "Change Type", formatEnum(log.change_type));
    appendDetail(content, "Record Type", formatEnum(log.record_type));
    const summary = readSnapshotText(metadata, "summary");

    if (summary) {
      appendDetail(content, "Summary", summary);
    }
    appendDetail(content, "IP Address", log.ip_address);
    appendRecordDetail(content, log);
    appendDetail(content, "Audit ID", log.audit_id);

    jsonButton.type = "button";
    jsonButton.textContent = "View JSON";
    jsonButton.addEventListener("click", () => openJsonDialog(log));

    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => dialog.close());

    actionRow.className = "form-actions";
    actionRow.append(jsonButton, closeButton);
    requireAuditValue(dialog.querySelector("form"), "detail dialog form").append(content, actionRow);
    showDialog(dialog);
  }

  /** @param {HTMLElement} container @param {NormalizedAuditLog} log @returns {void} */
  function appendRecordDetail(container, log) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");

    label.textContent = "Record";

    if (log.record_url) {
      const link = document.createElement("a");
      link.href = log.record_url;
      link.textContent = log.record_label || log.record_id || "Open record";
      value.appendChild(link);
    } else {
      value.textContent = log.record_label || log.record_id || "None";
    }

    wrapper.append(label, value);
    container.appendChild(wrapper);
  }

  /** @param {NormalizedAuditLog} log @returns {void} */
  function openJsonDialog(log) {
    const dialog = createDialog("Audit JSON", "audit-json-dialog");
    const body = document.createElement("div");
    const closeButton = document.createElement("button");
    const actionRow = document.createElement("div");

    body.className = "audit-json-body";
    body.append(
      createJsonDetails("Previous Value", log.previous_value_json),
      createJsonDetails("New Value", log.new_value_json),
      createJsonDetails("Metadata", log.metadata_json),
    );

    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => dialog.close());
    actionRow.className = "form-actions";
    actionRow.appendChild(closeButton);

    requireAuditValue(dialog.querySelector("form"), "JSON dialog form").append(body, actionRow);
    showDialog(dialog);
  }

  /** @param {string} label @param {string} jsonText @returns {HTMLElement} */
  function createJsonDetails(label, jsonText) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    const parsed = parseJson(jsonText);

    details.open = Boolean(jsonText && jsonText.length < 800);
    summary.textContent = label;
    pre.textContent = parsed === null ? "None" : JSON.stringify(parsed, null, 2);
    details.append(summary, pre);
    return details;
  }

  /** @param {string} title @param {string} className @returns {HTMLDialogElement} */
  function createDialog(title, className) {
    const trigger = document.activeElement;
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const headingId = `${className}-title-${Date.now()}`;

    dialog.className = `app-dialog ${className}`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", headingId);
    form.method = "dialog";
    form.className = "app-dialog-form";
    heading.id = headingId;
    heading.textContent = title;

    form.appendChild(heading);
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();

        if (trigger instanceof HTMLElement || trigger instanceof SVGElement) {
          trigger.focus();
        }
      },
      { once: true },
    );
    return dialog;
  }

  /** @param {HTMLDialogElement} dialog @returns {void} */
  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    const focusTarget = dialog.querySelector("button");
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  /** @param {HTMLElement} container @param {string} labelText @param {string} valueText @returns {void} */
  function appendDetail(container, labelText, valueText) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");

    label.textContent = labelText;
    value.textContent = valueText || "None";
    wrapper.append(label, value);
    container.appendChild(wrapper);
  }

  /**
   * @param {BrowserAuditLogEntry} log
   * @returns {NormalizedAuditLog}
   */
  function normalizeAuditLog(log) {
    return {
      action: String(log.action || ""),
      actor_user_id: String(log.actor_user_id || ""),
      actor_user_name: String(log.actor_user_name || ""),
      audit_id: String(log.audit_id || ""),
      change_type: String(log.change_type || ""),
      created_at: String(log.created_at || ""),
      metadata_json: log.metadata_json || "",
      new_value_json: log.new_value_json || "",
      previous_value_json: log.previous_value_json || "",
      record_id: String(log.record_id || ""),
      record_label: String(log.record_label || ""),
      record_type: String(log.record_type || ""),
      record_url: String(log.record_url || ""),
      ip_address: String(log.ip_address || ""),
    };
  }

  /**
   * Read one member off a parsed JSON snapshot.
   *
   * **The snapshot stays `unknown`, deliberately.** `BrowserAuditLogEntry` declares these three
   * members as JSON *strings* and says why: typing them as records would promise a shape no
   * producer agrees on, since every writer passes its own metadata. So this narrows at the read
   * instead of declaring a record the wire never guaranteed - and it tolerates the snapshot being
   * an array, a number, or the raw text `parseJson` hands back when parsing fails.
   *
   * Falsy members answer `""` so the caller's `||` chain falls through exactly as it did when it
   * read the member directly: a `0` or an empty string still yields to the next source rather
   * than being coerced into a truthy `"0"`.
   * @param {unknown} snapshot
   * @param {string} member
   * @returns {string}
   */
  function readSnapshotText(snapshot, member) {
    if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
      return "";
    }

    const value = Object.hasOwn(snapshot, member)
      ? /** @type {Record<string, unknown>} */ (snapshot)[member]
      : undefined;
    return value ? String(value) : "";
  }

  /**
   * @typedef {Record<"client_id" | "client_name" | "project_id" | "project_name", string>} AuditRowContext
   */

  /**
   * The client and project a row belongs to, preferring metadata, then the after-snapshot, then
   * the before-snapshot - the order this page has always read them in.
   * @param {NormalizedAuditLog} log
   * @param {unknown} metadata
   * @returns {AuditRowContext}
   */
  function getAuditContext(log, metadata) {
    const newValue = parseJson(log.new_value_json);
    const previousValue = parseJson(log.previous_value_json);
    /** @param {string} member */
    const read = (member) => readSnapshotText(metadata, member)
      || readSnapshotText(newValue, member)
      || readSnapshotText(previousValue, member)
      || "";

    return {
      client_id: read("client_id"),
      client_name: read("client_name"),
      project_id: read("project_id"),
      project_name: read("project_name"),
    };
  }

  /**
   * @param {NormalizedAuditLog} log
   * @param {AuditRowContext} context
   * @returns {string}
   */
  function getClientLabel(log, context) {
    if (context?.client_name) {
      return context.client_name;
    }

    if (log.record_type === "client") {
      return log.record_label || log.record_id;
    }

    return "None";
  }

  /**
   * @param {NormalizedAuditLog} log
   * @param {AuditRowContext} context
   * @returns {string}
   */
  function getClientId(log, context) {
    if (context?.client_id) {
      return String(context.client_id);
    }

    return log.record_type === "client" ? log.record_id : "";
  }

  /**
   * @param {NormalizedAuditLog} log
   * @param {AuditRowContext} context
   * @returns {string}
   */
  function getProjectLabel(log, context) {
    if (context?.project_name) {
      return context.project_name;
    }

    if (log.record_type === "project") {
      return log.record_label || log.record_id;
    }

    return "None";
  }

  /**
   * @param {NormalizedAuditLog} log
   * @param {AuditRowContext} context
   * @returns {string}
   */
  function getProjectId(log, context) {
    if (context?.project_id) {
      return String(context.project_id);
    }

    return log.record_type === "project" ? log.record_id : "";
  }

  /**
   * A cell that filters the table to the value it shows, when that value is actually offered.
   * @param {string} label
   * @param {string} value
   * @param {HTMLSelectElement | null} select
   * @returns {Node}
   */
  function createFilterButton(label, value, select) {
    const text = label || "None";

    if (!value || text === "None" || !select || ![...select.options].some((option) => option.value === value)) {
      return document.createTextNode(text);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-button audit-truncate";
    button.textContent = text;
    button.title = text;
    button.addEventListener("click", () => {
      select.value = value;
      currentPage = 1;
      loadAuditLogs();
    });
    return button;
  }

  /**
   * Parse a JSON snapshot, answering `unknown` because all three outcomes are real: `null` for
   * an absent snapshot, whatever the writer stringified, or - on a parse failure - the raw text
   * itself, which this page shows rather than discards.
   * @param {string} jsonText
   * @returns {unknown}
   */
  function parseJson(jsonText) {
    if (!jsonText) {
      return null;
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      return jsonText;
    }
  }

  /** @param {Node | string} content @returns {HTMLTableCellElement} */
  function createCell(content) {
    const cell = document.createElement("td");

    if (content && typeof content === "object" && typeof content.nodeType === "number") {
      cell.appendChild(content);
    } else {
      cell.textContent = String(content || "None");
      cell.title = cell.textContent;
      cell.classList.add("audit-truncate");
    }

    return cell;
  }

  /** @param {string} value @param {string} label @returns {HTMLOptionElement} */
  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  /** @param {string} value @returns {string} */
  function formatEnum(value) {
    return String(value || "")
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || "None";
  }

  /** @param {string} value @returns {string} */
  function formatDateTime(value) {
    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? "UTC" : undefined;

    return requireTimezones().formatDateTime(value, timezone) || "None";
  }

  /** @param {string} message @returns {void} */
  function setStatus(message) {
    requireAuditValue(auditStatus, "status line").textContent = message;
  }
})();
