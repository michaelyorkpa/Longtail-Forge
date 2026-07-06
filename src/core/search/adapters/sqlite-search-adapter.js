import { createBulkValuesBindings, db } from "../../database.js";

const SQLITE_SEARCH_ADAPTER_ID = "sqlite";
const SQLITE_SEARCH_FTS_TABLE = "search_index_fts";
const SQLITE_SEARCH_FTS_PROBE_TABLE = "temp.__ltf_search_fts5_probe";
const SEARCH_INDEX_TABLE = "search_index";
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
  "library_bucket",
  "note_collection_id",
  "collection_path",
  "visibility",
  "record_status",
  "source",
  "record_created_at",
  "record_updated_at",
  "indexed_at",
];
const SQLITE_SEARCH_FTS_COLUMNS = [
  { name: "search_index_id", unindexed: true },
  { name: "workspace_id", unindexed: true },
  { name: "module_id", unindexed: true },
  { name: "record_type", unindexed: true },
  { name: "record_id", unindexed: true },
  "title",
  "summary",
  "body",
  "tags_text",
  "source",
];
const SEARCH_TEXT_COLUMNS = [
  "title",
  "summary",
  "body",
  "tags_text",
  "source",
];
const NULLABLE_SEARCH_INDEX_COLUMNS = new Set([
  "client_id",
  "project_id",
  "library_bucket",
  "note_collection_id",
  "collection_path",
  "record_created_at",
  "record_updated_at",
]);
const SEARCH_SQL_ALIASES = new Set([
  "si",
  SEARCH_INDEX_TABLE,
  SQLITE_SEARCH_FTS_TABLE,
]);

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

      await db.run(db.dialect.search.createVirtualTable(SQLITE_SEARCH_FTS_TABLE, SQLITE_SEARCH_FTS_COLUMNS));

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
      const canonicalValues = createBulkValuesBindings(validDocuments, SEARCH_INDEX_COLUMNS, {
        paramPrefix: "searchIndexValue",
        valueForColumn: searchIndexColumnValue,
      });

      await db.run(`
INSERT INTO ${SEARCH_INDEX_TABLE} (${SEARCH_INDEX_COLUMNS.join(", ")})
VALUES ${canonicalValues.sql}
ON CONFLICT(workspace_id, module_id, record_type, record_id) DO UPDATE SET
  search_index_id = excluded.search_index_id,
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  tags_text = excluded.tags_text,
  client_id = excluded.client_id,
  project_id = excluded.project_id,
  library_bucket = excluded.library_bucket,
  note_collection_id = excluded.note_collection_id,
  collection_path = excluded.collection_path,
  visibility = excluded.visibility,
  record_status = excluded.record_status,
  source = excluded.source,
  record_created_at = excluded.record_created_at,
  record_updated_at = excluded.record_updated_at,
  indexed_at = excluded.indexed_at;
`, canonicalValues.params);

      if (storage.ftsTableReady) {
        await db.transaction(async (transaction) => {
          for (const document of validDocuments) {
            await syncFtsDocument(transaction, document);
          }
        });
      }

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
      const params = {
        moduleId,
        recordId,
        recordType,
        workspaceId,
      };
      const existingRow = await db.get(`
SELECT search_index_id
FROM ${SEARCH_INDEX_TABLE}
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id = :recordId
LIMIT 1;
`, params);
      const resolvedSearchIndexId = searchIndexId || existingRow?.search_index_id ||
        `${workspaceId}:${moduleId}:${recordType}:${recordId}`;

      if (storage.ftsTableReady) {
        await db.transaction(async (transaction) => {
          await transaction.run(deleteCanonicalSearchDocumentSql(), params);
          await transaction.run(deleteFtsDocumentSql(), {
            ...params,
            searchIndexId: resolvedSearchIndexId,
          });
        });
      } else {
        await db.run(deleteCanonicalSearchDocumentSql(), params);
      }

      return {
        removedCount: existingRow ? 1 : 0,
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

      const deleteStatement = buildDeleteFtsRowsStatement(normalizedScope);
      const insertStatement = buildInsertFtsRowsFromCanonicalStatement(normalizedScope);
      await db.transaction(async (transaction) => {
        await transaction.run(deleteStatement.sql, deleteStatement.params);
        await transaction.run(insertStatement.sql, insertStatement.params);
      });

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

async function syncFtsDocument(transaction, document) {
  await transaction.run(deleteFtsDocumentBySearchIndexIdSql(), {
    searchIndexId: normalizeSearchText(document.search_index_id),
  });
  await transaction.run(insertFtsDocumentSql(), ftsDocumentParams(document));
}

function deleteCanonicalSearchDocumentSql() {
  return `
DELETE FROM ${SEARCH_INDEX_TABLE}
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id = :recordId;
`;
}

function deleteFtsDocumentBySearchIndexIdSql() {
  return `
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
WHERE search_index_id = :searchIndexId;
`;
}

function deleteFtsDocumentSql() {
  return `
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
WHERE search_index_id = :searchIndexId
   OR (
    workspace_id = :workspaceId
    AND module_id = :moduleId
    AND record_type = :recordType
    AND record_id = :recordId
  );
`;
}

function insertFtsDocumentSql() {
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
VALUES (
  :searchIndexId,
  :workspaceId,
  :moduleId,
  :recordType,
  :recordId,
  :title,
  :summary,
  :body,
  :tagsText,
  :source
);
`;
}

function ftsDocumentParams(document = {}) {
  return {
    body: normalizeSearchText(document.body),
    moduleId: normalizeSearchText(document.module_id),
    recordId: normalizeSearchText(document.record_id),
    recordType: normalizeSearchText(document.record_type),
    searchIndexId: normalizeSearchText(document.search_index_id),
    source: normalizeSearchText(document.source),
    summary: normalizeSearchText(document.summary),
    tagsText: normalizeSearchText(document.tags_text),
    title: normalizeSearchText(document.title),
    workspaceId: normalizeSearchText(document.workspace_id),
  };
}

async function readCanonicalRowsForRepair(scope) {
  const statement = buildCanonicalRowsForRepairStatement(scope);
  return db.query(statement.sql, statement.params);
}

async function readFtsRowsForRepair(scope) {
  const statement = buildFtsRowsForRepairStatement(scope);
  return db.query(statement.sql, statement.params);
}

function buildCanonicalRowsForRepairStatement(scope) {
  const params = {};
  const where = buildRepairWhereClause(scope, SEARCH_INDEX_TABLE, params);

  return {
    params,
    sql: `
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
FROM ${SEARCH_INDEX_TABLE}
${where ? `WHERE ${where}` : ""}
ORDER BY search_index_id;
`,
  };
}

function buildFtsRowsForRepairStatement(scope) {
  const params = {};
  const where = buildRepairWhereClause(scope, SQLITE_SEARCH_FTS_TABLE, params);

  return {
    params,
    sql: `
SELECT
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id
FROM ${SQLITE_SEARCH_FTS_TABLE}
${where ? `WHERE ${where}` : ""}
ORDER BY search_index_id;
`,
  };
}

function buildDeleteFtsRowsStatement(scope) {
  const params = {};
  const where = buildRepairWhereClause(scope, SQLITE_SEARCH_FTS_TABLE, params);

  return {
    params,
    sql: `
DELETE FROM ${SQLITE_SEARCH_FTS_TABLE}
${where ? `WHERE ${where}` : ""};
`,
  };
}

function buildInsertFtsRowsFromCanonicalStatement(scope) {
  const params = {};
  const where = buildRepairWhereClause(scope, SEARCH_INDEX_TABLE, params);

  return {
    params,
    sql: `
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
FROM ${SEARCH_INDEX_TABLE}
${where ? `WHERE ${where}` : ""};
`,
  };
}

function buildRepairWhereClause(scope, alias, params) {
  const qualifiedAlias = normalizeSearchSqlAlias(alias);
  const whereParts = [];

  if (scope.workspaceId) {
    whereParts.push(`${qualifiedAlias}.workspace_id = ${bindSearchParam(params, "repairWorkspaceId", scope.workspaceId)}`);
  }
  if (scope.moduleId) {
    whereParts.push(`${qualifiedAlias}.module_id = ${bindSearchParam(params, "repairModuleId", scope.moduleId)}`);
  }
  if (scope.recordType) {
    whereParts.push(`${qualifiedAlias}.record_type = ${bindSearchParam(params, "repairRecordType", scope.recordType)}`);
  }

  return whereParts.join("\n  AND ");
}

function normalizeRepairScope(scope = {}) {
  return {
    moduleId: normalizeSearchText(scope.moduleId || scope.module_id),
    recordType: normalizeSearchText(scope.recordType || scope.record_type),
    workspaceId: normalizeSearchText(scope.workspaceId || scope.workspace_id),
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
    const rows = await db.query(db.dialect.introspection.compileOptions());
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
    await db.run(db.dialect.search.createVirtualTable(SQLITE_SEARCH_FTS_PROBE_TABLE, ["content"]));
    await db.run(db.dialect.search.dropVirtualTable(SQLITE_SEARCH_FTS_PROBE_TABLE));

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
  const statement = buildFtsSearchStatement(request);

  if (!statement) {
    return queryLikeResults(request);
  }

  return db.query(statement.sql, statement.params);
}

async function queryLikeResults(request) {
  const statement = buildLikeSearchStatement(request);
  return db.query(statement.sql, statement.params);
}

function buildFtsSearchStatement(request) {
  const ftsQuery = buildFtsQuery(request?.text);

  if (!ftsQuery) {
    return null;
  }

  const params = {
    ftsQuery,
    limit: normalizeSearchLimit(request?.limit),
    offset: normalizeSearchOffset(request?.offset),
  };
  const where = buildSearchWhereClause(request, "si", params);
  const rankSql = db.dialect.search.rank(SQLITE_SEARCH_FTS_TABLE);

  return {
    backend: "sqlite-fts5",
    ftsQuery,
    params,
    sql: `
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
  si.library_bucket,
  si.note_collection_id,
  si.collection_path,
  si.visibility,
  si.record_status,
  si.source,
  si.record_created_at,
  si.record_updated_at,
  si.indexed_at,
  ${rankSql} AS search_score,
  'sqlite-fts5' AS search_backend
FROM ${SQLITE_SEARCH_FTS_TABLE} fts
JOIN ${SEARCH_INDEX_TABLE} si ON si.search_index_id = fts.search_index_id
WHERE ${db.dialect.search.match(SQLITE_SEARCH_FTS_TABLE, ":ftsQuery")}
${where ? `  AND ${where}` : ""}
ORDER BY ${rankSql}, si.indexed_at DESC, si.search_index_id ASC
LIMIT :limit
OFFSET :offset;
`,
  };
}

function buildLikeSearchStatement(request) {
  const params = {
    limit: normalizeSearchLimit(request?.limit),
    offset: normalizeSearchOffset(request?.offset),
  };
  const whereParts = [];
  const searchText = normalizeSearchText(request?.text);

  if (searchText) {
    params.searchTextPattern = db.dialect.comparison.likePattern(searchText);
    whereParts.push(`(
    ${SEARCH_TEXT_COLUMNS.map((column) => (
      db.dialect.comparison.containsNoCase(`si.${column}`, ":searchTextPattern")
    )).join("\n    OR ")}
  )`);
  }

  const commonWhere = buildSearchWhereClause(request, "si", params);
  if (commonWhere) {
    whereParts.push(commonWhere);
  }

  return {
    backend: "sqlite-like",
    params,
    sql: `
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
  si.library_bucket,
  si.note_collection_id,
  si.collection_path,
  si.visibility,
  si.record_status,
  si.source,
  si.record_created_at,
  si.record_updated_at,
  si.indexed_at,
  NULL AS search_score,
  'sqlite-like' AS search_backend
FROM ${SEARCH_INDEX_TABLE} si
${whereParts.length > 0 ? `WHERE ${whereParts.join("\n  AND ")}` : ""}
ORDER BY si.indexed_at DESC, si.title ASC, si.search_index_id ASC
LIMIT :limit
OFFSET :offset;
`,
  };
}

function buildSearchWhereClause(request, alias, params) {
  const qualifiedAlias = normalizeSearchSqlAlias(alias);
  const whereParts = [];
  const workspaceId = normalizeSearchText(request?.workspaceId);
  const targets = Array.isArray(request?.targets) ? request.targets : [];

  if (workspaceId) {
    whereParts.push(`${qualifiedAlias}.workspace_id = ${bindSearchParam(params, "workspaceId", workspaceId)}`);
  }

  const targetConditions = targets
    .map((target, index) => {
      const moduleId = normalizeSearchText(target?.moduleId || target?.module_id);
      const recordType = normalizeSearchText(target?.recordType || target?.record_type);

      if (!moduleId || !recordType) {
        return "";
      }

      return `(${qualifiedAlias}.module_id = ${bindSearchParam(params, `targetModuleId${index}`, moduleId)} AND ${qualifiedAlias}.record_type = ${bindSearchParam(params, `targetRecordType${index}`, recordType)})`;
    })
    .filter(Boolean);

  if (targetConditions.length === 0) {
    whereParts.push("1 = 0");
  } else {
    whereParts.push(`(${targetConditions.join(" OR ")})`);
  }

  const clientId = normalizeSearchText(request?.scopes?.clientId);
  const projectId = normalizeSearchText(request?.scopes?.projectId);
  const libraryBucket = normalizeSearchText(request?.libraryBucket || request?.library_bucket);
  const noteCollectionId = normalizeSearchText(request?.noteCollectionId || request?.note_collection_id);
  const recordStatus = normalizeSearchText(request?.recordStatus);
  const visibility = normalizeSearchText(request?.visibility);
  const source = normalizeSearchText(request?.source);
  const exactTagIds = Array.isArray(request?.exactTagIds)
    ? request.exactTagIds.map(normalizeSearchText).filter(Boolean)
    : [];
  const noTagsMode = normalizeSearchText(request?.noTagsMode);

  if (clientId) {
    whereParts.push(`${qualifiedAlias}.client_id = ${bindSearchParam(params, "clientId", clientId)}`);
  }
  if (projectId) {
    whereParts.push(`${qualifiedAlias}.project_id = ${bindSearchParam(params, "projectId", projectId)}`);
  }
  if (libraryBucket) {
    whereParts.push(`${qualifiedAlias}.library_bucket = ${bindSearchParam(params, "libraryBucket", libraryBucket)}`);
  }
  if (noteCollectionId) {
    whereParts.push(`${qualifiedAlias}.note_collection_id = ${bindSearchParam(params, "noteCollectionId", noteCollectionId)}`);
  }
  if (recordStatus) {
    whereParts.push(`${qualifiedAlias}.record_status = ${bindSearchParam(params, "recordStatus", recordStatus)}`);
  }
  if (visibility) {
    whereParts.push(`${qualifiedAlias}.visibility = ${bindSearchParam(params, "visibility", visibility)}`);
  }
  if (source) {
    whereParts.push(`${qualifiedAlias}.source = ${bindSearchParam(params, "source", source)}`);
  }

  for (const [index, tagId] of exactTagIds.entries()) {
    whereParts.push(`EXISTS (
    SELECT 1
    FROM tag_assignments tag_filter
    WHERE tag_filter.workspace_id = ${qualifiedAlias}.workspace_id
      AND tag_filter.target_type = ${qualifiedAlias}.record_type
      AND tag_filter.target_id = ${qualifiedAlias}.record_id
      AND tag_filter.tag_id = ${bindSearchParam(params, `tagId${index}`, tagId)}
  )`);
  }
  if (noTagsMode === "effective") {
    whereParts.push(`NOT EXISTS (
    SELECT 1
    FROM tag_assignments tag_filter
    WHERE tag_filter.workspace_id = ${qualifiedAlias}.workspace_id
      AND tag_filter.target_type = ${qualifiedAlias}.record_type
      AND tag_filter.target_id = ${qualifiedAlias}.record_id
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

function bindSearchParam(params, name, value) {
  if (Object.hasOwn(params, name)) {
    throw new Error(`Duplicate SQLite search parameter: ${name}.`);
  }

  params[name] = value;
  return `:${name}`;
}

function normalizeSearchLimit(value) {
  const limit = Number.parseInt(value, 10);
  return Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 25;
}

function normalizeSearchOffset(value) {
  const offset = Number.parseInt(value, 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

function normalizeSearchSqlAlias(alias) {
  const text = String(alias || "").trim();

  if (!SEARCH_SQL_ALIASES.has(text)) {
    throw new Error(`Invalid SQLite search SQL alias: ${text || "(empty)"}.`);
  }

  return text;
}

function buildSqliteSearchReadStatementsForTests(request = {}) {
  return {
    fallback: buildLikeSearchStatement(request),
    fts: buildFtsSearchStatement(request),
  };
}

function searchIndexColumnValue(document, columnName) {
  const value = document[columnName];

  if (NULLABLE_SEARCH_INDEX_COLUMNS.has(columnName) && (value === null || value === undefined || String(value).trim() === "")) {
    return null;
  }

  return value || "";
}

function normalizeSearchText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export {
  buildSqliteSearchReadStatementsForTests,
  clearSqliteSearchAdapterCapabilityCacheForTests,
  createSqliteSearchAdapter,
  SQLITE_SEARCH_ADAPTER_ID,
};
