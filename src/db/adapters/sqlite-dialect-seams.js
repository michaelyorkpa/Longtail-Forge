/** @typedef {import("../../types/database-contracts.js").DatabaseDialect} DatabaseDialect */
/** @typedef {import("../../types/database-contracts.js").DatabaseInsertOptions} DatabaseInsertOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseInsertConflictNothingOptions} DatabaseInsertConflictNothingOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseInsertConflictUpdateOptions} DatabaseInsertConflictUpdateOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseInsertAnyConflictUpdateOptions} DatabaseInsertAnyConflictUpdateOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseInsertValues} DatabaseInsertValues */
/** @typedef {import("../../types/database-contracts.js").DatabaseLikeOptions} DatabaseLikeOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseLikePatternOptions} DatabaseLikePatternOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseSortDirection} DatabaseSortDirection */
/** @typedef {import("../../types/database-contracts.js").DatabaseBooleanInput} DatabaseBooleanInput */
/** @typedef {import("../../types/database-contracts.js").DatabaseBooleanStorageValue} DatabaseBooleanStorageValue */
/** @typedef {import("../../types/database-contracts.js").DatabaseBooleanReadValue} DatabaseBooleanReadValue */
/** @typedef {import("../../types/database-contracts.js").DatabaseBooleanReadOptions} DatabaseBooleanReadOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseBooleanFieldsReadOptions<string>} DatabaseBooleanFieldsReadOptions */
/** @typedef {import("../../types/database-contracts.js").DatabaseFtsColumn} DatabaseFtsColumn */
/** @typedef {import("../../types/database-contracts.js").DatabaseRowIdOptions} DatabaseRowIdOptions */

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

// This identifies the dialect seam contract, not the current application release.
const SQLITE_DIALECT_CONTRACT_VERSION = "0.33.6.14a";

/** @returns {DatabaseDialect} */
function createSqliteDialectSeams() {
  return Object.freeze({
    provider: "sqlite",
    contractVersion: SQLITE_DIALECT_CONTRACT_VERSION,
    capabilities: SQLITE_DIALECT_SEAM_CAPABILITIES,
    boolean: Object.freeze({
      bind: bindSqliteBoolean,
      bindFields: bindSqliteBooleanFields,
      read: readSqliteBoolean,
      readField: readSqliteBooleanField,
      readFields: readSqliteBooleanFields,
    }),
    comparison: Object.freeze({
      collateNoCase,
      containsNoCase,
      equalsNoCase,
      escapeLikePattern,
      likePattern,
      likeNoCase,
      orderByNoCase,
    }),
    conflict: Object.freeze({
      buildInsertOnAnyConflictDoUpdate,
      buildInsertOnConflictDoNothing,
      buildInsertOnConflictDoUpdate,
      buildInsertOrIgnore,
      excludedColumn,
      insertOrIgnoreInto,
      onAnyConflictDoUpdateSet,
      onConflictDoNothing,
      onConflictDoUpdateSet,
    }),
    identity: Object.freeze({
      lastInsertRowId,
      rowId,
    }),
    introspection: Object.freeze({
      busyTimeout,
      compileOptions,
      databaseList,
      deferForeignKeys,
      foreignKeyCheck,
      foreignKeys,
      integrityCheck,
      journalMode,
      scopedTableRows,
      tableInfo,
      tableNames,
    }),
    json: Object.freeze({
      supported: false,
      value: unsupportedJsonAccess,
    }),
    returning: Object.freeze({
      columns,
    }),
    search: Object.freeze({
      createVirtualTable,
      dropVirtualTable,
      match,
      rank,
    }),
    time: Object.freeze({
      elapsedSecondsSince,
      nonNegativeSecondsBetween,
      secondsBetween,
    }),
  });
}

/** @param {string} tableName */
function insertOrIgnoreInto(tableName) {
  return `INSERT OR IGNORE INTO ${normalizeSqlIdentifier(tableName, "table name")}`;
}

