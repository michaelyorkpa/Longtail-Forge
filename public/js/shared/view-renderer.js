(function attachViewRenderer(global) {
  const root = global.LongtailForge || {};
  const behaviors = new Map();

  function registerBehavior(id, handler) {
    const behaviorId = String(id || "").trim();
    if (!behaviorId) {
      throw new Error("View behaviors require an id.");
    }
    if (typeof handler !== "function") {
      throw new Error("View behaviors require a handler function.");
    }
    behaviors.set(behaviorId, handler);
    return () => behaviors.delete(behaviorId);
  }

  function renderSurface(descriptor = {}, host) {
    const view = requireViewPrimitives();
    if (!host || typeof host.appendChild !== "function") {
      throw new Error("View surface rendering requires a host element.");
    }

    clearHost(host);

    const state = {
      descriptor,
      actionError: null,
      error: null,
      loading: Boolean(descriptor.dataSource?.route),
      records: [],
      selectedRecord: null,
      surface: null,
      view,
    };
    let inFlightRefresh = null;
    const surface = view.createElement("section", {
      className: ["view-renderer-surface", `view-renderer-layout-${descriptor.layout || "single-column"}`],
      attrs: {
        "data-view-surface-id": descriptor.id || "",
        "data-view-layout": descriptor.layout || "single-column",
      },
    });
    state.surface = surface;

    const body = view.createElement("div", { className: "view-renderer-body" });
    const refresh = async () => {
      if (!descriptor.dataSource?.route) {
        return state.records;
      }
      if (inFlightRefresh) {
        return inFlightRefresh;
      }

      inFlightRefresh = (async () => {
        state.loading = true;
        state.actionError = null;
        state.error = null;
        renderInto(body, renderLayout(descriptor, view, state));
        try {
          state.records = await loadBoundRecords(descriptor);
          state.selectedRecord = state.records[0] || null;
        } catch (error) {
          state.records = [];
          state.selectedRecord = null;
          state.error = error;
        } finally {
          state.loading = false;
          renderInto(body, renderLayout(descriptor, view, state));
          inFlightRefresh = null;
        }

        return state.records;
      })();

      return inFlightRefresh;
    };

    for (const child of renderLayout(descriptor, view, state)) {
      body.appendChild(child);
    }

    surface.appendChild(body);
    Object.defineProperty(surface, "refresh", {
      configurable: true,
      enumerable: false,
      value: refresh,
    });
    Object.defineProperty(surface, "openModal", {
      configurable: true,
      enumerable: false,
      value: (modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
    });
    Object.defineProperty(surface, "viewState", {
      configurable: true,
      enumerable: false,
      value: state,
    });

    host.appendChild(surface);
    if (descriptor.dataSource?.route) {
      refresh();
    }

    return surface;
  }

  function renderInto(parent, children) {
    clearHost(parent);
    for (const child of children) {
      parent.appendChild(child);
    }
  }

  function renderLayout(descriptor, view, state) {
    const children = [
      renderPageHeader(descriptor.pageHeader, view, state),
      renderActions(descriptor.actions, view, "Surface actions", state),
      renderFilters(descriptor.filters, view),
      renderDataStatus(state, view),
    ].filter(Boolean);

    if (descriptor.layout === "split-list-detail") {
      children.push(view.createSplitListDetail({
        listLabel: descriptor.indexPanel?.title || descriptor.indexPanel?.label || "Index",
        detailLabel: descriptor.detail?.header?.title || "Detail",
        list: [renderIndexPanel(descriptor.indexPanel, view, state) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view)],
        detail: renderDetailShell(descriptor.detail, view, state),
      }));
    } else if (descriptor.layout === "table-page") {
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    } else {
      children.push(renderIndexPanel(descriptor.indexPanel, view, state));
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    }

    children.push(...renderModalShells(descriptor.modals, view));
    return children.filter(Boolean);
  }

  function renderPageHeader(pageHeader, view, state) {
    if (!pageHeader) {
      return null;
    }

    return view.createPageHeader({
      title: pageHeader.title || pageHeader.label || "Untitled view",
      subtitle: pageHeader.description,
      actions: pageHeader.primaryAction ? [normalizeAction(pageHeader.primaryAction, state)] : [],
    });
  }

  function renderFilters(filters, view) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return null;
    }

    const panel = view.createFilterPanel({
      title: "Filters",
      fields: filters.map((filter) => renderFieldShell(filter, view, { disabled: true })),
    });
    const fieldGrid = panel.querySelector(".view-filter-panel-fields");
    const form = view.createElement("form", {
      className: fieldGrid?.className || "view-filter-panel-fields",
      attrs: {
        "data-view-filter-form": "",
      },
    });
    form.append(...filters.map((filter) => renderFieldShell(filter, view)));
    replaceNode(fieldGrid, form);
    return panel;
  }

  function renderDataStatus(state, view) {
    if (state.loading) {
      return view.createStatusMessage({
        message: "Loading records...",
        tone: "info",
      });
    }

    if (state.error) {
      return view.createStatusMessage({
        message: state.error.message || "Records could not be loaded.",
        tone: "danger",
      });
    }

    if (state.actionError) {
      return view.createStatusMessage({
        message: state.actionError.message || "Action could not be completed.",
        tone: "danger",
      });
    }

    return null;
  }

  function renderIndexPanel(indexPanel, view, state) {
    if (!indexPanel) {
      return null;
    }
    const records = state.records || [];

    return view.createCollapsibleIndexPanel({
      title: indexPanel.title || indexPanel.label || "Index",
      body: records.length > 0
        ? [view.createIndexList({
          ariaLabel: indexPanel.title || indexPanel.label || "Index",
          items: records.map((record) => buildIndexItem(indexPanel, record)),
        })]
        : [
          renderPlaceholder(
            indexPanel.emptyState?.title || "No records",
            indexPanel.emptyState,
            view,
          ),
        ],
      open: indexPanel.open,
    });
  }

  function buildIndexItem(indexPanel, record) {
    const title = readDescriptorValue(record, indexPanel.itemTitleField, record.title || record.label || record.id || "Record");
    const subtitle = readDescriptorValue(record, indexPanel.itemSubtitleField, "");
    const meta = (indexPanel.itemMetaFields || [])
      .map((field) => readDescriptorValue(record, field, ""))
      .filter(Boolean);

    return {
      id: record.id || "",
      label: title,
      meta: [subtitle, ...meta].filter(Boolean),
    };
  }

  function renderTableShell(table, view, state) {
    if (!table) {
      return null;
    }

    const emptyState = table.emptyState || {};
    return view.createDataTable({
      caption: table.title || "",
      columns: (table.columns || []).map((column) => ({
        key: column.field || column.id,
        label: column.label || column.field || column.id || "",
        align: column.align,
        header: column.header,
      })),
      rows: state.records || [],
      emptyMessage: emptyState.message || emptyState.description || emptyState.title || "No records found.",
    });
  }

  function renderDetailShell(detail, view, state) {
    if (!detail) {
      return [];
    }

    const children = [
      renderDetailHeader(detail.header, view, state.selectedRecord),
      renderActions(detail.actionStrip?.actions, view, detail.actionStrip?.label || "Detail actions", state),
      renderSummaryPanels(detail.summaryPanels, view, state.selectedRecord),
      renderFieldGridShell(detail.itemForm, view, state.selectedRecord),
      renderItemCollection(detail.itemRows, view, state.selectedRecord) ||
        (!state.selectedRecord ? renderPlaceholder("Items", detail.itemRows?.emptyState || detail.emptyState, view) : null),
    ];

    return children.flat().filter(Boolean);
  }

  function renderDetailHeader(header, view, record) {
    if (!header) {
      return null;
    }

    const badges = Array.isArray(header.badges)
      ? header.badges.map((badge) => view.createElement("span", {
        className: "surface-chip",
        text: readDescriptorValue(record, badge.field, badge.label || badge.value || ""),
      }))
      : [];

    return view.createDetailHeader({
      title: readDescriptorValue(record, header.titleField, header.title || header.label || "Detail"),
      meta: readDescriptorValue(record, header.metaField || header.subtitleField, header.description || header.subtitle),
      badges,
    });
  }

  function renderSummaryPanels(summaryPanels, view, record) {
    if (!Array.isArray(summaryPanels)) {
      return [];
    }

    return summaryPanels.map((panel) => view.createInfoPanel({
      title: panel.title || panel.label,
      message: readDescriptorValue(record, panel.messageField, panel.description),
      items: (panel.items || []).map((item) => ({
        label: item.label || item.field || "",
        value: readDescriptorValue(record, item.field, item.value || ""),
      })),
    }));
  }

  function renderFieldGridShell(itemForm, view, record) {
    const fields = Array.isArray(itemForm?.fields) ? itemForm.fields : [];
    if (!fields.length) {
      return null;
    }

    return view.createFieldGrid({
      fields: fields.map((field) => renderFieldShell(field, view, {
        disabled: true,
        value: readDescriptorValue(record, field.field, field.default || ""),
      })),
    });
  }

  function renderItemCollection(itemRows, view, record) {
    const items = Array.isArray(readDescriptorValue(record, itemRows?.itemsField || "items", []))
      ? readDescriptorValue(record, itemRows?.itemsField || "items", [])
      : [];

    if (!itemRows || items.length === 0) {
      return null;
    }

    return view.createElement("div", {
      className: "view-renderer-item-collection",
      children: items.map((item) => view.createElement("article", {
        className: "view-renderer-item-row surface-card",
        children: [
          view.createElement("strong", {
            text: readDescriptorValue(item, itemRows.itemTitleField || "title", item.title || item.label || "Item"),
          }),
          view.createElement("p", {
            text: readDescriptorValue(item, itemRows.itemSubtitleField || "description", item.description || ""),
          }),
        ],
      })),
    });
  }

  function renderModalShells(modals, view) {
    if (!Array.isArray(modals)) {
      return [];
    }

    return modals.map((modal) => view.createModalForm({
      title: modal.title || modal.label || "Modal",
      fields: (modal.fields || []).map((field) => renderFieldShell(field, view)),
      actions: [...(modal.footerActions || []), ...(modal.actions || [])].map((action) => normalizeAction(action)),
    }));
  }

  function renderActions(actions, view, ariaLabel, state = null) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return null;
    }

    return view.createDetailActionStrip({
      ariaLabel,
      actions: actions.map((action) => normalizeAction(action, state)),
    });
  }

  function renderDescriptorActionStrip(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createDetailActionStrip({
      ariaLabel: options.ariaLabel || "Actions",
      className: options.className,
      actions,
    });
  }

  function renderDescriptorInlineActions(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createInlineActionRow({
      ariaLabel: options.ariaLabel || "Actions",
      className: options.className,
      actions,
    });
  }

  function renderDescriptorDataTable(tableDescriptor = {}, options = {}) {
    const view = requireViewPrimitives();
    return view.createDataTable({
      caption: options.caption || tableDescriptor.title || "",
      className: options.className,
      tableClassName: options.tableClassName,
      columns: (tableDescriptor.columns || options.columns || []).map((column) => ({
        key: column.field || column.id || column.key,
        label: column.label || column.field || column.id || column.key || "",
        align: column.align,
        header: column.header,
      })),
      rows: options.rows || [],
      emptyMessage: options.emptyMessage || tableDescriptor.emptyState?.message || tableDescriptor.emptyState?.description || "No records found.",
    });
  }

  function renderDescriptorFieldGrid(fieldDescriptor = {}, options = {}) {
    const view = requireViewPrimitives();
    return view.createFieldGrid({
      surface: options.surface,
      className: options.className,
      fields: options.fields || (fieldDescriptor.fields || []).map((field) => renderFieldShell(field, view, options.fieldOptions || {})),
    });
  }

  function renderDescriptorModalForm(modal = {}, options = {}) {
    const view = requireViewPrimitives();
    return view.createModalForm({
      title: options.title || modal.title || modal.label || "Modal",
      className: options.className,
      formClassName: options.formClassName,
      fields: options.fields || (modal.fields || []).map((field) => renderFieldShell(field, view)),
      actions: options.actions || [...(modal.footerActions || []), ...(modal.actions || [])].map((action) => normalizeAction(action)),
    });
  }

  function renderDescriptorLinkedRecordsPanel(linkedRecords = {}, options = {}) {
    const view = requireViewPrimitives();
    const section = view.createInfoPanel({
      title: options.title || linkedRecords.title || linkedRecords.label || "Linked Records",
      className: options.className,
      ariaLabel: options.ariaLabel || linkedRecords.ariaLabel || "Linked records",
    });
    const records = view.createElement("div", {
      className: options.recordsClassName || "view-linked-record-list",
    });
    const recordNodes = Array.isArray(options.recordNodes) ? options.recordNodes : [];
    if (recordNodes.length > 0) {
      records.replaceChildren(...recordNodes);
    } else {
      records.appendChild(view.createElement("p", {
        className: options.emptyClassName || "view-linked-record-empty",
        text: linkedRecords.emptyState?.message || linkedRecords.emptyState?.description || "No linked records yet.",
      }));
    }

    section.dataset.viewLinkedRecordsPanel = "";
    section.appendChild(records);

    if (options.formFields || options.formActions) {
      const form = view.createElement("form", {
        className: options.formClassName || ["view-linked-record-form", "view-field-grid", "surface-modal-section-body"],
        dataset: options.formDataset,
        hidden: options.locked || options.hidden,
      });
      form.append(...(options.formFields || []), ...(options.formActions || []));
      section.appendChild(form);
    }

    return section;
  }

  function renderFieldShell(field, view, options = {}) {
    const controlId = field.field || field.id || "";
    const label = view.createElement("label", {
      className: "view-renderer-field",
      attrs: {
        "data-view-field": controlId,
      },
    });
    label.appendChild(view.createElement("span", {
      className: "view-renderer-field-label",
      text: field.label || controlId || "Field",
    }));
    label.appendChild(createFieldControl(field, view, {
      ...options,
      controlId,
    }));
    return label;
  }

  function createFieldControl(field, view, options = {}) {
    if (field.type === "select") {
      const select = view.createElement("select", {
        attrs: {
          name: options.controlId,
          disabled: options.disabled,
          required: field.required,
          "data-view-input": options.controlId,
        },
      });
      for (const option of normalizeSelectOptions(field.options)) {
        const optionElement = view.createElement("option", {
          text: option.label,
          attrs: {
            value: option.value,
            selected: option.selected,
          },
        });
        select.appendChild(optionElement);
      }
      if (options.value !== undefined && options.value !== null) {
        select.value = String(options.value);
      } else if (field.default !== undefined && field.default !== null) {
        select.value = String(field.default);
      }
      return select;
    }

    const control = view.createElement(field.type === "textarea" ? "textarea" : "input", {
      attrs: {
        name: options.controlId,
        type: inputTypeFor(field.type),
        disabled: options.disabled,
        hidden: field.hidden,
        min: field.min,
        step: field.step,
        rows: field.rows,
        autocomplete: field.autocomplete,
        required: field.required,
        value: options.value ?? field.default,
        placeholder: field.placeholder,
        "data-view-input": options.controlId,
      },
    });
    if (field.type === "checkbox") {
      control.value = field.default ?? "true";
      control.checked = Boolean(options.value ?? field.checked);
    }
    return control;
  }

  function normalizeSelectOptions(options = []) {
    if (!Array.isArray(options)) {
      return [];
    }

    return options.map((option) => {
      if (Array.isArray(option)) {
        return {
          value: option[0] ?? "",
          label: option[1] ?? option[0] ?? "",
          selected: Boolean(option[2]),
        };
      }
      if (option && typeof option === "object") {
        const value = option.value ?? option.id ?? "";
        return {
          value,
          label: option.label ?? option.text ?? value,
          selected: Boolean(option.selected || option.default),
        };
      }
      return {
        value: option ?? "",
        label: option ?? "",
        selected: false,
      };
    });
  }

  async function loadBoundRecords(descriptor) {
    const api = requireApiClient();
    const body = await api.getJson(descriptor.dataSource.route, { cache: "no-store" });
    return extractRecords(body).map((record) => bindRecord(record, descriptor.dataSource.fieldBindings || {}));
  }

  function extractRecords(body) {
    if (Array.isArray(body)) {
      return body;
    }

    for (const key of ["records", "items", "data", "results", "rows", "tags", "lists", "tasks"]) {
      if (Array.isArray(body?.[key])) {
        return body[key];
      }
    }

    if (body && typeof body === "object") {
      const firstArray = Object.values(body).find((value) => Array.isArray(value));
      if (Array.isArray(firstArray)) {
        return firstArray;
      }
      return [body];
    }

    return [];
  }

  function bindRecord(record, fieldBindings) {
    const bound = { _source: record };

    for (const [fieldName, sourcePath] of Object.entries(fieldBindings)) {
      bound[fieldName] = readPath(record, sourcePath);
    }

    for (const [fieldName, value] of Object.entries(record || {})) {
      if (bound[fieldName] === undefined) {
        bound[fieldName] = value;
      }
    }

    return bound;
  }

  function readDescriptorValue(record, fieldName, fallback = "") {
    if (!fieldName) {
      return fallback;
    }

    const value = readPath(record, fieldName);
    return value === undefined || value === null ? fallback : value;
  }

  function readPath(source, path) {
    if (!path || !source || typeof source !== "object") {
      return undefined;
    }

    return String(path).split(".").reduce((value, key) => {
      if (value === undefined || value === null) {
        return undefined;
      }
      return value[key];
    }, source);
  }

  function renderPlaceholder(title, emptyState, view) {
    return view.createEmptyState({
      title: emptyState?.title || title,
      message: emptyState?.message || emptyState?.description || "No records loaded.",
    });
  }

  function normalizeAction(action = {}, state = null) {
    return {
      label: action.label || action.id || "Action",
      role: action.role,
      action: action.behavior || action.id,
      disabled: !state,
      onClick: state ? () => runDescriptorAction(action, state) : undefined,
    };
  }

  async function runDescriptorAction(action = {}, state) {
    try {
      state.actionError = null;
      if (action.confirm && !(await confirmDescriptorAction(action))) {
        return;
      }
      assertActionPermissions(action);

      if (action.route) {
        await runRouteAction(action, state);
        await state.surface.refresh();
        return;
      }

      if (action.behavior) {
        await runBehaviorAction(action, state);
        return;
      }

      if (action.modalId || action.modal) {
        openDescriptorModal(state, action.modalId || action.modal, state.selectedRecord);
        return;
      }
    } catch (error) {
      state.actionError = error;
      rerenderState(state);
    }
  }

  async function confirmDescriptorAction(action) {
    const message = typeof action.confirm === "string"
      ? action.confirm
      : `Continue with ${action.label || action.id || "this action"}?`;
    if (root.modal?.confirm) {
      return root.modal.confirm({ title: action.label || "Confirm action", message });
    }
    if (typeof global.confirm === "function") {
      return global.confirm(message);
    }
    return true;
  }

  async function runRouteAction(action, state) {
    const api = requireApiClient();
    const method = String(action.method || "POST").toUpperCase();

    if (method === "GET") {
      await api.getJson(action.route, { cache: "no-store" });
    } else if (method === "POST") {
      await api.postJson(action.route, action.payload || {});
    } else if (method === "PUT") {
      await api.putJson(action.route, action.payload || {});
    } else if (method === "PATCH") {
      if (typeof api.patchJson !== "function") {
        throw new Error("PATCH route actions require LongtailForge.api.patchJson.");
      }
      await api.patchJson(action.route, action.payload || {});
    } else if (method === "DELETE") {
      await api.deleteJson(action.route);
    } else {
      throw new Error(`Unsupported action method: ${method}`);
    }

    state.actionError = null;
  }

  function assertActionPermissions(action) {
    const requiredPermissions = action.requiredPermissions || [];
    const grantedPermissions = root.workspaceContext?.permissionIds || root.workspaceContext?.permissions;
    if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0 || !Array.isArray(grantedPermissions)) {
      return;
    }

    const granted = new Set(grantedPermissions);
    const missing = requiredPermissions.filter((permissionId) => !granted.has(permissionId));
    if (missing.length > 0) {
      throw new Error("You do not have permission to run this action.");
    }
  }

  async function runBehaviorAction(action, state) {
    const handler = behaviors.get(action.behavior);
    if (!handler) {
      throw new Error(`Missing view behavior handler: ${action.behavior}`);
    }

    await handler({
      action,
      api: requireApiClient(),
      openModal: (modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
      record: state.selectedRecord,
      refresh: state.surface.refresh,
      workspaceContext: root.workspaceContext || {},
    });
    state.actionError = null;
    rerenderState(state);
  }

  function openDescriptorModal(state, modalId, record = null) {
    const modal = (state.descriptor.modals || []).find((candidate) => candidate.id === modalId);
    if (!modal) {
      throw new Error(`Descriptor modal not found: ${modalId}`);
    }

    const dialog = state.view.createModalForm({
      title: modal.title || modal.label || "Modal",
      fields: (modal.fields || []).map((field) => renderFieldShell(field, state.view, {
        value: readDescriptorValue(record, field.field, field.default || ""),
      })),
      actions: [...(modal.footerActions || []), ...(modal.actions || [])].map((action) => normalizeAction(action, state)),
    });
    const parent = global.document?.body || state.surface;
    parent.appendChild(dialog);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    return dialog;
  }

  function rerenderState(state) {
    const body = state.surface?.querySelector?.(".view-renderer-body") || state.surface?.firstChild;
    if (!body) {
      return;
    }
    renderInto(body, renderLayout(state.descriptor, state.view, state));
  }

  function inputTypeFor(type) {
    if (type === "number" || type === "date" || type === "time" || type === "checkbox") {
      return type;
    }
    return "text";
  }

  function clearHost(host) {
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
  }

  function replaceNode(existingNode, replacementNode) {
    const parent = existingNode?.parentNode;
    if (!parent) {
      return;
    }
    parent.removeChild(existingNode);
    parent.appendChild(replacementNode);
  }

  function requireViewPrimitives() {
    const view = root.view || {};
    for (const helperName of [
      "createCollapsibleIndexPanel",
      "createDataTable",
      "createDetailActionStrip",
      "createDetailHeader",
      "createElement",
      "createEmptyState",
      "createFieldGrid",
      "createFilterPanel",
      "createIndexList",
      "createInfoPanel",
      "createInlineActionRow",
      "createModalForm",
      "createPageHeader",
      "createSplitListDetail",
    ]) {
      if (typeof view[helperName] !== "function") {
        throw new Error("View surface rendering requires LongtailForge.view primitives.");
      }
    }
    return view;
  }

  function requireApiClient() {
    const api = root.api || {};
    if (typeof api.getJson !== "function") {
      throw new Error("View surface data binding requires LongtailForge.api.getJson.");
    }
    return api;
  }

  root.view = Object.freeze({
    ...(root.view || {}),
    registerBehavior,
    renderDescriptorActionStrip,
    renderDescriptorDataTable,
    renderDescriptorFieldGrid,
    renderDescriptorInlineActions,
    renderDescriptorLinkedRecordsPanel,
    renderDescriptorModalForm,
    renderSurface,
  });
  global.LongtailForge = root;
})(window);
