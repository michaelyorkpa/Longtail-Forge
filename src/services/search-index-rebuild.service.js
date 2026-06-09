import { getSearchIndexer } from "../core/search/indexer-registry.js";
import { modulesService } from "../core/modules/modules.service.js";
import { querySql, sqlText } from "../db/index.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { AppError } from "../utils/app-error.js";
import { auditService } from "./audit.service.js";
import { searchService } from "./search.service.js";

async function rebuildWorkspace(options = {}) {
  const workspaceId = normalizeId(options.workspaceId || options.workspace_id);
  const moduleId = normalizeId(options.moduleId || options.module_id);
  const dryRun = options.dryRun === true || options.dry_run === true;

  if (!workspaceId) {
    throw new AppError("Workspace search rebuild requires a workspace.", 400);
  }

  const searchableTypes = await resolveWorkspaceSearchableTypes(workspaceId, moduleId);
  const summary = createSummary({
    scope: moduleId ? "module" : "workspace",
    workspaceId,
    moduleId,
    dryRun,
  });

  for (const searchableType of searchableTypes) {
    mergeSummary(summary, await rebuildSearchableType({
      dryRun,
      searchableType,
      workspaceId,
    }));
  }

  mergeSummary(summary, await removeInactiveSearchRows({
    activeSearchableTypes: searchableTypes,
    dryRun,
    moduleId,
    workspaceId,
  }));

  if (options.audit !== false && options.session) {
    await recordRebuildAudit(options.session, summary, options.source || "admin-api");
  }

  return summary;
}

async function removeInactiveSearchRows({ activeSearchableTypes, dryRun, moduleId, workspaceId }) {
  const summary = createSummary({
    scope: "inactive_record_types",
    workspaceId,
    moduleId,
    dryRun,
  });
  const targetSummary = {
    moduleId: moduleId || "",
    recordType: "inactive_search_rows",
    scanned: 0,
    indexed: 0,
    skipped: 0,
    removed: 0,
    failed: 0,
    repaired: 0,
    errors: [],
  };
  const activeKeys = new Set(activeSearchableTypes.map((type) => `${type.moduleId}:${type.recordType}`));
  const rows = await querySql(`
SELECT workspace_id, module_id, record_type, record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
${moduleId ? `  AND module_id = ${sqlText(moduleId)}` : ""}
ORDER BY module_id, record_type, record_id;
`);
  const inactiveRows = rows.filter((row) => !activeKeys.has(`${row.module_id}:${row.record_type}`));

  targetSummary.scanned = inactiveRows.length;
  summary.counts.scanned = inactiveRows.length;

  for (const row of inactiveRows) {
    if (dryRun) {
      targetSummary.skipped += 1;
      summary.counts.skipped += 1;
      continue;
    }

    const removed = await searchService.removeSearchDocument({
      workspaceId: row.workspace_id,
      moduleId: row.module_id,
      recordType: row.record_type,
      recordId: row.record_id,
    });

    if (removed.ok) {
      targetSummary.removed += removed.removedCount;
      summary.counts.removed += removed.removedCount;
    } else {
      targetSummary.failed += 1;
      summary.counts.failed += 1;
      targetSummary.errors.push(...removed.errors);
    }
  }

  if (inactiveRows.length > 0) {
    summary.targets.push(targetSummary);
  }

  return summary;
}

async function rebuildModule(options = {}) {
  const moduleId = normalizeId(options.moduleId || options.module_id);

  if (!moduleId) {
    throw new AppError("Module search rebuild requires a module ID.", 400);
  }

  return rebuildWorkspace({
    ...options,
    moduleId,
  });
}

async function rebuildApp(options = {}) {
  const dryRun = options.dryRun === true || options.dry_run === true;
  const moduleId = normalizeId(options.moduleId || options.module_id);
  const workspaces = await userWorkspacesRepository.readAllWorkspaces();
  const summary = createSummary({
    scope: moduleId ? "app-module" : "app",
    moduleId,
    dryRun,
  });

  for (const workspace of workspaces) {
    mergeSummary(summary, await rebuildWorkspace({
      audit: false,
      dryRun,
      moduleId,
      source: options.source || "local-script",
      workspaceId: workspace.workspace_id,
    }));
  }

  return summary;
}