/** @param {DatabaseInsertOptions} options */
function buildInsertOrIgnore(options) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `${insertOrIgnoreInto(statement.tableName)} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    statement.returningSql,
  ]);
}

/** @param {DatabaseInsertConflictNothingOptions} options */
function buildInsertOnConflictDoNothing(options) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onConflictDoNothing(options.conflictColumns),
    statement.returningSql,
  ]);
}

/** @param {DatabaseInsertConflictUpdateOptions} options */
function buildInsertOnConflictDoUpdate(options) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onConflictDoUpdateSet(options.conflictColumns, options.updateColumns),
    statement.returningSql,
  ]);
}

/** @param {DatabaseInsertAnyConflictUpdateOptions} options */
function buildInsertOnAnyConflictDoUpdate(options) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onAnyConflictDoUpdateSet(options.updateColumns),
    statement.returningSql,
  ]);
}

/** @param {readonly string[]} conflictColumns */
function onConflictDoNothing(conflictColumns) {
  return `ON CONFLICT(${normalizeIdentifierList(conflictColumns, "conflict column")}) DO NOTHING`;
}

/** @param {readonly string[]} conflictColumns @param {readonly string[]} updateColumns */
function onConflictDoUpdateSet(conflictColumns, updateColumns) {
  const assignments = normalizeIdentifierArray(updateColumns, "update column")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  return `ON CONFLICT(${normalizeIdentifierList(conflictColumns, "conflict column")}) DO UPDATE SET ${assignments}`;
}

/** @param {readonly string[]} updateColumns */
function onAnyConflictDoUpdateSet(updateColumns) {
  const assignments = normalizeIdentifierArray(updateColumns, "update column")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  return `ON CONFLICT DO UPDATE SET ${assignments}`;
}

/** @param {string} columnName */
function excludedColumn(columnName) {
  const column = normalizeSqlIdentifier(columnName, "excluded column");
  return `excluded.${column}`;
}

/** @param {string} expressionSql */
function collateNoCase(expressionSql) {
  return `${normalizeSqlFragment(expressionSql, "case-insensitive expression")} COLLATE NOCASE`;
}

/** @param {string} leftSql @param {string} rightSql */
function equalsNoCase(leftSql, rightSql) {
  return `${normalizeSqlFragment(leftSql, "case-insensitive left expression")} = ${collateNoCase(rightSql)}`;
}

/**
 * @param {string} leftSql
 * @param {string} rightSql
 * @param {DatabaseLikeOptions} [options]
 */
function likeNoCase(leftSql, rightSql, options = {}) {
  const comparisonSql = `${normalizeSqlFragment(leftSql, "case-insensitive left expression")} LIKE ${collateNoCase(rightSql)}`;

  if (options.escape === true || options.escapeCharacter) {
    return `${comparisonSql} ESCAPE ${quoteSqlStringLiteral(normalizeLikeEscapeCharacter(options.escapeCharacter))}`;
  }

  return comparisonSql;
}

/**
 * @param {string} leftSql
 * @param {string} rightSql
 * @param {DatabaseLikeOptions} [options]
 */
function containsNoCase(leftSql, rightSql, options = {}) {
  return likeNoCase(leftSql, rightSql, {
    ...options,
    escape: true,
  });
}

/**
 * @param {unknown} value
 * @param {DatabaseLikePatternOptions} [options]
 */
function likePattern(value, options = {}) {
  const escaped = escapeLikePattern(value, options);
  const mode = normalizeLikePatternMode(options.mode || options.match || "contains");

  if (mode === "exact") {
    return escaped;
  }
  if (mode === "startsWith") {
    return `${escaped}%`;
  }
  if (mode === "endsWith") {
    return `%${escaped}`;
  }

  return `%${escaped}%`;
}

/**
 * @param {unknown} value
 * @param {Partial<Pick<DatabaseLikePatternOptions, "escapeCharacter">>} [options]
 */
function escapeLikePattern(value, options = {}) {
  const escapeCharacter = normalizeLikeEscapeCharacter(options.escapeCharacter);
  let escaped = "";

  for (const character of String(value ?? "")) {
    if (character === escapeCharacter || character === "%" || character === "_") {
      escaped += escapeCharacter;
    }
    escaped += character;
  }

  return escaped;
}

/**
 * @param {string} expressionSql
 * @param {DatabaseSortDirection} [direction]
 */
function orderByNoCase(expressionSql, direction = "ASC") {
  return `${collateNoCase(expressionSql)} ${normalizeSortDirection(direction)}`;
}

/**
 * @param {DatabaseBooleanInput} value
 * @returns {DatabaseBooleanStorageValue}
 */
function bindSqliteBoolean(value) {
  const normalized = normalizeLogicalBoolean(value);
  return normalized === null ? null : normalized ? 1 : 0;
}

/**
 * @template {Record<string, unknown>} RecordType
 * @template {Extract<keyof RecordType, string>} FieldName
 * @param {RecordType} values
 * @param {readonly FieldName[]} fieldNames
 * @returns {import("../../types/database-contracts.js").DatabaseBooleanBoundFields<RecordType, FieldName>}
 */
function bindSqliteBooleanFields(values, fieldNames) {
  const nextValues = { ...values };

  for (const fieldName of normalizeFieldNameArray(fieldNames, "boolean bind field")) {
    if (Object.hasOwn(nextValues, fieldName)) {
      /** @type {Record<string, unknown>} */ (nextValues)[fieldName] = bindSqliteBoolean(
        /** @type {DatabaseBooleanInput} */ (nextValues[fieldName]),
      );
    }
  }

  return /** @type {import("../../types/database-contracts.js").DatabaseBooleanBoundFields<RecordType, FieldName>} */ (nextValues);
}

/**
 * @param {DatabaseBooleanInput} value
 * @returns {DatabaseBooleanReadValue}
 */
function readSqliteBoolean(value) {
  return normalizeLogicalBoolean(value);
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} fieldName
 * @param {DatabaseBooleanReadOptions} [options]
 * @returns {DatabaseBooleanReadValue}
 */
function readSqliteBooleanField(row, fieldName, options = {}) {
  const key = normalizeObjectFieldName(fieldName, "boolean read field");
  const source = row && typeof row === "object" ? row : {};

  if (!Object.hasOwn(source, key)) {
    return Object.hasOwn(options, "fallback")
      ? /** @type {DatabaseBooleanReadValue} */ (options.fallback)
      : null;
  }

  return readSqliteBoolean(/** @type {DatabaseBooleanInput} */ (source[key]));
}

/**
 * @template {Record<string, unknown>} RecordType
 * @template {Extract<keyof RecordType, string>} FieldName
 * @param {RecordType} row
 * @param {readonly FieldName[]} fieldNames
 * @param {DatabaseBooleanFieldsReadOptions} [options]
 * @returns {import("../../types/database-contracts.js").DatabaseBooleanReadFields<RecordType, FieldName>}
 */
function readSqliteBooleanFields(row, fieldNames, options = {}) {
  const nextRow = { ...(row || {}) };
  const fallbacks = options.fallbacks && typeof options.fallbacks === "object" ? options.fallbacks : {};

  for (const fieldName of normalizeFieldNameArray(fieldNames, "boolean read field")) {
    const fieldOptions = Object.hasOwn(fallbacks, fieldName)
      ? { fallback: fallbacks[fieldName] }
      : {};
    /** @type {Record<string, unknown>} */ (nextRow)[fieldName] = readSqliteBooleanField(row, fieldName, fieldOptions);
  }

  return /** @type {import("../../types/database-contracts.js").DatabaseBooleanReadFields<RecordType, FieldName>} */ (nextRow);
}

/** @param {string} laterExpressionSql @param {string} earlierExpressionSql */
function secondsBetween(laterExpressionSql, earlierExpressionSql) {
  const later = normalizeSqlFragment(laterExpressionSql, "later timestamp expression");
  const earlier = normalizeSqlFragment(earlierExpressionSql, "earlier timestamp expression");
  return `CAST((julianday(${later}) - julianday(${earlier})) * 86400 AS INTEGER)`;
}

/** @param {string} laterExpressionSql @param {string} earlierExpressionSql */
function nonNegativeSecondsBetween(laterExpressionSql, earlierExpressionSql) {
  return `MAX(0, ${secondsBetween(laterExpressionSql, earlierExpressionSql)})`;
}

/** @param {string} timestampExpressionSql @param {string} [referenceExpressionSql] */
function elapsedSecondsSince(timestampExpressionSql, referenceExpressionSql = ":now") {
  return nonNegativeSecondsBetween(referenceExpressionSql, timestampExpressionSql);
}

/** @param {string} tableName @param {string} queryExpressionSql */
function match(tableName, queryExpressionSql) {
  return `${normalizeSqlIdentifier(tableName, "FTS table name")} MATCH ${normalizeSqlFragment(queryExpressionSql, "FTS query expression")}`;
}

/** @param {string} tableName */
function rank(tableName) {
  return `bm25(${normalizeSqlIdentifier(tableName, "FTS table name")})`;
}

/**
 * @param {string} tableName
 * @param {readonly DatabaseFtsColumn[]} columns
 */
function createVirtualTable(tableName, columns) {
  const columnDefinitions = normalizeFtsColumnDefinitions(columns).join(",\n  ");
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${normalizeSqlIdentifier(tableName, "FTS table name")} USING fts5(\n  ${columnDefinitions}\n)`;
}

