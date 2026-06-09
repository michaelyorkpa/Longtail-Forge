import { querySql, runSql, sqlText } from "../../../db/sqlite.js";

const SQLITE_SEARCH_ADAPTER_ID = "sqlite";
const SQLITE_SEARCH_FTS_TABLE = "search_index_fts";
const SEARCH_INDEX_COLUMNS = [
  "search_index_id",
  "workspace_id",
  "module_id",
  "record_type",
  "record_id",
  "title",
  "summary",
  "body",
  "tags_text",
  "client_id",
  "project_id",
  "visibility",
  "record_status",
  "source",
  "record_created_at",
  "record_updated_at",
  "indexed_at",
];

let cachedCapabilities = null;

function createSqliteSearchAdapter(options = {}) {
  return {
    id: SQLITE_SEARCH_ADAPTER_ID,
    label: "SQLite Search Adapter",
    engine: "sqlite",
    async getCapabilities(runtimeOptions = {}) {
      if (!options.refresh && !runtimeOptions.refresh && cachedCapabilities) {
        return { ...cachedCapabilities };
      }

      const fts5 = await detectFts5Support();
      const capabilities = {
        adapterId: SQLITE_SEARCH_ADAPTER_ID,
        engine: "sqlite",
        activeBackend: fts5.supported ? "sqlite-fts5" : "sqlite-like",
        fallbackMode: fts5.supported ? "none" : "indexed-like",
        fts5Supported: fts5.supported,
        fts5Detection: fts5.detection,
        externalSearchRequired: false,
        supportsPostgresFullText: false,
        supportsExternalSearchEngines: false,
        supportsRecordIndexing: true,
        supportsRebuildTools: true,
        supportsFtsRepair: true,
        supportsPrototypeIndexWrites: false,
        supportsPrototypeSearch: true,
        supportsSingleRecordRemoval: true,
        ftsTable: fts5.supported ? SQLITE_SEARCH_FTS_TABLE : null,
      };

      cachedCapabilities = capabilities;
      return { ...capabilities };
    },
    async ensureStorage(runtimeOptions = {}) {
      const capabilities = await this.getCapabilities(runtimeOptions);

      if (!capabilities.fts5Supported) {
        return {
          adapterId: SQLITE_SEARCH_ADAPTER_ID,
          activeBackend: "sqlite-like",
          fallbackMode: "indexed-like",
          fts5Supported: false,
          ftsTableReady: false,
          reason: capabilities.fts5Detection?.reason || "FTS5 support was not detected.",
        };
      }

      await runSql(`
CREATE VIRTUAL TABLE IF NOT EXISTS ${SQLITE_SEARCH_FTS_TABLE} USING fts5(
  search_index_id UNINDEXED,
  workspace_id UNINDEXED,
  module_id UNINDEXED,
  record_type UNINDEXED,
  record_id UNINDEXED,
  title,
  summary,
  body,
  tags_text,
  source
);
`);

      return {
        adapterId: SQLITE_SEARCH_ADAPTER_ID,
        activeBackend: "sqlite-fts5",
        fallbackMode: "none",
        fts5Supported: true,
        ftsTable: SQLITE_SEARCH_FTS_TABLE,
        ftsTableReady: true,
      };
    },
    async upsertDocuments(documents = [], runtimeOptions = {}) {
      const normalizedDocuments = Array.isArray(documents) ? documents : [documents];
      const validDocuments = normalizedDocuments.filter((document) => document?.search_index_id);

      if (validDocuments.length === 0) {
        return {
          indexedCount: 0,
          ftsSyncedCount: 0,
          storage: await this.ensureStorage(runtimeOptions),
        };
      }

      const storage = await this.ensureStorage(runtimeOptions);
      const statements = validDocuments.flatMap((document) => {
        const values = SEARCH_INDEX_COLUMNS.map((columnName) =>
          sqlSearchValue(document[columnName], {
            nullable: [
              "client_id",
              "project_id",
              "record_created_at",
              "record_updated_at",
            ].includes(columnName),
          }));
        const canonicalStatement = `
INSERT INTO search_index (${SEARCH_INDEX_COLUMNS.join(", ")})
VALUES (${values.join(", ")})
ON CONFLICT(workspace_id, module_id, record_type, record_id) DO UPDATE SET
  search_index_id = excluded.search_index_id,
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  tags_text = excluded.tags_text,
  client_id = excluded.client_id,
  project_id = excluded.project_id,
  visibility = excluded.visibility,
  record_status = excluded.record_status,
  source = excluded.source,
  record_created_at = excluded.record_created_at,
  record_updated_at = excluded.record_updated_at,
  indexed_at = excluded.indexed_at;
`;

        if (!storage.ftsTableReady) {
          return [canonicalStatement];
        }

        return [
          canonicalStatement,
          `
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
WHERE search_index_id = ${sqlText(document.search_index_id)};

INSERT INTO ${SQLITE_SEARCH_FTS_TABLE} (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
)
VALUES (
  ${sqlText(document.search_index_id)},
  ${sqlText(document.workspace_id)},
  ${sqlText(document.module_id)},
  ${sqlText(document.record_type)},
  ${sqlText(document.record_id)},
  ${sqlText(document.title || "")},
  ${sqlText(document.summary || "")},
  ${sqlText(document.body || "")},
  ${sqlText(document.tags_text || "")},
  ${sqlText(document.source || "")}
);
`,
        ];
      });

      await runSql(statements.join("\n"));

      return {
        indexedCount: validDocuments.length,
        ftsSyncedCount: storage.ftsTableReady ? validDocuments.length : 0,
        storage,
      };
    },
    async removeDocument(recordReference = {}, runtimeOptions = {}) {
      const storage = await this.ensureStorage(runtimeOptions);
      const searchIndexId = normalizeSearchText(recordReference.searchIndexId || recordReference.search_index_id);
      const workspaceId = normalizeSearchText(recordReference.workspaceId || recordReference.workspace_id);
      const moduleId = normalizeSearchText(recordReference.moduleId || recordReference.module_id);
      const recordType = normalizeSearchText(recordReference.recordType || recordReference.record_type);
      const recordId = normalizeSearchText(recordReference.recordId || recordReference.record_id);
      const existingRows = await querySql(`
SELECT search_index_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
  AND record_type = ${sqlText(recordType)}
  AND record_id = ${sqlText(recordId)}
LIMIT 1;
`);
      const resolvedSearchIndexId = searchIndexId || existingRows[0]?.search_index_id ||
        `${workspaceId}:${moduleId}:${recordType}:${recordId}`;
      const statements = [
        `
DELETE FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
  AND record_type = ${sqlText(recordType)}
  AND record_id = ${sqlText(recordId)};
`,
      ];

      if (storage.ftsTableReady) {
        statements.push(`
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
WHERE search_index_id = ${sqlText(resolvedSearchIndexId)}
   OR (
    workspace_id = ${sqlText(workspaceId)}
    AND module_id = ${sqlText(moduleId)}
    AND record_type = ${sqlText(recordType)}
    AND record_id = ${sqlText(recordId)}
  );
`);
      }

      await runSql(statements.join("\n"));

      return {
        removedCount: existingRows.length > 0 ? 1 : 0,
        ftsRemovedCount: storage.ftsTableReady ? 1 : 0,
        storage,
      };
    },
    async repairIndex(scope = {}, runtimeOptions = {}) {
      const storage = await this.ensureStorage(runtimeOptions);
      const normalizedScope = normalizeRepairScope(scope);

      if (!storage.ftsTableReady) {
        return {
          adapterId: SQLITE_SEARCH_ADAPTER_ID,
          skipped: true,
          skippedCount: 1,
          reason: storage.reason || "SQLite FTS5 storage is unavailable.",
          scannedCount: 0,
          rebuiltCount: 0,
          missingCount: 0,
          orphanedCount: 0,
          repairedCount: 0,
          storage,
        };
      }

      const canonicalRows = await readCanonicalRowsForRepair(normalizedScope);
      const ftsRows = await readFtsRowsForRepair(normalizedScope);
      const canonicalIds = new Set(canonicalRows.map((row) => row.search_index_id));
      const ftsIds = new Set(ftsRows.map((row) => row.search_index_id));
      const missingCount = canonicalRows.filter((row) => !ftsIds.has(row.search_index_id)).length;
      const orphanedCount = ftsRows.filter((row) => !canonicalIds.has(row.search_index_id)).length;

      if (runtimeOptions.dryRun === true) {
        return {
          adapterId: SQLITE_SEARCH_ADAPTER_ID,
          skipped: false,
          skippedCount: canonicalRows.length + orphanedCount,
          scannedCount: canonicalRows.length,
          rebuiltCount: 0,
          missingCount,
          orphanedCount,
          repairedCount: missingCount + orphanedCount,
          storage,
        };
      }

      await runSql([
        deleteFtsRowsSql(normalizedScope),
        insertFtsRowsFromCanonicalSql(normalizedScope),
      ].join("\n"));

      return {
        adapterId: SQLITE_SEARCH_ADAPTER_ID,
        skipped: false,
        skippedCount: 0,
        scannedCount: canonicalRows.length,
        rebuiltCount: canonicalRows.length,
        missingCount,
        orphanedCount,
        repairedCount: missingCount + orphanedCount,
        storage,
      };
    },
    async search(request, runtimeOptions = {}) {
      const storage = await this.ensureStorage(runtimeOptions);
      const useFts = Boolean(storage.ftsTableReady && request?.text && runtimeOptions.forceFallback !== true);
      const results = useFts
        ? await queryFtsResults(request)
        : await queryLikeResults(request);

      return {
        backend: useFts ? "sqlite-fts5" : "sqlite-like",
        fallbackMode: useFts ? "none" : "indexed-like",
        fts5Supported: storage.fts5Supported,
        ftsTableReady: storage.ftsTableReady,
        results,
      };
    },
  };
}

