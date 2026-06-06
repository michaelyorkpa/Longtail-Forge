(function attachSettingsControls(global) {
  const root = global.LongtailForge || {};

  function normalizeModuleSettings(moduleSettings, settings = {}) {
    if (!Array.isArray(moduleSettings)) {
      return [];
    }

    return moduleSettings.map((moduleDefinition) => ({
      moduleId: String(moduleDefinition.moduleId || moduleDefinition.id || "").trim(),
      name: String(moduleDefinition.name || "").trim(),
      displayName: String(moduleDefinition.displayName || moduleDefinition.name || "").trim(),
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
      canDisable: moduleDefinition.canDisable !== false,
      settings: Array.isArray(moduleDefinition.settings)
        ? moduleDefinition.settings.map((setting) => normalizeModuleSetting(moduleDefinition, setting, settings))
        : [],
    })).filter((moduleDefinition) => moduleDefinition.moduleId && moduleDefinition.settings.length > 0);
  }

  function normalizeModuleSetting(moduleDefinition, setting, settings = {}) {
    const moduleId = String(setting.moduleId || moduleDefinition.moduleId || moduleDefinition.id || "").trim();
    const value = Object.hasOwn(setting, "value")
      ? setting.value
      : setting.id === "timeTrackingEnabled"
        ? settings?.timeTrackingEnabled !== false
        : setting.id === "tasksEnabled"
          ? settings?.tasksEnabled !== false
          : setting.id === "taskTimersEnabled"
            ? settings?.taskTimersEnabled !== false
            : moduleDefinition.status === "enabled";

    return {
      id: String(setting.id || "").trim(),
      label: String(setting.label || setting.id || "").trim(),
      description: String(setting.description || "").trim(),
      moduleId,
      moduleStatus: setting.moduleStatus === true,
      options: Array.isArray(setting.options) ? setting.options : [],
      placeholder: String(setting.placeholder || "").trim(),
      readOnly: setting.readOnly === true,
      type: normalizeModuleSettingType(setting.type),
      value,
    };
  }

  function normalizeModuleSettingType(type) {
    return ["boolean", "text", "number", "select", "multi-select", "info"].includes(type) ? type : "info";
  }

  function renderModuleSettingsGroups(container, moduleSettings, options = {}) {
    if (!container) {
      return;
    }

    const modules = normalizeModuleSettings(moduleSettings, options.settings || {});
    container.replaceChildren();

    if (modules.length === 0) {
      container.appendChild(createPlaceholder(options.emptyText || "No configurable modules are available."));
      return;
    }

    modules.forEach((moduleDefinition) => {
      const group = document.createElement("section");
      const heading = document.createElement(options.headingLevel || "h2");

      group.className = "module-settings-group";
      heading.textContent = moduleDefinition.displayName || moduleDefinition.name || moduleDefinition.moduleId;
      group.appendChild(heading);
      renderModuleSettingFields(group, moduleDefinition, { append: true });
      container.appendChild(group);
    });
  }

  function renderModuleSettingFields(container, moduleDefinition, options = {}) {
    if (!container) {
      return;
    }

    if (!options.append) {
      container.replaceChildren();
    }

    const normalizedModule = normalizeModuleSettings([moduleDefinition], options.settings || {})[0];

    if (!normalizedModule) {
      if (!options.append) {
        container.appendChild(createPlaceholder(options.emptyText || "No configurable module settings are available."));
      }
      return;
    }

    normalizedModule.settings.forEach((setting) => {
      container.appendChild(createModuleSettingControl(normalizedModule, setting));
    });
  }

  function createModuleSettingControl(moduleDefinition, setting) {
    if (setting.type === "info") {
      const paragraph = document.createElement("p");
      paragraph.className = "settings-help";
      paragraph.textContent = setting.description || setting.label;
      return paragraph;
    }

    const label = document.createElement("label");
    const input = createModuleSettingInput(setting);

    label.className = setting.type === "boolean" ? "inline-option" : "";
    input.dataset.moduleSetting = setting.id;
    input.dataset.moduleId = setting.moduleId || moduleDefinition.moduleId;
    input.dataset.moduleSettingType = setting.type;

    if (setting.moduleStatus) {
      input.dataset.moduleStatus = "true";
    }

    if (setting.readOnly) {
      input.disabled = true;
      label.classList.add("is-read-only");
    }

    if (setting.type === "boolean") {
      label.append(input, document.createTextNode(` ${setting.label}`));
    } else {
      label.append(document.createTextNode(setting.label), input);
    }

    if (setting.description || setting.readOnly) {
      const help = document.createElement("span");
      help.className = "settings-help";
      help.textContent = setting.description || "Required module.";
      label.appendChild(help);
    }

    return label;
  }

  function createModuleSettingInput(setting) {
    if (setting.type === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = setting.value !== false;
      return input;
    }

    if (setting.type === "select" || setting.type === "multi-select") {
      const select = document.createElement("select");
      select.multiple = setting.type === "multi-select";
      (setting.options || []).forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        optionElement.selected = Array.isArray(setting.value)
          ? setting.value.includes(option.value)
          : setting.value === option.value;
        select.appendChild(optionElement);
      });
      return select;
    }

    const input = document.createElement("input");
    input.type = setting.type === "number" ? "number" : "text";
    input.value = setting.value ?? "";
    input.placeholder = setting.placeholder || "";
    return input;
  }

  function readModuleSettingsPayload(scope = document) {
    const payload = {};

    scope.querySelectorAll("[data-module-setting]").forEach((input) => {
      if (input.disabled) {
        return;
      }

      const moduleId = input.dataset.moduleId;
      const settingId = input.dataset.moduleSetting;

      if (!moduleId || !settingId) {
        return;
      }

      payload[moduleId] = payload[moduleId] || {};
      payload[moduleId][settingId] = readModuleSettingInputValue(input);
    });

    return payload;
  }

  function readModuleSettingInputValue(input) {
    if (input.dataset.moduleSettingType === "boolean") {
      return input.checked;
    }

    if (input.dataset.moduleSettingType === "number") {
      return Number(input.value);
    }

    if (input.dataset.moduleSettingType === "multi-select") {
      return Array.from(input.selectedOptions).map((option) => option.value);
    }

    return input.value;
  }

  function createPlaceholder(message) {
    const placeholder = document.createElement("p");

    placeholder.className = "placeholder-copy";
    placeholder.textContent = message;
    return placeholder;
  }

  root.settingsControls = {
    normalizeModuleSettings,
    renderModuleSettingFields,
    renderModuleSettingsGroups,
    readModuleSettingsPayload,
  };
  global.LongtailForge = root;
})(window);
