(function attachViewBuilder(global) {
  const root = global.LongtailForge || {};
  let idCounter = 0;

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
    const panel = createElement("section", {
      className: ["view-filter-panel", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });

    if (options.title) {
      panel.appendChild(createHeading(options.headingLevel || 2, options.title, { className: "view-filter-panel-title" }));
    }

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

  function createCollapsibleIndexPanel(options = {}) {
    const details = createElement("details", {
      className: ["view-collapsible-index", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });

    if (options.open !== false) {
      details.open = true;
    }

    details.appendChild(createElement("summary", {
      className: "view-collapsible-index-summary",
      text: requiredText(options.title, "Collapsible index panels require a title."),
    }));

    details.appendChild(createElement("div", {
      className: "view-collapsible-index-body",
      children: options.children || options.body || [],
    }));

    return details;
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
        tbody.appendChild(createDataRow(row, rowIndex, columns));
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

  function createDataRow(row, rowIndex, columns) {
    const tr = document.createElement("tr");

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
      header.appendChild(createElement("div", {
        className: ["view-detail-badges", "surface-chip-row"],
        children: options.badges,
      }));
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

  function createInfoPanel(options = {}) {
    const panel = createElement("section", {
      className: ["view-info-panel", "surface-main-panel", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
    });

    if (options.title) {
      panel.appendChild(createHeading(options.headingLevel || 3, options.title, { className: "view-info-panel-title" }));
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

  function createModal(options = {}) {
    const dialog = createElement("dialog", {
      className: ["view-modal", "surface-modal", options.className],
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
      className: ["view-modal", "surface-modal", options.className],
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
    const footer = createModalFooter({ actions: normalizeActions(options.actions) });

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

  function requiredText(value, message) {
    const text = String(value || "").trim();
    if (!text) {
      throw new Error(message);
    }
    return text;
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
    createCollapsibleIndexPanel,
    createDataTable,
    createDetailActionStrip,
    createDetailHeader,
    createElement,
    createEmptyState,
    createFieldGrid,
    createFilterPanel,
    createInfoPanel,
    createInlineActionRow,
    createModal,
    createModalForm,
    createPageHeader,
    createSplitListDetail,
    createStatusMessage,
  });

  global.LongtailForge = root;
})(window);
