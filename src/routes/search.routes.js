// @ts-check
import { Router } from "express";
import { createScopedPermissionResource } from "../core/permission-resource.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { tagsRepository } from "../repositories/tags.repo.js";
import { boundedPaginationEnvelope, decodeOffsetCursor } from "../core/bounded-pagination.js";
import { helpService, HELP_SEARCH_RECORD_TYPE } from "../services/help.service.js";
import { permissionsService } from "../services/permissions.service.js";
import { searchService } from "../services/search.service.js";
import { asyncRoute } from "../utils/http.js";
import { sendApiError } from "../core/http-error-contract.js";

/** @typedef {import("../types/framework-contracts.js").BrowserSearchContextRecord} BrowserSearchContextRecord */
/** @typedef {import("../types/framework-contracts.js").BrowserSearchResult} BrowserSearchResult */
/** @typedef {import("../types/framework-contracts.js").BrowserSearchResultTarget} BrowserSearchResultTarget */
/** @typedef {import("../types/framework-contracts.js").BrowserSearchTag} BrowserSearchTag */
/** @typedef {import("../types/framework-contracts.js").PermissionSafeSearchRequest} PermissionSafeSearchRequest */
/** @typedef {import("../types/framework-contracts.js").SearchPermissionTarget} SearchPermissionTarget */
/** @typedef {import("../types/framework-contracts.js").SearchResult} SearchResult */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {{ field: string, message: string }} SearchQueryError */
/** @typedef {{ backend: string, fallbackMode: string, fts5Supported: boolean, ftsTableReady: boolean, hasMore: boolean, results: BrowserSearchResult[], visibleTargetCount: number }} VisibleSearchResult */

const searchRoutes = Router();
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PAGE = 10000;
const MAX_VISIBLE_OFFSET = (MAX_PAGE - 1) * MAX_LIMIT;

searchRoutes.get("/search", asyncRoute(async (request, response) => {
  const parsed = parseSearchQuery(request.query);

  if (parsed.errors.length > 0) {
    sendApiError(request, response, {
      code: "invalid_search_filters",
      fields: parsed.errors,
      message: "Search filters are invalid.",
      statusCode: 400,
    });
    return;
  }

  // The application mounts this router after requireAuth; this alias makes the
  // protected workspace contract explicit for every downstream permission read.
  const session = /** @type {WorkspaceRequestSession} */ (request.session);
  const searchRequest = await searchService.composePermissionSafeSearchRequest({
    session,
    filters: parsed.filters,
  });
  const shaped = await executeVisibleSearch({
    requestedOffset: parsed.pagination.offset,
    searchRequest,
    session,
    visibleLimit: parsed.pagination.limit,
  });

  response.status(200).json({
    query: parsed.publicQuery,
    pagination: {
      ...boundedPaginationEnvelope({
        hasMore: shaped.hasMore,
        limit: parsed.pagination.limit,
        maxPageSize: MAX_LIMIT,
        offset: parsed.pagination.offset,
        returned: shaped.results.length,
      }),
      page: parsed.pagination.page,
    },
    backend: shaped.backend,
    fallbackMode: shaped.fallbackMode,
    fts5Supported: shaped.fts5Supported,
    ftsTableReady: shaped.ftsTableReady,
    targetCount: searchRequest.targets.length,
    visibleTargetCount: shaped.visibleTargetCount,
    results: shaped.results,
  });
}));

/**
 * @param {{ requestedOffset: number, searchRequest: PermissionSafeSearchRequest, session: WorkspaceRequestSession, visibleLimit: number }} input
 * @returns {Promise<VisibleSearchResult>}
 */
