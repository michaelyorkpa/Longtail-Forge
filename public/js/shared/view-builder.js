(function attachViewBuilder(global) {
  const root = global.LongtailForge || {};
  let idCounter = 0;
  const modalStack = [];
  const modalEntries = new WeakMap();

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now()}-${idCounter}`;
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    addClasses(element, options.className);
    setAttributes(element, options.attrs);
    setDataset(element, options.dataset);

    if (options.id) {
      element.id = options.id;
    }

    if (options.text !== undefined && options.text !== null) {
      element.textContent = String(options.text);
    }

    if (options.hidden) {
      element.hidden = true;
    }

    appendChildren(element, options.children);
    return element;
  }

  function addClasses(element, className) {
    if (!className) {
      return element;
    }

    const classes = (Array.isArray(className) ? className : [className])
      .flatMap((name) => String(name || "").split(/\s+/));

    classes.filter(Boolean).forEach((name) => element.classList.add(name));
    return element;
  }

  function setAttributes(element, attrs = {}) {
    Object.entries(attrs || {}).forEach(([name, value]) => {
      if (value === false || value === null || value === undefined) {
        return;
      }

      if (value === true) {
        element.setAttribute(name, "");
      } else {
        element.setAttribute(name, String(value));
      }
    });
    return element;
  }

  function setDataset(element, dataset = {}) {
    Object.entries(dataset || {}).forEach(([name, value]) => {
      if (value !== null && value !== undefined) {
        element.dataset[name] = String(value);
      }
    });
    return element;
  }

  function appendChildren(parent, children) {
    if (children === null || children === undefined) {
      return parent;
    }

    const childList = Array.isArray(children) ? children : [children];
    childList.forEach((child) => appendChild(parent, child));
    return parent;
  }

  function appendChild(parent, child) {
    if (child === null || child === undefined || child === false) {
      return parent;
    }

    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (isNode(child)) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }

    return parent;
  }

  function replaceElementChildren(parent, children = []) {
    const childList = Array.isArray(children) ? children : [children];
    if (typeof parent.replaceChildren === "function") {
      parent.replaceChildren(...childList.filter((child) => child !== null && child !== undefined && child !== false));
      return parent;
    }

    parent.textContent = "";
    appendChildren(parent, childList);
    return parent;
  }

  function isNode(value) {
    return Boolean(value && typeof value === "object" && typeof value.nodeType === "number");
  }

  function createHeading(level, text, options = {}) {
    const safeLevel = Math.min(Math.max(Number(level) || 2, 1), 6);
    return createElement(`h${safeLevel}`, {
      ...options,
      text,
    });
  }

  function createPageHeader(options = {}) {
    const headingLevel = options.headingLevel || 1;
    const header = createElement("header", {
      className: ["view-page-header", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });
    const titleBlock = createElement("div", { className: "view-page-header-body" });
    const title = createHeading(headingLevel, requiredText(options.title, "Page headers require a title."), {
      className: "view-page-title",
    });

    titleBlock.appendChild(title);

    if (options.subtitle) {
      titleBlock.appendChild(createElement("p", {
        className: "view-page-subtitle",
        text: options.subtitle,
      }));
    }

    header.appendChild(titleBlock);

    const actions = normalizeActions(options.actions);
    if (actions.length) {
      header.appendChild(createDetailActionStrip({ actions, className: "view-page-header-actions" }));
    }

    return header;
  }

  function createStatusMessage(options = {}) {
    const tone = options.tone || "info";
    const role = options.role || (tone === "danger" || tone === "error" ? "alert" : "status");
    return createElement(options.tagName || "p", {
      className: ["view-status-message", "surface-main-panel", options.className],
      text: options.message || "",
      attrs: {
        role,
        "aria-live": options.live || (role === "alert" ? "assertive" : "polite"),
        "data-view-tone": tone,
      },
      hidden: options.hidden,
    });
  }

  function createEmptyState(options = {}) {
    const section = createElement("section", {
      className: ["view-empty-state", "surface-card", options.className],
      attrs: {
        role: options.role || "status",
        "aria-live": options.live || "polite",
      },
    });

    if (options.title) {
      section.appendChild(createHeading(options.headingLevel || 2, options.title, { className: "view-empty-state-title" }));
    }

    if (options.message) {
      section.appendChild(createElement("p", {
        className: "view-empty-state-message",
        text: options.message,
      }));
    }

    const actions = normalizeActions(options.actions);
    if (actions.length) {
      section.appendChild(createDetailActionStrip({ actions, className: "view-empty-state-actions" }));
    }

    return section;
  }

  function createFilterPanel(options = {}) {
    const panel = createElement("details", {
      className: ["view-filter-panel", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });

    if (options.open === true) {
      panel.open = true;
    }

    panel.appendChild(createElement("summary", {
      className: "view-filter-panel-title",
      text: options.title || "Filters",
    }));

    const fieldGrid = createFieldGrid({
      fields: options.fields || [],
      className: "view-filter-panel-fields",
    });
    panel.appendChild(fieldGrid);

    const actions = normalizeActions(options.actions);
    if (actions.length) {
      panel.appendChild(createDetailActionStrip({ actions, className: "view-filter-panel-actions" }));
    }

    return panel;
  }

  function createBulkActionToolbar(options = {}) {
    const selectedCount = Math.max(0, Number(options.selectedCount) || 0);
    const toolbar = createElement("details", {
      className: ["view-bulk-action-toolbar", "surface-main-panel", options.className],
      attrs: {
        "aria-label": options.ariaLabel || options.label || "Bulk actions",
        ...options.attrs,
      },
      dataset: options.dataset,
    });

    if (options.open === true) {
      toolbar.open = true;
    }

    const summary = createElement("summary", { className: "view-bulk-action-toolbar-summary" });
    const label = createElement("span", {
      className: "view-bulk-action-toolbar-title",
      text: options.label || "Bulk Actions",
    });
    const count = createElement("span", {
      className: ["view-bulk-action-toolbar-count", "surface-chip"],
      text: bulkSelectionCountText(selectedCount),
      attrs: {
        "aria-live": "polite",
        "data-view-bulk-selection-count": "",
      },
      hidden: selectedCount === 0,
    });
    const body = createElement("div", {
      className: ["view-bulk-action-toolbar-body", options.bodyClassName],
      children: options.body || [],
    });

    summary.append(label, count);
    toolbar.append(summary, body);
    assignViewParts(toolbar, { body, count, label, summary });
    return toolbar;
  }

  function createListShell(options = {}) {
    const shell = createElement(options.tagName || "div", {
      className: ["view-list-shell", options.className],
      attrs: {
        ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
        ...options.attrs,
      },
      dataset: options.dataset,
    });

    appendChildren(shell, options.before);
    appendChildren(shell, options.toolbar);

    let status = null;
    if (options.status !== false) {
      status = createElement(options.statusTagName || "p", {
        className: ["view-list-shell-status", options.statusClassName],
        text: options.statusMessage || "",
        attrs: {
          role: options.statusRole || "status",
          "aria-live": options.statusLive || "polite",
          ...options.statusAttrs,
        },
        dataset: options.statusDataset,
        hidden: options.statusHidden,
      });
      shell.appendChild(status);
    }

    appendChildren(shell, options.children);
    appendChildren(shell, options.after);
    assignViewParts(shell, { status });
    return shell;
  }

  function createCollapsibleIndexPanel(options = {}) {
    const details = createElement("details", {
      className: ["view-collapsible-index", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });

    if (options.open !== false) {
      details.open = true;
    }

    const summary = createElement("summary", {
      className: "view-collapsible-index-summary",
    });
    summary.appendChild(createElement("span", {
      className: "view-collapsible-index-title",
      text: requiredText(options.title, "Collapsible index panels require a title."),
    }));
    if (options.summaryActions) {
      summary.appendChild(createElement("span", {
        className: "view-collapsible-index-summary-actions",
        children: options.summaryActions,
      }));
    }
    details.appendChild(summary);

    details.appendChild(createElement("div", {
      className: "view-collapsible-index-body",
      children: options.children || options.body || [],
    }));

    if (hasChildren(options.footer)) {
      details.appendChild(createElement("div", {
        className: ["view-collapsible-index-footer", options.footerClassName],
        children: options.footer,
      }));
    }

    return details;
  }

  function hasChildren(children) {
    return children !== undefined && children !== null && (!Array.isArray(children) || children.length > 0);
  }

  function createIndexList(options = {}) {
    const list = createElement("ul", {
      className: ["view-index-list", options.className],
      attrs: {
        role: "list",
        ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
      },
    });

    const items = Array.isArray(options.items) ? options.items : [];
    items.forEach((item) => list.appendChild(createIndexListItem(item)));
    return list;
  }

  function createIndexListItem(item = {}) {
    const hierarchy = hierarchyMetadata(item);
    const listItem = createElement("li", {
      className: ["view-index-list-item", hierarchy.hasHierarchy ? "view-index-list-item--hierarchy" : ""],
      dataset: hierarchy.dataset,
    });
    const selected = Boolean(item.selected);
    const button = createElement("button", {
      className: ["view-index-list-button", selected ? "is-selected" : ""],
      attrs: {
        type: "button",
        "aria-current": selected ? "true" : false,
        style: hierarchy.style,
      },
      dataset: item.id !== undefined && item.id !== null ? { viewIndexId: String(item.id) } : {},
    });

    button.appendChild(createElement("span", {
      className: ["view-index-list-label", hierarchy.hasHierarchy ? "view-hierarchy-label" : ""],
      text: requiredText(item.label, "Index list items require a label."),
    }));

    const chips = (Array.isArray(item.chips) ? item.chips : [item.chips]).filter((chip) => chip !== null && chip !== undefined && chip !== false && chip !== "");
    if (chips.length) {
      button.appendChild(createElement("span", {
        className: ["view-index-list-chips", "surface-chip-row"],
        children: chips.map((chip) => (isNode(chip) ? chip : createElement("span", { className: "surface-chip", text: String(chip) }))),
      }));
    }

    const metaLines = (Array.isArray(item.meta) ? item.meta : [item.meta]).filter((line) => line !== null && line !== undefined && line !== false && line !== "");
    metaLines.forEach((line) => {
      button.appendChild(isNode(line) ? line : createElement("span", { className: "view-index-list-meta", text: String(line) }));
    });

    if (typeof item.onSelect === "function") {
      button.addEventListener("click", item.onSelect);
    }

    listItem.appendChild(button);
    return listItem;
  }

  function createSplitListDetail(options = {}) {
    const rootElement = createElement("div", {
      className: ["view-split-list-detail", options.className],
    });

    const listPanel = createElement("section", {
      className: ["view-split-list-detail-index", "surface-main-panel"],
      attrs: { "aria-label": options.listLabel || "List" },
      children: options.list || [],
    });
    const detailPanel = createElement("section", {
      className: ["view-split-list-detail-main", "surface-main-panel"],
      attrs: { "aria-label": options.detailLabel || "Detail" },
      children: options.detail || [],
    });

    rootElement.append(listPanel, detailPanel);
    return rootElement;
  }

  function createDataTable(options = {}) {
    const columns = Array.isArray(options.columns) ? options.columns : [];
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const secondaryRows = Array.isArray(options.secondaryRows) ? options.secondaryRows : [];
    const hierarchy = options.hierarchy && typeof options.hierarchy === "object" ? options.hierarchy : null;
    const wrapper = createElement("div", {
      className: ["view-table-wrap", options.className],
    });
    const table = createElement("table", {
      className: ["view-data-table", options.tableClassName],
    });
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const tbody = document.createElement("tbody");

    if (options.caption) {
      table.appendChild(createElement("caption", {
        className: "view-data-table-caption",
        text: options.caption,
      }));
    }

    columns.forEach((column) => {
      const th = createElement("th", {
        text: columnLabel(column),
        attrs: { scope: "col" },
      });
      const align = columnAlign(column);
      if (align) {
        th.dataset.align = align;
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    if (rows.length) {
      rows.forEach((row, rowIndex) => {
        tbody.appendChild(createDataRow(row, rowIndex, columns, hierarchy));
        secondaryRows.forEach((secondaryRow) => {
          const secondaryElement = createDataSecondaryRow(row, rowIndex, columns, secondaryRow);
          if (secondaryElement) {
            tbody.appendChild(secondaryElement);
          }
        });
      });
    } else {
      const emptyRow = document.createElement("tr");
      const emptyCell = createElement("td", {
        className: "view-data-table-empty",
        text: options.emptyMessage || "No records found.",
      });
      emptyCell.colSpan = Math.max(columns.length, 1);
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  function createDataRow(row, rowIndex, columns, hierarchy = null) {
    const metadata = rowHierarchyMetadata(row, hierarchy);
    const tr = createElement("tr", {
      className: metadata.hasHierarchy ? "view-data-table-row--hierarchy" : "",
      dataset: metadata.dataset,
    });

    columns.forEach((column) => {
      const cell = document.createElement(column.header ? "th" : "td");
      if (column.header) {
        cell.setAttribute("scope", "row");
      }

      const align = columnAlign(column);
      if (align) {
        cell.dataset.align = align;
      }

      appendChild(cell, renderCell(row, rowIndex, column));
      tr.appendChild(cell);
    });

    return tr;
  }

  function createDataSecondaryRow(row, rowIndex, columns, secondaryRow = {}) {
    const content = typeof secondaryRow.render === "function"
      ? secondaryRow.render(row, rowIndex)
      : secondaryRow.content;
    if ((content === null || content === undefined || content === false || content === "") && secondaryRow.hideWhenEmpty !== false) {
      return null;
    }

    const startIndex = normalizedColumnIndex(columns, secondaryRow.startColumn, 0);
    const endIndex = normalizedColumnIndex(columns, secondaryRow.endBeforeColumn, columns.length);
    const safeEndIndex = Math.max(startIndex + 1, endIndex);
    const tr = createElement("tr", {
      className: ["view-data-table-secondary-row", secondaryRow.className],
      attrs: {
        "data-view-table-secondary-row": secondaryRow.id || "",
      },
    });

    for (let index = 0; index < startIndex; index += 1) {
      tr.appendChild(createElement("td", {
        className: "view-data-table-secondary-spacer",
        attrs: { "aria-hidden": "true" },
      }));
    }

    const cell = createElement("td", {
      className: "view-data-table-secondary-cell",
      children: content,
    });
    cell.colSpan = Math.max(safeEndIndex - startIndex, 1);
    tr.appendChild(cell);

    for (let index = safeEndIndex; index < columns.length; index += 1) {
      tr.appendChild(createElement("td", {
        className: "view-data-table-secondary-spacer",
        attrs: { "aria-hidden": "true" },
      }));
    }

    return tr;
  }

  function normalizedColumnIndex(columns, key, fallback) {
    if (!key) {
      return fallback;
    }
    const index = columns.findIndex((column) => (column.key || column.id) === key);
    return index >= 0 ? index : fallback;
  }

  function createDetailBadgeRow(options = {}) {
    return createElement("div", {
      className: ["view-detail-badges", "surface-chip-row", options.className],
      attrs: {
        ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
        ...(options.attrs || {}),
      },
      dataset: options.dataset,
      children: normalizeDetailBadges(options.badges || options.items),
    });
  }

  function createDetailHeader(options = {}) {
    const header = createElement("header", {
      className: ["view-detail-header", options.className],
    });
    const body = createElement("div", { className: "view-detail-header-body" });
    body.appendChild(createHeading(options.headingLevel || 2, requiredText(options.title, "Detail headers require a title."), {
      className: "view-detail-title",
    }));

    if (options.meta) {
      body.appendChild(createElement("p", {
        className: "view-detail-meta",
        text: options.meta,
      }));
    }

    header.appendChild(body);

    if (options.badges) {
      header.appendChild(createDetailBadgeRow({ badges: options.badges }));
    }

    return header;
  }

  function createDetailActionStrip(options = {}) {
    return createElement("div", {
      className: ["view-detail-action-strip", "surface-dense-actions", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
      children: normalizeActions(options.actions),
    });
  }

  function createDetailActionMenu(options = {}) {
    const floating = options.floating !== false;
    const attrs = options.ariaLabel ? { "aria-label": options.ariaLabel } : {};
    if (floating) {
      attrs["data-view-floating-menu"] = "";
    }

    const menu = createElement("details", {
      className: ["view-detail-action-menu", "surface-dense-actions", options.className],
      attrs,
    });
    const summary = createElement("summary", {
      className: "view-detail-action-menu-summary",
      text: options.summaryLabel || "...",
      attrs: { title: options.title || options.ariaLabel || "Actions" },
    });
    const list = createElement("div", {
      className: "view-detail-action-menu-list",
      children: normalizeActions(options.actions),
    });
    menu.append(summary, list);
    if (floating) {
      wireFloatingDetailActionMenu(menu, summary, list);
    }
    return menu;
  }

  function wireFloatingDetailActionMenu(menu, summary, list) {
    const doc = menu.ownerDocument || document;
    const win = doc.defaultView || global;
    let listenersActive = false;

    const position = () => positionFloatingDetailActionMenu(menu, summary, list);
    const handlePointerDown = (event) => {
      if (!menu.contains(event.target)) {
        closeFloatingDetailActionMenu(menu, list);
      }
    };
    const handleKeydown = (event) => {
      if (event.key === "Escape" && menu.open) {
        event.preventDefault();
        closeFloatingDetailActionMenu(menu, list);
        summary.focus?.();
      }
    };
    const addListeners = () => {
      if (listenersActive) {
        return;
      }
      listenersActive = true;
      doc.addEventListener?.("pointerdown", handlePointerDown, true);
      doc.addEventListener?.("keydown", handleKeydown);
      win.addEventListener?.("resize", position);
      win.addEventListener?.("scroll", position, true);
    };
    const removeListeners = () => {
      if (!listenersActive) {
        return;
      }
      listenersActive = false;
      doc.removeEventListener?.("pointerdown", handlePointerDown, true);
      doc.removeEventListener?.("keydown", handleKeydown);
      win.removeEventListener?.("resize", position);
      win.removeEventListener?.("scroll", position, true);
    };

    menu.addEventListener("toggle", () => {
      if (menu.open) {
        closeOtherFloatingDetailActionMenus(menu);
        position();
        addListeners();
      } else {
        removeListeners();
        resetFloatingDetailActionMenu(menu, list);
      }
    });

    list.addEventListener("click", (event) => {
      if (event.target?.closest?.("button")) {
        closeFloatingDetailActionMenu(menu, list);
      }
    });
  }

  function closeOtherFloatingDetailActionMenus(currentMenu) {
    const doc = currentMenu.ownerDocument || document;
    if (typeof doc.querySelectorAll !== "function") {
      return;
    }
    doc.querySelectorAll(".view-detail-action-menu[data-view-floating-menu][open]").forEach((menu) => {
      if (menu !== currentMenu) {
        menu.open = false;
      }
    });
  }

  function closeFloatingDetailActionMenu(menu, list) {
    if (menu.open) {
      menu.open = false;
    }
    resetFloatingDetailActionMenu(menu, list);
  }

  function resetFloatingDetailActionMenu(menu, list) {
    menu.removeAttribute?.("data-view-floating-menu-positioned");
    menu.removeAttribute?.("data-view-floating-menu-placement");
    if (list.style?.removeProperty) {
      list.style.removeProperty("--view-action-menu-top");
      list.style.removeProperty("--view-action-menu-left");
      list.style.removeProperty("--view-action-menu-max-height");
    }
  }

  function positionFloatingDetailActionMenu(menu, summary, list) {
    if (!menu.open) {
      return;
    }
    if (typeof summary.getBoundingClientRect !== "function" || typeof list.getBoundingClientRect !== "function") {
      menu.setAttribute("data-view-floating-menu-positioned", "");
      return;
    }

    const doc = menu.ownerDocument || document;
    const win = doc.defaultView || global;
    const viewportWidth = win.innerWidth || doc.documentElement?.clientWidth || 1024;
    const viewportHeight = win.innerHeight || doc.documentElement?.clientHeight || 768;
    const margin = 8;
    const gap = 4;
    const summaryRect = summary.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const maxHeight = Math.max(120, viewportHeight - (margin * 2));
    const listWidth = Math.max(listRect.width || list.offsetWidth || 160, 140);
    const listHeight = Math.min(listRect.height || list.offsetHeight || maxHeight, maxHeight);
    const belowTop = summaryRect.bottom + gap;
    const belowSpace = viewportHeight - belowTop - margin;
    const aboveSpace = summaryRect.top - gap - margin;
    const placeAbove = listHeight > belowSpace && aboveSpace > belowSpace;
    const unclampedTop = placeAbove ? summaryRect.top - gap - listHeight : belowTop;
    const top = clampNumber(unclampedTop, margin, viewportHeight - margin - listHeight);
    const left = clampNumber(summaryRect.right - listWidth, margin, viewportWidth - margin - listWidth);

    list.style.setProperty("--view-action-menu-top", `${Math.round(top)}px`);
    list.style.setProperty("--view-action-menu-left", `${Math.round(left)}px`);
    list.style.setProperty("--view-action-menu-max-height", `${Math.round(maxHeight)}px`);
    menu.setAttribute("data-view-floating-menu-placement", placeAbove ? "above" : "below");
    menu.setAttribute("data-view-floating-menu-positioned", "");
  }

  function clampNumber(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function createInfoPanel(options = {}) {
    const panel = createElement(options.collapsible ? "details" : "section", {
      className: ["view-info-panel", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });
    if (options.collapsible && options.open) {
      panel.open = true;
    }

    if (options.title) {
      if (options.collapsible) {
        panel.appendChild(createElement("summary", { className: "view-info-panel-title", text: options.title }));
      } else {
        panel.appendChild(createHeading(options.headingLevel || 3, options.title, { className: "view-info-panel-title" }));
      }
    }

    if (options.message) {
      panel.appendChild(createElement("p", {
        className: "view-info-panel-message",
        text: options.message,
      }));
    }

    if (Array.isArray(options.items) && options.items.length) {
      const list = createElement("dl", { className: "view-info-list" });
      options.items.forEach((item) => {
        list.append(
          createElement("dt", { text: item.label || "" }),
          createElement("dd", { children: item.value || "" }),
        );
      });
      panel.appendChild(list);
    }

    const actions = normalizeActions(options.actions);
    if (actions.length) {
      panel.appendChild(createDetailActionStrip({ actions, className: "view-info-panel-actions" }));
    }

    return panel;
  }

  function modalSizeClass(size) {
    return size === "wide" ? "view-modal--wide" : "";
  }

  function registerModalStack(dialog, options = {}) {
    if (!dialog || typeof dialog.addEventListener !== "function") {
      throw new Error("Modal stack guardrails require a dialog element.");
    }

    const existingEntry = modalEntries.get(dialog);
    if (existingEntry) {
      updateModalStackEntry(existingEntry, options);
      return existingEntry;
    }

    const entry = {
      dialog,
      parent: normalizeModalParent(options.parent),
      returnFocus: options.returnFocus !== false,
      trigger: options.trigger || null,
    };
    modalEntries.set(dialog, entry);
    dialog.dataset.viewModalStack = "";

    dialog.addEventListener("cancel", (event) => {
      if (!isTopModal(dialog)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !isTopModal(dialog)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    dialog.addEventListener("close", () => {
      closeChildModals(dialog, "parent-closed");
      removeModalStackEntry(dialog);
      if (entry.returnFocus && entry.trigger && typeof entry.trigger.focus === "function" && entry.trigger.isConnected !== false) {
        entry.trigger.focus();
      }
    });

    return entry;
  }

  function updateModalStackEntry(entry, options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "parent")) {
      entry.parent = normalizeModalParent(options.parent);
    }
    if (options.trigger) {
      entry.trigger = options.trigger;
    }
    entry.returnFocus = options.returnFocus !== false;
  }

  function normalizeModalParent(parent) {
    return parent && parent.nodeType === 1 ? parent : null;
  }

  function defaultModalParent(dialog) {
    const top = modalStack[modalStack.length - 1]?.dialog || null;
    return top && top !== dialog ? top : null;
  }

  function isDialogOpen(dialog) {
    if (!dialog) {
      return false;
    }
    return Boolean(dialog.open || (typeof dialog.hasAttribute === "function" && dialog.hasAttribute("open")));
  }

  function pushModalStackEntry(entry) {
    removeModalStackEntry(entry.dialog, { sync: false });
    modalStack.push(entry);
    syncModalStackMetadata();
  }

  function removeModalStackEntry(dialog, options = {}) {
    const index = modalStack.findIndex((entry) => entry.dialog === dialog);
    if (index >= 0) {
      modalStack.splice(index, 1);
    }
    if (options.sync !== false) {
      syncModalStackMetadata();
    }
  }

  function syncModalStackMetadata() {
    modalStack.forEach((entry, index) => {
      entry.dialog.dataset.viewModalStackLevel = String(index + 1);
      if (index === modalStack.length - 1) {
        entry.dialog.dataset.viewModalStackTop = "true";
      } else {
        delete entry.dialog.dataset.viewModalStackTop;
      }
    });
  }

  function showModal(dialog, options = {}) {
    const parent = Object.prototype.hasOwnProperty.call(options, "parent")
      ? normalizeModalParent(options.parent)
      : defaultModalParent(dialog);
    const entry = registerModalStack(dialog, { ...options, parent });
    entry.trigger = options.trigger || entry.trigger || global.document?.activeElement || null;
    entry.parent = parent;
    pushModalStackEntry(entry);

    if (!isDialogOpen(dialog)) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
        dialog.open = true;
      }
    }

    return dialog;
  }

  function closeModal(dialog, value = "") {
    if (!dialog) {
      return;
    }

    closeChildModals(dialog, "parent-closed");
    if (isDialogOpen(dialog)) {
      if (typeof dialog.close === "function") {
        dialog.close(value);
      } else {
        dialog.removeAttribute?.("open");
        dialog.open = false;
        removeModalStackEntry(dialog);
      }
      return;
    }

    removeModalStackEntry(dialog);
  }

  function closeChildModals(parent, value = "parent-closed") {
    if (!parent) {
      return;
    }

    [...modalStack]
      .reverse()
      .filter((entry) => entry.parent === parent)
      .forEach((entry) => closeModal(entry.dialog, value));
  }

  function isTopModal(dialog) {
    return Boolean(dialog && modalStack[modalStack.length - 1]?.dialog === dialog);
  }

  function createModal(options = {}) {
    const dialog = createElement("dialog", {
      className: ["view-modal", "surface-modal", modalSizeClass(options.size), options.className],
      attrs: {
        role: "dialog",
        "aria-modal": "true",
      },
    });
    const titleId = options.titleId || nextId("view-modal-title");
    const title = createHeading(options.headingLevel || 2, requiredText(options.title, "Modals require a title."), {
      id: titleId,
      className: "view-modal-title",
    });
    const body = createElement("div", {
      className: "view-modal-body",
      children: options.body || [],
    });

    dialog.setAttribute("aria-labelledby", titleId);
    dialog.append(title, body);

    const actions = normalizeActions(options.actions);
    let footer = null;
    if (actions.length || options.footer) {
      footer = createModalFooter({ actions, children: options.footer });
      dialog.appendChild(footer);
    }

    assignViewParts(dialog, { title, body, footer });
    return dialog;
  }

  function createModalForm(options = {}) {
    const dialog = createElement("dialog", {
      className: ["view-modal", "surface-modal", modalSizeClass(options.size), options.className],
      attrs: {
        role: "dialog",
        "aria-modal": "true",
      },
    });
    const form = createElement("form", {
      className: ["view-modal-form", options.formClassName],
      attrs: {
        method: options.method || "dialog",
      },
    });
    const titleId = options.titleId || nextId("view-modal-form-title");
    const title = createHeading(options.headingLevel || 2, requiredText(options.title, "Modal forms require a title."), {
      id: titleId,
      className: "view-modal-title",
    });
    const body = createFieldGrid({
      fields: options.fields || options.body || [],
      className: "view-modal-form-fields",
    });
    const footer = createModalFooter({ actions: normalizeActions(options.actions), utilityActions: options.utilityActions });

    dialog.setAttribute("aria-labelledby", titleId);
    form.append(title, body, footer);
    dialog.appendChild(form);
    assignViewParts(dialog, { form, title, body, footer });
    return dialog;
  }

  function createModalFooter(options = {}) {
    const footer = createElement("div", {
      className: ["view-modal-footer", "surface-modal-footer", options.className],
      children: options.children || [],
    });
    const utilityActions = normalizeActions(options.utilityActions);
    if (utilityActions.length) {
      footer.appendChild(createElement("div", {
        className: ["surface-modal-footer-group", "surface-modal-footer-utilities"],
        attrs: { "data-modal-footer-group": "utility" },
        children: utilityActions,
      }));
    }
    const actions = normalizeActions(options.actions);
    if (actions.length) {
      footer.appendChild(createElement("div", {
        className: ["surface-modal-footer-group", "surface-modal-footer-commit"],
        attrs: { "data-modal-footer-group": "commit" },
        children: actions,
      }));
    }
    return footer;
  }

  function createFieldGrid(options = {}) {
    return createElement("div", {
      className: ["view-field-grid", options.surface === false ? "" : "surface-modal-section-body", options.className],
      children: options.fields || options.children || [],
    });
  }

  function createInlineActionRow(options = {}) {
    return createElement("div", {
      className: ["view-inline-action-row", "surface-dense-actions", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
      children: [...(Array.isArray(options.children) ? options.children : []), ...normalizeActions(options.actions)],
    });
  }

  function createLinkedContextPicker(options = {}) {
    const readonly = Boolean(options.readonly || options.disabled || options.permissionDisabled);
    const providerOptions = normalizePickerOptions(options.targets || options.providers || []);
    const recordOptions = normalizePickerRecords(options.records || options.recordOptions || []);
    const picker = createElement("section", {
      className: ["view-linked-context-picker", readonly ? "is-readonly" : "", options.className],
      attrs: {
        "aria-label": options.ariaLabel || "Linked Context picker",
        "data-view-readonly": readonly ? "true" : "false",
      },
    });
    const rows = createElement("div", {
      className: "view-linked-context-picker-list",
      attrs: {
        role: "list",
        "aria-label": options.rowsLabel || "Selected linked context",
      },
    });
    const empty = createElement("p", {
      className: "view-linked-context-picker-empty",
      text: options.emptyMessage || "No linked context selected.",
    });
    const targetSelect = createElement("select", {
      className: "view-linked-context-picker-target",
      attrs: { name: options.targetName || "linkedContextTarget" },
    });
    const searchInput = createElement("input", {
      className: "view-linked-context-picker-search",
      attrs: {
        type: "search",
        name: options.searchName || "linkedContextSearch",
        placeholder: options.searchPlaceholder || "Search linked context",
        autocomplete: "off",
      },
    });
    const recordSelect = createElement("select", {
      className: "view-linked-context-picker-record",
      attrs: { name: options.recordName || "linkedContextRecord" },
    });
    const useTargetButton = createActionButton({
      icon: "add",
      label: options.useTargetLabel || "Use Target",
      action: options.useTargetAction || "use-linked-context-target",
      disabled: readonly || Boolean(options.useTargetDisabled),
      onClick: options.onUseTarget,
    });
    const renderLinkedItems = (items = []) => renderLinkedContextRows(rows, items, {
      empty,
      readonly,
      removeLabel: options.removeLabel,
      removeAction: options.removeAction,
      onRemove: options.onRemove,
    });
    const setTargets = (targets = []) => {
      replaceElementChildren(targetSelect, normalizePickerOptions(targets).map((target) => createPickerOption(target)));
    };
    const setRecords = (records = []) => {
      const normalizedRecords = normalizePickerRecords(records);
      replaceElementChildren(recordSelect, normalizedRecords.length
        ? normalizedRecords.map((record) => createPickerOption({
            value: record.targetId,
            label: record.displayLabel,
            disabled: record.disabled || record.isAvailable === false,
            selected: record.selected,
            title: record.title || record.fullLabel || record.ariaLabel || "",
            ariaLabel: record.ariaLabel || record.title || record.fullLabel || "",
            dataset: {
              moduleId: record.moduleId,
              targetType: record.targetType,
              targetId: record.targetId,
              sourceUrl: record.sourceUrl,
              secondaryLabel: record.secondaryLabel,
            },
          }))
        : [createPickerOption({ value: "", label: options.noRecordsLabel || "No records found", disabled: true })]);
    };
    const setReadonly = (isReadonly) => {
      const nextReadonly = Boolean(isReadonly);
      if (nextReadonly) {
        picker.classList.add("is-readonly");
      } else {
        picker.classList.remove("is-readonly");
      }
      picker.setAttribute("data-view-readonly", nextReadonly ? "true" : "false");
      [targetSelect, searchInput, recordSelect, useTargetButton].forEach((control) => {
        control.disabled = nextReadonly;
      });
    };

    renderLinkedItems(options.linkedItems || options.rows || []);
    setTargets(providerOptions);
    setRecords(recordOptions);

    [targetSelect, searchInput, recordSelect].forEach((control) => {
      if (readonly) {
        control.disabled = true;
      }
    });

    if (typeof options.onTargetChange === "function") {
      targetSelect.addEventListener("change", options.onTargetChange);
    }
    if (typeof options.onSearchInput === "function") {
      searchInput.addEventListener("input", options.onSearchInput);
    }
    if (typeof options.onRecordChange === "function") {
      recordSelect.addEventListener("change", options.onRecordChange);
    }

    const controls = createFieldGrid({
      surface: false,
      className: "view-linked-context-picker-controls",
      fields: [
        createLinkedContextPickerField({ label: options.targetLabel || "Target", control: targetSelect, width: "narrow" }),
        createLinkedContextPickerField({ label: options.searchLabel || "Search", control: searchInput, width: "wide" }),
        createLinkedContextPickerField({ label: options.recordLabel || "Record", control: recordSelect, width: "wide" }),
        useTargetButton,
      ],
    });

    picker.append(rows, controls);

    if (readonly) {
      picker.appendChild(createElement("p", {
        className: "view-linked-context-picker-state",
        text: options.permissionMessage || options.readonlyMessage || "Linked context is read-only.",
      }));
    }

    assignViewParts(picker, {
      rows,
      empty,
      controls,
      targetSelect,
      searchInput,
      recordSelect,
      useTargetButton,
      setLinkedItems: renderLinkedItems,
      setRecords,
      setTargets,
      setReadonly,
    });
    return picker;
  }

  function createLinkedContextList(options = {}) {
    const rows = createElement("div", {
      className: ["view-linked-context-picker-list", options.className],
      attrs: {
        role: "list",
        "aria-label": options.ariaLabel || options.rowsLabel || "Linked context",
      },
    });
    const empty = createElement("p", {
      className: "view-linked-context-picker-empty",
      text: options.emptyMessage || "No linked context selected.",
    });

    renderLinkedContextRows(rows, options.items || options.records || options.linkedItems || options.rows || [], {
      empty,
      readonly: Boolean(options.readonly || options.disabled || options.permissionDisabled),
      removeLabel: options.removeLabel,
      removeAction: options.removeAction,
      onRemove: options.onRemove,
    });

    assignViewParts(rows, {
      empty,
      setLinkedItems: (items = []) => renderLinkedContextRows(rows, items, {
        empty,
        readonly: Boolean(options.readonly || options.disabled || options.permissionDisabled),
        removeLabel: options.removeLabel,
        removeAction: options.removeAction,
        onRemove: options.onRemove,
      }),
    });
    return rows;
  }

  function renderLinkedContextRows(rows, items = [], options = {}) {
    const normalizedItems = normalizePickerRecords(items);
    replaceElementChildren(rows, normalizedItems.map((item) => (
      createLinkedContextPickerRow(item, {
        readonly: options.readonly,
        removeLabel: options.removeLabel,
        removeAction: options.removeAction,
        onRemove: options.onRemove,
      })
    )));
    if (!normalizedItems.length && options.empty) {
      rows.appendChild(options.empty);
    }
    return rows;
  }

  function createLinkedContextPickerField(options = {}) {
    const control = options.control;
    const id = control.id || nextId("view-linked-context-picker-field");
    control.id = id;
    return createElement("label", {
      className: "view-linked-context-picker-field",
      attrs: { "data-view-field-width": options.width || "default", for: id },
      children: [
        createElement("span", { className: "view-linked-context-picker-field-label", text: options.label }),
        control,
      ],
    });
  }

  function createLinkedContextPickerRow(item, options = {}) {
    const fullLabel = item.title || item.fullLabel || item.ariaLabel || item.displayLabel;
    const title = createElement(item.sourceUrl ? "a" : "span", {
      className: "view-linked-context-picker-row-label",
      text: item.displayLabel,
      attrs: {
        ...(item.sourceUrl ? { href: item.sourceUrl } : {}),
        ...(fullLabel ? { title: fullLabel, "aria-label": fullLabel } : {}),
      },
    });
    const row = createElement("div", {
      className: [
        "view-linked-context-picker-row",
        item.isAvailable === false ? "is-unavailable" : "",
        item.className,
      ],
      attrs: { role: "listitem" },
      dataset: {
        moduleId: item.moduleId,
        targetType: item.targetType,
        targetId: item.targetId,
        sourceUrl: item.sourceUrl,
      },
    });
    const body = createElement("div", {
      className: "view-linked-context-picker-row-body",
      children: [title],
    });

    if (item.secondaryLabel) {
      body.appendChild(createElement("span", {
        className: "view-linked-context-picker-row-secondary",
        text: item.secondaryLabel,
      }));
    }

    if (item.hintLabel) {
      body.appendChild(createElement("span", {
        className: "view-linked-context-picker-row-hint",
        text: item.hintLabel,
      }));
    }

    row.appendChild(body);

    if (item.removable !== false) {
      const removeButton = createActionButton({
        icon: "delete",
        iconOnly: true,
        label: options.removeLabel || "Remove linked context",
        action: options.removeAction || "remove-linked-context",
        disabled: options.readonly || item.disabled || item.isAvailable === false,
        onClick: typeof options.onRemove === "function" ? (event) => options.onRemove(item, event) : undefined,
      });
      row.appendChild(createElement("div", {
        className: "view-linked-context-picker-row-actions",
        children: removeButton,
      }));
    }

    return row;
  }

  function normalizePickerOptions(options) {
    return (Array.isArray(options) ? options : [options]).filter(Boolean).map((option) => {
      if (typeof option === "string") {
        return {
          value: option,
          label: option,
        };
      }

      const value = option.value || option.targetType || option.id || "";
      return {
        value,
        label: pickerLabel(option.displayLabel || option.label || option.name, value || "Target"),
        disabled: option.disabled || option.isAvailable === false,
        selected: option.selected,
        dataset: {
          moduleId: option.moduleId,
          targetType: option.targetType || value,
          providerId: option.providerId || option.provider || option.id,
        },
      };
    });
  }

  function normalizePickerRecords(records) {
    return (Array.isArray(records) ? records : [records]).filter(Boolean).map((record) => ({
      ...record,
      moduleId: record.moduleId || "",
      targetType: record.targetType || record.type || "",
      targetId: record.targetId || record.value || record.id || "",
      displayLabel: pickerLabel(record.displayLabel || record.label || record.name, "Unavailable linked context"),
      secondaryLabel: pickerOptionalLabel(record.secondaryLabel || record.summary || record.meta),
      sourceUrl: record.sourceUrl || "",
      title: pickerOptionalLabel(record.title || record.fullLabel || record.ariaLabel),
      fullLabel: pickerOptionalLabel(record.fullLabel || record.title || record.ariaLabel),
      ariaLabel: pickerOptionalLabel(record.ariaLabel || record.title || record.fullLabel),
      isAvailable: record.isAvailable !== false,
    }));
  }

  function createPickerOption(option) {
    const title = pickerOptionalLabel(option.title || option.ariaLabel);
    const element = createElement("option", {
      text: option.label,
      attrs: {
        value: option.value,
        ...(title ? { title, "aria-label": pickerOptionalLabel(option.ariaLabel) || title } : {}),
      },
      dataset: option.dataset,
    });
    element.value = option.value;
    element.disabled = Boolean(option.disabled);
    element.selected = Boolean(option.selected);
    return element;
  }

  function pickerLabel(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function pickerOptionalLabel(value) {
    return String(value || "").trim();
  }

  function createActionButton(options = {}) {
    const label = String(options.label || options.ariaLabel || options.text || "").trim();
    const text = options.text === undefined ? label : String(options.text || "").trim();

    if (!label && !text) {
      throw new Error("View action buttons require visible text or an accessible label.");
    }

    let button = null;
    if (options.icon && root.icons?.createIconButton) {
      button = root.icons.createIconButton({
        icon: options.icon,
        label,
        text,
        title: options.title || label,
        type: options.type || "button",
        variant: options.variant,
        iconOnly: options.iconOnly,
      });
    } else {
      button = document.createElement("button");
      button.type = options.type || "button";
      button.textContent = text || label;
      button.classList.add("action-button");
    }

    button.type = options.type || button.type || "button";
    button.classList.add("view-action-button");
    addClasses(button, options.className);

    if (!text && label) {
      button.setAttribute("aria-label", label);
      button.title = options.title || label;
    } else if (options.ariaLabel) {
      button.setAttribute("aria-label", options.ariaLabel);
    }

    if (options.title) {
      button.title = options.title;
    }

    if (options.disabled) {
      button.disabled = true;
    }

    if (options.action) {
      button.dataset.surfaceAction = options.action;
    }

    const role = options.role || options.actionRole;
    if (role) {
      button.dataset.surfaceActionRole = role;
    }

    if (typeof options.onClick === "function") {
      button.addEventListener("click", options.onClick);
    }

    return button;
  }

  function normalizeActions(actions) {
    if (!actions) {
      return [];
    }

    return (Array.isArray(actions) ? actions : [actions]).map((action) => {
      if (isNode(action)) {
        return action;
      }
      return createActionButton(action);
    });
  }

  function normalizeDetailBadges(badges) {
    if (!badges) {
      return [];
    }

    return (Array.isArray(badges) ? badges : [badges])
      .filter((badge) => badge !== null && badge !== undefined && badge !== false && badge !== "")
      .map((badge) => {
        if (isNode(badge)) {
          return badge;
        }
        if (typeof badge === "object") {
          return createDetailBadge(badge);
        }
        return createElement("span", {
          className: "surface-chip",
          text: String(badge),
        });
      });
  }

  function createDetailBadge(badge = {}) {
    const text = badge.text ?? detailBadgeText(badge);
    return createElement("span", {
      className: ["surface-chip", badge.className],
      text,
      attrs: {
        ...(text ? { title: badge.title || text } : {}),
        ...(badge.focusable ? { tabindex: "0" } : {}),
        ...(badge.attrs || {}),
      },
      dataset: badge.dataset,
    });
  }

  function detailBadgeText(badge = {}) {
    const label = badge.label === null || badge.label === undefined ? "" : String(badge.label).trim();
    const value = badge.value === null || badge.value === undefined ? "" : String(badge.value).trim();
    if (label && value) {
      return `${label}: ${value}`;
    }
    return label || value;
  }

  function renderCell(row, rowIndex, column) {
    if (typeof column.render === "function") {
      return column.render(row, rowIndex);
    }

    const key = column.key || column.field;
    return key ? row?.[key] ?? "" : "";
  }

  function columnLabel(column) {
    return typeof column === "string" ? column : column.label || column.header || column.key || "";
  }

  function columnAlign(column) {
    return typeof column === "string" ? "" : column.align || "";
  }

  function hierarchyMetadata(item = {}) {
    const depth = normalizedDepth(item.depth ?? item.hierarchyDepth);
    const parent = item.parentId ?? item.hierarchyParent;
    const path = item.path ?? item.hierarchyPath;
    const dataset = {};
    if (depth > 0) {
      dataset.viewHierarchyDepth = depth;
    }
    if (parent !== undefined && parent !== null && parent !== "") {
      dataset.viewHierarchyParent = parent;
    }
    if (path !== undefined && path !== null && path !== "") {
      dataset.viewHierarchyPath = Array.isArray(path) ? path.join("/") : path;
    }
    const hasHierarchy = Object.keys(dataset).length > 0;
    return {
      dataset,
      hasHierarchy,
      style: depth > 0 ? `--view-hierarchy-depth: ${depth};` : "",
    };
  }

  function rowHierarchyMetadata(row = {}, hierarchy = null) {
    if (!hierarchy) {
      return { dataset: {}, hasHierarchy: false };
    }
    return hierarchyMetadata({
      depth: readRowValue(row, hierarchy.depthField),
      parentId: readRowValue(row, hierarchy.parentField),
      path: readRowValue(row, hierarchy.pathField),
    });
  }

  function normalizedDepth(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 12);
  }

  function readRowValue(row, fieldName) {
    if (!fieldName || !row || typeof row !== "object") {
      return undefined;
    }
    return String(fieldName).split(".").reduce((value, key) => (
      value === undefined || value === null ? undefined : value[key]
    ), row);
  }

  function requiredText(value, message) {
    const text = String(value || "").trim();
    if (!text) {
      throw new Error(message);
    }
    return text;
  }

  function bulkSelectionCountText(count) {
    return `${count} selected`;
  }

  function assignViewParts(element, parts) {
    Object.defineProperty(element, "viewParts", {
      configurable: true,
      enumerable: false,
      value: Object.freeze(parts),
    });
  }

  root.view = Object.freeze({
    createActionButton,
    createBulkActionToolbar,
    createCollapsibleIndexPanel,
    createDataTable,
    createDetailActionMenu,
    createDetailActionStrip,
    createDetailBadgeRow,
    createDetailHeader,
    createElement,
    createEmptyState,
    createFieldGrid,
    createFilterPanel,
    createIndexList,
    createInfoPanel,
    createInlineActionRow,
    createLinkedContextList,
    createLinkedContextPicker,
    createListShell,
    createModal,
    createModalForm,
    closeChildModals,
    closeModal,
    createPageHeader,
    createSplitListDetail,
    createStatusMessage,
    isTopModal,
    showModal,
  });

  global.LongtailForge = root;
})(window);