async function readCanonicalRowsForRepair(scope) {
  return querySql(`
SELECT
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
FROM search_index
${repairWhereClause(scope, "search_index")}
ORDER BY search_index_id;
`);
}

async function readFtsRowsForRepair(scope) {
  return querySql(`
SELECT
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id
FROM ${SQLITE_SEARCH_FTS_TABLE}
${repairWhereClause(scope, SQLITE_SEARCH_FTS_TABLE)}
ORDER BY search_index_id;
`);
}

function deleteFtsRowsSql(scope) {
  return `
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
${repairWhereClause(scope, SQLITE_SEARCH_FTS_TABLE)};
`;
}

function insertFtsRowsFromCanonicalSql(scope) {
  return `
INSERT INTO ${SQLITE_SEARCH_FTS_TABLE} (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
)
SELECT
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
FROM search_index
${repairWhereClause(scope, "search_index")};
`;
}

function repairWhereClause(scope, alias) {
  const whereSql = scope.whereSql(alias);

  return whereSql ? `WHERE ${whereSql}` : "";
}

function normalizeRepairScope(scope = {}) {
  const workspaceId = normalizeSearchText(scope.workspaceId || scope.workspace_id);
  const moduleId = normalizeSearchText(scope.moduleId || scope.module_id);
  const recordType = normalizeSearchText(scope.recordType || scope.record_type);

  return {
    moduleId,
    recordType,
    workspaceId,
    whereSql(alias) {
      return [
        workspaceId ? `${alias}.workspace_id = ${sqlText(workspaceId)}` : "",
        moduleId ? `${alias}.module_id = ${sqlText(moduleId)}` : "",
        recordType ? `${alias}.record_type = ${sqlText(recordType)}` : "",
      ].filter(Boolean).join("\n  AND ");
    },
  };
}