/** @param {string} tableName */
function dropVirtualTable(tableName) {
  return `DROP TABLE IF EXISTS ${normalizeSqlIdentifier(tableName, "FTS table name")}`;
}

/** @param {readonly string[]} returningColumns */
function columns(returningColumns) {
  return `RETURNING ${normalizeIdentifierList(returningColumns, "returning column")}`;
}

/** @param {DatabaseRowIdOptions} [options] */
function rowId(options = "") {
  const rowIdColumn = "rowid";
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const tableAlias = typeof options === "object"
    ? String(normalizedOptions.tableAlias || normalizedOptions.table || "").trim()
    : "";
  const alias = typeof options === "object" ? normalizedOptions.alias : options;
  const normalizedAlias = String(alias || "").trim();
  const rowIdExpression = tableAlias
    ? `${normalizeSqlIdentifier(tableAlias, "rowid table alias")}.${rowIdColumn}`
    : rowIdColumn;

  if (!normalizedAlias) {
    return rowIdExpression;
  }

  return `${rowIdExpression} AS ${normalizeSqlIdentifier(normalizedAlias, "rowid alias")}`;
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

function deferForeignKeys() {
  return "PRAGMA defer_foreign_keys = ON;";
}

function foreignKeyCheck() {
  return "PRAGMA foreign_key_check;";
}

function integrityCheck() {
  return "PRAGMA integrity_check;";
}

function journalMode() {
  return "PRAGMA journal_mode;";
}

function busyTimeout() {
  return "PRAGMA busy_timeout;";
}

function compileOptions() {
  return "PRAGMA compile_options;";
}

/** @param {string} tableName */
function tableInfo(tableName) {
  return `PRAGMA table_info(${normalizeSqlIdentifier(tableName, "table name")});`;
}

function tableNames() {
  return "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
}

/** @param {string} tableName @param {string} scopeColumn */
function scopedTableRows(tableName, scopeColumn) {
  const normalizedTable = normalizeSqlIdentifier(tableName, "table name");
  const normalizedScopeColumn = normalizeSqlIdentifier(scopeColumn, "scope column");
  return Object.freeze({
    count: `SELECT COUNT(1) AS count FROM ${normalizedTable} WHERE ${normalizedScopeColumn} = :scopeValue;`,
    delete: `DELETE FROM ${normalizedTable} WHERE ${normalizedScopeColumn} = :scopeValue;`,
  });
}

/** @returns {never} */
function unsupportedJsonAccess() {
  throw new Error("Database JSON access seam is not implemented because runtime SQL does not currently require JSON operators.");
}

/** @param {DatabaseInsertOptions} options */
function normalizeInsertStatement(options) {
  const tableName = normalizeSqlIdentifier(options.tableName || options.table, "table name");
  const columnNames = normalizeIdentifierArray(options.columns, "insert column");
  const valuesSql = normalizeInsertValues(columnNames, options.valueExpressions || options.values);
  const returningSql = Array.isArray(options.returningColumns) && options.returningColumns.length > 0
    ? columns(options.returningColumns)
    : "";

  return {
    columnsSql: columnNames.join(", "),
    returningSql,
    tableName,
    valuesSql,
  };
}

/**
 * @param {readonly string[]} columnNames
 * @param {DatabaseInsertValues | undefined} valueExpressions
 */
function normalizeInsertValues(columnNames, valueExpressions) {
  if (!valueExpressions) {
    return columnNames.map((columnName) => `:${columnName}`).join(", ");
  }

  if (Array.isArray(valueExpressions)) {
    if (valueExpressions.length !== columnNames.length) {
      throw new Error("insert value expression list must match the insert column list.");
    }

    return valueExpressions
      .map((expression) => normalizeSqlFragment(expression, "insert value expression"))
      .join(", ");
  }

  if (typeof valueExpressions === "object") {
    const expressionsByColumn = /** @type {Readonly<Record<string, string>>} */ (valueExpressions);
    return columnNames
      .map((columnName) => {
        if (!Object.hasOwn(expressionsByColumn, columnName)) {
          throw new Error(`Missing insert value expression for column ${columnName}.`);
        }

        return normalizeSqlFragment(expressionsByColumn[columnName], "insert value expression");
      })
      .join(", ");
  }

  throw new Error("insert value expressions must be an array or object keyed by insert column.");
}

/** @param {readonly unknown[]} lines */
function composeSqlLines(lines) {
  return lines
    .filter((line) => String(line || "").trim())
    .join("\n");
}

/** @param {readonly string[]} identifiers @param {string} label */
function normalizeIdentifierList(identifiers, label) {
  return normalizeIdentifierArray(identifiers, label).join(", ");
}

/** @param {readonly string[]} identifiers @param {string} label */
function normalizeIdentifierArray(identifiers, label) {
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    throw new Error(`${label} list must contain at least one identifier.`);
  }

  return identifiers.map((identifier) => normalizeSqlIdentifier(identifier, label));
}