async function executeVisibleSearch({ requestedOffset, searchRequest, session, visibleLimit }) {
  const targetByType = new Map((searchRequest.targets || [])
    .map((target) => [`${target.moduleId}:${target.recordType}`, target]));
  /** @type {BrowserSearchResult[]} */
  const shaped = [];
  const batchLimit = Math.min(MAX_LIMIT, Math.max(visibleLimit + 1, DEFAULT_LIMIT));
  const maxRawResultsToScan = Math.max(500, requestedOffset + (visibleLimit + 1) * 10);
  let backend = "";
  let fallbackMode = "";
  let fts5Supported = false;
  let ftsTableReady = false;
  let rawOffset = 0;
  let skippedVisible = 0;

  while (shaped.length <= visibleLimit && rawOffset < maxRawResultsToScan) {
    const result = await searchService.executeSearch({
      ...searchRequest,
      limit: batchLimit,
      offset: rawOffset,
    });

    backend = result.backend;
    fallbackMode = result.fallbackMode;
    fts5Supported = result.fts5Supported;
    ftsTableReady = result.ftsTableReady;

    if (result.results.length === 0) {
      break;
    }

    for (const rawResult of result.results) {
      if (rawResult.workspace_id !== session.workspace_id) {
        continue;
      }

      const target = targetByType.get(`${rawResult.module_id}:${rawResult.record_type}`);

      if (!target || !(await canReadSearchResult(session, rawResult, target))) {
        continue;
      }

      if (skippedVisible < requestedOffset) {
        skippedVisible += 1;
        continue;
      }

      shaped.push(toBrowserSearchResult(rawResult, target));

      if (shaped.length > visibleLimit) {
        break;
      }
    }

    rawOffset += result.results.length;

    if (result.results.length < batchLimit) {
      break;
    }
  }

  const pageResults = shaped.slice(0, visibleLimit);

  return {
    backend,
    fallbackMode,
    fts5Supported,
    ftsTableReady,
    hasMore: shaped.length > visibleLimit,
    results: await enrichBrowserSearchResults(session.workspace_id, pageResults),
    visibleTargetCount: new Set(pageResults.map((result) => `${result.moduleId}:${result.recordType}`)).size,
  };
}

/**
 * @param {WorkspaceRequestSession} session
 * @param {SearchResult} result
 * @param {SearchPermissionTarget} target
 */
async function canReadSearchResult(session, result, target) {
  if (result.record_type === HELP_SEARCH_RECORD_TYPE) {
    return helpService.canReadIndexedArticle(session, result.record_id);
  }

  return permissionsService.can(
    session,
    target.requiredReadPermission,
    createScopedPermissionResource(session.workspace_id, "read", {
      clientId: resolvePermissionClientId(result),
      projectId: resolvePermissionProjectId(result),
    }),
  );
}

/** @param {SearchResult} result */
function resolvePermissionClientId(result) {
  if (result.record_type === "client") {
    return result.record_id || "";
  }

  return result.client_id || "";
}

/** @param {SearchResult} result */
function resolvePermissionProjectId(result) {
  if (result.record_type === "project") {
    return result.record_id || "";
  }

  return result.project_id || "";
}