async function detectFts5Support() {
  const compileOptionResult = await detectFts5ViaCompileOptions();

  if (compileOptionResult.supported) {
    return compileOptionResult;
  }

  const probeResult = await detectFts5ViaVirtualTableProbe();

  if (probeResult.supported) {
    return probeResult;
  }

  return {
    supported: false,
    detection: {
      method: "compile_options+virtual_table_probe",
      compileOptionsChecked: compileOptionResult.checked,
      probeAttempted: probeResult.checked,
      reason: probeResult.reason || compileOptionResult.reason || "FTS5 support was not detected.",
    },
  };
}

async function detectFts5ViaCompileOptions() {
  try {
    const rows = await querySql("PRAGMA compile_options;");
    const options = rows.map((row) => String(row.compile_options || row.compile_option || "")).filter(Boolean);

    return {
      checked: true,
      supported: options.some((option) => option.toUpperCase() === "ENABLE_FTS5"),
      detection: {
        method: "compile_options",
        compileOptionsChecked: true,
      },
      reason: options.length === 0 ? "SQLite compile options were empty." : "ENABLE_FTS5 was not listed.",
    };
  } catch (error) {
    return {
      checked: false,
      supported: false,
      reason: `Could not read SQLite compile options: ${error.message}`,
    };
  }
}

