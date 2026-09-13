// Framework Reporting host. Catalog contributions provide filter metadata,
// permission-filtered renderer assets, and stable renderer IDs. Module assets
// register option hydration and result rendering outside the data-only catalog.
(function attachReportingPage() {
  const reportingHost = document.querySelector("[data-reporting-host]");
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this path cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it. The
   * graceful path that legitimately runs without the factory keeps its own optional read.
   * @returns {BrowserViewFactory}
   */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFieldElement} BrowserViewFieldElement */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFieldControl} BrowserViewFieldControl */

  /**
   * The control a field rendered. `viewParts.control` is null only on the radio path, where a
   * descriptor carrying no options renders a legend and no inputs; every caller here builds a
   * field that has one.
   * @param {BrowserViewFieldElement} field
   * @returns {BrowserViewFieldControl}
   */
  function fieldControl(field) {
    const control = field.viewParts.control;
    if (!control) {
      throw new Error("Reporting fields require a rendered control.");
    }
    return control;
  }

  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Reporting requires LongtailForge.view.");
    }
    return factory;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagFilterPickerController} BrowserTagFilterPickerController */

  /**
   * One filter a report contributes, as this host reads it.
   *
   * **Every member is optional except the two this page indexes by.** The catalog is a data-only
   * contribution assembled by whichever module owns the report, so this describes what the host
   * reaches for rather than what a contributor must send - `type` and `id` are the two it cannot
   * work without, and the rest are read behind their own guards.
   * @typedef {object} ReportingFilter
   * @property {string} id
   * @property {string} type
   * @property {unknown} [defaultValue]
   * @property {string} [label]
   * @property {string[]} [queryKeys]
   * @property {boolean} [required]
   * @property {unknown} [visibleWhen]
   */

  /**
   * One report in the catalog, as this host reads it.
   * @typedef {object} ReportingReport
   * @property {string} reportKey
   * @property {ReportingFilter[]} [filters]
   * @property {string} [label]
   * @property {string} [renderer]
   * @property {unknown[]} [rendererAssets]
   */

  /**
   * What one rendered filter field keeps: the controls it owns, the contribution it came from,
   * the wrapper it lives in, and - for a tag filter only - the picker mounted on its input.
   * @typedef {object} ReportingFilterField
   * @property {Map<string, BrowserViewFieldControl>} controls
   * @property {ReportingFilter} filter
   * @property {HTMLElement} wrapper
   * @property {BrowserTagFilterPickerController | null} [tagFilterController]
   */

  /**
   * A registered renderer, as this host reads it.
   *
   * `registerRenderer` refuses a registration without a callable `render`, so that one is
   * required; the other three are optional because a renderer that does not offer them is a real
   * state every call site already guards with `typeof === "function"`.
   * @typedef {object} ReportingRenderer
   * @property {(context?: unknown, result?: unknown) => unknown} render
   * @property {(context?: unknown) => unknown} [initializeFilters]
   * @property {(context?: unknown, result?: unknown) => unknown} [synchronizeFilters]
   * @property {(context?: unknown) => unknown} [validateFilters]
   */

  /** @type {Map<string, ReportingRenderer>} */
  const reportRenderers = new Map();
  /** @type {Map<string, Promise<void>>} */
  const rendererAssetLoads = new Map();

  /**
   * @typedef {object} ReportingState
   * @property {ReportingReport[]} reports
   * @property {ReportingReport | null} selectedReport
   * @property {ReportingRenderer | null} renderer
   * @property {Map<string, ReportingFilterField>} filterFields
   * @property {number} selectionGeneration
   * @property {number} executionGeneration
   */

  /** @type {ReportingState} */
  const reportingState = {
    reports: [],
    selectedReport: null,
    renderer: null,
    filterFields: new Map(),
    selectionGeneration: 0,
    executionGeneration: 0,
  };

  /**
   * The report picker, as whichever control the view factory rendered for a `select` field.
   * The contract's union is three controls and all three carry `value`, which is the only member
   * read here - so it is kept as the union rather than narrowed to a guess about the renderer.
   * @type {BrowserViewFieldControl | null}
   */
  let reportSelector = null;
  /** @type {HTMLElement | null} */
  let reportSelectorPanel = null;
  /** @type {HTMLElement | null} */
  let reportFilterPanel = null;
  /** @type {HTMLElement | null} */
  let reportStatus = null;
  /** @type {HTMLElement | null} */
  let reportResultsHost = null;

  /**
   * Narrow at an access this host already made unguarded.
   *
   * These five are built by `buildReportingHost` at load, so a missing one means the host never
   * assembled - the same failure the bare dereference produced, now named.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireReportingValue(value, name) {
    if (value === null) {
      throw new TypeError(`Reporting requires its ${name}.`);
    }

    return value;
  }

  publishReportingApi();
  buildReportingHost();
  loadReportCatalog();

  function publishReportingApi() {
    // A plain replacement. `0.33.33.38.2.4.4` removed a spread of the previous value: this
    // page controller is the only writer, it is delivered by one classic script tag, and
    // `reportRenderers` is a file-local map, so there was never a prior value to preserve.
    const namespace = window.LongtailForge = window.LongtailForge || {};
    namespace.reporting = {
      registerRenderer,
    };
  }

  /** @param {unknown} [rendererId] @param {unknown} [registration] @returns {void} */
  function registerRenderer(rendererId, registration) {
    const normalizedId = String(rendererId || "").trim();
    const normalizedRegistration = typeof registration === "function"
      ? { render: registration }
      : registration;

    if (!normalizedId || typeof normalizedRegistration !== "object" || normalizedRegistration === null) {
      return;
    }

    const render = Object.hasOwn(normalizedRegistration, "render")
      ? /** @type {Record<string, unknown>} */ (normalizedRegistration).render
      : undefined;
    if (typeof render !== "function") {
      return;
    }

    reportRenderers.set(normalizedId, /** @type {ReportingRenderer} */ (normalizedRegistration));
  }

  function buildReportingHost() {
    const reportingView = window.LongtailForge?.view;
    if (!reportingHost || !reportingView) {
      return;
    }

    const header = reportingView.createPageHeader({
      title: "Reporting",
      subtitle: "Run available workspace reports without leaving the current work context.",
    });
    const selectorField = reportingView.createField({
      field: "report",
      type: "select",
      label: "Report",
    }, {
      controlAttrs: { "aria-label": "Report" },
      controlDataset: { reportingSelector: "" },
    });
    reportSelector = fieldControl(selectorField);
    reportSelectorPanel = reportingView.createInfoPanel({
      ariaLabel: "Report selection",
      title: "Choose a report",
      headingLevel: 2,
    });
    reportSelectorPanel.appendChild(reportingView.createFieldGrid({
      surface: false,
      fields: [selectorField],
    }));
    reportFilterPanel = createReportFilterPanel([]);
    requireReportingValue(reportFilterPanel, "filter panel").hidden = true;
    reportStatus = reportingView.createStatusMessage({ hidden: true });
    reportStatus.dataset.reportingStatus = "";
    reportResultsHost = reportingView.createListShell({
      ariaLabel: "Report results",
      status: false,
      dataset: { reportingResultsHost: "" },
    });

    reportingHost.replaceChildren(
      header,
      reportSelectorPanel,
      reportFilterPanel,
      reportStatus,
      reportResultsHost,
    );

    requireReportingValue(reportSelector, "report selector").addEventListener("change", () => {
      selectReport(requireReportingValue(reportSelector, "report selector").value);
    });
  }

  async function loadReportCatalog() {
    const reportingView = window.LongtailForge?.view;
    if (!reportingHost || !reportingView) {
      return;
    }

    setReportingStatus("Loading available reports...");

    try {
      const response = await fetch("/api/reporting/catalog", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load the report catalog: ${response.status}`);
      }

      const payload = await response.json();
      reportingState.reports = Array.isArray(payload?.reports) ? payload.reports : [];
      renderReportSelector();

      if (reportingState.reports.length === 0) {
        renderEmptyCatalog();
        return;
      }

      const query = new URLSearchParams(window.location.search);
      const requestedReportKey = query.get("report") || query.get("reportKey") || "";
      const selectedReport = reportingState.reports.find((report) => report.reportKey === requestedReportKey)
        || reportingState.reports[0];
      requireReportingValue(reportSelector, "report selector").value = selectedReport.reportKey;
      await selectReport(selectedReport.reportKey, { initial: true });
    } catch (error) {
      renderReportingError("Reports could not be loaded.");
      console.error(error);
    }
  }

  function renderReportSelector() {
    const reportingView = requireView();
    requireReportingValue(reportSelector, "report selector").replaceChildren(...reportingState.reports.map((report) => reportingView.createElement("option", {
      attrs: { value: report.reportKey },
      text: report.label || "Report",
    })));
    requireReportingValue(reportSelector, "report selector").disabled = reportingState.reports.length === 0;
  }

  function renderEmptyCatalog() {
    const reportingView = requireView();
    reportingState.selectedReport = null;
    reportingState.renderer = null;
    requireReportingValue(reportFilterPanel, "filter panel").hidden = true;
    setReportingStatus("");
    requireReportingValue(reportResultsHost, "results host").replaceChildren(reportingView.createEmptyState({
      title: "No reports available",
      message: "No reports are available for this workspace and your current access.",
    }));
  }

  /** @param {string} reportKey @param {{ initial?: boolean }} [options] @returns {Promise<void>} */
  async function selectReport(reportKey, options = {}) {
    const report = reportingState.reports.find((candidate) => candidate.reportKey === reportKey)
      || reportingState.reports[0];
    if (!report) {
      renderEmptyCatalog();
      return;
    }

    const generation = ++reportingState.selectionGeneration;
    reportingState.executionGeneration += 1;
    reportingState.selectedReport = report;
    reportingState.renderer = null;
    requireReportingValue(reportSelector, "report selector").value = report.reportKey;
    renderReportFilters(report.filters || []);
    requireReportingValue(reportResultsHost, "results host").replaceChildren();
    setReportingStatus(`Loading ${report.label || "report"}...`);

    try {
      await loadRendererAssets(report.rendererAssets || []);
      if (generation !== reportingState.selectionGeneration) {
        return;
      }

      const renderer = reportRenderers.get(report.renderer || "");
      if (!renderer) {
        renderRendererUnavailable();
        return;
      }

      reportingState.renderer = renderer;
      const context = createRendererContext();
      if (typeof renderer.initializeFilters === "function") {
        await renderer.initializeFilters(context);
      }
      if (generation !== reportingState.selectionGeneration) {
        return;
      }

      applyQueryFilterValues(new URLSearchParams(window.location.search));
      if (typeof renderer.synchronizeFilters === "function") {
        await renderer.synchronizeFilters(createRendererContext(), null);
      }
      updateConditionalFilterVisibility();
      syncReportingUrl({ replace: true });
      await executeSelectedReport();
    } catch (error) {
      if (generation !== reportingState.selectionGeneration) {
        return;
      }
      renderReportingError("This report could not be prepared.");
      console.error(error);
    }

    if (!options.initial) {
      requireReportingValue(reportSelector, "report selector").focus();
    }
  }

  /** @param {HTMLElement[]} fields @returns {HTMLElement} */
  function createReportFilterPanel(fields) {
    const reportingView = requireView();
    const panel = reportingView.createFilterPanel({
      title: "Filters",
      ariaLabel: "Report filters",
      open: true,
      fields,
    });
    panel.dataset.reportingFilterHost = "";
    panel.addEventListener("change", handleReportFilterChange);
    return panel;
  }

  /** @param {ReportingFilter[]} filters @returns {void} */
  function renderReportFilters(filters) {
    reportingState.filterFields.clear();
    const fields = filters.map(createReportFilterField);
    const nextPanel = createReportFilterPanel(fields);
    requireReportingValue(reportFilterPanel, "filter panel").replaceWith(nextPanel);
    reportFilterPanel = nextPanel;
    requireReportingValue(reportFilterPanel, "filter panel").hidden = filters.length === 0;
  }

  /** @param {ReportingFilter} filter @returns {HTMLElement} */
  function createReportFilterField(filter) {
    const reportingView = requireView();
    if (filter.type === "custom-date-range") {
      return createCustomDateRangeField(filter);
    }
    const fieldType = filter.type === "project-multi-select"
      ? "multi-select"
      : filter.type === "boolean"
        ? "boolean"
        : filter.type === "tag"
          ? "text"
          : "select";
    const wrapper = reportingView.createField({
      field: filter.id,
      type: fieldType,
      label: filter.label,
      options: filter.type === "billing-period" ? [
        ["current", "Current billing period"],
        ["last", "Last billing period"],
        ["custom", "Custom"],
      ] : [],
      default: filter.defaultValue,
    }, {
      className: filter.type === "tag" ? "tag-filter-control" : "",
      controlAttrs: filter.type === "tag" ? { placeholder: "Type to search tags" } : {},
      disabled: filter.type === "project-multi-select",
      dataset: { reportingFilter: filter.id },
      controlDataset: { reportingFilterControl: filter.id },
    });
    const control = fieldControl(wrapper);
    /** @type {ReportingFilterField} */
    const fieldState = {
      controls: new Map([[filterQueryKeys(filter)[0] || filter.id, control]]),
      filter,
      wrapper,
    };
    if (filter.type === "tag") {
      // Narrowed here rather than by widening `BrowserViewFieldControl`: the view primitive can
      // answer a select or a textarea, and the filter picker mounts only on an input.
      fieldState.tagFilterController = control instanceof HTMLInputElement
        ? window.LongtailForge?.tags?.mountFilterPicker?.(control, {
          tags: [],
          value: filter.defaultValue,
        }) || null
        : null;
    }
    reportingState.filterFields.set(filter.id, fieldState);
    setFilterValue(filter.id, filter.defaultValue);
    return wrapper;
  }

  /** @param {ReportingFilter} filter @returns {HTMLElement} */
  function createCustomDateRangeField(filter) {
    const reportingView = requireView();
    const [startKey, endKey] = filterQueryKeys(filter);
    const startField = createDateField(filter.id, startKey, "Start Date");
    const endField = createDateField(filter.id, endKey, "End Date");
    const startInput = fieldControl(startField);
    const endInput = fieldControl(endField);
    const wrapper = reportingView.createElement("fieldset", {
      dataset: { reportingFilter: filter.id },
      children: [
        reportingView.createElement("legend", { text: filter.label }),
        reportingView.createFieldGrid({
          surface: false,
          fields: [startField, endField],
        }),
      ],
    });
    reportingState.filterFields.set(filter.id, {
      controls: new Map([[startKey, startInput], [endKey, endInput]]),
      filter,
      wrapper,
    });
    setDefaultDateRange(startInput, endInput);
    return wrapper;
  }

  /** @param {string} filterId @param {string} queryKey @param {string} label @returns {BrowserViewFieldElement} */
  function createDateField(filterId, queryKey, label) {
    const reportingView = requireView();
    return reportingView.createField({
      field: queryKey,
      type: "date",
      label,
    }, {
      controlDataset: {
        reportingFilterControl: filterId,
        reportingFilterQueryKey: queryKey,
      },
    });
  }

  /** @param {string} value @param {string} label @param {{ disabled?: boolean, selected?: boolean }} [options] @returns {HTMLOptionElement} */
  function createOption(value, label, options = {}) {
    const reportingView = requireView();
    const option = reportingView.createElement("option", {
      attrs: { value },
      text: label,
    });
    option.disabled = Boolean(options.disabled);
    option.selected = Boolean(options.selected);
    return option;
  }

  /** @param {Event} event @returns {Promise<void>} */
  async function handleReportFilterChange(event) {
    const eventTarget = event.target instanceof Element ? event.target : null;
    const control = eventTarget?.closest("[data-reporting-filter-control]");
    const panel = requireReportingValue(reportFilterPanel, "filter panel");

    if (!(control instanceof HTMLElement) || !panel.contains(control) || !reportingState.renderer) {
      return;
    }

    const changedFilterId = control.dataset.reportingFilterControl;
    try {
      if (typeof reportingState.renderer.synchronizeFilters === "function") {
        await reportingState.renderer.synchronizeFilters(createRendererContext(), changedFilterId);
      }
      updateConditionalFilterVisibility();
      syncReportingUrl({ replace: true });
      await executeSelectedReport();
    } catch (error) {
      renderReportingError("The report filters could not be updated.");
      console.error(error);
    }
  }

  function createRendererContext() {
    return {
      report: reportingState.selectedReport,
      queryParams: new URLSearchParams(window.location.search),
      view: window.LongtailForge?.view,
      getFilterControl,
      getFilterValue,
      setFilterDisabled,
      setFilterHidden,
      setFilterOptions,
      setFilterValue,
      refresh: executeSelectedReport,
    };
  }

  /** @param {string} filterId @param {string} [queryKey] @returns {BrowserViewFieldControl | null} */
  function getFilterControl(filterId, queryKey = "") {
    const field = reportingState.filterFields.get(filterId);
    if (!field) {
      return null;
    }
    return queryKey ? field.controls.get(queryKey) || null : field.controls.values().next().value || null;
  }

  /** @param {string} filterId @returns {unknown} */
  function getFilterValue(filterId) {
    const field = reportingState.filterFields.get(filterId);
    if (!field) {
      return null;
    }

    if (field.filter.type === "custom-date-range") {
      return Object.fromEntries([...field.controls].map(([queryKey, control]) => [queryKey, control.value]));
    }
    const control = getFilterControl(filterId);
    if (field.filter.type === "boolean") {
      return control instanceof HTMLInputElement && control.checked;
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      return [...control.selectedOptions].map((option) => option.value);
    }
    if (field.filter.type === "tag") {
      const value = field.tagFilterController?.readValue?.() || control?.dataset?.tagFilterValue || "all";
      return value && value !== "all" ? [value] : [];
    }
    return control?.value || "";
  }

  /** @param {string} filterId @param {unknown} value @returns {void} */
  function setFilterValue(filterId, value) {
    const field = reportingState.filterFields.get(filterId);
    if (!field || value === undefined || value === null) {
      return;
    }

    if (field.filter.type === "custom-date-range") {
      const range = typeof value === "object" && value !== null ? value : {};

      [...field.controls].forEach(([queryKey, control]) => {
        const nextValue = Object.hasOwn(range, queryKey)
          ? /** @type {Record<string, unknown>} */ (range)[queryKey]
          : undefined;
        if (nextValue !== undefined) {
          control.value = String(nextValue || "");
        }
      });
      return;
    }

    const control = getFilterControl(filterId);
    if (field.filter.type === "boolean") {
      if (control instanceof HTMLInputElement) {
        control.checked = parseBoolean(value, Boolean(field.filter.defaultValue));
      }
      return;
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      const values = new Set(normalizeListValue(value));
      [...control.options].forEach((option) => {
        option.selected = values.has(option.value);
      });
      return;
    }
    if (field.filter.type === "tag") {
      const nextValue = Array.isArray(value) ? value[0] || "all" : value || "all";
      if (field.tagFilterController) {
        field.tagFilterController.setValue(nextValue);
      } else if (control) {
        control.value = String(nextValue);
      }
      return;
    }
    if (control) {
      setSelectValueWhenAvailable(control, String(value || ""));
    }
  }

  /**
     * @param {string} filterId
     * @param {unknown} options
     * @param {{ placeholder?: string, preserveValue?: boolean, selectAll?: boolean,
   *   selectedValues?: unknown, value?: unknown }} [config]
     * @returns {void}
     */
  function setFilterOptions(filterId, options, config = {}) {
    const field = reportingState.filterFields.get(filterId);
    const control = getFilterControl(filterId);
    if (field?.filter.type === "tag" && field.tagFilterController) {
      const noTagsValue = window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
      const tags = (Array.isArray(options) ? options : [])
        .map((/** @type {Record<string, unknown>} */ option) => ({
          tag_id: String(option?.value ?? option?.id ?? ""),
          name: String(option?.label ?? option?.name ?? ""),
        }))
        .filter((tag) => tag.tag_id && tag.tag_id !== noTagsValue && tag.tag_id !== "all");
      const requestedValue = config.value !== undefined
        ? config.value
        : config.selectedValues !== undefined
          ? normalizeListValue(config.selectedValues)[0] || "all"
          : field.tagFilterController.readValue();
      field.tagFilterController.setTags(tags);
      field.tagFilterController.setValue(requestedValue);
      return;
    }
    if (!(control instanceof HTMLSelectElement)) {
      return;
    }

    const previousValues = control.multiple
      ? [...control.selectedOptions].map((option) => option.value)
      : [control.value];
    const requestedValues = config.selectedValues !== undefined
      ? normalizeListValue(config.selectedValues)
      : config.value !== undefined
        ? [String(config.value || "")]
        : previousValues;
    const optionNodes = [];
    if (!control.multiple && config.placeholder) {
      optionNodes.push(createOption("", config.placeholder));
    }
    for (const option of /** @type {Record<string, unknown>[]} */ (Array.isArray(options) ? options : [])) {
      optionNodes.push(createOption(
        String(option?.value ?? option?.id ?? ""),
        String(option?.label ?? option?.name ?? ""),
        option || {},
      ));
    }
    control.replaceChildren(...optionNodes);

    if (control.multiple && config.selectAll && requestedValues.length === 0) {
      [...control.options].forEach((option) => {
        option.selected = Boolean(option.value);
      });
    } else if (control.multiple) {
      const selectedValues = new Set(requestedValues);
      [...control.options].forEach((option) => {
        option.selected = selectedValues.has(option.value);
      });
    } else {
      setSelectValueWhenAvailable(control, requestedValues[0] || "");
    }
  }

  /** @param {string} filterId @param {unknown} hidden @returns {void} */
  function setFilterHidden(filterId, hidden) {
    const field = reportingState.filterFields.get(filterId);
    if (field) {
      field.wrapper.hidden = Boolean(hidden);
      field.wrapper.dataset.reportingAdapterHidden = hidden ? "true" : "false";
    }
  }

  /** @param {string} filterId @param {unknown} disabled @returns {void} */
  function setFilterDisabled(filterId, disabled) {
    const field = reportingState.filterFields.get(filterId);
    if (!field) {
      return;
    }
    field.controls.forEach((control) => {
      control.disabled = Boolean(disabled);
      control.dataset.reportingAdapterDisabled = disabled ? "true" : "false";
    });
  }

  /** @param {URLSearchParams} query @returns {void} */
  function applyQueryFilterValues(query) {
    for (const [filterId, field] of reportingState.filterFields) {
      if (field.filter.type === "custom-date-range") {
        const values = Object.fromEntries(filterQueryKeys(field.filter)
          .filter((queryKey) => query.has(queryKey))
          .map((queryKey) => [queryKey, query.get(queryKey)]));
        setFilterValue(filterId, values);
        continue;
      }
      const queryKey = filterQueryKeys(field.filter)[0];
      if (query.has(queryKey)) {
        setFilterValue(filterId, query.getAll(queryKey));
      }
    }
  }

  function updateConditionalFilterVisibility() {
    for (const field of reportingState.filterFields.values()) {
      const condition = field.filter.visibleWhen;
      if (!condition) {
        continue;
      }

      const visible = typeof condition === "object" && condition !== null
        && getFilterValue(String(/** @type {Record<string, unknown>} */ (condition).filterId || ""))
          === /** @type {Record<string, unknown>} */ (condition).equals;
      field.wrapper.hidden = !visible;
      field.controls.forEach((control) => {
        if (!visible) {
          control.disabled = true;
          control.dataset.reportingConditionalDisabled = "true";
        } else if (control.dataset.reportingConditionalDisabled === "true") {
          control.disabled = control.dataset.reportingAdapterDisabled === "true";
          delete control.dataset.reportingConditionalDisabled;
        }
      });
    }
  }

  async function executeSelectedReport() {
    const report = reportingState.selectedReport;
    const renderer = reportingState.renderer;
    if (!report || !renderer) {
      return;
    }

    const validationMessage = validateReportFilters(report, renderer);
    if (validationMessage) {
      reportingState.executionGeneration += 1;
      requireReportingValue(reportResultsHost, "results host").replaceChildren();
      setReportingStatus(validationMessage);
      return;
    }

    const generation = ++reportingState.executionGeneration;
    const params = buildExecutionParams(report.filters || []);
    setReportingStatus(`Loading ${report.label || "report"} results...`);
    requireReportingValue(reportResultsHost, "results host").replaceChildren();

    try {
      const response = await fetch(
        `/api/reporting/reports/${encodeURIComponent(report.reportKey)}/run?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = await readJsonResponse(response);
      if (generation !== reportingState.executionGeneration) {
        return;
      }
      const envelope = readExecutionEnvelope(payload);
      if (!response.ok || envelope.status !== "ready") {
        renderReportingError(envelope.errorMessage || "The report could not be run.");
        return;
      }
      if (envelope.reportKey !== report.reportKey || envelope.renderer !== (report.renderer || "")) {
        renderRendererUnavailable();
        return;
      }

      const rendered = await renderer.render(envelope.result, createRendererContext());
      if (generation !== reportingState.executionGeneration) {
        return;
      }
      renderExecutionResult(rendered);
    } catch (error) {
      if (generation !== reportingState.executionGeneration) {
        return;
      }
      renderReportingError("The report could not be run.");
      console.error(error);
    }
  }

  /** @param {ReportingReport | null} report @param {ReportingRenderer | null} renderer @returns {string} */
  function validateReportFilters(report, renderer) {
    for (const filter of report?.filters || []) {
      if (!filter.required || !filterIsVisible(filter)) {
        continue;
      }
      const value = getFilterValue(filter.id);
      if (value === "" || value === null || Array.isArray(value) && value.length === 0) {
        return `Choose ${String(filter.label || "a required filter").toLowerCase()}.`;
      }
    }

    if (typeof renderer?.validateFilters === "function") {
      return String(renderer.validateFilters(createRendererContext()) || "");
    }
    return "";
  }

  /** @param {ReportingFilter[]} filters @returns {URLSearchParams} */
  function buildExecutionParams(filters) {
    const params = new URLSearchParams();
    for (const filter of filters) {
      if (!filterIsVisible(filter)) {
        continue;
      }
      const value = getFilterValue(filter.id);
      if (filter.type === "custom-date-range") {
        const range = typeof value === "object" && value !== null ? value : {};

        filterQueryKeys(filter).forEach((queryKey) => {
          const rangeValue = Object.hasOwn(range, queryKey)
            ? /** @type {Record<string, unknown>} */ (range)[queryKey]
            : undefined;
          if (rangeValue) {
            params.set(queryKey, String(rangeValue));
          }
        });
      } else if (Array.isArray(value)) {
        if (value.length) {
          params.set(filterQueryKeys(filter)[0], value.join(","));
        }
      } else if (filter.type === "boolean") {
        params.set(filterQueryKeys(filter)[0], value ? "true" : "false");
      } else if (value) {
        params.set(filterQueryKeys(filter)[0], String(value));
      }
    }
    return params;
  }

  /**
   * What a report execution answered, as this host reads it.
   *
   * The body is a wire value, so each member is asked for rather than assumed - and the failure
   * message is read two levels down, which is why it is resolved here instead of at the guard.
   * @param {unknown} payload
   * @returns {{ errorMessage: string, renderer: string, reportKey: string, result: unknown, status: string }}
   */
  function readExecutionEnvelope(payload) {
    const body = typeof payload === "object" && payload !== null
      ? /** @type {Record<string, unknown>} */ (payload)
      : {};
    const error = typeof body.error === "object" && body.error !== null
      ? /** @type {Record<string, unknown>} */ (body.error)
      : {};

    return {
      errorMessage: typeof error.message === "string" ? error.message : "",
      renderer: typeof body.renderer === "string" ? body.renderer : "",
      reportKey: typeof body.reportKey === "string" ? body.reportKey : "",
      result: body.result,
      status: typeof body.status === "string" ? body.status : "",
    };
  }

  /**
   * The query keys a filter contributes, or its own id when it names none.
   *
   * A contribution may omit them - the catalog is data-only and assembled by whichever module
   * owns the report - and every call site already fell back to the filter's id, so this states
   * that fallback once instead of at each read.
   * @param {ReportingFilter} filter
   * @returns {string[]}
   */
  function filterQueryKeys(filter) {
    return Array.isArray(filter.queryKeys) && filter.queryKeys.length > 0
      ? filter.queryKeys
      : [filter.id];
  }

  /** @param {ReportingFilter} filter @returns {boolean} */
  function filterIsVisible(filter) {
    if (!filter.visibleWhen) {
      return true;
    }
    const condition = typeof filter.visibleWhen === "object" && filter.visibleWhen !== null
      ? /** @type {Record<string, unknown>} */ (filter.visibleWhen)
      : null;

    return condition !== null
      && getFilterValue(String(condition.filterId || "")) === condition.equals;
  }

  /** @param {unknown} rendered @returns {void} */
  function renderExecutionResult(rendered) {
    const reportingView = requireView();
    const answer = typeof rendered === "object" && rendered !== null
      ? /** @type {Record<string, unknown>} */ (rendered)
      : null;

    if (answer?.state === "empty") {
      setReportingStatus("");
      requireReportingValue(reportResultsHost, "results host").replaceChildren(reportingView.createEmptyState({
        title: String(answer.title || "No results"),
        message: String(answer.message || "No records match these report filters."),
      }));
      return;
    }

    const content = answer?.content || rendered;
    if (typeof content !== "object" || content === null || typeof /** @type {Record<string, unknown>} */ (content).nodeType !== "number") {
      renderReportingError("Report results could not be displayed.");
      return;
    }
    requireReportingValue(reportResultsHost, "results host")
      .replaceChildren(/** @type {Node} */ (content));
    setReportingStatus("");
  }

  function renderRendererUnavailable() {
    renderReportingError("This report's result view is unavailable.", {
      title: "Report view unavailable",
    });
  }

  /** @param {string} message @param {{ title?: string, tone?: string }} [options] @returns {void} */
  function renderReportingError(message, options = {}) {
    const reportingView = requireView();
    setReportingStatus(message, { isError: true });
    reportResultsHost?.replaceChildren(reportingView.createEmptyState({
      title: options.title || "Report unavailable",
      message,
      role: "alert",
    }));
  }

  /** @param {string} message @param {{ isError?: boolean, tone?: string }} [options] @returns {void} */
  function setReportingStatus(message, options = {}) {
    if (!reportStatus) {
      return;
    }
    requireReportingValue(reportStatus, "status line").textContent = message || "";
    requireReportingValue(reportStatus, "status line").hidden = !message;
    reportStatus.dataset.viewTone = options.isError ? "error" : "info";
    reportStatus.setAttribute("role", options.isError ? "alert" : "status");
  }

  /** @param {{ replace?: boolean }} [options] @returns {void} */
  function syncReportingUrl(options = {}) {
    const report = reportingState.selectedReport;
    if (!report || !window.history?.replaceState) {
      return;
    }
    const query = new URLSearchParams(window.location.search);
    query.delete("reportKey");
    query.set("report", report.reportKey);
    for (const filter of report.filters || []) {
      filterQueryKeys(filter).forEach((queryKey) => query.delete(queryKey));
    }
    const executionParams = buildExecutionParams(report.filters || []);
    executionParams.forEach((value, queryKey) => query.set(queryKey, value));
    const nextUrl = `${window.location.pathname}${query.toString() ? `?${query.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
    if (!options.replace) {
      window.dispatchEvent(new window.Event("reporting:url-updated"));
    }
  }

  /** @param {unknown[]} assets @returns {Promise<void>} */
  async function loadRendererAssets(assets) {
    for (const asset of assets) {
      await loadRendererAsset(asset);
    }
  }

  /** @param {unknown} asset @returns {Promise<void>} */
  function loadRendererAsset(asset) {
    const record = typeof asset === "object" && asset !== null
      ? /** @type {Record<string, unknown>} */ (asset)
      : {};
    const path = String(record.path || "").trim();
    const type = String(record.type || "").trim();
    if (!path || !["script", "style"].includes(type)) {
      return Promise.reject(new Error("The report renderer asset is invalid."));
    }

    const key = `${type}:${new window.URL(path, document.baseURI).href}`;
    const pending = rendererAssetLoads.get(key);
    if (pending) {
      return pending;
    }

    const promise = new Promise((resolve, reject) => {
      if (type === "style") {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = path;
        link.addEventListener("load", resolve, { once: true });
        link.addEventListener("error", () => reject(new Error("The report renderer style could not be loaded.")), { once: true });
        document.head.appendChild(link);
        return;
      }

      const script = document.createElement("script");
      script.src = path;
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("The report renderer script could not be loaded.")), { once: true });
      document.body.appendChild(script);
    });
    rendererAssetLoads.set(key, promise);
    return promise;
  }

  /** @param {Response} response @returns {Promise<unknown>} */
  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  /** @param {BrowserViewFieldControl} startInput @param {BrowserViewFieldControl} endInput @returns {void} */
  function setDefaultDateRange(startInput, endInput) {
    const today = new Date();
    startInput.value = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
    endInput.value = formatDateInput(today);
  }

  /** @param {Date} date @returns {string} */
  function formatDateInput(date) {
    if (window.LongtailForge?.formatters?.dateInput) {
      return window.LongtailForge.formatters.dateInput(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** @param {unknown} value @returns {string[]} */
  function normalizeListValue(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return [...new Set(values.flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean))];
  }

  /** @param {BrowserViewFieldControl} select @param {unknown} value @returns {void} */
  function setSelectValueWhenAvailable(select, value) {
    if (!select) {
      return;
    }
    const normalizedValue = String(value || "");
    if (!(select instanceof HTMLSelectElement)) {
      select.value = normalizedValue;
      return;
    }
    if ([...select.options].some((option) => option.value === normalizedValue)) {
      select.value = normalizedValue;
    }
  }

  /** @param {unknown} value @param {boolean} [fallback] @returns {boolean} */
  function parseBoolean(value, fallback = false) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (typeof scalar === "boolean") {
      return scalar;
    }
    const normalized = String(scalar ?? "").trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
    return fallback;
  }
})();