/** @param {unknown} queryValue */
function parseSearchQuery(queryValue = {}) {
  const query = isPlainObject(queryValue) ? queryValue : {};
  /** @type {SearchQueryError[]} */
  const errors = [];
  validateQueryValueShapes(query, errors);
  const text = firstString(query.text, query.q, query.query);
  const moduleIds = readStringList(query.moduleIds, query.module_ids, query.moduleId, query.module_id, query.module);
  const recordTypes = readStringList(
    query.recordTypes,
    query.record_types,
    query.recordType,
    query.record_type,
    query.type,
  );
  const tagIds = readStringList(query.tagIds, query.tag_ids, query.tagId, query.tag_id, query.tag);
  const clientId = firstString(query.clientId, query.client_id, query.client);
  const projectId = firstString(query.projectId, query.project_id, query.project);
  const libraryBucket = firstString(query.libraryBucket, query.library_bucket, query.library);
  const noteCollectionId = firstString(query.noteCollectionId, query.note_collection_id, query.collectionId, query.collection_id);
  const status = firstString(query.recordStatus, query.record_status, query.status);
  const visibility = firstString(query.visibility);
  const source = firstString(query.source, query.sourceLabel, query.source_label);
  const page = parsePositiveInteger(firstString(query.page), "page", errors, { defaultValue: 1, max: MAX_PAGE });
  const limit = parsePositiveInteger(firstString(query.limit, query.pageSize, query.page_size), "limit", errors, {
    defaultValue: DEFAULT_LIMIT,
    max: MAX_LIMIT,
  });
  const cursorOffset = decodeOffsetCursor(firstString(query.cursor, query.nextCursor, query.next_cursor));
  const acceptedCursorOffset = cursorOffset !== null
    && Number.isSafeInteger(cursorOffset)
    && cursorOffset <= MAX_VISIBLE_OFFSET
    ? cursorOffset
    : null;

  if (cursorOffset !== null && acceptedCursorOffset === null) {
    errors.push({
      field: "cursor",
      message: `cursor offset must be a safe integer between 0 and ${MAX_VISIBLE_OFFSET}.`,
    });
  }

  const offset = acceptedCursorOffset ?? (page - 1) * limit;
  const responsePage = acceptedCursorOffset === null ? page : Math.floor(offset / limit) + 1;

  for (const [field, values] of Object.entries({ module: moduleIds, recordType: recordTypes, tag: tagIds })) {
    if (values.some((value) => !isSafeFilterValue(value))) {
      errors.push({
        field,
        message: `${field} filters may contain letters, numbers, spaces, underscores, periods, colons, and hyphens only.`,
      });
    }
  }

  for (const [field, value] of Object.entries({ clientId, projectId, libraryBucket, noteCollectionId, status, visibility, source })) {
    if (value && !isSafeFilterValue(value)) {
      errors.push({
        field,
        message: `${field} is not a valid search filter value.`,
      });
    }
  }

  return {
    errors,
    filters: {
      text,
      moduleIds,
      recordTypes,
      clientId,
      hasClientFilter: hasQueryField(query, ["clientId", "client_id", "client"]),
      projectId,
      hasProjectFilter: hasQueryField(query, ["projectId", "project_id", "project"]),
      libraryBucket,
      noteCollectionId,
      tagIds,
      recordStatus: status,
      source,
      visibility,
    },
    pagination: {
      page: responsePage,
      limit,
      offset,
    },
    publicQuery: {
      text,
      moduleIds,
      recordTypes,
      clientId,
      projectId,
      libraryBucket,
      noteCollectionId,
      tagIds,
      recordStatus: status,
      source,
      visibility,
    },
  };
}

/**
 * @param {SearchResult} result
 * @param {SearchPermissionTarget} target
 * @returns {BrowserSearchResult}
 */
function toBrowserSearchResult(result, target) {
  return {
    searchIndexId: result.search_index_id,
    workspaceId: result.workspace_id,
    moduleId: result.module_id,
    recordType: result.record_type,
    recordId: result.record_id,
    title: result.title || "",
    snippet: result.summary || "",
    summary: result.summary || "",
    clientId: result.client_id || "",
    projectId: result.project_id || "",
    libraryBucket: result.library_bucket || "",
    noteCollectionId: result.note_collection_id || "",
    collectionPath: result.collection_path || "",
    visibility: result.visibility || "",
    status: result.record_status || "",
    recordStatus: result.record_status || "",
    sourceLabel: result.source || target.sourceLabel || "",
    source: result.source || target.sourceLabel || "",
    score: normalizeScore(result.search_score),
    recordCreatedAt: result.record_created_at || "",
    recordUpdatedAt: result.record_updated_at || "",
    updatedAt: result.record_updated_at || result.indexed_at || "",
    indexedAt: result.indexed_at || "",
    searchBackend: result.search_backend || "",
    context: {
      client: null,
      project: null,
    },
    tags: [],
    target: buildResultTarget(result),
  };
}

