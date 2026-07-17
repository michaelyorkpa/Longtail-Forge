(function attachSettingsRenderer(global) {
  const root = global.LongtailForge || {};
  const fieldMetadata = new WeakMap();
  const sectionMetadata = new WeakMap();

  function requireView() {
    const view = root.view;
    if (!view?.createElement || !view?.createField || !view?.createFieldGrid ||
        !view?.createInfoPanel || !view?.createActionButton || !view?.createInlineActionRow ||
        !view?.collectFieldValues) {
      throw new Error("Settings rendering requires the LongtailForge.view field and action primitives.");
    }
    return view;
  }

  function normalizeContributions(moduleSettings, options = {}) {
    const source = Array.isArray(moduleSettings)
      ? moduleSettings
      : normalizeFromModules(options.modules);

    return source
      .map((moduleDefinition) => normalizeModule(moduleDefinition || {}))
      .filter((moduleDefinition) => moduleDefinition.moduleId && moduleDefinition.settings.length > 0);
  }

  function normalizeFromModules(modules) {
    if (!Array.isArray(modules)) {
      return [];
    }
    return modules.flatMap((moduleDefinition) => {
      const settings = Array.isArray(moduleDefinition.settings) ? moduleDefinition.settings : [];
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

  function normalizeModule(moduleDefinition) {
    const moduleId = String(moduleDefinition.moduleId || moduleDefinition.id || "").trim();
    return {
      moduleId,
      name: String(moduleDefinition.name || "").trim(),
      displayName: String(moduleDefinition.displayName || moduleDefinition.name || moduleId).trim(),
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
      canDisable: moduleDefinition.canDisable !== false,
      settings: Array.isArray(moduleDefinition.settings)
        ? moduleDefinition.settings.map((setting) => normalizeSetting(moduleDefinition, setting || {}))
        : [],
    };
  }

  function normalizeSetting(moduleDefinition, setting) {
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
    })).filter(Boolean);
  }

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
    })).filter(Boolean);
    sections.forEach((section) => section.classList.add("settings-grouped-module"));
    container.appendChild(group);
    return sections;
  }

  function renderDisabledModuleRecovery(container, moduleDefinition = {}) {
    if (!container) {
      return null;
    }

    const view = requireView();
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

  function createSettingField(moduleDefinition, setting) {
    const view = requireView();
    const message = defaultFieldMessage(setting);
    const field = setting.type === "info"
      ? view.createInfoPanel({
        title: setting.label,
        message: setting.description || setting.label,
        className: "view-settings-info",
      })
      : view.createField({
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

    field.dataset.settingField = setting.id;
    field.dataset.settingKey = `${setting.moduleId || moduleDefinition.moduleId}.${setting.id}`;
    field.classList.add("view-settings-field");
    const controls = field.viewParts?.controls || [];
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

  function bindDependentVisibility(section) {
    const metadata = sectionMetadata.get(section);
    if (!metadata) {
      return;
    }
    const controllerIds = new Set(metadata.fields
      .map((field) => fieldMetadata.get(field)?.setting.visibleWhen?.settingId)
      .filter(Boolean));
    metadata.fields.forEach((field) => {
      const fieldState = fieldMetadata.get(field);
      if (!controllerIds.has(fieldState?.setting.id)) {
        return;
      }
      fieldState.controls.forEach((control) => {
        control.addEventListener("change", () => applyDependentVisibility(section));
        control.addEventListener("input", () => applyDependentVisibility(section));
      });
    });
    applyDependentVisibility(section);
  }

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
        const controllerState = fieldMetadata.get(controller);
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

  function collectPayload(scope = document) {
    const payload = {};
    const view = requireView();
    const grids = [
      ...(scope.matches?.("[data-settings-grid]") ? [scope] : []),
      ...scope.querySelectorAll("[data-settings-grid]"),
    ];
    grids.forEach((grid) => {
      const moduleId = String(grid.dataset.moduleId || "").trim();
      const values = view.collectFieldValues(grid);
      if (moduleId && Object.keys(values).length > 0) {
        payload[moduleId] = values;
      }
    });
    return payload;
  }

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

  function showValidationErrors(scope = document, error = null) {
    clearValidationErrors(scope);
    const fields = listSettingFields(scope);
    const structured = error?.body?.fieldErrors || error?.fieldErrors;
    let count = 0;
    if (structured && typeof structured === "object") {
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

    const message = String(error?.message || error?.body?.error || "").trim();
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

  function clearValidationErrors(scope = document) {
    listSettingFields(scope).forEach((field) => {
      const metadata = fieldMetadata.get(field);
      if (metadata) {
        setFieldMessage(field, metadata.defaultMessage, false);
      }
    });
  }

  function listSettingFields(scope) {
    return [
      ...(scope.matches?.("[data-setting-field]") ? [scope] : []),
      ...scope.querySelectorAll("[data-setting-field]"),
    ];
  }

  function setFieldMessage(field, message, invalid) {
    field?.viewParts?.setMessage?.(message, {
      invalid,
      tone: invalid ? "error" : "info",
    });
  }

  function readFieldValue(metadata) {
    const controls = metadata?.controls || [];
    const type = metadata?.setting.type;
    if (["boolean", "toggle"].includes(type)) {
      return Boolean(controls[0]?.checked);
    }
    if (type === "radio") {
      return controls.find((control) => control.checked)?.value || "";
    }
    if (type === "multi-select") {
      return Array.from(controls[0]?.selectedOptions || [], (option) => option.value);
    }
    if (type === "number") {
      return controls[0]?.value === "" ? "" : Number(controls[0]?.value);
    }
    return controls[0]?.value ?? metadata?.setting.value ?? "";
  }

  function valueMatches(value, expected) {
    return Array.isArray(value) ? value.includes(expected) : value === expected;
  }

  function normalizeType(type) {
    return ["boolean", "toggle", "text", "textarea", "number", "select", "multi-select", "radio", "info"].includes(type)
      ? type
      : "info";
  }

  function normalizeOptions(options) {
    return Array.isArray(options) ? options.map((option) => ({
      value: String(option?.value ?? ""),
      label: String(option?.label ?? option?.value ?? ""),
    })) : [];
  }

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

  function defaultValue(type, setting, moduleDefinition) {
    if (["boolean", "toggle"].includes(type)) {
      return setting.moduleStatus === true ? moduleDefinition.status === "enabled" : false;
    }
    if (type === "multi-select") {
      return [];
    }
    return "";
  }

  function normalizeVisibleWhen(visibleWhen) {
    if (!visibleWhen || typeof visibleWhen !== "object") {
      return null;
    }
    const settingId = String(visibleWhen.settingId || "").trim();
    return settingId && Object.hasOwn(visibleWhen, "equals")
      ? { settingId, equals: visibleWhen.equals }
      : null;
  }

  function normalizeInputMode(inputmode) {
    const value = String(inputmode || "").trim();
    return new Set(["none", "text", "decimal", "numeric", "tel", "search", "email", "url"]).has(value)
      ? value
      : "";
  }

  function normalizeNumberAttribute(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    return Number.isFinite(Number(value)) ? String(value) : "";
  }

  function normalizeStepAttribute(value) {
    return value === "any" ? "any" : normalizeNumberAttribute(value);
  }

  function defaultFieldMessage(setting) {
    return [setting.description, setting.readOnlyReason].filter(Boolean).join(" ");
  }

  function createPlaceholder(message) {
    return requireView().createElement("p", {
      className: "placeholder-copy",
      text: message,
    });
  }

  root.settingsRenderer = Object.freeze({
    clearValidationErrors,
    collectPayload,
    normalizeContributions,
    renderDisabledModuleRecovery,
    renderGroupedSections,
    renderSection,
    renderSections,
    showValidationErrors,
    validate,
  });
  global.LongtailForge = root;
})(window);
