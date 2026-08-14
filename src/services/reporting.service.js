import { modulesService } from "../core/modules/modules.service.js";
import { getReportRunner } from "../core/reporting/report-runner-registry.js";
import { AppError } from "../core/errors.js";

const REPORTING_ASSET_TARGET = "framework:reporting";
const REPORT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*:[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MAX_REPORT_FILTER_LIST_ITEMS = 100;
const MAX_REPORT_FILTER_VALUE_LENGTH = 200;

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../types/framework-contracts.js").ReportingContribution} ReportingContribution */
/** @typedef {import("../types/framework-contracts.js").ReportingFilterContribution} ReportingFilterContribution */
/** @typedef {import("../types/framework-contracts.js").BrowserAssetContribution} BrowserAssetContribution */
/** @typedef {Record<string, unknown>} ReportQuery */
/** @typedef {Record<string, string | boolean | string[]>} NormalizedReportFilters */

/** @param {WorkspaceRequestSession} session */
async function readReportCatalog(session) {
  const entries = await readAllowedReportEntries(session);

  return {
    reports: entries.map((entry) => entry.catalog),
  };
}

/** @param {WorkspaceRequestSession} session @param {unknown} reportKey @param {ReportQuery} [query] */
async function runReport(session, reportKey, query = {}) {
  const normalizedReportKey = normalizeReportKey(reportKey);

  try {
    if (!normalizedReportKey) {
      throw new ReportExecutionFailure("report_not_found", "Report not found.", 404);
    }

    const entries = await readAllowedReportEntries(session);
    const entry = entries.find((candidate) => candidate.catalog.reportKey === normalizedReportKey);

    if (!entry) {
      throw new ReportExecutionFailure("report_not_found", "Report not found.", 404);
    }

    const filters = normalizeReportFilters(entry.report, query);
    const runner = getReportRunner(entry.report.runner);

    if (!runner) {
      throw new ReportExecutionFailure(
        "report_unavailable",
        "This report is temporarily unavailable.",
        503,
      );
    }

    let result;
    try {
      result = await runner({
        filters,
        report: entry.report,
        reportKey: normalizedReportKey,
        session: /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (session)),
        workspaceId: session.workspace_id,
      });
    } catch (error) {
      throw normalizeRunnerFailure(error);
    }

    return {
      statusCode: 200,
      payload: {
        status: "ready",
        reportKey: normalizedReportKey,
        renderer: entry.report.renderer,
        result: result ?? null,
      },
    };
  } catch (error) {
    const failure = error instanceof ReportExecutionFailure
      ? error
      : normalizeRunnerFailure(error);

    return {
      statusCode: failure.statusCode,
      payload: {
        status: "error",
        reportKey: normalizedReportKey || null,
        error: {
          code: failure.code,
          message: failure.message,
        },
      },
    };
  }
}

/** @param {WorkspaceRequestSession} session */
async function readAllowedReportEntries(session) {
  const [reports, activeAssets] = await Promise.all([
    modulesService.listReportingReports(session.workspace_id, session),
    modulesService.listActiveModuleBrowserAssets(session.workspace_id, session, REPORTING_ASSET_TARGET),
  ]);
  const typedAssets = /** @type {BrowserAssetContribution[]} */ (activeAssets);
  const assetsByKey = new Map(typedAssets.map((asset) => [reportAssetKey(asset.moduleId, asset.id), asset]));

  return reports.flatMap((report) => {
    const rendererAssets = report.browserAssetIds
      .map((assetId) => assetsByKey.get(reportAssetKey(report.moduleId, assetId)))
      .filter((asset) => asset !== undefined);

    if (rendererAssets.length !== report.browserAssetIds.length) {
      return [];
    }

    return [{
      report,
      catalog: normalizeCatalogReport(report, rendererAssets),
    }];
  });
}