/**
 * @param {string} workspaceId
 * @param {BrowserSearchResult[]} results
 * @returns {Promise<BrowserSearchResult[]>}
 */
async function enrichBrowserSearchResults(workspaceId, results) {
  const tagsByResultKey = await readResultTags(workspaceId, results);
  const contextById = await readResultContext(workspaceId, results);

  return results.map((result) => ({
    ...result,
    context: {
      client: result.clientId ? contextById.clients.get(result.clientId) || null : null,
      project: result.projectId ? contextById.projects.get(result.projectId) || null : null,
    },
    tags: tagsByResultKey.get(resultKey(result)) || [],
  }));
}

/**
 * @param {string} workspaceId
 * @param {BrowserSearchResult[]} results
 * @returns {Promise<Map<string, BrowserSearchTag[]>>}
 */
async function readResultTags(workspaceId, results) {
  /** @type {Map<string, BrowserSearchTag[]>} */
  const byKey = new Map();
  /** @type {Map<string, string[]>} */
  const idsByType = new Map();

  for (const result of results) {
    const recordIds = idsByType.get(result.recordType) || [];
    recordIds.push(result.recordId);
    idsByType.set(result.recordType, recordIds);
  }

  for (const [recordType, recordIds] of idsByType.entries()) {
    const assignments = await tagsRepository.listAssignmentsForTargets(workspaceId, recordType, recordIds);

    for (const assignment of assignments) {
      const key = `${recordType}:${assignment.target_id}`;
      const values = byKey.get(key) || [];

      values.push({
        tagId: assignment.tag_id,
        name: assignment.tag?.name || "",
        slug: assignment.tag?.slug || "",
        color: assignment.tag?.color || "",
        status: assignment.tag?.status || "active",
      });
      byKey.set(key, values);
    }
  }

  return byKey;
}

/**
 * @param {string} workspaceId
 * @param {BrowserSearchResult[]} results
 * @returns {Promise<{ clients: Map<string, BrowserSearchContextRecord>, projects: Map<string, BrowserSearchContextRecord> }>}
 */
async function readResultContext(workspaceId, results) {
  const clientIds = new Set(results.map((result) => result.clientId).filter(Boolean));
  const projectIds = new Set(results.map((result) => result.projectId).filter(Boolean));
  /** @type {Map<string, BrowserSearchContextRecord>} */
  const clients = new Map();
  /** @type {Map<string, BrowserSearchContextRecord>} */
  const projects = new Map();
  const [clientRecords, projectRecords] = await Promise.all([
    clientIds.size > 0 ? clientsRepository.readByIds(workspaceId, [...clientIds]) : Promise.resolve([]),
    projectIds.size > 0 ? projectsRepository.readByIds(workspaceId, [...projectIds]) : Promise.resolve([]),
  ]);

  for (const client of clientRecords) {
    clients.set(client.id, {
      id: client.id,
      name: client.name,
      status: client.status,
    });
  }

  for (const project of projectRecords) {
    projects.set(project.id, {
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.client_id || project.clientId || "",
      clientName: project.client_name || project.clientName || "",
    });
  }

  return { clients, projects };
}

/**
 * @param {SearchResult} result
 * @returns {BrowserSearchResultTarget}
 */
