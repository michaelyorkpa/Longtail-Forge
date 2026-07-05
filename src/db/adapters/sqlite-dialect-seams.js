const SQLITE_DIALECT_SEAM_CAPABILITIES = Object.freeze({
  booleanStorage: true,
  caseInsensitiveComparison: true,
  conflictWrites: true,
  fullTextSearch: true,
  introspection: true,
  jsonAccess: false,
  physicalIdentity: true,
  returningRows: true,
  timestampIntervalMath: true,
});

function createSqliteDialectSeams() {
  return Object.freeze({
    provider: "sqlite",
    contractVersion: "0.33.5.27.2",
    capabilities: SQLITE_DIALECT_SEAM_CAPABILITIES,
    boolean: Object.freeze({
      bind: bindSqliteBoolean,
      read: readSqliteBoolean,
    }),
    comparison: Object.freeze({
      collateNoCase,
      equalsNoCase,
      likeNoCase,
      orderByNoCase,
    }),
    conflict: Object.freeze({
      excludedColumn,
      insertOrIgnoreInto,
      onConflictDoNothing,
      onConflictDoUpdateSet,
    }),
    identity: Object.freeze({
      lastInsertRowId,
      rowId,
    }),
    introspection: Object.freeze({
      busyTimeout,
      databaseList,
      foreignKeys,
      journalMode,
      tableInfo,
    }),
    json: Object.freeze({
      supported: false,
      value: unsupportedJsonAccess,
    }),
    returning: Object.freeze({
      columns,
    }),
    search: Object.freeze({
      match,
      rank,
    }),
    time: Object.freeze({
      nonNegativeSecondsBetween,
      secondsBetween,
    }),
  });
}

function insertOrIgnoreInto(tableName) {
  return `INSERT OR IGNORE INTO ${normalizeSqlIdentifier(tableName, "table name")}`;
}

function onConflictDoNothing(conflictColumns) {
  return `ON CONFLICT(${normalizeIdentifierList(conflictColumns, "conflict column")}) DO NOTHING`;
}

function onConflictDoUpdateSet(conflictColumns, updateColumns) {
  const assignments = normalizeIdentifierArray(updateColumns, "update column")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  return `ON CONFLICT(${normalizeIdentifierList(conflictColumns, "conflict column")}) DO UPDATE SET ${assignments}`;
}

function excludedColumn(columnName) {
  const column = normalizeSqlIdentifier(columnName, "excluded column");
  return `excluded.${column}`;
}

function collateNoCase(expressionSql) {
  return `${normalizeSqlFragment(expressionSql, "case-insensitive expression")} COLLATE NOCASE`;
}

function equalsNoCase(leftSql, rightSql) {
  return `${normalizeSqlFragment(leftSql, "case-insensitive left expression")} = ${collateNoCase(rightSql)}`;
}

function likeNoCase(leftSql, rightSql) {
  return `${normalizeSqlFragment(leftSql, "case-insensitive left expression")} LIKE ${collateNoCase(rightSql)}`;
}

function orderByNoCase(expressionSql, direction = "ASC") {
  return `${collateNoCase(expressionSql)} ${normalizeSortDirection(direction)}`;
}

function bindSqliteBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return value ? 1 : 0;
}

function readSqliteBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value) !== 0;
}

function secondsBetween(laterExpressionSql, earlierExpressionSql) {
  const later = normalizeSqlFragment(laterExpressionSql, "later timestamp expression");
  const earlier = normalizeSqlFragment(earlierExpressionSql, "earlier timestamp expression");
  return `CAST((julianday(${later}) - julianday(${earlier})) * 86400 AS INTEGER)`;
}

function nonNegativeSecondsBetween(laterExpressionSql, earlierExpressionSql) {
  return `MAX(0, ${secondsBetween(laterExpressionSql, earlierExpressionSql)})`;
}

function match(tableName, queryExpressionSql) {
  return `${normalizeSqlIdentifier(tableName, "FTS table name")} MATCH ${normalizeSqlFragment(queryExpressionSql, "FTS query expression")}`;
}

function rank(tableName) {
  return `bm25(${normalizeSqlIdentifier(tableName, "FTS table name")})`;
}

function columns(returningColumns) {
  return `RETURNING ${normalizeIdentifierList(returningColumns, "returning column")}`;
}

function rowId(alias = "") {
  const rowIdColumn = "rowid";
  const normalizedAlias = String(alias || "").trim();

  if (!normalizedAlias) {
    return rowIdColumn;
  }

  return `${rowIdColumn} AS ${normalizeSqlIdentifier(normalizedAlias, "rowid alias")}`;
}

function lastInsertRowId() {
  return "last_insert_rowid()";
}

function databaseList() {
  return "PRAGMA database_list;";
}

function foreignKeys() {
  return "PRAGMA foreign_keys;";
}

function journalMode() {
  return "PRAGMA journal_mode;";
}

function busyTimeout() {
  return "PRAGMA busy_timeout;";
}

function tableInfo(tableName) {
  return `PRAGMA table_info(${normalizeSqlIdentifier(tableName, "table name")});`;
}

function unsupportedJsonAccess() {
  throw new Error("Database JSON access seam is not implemented because runtime SQL does not currently require JSON operators.");
}

function normalizeIdentifierList(identifiers, label) {
  return normalizeIdentifierArray(identifiers, label).join(", ");
}

function normalizeIdentifierArray(identifiers, label) {
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    throw new Error(`${label} list must contain at least one identifier.`);
  }

  return identifiers.map((identifier) => normalizeSqlIdentifier(identifier, label));
}

function normalizeSqlIdentifier(identifier, label = "SQL identifier") {
  const text = String(identifier || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(text)) {
    throw new Error(`Invalid ${label}: ${text || "(empty)"}.`);
  }

  return text;
}

function normalizeSqlFragment(fragment, label = "SQL fragment") {
  const text = String(fragment || "").trim();

  if (!text) {
    throw new Error(`${label} must be a non-empty SQL fragment.`);
  }

  if (/[;\0]/.test(text) || text.includes("--") || text.includes("/*") || text.includes("*/")) {
    throw new Error(`${label} must be a static or allowlisted SQL fragment without statement separators or comments.`);
  }

  return text;
}

function normalizeSortDirection(direction) {
  const text = String(direction || "ASC").trim().toUpperCase();

  if (text === "ASC" || text === "DESC") {
    return text;
  }

  throw new Error(`Invalid sort direction: ${direction}.`);
}

export {
  createSqliteDialectSeams,
  SQLITE_DIALECT_SEAM_CAPABILITIES,
};
