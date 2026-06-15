(function attachViewRenderer(global) {
  const root = global.LongtailForge || {};

  function renderSurface(descriptor = {}, host) {
    const view = requireViewPrimitives();
    if (!host || typeof host.appendChild !== "function") {
      throw new Error("View surface rendering requires a host element.");
    }

    clearHost(host);

    const surface = view.createElement("section", {
      className: ["view-renderer-surface", `view-renderer-layout-${descriptor.layout || "single-column"}`],
      attrs: {
        "data-view-surface-id": descriptor.id || "",
        "data-view-layout": descriptor.layout || "single-column",
      },
    });

    for (const child of renderLayout(descriptor, view)) {
      surface.appendChild(child);
    }

    host.appendChild(surface);
    return surface;
  }

  function renderLayout(descriptor, view) {
    const children = [
      renderPageHeader(descriptor.pageHeader, view),
      renderActions(descriptor.actions, view, "Surface actions"),
      renderFilters(descriptor.filters, view),
    ].filter(Boolean);

    if (descriptor.layout === "split-list-detail") {
      children.push(view.createSplitListDetail({
        listLabel: descriptor.indexPanel?.title || descriptor.indexPanel?.label || "Index",
        detailLabel: descriptor.detail?.header?.title || "Detail",
        list: [renderIndexPanel(descriptor.indexPanel, view) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view)],
        detail: renderDetailShell(descriptor.detail, view),
      }));
    } else if (descriptor.layout === "table-page") {
      children.push(renderTableShell(descriptor.table, view));
      children.push(...renderDetailShell(descriptor.detail, view));
    } else {
      children.push(renderIndexPanel(descriptor.indexPanel, view));
      children.push(renderTableShell(descriptor.table, view));
      children.push(...renderDetailShell(descriptor.detail, view));
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

  function renderIndexPanel(indexPanel, view) {
    if (!indexPanel) {
      return null;
    }

    return view.createCollapsibleIndexPanel({
      title: indexPanel.title || indexPanel.label || "Index",
      body: [
        renderPlaceholder(
          indexPanel.emptyState?.title || "No records",
          indexPanel.emptyState,
          view,
        ),
      ],
      open: indexPanel.open,
    });
  }

  function renderTableShell(table, view) {
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
      rows: [],
      emptyMessage: emptyState.message || emptyState.description || emptyState.title || "No records found.",
    });
  }

  function renderDetailShell(detail, view) {
    if (!detail) {
      return [];
    }

    const children = [
      renderDetailHeader(detail.header, view),
      renderActions(detail.actionStrip?.actions, view, detail.actionStrip?.label || "Detail actions"),
      renderSummaryPanels(detail.summaryPanels, view),
      renderFieldGridShell(detail.itemForm, view),
      renderPlaceholder("Items", detail.itemRows?.emptyState || detail.emptyState, view),
    ];

    return children.flat().filter(Boolean);
  }

  function renderDetailHeader(header, view) {
    if (!header) {
      return null;
    }

    return view.createDetailHeader({
      title: header.title || header.label || "Detail",
      meta: header.description || header.subtitle,
    });
  }

  function renderSummaryPanels(summaryPanels, view) {
    if (!Array.isArray(summaryPanels)) {
      return [];
    }

    return summaryPanels.map((panel) => view.createInfoPanel({
      title: panel.title || panel.label,
      message: panel.description,
      items: panel.items || [],
    }));
  }

  function renderFieldGridShell(itemForm, view) {
    const fields = Array.isArray(itemForm?.fields) ? itemForm.fields : [];
    if (!fields.length) {
      return null;
    }

    return view.createFieldGrid({
      fields: fields.map((field) => renderFieldShell(field, view, { disabled: true })),
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
        value: field.default,
        placeholder: field.placeholder,
      },
    }));
    return label;
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

  root.view = Object.freeze({
    ...(root.view || {}),
    renderSurface,
  });
  global.LongtailForge = root;
})(window);
