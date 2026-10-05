(function attachSettingsRenderer(global) {
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserResolvedSetting} BrowserResolvedSetting */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserResolvedSettingsModule} BrowserResolvedSettingsModule */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingOption} BrowserSettingOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingType} BrowserSettingType */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingVisibleWhen} BrowserSettingVisibleWhen */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingsContributionOptions} BrowserSettingsContributionOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingsPayload} BrowserSettingsPayload */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingsRenderOptions} BrowserSettingsRenderOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingsRenderScope} BrowserSettingsRenderScope */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserSettingsRenderer} BrowserSettingsRenderer */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldControl} BrowserViewFieldControl */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldElement} BrowserViewFieldElement */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFieldGridElement} BrowserViewFieldGridElement */

  /**
   * What one rendered field remembers. Private: no consumer reads it.
   * @typedef {object} SettingsFieldMetadata
   * @property {BrowserViewFieldControl[]} controls
   * @property {string} defaultMessage
   * @property {string} key
   * @property {BrowserResolvedSetting} setting
   */

  /**
   * What one rendered section remembers. Private: no consumer reads it.
   * @typedef {object} SettingsSectionMetadata
   * @property {HTMLElement[]} fields
   * @property {BrowserViewFieldGridElement} grid
   * @property {BrowserResolvedSettingsModule} module
   */

  /**
   * The setting types this renderer knows how to draw.
   *
   * A contribution may name a type that is not here - `ModuleSettingDefinition.type` stays open on
   * purpose - and one that does falls back to `info` rather than reaching the field factory with a
   * type it cannot build.
   * @type {readonly BrowserSettingType[]}
   */
  const SETTING_TYPES = Object.freeze([
    "boolean", "toggle", "text", "textarea", "number", "select", "multi-select", "radio", "info",
  ]);

  const root = global.LongtailForge || {};
  /** @type {WeakMap<HTMLElement, SettingsFieldMetadata>} */
  const fieldMetadata = new WeakMap();
  /** @type {WeakMap<HTMLElement, SettingsSectionMetadata>} */
  const sectionMetadata = new WeakMap();

  /**
   * Whether a candidate is an array this writer can walk.
   *
   * `Array.isArray` alone widens an `unknown` into an implicitly typed array, which would hand
   * every downstream normalizer an untyped element. This narrows to `unknown[]` instead, so each
   * element still has to be normalized before it is read.
   * @param {unknown} value
   * @returns {value is unknown[]}
   */
  function isCandidateList(value) {
    return Array.isArray(value);
  }

  /**
   * A candidate this writer can read members off, or an empty one.
   *
   * Every normalizer here is total - it is handed whatever a module contributed and answers a
   * usable record - so an unusable candidate becomes an empty record and the normalizer's own
   * fallbacks then apply, exactly as they did when the parameter was implicitly `any`.
   * @param {unknown} value
   * @returns {Record<string, unknown>}
   */
  function readCandidate(value) {
    return isCandidateRecord(value) ? value : {};
  }

  /**
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isCandidateRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Whether a controller id survived the lookup that built it.
   * @param {string | undefined} settingId
   * @returns {settingId is string}
   */
  function isPresentSettingId(settingId) {
    return Boolean(settingId);
  }

  /**
   * Whether `renderSection` produced a section rather than declining.
   * @param {HTMLElement | null} section
   * @returns {section is HTMLElement}
   */
  function isRenderedSection(section) {
    return section !== null;
  }

  function requireView() {
    const view = root.view;
    if (!view?.createElement || !view?.createField || !view?.createFieldGrid ||
        !view?.createInfoPanel || !view?.createActionButton || !view?.createInlineActionRow ||
        !view?.collectFieldValues) {
      throw new Error("Settings rendering requires the LongtailForge.view field and action primitives.");
    }
    return view;
  }

  /**
   * @param {unknown} [moduleSettings]
   * @param {BrowserSettingsContributionOptions} [options]
   * @returns {BrowserResolvedSettingsModule[]}
   */
  function normalizeContributions(moduleSettings, options = {}) {
    const source = isCandidateList(moduleSettings)
      ? moduleSettings
      : normalizeFromModules(options.modules);

    return source
      .map((moduleDefinition) => normalizeModule(moduleDefinition))
      .filter((moduleDefinition) => moduleDefinition.moduleId && moduleDefinition.settings.length > 0);
  }

  /**
   * @param {unknown} modules
   * @returns {unknown[]}
   */
  function normalizeFromModules(modules) {
    if (!isCandidateList(modules)) {
      return [];
    }
    return modules.flatMap((candidate) => {
      const moduleDefinition = readCandidate(candidate);
      const settings = isCandidateList(moduleDefinition.settings) ? moduleDefinition.settings : [];
      return settings.length > 0 ? [{
        moduleId: moduleDefinition.moduleId || moduleDefinition.id,
        name: moduleDefinition.name,
        displayName: moduleDefinition.displayName || moduleDefinition.name,
        status: moduleDefinition.status,
        canDisable: moduleDefinition.canDisable,
        settings,
      }] : [];
    });
  }

  /**
   * @param {unknown} candidate
   * @returns {BrowserResolvedSettingsModule}
   */
  function normalizeModule(candidate) {
    const moduleDefinition = readCandidate(candidate);
    const moduleId = String(moduleDefinition.moduleId || moduleDefinition.id || "").trim();
    return {
      moduleId,
      name: String(moduleDefinition.name || "").trim(),
      displayName: String(moduleDefinition.displayName || moduleDefinition.name || moduleId).trim(),
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
      canDisable: moduleDefinition.canDisable !== false,
      settings: isCandidateList(moduleDefinition.settings)
        ? moduleDefinition.settings.map((setting) => normalizeSetting(moduleDefinition, setting))
        : [],
    };
  }

  /**
   * @param {Record<string, unknown>} moduleDefinition
   * @param {unknown} candidate
   * @returns {BrowserResolvedSetting}
   */
  function normalizeSetting(moduleDefinition, candidate) {
    const setting = readCandidate(candidate);
    const type = normalizeType(setting.type);
    const moduleId = String(setting.moduleId || moduleDefinition.moduleId || moduleDefinition.id || "").trim();
    const hasValue = Object.hasOwn(setting, "value");
    const hasDefault = Object.hasOwn(setting, "default");
    return {
      ...setting,
      id: String(setting.id || "").trim(),
      label: String(setting.label || setting.id || "").trim(),
      description: String(setting.description || "").trim(),
      moduleId,
      moduleStatus: setting.moduleStatus === true,
      options: normalizeOptions(setting.options),
      placeholder: String(setting.placeholder || "").trim(),
      readOnly: setting.readOnly === true,
      readOnlyReason: String(setting.readOnlyReason || setting.disabledReason || "").trim(),
      required: setting.required === true,
      inputmode: normalizeInputMode(setting.inputmode),
      min: normalizeNumberAttribute(setting.min),
      max: normalizeNumberAttribute(setting.max),
      step: normalizeStepAttribute(setting.step),
      rows: normalizeNumberAttribute(setting.rows),
      spellcheck: setting.spellcheck !== false,
      type,
      value: normalizeValue(
        hasValue ? setting.value : hasDefault ? setting.default : defaultValue(type, setting, moduleDefinition),
        type,
      ),
      visibleWhen: normalizeVisibleWhen(setting.visibleWhen),
    };
  }

  /**
   * @param {Element | null | undefined} container
   * @param {unknown} [moduleSettings]
   * @param {BrowserSettingsRenderOptions} [options]
   * @returns {HTMLElement[]}
   */
  function renderSections(container, moduleSettings, options = {}) {
    if (!container) {
      return [];
    }
    const modules = normalizeContributions(moduleSettings, options.settings || options);
    container.replaceChildren();
    if (modules.length === 0) {
      if (options.hideEmpty === true) {
        return [];
      }
      container.appendChild(createPlaceholder(options.emptyText || "No configurable modules are available."));
      return [];
    }

    return modules.map((moduleDefinition) => renderSection(container, moduleDefinition, {
      ...options,
      append: true,
    })).filter(isRenderedSection);
  }

  /**
   * @param {Element | null | undefined} container
   * @param {unknown} [moduleSettings]
   * @param {BrowserSettingsRenderOptions} [options]
   * @returns {HTMLElement[]}
   */
  function renderGroupedSections(container, moduleSettings, options = {}) {
    if (!container) {
      return [];
    }
    const modules = normalizeContributions(moduleSettings, options.settings || options);
    if (!options.append) {
      container.replaceChildren();
    }
    if (modules.length === 0) {
      if (options.hideEmpty !== true) {
        container.appendChild(createPlaceholder(options.emptyText || "No configurable modules are available."));
      }
      return [];
    }

    const view = requireView();
    const groupedModules = view.createElement("div", { className: "settings-grouped-modules" });
    const group = view.createElement("fieldset", {
      className: ["view-settings-section", "settings-grouped-section"],
      children: [
        view.createElement("legend", {
          className: "view-settings-section-legend",
          text: options.groupTitle || "Modules",
        }),
        groupedModules,
      ],
    });
    const sections = modules.map((moduleDefinition) => renderSection(groupedModules, moduleDefinition, {
      ...options,
      append: true,
      title: undefined,
    })).filter(isRenderedSection);
    sections.forEach((section) => section.classList.add("settings-grouped-module"));
    container.appendChild(group);
    return sections;
  }

  /**
   * @param {Element | null | undefined} container
   * @param {unknown} [candidate]
   * @returns {HTMLElement | null}
   */
  function renderDisabledModuleRecovery(container, candidate = {}) {
    if (!container) {
      return null;
    }

    const view = requireView();
    const moduleDefinition = readCandidate(candidate);
    const moduleId = String(moduleDefinition.id || moduleDefinition.moduleId || "").trim();
    const displayName = String(
      moduleDefinition.displayName || moduleDefinition.name || moduleId || "This module",
    ).trim();
    const panel = view.createInfoPanel({
      title: `${displayName} is disabled`,
      message: `${displayName} is disabled for this workspace. Re-enable it from Workspace Settings to restore its settings and workspace surfaces.`,
      className: "settings-disabled-module-recovery",
    });
    const recoveryLink = view.createElement("a", {
      className: ["button-link", "secondary"],
      attrs: { href: "workspace-settings.html" },
      dataset: { moduleRecoveryLink: moduleId },
      text: "Open Workspace Settings",
    });
    panel.dataset.disabledModuleRecovery = moduleId;
    panel.appendChild(view.createElement("div", {
      className: "view-info-panel-actions",
      children: [recoveryLink],
    }));
    container.replaceChildren(panel);
    return panel;
  }

  /**
   * @param {Element | null | undefined} container
   * @param {unknown} [moduleDefinition]
   * @param {BrowserSettingsRenderOptions} [options]
   * @returns {HTMLElement | null}
   */
  function renderSection(container, moduleDefinition, options = {}) {
    if (!container) {
      return null;
    }
    if (!options.append) {
      container.replaceChildren();
    }
    const normalizedModule = normalizeContributions([moduleDefinition], options.settings || options)[0];
    if (!normalizedModule) {
      if (!options.append) {
        container.appendChild(createPlaceholder(options.emptyText || "No configurable module settings are available."));
      }
      return null;
    }

    const view = requireView();
    const fields = normalizedModule.settings.map((setting) => createSettingField(normalizedModule, setting));
    const grid = view.createFieldGrid({
      surface: false,
      editable: true,
      className: "view-settings-section-fields",
      dataset: { settingsGrid: "", moduleId: normalizedModule.moduleId },
      fields,
    });
    const section = view.createElement("fieldset", {
      className: "view-settings-section",
      dataset: {
        settingsSection: "",
        moduleId: normalizedModule.moduleId,
      },
      children: [
        view.createElement("legend", {
          className: "view-settings-section-legend",
          text: options.title || normalizedModule.displayName || normalizedModule.name || normalizedModule.moduleId,
        }),
        grid,
      ],
    });

    const metadata = { fields, grid, module: normalizedModule };
    sectionMetadata.set(section, metadata);
    Object.defineProperty(section, "viewParts", {
      configurable: true,
      enumerable: false,
      value: Object.freeze({
        fields,
        grid,
        collectValues: () => view.collectFieldValues(grid),
        applyVisibility: () => applyDependentVisibility(section),
      }),
    });
    bindDependentVisibility(section);
    container.appendChild(section);
    return section;
  }

  /**
   * @param {BrowserResolvedSettingsModule} moduleDefinition
   * @param {BrowserResolvedSetting} setting
   * @returns {HTMLElement}
   */
  function createSettingField(moduleDefinition, setting) {
    const view = requireView();
    const message = defaultFieldMessage(setting);
    // The info panel and the field are built apart because only one of them has `viewParts`.
    // `createInfoPanel` never attaches one, so the optional read this replaces always answered
    // the empty list on that branch.
    /** @type {HTMLElement} */
    let field;
    /** @type {BrowserViewFieldControl[]} */
    let controls;
    if (setting.type === "info") {
      field = view.createInfoPanel({
        title: setting.label,
        message: setting.description || setting.label,
        className: "view-settings-info",
      });
      controls = [];
    } else {
      const fieldElement = view.createField({
        field: setting.id,
        type: setting.type,
        label: setting.label,
        required: setting.required,
        options: setting.options,
        placeholder: setting.placeholder,
        min: setting.min === "" ? undefined : setting.min,
        max: setting.max === "" ? undefined : setting.max,
        step: setting.step === "" ? undefined : setting.step,
        inputmode: setting.inputmode,
        rows: setting.rows === "" ? undefined : setting.rows,
        spellcheck: setting.spellcheck,
      }, {
        value: setting.value,
        disabled: setting.readOnly,
        message,
        messageClassName: "settings-help",
      });
      field = fieldElement;
      controls = fieldElement.viewParts?.controls || [];
    }

    field.dataset.settingField = setting.id;
    field.dataset.settingKey = `${setting.moduleId || moduleDefinition.moduleId}.${setting.id}`;
    field.classList.add("view-settings-field");
    controls.forEach((control) => {
      control.dataset.moduleSetting = setting.id;
      control.dataset.moduleId = setting.moduleId || moduleDefinition.moduleId;
      control.dataset.moduleSettingType = setting.type;
      if (setting.moduleStatus) {
        control.dataset.moduleStatus = "true";
      }
    });
    if (setting.readOnly) {
      field.classList.add("is-read-only");
    }
    fieldMetadata.set(field, {
      controls,
      defaultMessage: message,
      key: `${setting.moduleId || moduleDefinition.moduleId}.${setting.id}`,
      setting,
    });
    return field;
  }

  /** @param {HTMLElement} section */
  function bindDependentVisibility(section) {
    const metadata = sectionMetadata.get(section);
    if (!metadata) {
      return;
    }
    const controllerIds = new Set(metadata.fields
      .map((field) => fieldMetadata.get(field)?.setting.visibleWhen?.settingId)
      .filter(isPresentSettingId));
    metadata.fields.forEach((field) => {
      const fieldState = fieldMetadata.get(field);
      // The absent case already returned here: the id set is built from present ids only, so a
      // field with no metadata could never match it.
      if (!fieldState || !controllerIds.has(fieldState.setting.id)) {
        return;
      }
      fieldState.controls.forEach((control) => {
        control.addEventListener("change", () => applyDependentVisibility(section));
        control.addEventListener("input", () => applyDependentVisibility(section));
      });
    });
    applyDependentVisibility(section);
  }

  /** @param {HTMLElement} section */
  function applyDependentVisibility(section) {
    const metadata = sectionMetadata.get(section);
    if (!metadata) {
      return;
    }
    const fieldsById = new Map(metadata.fields.map((field) => [fieldMetadata.get(field)?.setting.id, field]));
    for (let pass = 0; pass < metadata.fields.length; pass += 1) {
      let changed = false;
      metadata.fields.forEach((field) => {
        const fieldState = fieldMetadata.get(field);
        const condition = fieldState?.setting.visibleWhen;
        if (!condition) {
          changed = setFieldVisibility(field, true) || changed;
          return;
        }
        const controller = fieldsById.get(condition.settingId);
        const controllerState = controller ? fieldMetadata.get(controller) : undefined;
        const visible = Boolean(controller && !controller.hidden && valueMatches(
          readFieldValue(controllerState),
          condition.equals,
        ));
        changed = setFieldVisibility(field, visible) || changed;
      });
      if (!changed) {
        break;
      }
    }
  }

  /**
   * @param {HTMLElement} field
   * @param {boolean} visible
   * @returns {boolean}
   */
  function setFieldVisibility(field, visible) {
    const metadata = fieldMetadata.get(field);
    if (!metadata) {
      return false;
    }
    const changed = field.hidden === visible;
    field.hidden = !visible;
    field.setAttribute("aria-hidden", visible ? "false" : "true");
    metadata.controls.forEach((control) => {
      control.disabled = metadata.setting.readOnly || !visible;
    });
    if (!visible) {
      setFieldMessage(field, metadata.defaultMessage, false);
    }
    return changed;
  }

  /**
   * @param {BrowserSettingsRenderScope} [scope]
   * @returns {BrowserSettingsPayload}
   */
  function collectPayload(scope = document) {
    /** @type {BrowserSettingsPayload} */
    const payload = {};
    const view = requireView();
    // `scope.matches?.()` said the same thing: a `Document` has no `matches`, so the optional call
    // answered `undefined` and the scope itself was never included.
    const grids = [
      ...(scope instanceof Element && scope.matches("[data-settings-grid]") ? [scope] : []),
      ...scope.querySelectorAll("[data-settings-grid]"),
    ];
    grids.forEach((grid) => {
      // Every grid carrying this marker is built by `view.createFieldGrid`, which makes a `div`.
      if (!(grid instanceof HTMLElement)) {
        return;
      }
      const moduleId = String(grid.dataset.moduleId || "").trim();
      const values = view.collectFieldValues(grid);
      if (moduleId && Object.keys(values).length > 0) {
        payload[moduleId] = values;
      }
    });
    return payload;
  }

  /**
   * @param {BrowserSettingsRenderScope} [scope]
   * @returns {boolean}
   */
  function validate(scope = document) {
    clearValidationErrors(scope);
    let valid = true;
    listSettingFields(scope).forEach((field) => {
      const metadata = fieldMetadata.get(field);
      if (!metadata || field.hidden) {
        return;
      }
      const invalidControl = metadata.controls.find((control) => (
        !control.disabled && typeof control.checkValidity === "function" && !control.checkValidity()
      ));
      if (invalidControl) {
        valid = false;
        setFieldMessage(
          field,
          invalidControl.validationMessage || `${metadata.setting.label} is invalid.`,
          true,
        );
      }
    });
    return valid;
  }

  /**
   * @param {BrowserSettingsRenderScope} [scope]
   * @param {unknown} [error]
   * @returns {number}
   */
  function showValidationErrors(scope = document, error = null) {
    clearValidationErrors(scope);
    const fields = listSettingFields(scope);
    // Whatever was thrown: a `BrowserApiError` carrying `body.fieldErrors`, a plain carrier with
    // `fieldErrors` on it, an ordinary `Error`, or a value that is neither. Each member is read
    // only after the value it sits on has been proved record-like, and the order of preference is
    // the one the raw optional chain expressed.
    const errorRecord = isCandidateRecord(error) ? error : null;
    const bodyRecord = isCandidateRecord(errorRecord?.body) ? errorRecord.body : null;
    const structured = bodyRecord?.fieldErrors || errorRecord?.fieldErrors;
    let count = 0;
    if (isCandidateRecord(structured)) {
      Object.entries(structured).forEach(([key, message]) => {
        const field = fields.find((item) => fieldMetadata.get(item)?.key === key);
        if (field) {
          setFieldMessage(field, message, true);
          count += 1;
        }
      });
    }
    if (count > 0) {
      return count;
    }

    const message = String(
      errorRecord?.message
      || window.LongtailForge?.errors?.read?.(bodyRecord, "").message
      || "",
    ).trim();
    if (!message) {
      return 0;
    }
    fields.forEach((field) => {
      const metadata = fieldMetadata.get(field);
      if (!metadata || field.hidden) {
        return;
      }
      if (message.includes(`'${metadata.key}'`) || message.includes(`\"${metadata.key}\"`)) {
        setFieldMessage(field, message, true);
        count += 1;
      }
    });
    return count;
  }

  /** @param {BrowserSettingsRenderScope} [scope] */
  function clearValidationErrors(scope = document) {
    listSettingFields(scope).forEach((field) => {
      const metadata = fieldMetadata.get(field);
      if (metadata) {
        setFieldMessage(field, metadata.defaultMessage, false);
      }
    });
  }

  /**
   * @param {BrowserSettingsRenderScope} scope
   * @returns {HTMLElement[]}
   */
  function listSettingFields(scope) {
    return [
      ...(scope instanceof Element && scope.matches("[data-setting-field]") ? [scope] : []),
      ...scope.querySelectorAll("[data-setting-field]"),
    ].filter(isSettingFieldElement);
  }

  /**
   * Every element carrying the field marker is built by `createSettingField`.
   * @param {Element} element
   * @returns {element is HTMLElement}
   */
  function isSettingFieldElement(element) {
    return element instanceof HTMLElement;
  }

  /**
   * Only a field built by `view.createField` carries a message channel; an info panel does not,
   * and the optional chain this replaces was already a no-op for one.
   * @param {HTMLElement | BrowserViewFieldElement | null | undefined} field
   * @param {unknown} message
   * @param {boolean} invalid
   */
  function setFieldMessage(field, message, invalid) {
    if (!field || !("viewParts" in field)) {
      return;
    }
    field.viewParts.setMessage?.(message, {
      invalid,
      tone: invalid ? "error" : "info",
    });
  }

  /**
   * @param {SettingsFieldMetadata | undefined} metadata
   * @returns {unknown}
   */
  function readFieldValue(metadata) {
    const controls = metadata?.controls || [];
    const type = metadata?.setting.type;
    const [control] = controls;
    // `checked` and `selectedOptions` live on one arm of the control union each. A control that is
    // not that arm answered `undefined` before, which the surrounding `Boolean`, `find` and `||`
    // already treated as absent - so each read now asks the control whether it is that arm.
    if (type === "boolean" || type === "toggle") {
      return control instanceof HTMLInputElement && control.checked;
    }
    if (type === "radio") {
      return controls.find((candidate) => candidate instanceof HTMLInputElement && candidate.checked)?.value || "";
    }
    if (type === "multi-select") {
      return control instanceof HTMLSelectElement
        ? Array.from(control.selectedOptions, (option) => option.value)
        : [];
    }
    if (type === "number") {
      return control?.value === "" ? "" : Number(control?.value);
    }
    return control?.value ?? metadata?.setting.value ?? "";
  }

  /**
   * @param {unknown} value
   * @param {unknown} expected
   * @returns {boolean}
   */
  function valueMatches(value, expected) {
    return Array.isArray(value) ? value.includes(expected) : value === expected;
  }

  /**
   * @param {unknown} type
   * @returns {BrowserSettingType}
   */
  function normalizeType(type) {
    return SETTING_TYPES.find((candidate) => candidate === type) || "info";
  }

  /**
   * @param {unknown} options
   * @returns {BrowserSettingOption[]}
   */
  function normalizeOptions(options) {
    return isCandidateList(options) ? options.map((candidate) => {
      const option = readCandidate(candidate);
      return {
        value: String(option.value ?? ""),
        label: String(option.label ?? option.value ?? ""),
      };
    }) : [];
  }

  /**
   * @param {unknown} value
   * @param {BrowserSettingType} type
   * @returns {unknown}
   */
  function normalizeValue(value, type) {
    if (["boolean", "toggle"].includes(type)) {
      return value === true;
    }
    if (type === "number") {
      return value === null || value === undefined || value === "" ? "" : Number(value);
    }
    if (type === "multi-select") {
      return Array.isArray(value) ? value.map((item) => String(item)) : [];
    }
    return value ?? "";
  }

  /**
   * @param {BrowserSettingType} type
   * @param {Record<string, unknown>} setting
   * @param {Record<string, unknown>} moduleDefinition
   * @returns {unknown}
   */
  function defaultValue(type, setting, moduleDefinition) {
    if (["boolean", "toggle"].includes(type)) {
      return setting.moduleStatus === true ? moduleDefinition.status === "enabled" : false;
    }
    if (type === "multi-select") {
      return [];
    }
    return "";
  }

  /**
   * @param {unknown} candidate
   * @returns {BrowserSettingVisibleWhen | null}
   */
  function normalizeVisibleWhen(candidate) {
    if (!isCandidateRecord(candidate)) {
      return null;
    }
    const visibleWhen = candidate;
    const settingId = String(visibleWhen.settingId || "").trim();
    return settingId && Object.hasOwn(visibleWhen, "equals")
      ? { settingId, equals: visibleWhen.equals }
      : null;
  }

  /**
   * @param {unknown} inputmode
   * @returns {string}
   */
  function normalizeInputMode(inputmode) {
    const value = String(inputmode || "").trim();
    return new Set(["none", "text", "decimal", "numeric", "tel", "search", "email", "url"]).has(value)
      ? value
      : "";
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeNumberAttribute(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    return Number.isFinite(Number(value)) ? String(value) : "";
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeStepAttribute(value) {
    return value === "any" ? "any" : normalizeNumberAttribute(value);
  }

  /**
   * @param {BrowserResolvedSetting} setting
   * @returns {string}
   */
  function defaultFieldMessage(setting) {
    return [setting.description, setting.readOnlyReason].filter(Boolean).join(" ");
  }

  /**
   * @param {string} message
   * @returns {HTMLElement}
   */
  function createPlaceholder(message) {
    return requireView().createElement("p", {
      className: "placeholder-copy",
      text: message,
    });
  }

  /**
   * The nine methods this writer publishes.
   *
   * Annotated on the literal rather than on the `Object.freeze` call, so that the compiler checks
   * the membership in both directions: a missing method fails, a tenth one fails as an unknown
   * property, and a changed signature fails. `LongtailForge.settingsRenderer` is **not** declared
   * on the namespace yet, so consumers still read this through the root's index signature and see
   * `unknown` - the writer is checked here before the surface is declared.
   * @type {BrowserSettingsRenderer}
   */
  const settingsRendererApi = {
    clearValidationErrors,
    collectPayload,
    normalizeContributions,
    renderDisabledModuleRecovery,
    renderGroupedSections,
    renderSection,
    renderSections,
    showValidationErrors,
    validate,
  };

  root.settingsRenderer = Object.freeze(settingsRendererApi);
  global.LongtailForge = root;
})(window);
