(function attachTimeEntryDialog(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const pageController = namespace.pageController;

  let context = null;
  let dialog = null;
  let form = null;
  let fields = {};
  let clients = [];
  let selectedEntry = null;
  let tagPicker = null;

  function configure(options = {}) {
    context = {
      hostContext: null,
      mode: "add",
      onSaved: null,
      setStatus: null,
      ...context,
      ...options,
    };
    ensureDialog();
    return timeEntryDialogApi;
  }

  async function openAdd(params = {}, hostContext = null) {
    await prepareContext({ mode: "add", hostContext, params });
    return openDialog({ mode: "add", params });
  }

  async function openEdit(params = {}, hostContext = null) {
    const entryId = params.entryId || params.recordId || params.id || "";

    if (!entryId) {
      throw new Error("Time entry ID is required.");
    }

    await prepareContext({ entryId, mode: "edit", hostContext, params });
    return openDialog({ entry: selectedEntry, mode: "edit", params });
  }

  async function prepareContext({ entryId = "", hostContext = null, mode = "add", params = {} } = {}) {
    await namespace.timezones?.loadSessionTimezone?.();
    await namespace.workspaceContextReady;
    const [clientProjectData, entriesData, tagOptions] = await Promise.all([
      api.getJson("/api/client-projects", { cache: "no-store" }),
      entryId ? api.getJson("/api/time-entries", { cache: "no-store" }) : Promise.resolve({ entries: [] }),
      loadTagOptions(),
    ]);

    clients = normalizeClients(clientProjectData, { includeInactive: mode === "edit" });
    selectedEntry = entryId
      ? normalizeTimeEntries(entriesData).find((entry) => entry.entryId === entryId) || null
      : null;

    if (entryId && !selectedEntry) {
      throw new Error("Time entry could not be found.");
    }

    configure({
      hostContext,
      mode,
      params,
      tagOptions,
      setStatus: (message, options = {}) => hostContext?.setStatus?.(message, options),
    });
  }

  function openDialog({ entry = null, mode = "add", params = {} } = {}) {
    ensureDialog();
    const isEdit = mode === "edit";

    selectedEntry = entry;
    fields.heading.textContent = isEdit ? `Edit Entry - ${entryHeading(entry)}` : "Add Time Entry";
    populateClientOptions(isEdit ? "Select a client" : "Select a client");

    if (entry) {
      fields.client.value = findClientIdForEntry(entry);
      populateProjectOptions(findProjectIdForEntry(entry));
      fields.date.value = formatDateInput(entry.startTime);
      fields.startTime.value = formatTimeInput(entry.startTime);
      fields.endTime.value = formatTimeInput(entry.endTime);
      setDurationInputs(entry.durationSeconds);
      fields.description.value = entry.description || "";
      fields.billable.value = getEffectiveEntryBillable(entry);
      fields.invoiceStatus.value = entry.invoiceStatus || "unbilled";
      mountTagPicker(entry.tags || []);
    } else {
      fields.client.value = params.clientId || params.client_id || "";
      populateProjectOptions(params.projectId || params.project_id || "");
      selectWorkspaceScopeClientIfNeeded();
      fields.date.value = params.date || params.entryDate || params.startDate || formatDateInput(new Date());
      fields.startTime.value = params.startTime || params.start_time || "";
      fields.endTime.value = params.endTime || params.end_time || "";
      setDurationInputs(0);
      fields.description.value = params.description || "";
      updateBillableDefault();
      fields.invoiceStatus.value = params.invoiceStatus || params.invoice_status || "unbilled";
      mountTagPicker([]);
    }

    fields.duration.hidden = !isEdit;
    fields.save.textContent = isEdit ? "Save Changes" : "Save Entry";

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    fields.client.focus();

    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        resolve(dialog.returnValue || "closed");
      }, { once: true });
    });
  }

  function ensureDialog() {
    dialog = document.querySelector("[data-time-entry-dialog]");

    if (!dialog) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = dialogMarkup();
      document.body.append(...wrapper.children);
      dialog = document.querySelector("[data-time-entry-dialog]");
    }

    form = dialog.querySelector("[data-time-entry-dialog-form]");
    fields = {
      billable: dialog.querySelector("[data-time-entry-dialog-billable]"),
      cancel: dialog.querySelector("[data-time-entry-dialog-cancel]"),
      client: dialog.querySelector("[data-time-entry-dialog-client]"),
      date: dialog.querySelector("[data-time-entry-dialog-date]"),
      description: dialog.querySelector("[data-time-entry-dialog-description]"),
      duration: dialog.querySelector("[data-time-entry-dialog-duration]"),
      durationHours: dialog.querySelector("[data-time-entry-dialog-duration-hours]"),
      durationMinutes: dialog.querySelector("[data-time-entry-dialog-duration-minutes]"),
      durationSeconds: dialog.querySelector("[data-time-entry-dialog-duration-seconds]"),
      endTime: dialog.querySelector("[data-time-entry-dialog-end-time]"),
      heading: dialog.querySelector("[data-time-entry-dialog-heading]"),
      invoiceStatus: dialog.querySelector("[data-time-entry-dialog-invoice-status]"),
      project: dialog.querySelector("[data-time-entry-dialog-project]"),
      save: dialog.querySelector("[data-time-entry-dialog-save]"),
      startTime: dialog.querySelector("[data-time-entry-dialog-start-time]"),
      tags: dialog.querySelector("[data-time-entry-dialog-tags]"),
    };

    if (form.dataset.timeEntryDialogBound === "true") {
      return;
    }

    form.dataset.timeEntryDialogBound = "true";
    form.addEventListener("submit", saveEntry);
    fields.cancel.addEventListener("click", () => {
      context?.hostContext?.cancel?.({ actionId: selectedEntry ? "time-entries.edit" : "time-entries.add" });
      dialog.close("cancel");
    });
    fields.client.addEventListener("change", () => {
      populateProjectOptions();
      updateBillableDefault();
    });
    fields.project.addEventListener("change", updateBillableDefault);
    fields.date.addEventListener("change", updateEndTimeFromDuration);
    fields.startTime.addEventListener("change", updateEndTimeFromDuration);
    fields.endTime.addEventListener("change", updateDurationFromTimeRange);
    fields.durationHours.addEventListener("input", updateEndTimeFromDuration);
    fields.durationMinutes.addEventListener("input", updateEndTimeFromDuration);
    fields.durationSeconds.addEventListener("input", updateEndTimeFromDuration);
  }

  function populateClientOptions(placeholder) {
    fields.client.replaceChildren(createOption("", placeholder));
    sortByName(clients).forEach((client) => {
      fields.client.appendChild(createOption(client.id, client.name));
    });
  }

  function populateProjectOptions(projectId = "") {
    const client = getClient(fields.client.value);
    fields.project.replaceChildren(createOption("", "Select a project"));
    fields.project.disabled = !client;

    if (!client) {
      return;
    }

    sortByName(client.projects).forEach((project) => {
      fields.project.appendChild(createOption(project.id, project.name));
    });
    fields.project.value = projectId;
  }

  function selectWorkspaceScopeClientIfNeeded() {
    if (workspaceShowsClientTools()) {
      return;
    }

    const workspaceClient = clients.find((client) => client.isWorkspaceScope);
    if (workspaceClient) {
      fields.client.value = workspaceClient.id;
      populateProjectOptions();
    }
  }

  async function saveEntry(event) {
    event.preventDefault();
    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);
    const startTime = createZonedDateTime(fields.date.value, fields.startTime.value);
    const durationSeconds = selectedEntry
      ? getDurationInputSeconds()
      : readRangeDurationSeconds();

    if (!project) {
      setStatus("Select a project.");
      return;
    }

    if (!startTime || durationSeconds <= 0) {
      setStatus(selectedEntry ? "Enter a valid start time and duration." : "Enter a valid date, start time, and end time.");
      return;
    }

    const endTime = selectedEntry
      ? new Date(startTime.getTime() + (durationSeconds * 1000))
      : createZonedDateTime(fields.date.value, fields.endTime.value);

    if (!endTime || endTime <= startTime) {
      setStatus("End time must be after start time.");
      return;
    }

    const payload = {
      billable: fields.billable.value,
      client_id: client.isWorkspaceScope ? "" : client.id,
      client_name: client.isWorkspaceScope ? "" : client.name,
      description: fields.description.value.trim(),
      duration_hours: (durationSeconds / 3600).toFixed(4),
      duration_seconds: durationSeconds,
      end_time: endTime.toISOString(),
      invoice_status: fields.invoiceStatus.value,
      project_id: project.id,
      project_name: project.name,
      start_time: startTime.toISOString(),
      tagIds: tagPicker?.readTagIds?.() || [],
    };

    fields.save.disabled = true;
    setStatus(selectedEntry ? "Saving entry..." : "Saving time entry...");

    try {
      const result = selectedEntry
        ? await api.putJson(`/api/time-entries/${encodeURIComponent(selectedEntry.entryId)}`, payload)
        : await api.postJson("/api/time-entries", payload);
      const savedEntryId = selectedEntry?.entryId || result.entry_id || result.entry?.entry_id || "";

      if (typeof context?.onSaved === "function") {
        await context.onSaved({ ...result, entryId: savedEntryId });
      }
      context?.hostContext?.complete?.({
        actionId: selectedEntry ? "time-entries.edit" : "time-entries.add",
        recordId: savedEntryId,
      });
      dialog.close("complete");
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Time entry was not saved.", { isError: true });
    } finally {
      fields.save.disabled = false;
    }
  }

  function readRangeDurationSeconds() {
    const startTime = createZonedDateTime(fields.date.value, fields.startTime.value);
    const endTime = createZonedDateTime(fields.date.value, fields.endTime.value);

    if (!startTime || !endTime || endTime <= startTime) {
      return 0;
    }

    return Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  }

  async function mountTagPicker(tags) {
    tagPicker = null;
    if (!fields.tags || !namespace.tags?.mountPicker) {
      fields.tags?.replaceChildren();
      return;
    }

    tagPicker = await namespace.tags.mountPicker(fields.tags, {
      selectedTags: tags,
    });
  }

  async function loadTagOptions() {
    if (!namespace.tags?.loadTags) {
      return [];
    }

    try {
      return await namespace.tags.loadTags();
    } catch {
      return [];
    }
  }

  function normalizeClients(data, options = {}) {
    const includeInactive = options.includeInactive === true;
    const sourceClients = Array.isArray(data?.clients) ? data.clients : [];
    const normalizedClients = sourceClients
      .filter((client) => includeInactive || !isInactiveRecord(client))
      .map((client) => ({
        id: String(client.id || "").trim(),
        name: String(client.name || "").trim(),
        billable: normalizeBillable(client.billable) || "yes",
        projects: Array.isArray(client.projects)
          ? client.projects
              .filter((project) => includeInactive || !isInactiveRecord(project))
              .map((project) => ({
                id: String(project.id || "").trim(),
                name: String(project.name || "").trim(),
                billable: normalizeBillable(project.billable) || normalizeBillable(client.billable) || "yes",
              }))
          : [],
      }));
    const workspaceProjects = Array.isArray(data?.workspaceProjects)
      ? data.workspaceProjects.filter((project) => includeInactive || !isInactiveRecord(project))
      : [];

    if (workspaceProjects.length > 0) {
      normalizedClients.unshift({
        id: "__workspace_projects__",
        name: namespace.getWorkspaceProjectsLabel?.() || "Projects",
        billable: "yes",
        isWorkspaceScope: true,
        projects: workspaceProjects.map((project) => ({
          id: String(project.id || "").trim(),
          name: String(project.name || "").trim(),
          billable: normalizeBillable(project.billable) || "yes",
        })),
      });
    }

    return normalizedClients;
  }

  function normalizeTimeEntries(data) {
    return Array.isArray(data?.entries)
      ? data.entries.map((entry) => ({
          billable: normalizeBillable(entry.billable),
          clientId: entry.client_id,
          clientName: entry.client_name,
          description: entry.description,
          durationSeconds: Number(entry.duration_seconds) || 0,
          endTime: new Date(entry.end_time),
          entryId: entry.entry_id,
          invoiceStatus: entry.invoice_status || "unbilled",
          projectId: entry.project_id,
          projectName: entry.project_name,
          startTime: new Date(entry.start_time),
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          userId: entry.user_id,
        }))
      : [];
  }

  function isInactiveRecord(record) {
    return String(record?.status || "").trim().toLowerCase() === "inactive";
  }

  function findClientIdForEntry(entry) {
    return clients.find((client) => matchesClient(entry, client))?.id || "";
  }

  function findProjectIdForEntry(entry) {
    const client = getClient(fields.client.value);
    return client?.projects.find((project) => matchesProject(entry, project))?.id || "";
  }

  function getClient(clientId) {
    return clients.find((client) => client.id === clientId);
  }

  function getProject(clientId, projectId) {
    if (clientId) {
      return getClient(clientId)?.projects.find((project) => project.id === projectId);
    }

    return clients.flatMap((client) => client.projects || []).find((project) => project.id === projectId);
  }

  function updateBillableDefault() {
    if (selectedEntry?.billable) {
      return;
    }

    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);
    fields.billable.value = normalizeBillable(project?.billable) || normalizeBillable(client?.billable) || "yes";
  }

  function getEffectiveEntryBillable(entry) {
    const client = clients.find((currentClient) => matchesClient(entry, currentClient));
    const project = client?.projects.find((currentProject) => matchesProject(entry, currentProject));
    const billableValues = [
      normalizeBillable(entry.billable),
      normalizeBillable(project?.billable),
      normalizeBillable(client?.billable),
    ];

    return billableValues.includes("no")
      ? "no"
      : billableValues.find((value) => value === "yes") || "yes";
  }

  function normalizeBillable(value) {
    if (value === "yes" || value === true) {
      return "yes";
    }

    if (value === "no" || value === false) {
      return "no";
    }

    return "";
  }

  function matchesClient(entry, client) {
    if (namespace.records?.matchesClient) {
      return namespace.records.matchesClient(entry, client);
    }

    return Boolean(client) && (entry.clientId || "") === (client.isWorkspaceScope ? "" : client.id);
  }

  function matchesProject(entry, project) {
    if (namespace.records?.matchesProject) {
      return namespace.records.matchesProject(entry, project);
    }

    return Boolean(project) && entry.projectId === project.id;
  }

  function createZonedDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) {
      return null;
    }

    const date = new Date(namespace.timezones.zonedDateTimeToUtcIso(dateValue, timeValue));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDateInput(date) {
    return namespace.timezones.formatDateInput(date);
  }

  function formatTimeInput(date) {
    return namespace.timezones.formatTimeInput(date);
  }

  function setDurationInputs(totalSeconds) {
    const normalizedSeconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
    fields.durationHours.value = String(Math.floor(normalizedSeconds / 3600));
    fields.durationMinutes.value = String(Math.floor((normalizedSeconds % 3600) / 60));
    fields.durationSeconds.value = String(normalizedSeconds % 60);
  }

  function getDurationInputSeconds() {
    const hours = Math.max(0, Number.parseInt(fields.durationHours.value, 10) || 0);
    const minutes = clampDurationPart(fields.durationMinutes.value);
    const seconds = clampDurationPart(fields.durationSeconds.value);

    fields.durationMinutes.value = String(minutes);
    fields.durationSeconds.value = String(seconds);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  function clampDurationPart(value) {
    return Math.min(59, Math.max(0, Number.parseInt(value, 10) || 0));
  }

  function updateDurationFromTimeRange() {
    const startTime = createZonedDateTime(fields.date.value, fields.startTime.value);
    const endTime = createZonedDateTime(fields.date.value, fields.endTime.value);

    if (!startTime || !endTime || endTime <= startTime) {
      return;
    }

    setDurationInputs(Math.round((endTime.getTime() - startTime.getTime()) / 1000));
  }

  function updateEndTimeFromDuration() {
    const startTime = createZonedDateTime(fields.date.value, fields.startTime.value);
    const durationSeconds = getDurationInputSeconds();

    if (!startTime || durationSeconds <= 0) {
      return;
    }

    fields.endTime.value = formatTimeInput(new Date(startTime.getTime() + (durationSeconds * 1000)));
  }

  function entryHeading(entry) {
    return [entry?.projectName || "", entry?.endTime ? namespace.timezones.formatDate(entry.endTime) : ""]
      .filter(Boolean)
      .join(" - ") || "Selected Entry";
  }

  function createOption(value, text) {
    return pageController.createOption(value, text);
  }

  function sortByName(items) {
    return pageController.sortByName(items);
  }

  function workspaceShowsClientTools() {
    const tools = namespace.workspaceContext?.workspaceCapabilities?.availableTools || [];
    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  function setStatus(message, options = {}) {
    if (typeof context?.setStatus === "function") {
      context.setStatus(message, options);
      return;
    }

    context?.hostContext?.setStatus?.(message, options);
  }

  function dialogMarkup() {
    return `
      <dialog class="time-entry-dialog" data-time-entry-dialog>
        <form method="dialog" class="entry-form" data-time-entry-dialog-form>
          <h2 data-time-entry-dialog-heading>Time Entry</h2>
          <label data-client-workspace-control>Client<select data-time-entry-dialog-client required></select></label>
          <label>Project<select data-time-entry-dialog-project required disabled></select></label>
          <label>Date<input type="date" data-time-entry-dialog-date required></label>
          <label>Start Time<input type="time" step="1" data-time-entry-dialog-start-time required></label>
          <label>End Time<input type="time" step="1" data-time-entry-dialog-end-time required></label>
          <fieldset class="duration-editor" data-time-entry-dialog-duration>
            <legend>Duration</legend>
            <label>Hours<input type="number" min="0" step="1" inputmode="numeric" data-time-entry-dialog-duration-hours required></label>
            <label>Minutes<input type="number" min="0" max="59" step="1" inputmode="numeric" data-time-entry-dialog-duration-minutes required></label>
            <label>Seconds<input type="number" min="0" max="59" step="1" inputmode="numeric" data-time-entry-dialog-duration-seconds required></label>
          </fieldset>
          <label class="entry-description">Description<textarea rows="4" data-time-entry-dialog-description></textarea></label>
          <label>Billable<select data-time-entry-dialog-billable><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Invoice Status<select data-time-entry-dialog-invoice-status><option value="unbilled">Unbilled</option><option value="billed">Billed</option><option value="paid">Paid</option></select></label>
          <div data-time-entry-dialog-tags></div>
          <div class="form-actions entry-actions"><button type="button" data-time-entry-dialog-cancel>Cancel</button><button type="submit" data-time-entry-dialog-save>Save Entry</button></div>
        </form>
      </dialog>
    `;
  }

  const timeEntryDialogApi = {
    configure,
    openAdd,
    openEdit,
  };

  namespace.timeEntryDialog = timeEntryDialogApi;

  namespace.moduleActions?.register?.({
    actionId: "time-entries.add",
    id: "time-entries.add",
    label: "Add Time Entry",
    mode: "add",
    moduleId: "time-tracking",
    open: openAdd,
    recordType: "time_entry",
    requiredModules: ["time-tracking"],
    requiredPermissions: ["time_entries.create"],
    requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
    title: "Add Time Entry",
  });
  namespace.moduleActions?.register?.({
    actionId: "time-entries.edit",
    id: "time-entries.edit",
    label: "Edit Time Entry",
    mode: "edit",
    moduleId: "time-tracking",
    open: openEdit,
    recordType: "time_entry",
    requiredModules: ["time-tracking"],
    requiredPermissions: ["time_entries.edit_own", "time_entries.edit_all"],
    requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
    title: "Edit Time Entry",
  });

  global.LongtailForge = namespace;
}(window));