function buildResultTarget(result) {
  const recordId = encodeURIComponent(result.record_id || "");

  if (result.module_id === "tasks" && result.record_type === "task") {
    return {
      url: `tasks.html?task=${recordId}`,
      actionId: "tasks.edit",
      params: { taskId: result.record_id },
    };
  }

  if (result.module_id === "time-tracking" && result.record_type === "time_entry") {
    return {
      url: `time-entries.html?entry=${recordId}`,
      actionId: "time-entries.edit",
      params: { entryId: result.record_id },
    };
  }

  if (result.module_id === "client-projects" && result.record_type === "client") {
    return {
      url: `clients.html?client=${recordId}`,
      actionId: "clients.edit",
      params: { clientId: result.record_id },
    };
  }

  if (result.module_id === "client-projects" && result.record_type === "project") {
    return {
      url: `projects.html?project=${recordId}`,
      actionId: "projects.edit",
      params: { projectId: result.record_id },
    };
  }

  if (result.module_id === "notes" && result.record_type === "note") {
    return {
      url: `notes.html?note=${recordId}`,
      actionId: "notes.open",
      params: { noteId: result.record_id },
    };
  }

  if (result.record_type === HELP_SEARCH_RECORD_TYPE) {
    return {
      url: `help.html?article=${recordId}`,
      actionId: "help.open",
      params: { articleId: result.record_id },
    };
  }

  return {
    url: "",
    actionId: "",
    params: {},
  };
}

/** @param {BrowserSearchResult} result */
function resultKey(result) {
  return `${result.recordType}:${result.recordId}`;
}

/** @param {unknown} value */
function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

/**
 * @param {string} value
 * @param {string} field
 * @param {SearchQueryError[]} errors
 * @param {{ defaultValue: number, max?: number }} options
 */
function parsePositiveInteger(value, field, errors, options) {
  if (!value) {
    return options.defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    errors.push({ field, message: `${field} must be a positive integer.` });
    return options.defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (parsed < 1 || (options.max && parsed > options.max)) {
    errors.push({ field, message: `${field} must be between 1 and ${options.max || "the maximum allowed value"}.` });
    return options.defaultValue;
  }

  return parsed;
}

/** @param {...unknown} values */
function firstString(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.find((item) => typeof item === "string" && item.trim());
      if (found) {
        return found.trim();
      }
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

/**
 * @param {Record<string, unknown>} query
 * @param {string[]} keys
 */
function hasQueryField(query, keys) {
  return keys.some((key) => Object.hasOwn(query, key));
}

/** @param {...unknown} values */
function readStringList(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

/** @param {string} value */
function isSafeFilterValue(value) {
  return /^[\w .:-]+$/u.test(value);
}

/**
 * @param {Record<string, unknown>} query
 * @param {SearchQueryError[]} errors
 */
function validateQueryValueShapes(query, errors) {
  /** @type {Array<[string, string[]]>} */
  const fields = [
    ["text", ["text", "q", "query"]],
    ["module", ["moduleIds", "module_ids", "moduleId", "module_id", "module"]],
    ["recordType", ["recordTypes", "record_types", "recordType", "record_type", "type"]],
    ["tag", ["tagIds", "tag_ids", "tagId", "tag_id", "tag"]],
    ["clientId", ["clientId", "client_id", "client"]],
    ["projectId", ["projectId", "project_id", "project"]],
    ["libraryBucket", ["libraryBucket", "library_bucket", "library"]],
    ["noteCollectionId", ["noteCollectionId", "note_collection_id", "collectionId", "collection_id"]],
    ["status", ["recordStatus", "record_status", "status"]],
    ["visibility", ["visibility"]],
    ["source", ["source", "sourceLabel", "source_label"]],
    ["page", ["page"]],
    ["limit", ["limit", "pageSize", "page_size"]],
    ["cursor", ["cursor", "nextCursor", "next_cursor"]],
  ];

  for (const [field, aliases] of fields) {
    const malformed = aliases.some((alias) => (
      Object.hasOwn(query, alias) && !isSupportedQueryValue(query[alias])
    ));

    if (malformed) {
      errors.push({
        field,
        message: `${field} must be supplied as a string or repeated string values.`,
      });
    }
  }
}

/** @param {unknown} value */
function isSupportedQueryValue(value) {
  return typeof value === "string"
    || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  // Express supplies this value through the application-owned extended query parser:
  // repeated keys become arrays and bracketed nested shapes become objects. Keep
  // this guard aligned with src/core/app.js and the Search route regression.
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export { searchRoutes };