/** @param {ReportingContribution} report @param {BrowserAssetContribution[]} rendererAssets */
function normalizeCatalogReport(report, rendererAssets) {
  const filters = report.filters.map(cloneReportFilter);

  return {
    reportKey: `${report.moduleId}:${report.id}`,
    id: report.id,
    moduleId: report.moduleId,
    label: report.label,
    description: report.description,
    category: report.category,
    renderer: report.renderer,
    sortOrder: report.sortOrder ?? 0,
    requiredPermissions: [...report.requiredPermissions],
    requiredWorkspaceCapabilities: [...report.requiredWorkspaceCapabilities],
    requiresEnabledModules: [...report.requiresEnabledModules],
    filters,
    defaultFilters: Object.fromEntries(filters
      .filter((/** @type {object} */ filter) => Object.hasOwn(filter, "defaultValue"))
      .map((filter) => [filter.id, cloneJsonValue(filter.defaultValue)])),
    rendererAssets: rendererAssets.map((asset) => ({
      id: asset.id,
      moduleId: asset.moduleId,
      path: asset.path,
      type: asset.type,
    })),
  };
}

/** @param {ReportingFilterContribution} filter @returns {ReportingFilterContribution} */
function cloneReportFilter(filter) {
  return {
    ...filter,
    queryKeys: [...filter.queryKeys],
    ...(Array.isArray(filter.defaultValue) ? { defaultValue: [...filter.defaultValue] } : {}),
    ...(filter.visibleWhen ? { visibleWhen: { ...filter.visibleWhen } } : {}),
  };
}

/** @param {unknown} value */
function cloneJsonValue(value) {
  return Array.isArray(value) ? [...value] : value;
}

/** @param {ReportingContribution} report @param {ReportQuery} query @returns {NormalizedReportFilters} */
function normalizeReportFilters(report, query) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw invalidReportFilters("Report filters are invalid.");
  }

  const allowedQueryKeys = new Set(report.filters.flatMap((filter) => filter.queryKeys));
  for (const queryKey of Object.keys(query)) {
    if (!allowedQueryKeys.has(queryKey)) {
      throw invalidReportFilters("An unsupported report filter was provided.");
    }
  }

  /** @type {NormalizedReportFilters} */
  const normalizedFilters = {};

  for (const filter of report.filters) {
    const visible = reportFilterIsVisible(filter, report.filters, query);
    const provided = filter.queryKeys.some((/** @type {string | number} */ queryKey) => query[queryKey] !== undefined);

    if (!visible) {
      if (provided) {
        throw invalidReportFilters(`The ${filter.label} filter is not available for the selected options.`);
      }
      continue;
    }

    if (filter.type === "billing-period") {
      const value = readScalarFilterValue(query, filter.queryKeys[0], filter.defaultValue);
      if (!["current", "last", "custom"].includes(value)) {
        throw invalidReportFilters("Billing Period must be current, last, or custom.");
      }
      normalizedFilters[filter.queryKeys[0]] = value;
      continue;
    }

    if (filter.type === "custom-date-range") {
      const startDate = readScalarFilterValue(query, filter.queryKeys[0]);
      const endDate = readScalarFilterValue(query, filter.queryKeys[1]);
      if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
        throw invalidReportFilters("Choose a valid custom start and end date.");
      }
      normalizedFilters[filter.queryKeys[0]] = startDate;
      normalizedFilters[filter.queryKeys[1]] = endDate;
      continue;
    }

    if (filter.type === "project-multi-select" || filter.type === "tag") {
      normalizedFilters[filter.queryKeys[0]] = readListFilterValue(
        query,
        filter.queryKeys[0],
        Array.isArray(filter.defaultValue) ? filter.defaultValue : [],
      );
      continue;
    }

    if (filter.type === "boolean") {
      normalizedFilters[filter.queryKeys[0]] = readBooleanFilterValue(
        query,
        filter.queryKeys[0],
        typeof filter.defaultValue === "boolean" ? filter.defaultValue : false,
      );
      continue;
    }

    const value = readScalarFilterValue(query, filter.queryKeys[0], filter.defaultValue);
    if (filter.required && !value) {
      throw invalidReportFilters(`${filter.label} is required.`);
    }
    if (value) {
      normalizedFilters[filter.queryKeys[0]] = value;
    }
  }

  return normalizedFilters;
}

/** @param {ReportingFilterContribution} filter @param {ReportingFilterContribution[]} filters @param {ReportQuery} query */
function reportFilterIsVisible(filter, filters, query) {
  if (!filter.visibleWhen) {
    return true;
  }
  const visibleWhen = filter.visibleWhen;

  const dependency = filters.find((candidate) => candidate.id === visibleWhen.filterId);
  if (!dependency) {
    return false;
  }

  const dependencyValue = readScalarFilterValue(
    query,
    dependency.queryKeys[0],
    dependency.defaultValue,
  );
  return dependencyValue === visibleWhen.equals;
}

