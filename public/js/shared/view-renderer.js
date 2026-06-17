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
      filterValues: initialFilterValues(descriptor),
      loading: Boolean(descriptor.dataSource?.route),
      pendingMounts: [],
      records: [],
      selectedRecord: null,
      selectedRecordId: "",
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
    state.body = body;
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
          state.records = await loadBoundRecords(descriptor, state.filterValues);
          state.selectedRecord = initialSelectedRecord(descriptor, state);
          state.selectedRecordId = recordId(state.selectedRecord);
        } catch (error) {
          state.records = [];
          state.selectedRecord = null;
          state.selectedRecordId = "";
          state.error = error;
        } finally {
          state.loading = false;
          renderInto(body, renderLayout(descriptor, view, state));
          flushMounts(state);
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
    flushMounts(state);
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
      renderFilters(descriptor.filters, view, state),
      renderDataStatus(state, view),
    ].filter(Boolean);

    if (descriptor.layout === "stacked") {
      const container = view.createElement("div", { className: "view-stacked" });
      container.appendChild(
        renderIndexPanel(descriptor.indexPanel, view, state) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view),
      );
      container.appendChild(view.createElement("section", {
        className: ["view-stacked-detail", "surface-main-panel"],
        attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
        children: renderDetailShell(descriptor.detail, view, state),
      }));
      children.push(container);
    } else if (descriptor.layout === "table-page") {
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    } else {
      children.push(renderIndexPanel(descriptor.indexPanel, view, state));
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    }

    children.push(...renderRegions(descriptor.regions, view, state, state.selectedRecord));
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

  function renderFilters(filters, view, state = null) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return null;
    }

    const panel = view.createFilterPanel({
      title: "Filters",
      open: false,
      fields: filters.map((filter) => renderFieldShell(filter, view, { disabled: true })),
    });
    const fieldGrid = panel.querySelector(".view-filter-panel-fields");
    const form = view.createElement("form", {
      className: fieldGrid?.className || "view-filter-panel-fields",
      attrs: {
        "data-view-filter-form": "",
      },
    });
    form.append(...filters.map((filter) => renderFieldShell(filter, view, {
      value: state ? state.filterValues?.[filter.field || filter.id] : undefined,
    })));
    replaceNode(fieldGrid, form);

    if (state) {
      const applyFilters = (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        collectFilterValues(form, filters, state);
        if (state.surface?.refresh) {
          state.surface.refresh();
        }
      };
      form.addEventListener("change", applyFilters);
      form.addEventListener("submit", applyFilters);
    }

    return panel;
  }

  function collectFilterValues(form, filters, state) {
    if (!state.filterValues) {
      state.filterValues = {};
    }
    for (const filter of filters) {
      const key = filter.field || filter.id;
      if (!key) {
        continue;
      }
      const control = form.querySelector?.(`[data-view-input="${key}"]`);
      if (control) {
        state.filterValues[key] = control.type === "checkbox" ? Boolean(control.checked) : control.value;
      }
    }
  }

  function initialFilterValues(descriptor) {
    const values = {};
    for (const filter of (Array.isArray(descriptor.filters) ? descriptor.filters : [])) {
      const key = filter.field || filter.id;
      if (key && filter.default !== undefined) {
        values[key] = filter.default;
      }
    }
    return values;
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
          items: records.map((record) => buildIndexItem(indexPanel, record, state)),
        })]
        : [
          renderPlaceholder(
            indexPanel.emptyState?.title || "No records",
            indexPanel.emptyState,
            view,
          ),
        ],
      open: state.indexCollapsed ? false : indexPanel.open,
    });
  }

  function buildIndexItem(indexPanel, record, state) {
    const title = readDescriptorValue(record, indexPanel.itemTitleField, record.title || record.label || record.id || "Record");
    const subtitle = readDescriptorValue(record, indexPanel.itemSubtitleField, "");
    const meta = (indexPanel.itemMetaFields || [])
      .map((field) => readDescriptorValue(record, field, ""))
      .filter(Boolean);

    return {
      id: record.id || "",
      label: title,
      meta: [subtitle, ...meta].filter(Boolean),
      selected: recordId(record) === state.selectedRecordId,
      onSelect: () => selectIndexRecord(state, record),
    };
  }

  function initialSelectedRecord(descriptor, state) {
    const records = state.records || [];
    const indexPanel = descriptor.indexPanel || {};
    if (indexPanel.initialSelection === "none") {
      return null;
    }
    if (state.selectedRecordId) {
      return records.find((record) => recordId(record) === state.selectedRecordId) || records[0] || null;
    }
    return records[0] || null;
  }

  function selectIndexRecord(state, record) {
    state.selectedRecord = record || null;
    state.selectedRecordId = recordId(record);
    if (state.descriptor.indexPanel?.collapseOnSelect) {
      state.indexCollapsed = true;
    }
    if (state.body) {
      renderInto(state.body, renderLayout(state.descriptor, state.view, state));
      flushMounts(state);
    }
  }

  function recordId(record) {
    return String(record?.id || record?.record_id || record?.list_id || record?.note_id || "");
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
      renderItemCollection(detail.itemRows, view, state) ||
        (!state.selectedRecord ? renderPlaceholder("Items", detail.itemRows?.emptyState || detail.emptyState, view) : null),
      ...renderRegions(detail.regions, view, state, state.selectedRecord),
    ];

    return children.flat().filter(Boolean);
  }

  function renderRegions(regions, view, state, record) {
    if (!Array.isArray(regions) || regions.length === 0) {
      return [];
    }

    return regions.map((region) => {
      const container = view.createElement("section", {
        className: ["view-region", "surface-main-panel", region.className],
        attrs: {
          "data-view-region": region.id || "",
          ...(region.ariaLabel ? { "aria-label": region.ariaLabel } : {}),
        },
      });
      if (region.title || region.label) {
        container.appendChild(view.createElement("h3", {
          className: "view-region-title",
          text: region.title || region.label,
        }));
      }
      const mountTarget = view.createElement("div", {
        className: "view-region-body",
        attrs: { "data-view-region-body": region.id || "" },
      });
      container.appendChild(mountTarget);
      if (region.behavior) {
        state.pendingMounts.push({ region, container: mountTarget, record });
      }
      return container;
    });
  }

  function flushMounts(state) {
    const pending = state.pendingMounts || [];
    state.pendingMounts = [];
    for (const mount of pending) {
      const handler = behaviors.get(mount.region.behavior);
      if (!handler) {
        mount.container.appendChild(state.view.createElement("p", {
          className: ["view-region-error", "view-status-message"],
          text: `Missing view behavior handler: ${mount.region.behavior}`,
          attrs: { role: "alert" },
        }));
        continue;
      }
      try {
        handler({
          action: null,
          api: root.api || {},
          container: mount.container,
          openModal: (modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
          record: mount.record,
          refresh: state.surface.refresh,
          region: mount.region,
          workspaceContext: root.workspaceContext || {},
        });
      } catch (error) {
        mount.container.appendChild(state.view.createElement("p", {
          className: ["view-region-error", "view-status-message"],
          text: error?.message || "Region could not be mounted.",
          attrs: { role: "alert" },
        }));
      }
    }
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

  function renderItemCollection(itemRows, view, state) {
    const record = state.selectedRecord;
    const items = Array.isArray(readDescriptorValue(record, itemRows?.itemsField || "items", []))
      ? readDescriptorValue(record, itemRows?.itemsField || "items", [])
      : [];

    if (!itemRows || items.length === 0) {
      return null;
    }

    return view.createElement("div", {
      className: "view-renderer-item-collection",
      children: items.map((item) => renderItemRow(itemRows, item, view, state)),
    });
  }

  function renderItemRow(itemRows, item, view, state) {
    const children = [
      view.createElement("strong", {
        className: "view-renderer-item-title",
        text: readDescriptorValue(item, itemRows.itemTitleField || "title", item.title || item.label || "Item"),
      }),
    ];

    const chips = (Array.isArray(itemRows.chips) ? itemRows.chips : [])
      .map((chip) => readDescriptorValue(item, chip.field, chip.label || ""))
      .filter(Boolean);
    if (chips.length > 0) {
      children.push(view.createElement("span", {
        className: ["view-renderer-item-chips", "surface-chip-row"],
        children: chips.map((chip) => view.createElement("span", { className: "surface-chip", text: String(chip) })),
      }));
    }

    const subtitle = readDescriptorValue(item, itemRows.itemSubtitleField || "description", item.description || "");
    if (subtitle) {
      children.push(view.createElement("p", { className: "view-renderer-item-subtitle", text: subtitle }));
    }

    for (const field of (Array.isArray(itemRows.metaFields) ? itemRows.metaFields : [])) {
      const value = readDescriptorValue(item, field, "");
      if (value) {
        children.push(view.createElement("span", { className: "view-renderer-item-meta", text: String(value) }));
      }
    }

    const rowActions = (Array.isArray(itemRows.rowActions) ? itemRows.rowActions : [])
      .filter((action) => evaluateVisibleWhen(action.visibleWhen, item))
      .map((action) => normalizeAction(action, state, item));
    if (rowActions.length > 0) {
      children.push(view.createDetailActionStrip({
        ariaLabel: itemRows.actionsLabel || "Item actions",
        actions: rowActions,
      }));
    }

    return view.createElement("article", {
      className: "view-renderer-item-row surface-card",
      children,
    });
  }

  function evaluateVisibleWhen(condition, record) {
    if (!condition || typeof condition !== "object") {
      return true;
    }
    const value = readDescriptorValue(record, condition.field, undefined);
    if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
      return value === condition.equals;
    }
    if (Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition.truthy === true) {
      return Boolean(value);
    }
    if (condition.falsy === true) {
      return !value;
    }
    return true;
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

  function renderDescriptorActionMenu(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createDetailActionMenu({
      ariaLabel: options.ariaLabel || "Actions",
      summaryLabel: options.summaryLabel,
      title: options.title,
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
      size: options.size || modal.size,
      fields: options.fields || (modal.fields || []).map((field) => renderFieldShell(field, view)),
      actions: options.actions || [...(modal.footerActions || []), ...(modal.actions || [])].map((action) => normalizeAction(action)),
      utilityActions: options.utilityActions,
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
        ...(field.width ? { "data-view-field-width": field.width } : {}),
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

  async function loadBoundRecords(descriptor, filterValues = {}) {
    const api = requireApiClient();
    const route = appendFilterQuery(descriptor.dataSource.route, descriptor.filters, filterValues);
    const body = await api.getJson(route, { cache: "no-store" });
    return extractRecords(body).map((record) => bindRecord(record, descriptor.dataSource.fieldBindings || {}));
  }

  function appendFilterQuery(route, filters, filterValues) {
    if (!Array.isArray(filters) || filters.length === 0 || !filterValues) {
      return route;
    }

    const params = [];
    for (const filter of filters) {
      const key = filter.queryKey || filter.field || filter.id;
      const valueKey = filter.field || filter.id;
      if (!key || !valueKey) {
        continue;
      }
      const value = filterValues[valueKey];
      if (value === undefined || value === null || value === "" || value === false) {
        continue;
      }
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }

    if (params.length === 0) {
      return route;
    }
    return `${route}${route.includes("?") ? "&" : "?"}${params.join("&")}`;
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

  function normalizeAction(action = {}, state = null, recordOverride = undefined) {
    return {
      label: action.label || action.id || "Action",
      role: action.role,
      action: action.behavior || action.id,
      disabled: !state,
      onClick: state ? () => runDescriptorAction(action, state, recordOverride) : undefined,
    };
  }

  async function runDescriptorAction(action = {}, state, recordOverride = undefined) {
    const record = recordOverride !== undefined ? recordOverride : state.selectedRecord;
    try {
      state.actionError = null;
      if (action.confirm && !(await confirmDescriptorAction(action))) {
        return;
      }
      assertActionPermissions(action);

      if (action.route) {
        await runRouteAction(action, state, record);
        await state.surface.refresh();
        return;
      }

      if (action.behavior) {
        await runBehaviorAction(action, state, record);
        return;
      }

      if (action.modalId || action.modal) {
        openDescriptorModal(state, action.modalId || action.modal, record);
        return;
      }
    } catch (error) {
      state.actionError = error;
      if (surfaceOwnsRenderedData(state)) {
        rerenderState(state);
      }
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

  async function runRouteAction(action, state, record = null) {
    const api = requireApiClient();
    const method = String(action.method || "POST").toUpperCase();
    const route = interpolateRoute(action.route, record);

    if (method === "GET") {
      await api.getJson(route, { cache: "no-store" });
    } else if (method === "POST") {
      await api.postJson(route, action.payload || {});
    } else if (method === "PUT") {
      await api.putJson(route, action.payload || {});
    } else if (method === "PATCH") {
      if (typeof api.patchJson !== "function") {
        throw new Error("PATCH route actions require LongtailForge.api.patchJson.");
      }
      await api.patchJson(route, action.payload || {});
    } else if (method === "DELETE") {
      await api.deleteJson(route);
    } else {
      throw new Error(`Unsupported action method: ${method}`);
    }

    state.actionError = null;
  }

  function interpolateRoute(route, record) {
    if (typeof route !== "string" || !record) {
      return route;
    }
    return route.replace(/\{([\w.]+)\}/g, (match, field) => {
      const value = readDescriptorValue(record, field, undefined);
      return value === undefined || value === null ? match : encodeURIComponent(String(value));
    });
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

  async function runBehaviorAction(action, state, recordOverride = null) {
    const handler = behaviors.get(action.behavior);
    if (!handler) {
      throw new Error(`Missing view behavior handler: ${action.behavior}`);
    }

    await handler({
      action,
      api: requireApiClient(),
      openModal: (modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
      record: recordOverride !== null ? recordOverride : state.selectedRecord,
      refresh: state.surface.refresh,
      workspaceContext: root.workspaceContext || {},
    });
    state.actionError = null;
    // Only the framework re-renders surfaces whose data it owns. When dataSource is null the module
    // owns the surface body (mounted chrome + loaded data), so a framework rerender would wipe it.
    if (surfaceOwnsRenderedData(state)) {
      rerenderState(state);
    }
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

  function surfaceOwnsRenderedData(state) {
    return Boolean(state?.descriptor?.dataSource?.route);
  }

  function rerenderState(state) {
    const body = state.surface?.querySelector?.(".view-renderer-body") || state.surface?.firstChild;
    if (!body) {
      return;
    }
    renderInto(body, renderLayout(state.descriptor, state.view, state));
    flushMounts(state);
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
    renderDescriptorActionMenu,
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
