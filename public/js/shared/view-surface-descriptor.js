// @ts-check

(function attachViewSurfaceDescriptor(global) {
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptorAdapter} BrowserViewSurfaceDescriptorAdapterContract */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} BrowserViewSurfaceDescriptorContract */
  /** @typedef {"unknown" | "string" | "boolean" | "number" | "string-or-number" | "record-or-string" | "enum" | "record" | "array" | "string-array" | "string-map"} ProjectionKind */
  /** @typedef {{ kind: ProjectionKind, required?: boolean, nullable?: boolean, nonEmpty?: boolean, values?: readonly string[], fields?: Record<string, ProjectionSpec>, allowUnknown?: boolean, item?: ProjectionSpec, defaultValue?: unknown }} ProjectionSpec */

  const root = global.LongtailForge || {};
  const labelFields = Object.freeze({
    label: stringSpec(),
    labelKey: stringSpec(),
    title: stringSpec(),
    titleKey: stringSpec(),
    description: stringSpec(),
    descriptionKey: stringSpec(),
  });
  const openRecordSpec = recordSpec({}, { allowUnknown: true });
  const visibleWhenSpec = recordSpec({
    field: stringSpec({ required: true, nonEmpty: true }),
    equals: unknownSpec(),
    in: arraySpec(unknownSpec()),
    truthy: booleanSpec(),
    falsy: booleanSpec(),
  });
  const actionSpec = recordSpec({
    publicDemoCapability: stringSpec(),
    id: stringSpec({ required: true, nonEmpty: true }),
    ...labelFields,
    role: enumSpec(["primary", "secondary", "destructive", "utility"]),
    icon: stringSpec(),
    iconOnly: booleanSpec(),
    route: stringSpec(),
    method: stringSpec(),
    confirm: recordOrStringSpec(),
    requiredPermissions: stringArraySpec(),
    behavior: stringSpec(),
    visibleWhen: visibleWhenSpec,
  });
  const fieldSpec = recordSpec({
    id: stringSpec(),
    field: stringSpec({ required: true, nonEmpty: true }),
    type: enumSpec([
      "text", "number", "select", "multi-select", "boolean", "checkbox", "toggle", "switch",
      "radio", "textarea", "date", "time", "hidden", "search", "url",
    ], { required: true }),
    label: stringSpec(),
    labelKey: stringSpec(),
    required: booleanSpec(),
    options: arraySpec(unknownSpec()),
    optionsSource: stringSpec(),
    default: unknownSpec(),
    placeholder: stringSpec(),
    min: stringOrNumberSpec(),
    max: stringOrNumberSpec(),
    step: stringOrNumberSpec(),
    inputmode: stringSpec(),
    rows: stringOrNumberSpec(),
    autocomplete: stringSpec(),
    placement: stringSpec(),
    behavior: stringSpec(),
    hidden: booleanSpec(),
    width: stringSpec(),
  });
  const regionSpec = recordSpec({
    ...labelFields,
    id: stringSpec({ required: true, nonEmpty: true }),
    behavior: stringSpec({ required: true, nonEmpty: true }),
    placement: stringSpec(),
    className: stringSpec(),
    ariaLabel: stringSpec(),
  });
  const descriptorSpec = recordSpec({
    id: stringSpec({ defaultValue: "" }),
    moduleId: stringSpec({ defaultValue: "" }),
    viewId: stringSpec({ defaultValue: "" }),
    viewPath: stringSpec(),
    layout: enumSpec(["single-column", "stacked", "sidebar-detail", "slide-out-sidebar", "table-page"], { defaultValue: "single-column" }),
    filterPlacement: enumSpec(["inline", "slide-out-sidebar"]),
    pageHeader: recordSpec({
      ...labelFields,
      primaryAction: actionSpec,
    }),
    sidebarLabel: stringSpec(),
    sidebarPanels: arraySpec(recordSpec({
      ...labelFields,
      id: stringSpec({ required: true, nonEmpty: true }),
      type: enumSpec(["filters", "navigation", "index"], { required: true }),
      behavior: stringSpec(),
      collapsible: booleanSpec(),
      open: booleanSpec(),
      emptyState: openRecordSpec,
      className: stringSpec(),
      ariaLabel: stringSpec(),
      footer: recordSpec({
        ...labelFields,
        id: stringSpec(),
        behavior: stringSpec(),
        className: stringSpec(),
        ariaLabel: stringSpec(),
      }),
    })),
    filters: arraySpec(recordSpec({
      id: stringSpec(),
      field: stringSpec({ required: true, nonEmpty: true }),
      type: stringSpec({ required: true, nonEmpty: true }),
      label: stringSpec(),
      labelKey: stringSpec(),
      options: arraySpec(unknownSpec()),
      optionsSource: stringSpec(),
      default: unknownSpec(),
      queryKey: stringSpec(),
    })),
    indexPanel: recordSpec({
      ...labelFields,
      items: stringSpec(),
      itemTitleField: stringSpec(),
      itemSubtitleField: stringSpec(),
      itemMetaFields: stringArraySpec(),
      itemDepthField: stringSpec(),
      itemParentField: stringSpec(),
      itemPathField: stringSpec(),
      emptyState: openRecordSpec,
      initialSelection: enumSpec(["first", "none"]),
      collapseOnSelect: booleanSpec(),
    }),
    table: recordSpec({
      columns: arraySpec(recordSpec({
        id: stringSpec(),
        field: stringSpec({ required: true, nonEmpty: true }),
        label: stringSpec(),
        labelKey: stringSpec(),
        formatter: enumSpec(["text", "hierarchy-label", "chip-list"]),
        width: stringSpec(),
        widthHint: stringSpec(),
        align: stringSpec(),
        depthField: stringSpec(),
        chipsField: stringSpec(),
        chipLabelField: stringSpec(),
      })),
      secondaryRows: arraySpec(recordSpec({
        ...labelFields,
        id: stringSpec({ required: true, nonEmpty: true }),
        field: stringSpec(),
        formatter: enumSpec(["text", "hierarchy-label", "chip-list"]),
        chipsField: stringSpec(),
        chipLabelField: stringSpec(),
        startColumn: stringSpec(),
        endBeforeColumn: stringSpec(),
        hideWhenEmpty: booleanSpec(),
        className: stringSpec(),
      })),
      rowActions: arraySpec(actionSpec),
      rowActionsHeaderLabel: stringSpec(),
      emptyState: openRecordSpec,
      overflow: booleanSpec(),
      hierarchy: recordSpec({
        depthField: stringSpec(),
        parentField: stringSpec(),
        pathField: stringSpec(),
      }),
      selection: recordSpec({
        enabled: booleanSpec(),
        label: stringSpec(),
        labelKey: stringSpec(),
        headerLabel: stringSpec(),
        recordType: stringSpec(),
        labelField: stringSpec(),
      }),
    }),
    detail: recordSpec({
      header: openRecordSpec,
      badgeRow: openRecordSpec,
      metadataRow: openRecordSpec,
      actionStrip: recordSpec({ actions: arraySpec(actionSpec) }, { allowUnknown: true }),
      summaryPanels: arraySpec(recordSpec({
        ...labelFields,
        messageField: stringSpec(),
        items: arraySpec(recordSpec({
          label: stringSpec(),
          field: stringSpec(),
          value: unknownSpec(),
        })),
      })),
      linkedRecords: recordSpec({
        title: stringSpec(),
        label: stringSpec(),
        recordsField: stringSpec(),
        targetTypeField: stringSpec(),
        targetLabelField: stringSpec(),
        targetUrlField: stringSpec(),
        targetIdField: stringSpec(),
        emptyState: openRecordSpec,
        fields: arraySpec(fieldSpec),
        actions: arraySpec(actionSpec),
      }),
      itemForm: recordSpec({
        title: stringSpec(),
        label: stringSpec(),
        fields: arraySpec(fieldSpec),
        actions: arraySpec(actionSpec),
        emptyState: openRecordSpec,
        editable: booleanSpec(),
      }),
      itemRows: recordSpec({
        itemsField: stringSpec(),
        columns: arraySpec(recordSpec({
          id: stringSpec({ required: true, nonEmpty: true }),
          field: stringSpec(),
          label: stringSpec(),
          labelKey: stringSpec(),
          type: stringSpec(),
          formatter: stringSpec(),
        })),
        actions: arraySpec(actionSpec),
        emptyState: openRecordSpec,
        itemTitleField: stringSpec(),
        itemSubtitleField: stringSpec(),
        chips: arraySpec(recordSpec({
          field: stringSpec({ required: true, nonEmpty: true }),
          label: stringSpec(),
          labelKey: stringSpec(),
        })),
        metaFields: stringArraySpec(),
        rowActions: arraySpec(actionSpec),
        actionsLabel: stringSpec(),
      }),
      emptyState: openRecordSpec,
      regions: arraySpec(regionSpec),
    }),
    modals: arraySpec(recordSpec({
      id: stringSpec({ required: true, nonEmpty: true }),
      label: stringSpec(),
      labelKey: stringSpec(),
      title: stringSpec(),
      titleKey: stringSpec(),
      size: enumSpec(["wide"]),
      fields: arraySpec(fieldSpec),
      footerActions: arraySpec(actionSpec),
      actions: arraySpec(actionSpec),
    })),
    dataSource: recordSpec({
      route: stringSpec({ required: true, nonEmpty: true }),
      method: stringSpec(),
      recordsKey: stringSpec(),
      fieldBindings: stringMapSpec({ required: true, nonEmpty: true }),
    }, { nullable: true }),
    actions: arraySpec(actionSpec),
    regions: arraySpec(regionSpec),
  });

  /** @type {BrowserViewSurfaceDescriptorAdapterContract["normalize"]} */
  function normalize(value) {
    const projected = projectValue(value ?? {}, descriptorSpec, "viewSurface");
    return /** @type {BrowserViewSurfaceDescriptorContract} */ (/** @type {unknown} */ (projected));
  }

  /**
   * @param {unknown} value
   * @param {ProjectionSpec} spec
   * @param {string} path
   * @returns {unknown}
   */
  function projectValue(value, spec, path) {
    if (value === undefined) {
      if (Object.hasOwn(spec, "defaultValue")) {
        return spec.defaultValue;
      }
      if (spec.required) {
        throw contractError(path, "is required");
      }
      return undefined;
    }
    if (value === null && spec.nullable) {
      return null;
    }

    if (spec.kind === "unknown") {
      return value;
    }
    if (spec.kind === "string") {
      if (typeof value !== "string" || (spec.nonEmpty && value.trim() === "")) {
        throw contractError(path, spec.nonEmpty ? "must be a non-empty string" : "must be a string");
      }
      return value;
    }
    if (spec.kind === "boolean") {
      if (typeof value !== "boolean") {
        throw contractError(path, "must be a boolean");
      }
      return value;
    }
    if (spec.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw contractError(path, "must be a finite number");
      }
      return value;
    }
    if (spec.kind === "string-or-number") {
      if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && !Number.isFinite(value))) {
        throw contractError(path, "must be a string or finite number");
      }
      return value;
    }
    if (spec.kind === "record-or-string") {
      if (typeof value === "string") {
        return value;
      }
      return { ...requireRecord(value, path) };
    }
    if (spec.kind === "enum") {
      if (typeof value !== "string" || !spec.values?.includes(value)) {
        throw contractError(path, `must be one of ${(spec.values || []).join(", ")}`);
      }
      return value;
    }
    if (spec.kind === "string-array") {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw contractError(path, "must be an array of strings");
      }
      return [...value];
    }
    if (spec.kind === "array") {
      if (!Array.isArray(value)) {
        throw contractError(path, "must be an array");
      }
      return value.map((entry, index) => projectValue(entry, spec.item || unknownSpec(), `${path}[${index}]`));
    }
    if (spec.kind === "string-map") {
      const record = requireRecord(value, path);
      const projected = {};
      for (const [key, entry] of Object.entries(record)) {
        if (typeof entry !== "string" || (spec.nonEmpty && entry.trim() === "")) {
          throw contractError(`${path}.${key}`, spec.nonEmpty ? "must be a non-empty string" : "must be a string");
        }
        projected[key] = entry;
      }
      return projected;
    }
    if (spec.kind === "record") {
      const record = requireRecord(value, path);
      const fields = spec.fields || {};
      if (!spec.allowUnknown) {
        for (const key of Object.keys(record)) {
          if (!Object.hasOwn(fields, key)) {
            throw contractError(`${path}.${key}`, "is not a supported descriptor field");
          }
        }
      }
      const projected = spec.allowUnknown ? { ...record } : {};
      for (const [key, fieldSpec] of Object.entries(fields)) {
        const fieldValue = projectValue(record[key], fieldSpec, `${path}.${key}`);
        if (fieldValue !== undefined) {
          projected[key] = fieldValue;
        } else {
          delete projected[key];
        }
      }
      return projected;
    }
    throw contractError(path, "has an unsupported projection rule");
  }

  /** @param {unknown} value @param {string} path @returns {Record<string, unknown>} */
  function requireRecord(value, path) {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
      throw contractError(path, "must be an object");
    }
    return /** @type {Record<string, unknown>} */ (value);
  }

  /** @param {string} path @param {string} message */
  function contractError(path, message) {
    return new TypeError(`Invalid view surface descriptor: ${path} ${message}.`);
  }

  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function unknownSpec(options = {}) { return { kind: "unknown", ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function stringSpec(options = {}) { return { kind: "string", ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function booleanSpec(options = {}) { return { kind: "boolean", ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function stringOrNumberSpec(options = {}) { return { kind: "string-or-number", ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function recordOrStringSpec(options = {}) { return { kind: "record-or-string", ...options }; }
  /** @param {readonly string[]} values @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function enumSpec(values, options = {}) { return { kind: "enum", values, ...options }; }
  /** @param {ProjectionSpec} item @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function arraySpec(item, options = {}) { return { kind: "array", item, ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function stringArraySpec(options = {}) { return { kind: "string-array", ...options }; }
  /** @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function stringMapSpec(options = {}) { return { kind: "string-map", ...options }; }
  /** @param {Record<string, ProjectionSpec>} fields @param {Partial<ProjectionSpec>} [options] @returns {ProjectionSpec} */
  function recordSpec(fields, options = {}) { return { kind: "record", fields, ...options }; }

  root.viewSurfaceDescriptor = Object.freeze({ normalize });
  global.LongtailForge = root;
})(window);