/** @param {ReportQuery} query @param {string} queryKey @param {unknown} [defaultValue] */
function readScalarFilterValue(query, queryKey, defaultValue = "") {
  const rawValue = query[queryKey];
  const value = rawValue === undefined ? defaultValue : rawValue;

  if (Array.isArray(value) || value !== null && typeof value === "object") {
    throw invalidReportFilters(`The ${queryKey} filter must be a single value.`);
  }

  const normalizedValue = String(value ?? "").trim();
  if (normalizedValue.length > MAX_REPORT_FILTER_VALUE_LENGTH) {
    throw invalidReportFilters(`The ${queryKey} filter is too long.`);
  }

  return normalizedValue;
}

/** @param {ReportQuery} query @param {string} queryKey @param {unknown[]} [defaultValue] */
function readListFilterValue(query, queryKey, defaultValue = []) {
  const rawValue = query[queryKey] === undefined ? defaultValue : query[queryKey];
  const rawItems = Array.isArray(rawValue) ? rawValue : [rawValue];
  const items = rawItems.flatMap((item) => {
    if (item !== null && typeof item === "object") {
      throw invalidReportFilters(`The ${queryKey} filter must be a list of IDs.`);
    }
    return String(item ?? "").split(",");
  }).map((item) => item.trim()).filter(Boolean);
  const normalizedItems = [...new Set(items)];

  if (normalizedItems.length > MAX_REPORT_FILTER_LIST_ITEMS) {
    throw invalidReportFilters(`The ${queryKey} filter has too many values.`);
  }
  if (normalizedItems.some((item) => item.length > MAX_REPORT_FILTER_VALUE_LENGTH)) {
    throw invalidReportFilters(`The ${queryKey} filter contains a value that is too long.`);
  }

  return normalizedItems;
}

/** @param {ReportQuery} query @param {string} queryKey @param {boolean} [defaultValue] */
function readBooleanFilterValue(query, queryKey, defaultValue = false) {
  const rawValue = query[queryKey] === undefined ? defaultValue : query[queryKey];

  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  if (Array.isArray(rawValue) || rawValue !== null && typeof rawValue === "object") {
    throw invalidReportFilters(`The ${queryKey} filter must be true or false.`);
  }

  const normalizedValue = String(rawValue ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalizedValue)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalizedValue)) {
    return false;
  }

  throw invalidReportFilters(`The ${queryKey} filter must be true or false.`);
}

/**
 * @param {string} value
 */
function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** @param {unknown} reportKey */
function normalizeReportKey(reportKey) {
  const normalizedReportKey = String(reportKey || "").trim();
  return REPORT_KEY_PATTERN.test(normalizedReportKey) ? normalizedReportKey : "";
}

/** @param {string} moduleId @param {string} assetId */
function reportAssetKey(moduleId, assetId) {
  return `${moduleId}:${assetId}`;
}

/**
 * @param {string} message
 */
function invalidReportFilters(message) {
  return new ReportExecutionFailure("invalid_filters", message, 400);
}

/**
 * @param {unknown} error
 */
function normalizeRunnerFailure(error) {
  if (error instanceof ReportExecutionFailure) {
    return error;
  }

  if (error instanceof AppError && error.statusCode === 400) {
    return new ReportExecutionFailure(
      "report_request_failed",
      "The report could not be run with those filters.",
      400,
    );
  }

  if (error instanceof AppError && [403, 404].includes(error.statusCode)) {
    return new ReportExecutionFailure(
      "report_access_denied",
      "The report could not be run with your current access.",
      403,
    );
  }

  console.error("[reporting] Report runner failed.", error);
  return new ReportExecutionFailure(
    "report_execution_failed",
    "The report could not be run.",
    500,
  );
}

class ReportExecutionFailure extends Error {
  /**
 * @param {string} code
 * @param {string | undefined} message
 * @param {number} statusCode
 */
  constructor(code, message, statusCode) {
    super(message);
    this.name = "ReportExecutionFailure";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const reportingServiceInternal = {
  readReportCatalog,
  runReport,
};

export const reportingService = reportingServiceInternal;