async function detectFts5ViaVirtualTableProbe() {
  try {
    await runSql(`
CREATE VIRTUAL TABLE temp.__ltf_search_fts5_probe USING fts5(content);
DROP TABLE temp.__ltf_search_fts5_probe;
`);

    return {
      checked: true,
      supported: true,
      detection: {
        method: "virtual_table_probe",
        compileOptionsChecked: false,
        probeAttempted: true,
      },
    };
  } catch (error) {
    return {
      checked: true,
      supported: false,
      reason: `FTS5 virtual table probe failed: ${error.message}`,
    };
  }
}

function clearSqliteSearchAdapterCapabilityCacheForTests() {
  cachedCapabilities = null;
}

async function queryFtsResults(request) {
  const where = buildSearchWhereClause(request, "si");
  const ftsQuery = buildFtsQuery(request.text);

  if (!ftsQuery) {
    return queryLikeResults(request);
  }

  return querySql(`
SELECT
  si.search_index_id,
  si.workspace_id,
  si.module_id,
  si.record_type,
  si.record_id,
  si.title,
  si.summary,
  si.body,
  si.tags_text,
  si.client_id,
  si.project_id,
  si.visibility,
  si.record_status,
  si.source,
  si.record_created_at,
  si.record_updated_at,
  si.indexed_at,
  bm25(${SQLITE_SEARCH_FTS_TABLE}) AS search_score,
  'sqlite-fts5' AS search_backend
FROM ${SQLITE_SEARCH_FTS_TABLE} fts
JOIN search_index si ON si.search_index_id = fts.search_index_id
WHERE ${SQLITE_SEARCH_FTS_TABLE} MATCH ${sqlText(ftsQuery)}
${where ? `  AND ${where}` : ""}
ORDER BY bm25(${SQLITE_SEARCH_FTS_TABLE}), si.indexed_at DESC
LIMIT ${sqlLimit(request?.limit)}
OFFSET ${sqlOffset(request?.offset)};
`);
}

