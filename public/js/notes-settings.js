/* global window, document */
/** @typedef {import("../../src/types/notes-collections-contracts.js").NoteCatalogSettingsRow} NoteCatalogSettingsRow */
(function attachNotesSettingsPage() {

  const notesSettingsFields = document.querySelector('[data-settings-attachment="module"][data-settings-module-id="notes"]');
  const notesSettingsAuxiliary = document.querySelector("[data-module-settings-legacy='notes']");
  const notesSettingsStatus = document.querySelector("[data-module-settings-status]");
  const notesSettingsHost = document.querySelector("[data-settings-host='module']");
  const api = window.LongtailForge.api;
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this controller cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it.
   * @returns {BrowserViewFactory}
   */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFieldElement} BrowserViewFieldElement */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFieldControl} BrowserViewFieldControl */

  /**
   * The control a field rendered. `viewParts.control` is null only on the radio path, where a
   * descriptor carrying no options renders a legend and no inputs; every caller here builds a
   * field that has one.
   * @param {BrowserViewFieldElement} field
   * @returns {BrowserViewFieldControl}
   */
  function fieldControl(field) {
    const control = field.viewParts.control;
    if (!control) {
      throw new Error("Notes settings fields require a rendered control.");
    }
    return control;
  }

  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Notes settings require LongtailForge.view.");
    }
    return factory;
  }

  const state = {
    /** @type {NoteCatalogSettingsRow[]} */
    catalogs: [],
    canManageSecurity: false,
    /** @type {number | null} */
    refreshTimer: null,
    selectedCatalogIds: new Set(),
    statusFilter: "all",
  };

  const settingsPageController = window.LongtailForge.settingsPageController.create({
    root: notesSettingsHost,
    onSave: async () => true,
  });

  mountCatalogManager();
  loadNotesSettings();

  async function loadNotesSettings() {
    setPageStatus("Loading Notes settings...");
    try {
      const [settings, settingsCatalog] = await Promise.all([
        api.getJson("/api/settings", { cache: "no-store" }),
        api.getJson("/api/settings/catalog", { cache: "no-store" }),
      ]);
      const notesModule = (settings.modules || []).find((moduleDefinition) => moduleDefinition.id === "notes");
      if (notesModule?.status !== "enabled") {
        window.LongtailForge.settingsRenderer.renderDisabledModuleRecovery(notesSettingsFields, notesModule || {
          id: "notes",
          displayName: "Notes",
        });
        notesSettingsAuxiliary?.replaceChildren();
        setPageStatus("");
        settingsPageController.setClean();
        return;
      }

      window.LongtailForge.settingsRenderer.renderSections(
        notesSettingsFields,
        window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "module", "notes"),
        { emptyText: "No configurable Notes settings are available." },
      );
      await loadCatalogs();
      setPageStatus("");
      settingsPageController.setClean();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("/login.html");
        return;
      }
      setPageStatus(error.message || "Notes settings could not be loaded.", { isError: true });
    }
  }

  async function loadCatalogs() {
    const result = await api.getJson("/api/notes/settings/catalogs", { cache: "no-store" });
    state.catalogs = Array.isArray(result.catalogs) ? result.catalogs : [];
    state.canManageSecurity = result.capabilities?.manageSecurity === true;
    state.selectedCatalogIds = new Set([...state.selectedCatalogIds].filter((catalogId) => (
      state.catalogs.some((catalog) => catalog.catalogId === catalogId)
    )));
    renderCatalogManager();
    scheduleCatalogRefresh();
  }

  function mountCatalogManager() {
    const view = requireView();
    if (!notesSettingsAuxiliary) {
      return;
    }

    const statusField = view.createField({
      field: "catalogStatus",
      type: "select",
      label: "Show catalogs",
      options: [
        { value: "all", label: "Active and archived" },
        { value: "active", label: "Active" },
        { value: "archived", label: "Archived" },
      ],
    }, { value: state.statusFilter });
    fieldControl(statusField).dataset.notesCatalogStatusFilter = "";
    fieldControl(statusField).addEventListener("change", () => {
      state.statusFilter = fieldControl(statusField).value || "all";
      renderCatalogManager();
    });

    const createButton = view.createActionButton({ label: "Create Catalog", role: "primary", type: "button" });
    createButton.dataset.notesCatalogCreate = "";
    createButton.addEventListener("click", () => openCatalogEditor());

    const controls = view.createInlineActionRow({
      className: "notes-catalog-settings-controls",
      children: [statusField, createButton],
    });
    const fieldset = view.createElement("fieldset", {
      className: "view-settings-section notes-catalog-settings",
      dataset: { settingsActionForm: "" },
      children: [
        view.createElement("legend", { className: "view-settings-section-legend", text: "Catalog Management" }),
        view.createElement("p", {
          className: "settings-help",
          text: "Catalogs are the Collections shown in the Notes Library. Security is inherited from secure ancestors, and removing security is a separate reauthenticated action.",
        }),
        controls,
        view.createElement("div", { dataset: { notesCatalogBulk: "" } }),
        view.createElement("div", { dataset: { notesCatalogTable: "" } }),
        view.createElement("p", {
          className: "view-list-shell-status",
          attrs: { role: "status", "aria-live": "polite" },
          dataset: { notesCatalogStatus: "" },
          hidden: true,
        }),
      ],
    });
    notesSettingsAuxiliary.replaceChildren(fieldset);
    renderCatalogManager();
  }

  function renderCatalogManager() {
    const view = requireView();
    const bulkMount = notesSettingsAuxiliary?.querySelector("[data-notes-catalog-bulk]");
    const tableMount = notesSettingsAuxiliary?.querySelector("[data-notes-catalog-table]");
    if (!bulkMount || !tableMount) {
      return;
    }

    const visibleCatalogs = state.catalogs.filter((catalog) => (
      state.statusFilter === "all" || catalog.status === state.statusFilter
    ));
    const selectedCount = state.selectedCatalogIds.size;
    const archiveButton = catalogBulkButton("Archive selected", "archive", selectedCount === 0);
    const restoreButton = catalogBulkButton("Restore selected", "restore", selectedCount === 0);
    const clearButton = view.createActionButton({ label: "Clear selection", role: "secondary", type: "button", disabled: selectedCount === 0 });
    clearButton.addEventListener("click", () => {
      state.selectedCatalogIds.clear();
      renderCatalogManager();
    });
    bulkMount.replaceChildren(view.createBulkActionToolbar({
      label: "Bulk Catalog Actions",
      selectedCount,
      open: selectedCount > 0,
      body: [archiveButton, restoreButton, clearButton],
      bodyClassName: "notes-catalog-bulk-actions",
    }));

    tableMount.replaceChildren(view.createDataTable({
      caption: "Notes catalogs",
      className: "notes-catalog-table-wrap",
      tableClassName: "notes-catalog-table",
      hierarchy: { depthField: "depth", parentField: "parentCatalogId" },
      columns: [
        { key: "selection", label: "Select", render: (catalog) => catalogSelectionControl(catalog) },
        { key: "path", label: "Catalog", header: true },
        { key: "library", label: "Library", render: (catalog) => libraryLabel(catalog.libraryBucket) },
        { key: "status", label: "Status", render: (catalog) => statusChip(catalog.status) },
        { key: "security", label: "Security", render: (catalog) => catalogSecurityStatus(catalog) },
        { key: "updated", label: "Updated", render: (catalog) => formatDateTime(catalog.updatedAt) },
        { key: "actions", label: "Actions", align: "right", render: (catalog) => catalogActions(catalog) },
      ],
      rows: visibleCatalogs,
      emptyMessage: "No Notes catalogs match this status filter.",
    }));
  }

  function catalogSelectionControl(catalog) {
    const control = document.createElement("input");
    control.type = "checkbox";
    control.checked = state.selectedCatalogIds.has(catalog.catalogId);
    control.setAttribute("aria-label", `Select ${catalog.path || catalog.title || "catalog"}`);
    control.addEventListener("change", () => {
      if (control.checked) {
        state.selectedCatalogIds.add(catalog.catalogId);
      } else {
        state.selectedCatalogIds.delete(catalog.catalogId);
      }
      renderCatalogManager();
    });
    return control;
  }

  function catalogActions(catalog) {
    const view = requireView();
    const editButton = view.createActionButton({
      label: "Edit",
      role: "utility",
      type: "button",
      disabled: catalog.status !== "active" || catalog.securityTransitionState !== "stable",
    });
    editButton.title = catalog.status !== "active"
      ? "Restore this catalog before editing it."
      : catalog.securityTransitionState !== "stable"
        ? "Wait for the catalog security transition to finish or retry it."
        : `Edit ${catalog.title}`;
    editButton.addEventListener("click", () => openCatalogEditor(catalog));
    const ordinaryActions = view.createDetailActionStrip({
      ariaLabel: `Catalog editing actions for ${catalog.title}`,
      actions: [editButton],
    });
    const securityAction = catalogSecurityAction(catalog);
    if (!securityAction) {
      return ordinaryActions;
    }
    return view.createElement("div", {
      className: "notes-catalog-action-groups",
      children: [
        ordinaryActions,
        view.createDetailActionStrip({
          ariaLabel: `Catalog security actions for ${catalog.title}`,
          actions: [securityAction],
        }),
      ],
    });
  }

  function catalogSecurityAction(catalog) {
    const view = requireView();
    if (!state.canManageSecurity || catalog.status !== "active" || catalog.securityTransitionState === "securing") {
      return null;
    }

    let label = "Enable Security";
    let action = "enable";
    let role = "secondary";
    if (catalog.securityTransitionState === "failed") {
      label = "Retry Security";
      action = "retry";
      role = "primary";
    } else if (catalog.securityPolicy === "secure") {
      label = "Remove Security";
      action = "remove";
      role = "destructive";
    } else if (catalog.securityInherited || catalog.effectiveSecurityMode === "secure") {
      return null;
    }

    const button = view.createActionButton({ label, role, type: "button" });
    button.addEventListener("click", () => openCatalogSecurityDialog(catalog, action));
    return button;
  }

  function catalogSecurityStatus(catalog) {
    const view = requireView();
    const labels = [];
    if (catalog.securityInherited) {
      labels.push("Secure (inherited)");
    } else if (catalog.securityPolicy === "secure") {
      labels.push("Secure (explicit)");
    } else {
      labels.push("Normal");
    }

    if (catalog.securityTransitionState === "securing") {
      labels.push(catalog.securityTransitionAction === "remove" ? "removing security" : "securing");
    } else if (catalog.securityTransitionState === "failed") {
      labels.push(`recovery needed${catalog.securityTransitionErrorCode ? `: ${safeFailureLabel(catalog.securityTransitionErrorCode)}` : ""}`);
    }

    const element = view.createElement("span", { className: "surface-chip", text: labels.join(" - ") });
    if (catalog.securityInherited) {
      element.title = "A secure ancestor protects this catalog. Child catalogs cannot weaken inherited security.";
    }
    return element;
  }

  async function openCatalogSecurityDialog(catalog, requestedAction) {
    const transitionAction = requestedAction === "retry" ? catalog.securityTransitionAction : requestedAction;
    setCatalogStatus("Loading catalog security preview...");
    try {
      const result = await api.getJson(`/api/notes/collections/${encodeURIComponent(catalog.catalogId)}/security/preflight?action=${encodeURIComponent(transitionAction)}`, { cache: "no-store" });
      showCatalogSecurityConfirmation(catalog, requestedAction, result.preflight || {});
      setCatalogStatus("");
    } catch (error) {
      setCatalogStatus(error.message || "Catalog security preview could not be loaded.", { isError: true });
    }
  }

  function showCatalogSecurityConfirmation(catalog, requestedAction, preflight) {
    const view = requireView();
    const removing = preflight.action === "remove";
    const passwordField = removing
      ? view.createField({ field: "currentPassword", type: "password", label: "Current password", required: true, autocomplete: "current-password" })
      : null;
    const confirmationField = removing
      ? view.createField({ field: "confirmCatalogId", type: "text", label: "Type the catalog ID to confirm", required: true, autocomplete: "off" })
      : null;
    const cancelButton = view.createActionButton({ label: "Cancel", role: "secondary", type: "button" });
    const submitButton = view.createActionButton({
      label: requestedAction === "retry" ? "Retry Security Transition" : removing ? "Remove Security" : "Enable Security",
      role: removing ? "destructive" : "primary",
      type: "submit",
      disabled: preflight.canProceed !== true,
    });
    const summary = view.createElement("div", {
      className: "notes-catalog-security-preview",
      children: [
        view.createElement("p", { text: `${preflight.catalogCount || 1} catalog${preflight.catalogCount === 1 ? "" : "s"}, ${preflight.affectedNoteCount || 0} note${preflight.affectedNoteCount === 1 ? "" : "s"}, and ${preflight.affectedRevisionCount || 0} revision${preflight.affectedRevisionCount === 1 ? "" : "s"} are in scope.` }),
        view.createElement("p", { text: preflight.execution === "job" ? "This transition will continue as a resumable background job." : "This transition will complete in the current request." }),
        removing
          ? view.createElement("p", { className: "settings-help", text: `Removing security is a deliberate downgrade. Type ${catalog.catalogId} and enter your current password. Explicitly secure notes and independently protected subtrees remain secure.` })
          : view.createElement("p", { className: "settings-help", text: "Security becomes effective immediately. Notes remain fail-closed if conversion is interrupted, and Retry Security resumes failed work." }),
        ...(preflight.blockerCodes || []).map((code) => view.createElement("p", { className: "form-error", text: `Recovery blocker: ${safeFailureLabel(code)}` })),
      ],
    });
    const dialog = view.createModalForm({
      title: requestedAction === "retry" ? "Retry Catalog Security" : removing ? "Remove Catalog Security" : "Enable Catalog Security",
      className: "notes-catalog-security-dialog",
      formClassName: "notes-catalog-security-form",
      fields: [summary, passwordField, confirmationField].filter(Boolean),
      actions: [cancelButton, submitButton],
    });

    cancelButton.addEventListener("click", () => closeDialog(dialog));
    dialog.viewParts.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!dialog.viewParts.form.reportValidity()) return;
      if (!confirmationField || !passwordField) {
      throw new Error("Catalog security confirmation requires both fields.");
    }
    if (removing && fieldControl(confirmationField).value.trim() !== catalog.catalogId) {
        setCatalogStatus("The catalog ID confirmation does not match.", { isError: true });
        fieldControl(confirmationField).focus();
        return;
      }

      submitButton.disabled = true;
      const endpointAction = requestedAction === "retry" ? "retry" : preflight.action;
      const payload = {
        confirmAffectedNoteCount: preflight.affectedNoteCount || 0,
        ...(removing ? {
          confirmAction: "remove_security",
          confirmCatalogId: fieldControl(confirmationField).value.trim(),
          currentPassword: fieldControl(passwordField).value,
        } : {}),
      };
      try {
        const response = await api.postJson(`/api/notes/collections/${encodeURIComponent(catalog.catalogId)}/security/${endpointAction}`, payload);
        closeDialog(dialog);
        await loadCatalogs();
        setCatalogStatus(response.execution === "job" ? "Catalog security transition queued. Status will refresh automatically." : "Catalog security transition completed.", { type: "success" });
      } catch (error) {
        submitButton.disabled = false;
        setCatalogStatus(error.message || "Catalog security transition could not be started.", { isError: true });
      }
    });

    notesSettingsHost.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const focusField = passwordField || confirmationField;
    if (focusField) {
      fieldControl(focusField).focus();
    }
  }

  function scheduleCatalogRefresh() {
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
    if (state.catalogs.some((catalog) => catalog.securityTransitionState === "securing")) {
      state.refreshTimer = window.setTimeout(() => loadCatalogs().catch(() => {}), 3000);
    }
  }

  function safeFailureLabel(value) {
    return String(value || "catalog security transition failed").replaceAll("_", " ").slice(0, 120);
  }

  function catalogBulkButton(label, action, disabled) {
    const view = requireView();
    const button = view.createActionButton({ label, role: action === "archive" ? "destructive" : "primary", type: "button", disabled });
    button.addEventListener("click", () => runBulkCatalogAction(action));
    return button;
  }

  async function runBulkCatalogAction(action) {
    const catalogIds = [...state.selectedCatalogIds];
    if (catalogIds.length === 0) {
      return;
    }
    const actionLabel = action === "archive" ? "archive" : "restore";
    if (!window.confirm(`${actionLabel[0].toUpperCase()}${actionLabel.slice(1)} ${catalogIds.length} selected catalog${catalogIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    setCatalogStatus(`${actionLabel[0].toUpperCase()}${actionLabel.slice(1)}ing selected catalogs...`);
    try {
      const result = await api.postJson("/api/notes/settings/catalogs/bulk", { action, catalogIds });
      const failedIds = new Set((result.errors || []).map((error) => error.catalogId));
      state.selectedCatalogIds = failedIds;
      await loadCatalogs();
      if (result.errors?.length) {
        setCatalogStatus(`${result.affectedCount || 0} catalog${result.affectedCount === 1 ? "" : "s"} updated; ${result.errors.length} could not be updated.`, { isError: true });
      } else {
        setCatalogStatus(`${result.affectedCount || 0} catalog${result.affectedCount === 1 ? "" : "s"} ${action === "archive" ? "archived" : "restored"}.`, { type: "success" });
      }
    } catch (error) {
      setCatalogStatus(error.message || "Selected catalogs could not be updated.", { isError: true });
    }
  }

  function openCatalogEditor(catalog = null) {
    const view = requireView();
    const titleField = view.createField({ field: "title", type: "text", label: "Name", required: true }, { value: catalog?.title || "" });
    const descriptionField = view.createField({ field: "description", type: "textarea", label: "Description", rows: 3 }, { value: catalog?.description || "" });
    const libraryField = view.createField({
      field: "libraryBucket",
      type: "select",
      label: "Library",
      options: libraryOptions(),
      required: true,
    }, { value: catalog?.libraryBucket || "reference", disabled: Boolean(catalog) });
    const parentField = view.createField({ field: "parentCatalogId", type: "select", label: "Parent Catalog" });
    const sortOrderField = view.createField({ field: "sortOrder", type: "number", label: "Sort Order", step: 1 }, { value: catalog?.sortOrder || 0 });
    const cancelButton = view.createActionButton({ label: "Cancel", role: "secondary", type: "button" });
    const saveButton = view.createActionButton({ label: catalog ? "Save Catalog" : "Create Catalog", role: "primary", type: "submit" });
    const dialog = view.createModalForm({
      title: catalog ? "Edit Catalog" : "Create Catalog",
      className: "notes-catalog-editor",
      formClassName: "notes-catalog-editor-form",
      fields: [titleField, descriptionField, libraryField, parentField, sortOrderField],
      actions: [cancelButton, saveButton],
    });
    const parentControl = fieldControl(parentField);
    const libraryControl = fieldControl(libraryField);

    const populateParents = () => {
      const excludedIds = catalog ? catalogDescendantIds(catalog.catalogId) : new Set();
      excludedIds.add(catalog?.catalogId);
      const parentOptions = [viewOption("", "Root catalog")];
      state.catalogs
        .filter((candidate) => candidate.status === "active" && candidate.libraryBucket === libraryControl.value && !excludedIds.has(candidate.catalogId))
        .forEach((candidate) => parentOptions.push(viewOption(candidate.catalogId, candidate.path || candidate.title)));
      parentControl.replaceChildren(...parentOptions);
      parentControl.value = parentOptions.some((option) => option.value === catalog?.parentCatalogId) ? catalog.parentCatalogId : "";
    };
    populateParents();
    libraryControl.addEventListener("change", populateParents);
    cancelButton.addEventListener("click", () => closeDialog(dialog));
    dialog.viewParts.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!dialog.viewParts.form.reportValidity()) {
        return;
      }
      saveButton.disabled = true;
      const payload = {
        title: fieldControl(titleField).value,
        description: fieldControl(descriptionField).value,
        libraryBucket: libraryControl.value,
        parentCollectionId: parentControl.value || null,
        sortOrder: Number(fieldControl(sortOrderField).value || 0),
      };
      try {
        if (catalog) {
          await api.putJson(`/api/notes/collections/${encodeURIComponent(catalog.catalogId)}`, payload);
        } else {
          await api.postJson("/api/notes/collections", payload);
        }
        closeDialog(dialog);
        await loadCatalogs();
        setCatalogStatus(catalog ? "Catalog saved." : "Catalog created.", { type: "success" });
      } catch (error) {
        saveButton.disabled = false;
        setCatalogStatus(error.message || "Catalog could not be saved.", { isError: true });
      }
    });

    notesSettingsHost.appendChild(dialog);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    fieldControl(titleField).focus();
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    dialog.remove();
  }

  function catalogDescendantIds(catalogId) {
    const descendants = new Set();
    const queue = [catalogId];
    while (queue.length > 0) {
      const parentId = queue.shift();
      state.catalogs.filter((catalog) => catalog.parentCatalogId === parentId).forEach((catalog) => {
        if (!descendants.has(catalog.catalogId)) {
          descendants.add(catalog.catalogId);
          queue.push(catalog.catalogId);
        }
      });
    }
    return descendants;
  }

  function statusChip(status) {
    const view = requireView();
    return view.createElement("span", { className: "surface-chip", text: status === "archived" ? "Archived" : "Active" });
  }

  function libraryOptions() {
    return [
      { value: "active_work", label: "Active Work" },
      { value: "ongoing_area", label: "Ongoing Areas" },
      { value: "reference", label: "Reference Library" },
    ];
  }

  function libraryLabel(value) {
    return new Map(libraryOptions().map((option) => [option.value, option.label])).get(value) || "Reference Library";
  }

  function viewOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
  }

  function setCatalogStatus(message, options = {}) {
    const element = notesSettingsAuxiliary?.querySelector("[data-notes-catalog-status]");
    window.LongtailForge.status.set(element, message, options.isError ? { type: "error" } : options);
  }

  function setPageStatus(message, options = {}) {
    window.LongtailForge.status.set(notesSettingsStatus, message, options.isError ? { type: "error" } : options);
  }
})();