/** @param {readonly DatabaseFtsColumn[]} columns */
function normalizeFtsColumnDefinitions(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("FTS column list must contain at least one column.");
  }

  return columns.map((column) => {
    if (typeof column === "string") {
      return normalizeSqlIdentifier(column, "FTS column");
    }

    if (column && typeof column === "object") {
      const name = normalizeSqlIdentifier(column.name, "FTS column");
      return column.indexed === false || column.unindexed === true
        ? `${name} UNINDEXED`
        : name;
    }

    throw new Error("FTS columns must be strings or column definition objects.");
  });
}

/** @param {readonly PropertyKey[]} fieldNames @param {string} label */
function normalizeFieldNameArray(fieldNames, label) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    throw new Error(`${label} list must contain at least one field name.`);
  }

  return fieldNames.map((fieldName) => normalizeObjectFieldName(fieldName, label));
}

/** @param {unknown} fieldName @param {string} [label] */
function normalizeObjectFieldName(fieldName, label = "field name") {
  const text = String(fieldName || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`Invalid ${label}: ${text || "(empty)"}.`);
  }

  return text;
}

/** @param {unknown} identifier @param {string} [label] */
function normalizeSqlIdentifier(identifier, label = "SQL identifier") {
  const text = String(identifier || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(text)) {
    throw new Error(`Invalid ${label}: ${text || "(empty)"}.`);
  }

  return text;
}