async function queryLikeResults(request) {
  const whereParts = [];
  const searchText = normalizeSearchText(request?.text);

  if (searchText) {
    const likeValue = sqlLikePattern(searchText);
    whereParts.push(`(
    si.title LIKE ${likeValue} ESCAPE '\\'
    OR si.summary LIKE ${likeValue} ESCAPE '\\'
    OR si.body LIKE ${likeValue} ESCAPE '\\'
    OR si.tags_text LIKE ${likeValue} ESCAPE '\\'
    OR si.source LIKE ${likeValue} ESCAPE '\\'
  )`);
  }

  const commonWhere = buildSearchWhereClause(request, "si");
  if (commonWhere) {
    whereParts.push(commonWhere);
  }

  return querySql(`
SELECT
  si.search_index_id,
  si.workspace_id,
  si.module_id,
  si.record_type,
  si.record_id,
  si.title,
  si.summary,
  si.body,
  si.tags_text,
  si.client_id,
  si.project_id,
  si.visibility,
  si.record_status,
  si.source,
  si.record_created_at,
  si.record_updated_at,
  si.indexed_at,
  NULL AS search_score,
  'sqlite-like' AS search_backend
FROM search_index si
${whereParts.length > 0 ? `WHERE ${whereParts.join("\n  AND ")}` : ""}
ORDER BY si.indexed_at DESC, si.title ASC
LIMIT ${sqlLimit(request?.limit)}
OFFSET ${sqlOffset(request?.offset)};
`);
}

function buildSearchWhereClause(request, alias) {
  const whereParts = [];
  const workspaceId = normalizeSearchText(request?.workspaceId);
  const targets = Array.isArray(request?.targets) ? request.targets : [];

  if (workspaceId) {
    whereParts.push(`${alias}.workspace_id = ${sqlText(workspaceId)}`);
  }

  if (targets.length === 0) {
    whereParts.push("1 = 0");
  } else {
    whereParts.push(`(${targets.map((target) => `(${alias}.module_id = ${sqlText(target.moduleId)} AND ${alias}.record_type = ${sqlText(target.recordType)})`).join(" OR ")})`);
  }

  const clientId = normalizeSearchText(request?.scopes?.clientId);
  const projectId = normalizeSearchText(request?.scopes?.projectId);
  const recordStatus = normalizeSearchText(request?.recordStatus);
  const visibility = normalizeSearchText(request?.visibility);
  const source = normalizeSearchText(request?.source);
  const exactTagIds = Array.isArray(request?.exactTagIds)
    ? request.exactTagIds.map(normalizeSearchText).filter(Boolean)
    : [];

  if (clientId) {
    whereParts.push(`${alias}.client_id = ${sqlText(clientId)}`);
  }
  if (projectId) {
    whereParts.push(`${alias}.project_id = ${sqlText(projectId)}`);
  }
  if (recordStatus) {
    whereParts.push(`${alias}.record_status = ${sqlText(recordStatus)}`);
  }
  if (visibility) {
    whereParts.push(`${alias}.visibility = ${sqlText(visibility)}`);
  }
  if (source) {
    whereParts.push(`${alias}.source = ${sqlText(source)}`);
  }

  for (const tagId of exactTagIds) {
    whereParts.push(`EXISTS (
    SELECT 1
    FROM tag_assignments tag_filter
    WHERE tag_filter.workspace_id = ${alias}.workspace_id
      AND tag_filter.target_type = ${alias}.record_type
      AND tag_filter.target_id = ${alias}.record_id
      AND tag_filter.tag_id = ${sqlText(tagId)}
  )`);
  }

  return whereParts.join("\n  AND ");
}

function buildFtsQuery(value) {
  const tokens = normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean);

  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");
}

function sqlLikePattern(value) {
  const escaped = normalizeSearchText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

  return sqlText(`%${escaped}%`);
}

function sqlLimit(value) {
  const limit = Number.parseInt(value, 10);
  return Number.isInteger(limit) && limit > 0 && limit <= 100 ? String(limit) : "25";
}

function sqlOffset(value) {
  const offset = Number.parseInt(value, 10);
  return Number.isInteger(offset) && offset >= 0 ? String(offset) : "0";
}

function sqlSearchValue(value, options = {}) {
  if (options.nullable && (value === null || value === undefined || String(value).trim() === "")) {
    return "NULL";
  }

  return sqlText(value || "");
}

function normalizeSearchText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export {
  clearSqliteSearchAdapterCapabilityCacheForTests,
  createSqliteSearchAdapter,
  SQLITE_SEARCH_ADAPTER_ID,
};