async function rebuildSearchableType({ dryRun, searchableType, workspaceId }) {
  const summary = createSummary({
    scope: "record_type",
    workspaceId,
    moduleId: searchableType.moduleId,
    dryRun,
  });
  const targetSummary = {
    moduleId: searchableType.moduleId,
    recordType: searchableType.recordType,
    scanned: 0,
    indexed: 0,
    skipped: 0,
    removed: 0,
    failed: 0,
    repaired: 0,
    errors: [],
  };
  summary.targets.push(targetSummary);

  try {
    const indexer = getSearchIndexer(searchableType.indexer);

    if (typeof indexer !== "function") {
      throw new AppError(`Search indexer '${searchableType.indexer}' is not registered.`, 500);
    }

    const result = await indexer({
      declaration: searchableType,
      rebuild: true,
      searchService,
      workspaceId,
    });
    const documents = extractDocuments(result)
      .map((document) => searchService.normalizeSearchDocument(searchableType, document));
    const documentRecordIds = new Set(documents.map((document) => document.record_id));

    targetSummary.scanned += documents.length;
    summary.counts.scanned += documents.length;

    for (const document of documents) {
      if (dryRun) {
        targetSummary.skipped += 1;
        summary.counts.skipped += 1;
        continue;
      }

      const indexed = await searchService.indexSearchDocument(document);
      if (indexed.ok) {
        targetSummary.indexed += 1;
        summary.counts.indexed += 1;
      } else {
        targetSummary.failed += 1;
        summary.counts.failed += 1;
        targetSummary.errors.push(...indexed.errors);
      }
    }

    const staleRecordIds = await readStaleSearchRecordIds({
      indexedRecordIds: documentRecordIds,
      moduleId: searchableType.moduleId,
      recordType: searchableType.recordType,
      workspaceId,
    });

    for (const recordId of staleRecordIds) {
      if (dryRun) {
        targetSummary.skipped += 1;
        summary.counts.skipped += 1;
        continue;
      }

      const removed = await searchService.removeSearchDocument({
        workspaceId,
        moduleId: searchableType.moduleId,
        recordType: searchableType.recordType,
        recordId,
      });

      if (removed.ok) {
        targetSummary.removed += removed.removedCount;
        summary.counts.removed += removed.removedCount;
      } else {
        targetSummary.failed += 1;
        summary.counts.failed += 1;
        targetSummary.errors.push(...removed.errors);
      }
    }

    const repair = await searchService.repairSearchBackendIndex({
      workspaceId,
      moduleId: searchableType.moduleId,
      recordType: searchableType.recordType,
    }, {
      dryRun,
    });

    targetSummary.repaired += repair.repairedCount || 0;
    summary.counts.repaired += repair.repairedCount || 0;
    targetSummary.skipped += repair.skippedCount || 0;
    summary.counts.skipped += repair.skippedCount || 0;
    targetSummary.ftsRepair = {
      rebuilt: repair.rebuiltCount || 0,
      missing: repair.missingCount || 0,
      orphaned: repair.orphanedCount || 0,
      skipped: repair.skipped === true,
    };
  } catch (error) {
    targetSummary.failed += 1;
    summary.counts.failed += 1;
    targetSummary.errors.push({
      code: error instanceof AppError ? `search_rebuild_${error.statusCode || 500}` : "search_rebuild_error",
      message: error?.message || String(error),
    });
  }

  return summary;
}

async function resolveWorkspaceSearchableTypes(workspaceId, moduleId) {
  if (moduleId && !modulesService.getModule(moduleId)) {
    throw new AppError(`Module '${moduleId}' is not registered.`, 400);
  }

  const searchableTypes = await searchService.listActiveSearchableTypes(workspaceId);
  const filteredTypes = moduleId
    ? searchableTypes.filter((type) => type.moduleId === moduleId)
    : searchableTypes;

  if (moduleId && filteredTypes.length === 0) {
    throw new AppError(`Module '${moduleId}' is not enabled or has no active searchable types in this workspace.`, 400);
  }

  return filteredTypes;
}

async function readStaleSearchRecordIds({ indexedRecordIds, moduleId, recordType, workspaceId }) {
  const rows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
  AND record_type = ${sqlText(recordType)}
ORDER BY record_id;
`);

  return rows
    .map((row) => row.record_id)
    .filter((recordId) => !indexedRecordIds.has(recordId));
}

async function recordRebuildAudit(session, summary, source) {
  await auditService.record({
    session,
    action: "search_index_rebuilt",
    changeType: "settings_change",
    recordType: summary.moduleId ? "module" : "workspace_setting",
    recordId: summary.moduleId || "search_index",
    recordLabel: summary.moduleId || "Search Index",
    recordUrl: "workspace-settings.html",
    previousValue: null,
    newValue: {
      counts: summary.counts,
      dryRun: summary.dryRun,
      scope: summary.scope,
    },
    metadata: {
      dry_run: summary.dryRun,
      failed: summary.counts.failed,
      indexed: summary.counts.indexed,
      module_id: summary.moduleId || "",
      removed: summary.counts.removed,
      repaired: summary.counts.repaired,
      scanned: summary.counts.scanned,
      scope: summary.scope,
      skipped: summary.counts.skipped,
      source,
      workspace_id: summary.workspaceId || session.workspace_id,
    },
    force: true,
  });
}

function createSummary({ scope, workspaceId = "", moduleId = "", dryRun = false }) {
  return {
    scope,
    workspaceId,
    moduleId,
    dryRun,
    counts: {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      failed: 0,
      repaired: 0,
    },
    targets: [],
  };
}

function mergeSummary(target, source) {
  for (const countName of Object.keys(target.counts)) {
    target.counts[countName] += source.counts[countName] || 0;
  }
  target.targets.push(...(source.targets || []));
}

function extractDocuments(result) {
  if (!result || result.searchable === false) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result.documents)) {
    return result.documents;
  }
  if (result.document) {
    return [result.document];
  }

  return [result];
}

function normalizeId(value) {
  return String(value || "").trim();
}

export const searchIndexRebuildService = {
  rebuildApp,
  rebuildModule,
  rebuildWorkspace,
};