/** @param {unknown} fragment @param {string} [label] */
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

/** @param {DatabaseSortDirection | undefined} direction */
function normalizeSortDirection(direction) {
  const text = String(direction || "ASC").trim().toUpperCase();

  if (text === "ASC" || text === "DESC") {
    return text;
  }

  throw new Error(`Invalid sort direction: ${direction}.`);
}

/** @param {unknown} [value] */
function normalizeLikeEscapeCharacter(value = "\\") {
  const text = String(value || "\\");

  if (text.length !== 1 || text === "\0") {
    throw new Error("LIKE escape character must be exactly one non-null character.");
  }

  return text;
}

/** @param {unknown} value */
function normalizeLikePatternMode(value) {
  const text = String(value || "contains").trim().toLowerCase();

  if (text === "contains") {
    return "contains";
  }
  if (text === "exact") {
    return "exact";
  }
  if (text === "startswith" || text === "starts_with" || text === "starts-with") {
    return "startsWith";
  }
  if (text === "endswith" || text === "ends_with" || text === "ends-with") {
    return "endsWith";
  }

  throw new Error(`Invalid LIKE pattern mode: ${value}.`);
}

/** @param {DatabaseBooleanInput} value @returns {DatabaseBooleanReadValue} */
function normalizeLogicalBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Boolean value must be finite.");
    }

    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  throw new Error("Boolean value must be null, boolean, numeric, or a recognized boolean string.");
}

/** @param {unknown} value */
function quoteSqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export {
  createSqliteDialectSeams,
  SQLITE_DIALECT_SEAM_CAPABILITIES,
};
