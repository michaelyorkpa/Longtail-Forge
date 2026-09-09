(function attachTimeEntryDialog(global) {
  const namespace = global.LongtailForge || {};
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} BrowserPageController */
  const pageController = namespace.pageController;

  /**
   * The page-controller helper this dialog's option builders cannot run without.
   *
   * **Checked at use, not at capture, because the capture never threw.** `pageController` is
   * bound during module evaluation, when the shared script may not have run yet; reading an
   * absent member there produced `undefined` and only the first method call failed. This checks
   * that same captured binding at that same first call, so the moment of failure is unchanged.
   *
   * **The captured binding is deliberately not re-read.** Re-reading `namespace.pageController`
   * per call would give this dialog a live dependency it has never had, and a helper published
   * after module evaluation would silently start working. That is a different lifetime, not a
   * narrowing.
   * @returns {BrowserPageController}
   */
  function requirePageController() {
    if (!pageController) {
      throw new Error("The time entry dialog requires LongtailForge.pageController.");
    }
    return pageController;
  }

  /**
   * One entry as this dialog's own `normalizeTimeEntries` rebuilds it.
   *
   * **An exact reconstruction of thirteen members**, none of them spread: the normaliser names
   * every one and converts as it goes - `startTime` and `endTime` become `Date`, `billable` goes
   * through `normalizeBillable`, `durationSeconds` through `Number`, and `invoiceStatus` falls
   * back to `"unbilled"`. So this is the page's own model, not the wire record, and it is
   * declared here rather than published: `time-entries.js` keeps a separate copy, and deciding
   * whether those two are one model is its own boundary rather than this child's.
   * @typedef {{
   *   billable: string,
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
   */

  /**
   * What `configure` holds between opens.
   *
   * **A structural minimum, because `configure` spreads.** It names five members, then spreads
   * the previous context and the incoming options over them, so a caller may carry more -
   * `prepareContext` passes `params` through this way. The five named here are the ones this
   * module reads; anything else belongs to the host that supplied it.
   * @typedef {{
   *   hostContext: TimeEntryDialogHostContext | null,
   *   mode: string,
   *   onSaved: ((result: unknown) => unknown) | null,
   *   setStatus: ((message: string, options?: unknown) => unknown) | null,
   *   tagOptions: unknown[],
   * }} TimeEntryDialogContext
   */

  /**
   * Only the host members this dialog calls back into.
   * @typedef {{
   *   cancel?: (detail: unknown) => unknown,
   *   complete?: (detail: unknown) => unknown,
   *   setStatus?: (message: string, options?: unknown) => unknown,
   * }} TimeEntryDialogHostContext
   */

  /** @type {TimeEntryDialogContext | null} */
  let context = null;
  /**
   * The dialog element, its form, and its controls - all built once by `ensureDialog`.
   *
   * **Declared complete rather than empty, because `ensureDialog` is the only writer and it
   * refuses an incomplete dialog.** Both entry points call it before anything reads a control:
   * `configure` at setup and `openDialog` on every open. `fields` was previously `{}`, which is
   * why every read of it reported a missing property - the slot described an empty object while
   * the code read eighteen controls off it.
   *
   * A read before `ensureDialog` threw a `TypeError` before this change and still does; only the
   * message moves, from reading a property of `undefined` to reading one of an undefined record.
   * @type {HTMLDialogElement}
   */
  let dialog;
  /** @type {HTMLFormElement} */
  let form;
  /** @type {TimeEntryDialogFields} */
  let fields;
  /**
   * The client catalogue `normalizeClients` rebuilt, reused from its published contract rather
   * than redescribed here - the shared helper already owns that shape.
   * @type {NormalizedClientOption[]}
   */
  let clients = [];
  /**
   * The entry being edited, or `null` when adding.
   *
   * **This is the round trip's hinge.** `prepareContext` finds it, `openDialog` writes it into
   * the controls, and `saveEntry` reads those controls back and chooses the create or the update
   * route by whether this slot is set. Typing it is what makes both halves checkable against the
   * same model.
   * @type {NormalizedTimeEntry | null}
   */
  let selectedEntry = null;
  /**
   * Deliberately untyped, and the last of this file's page-local state.
   *
   * **Owned by a later `0.33.33.44` child, not forgotten.** The picker is mounted from
   * `namespace.tags.mountPicker`, whose handle has no published contract yet, so typing this
   * slot means settling that surface first. Three of this file's four remaining diagnostics
   * are this slot, its read in `saveEntry` and `mountTagPicker`'s parameter; the fourth is the
   * contracted spread in `saveEntry`. Nothing else in this file is undeclared.
   */
  let tagPicker = null;

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimezones} BrowserTimezones */
  /** @typedef {import("../../src/types/browser-contracts.js").NormalizedClientOption} NormalizedClientOption */
  /** @typedef {import("../../src/types/browser-contracts.js").NormalizedProjectOption} NormalizedProjectOption */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("The time entry dialog requires LongtailForge.errors.");
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
      throw new Error("The time entry dialog requires LongtailForge.timezones.");
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
    const apiClient = namespace?.api;
    if (!apiClient) {
      throw new Error("The time entry dialog requires LongtailForge.api.");
    }
    return apiClient;
  }
  /**
   * @param {Partial<TimeEntryDialogContext> & Record<string, unknown>} [options] the five
   *   members this module reads, and anything else the caller carries - `prepareContext`
   *   passes `params` through this way, which is why the model is a structural minimum.
   */
  function configure(options = {}) {
    context = {
      hostContext: null,
      mode: "add",
      onSaved: null,
      setStatus: null,
      tagOptions: [],
      ...context,
      ...options,
    };
    ensureDialog();
    return timeEntryDialogApi;
  }

  /**
   * @param {Record<string, string | undefined>} [params]
   * @param {TimeEntryDialogHostContext | null} [hostContext]
   */
  async function openAdd(params = {}, hostContext = null) {
    await prepareContext({ mode: "add", hostContext, params });
    return openDialog({ mode: "add", params });
  }

  /**
   * @param {Record<string, string | undefined>} [params]
   * @param {TimeEntryDialogHostContext | null} [hostContext]
   */
  async function openEdit(params = {}, hostContext = null) {
    const entryId = params.entryId || params.recordId || params.id || "";

    if (!entryId) {
      throw new Error("Time entry ID is required.");
    }

    await prepareContext({ entryId, mode: "edit", hostContext, params });
    return openDialog({ entry: selectedEntry, mode: "edit", params });
  }

  /**
   * @param {{ entryId?: string, hostContext?: TimeEntryDialogHostContext | null, mode?: string,
   *   params?: Record<string, string | undefined> }} [options]
   */
  async function prepareContext({ entryId = "", hostContext = null, mode = "add", params = {} } = {}) {
    const api = requireApi();
    await namespace.timezones?.loadSessionTimezone?.();
    await namespace.workspaceContextReady;
    const [clientProjectData, entriesData, tagOptions] = await Promise.all([
      api.getJson("/api/client-projects?view=options", { cache: "no-store" }),
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

  /**
   * `params` carries **form defaults**, not arbitrary host data: all seventeen members this
   * module reads - the two client spellings, the two project spellings, the date, the two time
   * spellings, the description, the invoice status and the identity aliases - are read as text
   * through a `|| ""` chain and written straight into a control. Typing them as text states
   * what this dialog requires of its host rather than accepting anything and coercing later.
   * @param {{ entry?: NormalizedTimeEntry | null, mode?: string, params?: Record<string, string | undefined> }} [options]
   */
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
    fields.billableControl.hidden = !workspaceUsesBillableFlag();
    if (!workspaceUsesBillableFlag()) {
      fields.billable.value = "no";
    }
    fields.save.textContent = isEdit ? "Save Changes" : "Save Entry";
    setStatus("");

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

  /**
   * The eighteen controls `dialogMarkup` renders, each at the subtype that markup produces.
   *
   * `<select>` for the three pickers and billable, `<input>` for the date, the two times and the
   * three duration parts, `<textarea>` for the description, `<button>` for cancel and save, and
   * plain `HTMLElement` for the heading, status, tag list, and the two containers this module
   * only shows and hides.
   * @typedef {{
   *   billable: HTMLSelectElement,
   *   billableControl: HTMLElement,
   *   cancel: HTMLButtonElement,
   *   client: HTMLSelectElement,
   *   date: HTMLInputElement,
   *   description: HTMLTextAreaElement,
   *   duration: HTMLElement,
   *   durationHours: HTMLInputElement,
   *   durationMinutes: HTMLInputElement,
   *   durationSeconds: HTMLInputElement,
   *   endTime: HTMLInputElement,
   *   heading: HTMLElement,
   *   invoiceStatus: HTMLSelectElement,
   *   project: HTMLSelectElement,
   *   save: HTMLButtonElement,
   *   startTime: HTMLInputElement,
   *   status: HTMLElement,
   *   tags: HTMLElement,
   * }} TimeEntryDialogFields
   */

  /**
   * One control of the dialog, checked against the subtype its markup renders.
   *
   * **Every control here is required, and the check sits where the dereference already was.**
   * `ensureDialog` renders the markup itself when the page has none, so a control that is still
   * missing or of the wrong subtype is a markup-contract error rather than an absent optional
   * section - and this module already dereferenced each one unguarded immediately afterwards.
   * The narrowing is `instanceof`, which is what the DOM guarantees; the constructor is passed as
   * a value so the check is a real one rather than a type argument.
   * @template T
   * @param {ParentNode} scope
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @param {string} name
   * @returns {T}
   */
  function requireDialogControl(scope, selector, constructor, name) {
    const node = scope.querySelector(selector);

    if (!(node instanceof constructor)) {
      throw new Error(`The time entry dialog requires its ${name}.`);
    }

    return node;
  }

  function ensureDialog() {
    if (!document.querySelector("[data-time-entry-dialog]")) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = dialogMarkup();
      document.body.append(...wrapper.children);
    }

    dialog = requireDialogControl(document, "[data-time-entry-dialog]", HTMLDialogElement, "dialog");
    form = requireDialogControl(dialog, "[data-time-entry-dialog-form]", HTMLFormElement, "form");
    fields = {
      billable: requireDialogControl(dialog, "[data-time-entry-dialog-billable]", HTMLSelectElement, "billable select"),
      billableControl: requireDialogControl(dialog, "[data-time-entry-dialog-billable-control]", HTMLElement, "billable control"),
      cancel: requireDialogControl(dialog, "[data-time-entry-dialog-cancel]", HTMLButtonElement, "cancel button"),
      client: requireDialogControl(dialog, "[data-time-entry-dialog-client]", HTMLSelectElement, "client select"),
      date: requireDialogControl(dialog, "[data-time-entry-dialog-date]", HTMLInputElement, "date input"),
      description: requireDialogControl(dialog, "[data-time-entry-dialog-description]", HTMLTextAreaElement, "description input"),
      duration: requireDialogControl(dialog, "[data-time-entry-dialog-duration]", HTMLElement, "duration fieldset"),
      durationHours: requireDialogControl(dialog, "[data-time-entry-dialog-duration-hours]", HTMLInputElement, "duration hours input"),
      durationMinutes: requireDialogControl(dialog, "[data-time-entry-dialog-duration-minutes]", HTMLInputElement, "duration minutes input"),
      durationSeconds: requireDialogControl(dialog, "[data-time-entry-dialog-duration-seconds]", HTMLInputElement, "duration seconds input"),
      endTime: requireDialogControl(dialog, "[data-time-entry-dialog-end-time]", HTMLInputElement, "end time input"),
      heading: requireDialogControl(dialog, "[data-time-entry-dialog-heading]", HTMLElement, "heading"),
      invoiceStatus: requireDialogControl(dialog, "[data-time-entry-dialog-invoice-status]", HTMLSelectElement, "invoice status select"),
      project: requireDialogControl(dialog, "[data-time-entry-dialog-project]", HTMLSelectElement, "project select"),
      save: requireDialogControl(dialog, "[data-time-entry-dialog-save]", HTMLButtonElement, "save button"),
      startTime: requireDialogControl(dialog, "[data-time-entry-dialog-start-time]", HTMLInputElement, "start time input"),
      status: requireDialogControl(dialog, "[data-time-entry-dialog-status]", HTMLElement, "status line"),
      tags: requireDialogControl(dialog, "[data-time-entry-dialog-tags]", HTMLElement, "tag list"),
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

  /** @param {string} placeholder */
  function populateClientOptions(placeholder) {
    fields.client.replaceChildren(createOption("", placeholder));
    clients.forEach((client) => {
      fields.client.appendChild(createOption(client.id, clientOptionLabel(client)));
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

  /** @param {Event} event */
  async function saveEntry(event) {
    const api = requireApi();
    event.preventDefault();
    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);

    if (!client) {
      // Defensive, and unreachable while the client select carries `required`: the browser
      // refuses the submit before this handler runs. `getClient` can still answer nothing for a
      // selection that is no longer in the catalogue, and the payload below reads
      // `client.isWorkspaceScope` immediately - so this refuses through the same status path the
      // handler already uses for its other invalid inputs rather than throwing past it.
      setStatus("Select a client before saving.");
      return;
    }

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
      billable: workspaceBillableValue(),
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
      const savedEntryId = selectedEntry
        ? readUpdatedTimeEntryId(result, selectedEntry.entryId)
        : readCreatedTimeEntryId(result);

      if (savedEntryId === "") {
        throw new Error("The saved time entry could not be identified.");
      }

      if (typeof context?.onSaved === "function") {
        // Left spreading an unchecked value on purpose. `tests/unit/time-entry-save-contracts`
        // requires this exact form: the decorated entry must travel on whole and nothing may
        // be truncated for the callback. A record check here reads as a truncating rebuild to
        // that contract even though it is behaviour-identical, so the resulting TS2698 stays
        // and belongs to whichever child revisits that contract deliberately.
        await context.onSaved({ ...result, entryId: savedEntryId });
      }
      context?.hostContext?.complete?.({
        actionId: selectedEntry ? "time-entries.edit" : "time-entries.add",
        recordId: savedEntryId,
      });
      dialog.close("complete");
      setStatus("");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Time entry was not saved."), { isError: true });
    } finally {
      fields.save.disabled = false;
    }
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimeEntryCreateResult} BrowserTimeEntryCreateResult */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimeEntryUpdateResult} BrowserTimeEntryUpdateResult */

  /** The one backend both save routes currently write. A different one is a contract change. */
  const SAVED_TIME_ENTRY_STORAGE = "database";

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isSaveResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * The nested entry's identity, or `""` when the response does not carry a usable one.
   * @param {Record<string, unknown>} result
   * @returns {string}
   */
  function nestedSavedEntryId(result) {
    const entry = result.entry;

    if (!isSaveResponseRecord(entry) || typeof entry.entry_id !== "string") {
      return "";
    }

    return entry.entry_id;
  }

  /**
   * The identity `POST /api/time-entries` minted, or `""`.
   *
   * **Read by the branch the dialog already knows.** `saveEntry` chose this route because there
   * was no `selectedEntry`, so it does not need to discover which shape came back by testing
   * whether a property happens to exist - which is what the fallback chain this replaced did.
   *
   * The outer identity and the nested one must **agree**. They are two statements about the same
   * new record, and a response where they differ is not one this producer built.
   * @param {unknown} body
   * @returns {string}
   */
  function readCreatedTimeEntryId(body) {
    if (!isSaveResponseRecord(body) || body.storage !== SAVED_TIME_ENTRY_STORAGE) {
      return "";
    }

    const nested = nestedSavedEntryId(body);

    // No separate empty check: this reader's failure signal *is* the empty string, so a response
    // whose identities are both empty already returns one through the agreement test below.
    if (typeof body.entry_id !== "string" || body.entry_id !== nested) {
      return "";
    }

    return nested;
  }

  /**
   * The identity `PUT /api/time-entries/:entryId` confirms, or `""`.
   *
   * **No outer `entry_id` is required or invented.** The update producer does not send one, and
   * fabricating it here to make the two results look alike would publish a member the server
   * never wrote.
   *
   * What is checked instead is that the entry that came back **is the one this route addressed**:
   * a save that silently returns a different record must not be reported to the host as a
   * successful edit of the record the viewer was editing.
   * @param {unknown} body
   * @param {string} requestedEntryId
   * @returns {string}
   */
  function readUpdatedTimeEntryId(body, requestedEntryId) {
    if (!isSaveResponseRecord(body) || body.storage !== SAVED_TIME_ENTRY_STORAGE) {
      return "";
    }

    const nested = nestedSavedEntryId(body);

    // Same here: an empty requested identity cannot equal a usable nested one, and a pair that is
    // empty on both sides answers "" either way.
    if (nested !== requestedEntryId) {
      return "";
    }

    return nested;
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
      if (fields.tags) {
        fields.tags.hidden = true;
      }
      return;
    }

    fields.tags.hidden = false;
    tagPicker = await namespace.tags.mountPicker(fields.tags, {
      tags: context?.tagOptions || [],
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

  // Every page that loads this controller also loads `js/shared/client-project-options.js`,
  // so this reads a dependency the page guarantees rather than probing for one.
  function requireClientProjectOptions() {
    const clientProjectOptions = namespace?.clientProjectOptions;

    if (!clientProjectOptions) {
      throw new Error("The time entry dialog requires the client and project option helper.");
    }

    return clientProjectOptions;
  }

  /**
   * @param {unknown} data
   * @param {{ includeInactive?: boolean }} [options]
   * @returns {NormalizedClientOption[]}
   */
  function normalizeClients(data, options = {}) {
    return requireClientProjectOptions().normalizeClients(data, options);
  }

  /**
   * @param {unknown} data the `/api/time-entries` body, unchecked as it arrives
   * @returns {NormalizedTimeEntry[]}
   */
  function normalizeTimeEntries(data) {
    // Narrowed here rather than at the caller: `api.getJson` answers `unknown`, and this is
    // the function that already decides what a usable body is. `isSaveResponseRecord` is not
    // reused because all three of its uses are genuinely save responses.
    const envelope = typeof data === "object" && data !== null ? data : {};
    const entries = "entries" in envelope ? envelope.entries : undefined;

    return Array.isArray(entries)
      ? entries.map((entry) => ({
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

  /** @param {NormalizedClientOption} client */
  function clientOptionLabel(client) {
    return requireClientProjectOptions().optionLabel(client);
  }

  /** @param {NormalizedTimeEntry} entry @returns {string} */
  function findClientIdForEntry(entry) {
    return clients.find((client) => matchesClient(entry, client))?.id || "";
  }

  /** @param {NormalizedTimeEntry} entry @returns {string} */
  function findProjectIdForEntry(entry) {
    const client = getClient(fields.client.value);
    return client?.projects.find((project) => matchesProject(entry, project))?.id || "";
  }

  /** @param {string} clientId @returns {NormalizedClientOption | undefined} */
  function getClient(clientId) {
    return clients.find((client) => client.id === clientId);
  }

  /**
   * @param {string} clientId
   * @param {string} projectId
   * @returns {NormalizedProjectOption | undefined}
   */
  function getProject(clientId, projectId) {
    if (clientId) {
      return getClient(clientId)?.projects.find((project) => project.id === projectId);
    }

    return clients.flatMap((client) => client.projects || []).find((project) => project.id === projectId);
  }

  function updateBillableDefault() {
    if (!workspaceUsesBillableFlag()) {
      fields.billable.value = "no";
      return;
    }

    if (selectedEntry?.billable) {
      return;
    }

    const client = getClient(fields.client.value);
    const project = getProject(fields.client.value, fields.project.value);
    fields.billable.value = normalizeBillable(project?.billable) || normalizeBillable(client?.billable) || "yes";
  }

  /** @param {NormalizedTimeEntry} entry */
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

  /** @param {unknown} value @returns {"yes" | "no" | ""} */
  function normalizeBillable(value) {
    if (value === "yes" || value === true) {
      return "yes";
    }

    if (value === "no" || value === false) {
      return "no";
    }

    return "";
  }

  /** @param {NormalizedTimeEntry} entry @param {NormalizedClientOption} [client] */
  function matchesClient(entry, client) {
    if (namespace.records?.matchesClient) {
      return namespace.records.matchesClient(entry, client);
    }

    if (!client) {
      return false;
    }

    return (entry.clientId || "") === (client.isWorkspaceScope ? "" : client.id);
  }

  /** @param {NormalizedTimeEntry} entry @param {NormalizedProjectOption} [project] */
  function matchesProject(entry, project) {
    if (namespace.records?.matchesProject) {
      return namespace.records.matchesProject(entry, project);
    }

    if (!project) {
      return false;
    }

    return entry.projectId === project.id;
  }

  /**
   * @param {string} dateValue
   * @param {string} timeValue
   * @returns {Date | null}
   */
  function createZonedDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) {
      return null;
    }

    const date = new Date(requireTimezones().zonedDateTimeToUtcIso(dateValue, timeValue));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  /** @param {Date} date */
  function formatDateInput(date) {
    return requireTimezones().formatDateInput(date);
  }

  /** @param {Date} date */
  function formatTimeInput(date) {
    return requireTimezones().formatTimeInput(date);
  }

  /** @param {number} totalSeconds */
  function setDurationInputs(totalSeconds) {
    const normalizedSeconds = Math.max(0, Number.parseInt(String(totalSeconds), 10) || 0);
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

  /** @param {string} value the raw text of one duration input @returns {number} */
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

  /** @param {NormalizedTimeEntry | null} entry @returns {string} */
  function entryHeading(entry) {
    return [entry?.projectName || "", entry?.endTime ? requireTimezones().formatDate(entry.endTime) : ""]
      .filter(Boolean)
      .join(" - ") || "Selected Entry";
  }

  /** @param {string} value @param {string} text */
  function createOption(value, text) {
    return requirePageController().createOption(value, text);
  }

  /** @param {NormalizedProjectOption[]} items */
  function sortByName(items) {
    return requirePageController().sortByName(items);
  }

  function workspaceShowsClientTools() {
    const tools = namespace.workspaceContext?.workspaceCapabilities?.availableTools || [];
    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  function workspaceUsesBillableFlag() {
    return namespace.workspaceContext?.workspaceType === "business";
  }

  function workspaceBillableValue() {
    return workspaceUsesBillableFlag() && fields.billable.value === "yes" ? "yes" : "no";
  }

  /**
   * @param {string} message
   * @param {{ isError?: boolean }} [options]
   */
  function setStatus(message, options = {}) {
    if (fields.status) {
      fields.status.textContent = message || "";
      fields.status.classList.toggle("error-text", Boolean(options.isError));
    }

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
          <label data-time-entry-dialog-billable-control>Billable<select data-time-entry-dialog-billable><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Invoice Status<select data-time-entry-dialog-invoice-status><option value="unbilled">Unbilled</option><option value="billed">Billed</option><option value="paid">Paid</option></select></label>
          <div data-time-entry-dialog-tags></div>
          <p data-time-entry-dialog-status role="status" aria-live="polite"></p>
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
