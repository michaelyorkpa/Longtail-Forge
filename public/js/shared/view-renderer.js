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
      slideOutSidebarOpen: false,
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
      renderDataStatus(state, view),
    ].filter(Boolean);

    if (descriptor.layout === "stacked") {
      children.splice(2, 0, renderFilters(descriptor.filters, view, state));
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
    } else if (descriptor.layout === "sidebar-detail") {
      const container = view.createElement("div", { className: "view-sidebar-detail" });
      const sidebar = view.createElement("aside", {
        className: "view-sidebar-detail-sidebar",
        attrs: { "aria-label": descriptor.sidebarLabel || "View controls" },
      });
      sidebar.append(...renderSidebarPanels(descriptor, view, state));
      container.appendChild(sidebar);
      container.appendChild(view.createElement("section", {
        className: ["view-sidebar-detail-primary", "surface-main-panel"],
        attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
        children: renderDetailShell(descriptor.detail, view, state),
      }));
      children.push(container);
    } else if (descriptor.layout === "slide-out-sidebar") {
      children.push(renderSlideOutSidebarLayout(descriptor, view, state));
    } else if (descriptor.layout === "table-page") {
      if (descriptor.filterPlacement === "slide-out-sidebar") {
        children.push(renderTablePageSlideOutLayout(descriptor, view, state));
      } else {
        children.splice(2, 0, renderFilters(descriptor.filters, view, state));
        children.push(...renderRegions(regionsForPlacement(descriptor.regions, "before-table"), view, state, state.selectedRecord));
        children.push(renderTableShell(descriptor.table, view, state));
        children.push(...renderDetailShell(descriptor.detail, view, state));
      }
    } else {
      children.splice(2, 0, renderFilters(descriptor.filters, view, state));
      children.push(renderIndexPanel(descriptor.indexPanel, view, state));
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    }

    children.push(...renderRegions(regionsForPlacement(descriptor.regions, "default"), view, state, state.selectedRecord));
    children.push(...renderModalShells(descriptor.modals, view));
    return children.filter(Boolean);
  }

  function regionsForPlacement(regions, placement) {
    const regionList = Array.isArray(regions) ? regions : [];
    if (placement === "default") {
      return regionList.filter((region) => !region.placement || region.placement === "default" || region.placement === "end");
    }
    return regionList.filter((region) => region.placement === placement);
  }

  function renderSlideOutSidebarLayout(descriptor, view, state) {
    const drawerId = `${descriptor.id || "view"}-slideout-sidebar`;
    const container = view.createElement("div", { className: "view-slideout-sidebar" });
    const trigger = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-toggle",
      icon: "filter",
      label: "Open filters and navigation",
    });
    const backdrop = view.createElement("div", {
      className: "view-slideout-sidebar-backdrop",
      attrs: {
        "aria-hidden": "true",
        "data-view-slideout-sidebar-backdrop": "",
      },
      hidden: true,
    });
    const drawer = view.createElement("aside", {
      id: drawerId,
      className: ["view-slideout-sidebar-drawer", "surface-drawer"],
      attrs: {
        "aria-hidden": "true",
        "aria-label": descriptor.sidebarLabel || "View controls",
        tabindex: "-1",
      },
    });
    const closeButton = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-close",
      icon: "close",
      label: "Close filters and navigation",
    });
    const headingId = `${drawerId}-title`;
    drawer.setAttribute("aria-labelledby", headingId);
    drawer.appendChild(view.createElement("header", {
      className: "view-slideout-sidebar-header",
      children: [
        view.createElement("h2", {
          id: headingId,
          className: "view-slideout-sidebar-title",
          text: descriptor.sidebarLabel || "View controls",
        }),
        closeButton,
      ],
    }));
    drawer.appendChild(view.createElement("div", {
      className: "view-slideout-sidebar-body",
      children: renderSidebarPanels(descriptor, view, state),
    }));
    const main = view.createElement("section", {
      className: ["view-slideout-sidebar-main", "surface-main-panel"],
      attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
      children: renderDetailShell(descriptor.detail, view, state),
    });

    trigger.setAttribute("aria-controls", drawerId);
    closeButton.setAttribute("aria-controls", drawerId);

    container.append(trigger, backdrop, drawer, main);
    wireSlideOutSidebar(state, { backdrop, closeButton, drawer, trigger });
    syncSlideOutSidebarState(state, { backdrop, closeButton, drawer, trigger }, { focus: false });

    return container;
  }

  function renderTablePageSlideOutLayout(descriptor, view, state) {
    const drawerId = `${descriptor.id || "view"}-slideout-sidebar`;
    const container = view.createElement("div", { className: "view-slideout-sidebar" });
    const trigger = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-toggle",
      icon: "filter",
      label: "Open filters",
    });
    const backdrop = view.createElement("div", {
      className: "view-slideout-sidebar-backdrop",
      attrs: {
        "aria-hidden": "true",
        "data-view-slideout-sidebar-backdrop": "",
      },
      hidden: true,
    });
    const drawer = view.createElement("aside", {
      id: drawerId,
      className: ["view-slideout-sidebar-drawer", "surface-drawer"],
      attrs: {
        "aria-hidden": "true",
        "aria-label": descriptor.sidebarLabel || "Filters",
        tabindex: "-1",
      },
    });
    const closeButton = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-close",
      icon: "close",
      label: "Close filters",
    });
    const headingId = `${drawerId}-title`;
    drawer.setAttribute("aria-labelledby", headingId);
    drawer.appendChild(view.createElement("header", {
      className: "view-slideout-sidebar-header",
      children: [
        view.createElement("h2", {
          id: headingId,
          className: "view-slideout-sidebar-title",
          text: descriptor.sidebarLabel || "Filters",
        }),
        closeButton,
      ],
    }));
    drawer.appendChild(view.createElement("div", {
      className: "view-slideout-sidebar-body",
      children: renderSidebarPanels(descriptor, view, state),
    }));
    const main = view.createElement("section", {
      className: ["view-slideout-sidebar-main", "surface-main-panel"],
      attrs: { "aria-label": descriptor.pageHeader?.title || "Records" },
      children: [
        ...renderRegions(regionsForPlacement(descriptor.regions, "before-table"), view, state, state.selectedRecord),
        renderTableShell(descriptor.table, view, state),
        ...renderDetailShell(descriptor.detail, view, state),
      ].filter(Boolean),
    });

    trigger.setAttribute("aria-controls", drawerId);
    closeButton.setAttribute("aria-controls", drawerId);

    container.append(trigger, backdrop, drawer, main);
    wireSlideOutSidebar(state, { backdrop, closeButton, drawer, trigger });
    syncSlideOutSidebarState(state, { backdrop, closeButton, drawer, trigger }, { focus: false });

    return container;
  }

  function createSlideOutSidebarButton(view, options = {}) {
    let button = null;
    if (root.icons?.createIconButton) {
      try {
        button = root.icons.createIconButton({
          icon: options.icon,
          label: options.label,
          title: options.label,
        });
      } catch {
        button = null;
      }
    }
    if (!button) {
      button = view.createElement("button", {
        text: options.label || "Toggle sidebar",
        attrs: { type: "button" },
      });
    }
    button.classList.add(options.className);
    return button;
  }

  function wireSlideOutSidebar(state, elements) {
    const close = () => setSlideOutSidebarOpen(state, elements, false);
    const toggle = () => setSlideOutSidebarOpen(state, elements, !state.slideOutSidebarOpen);
    const closeOnEscape = (event) => {
      if (event?.key === "Escape" && state.slideOutSidebarOpen) {
        event.preventDefault?.();
        close();
      }
    };

    elements.trigger.addEventListener("click", toggle);
    elements.closeButton.addEventListener("click", close);
    elements.backdrop.addEventListener("click", close);
    elements.drawer.addEventListener("keydown", closeOnEscape);
    elements.trigger.addEventListener("keydown", closeOnEscape);
    elements.backdrop.addEventListener("keydown", closeOnEscape);
    elements.drawer.addEventListener("transitionend", () => {
      if (state.slideOutSidebarOpen) {
        focusSlideOutSidebar(elements.drawer);
      }
    });

    elements.trigger.setAttribute("data-view-slideout-sidebar-trigger", "");
    elements.closeButton.setAttribute("data-view-slideout-sidebar-close", "");
  }

  function setSlideOutSidebarOpen(state, elements, open) {
    state.slideOutSidebarOpen = Boolean(open);
    syncSlideOutSidebarState(state, elements, { focus: true });
  }

  function syncSlideOutSidebarState(state, elements, options = {}) {
    const open = Boolean(state.slideOutSidebarOpen);
    elements.trigger.setAttribute("aria-expanded", String(open));
    elements.trigger.setAttribute("aria-pressed", String(open));
    elements.closeButton.setAttribute("aria-expanded", String(open));
    elements.drawer.setAttribute("aria-hidden", String(!open));
    setElementHidden(elements.backdrop, !open);
    setElementClass(elements.drawer, "is-open", open);
    setElementClass(elements.backdrop, "is-open", open);
    setElementClass(global.document?.body, "view-slideout-sidebar-lock", open);

    if (options.focus !== false) {
      if (open) {
        focusSlideOutSidebar(elements.drawer);
      } else {
        elements.trigger.focus?.();
      }
    }
  }

  function setElementHidden(element, hidden) {
    if (!element) {
      return;
    }
    element.hidden = Boolean(hidden);
    if (hidden) {
      element.setAttribute?.("hidden", "");
    } else {
      element.removeAttribute?.("hidden");
    }
  }

  function setElementClass(element, className, active) {
    if (!element?.classList) {
      return;
    }
    if (typeof element.classList.toggle === "function") {
      element.classList.toggle(className, Boolean(active));
      return;
    }
    if (active) {
      element.classList.add(className);
    } else if (typeof element.classList.remove === "function") {
      element.classList.remove(className);
    }
  }

  function focusSlideOutSidebar(drawer) {
    const focusTarget = drawer?.querySelector?.("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") || drawer;
    focusTarget?.focus?.();
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

  function renderFilters(filters, view, state = null, options = {}) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return null;
    }

    const panel = view.createFilterPanel({
      title: options.title || "Filters",
      open: options.open === true,
      fields: filters.map((filter) => renderFieldShell(filter, view, { disabled: true })),
    });
    const fieldGrid = panel.querySelector(".view-filter-panel-fields");
    const form = renderFilterForm(filters, view, state, fieldGrid?.className || "view-filter-panel-fields");
    replaceNode(fieldGrid, form);

    return panel;
  }

  function renderFilterForm(filters, view, state = null, className = "view-filter-panel-fields") {
    const form = view.createElement("form", {
      className,
      attrs: {
        "data-view-filter-form": "",
      },
    });
    form.append(...filters.map((filter) => renderFieldShell(filter, view, {
      value: state ? state.filterValues?.[filter.field || filter.id] : undefined,
    })));

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
      queueFieldOptionSourceMounts(form, filters, state);
    }

    return form;
  }

  function queueFieldOptionSourceMounts(form, fields, state) {
    for (const field of (Array.isArray(fields) ? fields : [])) {
      if (!field?.optionsSource) {
        continue;
      }
      const controlId = field.field || field.id;
      if (!controlId) {
        continue;
      }
      const control = form.querySelector?.(`[data-view-input="${controlId}"]`);
      if (!control) {
        continue;
      }
      state.pendingMounts.push({
        control,
        field,
        mountType: "fieldOptions",
        region: {
          id: field.id || field.field,
          behavior: field.optionsSource,
        },
        selectedValue: state.filterValues?.[controlId] ?? field.default ?? control.value,
      });
    }
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

  function renderIndexPanel(indexPanel, view, state, options = {}) {
    if (!indexPanel) {
      return null;
    }

    return view.createCollapsibleIndexPanel({
      title: options.title || indexPanel.title || indexPanel.label || "Index",
      body: renderIndexPanelBody(indexPanel, view, state, options),
      open: state.indexCollapsed ? false : (options.open ?? indexPanel.open),
      className: options.className,
      footer: options.footer,
      footerClassName: options.footerClassName,
    });
  }

  function renderIndexPanelBody(indexPanel, view, state, options = {}) {
    const records = state.records || [];
    const title = options.title || indexPanel?.title || indexPanel?.label || "Index";
    return records.length > 0
      ? [view.createIndexList({
        ariaLabel: title,
        items: records.map((record) => buildIndexItem(indexPanel, record, state)),
      })]
      : [
        renderPlaceholder(
          indexPanel?.emptyState?.title || "No records",
          indexPanel?.emptyState,
          view,
        ),
      ];
  }

  function renderSidebarPanels(descriptor, view, state) {
    if (!Array.isArray(descriptor.sidebarPanels) || descriptor.sidebarPanels.length === 0) {
      return [
        renderFilters(descriptor.filters, view, state),
        descriptor.indexPanel
          ? renderIndexPanel(descriptor.indexPanel, view, state) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view)
          : null,
      ].filter(Boolean);
    }

    return descriptor.sidebarPanels
      .map((panel) => renderSidebarPanel(panel, descriptor, view, state))
      .filter(Boolean);
  }

  function renderSidebarPanel(panel, descriptor, view, state) {
    const panelType = panel.type || "navigation";
    if (!panel.id) {
      return null;
    }

    if (panelType === "filters") {
      return renderSidebarPanelShell(panel, view, {
        body: [renderFilterForm(descriptor.filters || [], view, state)],
        fallbackTitle: "Filters",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    if (panelType === "index") {
      if (!descriptor.indexPanel) {
        return null;
      }
      return renderSidebarPanelShell(panel, view, {
        body: renderIndexPanelBody(descriptor.indexPanel, view, state, {
          title: panel.title || panel.label,
        }),
        fallbackTitle: descriptor.indexPanel.title || descriptor.indexPanel.label || "Index",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    if (panelType === "navigation") {
      const body = [];
      if (panel.behavior) {
        const mountTarget = view.createElement("div", {
          className: "view-sidebar-panel-region",
          attrs: { "data-view-sidebar-panel-region": panel.id },
        });
        state.pendingMounts.push({ region: panel, container: mountTarget, record: state.selectedRecord });
        body.push(mountTarget);
      } else {
        body.push(renderPlaceholder(panel.title || panel.label || "Panel", panel.emptyState, view));
      }
      return renderSidebarPanelShell(panel, view, {
        body,
        fallbackTitle: "Navigation",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    return null;
  }

  function renderSidebarPanelShell(panel, view, options = {}) {
    const title = panel.title || panel.label || options.fallbackTitle || "Panel";
    const body = (Array.isArray(options.body) ? options.body : [options.body]).filter(Boolean);
    const footer = normalizeSidebarPanelFooter(options.footer);
    const className = [
      "view-sidebar-panel",
      panel.type ? `view-sidebar-panel--${panel.type}` : "",
      panel.className,
    ];
    const dataset = {
      viewSidebarPanel: panel.id,
      viewSidebarPanelType: panel.type || "navigation",
    };

    if (panel.collapsible === false) {
      const section = view.createElement("section", {
        className: [...className, "surface-main-panel"],
        dataset,
        attrs: panel.ariaLabel ? { "aria-label": panel.ariaLabel } : {},
      });
      section.appendChild(view.createElement("h3", {
        className: "view-sidebar-panel-title",
        text: title,
      }));
      section.appendChild(view.createElement("div", {
        className: "view-sidebar-panel-body",
        children: body,
      }));
      if (footer) {
        section.appendChild(view.createElement("div", {
          className: ["view-sidebar-panel-footer", "view-collapsible-index-footer"],
          children: footer,
        }));
      }
      return section;
    }

    const details = view.createCollapsibleIndexPanel({
      title,
      body,
      open: panel.open !== false,
      className: className.filter(Boolean).join(" "),
      ariaLabel: panel.ariaLabel,
      footer,
      footerClassName: "view-sidebar-panel-footer",
    });
    details.dataset.viewSidebarPanel = panel.id;
    details.dataset.viewSidebarPanelType = panel.type || "navigation";
    return details;
  }

  function renderSidebarPanelFooter(panel, view, state) {
    if (!panel.footer) {
      return [];
    }

    const footer = panel.footer;
    const children = [];
    const label = footer.title || footer.label || footer.description;
    if (label) {
      children.push(view.createElement("span", {
        className: "view-sidebar-panel-footer-text",
        text: label,
      }));
    }
    if (footer.behavior) {
      const footerRegion = {
        ...footer,
        id: footer.id || `${panel.id}-footer`,
      };
      const mountTarget = view.createElement("div", {
        className: "view-sidebar-panel-footer-region",
        attrs: { "data-view-sidebar-panel-footer": footerRegion.id },
      });
      state.pendingMounts.push({ region: footerRegion, container: mountTarget, record: state.selectedRecord });
      children.push(mountTarget);
    }
    return children;
  }

  function normalizeSidebarPanelFooter(footer) {
    if (!footer || (Array.isArray(footer) && footer.length === 0)) {
      return null;
    }
    return footer;
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
      depth: readDescriptorValue(record, indexPanel.itemDepthField, 0),
      parentId: readDescriptorValue(record, indexPanel.itemParentField, ""),
      path: readDescriptorValue(record, indexPanel.itemPathField, ""),
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
    const columns = tableColumns(table, view, state);
    return view.createDataTable({
      caption: table.title || "",
      hierarchy: table.hierarchy,
      columns,
      secondaryRows: tableSecondaryRows(table, view),
      rows: state.records || [],
      emptyMessage: emptyState.message || emptyState.description || emptyState.title || "No records found.",
    });
  }

  function tableColumns(table, view, state) {
    const columns = (table.columns || []).map((column) => ({
      key: column.field || column.id,
      label: column.label || column.field || column.id || "",
      align: column.align,
      header: column.header,
      render: tableColumnRenderer(column, table, view),
    }));
    const selection = tableSelection(table);
    if (selection) {
      columns.unshift({
        key: "__view_row_selection",
        label: selection.label || "Select",
        align: "center",
        render: (record) => renderRowSelection(selection, view, record),
      });
    }
    const rowActions = Array.isArray(table.rowActions) ? table.rowActions : [];
    if (rowActions.length > 0) {
      columns.push({
        key: "__view_row_actions",
        label: "Actions",
        align: "right",
        render: (record) => renderActions(rowActions, view, "Row actions", state, record),
      });
    }
    return columns;
  }

  function tableSecondaryRows(table, view) {
    return (Array.isArray(table.secondaryRows) ? table.secondaryRows : []).map((row) => ({
      id: row.id,
      className: row.className,
      startColumn: row.startColumn,
      endBeforeColumn: row.endBeforeColumn,
      hideWhenEmpty: row.hideWhenEmpty !== false,
      render: (record) => renderTableSecondaryRow(row, view, record),
    }));
  }

  function renderTableSecondaryRow(row, view, record) {
    const hasValue = descriptorHasValue(readDescriptorValue(record, row.chipsField || row.field || row.id, []));
    if (!hasValue && row.hideWhenEmpty !== false) {
      return null;
    }

    const body = row.formatter === "chip-list"
      ? renderChipList(row, view, record)
      : view.createElement("span", {
          className: "view-table-secondary-row-value",
          text: readDescriptorValue(record, row.field || row.id, ""),
        });
    const label = row.label || row.title || "";
    return view.createElement("div", {
      className: "view-table-secondary-row-content",
      children: [
        label ? view.createElement("span", { className: "view-table-secondary-row-label", text: label }) : null,
        body,
      ].filter(Boolean),
    });
  }

  function descriptorHasValue(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.some((item) => item !== null && item !== undefined && item !== false && item !== "");
  }

  function tableSelection(table = {}) {
    if (!table.selection || table.selection.enabled === false) {
      return null;
    }
    return table.selection;
  }

  function renderRowSelection(selection, view, record) {
    const id = recordId(record);
    const labelField = selection.labelField || "name";
    const recordLabel = readDescriptorValue(record, labelField, readDescriptorValue(record, "displayLabel", id));
    return view.createElement("input", {
      className: "view-row-select",
      attrs: {
        type: "checkbox",
        value: id,
        "aria-label": `${selection.label || "Select"} ${recordLabel || id}`.trim(),
        "data-view-row-select": "",
      },
      dataset: {
        viewRowSelectId: id,
        viewRowSelectType: selection.recordType || "",
      },
    });
  }

  function tableColumnRenderer(column = {}, table = {}, view) {
    if (column.formatter === "hierarchy-label") {
      return (record) => renderHierarchyLabel(column, table, view, record);
    }
    if (column.formatter === "chip-list") {
      return (record) => renderChipList(column, view, record);
    }
    return undefined;
  }

  function renderHierarchyLabel(column, table, view, record) {
    const value = readDescriptorValue(record, column.field || column.id, "");
    const depthField = column.depthField || table?.hierarchy?.depthField;
    const depth = normalizedHierarchyDepth(readDescriptorValue(record, depthField, 0));
    return view.createElement("span", {
      className: "view-hierarchy-label",
      text: value,
      attrs: depth > 0 ? { style: `--view-hierarchy-depth: ${depth};` } : {},
      dataset: depth > 0 ? { viewHierarchyDepth: depth } : {},
    });
  }

  function renderChipList(column, view, record) {
    const chips = readDescriptorValue(record, column.chipsField || column.field || column.id, []);
    const chipList = Array.isArray(chips) ? chips : [chips];
    return view.createElement("span", {
      className: ["view-table-chip-list", "surface-chip-row"],
      children: chipList
        .filter((chip) => chip !== null && chip !== undefined && chip !== false && chip !== "")
        .map((chip) => view.createElement("span", {
          className: "surface-chip",
          text: chipDisplayLabel(chip, column.chipLabelField),
        })),
    });
  }

  function chipDisplayLabel(chip, labelField) {
    if (chip && typeof chip === "object") {
      return String(readDescriptorValue(chip, labelField || "label", chip.name || chip.title || chip.value || chip.id || ""));
    }
    return String(chip ?? "");
  }

  function normalizedHierarchyDepth(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 12);
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
      detail.itemRows
        ? renderItemCollection(detail.itemRows, view, state) ||
          (!state.selectedRecord ? renderPlaceholder("Items", detail.itemRows.emptyState || detail.emptyState, view) : null)
        : null,
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
        if (mount.mountType === "fieldOptions") {
          setFieldOptionsError(mount.control, `Missing view behavior handler: ${mount.region.behavior}`);
        } else {
          mount.container.appendChild(state.view.createElement("p", {
            className: ["view-region-error", "view-status-message"],
            text: `Missing view behavior handler: ${mount.region.behavior}`,
            attrs: { role: "alert" },
          }));
        }
        continue;
      }
      try {
        const result = handler({
          action: null,
          api: root.api || {},
          container: mount.container,
          control: mount.control,
          field: mount.field,
          openModal: (modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
          record: mount.record,
          refresh: state.surface.refresh,
          region: mount.region,
          setOptions: (options) => setSelectOptions(mount.control, options, mount.selectedValue),
          workspaceContext: root.workspaceContext || {},
        });
        if (mount.mountType === "fieldOptions") {
          Promise.resolve(result)
            .then((options) => {
              if (Array.isArray(options)) {
                setSelectOptions(mount.control, options, mount.selectedValue);
              }
            })
            .catch((error) => setFieldOptionsError(mount.control, error?.message || "Options could not be loaded."));
        }
      } catch (error) {
        if (mount.mountType === "fieldOptions") {
          setFieldOptionsError(mount.control, error?.message || "Options could not be loaded.");
        } else {
          mount.container.appendChild(state.view.createElement("p", {
            className: ["view-region-error", "view-status-message"],
            text: error?.message || "Region could not be mounted.",
            attrs: { role: "alert" },
          }));
        }
      }
    }
  }

  function setSelectOptions(control, options = [], selectedValue = undefined) {
    if (!control || control.tagName !== "SELECT") {
      return;
    }
    const selected = selectedValue !== undefined && selectedValue !== null ? String(selectedValue) : control.value;
    const optionNodes = normalizeSelectOptions(options).map((option) => {
      const optionElement = document.createElement("option");
      optionElement.textContent = String(option.label ?? option.value ?? "");
      optionElement.value = String(option.value ?? "");
      if (option.selected) {
        optionElement.selected = true;
      }
      return optionElement;
    });
    control.replaceChildren(...optionNodes);
    if (selected && optionNodes.some((option) => option.value === selected)) {
      control.value = selected;
    }
    control.disabled = false;
    delete control.dataset.viewOptionsError;
  }

  function setFieldOptionsError(control, message) {
    if (!control || control.tagName !== "SELECT") {
      return;
    }
    if (!control.options.length) {
      const optionElement = document.createElement("option");
      optionElement.textContent = "Options unavailable";
      optionElement.value = "";
      control.appendChild(optionElement);
    }
    control.disabled = true;
    control.dataset.viewOptionsError = message || "Options unavailable.";
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

  function renderActions(actions, view, ariaLabel, state = null, recordOverride = undefined) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return null;
    }

    const visibleActions = recordOverride === undefined
      ? actions
      : actions.filter((action) => evaluateVisibleWhen(action.visibleWhen, recordOverride));
    if (visibleActions.length === 0) {
      return null;
    }

    return view.createDetailActionStrip({
      ariaLabel,
      actions: visibleActions.map((action) => normalizeAction(action, state, recordOverride)),
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
      hierarchy: tableDescriptor.hierarchy || options.hierarchy,
      columns: (tableDescriptor.columns || options.columns || []).map((column) => ({
        key: column.field || column.id || column.key,
        label: column.label || column.field || column.id || column.key || "",
        align: column.align,
        header: column.header,
        render: tableColumnRenderer(column, tableDescriptor, view),
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
      collapsible: options.collapsible,
      open: options.open,
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
          ...(field.optionsSource ? { "data-view-options-source": field.optionsSource } : {}),
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
    const normalized = {
      label: action.label || action.id || "Action",
      role: action.role,
      icon: action.icon,
      iconOnly: action.iconOnly === true,
      title: action.title || action.label || action.id || "Action",
      action: action.behavior || action.id,
      disabled: !state,
      onClick: state ? () => runDescriptorAction(action, state, recordOverride) : undefined,
    };
    if (action.iconOnly === true) {
      normalized.text = "";
    }
    return normalized;
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
    state.view.showModal(dialog);
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
