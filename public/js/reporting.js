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
  const reportRenderers = new Map();
  const rendererAssetLoads = new Map();
  const reportingState = {
    reports: [],
    selectedReport: null,
    renderer: null,
    filterFields: new Map(),
    selectionGeneration: 0,
    executionGeneration: 0,
  };

  let reportSelector = null;
  let reportSelectorPanel = null;
  let reportFilterPanel = null;
  let reportStatus = null;
  let reportResultsHost = null;

  publishReportingApi();
  buildReportingHost();
  loadReportCatalog();

  function publishReportingApi() {
    const namespace = window.LongtailForge = window.LongtailForge || {};
    namespace.reporting = {
      ...(namespace.reporting || {}),
      registerRenderer,
    };
  }

  function registerRenderer(rendererId, registration) {
    const normalizedId = String(rendererId || "").trim();
    const normalizedRegistration = typeof registration === "function"
      ? { render: registration }
      : registration;

    if (!normalizedId || !normalizedRegistration || typeof normalizedRegistration.render !== "function") {
      return;
    }

    reportRenderers.set(normalizedId, normalizedRegistration);
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
    reportFilterPanel.hidden = true;
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

    reportSelector.addEventListener("change", () => {
      selectReport(reportSelector.value);
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
      reportSelector.value = selectedReport.reportKey;
      await selectReport(selectedReport.reportKey, { initial: true });
    } catch (error) {
      renderReportingError("Reports could not be loaded.");
      console.error(error);
    }
  }

  function renderReportSelector() {
    const reportingView = requireView();
    reportSelector.replaceChildren(...reportingState.reports.map((report) => reportingView.createElement("option", {
      attrs: { value: report.reportKey },
      text: report.label || "Report",
    })));
    reportSelector.disabled = reportingState.reports.length === 0;
  }

  function renderEmptyCatalog() {
    const reportingView = requireView();
    reportingState.selectedReport = null;
    reportingState.renderer = null;
    reportFilterPanel.hidden = true;
    setReportingStatus("");
    reportResultsHost.replaceChildren(reportingView.createEmptyState({
      title: "No reports available",
      message: "No reports are available for this workspace and your current access.",
    }));
  }

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
    reportSelector.value = report.reportKey;
    renderReportFilters(report.filters || []);
    reportResultsHost.replaceChildren();
    setReportingStatus(`Loading ${report.label || "report"}...`);

    try {
      await loadRendererAssets(report.rendererAssets || []);
      if (generation !== reportingState.selectionGeneration) {
        return;
      }

      const renderer = reportRenderers.get(report.renderer);
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
      reportSelector.focus();
    }
  }

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

  function renderReportFilters(filters) {
    reportingState.filterFields.clear();
    const fields = filters.map(createReportFilterField);
    const nextPanel = createReportFilterPanel(fields);
    reportFilterPanel.replaceWith(nextPanel);
    reportFilterPanel = nextPanel;
    reportFilterPanel.hidden = filters.length === 0;
  }

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
    const fieldState = {
      controls: new Map([[filter.queryKeys[0], control]]),
      filter,
      wrapper,
    };
    if (filter.type === "tag") {
      fieldState.tagFilterController = window.LongtailForge?.tags?.mountFilterPicker?.(control, {
        tags: [],
        value: filter.defaultValue,
      }) || null;
    }
    reportingState.filterFields.set(filter.id, fieldState);
    setFilterValue(filter.id, filter.defaultValue);
    return wrapper;
  }

  function createCustomDateRangeField(filter) {
    const reportingView = requireView();
    const [startKey, endKey] = filter.queryKeys;
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

  async function handleReportFilterChange(event) {
    const control = event.target.closest?.("[data-reporting-filter-control]");
    if (!control || !reportFilterPanel.contains(control) || !reportingState.renderer) {
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

  function getFilterControl(filterId, queryKey = "") {
    const field = reportingState.filterFields.get(filterId);
    if (!field) {
      return null;
    }
    return queryKey ? field.controls.get(queryKey) || null : field.controls.values().next().value || null;
  }

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
      return Boolean(control?.checked);
    }
    if (control?.multiple) {
      return [...control.selectedOptions].map((option) => option.value);
    }
    if (field.filter.type === "tag") {
      const value = field.tagFilterController?.readValue?.() || control?.dataset?.tagFilterValue || "all";
      return value && value !== "all" ? [value] : [];
    }
    return control?.value || "";
  }

  function setFilterValue(filterId, value) {
    const field = reportingState.filterFields.get(filterId);
    if (!field || value === undefined || value === null) {
      return;
    }

    if (field.filter.type === "custom-date-range") {
      [...field.controls].forEach(([queryKey, control]) => {
        const nextValue = value?.[queryKey];
        if (nextValue !== undefined) {
          control.value = String(nextValue || "");
        }
      });
      return;
    }

    const control = getFilterControl(filterId);
    if (field.filter.type === "boolean") {
      control.checked = parseBoolean(value, Boolean(field.filter.defaultValue));
      return;
    }
    if (control?.multiple) {
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
      } else {
        control.value = String(nextValue);
      }
      return;
    }
    setSelectValueWhenAvailable(control, String(value || ""));
  }

  function setFilterOptions(filterId, options, config = {}) {
    const field = reportingState.filterFields.get(filterId);
    const control = getFilterControl(filterId);
    if (field?.filter.type === "tag" && field.tagFilterController) {
      const noTagsValue = window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
      const tags = (Array.isArray(options) ? options : [])
        .map((option) => ({
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
    if (!control || control.tagName !== "SELECT") {
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
    for (const option of Array.isArray(options) ? options : []) {
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

  function setFilterHidden(filterId, hidden) {
    const field = reportingState.filterFields.get(filterId);
    if (field) {
      field.wrapper.hidden = Boolean(hidden);
      field.wrapper.dataset.reportingAdapterHidden = hidden ? "true" : "false";
    }
  }

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

  function applyQueryFilterValues(query) {
    for (const [filterId, field] of reportingState.filterFields) {
      if (field.filter.type === "custom-date-range") {
        const values = Object.fromEntries(field.filter.queryKeys
          .filter((queryKey) => query.has(queryKey))
          .map((queryKey) => [queryKey, query.get(queryKey)]));
        setFilterValue(filterId, values);
        continue;
      }
      const queryKey = field.filter.queryKeys[0];
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

      const visible = getFilterValue(condition.filterId) === condition.equals;
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
      reportResultsHost.replaceChildren();
      setReportingStatus(validationMessage);
      return;
    }

    const generation = ++reportingState.executionGeneration;
    const params = buildExecutionParams(report.filters || []);
    setReportingStatus(`Loading ${report.label || "report"} results...`);
    reportResultsHost.replaceChildren();

    try {
      const response = await fetch(
        `/api/reporting/reports/${encodeURIComponent(report.reportKey)}/run?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = await readJsonResponse(response);
      if (generation !== reportingState.executionGeneration) {
        return;
      }
      if (!response.ok || payload?.status !== "ready") {
        renderReportingError(payload?.error?.message || "The report could not be run.");
        return;
      }
      if (payload.reportKey !== report.reportKey || payload.renderer !== report.renderer) {
        renderRendererUnavailable();
        return;
      }

      const rendered = await renderer.render(payload.result, createRendererContext());
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

  function validateReportFilters(report, renderer) {
    for (const filter of report.filters || []) {
      if (!filter.required || !filterIsVisible(filter)) {
        continue;
      }
      const value = getFilterValue(filter.id);
      if (value === "" || value === null || Array.isArray(value) && value.length === 0) {
        return `Choose ${String(filter.label || "a required filter").toLowerCase()}.`;
      }
    }

    if (typeof renderer.validateFilters === "function") {
      return String(renderer.validateFilters(createRendererContext()) || "");
    }
    return "";
  }

  function buildExecutionParams(filters) {
    const params = new URLSearchParams();
    for (const filter of filters) {
      if (!filterIsVisible(filter)) {
        continue;
      }
      const value = getFilterValue(filter.id);
      if (filter.type === "custom-date-range") {
        filter.queryKeys.forEach((queryKey) => {
          if (value?.[queryKey]) {
            params.set(queryKey, value[queryKey]);
          }
        });
      } else if (Array.isArray(value)) {
        if (value.length) {
          params.set(filter.queryKeys[0], value.join(","));
        }
      } else if (filter.type === "boolean") {
        params.set(filter.queryKeys[0], value ? "true" : "false");
      } else if (value) {
        params.set(filter.queryKeys[0], value);
      }
    }
    return params;
  }

  function filterIsVisible(filter) {
    if (!filter.visibleWhen) {
      return true;
    }
    return getFilterValue(filter.visibleWhen.filterId) === filter.visibleWhen.equals;
  }

  function renderExecutionResult(rendered) {
    const reportingView = requireView();
    if (rendered?.state === "empty") {
      setReportingStatus("");
      reportResultsHost.replaceChildren(reportingView.createEmptyState({
        title: rendered.title || "No results",
        message: rendered.message || "No records match these report filters.",
      }));
      return;
    }

    const content = rendered?.content || rendered;
    if (!content || typeof content.nodeType !== "number") {
      renderReportingError("Report results could not be displayed.");
      return;
    }
    reportResultsHost.replaceChildren(content);
    setReportingStatus("");
  }

  function renderRendererUnavailable() {
    renderReportingError("This report's result view is unavailable.", {
      title: "Report view unavailable",
    });
  }

  function renderReportingError(message, options = {}) {
    const reportingView = requireView();
    setReportingStatus(message, { isError: true });
    reportResultsHost?.replaceChildren(reportingView.createEmptyState({
      title: options.title || "Report unavailable",
      message,
      role: "alert",
    }));
  }

  function setReportingStatus(message, options = {}) {
    if (!reportStatus) {
      return;
    }
    reportStatus.textContent = message || "";
    reportStatus.hidden = !message;
    reportStatus.dataset.viewTone = options.isError ? "error" : "info";
    reportStatus.setAttribute("role", options.isError ? "alert" : "status");
  }

  function syncReportingUrl(options = {}) {
    const report = reportingState.selectedReport;
    if (!report || !window.history?.replaceState) {
      return;
    }
    const query = new URLSearchParams(window.location.search);
    query.delete("reportKey");
    query.set("report", report.reportKey);
    for (const filter of report.filters || []) {
      filter.queryKeys.forEach((queryKey) => query.delete(queryKey));
    }
    const executionParams = buildExecutionParams(report.filters || []);
    executionParams.forEach((value, queryKey) => query.set(queryKey, value));
    const nextUrl = `${window.location.pathname}${query.toString() ? `?${query.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
    if (!options.replace) {
      window.dispatchEvent(new window.Event("reporting:url-updated"));
    }
  }

  async function loadRendererAssets(assets) {
    for (const asset of assets) {
      await loadRendererAsset(asset);
    }
  }

  function loadRendererAsset(asset) {
    const path = String(asset?.path || "").trim();
    const type = String(asset?.type || "").trim();
    if (!path || !["script", "style"].includes(type)) {
      return Promise.reject(new Error("The report renderer asset is invalid."));
    }

    const key = `${type}:${new window.URL(path, document.baseURI).href}`;
    if (rendererAssetLoads.has(key)) {
      return rendererAssetLoads.get(key);
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

  function setDefaultDateRange(startInput, endInput) {
    const today = new Date();
    startInput.value = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
    endInput.value = formatDateInput(today);
  }

  function formatDateInput(date) {
    if (window.LongtailForge?.formatters?.dateInput) {
      return window.LongtailForge.formatters.dateInput(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeListValue(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return [...new Set(values.flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean))];
  }

  function setSelectValueWhenAvailable(select, value) {
    if (!select) {
      return;
    }
    const normalizedValue = String(value || "");
    if ([...select.options].some((option) => option.value === normalizedValue)) {
      select.value = normalizedValue;
    }
  }

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
