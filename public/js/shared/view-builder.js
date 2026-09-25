(function attachViewBuilder(global) {
  // 0.33.33.35.3 moved the modal stack - which dialogs are open, which is on top, parentage,
  // and focus return - into LongtailForge.viewModalStack. This file still publishes showModal,
  // closeModal, closeChildModals, and isTopModal on the frozen view factory and delegates each
  // there, so the factory's writer list and member sets are untouched. The modal constructors
  // stay here because they are built from this file's element factory.
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewModalStack} BrowserViewModalStack */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewAttributeBag} BrowserViewAttributeBag */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewElementOptions} BrowserViewElementOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldControl} BrowserViewFieldControl */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldMessageOptions} BrowserViewFieldMessageOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldOptions} BrowserViewFieldOptions */

  /**
   * A field descriptor as this factory reads one.
   *
   * `createField` is published taking `unknown`, which withheld the shape **from callers**; the
   * framework's own `ViewFieldDescriptor` is what a contributor writes, and every member is
   * optional here because the factory answers a fallback for each absent one. Three members are
   * read that the framework descriptor does not declare - `checked`, `spellcheck` and `value` -
   * and they are named `unknown` as **findings for the descriptor's owner**, not repaired here.
   * @typedef {Partial<import("../../../src/types/framework-contracts.js").ViewFieldDescriptor> & { checked?: unknown, spellcheck?: unknown, value?: unknown }} FieldDescriptor
   */

  /**
   * The bag `createField` hands its control builders: the caller's own options plus the values
   * it resolved first. Neither is published, because nothing outside this file calls either
   * builder - and they differ, because the radio path resolves no single control type.
   * @typedef {BrowserViewFieldOptions & { fieldId: string, fieldKey: string }} FieldBuilderOptions
   */

  /** @typedef {FieldBuilderOptions & { fieldType: string }} FieldControlOptions */

  /**
   * A modal's footer, which is built here rather than published.
   *
   * `createModalFooter` is internal - the factory publishes the modals that use it, not the
   * footer itself - so its bag is named locally rather than pulled from a contract that does
   * not exist.
   * @typedef {object} ModalFooterOptions
   * @property {import("../../../src/types/browser-contracts.js").BrowserViewActionInput} [actions]
   * @property {unknown} [children]
   * @property {unknown} [className]
   * @property {import("../../../src/types/browser-contracts.js").BrowserViewActionInput} [utilityActions]
   */

  /**
   * One column, as the table builder reads it.
   *
   * `BrowserViewDataTableOptions` takes its columns as `readonly unknown[]`, and the renderer
   * that feeds this builder assembles them itself - so this names what the builder reads rather
   * than restating any framework descriptor. A column may also be a plain string, which the two
   * label readers handle before they reach these members.
   * @typedef {object} DataTableColumn
   * @property {unknown} [align]
   * @property {unknown} [field]
   * @property {unknown} [header]
   * @property {unknown} [id]
   * @property {unknown} [key]
   * @property {unknown} [label]
   * @property {(row: unknown, rowIndex: number) => unknown} [render]
   */

  /**
   * One secondary row, which spans a range of the columns beneath its record.
   * @typedef {object} DataTableSecondaryRow
   * @property {unknown} [className]
   * @property {unknown} [content]
   * @property {unknown} [endBeforeColumn]
   * @property {unknown} [hideWhenEmpty]
   * @property {unknown} [id]
   * @property {unknown} [startColumn]
   * @property {(row: unknown, rowIndex: number) => unknown} [render]
   */

  /**
   * A detail badge, as the badge builders read one.
   *
   * `BrowserViewDetailBadgeRowOptions` takes its badges as `readonly unknown[]`, so this names
   * what the builder actually reads off one. Every member is `unknown` because a badge arrives
   * from a page controller rather than from a contract.
   * @typedef {object} DetailBadge
   * @property {Record<string, unknown>} [attrs]
   * @property {unknown} [className]
   * @property {Record<string, unknown>} [dataset]
   * @property {unknown} [focusable]
   * @property {unknown} [label]
   * @property {unknown} [text]
   * @property {unknown} [title]
   * @property {unknown} [value]
   */

  /**
   * One term and definition in an info panel's list.
   * @typedef {object} InfoPanelItem
   * @property {unknown} [label]
   * @property {unknown} [value]
   */

  /**
   * The linked-context shapes this file owns.
   *
   * The two published option bags take their lists as `readonly unknown[]`, so the normalizers
   * are what give the pickers a shape at all - and `ReturnType` names it from the writer rather
   * than restating it, which is what keeps the two from drifting.
   * @typedef {ReturnType<typeof normalizePickerOptions>[number]} PickerOption
   */

  /** @typedef {ReturnType<typeof normalizePickerRecords>[number]} PickerRecord */

  /**
   * What `createPickerOption` accepts: the normalizers' own output, and the two literals the
   * record list builds for a selected record and for its empty placeholder.
   * @typedef {object} PickerOptionInput
   * @property {unknown} [ariaLabel]
   * @property {Record<string, unknown>} [dataset]
   * @property {unknown} [disabled]
   * @property {unknown} [label]
   * @property {unknown} [selected]
   * @property {unknown} [title]
   * @property {unknown} [value]
   */

  /**
   * How a linked-context row is rendered. `empty` is the placeholder the row list appends when
   * nothing survives normalization, which is why only the list carries it.
   * @typedef {object} LinkedContextRowOptions
   * @property {unknown} [readonly]
   * @property {unknown} [removeAction]
   * @property {unknown} [removeLabel]
   * @property {(item: unknown, event?: unknown) => unknown} [onRemove]
   */

  /** @typedef {LinkedContextRowOptions & { empty?: HTMLElement }} LinkedContextRowsOptions */

  /**
   * One labelled control in the picker's field grid. The control is required and is always one
   * this file just built, which is why it is an element rather than something to be proved.
   * @typedef {object} LinkedContextPickerField
   * @property {HTMLElement} control
   * @property {unknown} [label]
   * @property {unknown} [width]
   */

  /**
   * One row of an index list, as this factory reads one.
   *
   * `BrowserViewIndexListOptions.items` is published as `readonly unknown[]`, which withheld the
   * shape **from callers**; naming it inside the implementation is what lets the row builder be
   * typed. Every member is optional because the builder answers a fallback for each absent one,
   * and each is `unknown` because a row arrives from a page controller rather than from a
   * contract - except `onSelect`, which is only ever handed to `addEventListener`.
   * @typedef {object} IndexListItem
   * @property {unknown} [chips]
   * @property {unknown} [depth]
   * @property {unknown} [hierarchyDepth]
   * @property {unknown} [hierarchyParent]
   * @property {unknown} [hierarchyPath]
   * @property {unknown} [id]
   * @property {unknown} [label]
   * @property {unknown} [meta]
   * @property {unknown} [parentId]
   * @property {unknown} [path]
   * @property {unknown} [selected]
   * @property {EventListener} [onSelect]
   */

  /**
   * One option after `normalizeFieldOptions` has flattened the three spellings it accepts.
   * @typedef {ReturnType<typeof normalizeFieldOptions>[number]} NormalizedFieldOption
   */

  /**
   * A control `collectFieldValues` reads a value off.
   *
   * The query answers `Element`, which is the honest type for a selector. The seven members
   * below are **optional additions, not claims**: `dataset` and `name` exist on the HTML
   * controls this factory builds but not on every `Element`, and `checked`, `multiple`,
   * `selectedOptions`, `type` and `value` exist only on the control subtypes. Each is read for
   * truthiness, compared to a string, or coerced, so a match without one behaves exactly as it
   * does today. `[data-view-input]` is written only by `createFieldControl` and
   * `createRadioControls`, so in practice every match is a `BrowserViewFieldControl`.
   * @typedef {Element & {
   *   checked?: unknown,
   *   dataset?: Record<string, unknown>,
   *   disabled?: unknown,
   *   multiple?: unknown,
   *   name?: unknown,
   *   selectedOptions?: ArrayLike<{ value?: unknown }>,
   *   type?: unknown,
   *   value?: unknown,
   * }} FieldValueControl
   */

  const root = global.LongtailForge || {};
  let idCounter = 0;

  /** @param {string} prefix */
  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now()}-${idCounter}`;
  }

  /**
   * The element factory.
   *
   * Overloaded exactly as its published member is, and for the reason the contract already gives:
   * the body is `document.createElement(tagName)`, so a known tag name really does produce its
   * own subtype. A flat `HTMLElement` here would be **weaker than the runtime** and would hide
   * `.value`, `.selected` and `.checked` from this file's own callers - it also costs eight
   * diagnostics rather than closing nine.
   * @template {keyof HTMLElementTagNameMap} TagName
   * @overload
   * @param {TagName} tagName
   * @param {BrowserViewElementOptions} [options]
   * @returns {HTMLElementTagNameMap[TagName]}
   */
  /**
   * @overload
   * @param {string} tagName
   * @param {BrowserViewElementOptions} [options]
   * @returns {HTMLElement}
   */
  /**
   * @param {string} tagName
   * @param {BrowserViewElementOptions} [options]
   * @returns {HTMLElement}
   */
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

  /**
   * @param {FieldDescriptor} [field]
   * @param {BrowserViewFieldOptions} [options]
   */
  function createField(field = {}, options = {}) {
    const fieldKey = String(field.field || field.id || "").trim();
    const labelText = String(field.label || fieldKey || "Field");
    const fieldType = normalizeFieldType(field.type);
    const fieldId = String(options.controlId || "").trim() || nextId("view-field");
    const shellTag = fieldType === "radio" ? "fieldset" : "label";
    const shell = createElement(shellTag, {
      className: [
        "view-renderer-field",
        fieldType === "boolean" || fieldType === "switch" ? "inline-option" : "",
        fieldType === "switch" ? "view-renderer-field-switch" : "",
        options.className,
      ],
      attrs: {
        "data-view-field": fieldKey,
        "data-view-field-type": fieldType,
        ...(field.width ? { "data-view-field-width": field.width } : {}),
      },
      dataset: options.dataset,
      hidden: field.hidden,
    });
    const label = createElement(fieldType === "radio" ? "legend" : "span", {
      className: "view-renderer-field-label",
      text: labelText,
    });

    if (fieldType === "radio") {
      const controls = createRadioControls(field, {
        ...options,
        fieldId,
        fieldKey,
      });
      shell.append(label, ...controls.map((entry) => entry.label));
      const messageChannel = createFieldMessage(fieldId, controls.map((entry) => entry.control), options);
      shell.appendChild(messageChannel.message);
      assignViewParts(shell, {
        control: controls[0]?.control || null,
        controls: controls.map((entry) => entry.control),
        label,
        message: messageChannel.message,
        setMessage: messageChannel.setMessage,
      });
      return shell;
    }

    const control = createFieldControl(field, {
      ...options,
      fieldId,
      fieldKey,
      fieldType,
    });
    label.setAttribute("for", fieldId);
    if (fieldType === "boolean" || fieldType === "switch") {
      shell.append(control, label);
    } else {
      shell.append(label, control);
    }
    const messageChannel = createFieldMessage(fieldId, [control], options);
    shell.appendChild(messageChannel.message);
    assignViewParts(shell, {
      control,
      controls: [control],
      label,
      message: messageChannel.message,
      setMessage: messageChannel.setMessage,
    });
    return shell;
  }

  /**
   * @param {string} fieldId
   * @param {readonly Element[]} controls
   * @param {BrowserViewFieldOptions} [options]
   */
  function createFieldMessage(fieldId, controls, options = {}) {
    const messageId = `${fieldId}-message`;
    const message = createElement("span", {
      id: messageId,
      className: ["view-renderer-field-message", options.messageClassName],
      attrs: {
        role: "status",
        "aria-live": "polite",
        "data-view-field-message": "",
      },
      hidden: true,
    });

    /**
     * @param {unknown} value
     * @param {BrowserViewFieldMessageOptions} [messageOptions]
     */
    const setMessage = (value, messageOptions = {}) => {
      const text = String(value ?? "").trim();
      const invalid = Boolean(messageOptions.invalid);
      const tone = String(messageOptions.tone || (invalid ? "error" : "info"));
      message.textContent = text;
      message.hidden = !text;
      message.dataset.viewFieldMessageTone = tone;
      message.setAttribute("role", invalid ? "alert" : "status");
      for (const control of controls) {
        control.setAttribute("aria-invalid", invalid ? "true" : "false");
        const describedBy = new Set(String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
        if (text) {
          describedBy.add(messageId);
        } else {
          describedBy.delete(messageId);
        }
        if (describedBy.size) {
          control.setAttribute("aria-describedby", [...describedBy].join(" "));
        } else {
          control.removeAttribute?.("aria-describedby");
        }
      }
    };

    setMessage(options.message, {
      invalid: options.invalid,
      tone: options.messageTone,
    });
    return { message, setMessage };
  }

  /**
   * @param {FieldDescriptor} field
   * @param {FieldControlOptions} options
   * @returns {BrowserViewFieldControl}
   */
  function createFieldControl(field, options) {
    const commonAttrs = {
      id: options.fieldId,
      name: options.fieldKey,
      disabled: options.disabled,
      required: field.required,
      "data-view-input": options.fieldKey,
      ...(field.optionsSource ? { "data-view-options-source": field.optionsSource } : {}),
      ...(options.controlAttrs || {}),
    };

    if (options.fieldType === "select" || options.fieldType === "multi-select") {
      const control = createElement("select", {
        className: options.controlClassName,
        attrs: {
          ...commonAttrs,
          multiple: options.fieldType === "multi-select",
        },
        dataset: options.controlDataset,
      });
      const hasBoundValue = options.value !== undefined && options.value !== null;
      const hasConfiguredValue = hasBoundValue || field.default !== undefined && field.default !== null;
      const selectedValues = options.fieldType === "multi-select"
        ? new Set(normalizeFieldValues(hasBoundValue ? options.value : field.default))
        : null;
      for (const option of normalizeFieldOptions(field.options)) {
        const optionElement = createElement("option", {
          text: option.label,
          attrs: {
            value: option.value,
            disabled: option.disabled,
          },
        });
        optionElement.selected = selectedValues
          ? selectedValues.has(String(option.value)) || (!hasConfiguredValue && option.selected)
          : option.selected;
        control.appendChild(optionElement);
      }
      if (!selectedValues) {
        const value = hasBoundValue ? options.value : field.default;
        if (value !== undefined && value !== null) {
          control.value = String(value);
        }
      }
      return control;
    }

    const tagName = options.fieldType === "textarea" ? "textarea" : "input";
    const inputType = inputTypeForField(options.fieldType);
    /** @type {BrowserViewFieldControl & { checked?: unknown }} */
    const control = createElement(tagName, {
      className: [
        options.fieldType === "switch" ? "view-field-switch-control" : "",
        options.controlClassName,
      ],
      attrs: {
        ...commonAttrs,
        type: inputType,
        role: options.fieldType === "switch" ? "switch" : undefined,
        hidden: field.hidden,
        min: field.min,
        max: field.max,
        step: field.step,
        inputmode: field.inputmode,
        rows: field.rows,
        spellcheck: field.spellcheck,
        autocomplete: field.autocomplete,
        placeholder: field.placeholder,
      },
      dataset: options.controlDataset,
    });
    const value = options.value !== undefined ? options.value : field.default;
    if (inputType === "checkbox") {
      control.value = String(field.value ?? "true");
      control.checked = normalizeCheckedValue(value !== undefined ? value : field.checked);
    } else {
      control.value = value === undefined || value === null ? "" : String(value);
    }
    return control;
  }

  /**
   * @param {FieldDescriptor} field
   * @param {FieldBuilderOptions} options
   */
  function createRadioControls(field, options) {
    const hasBoundValue = options.value !== undefined && options.value !== null;
    const selectedValue = hasBoundValue ? String(options.value) : field.default === undefined ? "" : String(field.default);
    return normalizeFieldOptions(field.options).map((option, index) => {
      const optionId = `${options.fieldId}-${index + 1}`;
      const control = createElement("input", {
        className: options.controlClassName,
        attrs: {
          id: optionId,
          name: options.fieldKey,
          type: "radio",
          value: option.value,
          disabled: options.disabled || option.disabled,
          required: field.required,
          "data-view-input": options.fieldKey,
          ...(field.optionsSource ? { "data-view-options-source": field.optionsSource } : {}),
          ...(options.controlAttrs || {}),
        },
        dataset: options.controlDataset,
      });
      control.checked = selectedValue
        ? selectedValue === String(option.value)
        : !hasBoundValue && option.selected;
      const optionLabel = createElement("label", {
        className: "inline-option view-field-radio-option",
        attrs: { for: optionId },
        children: [control, createElement("span", { text: option.label })],
      });
      return { control, label: optionLabel };
    });
  }

  /** @param {unknown} type */
  function normalizeFieldType(type) {
    const value = String(type || "text").trim().toLowerCase();
    if (value === "boolean" || value === "checkbox") {
      return value;
    }
    if (value === "toggle" || value === "switch") {
      return "switch";
    }
    if (value === "radio") {
      return "radio";
    }
    if (["select", "multi-select", "textarea", "number", "date", "time"].includes(value)) {
      return value;
    }
    return value || "text";
  }

  /** @param {string} type */
  function inputTypeForField(type) {
    if (["number", "date", "time", "checkbox", "boolean"].includes(type)) {
      return type === "boolean" ? "checkbox" : type;
    }
    if (type === "switch") {
      return "checkbox";
    }
    return "text";
  }

  /** @param {unknown} [options] */
  function normalizeFieldOptions(options = []) {
    if (!Array.isArray(options)) {
      return [];
    }
    return options.map((option) => {
      if (Array.isArray(option)) {
        return {
          value: option[0] ?? "",
          label: option[1] ?? option[0] ?? "",
          selected: Boolean(option[2]),
          disabled: Boolean(option[3]),
        };
      }
      if (option && typeof option === "object") {
        const value = option.value ?? option.id ?? "";
        return {
          value,
          label: option.label ?? option.text ?? value,
          selected: Boolean(option.selected || option.default),
          disabled: Boolean(option.disabled),
        };
      }
      return { value: option ?? "", label: option ?? "", selected: false, disabled: false };
    });
  }

  /** @param {unknown} value */
  function normalizeFieldValues(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.map((item) => String(item));
  }

  /** @param {unknown} value */
  function normalizeCheckedValue(value) {
    if (typeof value === "string") {
      return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
  }

  /**
   * Read every bound control inside a scope.
   *
   * **The guard proves the method, not the type.** `scope` is an element at every call site and
   * is declared as one here; the published member keeps `unknown`, because a caller is not
   * obliged to know what this file requires, and the runtime check is unchanged.
   * @param {Element | null | undefined} scope
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewCollectFieldValuesOptions} [options]
   * @returns {Record<string, unknown>}
   */
  function collectFieldValues(scope, options = {}) {
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return {};
    }

    /** @type {Record<string, unknown>} */
    const payload = {};
    /** @type {FieldValueControl[]} */
    const controls = Array.from(scope.querySelectorAll("[data-view-input]"));
    const collectedRadioFields = new Set();
    for (const control of controls) {
      const fieldKey = String(control.dataset?.viewInput || control.name || "").trim();
      if (!fieldKey || (control.disabled && !options.includeDisabled)) {
        continue;
      }
      if (control.type === "radio") {
        if (collectedRadioFields.has(fieldKey)) {
          continue;
        }
        collectedRadioFields.add(fieldKey);
        const selected = controls.find((candidate) => (
          String(candidate.dataset?.viewInput || candidate.name || "").trim() === fieldKey
          && candidate.type === "radio"
          && candidate.checked
          && (!candidate.disabled || options.includeDisabled)
        ));
        payload[fieldKey] = selected?.value || "";
        continue;
      }
      if (control.type === "checkbox") {
        payload[fieldKey] = Boolean(control.checked);
      } else if (control.multiple) {
        payload[fieldKey] = Array.from(control.selectedOptions || [], (option) => option.value);
      } else if (control.type === "number") {
        payload[fieldKey] = Number(control.value);
      } else {
        payload[fieldKey] = control.value;
      }
    }
    return payload;
  }

  /**
   * @template {Element} Target
   * @param {Target} element
   * @param {unknown} className
   * @returns {Target}
   */
  function addClasses(element, className) {
    if (!className) {
      return element;
    }

    const classes = (Array.isArray(className) ? className : [className])
      .flatMap((name) => String(name || "").split(/\s+/));

    classes.filter(Boolean).forEach((name) => element.classList.add(name));
    return element;
  }

  /**
   * @template {Element} Target
   * @param {Target} element
   * @param {BrowserViewAttributeBag | null} [attrs]
   * @returns {Target}
   */
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

  /**
   * @template {HTMLElement} Target
   * @param {Target} element
   * @param {BrowserViewAttributeBag | null} [dataset]
   * @returns {Target}
   */
  function setDataset(element, dataset = {}) {
    Object.entries(dataset || {}).forEach(([name, value]) => {
      if (value !== null && value !== undefined) {
        element.dataset[name] = String(value);
      }
    });
    return element;
  }

  /**
   * @template {Node} Parent
   * @param {Parent} parent
   * @param {unknown} children
   * @returns {Parent}
   */
  function appendChildren(parent, children) {
    if (children === null || children === undefined) {
      return parent;
    }

    const childList = Array.isArray(children) ? children : [children];
    childList.forEach((child) => appendChild(parent, child));
    return parent;
  }

  /**
   * @template {Node} Parent
   * @param {Parent} parent
   * @param {unknown} child
   * @returns {Parent}
   */
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

  /**
   * @template {Element} Parent
   * @param {Parent} parent
   * @param {unknown} [children]
   * @returns {Parent}
   */
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

  /** @param {unknown} value @returns {value is Node} */
  function isNode(value) {
    return Boolean(value && typeof value === "object" && "nodeType" in value && typeof value.nodeType === "number");
  }

  /**
   * @param {unknown} level
   * @param {unknown} text
   * @param {BrowserViewElementOptions} [options]
   */
  function createHeading(level, text, options = {}) {
    const safeLevel = Math.min(Math.max(Number(level) || 2, 1), 6);
    return createElement(`h${safeLevel}`, {
      ...options,
      text,
    });
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewPageHeaderOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewStatusMessageOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewEmptyStateOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewFilterPanelOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewBulkActionToolbarOptions} [options] */
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
    partsByKind.bulkActionToolbar.set(toolbar, toolbar.viewParts);
    return toolbar;
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewListShellOptions} [options] */
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

    /** @type {HTMLElement | null} */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewCollapsibleIndexPanelOptions} [options] */
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

  /** @param {unknown} children */
  function hasChildren(children) {
    return children !== undefined && children !== null && (!Array.isArray(children) || children.length > 0);
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewIndexListOptions} [options] */
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

  /** @param {IndexListItem} [item] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewSplitListDetailOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewDataTableOptions} [options] */
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
        // The native dataset setter performs ToString; a column may carry any alignment value.
        th.dataset.align = String(align);
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

  /**
   * @param {unknown} row
   * @param {number} rowIndex
   * @param {readonly unknown[]} columns
   * @param {unknown} [hierarchy]
   */
  function createDataRow(row, rowIndex, columns, hierarchy = null) {
    const metadata = rowHierarchyMetadata(row, hierarchy);
    const tr = createElement("tr", {
      className: metadata.hasHierarchy ? "view-data-table-row--hierarchy" : "",
      dataset: metadata.dataset,
    });

    columns.forEach((column) => {
      const fields = dataTableColumnFields(column);
      const cell = document.createElement(fields.header ? "th" : "td");
      if (fields.header) {
        cell.setAttribute("scope", "row");
      }

      const align = columnAlign(column);
      if (align) {
        cell.dataset.align = String(align);
      }

      appendChild(cell, renderCell(row, rowIndex, column));
      tr.appendChild(cell);
    });

    return tr;
  }

  /**
   * @param {unknown} row
   * @param {number} rowIndex
   * @param {readonly unknown[]} columns
   * @param {unknown} [secondaryRow]
   */
  function createDataSecondaryRow(row, rowIndex, columns, secondaryRow = {}) {
    const definition = dataTableSecondaryRowFields(secondaryRow);
    const content = typeof definition.render === "function"
      ? definition.render(row, rowIndex)
      : definition.content;
    if ((content === null || content === undefined || content === false || content === "") && definition.hideWhenEmpty !== false) {
      return null;
    }

    const startIndex = normalizedColumnIndex(columns, definition.startColumn, 0);
    const endIndex = normalizedColumnIndex(columns, definition.endBeforeColumn, columns.length);
    const safeEndIndex = Math.max(startIndex + 1, endIndex);
    const tr = createElement("tr", {
      className: ["view-data-table-secondary-row", definition.className],
      attrs: {
        "data-view-table-secondary-row": definition.id || "",
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

  /**
   * @param {readonly unknown[]} columns
   * @param {unknown} key
   * @param {number} fallback
   * @returns {number}
   */
  function normalizedColumnIndex(columns, key, fallback) {
    if (!key) {
      return fallback;
    }
    const index = columns.findIndex((column) => {
      const fields = dataTableColumnFields(column);
      return (fields.key || fields.id) === key;
    });
    return index >= 0 ? index : fallback;
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailBadgeRowOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailHeaderOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailActionStripOptions} [options] */
  function createDetailActionStrip(options = {}) {
    return createElement("div", {
      className: ["view-detail-action-strip", "surface-dense-actions", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
      children: normalizeActions(options.actions),
    });
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailActionMenuOptions} [options] */
  function createDetailActionMenu(options = {}) {
    const floating = options.floating !== false;
    /** @type {import("../../../src/types/browser-contracts.js").BrowserViewAttributeBag} */
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

  /**
   * Wire a floating action menu's open/close behaviour.
   *
   * `Event.target` is an `EventTarget`, which carries neither `contains`'s `Node` nor `closest`.
   * The keydown handler reads only the key; the click handler names its target
   * `Partial<Element>`, which its optional chaining already assumed. The pointer handler is the one
   * that hands its target to a native method, so `0.33.33.39.23` narrows it there - see below.
   * @param {HTMLDetailsElement} menu
   * @param {HTMLElement} summary
   * @param {HTMLElement} list
   */
  function wireFloatingDetailActionMenu(menu, summary, list) {
    const doc = menu.ownerDocument || document;
    const win = doc.defaultView || global;
    let listenersActive = false;

    const position = () => positionFloatingDetailActionMenu(menu, summary, list);
    // `contains` takes `Node | null`. Only nodes in this document's tree reach its capture
    // listener, so this narrows rather than filters: a node of any kind passes through - an
    // element, an SVG element or a text node - and so does one created in another document's
    // realm, because `isNode` asks for a numeric `nodeType` rather than a realm's `Node`
    // constructor. `null` and `undefined` still reach `contains`, which reads both as null and
    // answers "outside", so they still close the menu. Anything else was never a node, and it
    // fails here with a message rather than inside `contains` - never as an inside or outside click.
    const handlePointerDown = (/** @type {Event} */ event) => {
      const target = event.target;
      if (target != null && !isNode(target)) {
        throw new TypeError("A floating action menu can only test a Node pointer target.");
      }
      if (!menu.contains(target)) {
        closeFloatingDetailActionMenu(menu, list);
      }
    };
    const handleKeydown = (/** @type {KeyboardEvent} */ event) => {
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
      // The click target may be an element, which is exactly what the optional chaining below
      // already says. `Partial<Element>` names that without asserting it, and without adding a
      // check this handler has never made.
      /** @type {Partial<Element> | null} */
      const target = event.target;
      if (target?.closest?.("button")) {
        closeFloatingDetailActionMenu(menu, list);
      }
    });
  }

  /** @param {HTMLElement} currentMenu */
  function closeOtherFloatingDetailActionMenus(currentMenu) {
    const doc = currentMenu.ownerDocument || document;
    if (typeof doc.querySelectorAll !== "function") {
      return;
    }
    /** @type {NodeListOf<HTMLDetailsElement>} */
    const openMenus = doc.querySelectorAll(".view-detail-action-menu[data-view-floating-menu][open]");
    openMenus.forEach((menu) => {
      if (menu !== currentMenu) {
        menu.open = false;
      }
    });
  }

  /** @param {HTMLDetailsElement} menu @param {HTMLElement} list */
  function closeFloatingDetailActionMenu(menu, list) {
    if (menu.open) {
      menu.open = false;
    }
    resetFloatingDetailActionMenu(menu, list);
  }

  /** @param {HTMLElement} menu @param {HTMLElement} list */
  function resetFloatingDetailActionMenu(menu, list) {
    menu.removeAttribute?.("data-view-floating-menu-positioned");
    menu.removeAttribute?.("data-view-floating-menu-placement");
    if (list.style?.removeProperty) {
      list.style.removeProperty("--view-action-menu-top");
      list.style.removeProperty("--view-action-menu-left");
      list.style.removeProperty("--view-action-menu-max-height");
    }
  }

  /**
   * @param {HTMLDetailsElement} menu
   * @param {HTMLElement} summary
   * @param {HTMLElement} list
   */
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

  /** @param {number} value @param {number} min @param {number} max */
  function clampNumber(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewInfoPanelOptions} [options] */
  function createInfoPanel(options = {}) {
    // The tag depends on an option, so the element is a union and `open` belongs to only one
    // half of it. The member is named optional rather than proved, because the guard that
    // establishes it reads `options.collapsible` rather than the element.
    /** @type {HTMLElement & { open?: boolean }} */
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
        const entry = infoPanelItemFields(item);
        list.append(
          createElement("dt", { text: entry.label || "" }),
          createElement("dd", { children: entry.value || "" }),
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

  /** @param {unknown} size */
  function modalSizeClass(size) {
    return size === "wide" ? "view-modal--wide" : "";
  }

  /** @returns {BrowserViewModalStack} */
  function requireModalStack() {
    const modalStack = root.viewModalStack;
    if (typeof modalStack?.showModal !== "function") {
      throw new Error("View modals require LongtailForge.viewModalStack.");
    }
    return modalStack;
  }

  /**
   * The four published modal-stack members. Their implementation lives in
   * LongtailForge.viewModalStack since 0.33.33.35.3; this file keeps publishing them so the
   * frozen view factory keeps exactly the writers and members it has always had.
   * @param {unknown} dialog
   * @param {import("../../../src/types/browser-contracts.js").BrowserModalStackOptions} [options]
   * @returns {unknown}
   */
  function showModal(dialog, options = {}) {
    return requireModalStack().showModal(dialog, options);
  }

  /**
   * @param {unknown} dialog
   * @param {string} [value]
   * @returns {void}
   */
  function closeModal(dialog, value = "") {
    requireModalStack().closeModal(dialog, value);
  }

  /**
   * @param {unknown} parent
   * @param {string} [value]
   * @returns {void}
   */
  function closeChildModals(parent, value = "parent-closed") {
    requireModalStack().closeChildModals(parent, value);
  }

  /**
   * @param {unknown} dialog
   * @returns {boolean}
   */
  function isTopModal(dialog) {
    return requireModalStack().isTopModal(dialog);
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewModalOptions} [options] */
  function createModal(options = {}) {
    const dialog = createElement("dialog", {
      className: ["view-modal", "surface-modal", modalSizeClass(options.size), options.className],
      attrs: {
        role: "dialog",
        "aria-modal": "true",
      },
    });
    const titleId = String(options.titleId || nextId("view-modal-title"));
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewModalFormOptions} [options] */
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
    const titleId = String(options.titleId || nextId("view-modal-form-title"));
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

  /** @param {ModalFooterOptions} [options] */
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

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewFieldGridOptions} [options] */
  function createFieldGrid(options = {}) {
    const fields = options.fields || options.children || [];
    const grid = createElement("div", {
      className: ["view-field-grid", options.surface === false ? "" : "surface-modal-section-body", options.className],
      attrs: options.editable === undefined ? {} : { "data-view-editable": options.editable ? "true" : "false" },
      dataset: options.dataset,
      children: fields,
    });
    const fieldElements = Array.isArray(fields) ? fields : [fields];
    assignViewParts(grid, {
      collectValues: (collectOptions = {}) => collectFieldValues(grid, collectOptions),
      controls: fieldElements.flatMap((field) => field?.viewParts?.controls || []),
      fields: fieldElements,
    });
    return grid;
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewInlineActionRowOptions} [options] */
  function createInlineActionRow(options = {}) {
    return createElement("div", {
      className: ["view-inline-action-row", "surface-dense-actions", options.className],
      attrs: options.ariaLabel ? { "aria-label": options.ariaLabel } : {},
      children: [...(Array.isArray(options.children) ? options.children : []), ...normalizeActions(options.actions)],
    });
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewLinkedContextPickerOptions} [options] */
  function createLinkedContextPicker(options = {}) {
    const readonly = Boolean(options.readonly || options.disabled || options.permissionDisabled);
    const clientContextOptions = normalizePickerOptions(options.clientContexts || options.clientContextOptions || []);
    const showClientContext = Boolean(options.showClientContext || clientContextOptions.length);
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
    const clientContextSelect = createElement("select", {
      className: "view-linked-context-picker-client",
      attrs: { name: options.clientContextName || "linkedContextClient" },
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
    /** @type {HTMLElement | null} */
    let clientContextField = null;
    const renderLinkedItems = (/** @type {readonly unknown[]} */ items = []) => renderLinkedContextRows(rows, items, {
      empty,
      readonly,
      removeLabel: options.removeLabel,
      removeAction: options.removeAction,
      onRemove: options.onRemove,
    });
    const setTargets = (/** @type {readonly unknown[]} */ targets = []) => {
      replaceElementChildren(targetSelect, normalizePickerOptions(targets).map((target) => createPickerOption(target)));
    };
    const setClientContexts = (/** @type {readonly unknown[]} */ clientContexts = []) => {
      const normalizedClientContexts = normalizePickerOptions(clientContexts);
      replaceElementChildren(clientContextSelect, normalizedClientContexts.map((clientContext) => createPickerOption(clientContext)));
      if (clientContextField) {
        clientContextField.hidden = normalizedClientContexts.length === 0;
      }
      clientContextSelect.disabled = readonly || normalizedClientContexts.length === 0;
    };
    const setRecords = (/** @type {readonly unknown[]} */ records = []) => {
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
    const setReadonly = (/** @type {unknown} */ isReadonly) => {
      const nextReadonly = Boolean(isReadonly);
      if (nextReadonly) {
        picker.classList.add("is-readonly");
      } else {
        picker.classList.remove("is-readonly");
      }
      picker.setAttribute("data-view-readonly", nextReadonly ? "true" : "false");
      [clientContextSelect, targetSelect, searchInput, recordSelect, useTargetButton].forEach((control) => {
        control.disabled = nextReadonly;
      });
    };

    renderLinkedItems(options.linkedItems || options.rows || []);
    setTargets(providerOptions);
    setRecords(recordOptions);

    [clientContextSelect, targetSelect, searchInput, recordSelect].forEach((control) => {
      if (readonly) {
        control.disabled = true;
      }
    });

    if (typeof options.onClientContextChange === "function") {
      clientContextSelect.addEventListener("change", options.onClientContextChange);
    }
    if (typeof options.onTargetChange === "function") {
      targetSelect.addEventListener("change", options.onTargetChange);
    }
    if (typeof options.onSearchInput === "function") {
      searchInput.addEventListener("input", options.onSearchInput);
    }
    if (typeof options.onRecordChange === "function") {
      recordSelect.addEventListener("change", options.onRecordChange);
    }

    clientContextField = showClientContext
      ? createLinkedContextPickerField({ label: options.clientContextLabel || "Client", control: clientContextSelect, width: "narrow" })
      : null;
    setClientContexts(clientContextOptions);
    const controls = createFieldGrid({
      surface: false,
      className: "view-linked-context-picker-controls",
      fields: [
        clientContextField,
        createLinkedContextPickerField({ label: options.targetLabel || "Target", control: targetSelect, width: "narrow" }),
        createLinkedContextPickerField({ label: options.searchLabel || "Search", control: searchInput, width: "wide" }),
        createLinkedContextPickerField({ label: options.recordLabel || "Record", control: recordSelect, width: "wide" }),
        useTargetButton,
      ].filter(Boolean),
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
      clientContextSelect,
      targetSelect,
      searchInput,
      recordSelect,
      useTargetButton,
      setLinkedItems: renderLinkedItems,
      setClientContexts,
      setRecords,
      setTargets,
      setReadonly,
    });
    partsByKind.linkedContextPicker.set(picker, picker.viewParts);
    return picker;
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewLinkedContextListOptions} [options] */
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
      setLinkedItems: (/** @type {readonly unknown[]} */ items = []) => renderLinkedContextRows(rows, items, {
        empty,
        readonly: Boolean(options.readonly || options.disabled || options.permissionDisabled),
        removeLabel: options.removeLabel,
        removeAction: options.removeAction,
        onRemove: options.onRemove,
      }),
    });
    return rows;
  }

  /**
   * @param {HTMLElement} rows
   * @param {readonly unknown[]} [items]
   * @param {LinkedContextRowsOptions} [options]
   */
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

  /** @param {LinkedContextPickerField} options */
  function createLinkedContextPickerField(options) {
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

  /**
   * @param {PickerRecord} item
   * @param {LinkedContextRowOptions} [options]
   */
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
      // The handler is read once rather than re-read inside the click, because narrowing a
      // mutable property does not survive into a closure. `renderLinkedContextRows` builds this
      // options object per row and nothing retains or mutates it, so the second read could never
      // have observed a different handler.
      const onRemove = options.onRemove;
      const removeButton = createActionButton({
        icon: "delete",
        iconOnly: true,
        label: options.removeLabel || "Remove linked context",
        action: options.removeAction || "remove-linked-context",
        disabled: options.readonly || item.disabled || item.isAvailable === false,
        onClick: typeof onRemove === "function" ? (/** @type {unknown} */ event) => onRemove(item, event) : undefined,
      });
      row.appendChild(createElement("div", {
        className: "view-linked-context-picker-row-actions",
        children: removeButton,
      }));
    }

    return row;
  }

  /** @param {unknown} options */
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

  /** @param {unknown} records */
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

  /** @param {PickerOptionInput} option */
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
    // The native `value` setter coerces with ToString, which is what this spells out. Every
    // caller reaches here through `normalizePickerOptions` or `normalizePickerRecords`, both of
    // which answer `... || ""`, so the value is already text and no reachable input differs.
    element.value = String(option.value);
    element.disabled = Boolean(option.disabled);
    element.selected = Boolean(option.selected);
    return element;
  }

  /** @param {unknown} value @param {string} fallback @returns {string} */
  function pickerLabel(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  /** @param {unknown} value @returns {string} */
  function pickerOptionalLabel(value) {
    return String(value || "").trim();
  }

  /**
   * The action button every other builder in this file reaches for its controls.
   *
   * The five members it hands to `icons.createIconButton` - `icon`, `title`, `type`, `variant`
   * and `iconOnly` - are forwarded **raw**, which is what `0.33.33.39.17` widened the creation
   * contract to describe. Nothing is pre-normalized on the way, and `iconOnly` in particular
   * must arrive exactly as it was given: the icon writer tests it with `!== false`, so it tells
   * an absent flag apart from an explicit one.
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewActionButtonOptions} [options]
   * @returns {HTMLButtonElement}
   */
  function createActionButton(options = {}) {
    const label = String(options.label || options.ariaLabel || options.text || "").trim();
    const text = options.text === undefined ? label : String(options.text || "").trim();

    if (!label && !text) {
      throw new Error("View action buttons require visible text or an accessible label.");
    }

    // **A disagreement between two published contracts, recorded rather than resolved.**
    // `BrowserViewActionButtonOptions` declares `icon`, `title`, `type` and `variant` as
    // `unknown` and `iconOnly` as a flag; `BrowserIconCreateButtonOptions` declares the first
    // four as strings and `iconOnly` as a boolean. This factory forwards them raw, so the two
    // cannot both be right. **Coercing here would change behaviour**: `icons.createIconButton`
    // reads `options.iconOnly !== false`, which distinguishes `undefined` from `false`, so
    // `Boolean(0)` would flip a falsy non-false flag. `button.type` is the same shape from the
    // other side - the DOM declares it as three literals while the runtime accepts any string
    // and normalizes on read. Seven diagnostics stay here for whoever reconciles the two.
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
      Reflect.set(button, "type", options.type || "button");
      button.textContent = text || label;
      button.classList.add("action-button");
    }

    // The same assignment the DOM already accepted; see `icons.createIconButton`.
    Reflect.set(button, "type", options.type || button.type || "button");
    button.classList.add("view-action-button");
    addClasses(button, options.className);

    if (!text && label) {
      button.setAttribute("aria-label", label);
      button.title = String(options.title || label);
    } else if (options.ariaLabel) {
      button.setAttribute("aria-label", String(options.ariaLabel));
    }

    if (options.title) {
      button.title = String(options.title);
    }

    if (options.disabled) {
      button.disabled = true;
    }

    if (options.action) {
      button.dataset.surfaceAction = String(options.action);
    }

    const role = options.role || options.actionRole;
    if (role) {
      button.dataset.surfaceActionRole = String(role);
    }

    if (typeof options.onClick === "function") {
      button.addEventListener("click", options.onClick);
    }

    return button;
  }

  /** @param {import("../../../src/types/browser-contracts.js").BrowserViewActionInput} actions */
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

  /**
   * Read an opaque list entry as the record its builder treats it as.
   *
   * Both lists are published as `readonly unknown[]` and both builders read members off whatever
   * the caller put there. These answer exactly what the member access they replaced answered:
   * `undefined` for every member of a value that is not a record, and **a `TypeError` for a
   * nullish one**, which is what `entry.label` did and what a caller passing a hole in its list
   * still gets. Only the message differs.
   * @param {unknown} value
   * @returns {DetailBadge}
   */
  function detailBadgeFields(value) {
    if (value === null || value === undefined) {
      throw new TypeError("View detail badges must be readable.");
    }
    return typeof value === "object" ? value : {};
  }

  /**
   * The same, for one entry of an info panel's list.
   * @param {unknown} value
   * @returns {InfoPanelItem}
   */
  function infoPanelItemFields(value) {
    if (value === null || value === undefined) {
      throw new TypeError("View info panel items must be readable.");
    }
    return typeof value === "object" ? value : {};
  }

  /** @param {unknown} badges */
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

  /** @param {unknown} [badge] */
  function createDetailBadge(badge = {}) {
    const fields = detailBadgeFields(badge);
    const text = fields.text ?? detailBadgeText(fields);
    return createElement("span", {
      className: ["surface-chip", fields.className],
      text,
      attrs: {
        ...(text ? { title: fields.title || text } : {}),
        ...(fields.focusable ? { tabindex: "0" } : {}),
        ...(fields.attrs || {}),
      },
      dataset: fields.dataset,
    });
  }

  /** @param {DetailBadge} [badge] @returns {string} */
  function detailBadgeText(badge = {}) {
    const label = badge.label === null || badge.label === undefined ? "" : String(badge.label).trim();
    const value = badge.value === null || badge.value === undefined ? "" : String(badge.value).trim();
    if (label && value) {
      return `${label}: ${value}`;
    }
    return label || value;
  }

  /**
   * @param {unknown} row
   * @param {number} rowIndex
   * @param {unknown} column
   */
  function renderCell(row, rowIndex, column) {
    const fields = dataTableColumnFields(column);
    if (typeof fields.render === "function") {
      return fields.render(row, rowIndex);
    }

    const key = fields.key || fields.field;
    return key ? dataTableRecordFields(row)[String(key)] ?? "" : "";
  }

  /**
   * Read an opaque table input as the record its reader treats it as.
   *
   * Columns, secondary rows and the hierarchy descriptor all arrive as `unknown`, and each
   * reader takes members off whatever the caller supplied. These answer what the member access
   * they replaced answered - `undefined` for every member of a value that is not a record - and
   * **raise a `TypeError` for a nullish one**, which is what `column.align` and
   * `Object.hasOwn(column, "label")` both already did. Only the message differs.
   * @param {unknown} value
   * @returns {DataTableColumn}
   */
  function dataTableColumnFields(value) {
    if (value === null || value === undefined) {
      throw new TypeError("View data table columns must be readable.");
    }
    return typeof value === "object" ? value : {};
  }

  /**
   * The same, for one secondary row.
   * @param {unknown} value
   * @returns {DataTableSecondaryRow}
   */
  function dataTableSecondaryRowFields(value) {
    if (value === null || value === undefined) {
      throw new TypeError("View data table secondary rows must be readable.");
    }
    return typeof value === "object" ? value : {};
  }

  /**
   * A record a table cell reads a value out of.
   *
   * Unlike the two above this one **does not throw**, because the reads it serves were written
   * with optional chaining and a nullish guard. `Object(...)` boxes a primitive exactly as a
   * member access does, so a string row answers what it answered before.
   * @param {unknown} value
   * @returns {Record<string, unknown>}
   */
  function dataTableRecordFields(value) {
    return value === null || value === undefined ? {} : Object(value);
  }

  /** @param {unknown} column */
  function columnLabel(column) {
    if (typeof column === "string") {
      return column;
    }
    const fields = dataTableColumnFields(column);
    return Object.hasOwn(fields, "label")
      ? fields.label
      : fields.header || fields.key || "";
  }

  /** @param {unknown} column */
  function columnAlign(column) {
    return typeof column === "string" ? "" : dataTableColumnFields(column).align || "";
  }

  /** @param {IndexListItem} [item] */
  function hierarchyMetadata(item = {}) {
    const depth = normalizedDepth(item.depth ?? item.hierarchyDepth);
    const parent = item.parentId ?? item.hierarchyParent;
    const path = item.path ?? item.hierarchyPath;
    /** @type {Record<string, unknown>} */
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

  /** @param {unknown} [row] @param {unknown} [hierarchy] */
  function rowHierarchyMetadata(row = {}, hierarchy = null) {
    if (!hierarchy) {
      return { dataset: {}, hasHierarchy: false };
    }
    const fields = dataTableRecordFields(hierarchy);
    return hierarchyMetadata({
      depth: readRowValue(row, fields.depthField),
      parentId: readRowValue(row, fields.parentField),
      path: readRowValue(row, fields.pathField),
    });
  }

  /** @param {unknown} value */
  function normalizedDepth(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 12);
  }

  /**
   * @param {unknown} row
   * @param {unknown} fieldName
   * @returns {unknown}
   */
  function readRowValue(row, fieldName) {
    if (!fieldName || !row || typeof row !== "object") {
      return undefined;
    }
    return String(fieldName).split(".").reduce((/** @type {unknown} */ value, key) => (
      value === undefined || value === null ? undefined : dataTableRecordFields(value)[key]
    ), row);
  }

  /** @param {unknown} value @param {string} message @returns {string} */
  function requiredText(value, message) {
    const text = String(value || "").trim();
    if (!text) {
      throw new Error(message);
    }
    return text;
  }

  /** @param {number} count */
  function bulkSelectionCountText(count) {
    return `${count} selected`;
  }

  /** @param {unknown} descriptor */
  function normalizeSurfaceDescriptor(descriptor) {
    // Read from the captured root on every call, as before. The `|| {}` fallback was doing no
    // work the guard below does not already do: an adapter that is absent and one whose
    // `normalize` is not a function take the same path, and the empty object only hid the
    // member's declared type from the check.
    const adapter = root.viewSurfaceDescriptor;
    if (typeof adapter?.normalize !== "function") {
      throw new Error("View primitives require LongtailForge.viewSurfaceDescriptor.normalize.");
    }
    return adapter.normalize(descriptor);
  }

  /**
   * Attach a frozen, non-enumerable `viewParts` record.
   *
   * Declared as an assertion because that is exactly what the body does: after this call the
   * element carries the record, and every `create*` member below returns the element it just
   * passed. Without it the compiler cannot see a property installed by `Object.defineProperty`,
   * and each of those members looks like it returns a bare element. **No behaviour changes.**
   * @template {Element} Target
   * @template {Record<string, unknown>} Parts
   * @param {Target} element
   * @param {Parts} parts
   * @returns {asserts element is Target & { readonly viewParts: Parts }}
   */
  function assignViewParts(element, parts) {
    Object.defineProperty(element, "viewParts", {
      configurable: true,
      enumerable: false,
      value: Object.freeze(parts),
    });
  }

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewPartsByKind} BrowserViewPartsByKind */

  /**
   * The parts of the elements this factory built, by kind (`0.33.33.38.3.11`).
   *
   * A page that finds a framework element by searching the document gets back an `Element`, which
   * says nothing about `viewParts`. This is the framework's own record of what it built: a builder
   * registers an element only after it has assigned that element's parts, and the record holds the
   * very object `viewParts` holds. Weak, so a removed element is not kept alive.
   * @type {{ [Kind in keyof BrowserViewPartsByKind]: WeakMap<object, BrowserViewPartsByKind[Kind]> }}
   */
  const partsByKind = {
    bulkActionToolbar: new WeakMap(),
    linkedContextPicker: new WeakMap(),
  };

  /**
   * The parts of an element this factory built as `kind`, or `null`.
   *
   * `null` for anything else - an element some other code built, one built as a different kind, or
   * not an object at all - rather than whatever a `viewParts` property on it happens to hold. The
   * caller keeps searching the document on every use; nothing here caches what it found.
   * @template {keyof BrowserViewPartsByKind} Kind
   * @param {unknown} element
   * @param {Kind} kind
   * @returns {BrowserViewPartsByKind[Kind] | null}
   */
  function partsOf(element, kind) {
    if (typeof element !== "object" || element === null) {
      return null;
    }
    return partsByKind[kind].get(element) ?? null;
  }

  root.view = Object.freeze({
    collectFieldValues,
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
    createField,
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
    normalizeSurfaceDescriptor,
    partsOf,
    showModal,
  });

  global.LongtailForge = root;
})(window);
