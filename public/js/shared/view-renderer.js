(function attachViewRenderer(global) {
  const root = global.LongtailForge || {};

  function renderSurface(descriptor = {}, host) {
    const view = requireViewPrimitives();
    if (!host || typeof host.appendChild !== "function") {
      throw new Error("View surface rendering requires a host element.");
    }

    clearHost(host);

    const state = {
      descriptor,
      error: null,
      loading: Boolean(descriptor.dataSource?.route),
      records: [],
      selectedRecord: null,
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
      renderPageHeader(descriptor.pageHeader, view),
      renderActions(descriptor.actions, view, "Surface actions"),
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

  function renderPageHeader(pageHeader, view) {
    if (!pageHeader) {
      return null;
    }

    return view.createPageHeader({
      title: pageHeader.title || pageHeader.label || "Untitled view",
      subtitle: pageHeader.description,
      actions: pageHeader.primaryAction ? [normalizeAction(pageHeader.primaryAction)] : [],
    });
  }

  function renderFilters(filters, view) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return null;
    }

    return view.createFilterPanel({
      title: "Filters",
      fields: filters.map((filter) => renderFieldShell(filter, view, { disabled: true })),
    });
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

    return null;
  }

  function renderIndexPanel(indexPanel, view, state) {
    if (!indexPanel) {
      return null;
    }
    const records = state.records || [];

    return view.createCollapsibleIndexPanel({
      title: indexPanel.title || indexPanel.label || "Index",
      body: records.length > 0 ? records.map((record) => renderIndexItem(indexPanel, record, view)) : [
        renderPlaceholder(
          indexPanel.emptyState?.title || "No records",
          indexPanel.emptyState,
          view,
        ),
      ],
      open: indexPanel.open,
    });
  }

  function renderIndexItem(indexPanel, record, view) {
    const title = readDescriptorValue(record, indexPanel.itemTitleField, record.title || record.label || record.id || "Record");
    const subtitle = readDescriptorValue(record, indexPanel.itemSubtitleField, "");
    const meta = (indexPanel.itemMetaFields || [])
      .map((field) => readDescriptorValue(record, field, ""))
      .filter(Boolean)
      .join(" - ");

    return view.createElement("article", {
      className: "view-renderer-index-item surface-card",
      attrs: { "data-view-record-id": record.id || "" },
      children: [
        view.createElement("strong", { text: title }),
        subtitle ? view.createElement("p", { text: subtitle }) : null,
        meta ? view.createElement("small", { text: meta }) : null,
      ],
    });
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
      renderActions(detail.actionStrip?.actions, view, detail.actionStrip?.label || "Detail actions"),
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
      actions: [...(modal.footerActions || []), ...(modal.actions || [])].map(normalizeAction),
    }));
  }

  function renderActions(actions, view, ariaLabel) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return null;
    }

    return view.createDetailActionStrip({
      ariaLabel,
      actions: actions.map(normalizeAction),
    });
  }

  function renderFieldShell(field, view, options = {}) {
    const label = view.createElement("label", {
      className: "view-renderer-field",
      attrs: {
        "data-view-field": field.field || field.id || "",
      },
    });
    label.appendChild(view.createElement("span", {
      className: "view-renderer-field-label",
      text: field.label || field.field || field.id || "Field",
    }));
    label.appendChild(view.createElement(field.type === "textarea" ? "textarea" : "input", {
      attrs: {
        type: inputTypeFor(field.type),
        disabled: options.disabled,
        required: field.required,
        value: options.value ?? field.default,
        placeholder: field.placeholder,
      },
    }));
    return label;
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

  function normalizeAction(action = {}) {
    return {
      label: action.label || action.id || "Action",
      role: action.role,
      action: action.behavior || action.id,
      disabled: true,
    };
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
      "createInfoPanel",
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
    renderSurface,
  });
  global.LongtailForge = root;
})(window);
