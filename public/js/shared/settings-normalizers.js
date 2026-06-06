(function attachSettingsNormalizers(global) {
  const root = global.LongtailForge || {};

  function normalizeModuleSettings(moduleSettings, options = {}) {
    const source = Array.isArray(moduleSettings)
      ? moduleSettings
      : normalizeModuleSettingsFromModules(options.modules);

    return source.map((moduleDefinition) => normalizeModuleDefinition(moduleDefinition || {}))
      .filter((moduleDefinition) => moduleDefinition.moduleId && moduleDefinition.settings.length > 0);
  }

  function normalizeModuleSettingsFromModules(modules) {
    if (!Array.isArray(modules)) {
      return [];
    }

    return modules.flatMap((moduleDefinition) => {
      const settings = Array.isArray(moduleDefinition.settings) ? moduleDefinition.settings : [];

      return settings.length > 0
        ? [{
            moduleId: moduleDefinition.moduleId || moduleDefinition.id,
            name: moduleDefinition.name,
            displayName: moduleDefinition.displayName || moduleDefinition.name,
            status: moduleDefinition.status,
            canDisable: moduleDefinition.canDisable,
            settings,
          }]
        : [];
    });
  }

  function normalizeModuleDefinition(moduleDefinition = {}) {
    const moduleId = String(moduleDefinition.moduleId || moduleDefinition.id || "").trim();

    return {
      moduleId,
      name: String(moduleDefinition.name || "").trim(),
      displayName: String(moduleDefinition.displayName || moduleDefinition.name || "").trim(),
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
      canDisable: moduleDefinition.canDisable !== false,
      readOnlyReason: normalizeReason(moduleDefinition.readOnlyReason || moduleDefinition.disabledReason),
      settings: Array.isArray(moduleDefinition.settings)
        ? moduleDefinition.settings.map((setting) => normalizeModuleSetting(moduleDefinition, setting))
        : [],
    };
  }

  function normalizeModuleSetting(moduleDefinition, setting = {}) {
    const moduleId = String(setting.moduleId || moduleDefinition.moduleId || moduleDefinition.id || "").trim();
    const type = normalizeModuleSettingType(setting.type);

    return {
      id: String(setting.id || "").trim(),
      label: String(setting.label || setting.id || "").trim(),
      description: String(setting.description || "").trim(),
      moduleId,
      moduleStatus: setting.moduleStatus === true,
      options: normalizeOptions(setting.options),
      placeholder: String(setting.placeholder || "").trim(),
      readOnly: setting.readOnly === true,
      readOnlyReason: normalizeReason(setting.readOnlyReason || setting.disabledReason),
      required: setting.required === true,
      inputmode: normalizeInputMode(setting.inputmode),
      min: normalizeNumberAttribute(setting.min),
      max: normalizeNumberAttribute(setting.max),
      step: normalizeStepAttribute(setting.step),
      type,
      value: Object.hasOwn(setting, "value") ? normalizeSettingValue(setting.value, type) : defaultValueForType(type, moduleDefinition),
    };
  }

  function normalizeOptions(options) {
    if (!Array.isArray(options)) {
      return [];
    }

    return options.map((option) => ({
      value: String(option?.value ?? ""),
      label: String(option?.label ?? option?.value ?? ""),
    }));
  }

  function normalizeModuleSettingType(type) {
    return ["boolean", "text", "number", "select", "multi-select", "info"].includes(type) ? type : "info";
  }

  function normalizeSettingValue(value, type) {
    if (type === "boolean") {
      return value !== false;
    }

    if (type === "number") {
      return value === null || value === undefined || value === "" ? "" : Number(value);
    }

    if (type === "multi-select") {
      return Array.isArray(value) ? value.map((item) => String(item)) : [];
    }

    return value ?? "";
  }

  function defaultValueForType(type, moduleDefinition) {
    if (type === "boolean") {
      return moduleDefinition.status === "enabled";
    }

    if (type === "multi-select") {
      return [];
    }

    return "";
  }

  function normalizeInputMode(inputmode) {
    const value = String(inputmode || "").trim();
    const supported = new Set(["none", "text", "decimal", "numeric", "tel", "search", "email", "url"]);

    return supported.has(value) ? value : "";
  }

  function normalizeNumberAttribute(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const number = Number(value);
    return Number.isFinite(number) ? String(value) : "";
  }

  function normalizeStepAttribute(value) {
    if (value === "any") {
      return "any";
    }

    return normalizeNumberAttribute(value);
  }

  function normalizeReason(value) {
    return String(value || "").trim();
  }

  root.settingsNormalizers = {
    normalizeModuleSettings,
    normalizeModuleSettingsFromModules,
  };
  global.LongtailForge = root;
})(window);
