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
    contractVersion: "0.33.6.2",
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

function insertOrIgnoreInto(tableName) {
  return `INSERT OR IGNORE INTO ${normalizeSqlIdentifier(tableName, "table name")}`;
}

function buildInsertOrIgnore(options = {}) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `${insertOrIgnoreInto(statement.tableName)} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    statement.returningSql,
  ]);
}

function buildInsertOnConflictDoNothing(options = {}) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onConflictDoNothing(options.conflictColumns),
    statement.returningSql,
  ]);
}

function buildInsertOnConflictDoUpdate(options = {}) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onConflictDoUpdateSet(options.conflictColumns, options.updateColumns),
    statement.returningSql,
  ]);
}

function buildInsertOnAnyConflictDoUpdate(options = {}) {
  const statement = normalizeInsertStatement(options);
  return composeSqlLines([
    `INSERT INTO ${statement.tableName} (${statement.columnsSql})`,
    `VALUES (${statement.valuesSql})`,
    onAnyConflictDoUpdateSet(options.updateColumns),
    statement.returningSql,
  ]);
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

function onAnyConflictDoUpdateSet(updateColumns) {
  const assignments = normalizeIdentifierArray(updateColumns, "update column")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  return `ON CONFLICT DO UPDATE SET ${assignments}`;
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

function likeNoCase(leftSql, rightSql, options = {}) {
  const comparisonSql = `${normalizeSqlFragment(leftSql, "case-insensitive left expression")} LIKE ${collateNoCase(rightSql)}`;

  if (options.escape === true || options.escapeCharacter) {
    return `${comparisonSql} ESCAPE ${quoteSqlStringLiteral(normalizeLikeEscapeCharacter(options.escapeCharacter))}`;
  }

  return comparisonSql;
}

function containsNoCase(leftSql, rightSql, options = {}) {
  return likeNoCase(leftSql, rightSql, {
    ...options,
    escape: true,
  });
}

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

function orderByNoCase(expressionSql, direction = "ASC") {
  return `${collateNoCase(expressionSql)} ${normalizeSortDirection(direction)}`;
}

function bindSqliteBoolean(value) {
  const normalized = normalizeLogicalBoolean(value);
  return normalized === null ? null : normalized ? 1 : 0;
}

function bindSqliteBooleanFields(values = {}, fieldNames = []) {
  const nextValues = { ...values };

  for (const fieldName of normalizeFieldNameArray(fieldNames, "boolean bind field")) {
    if (Object.hasOwn(nextValues, fieldName)) {
      nextValues[fieldName] = bindSqliteBoolean(nextValues[fieldName]);
    }
  }

  return nextValues;
}

function readSqliteBoolean(value) {
  return normalizeLogicalBoolean(value);
}

function readSqliteBooleanField(row, fieldName, options = {}) {
  const key = normalizeObjectFieldName(fieldName, "boolean read field");
  const source = row && typeof row === "object" ? row : {};

  if (!Object.hasOwn(source, key)) {
    return Object.hasOwn(options, "fallback") ? options.fallback : null;
  }

  return readSqliteBoolean(source[key]);
}

function readSqliteBooleanFields(row = {}, fieldNames = [], options = {}) {
  const nextRow = { ...(row || {}) };
  const fallbacks = options.fallbacks && typeof options.fallbacks === "object" ? options.fallbacks : {};

  for (const fieldName of normalizeFieldNameArray(fieldNames, "boolean read field")) {
    const fieldOptions = Object.hasOwn(fallbacks, fieldName)
      ? { fallback: fallbacks[fieldName] }
      : {};
    nextRow[fieldName] = readSqliteBooleanField(row, fieldName, fieldOptions);
  }

  return nextRow;
}

function secondsBetween(laterExpressionSql, earlierExpressionSql) {
  const later = normalizeSqlFragment(laterExpressionSql, "later timestamp expression");
  const earlier = normalizeSqlFragment(earlierExpressionSql, "earlier timestamp expression");
  return `CAST((julianday(${later}) - julianday(${earlier})) * 86400 AS INTEGER)`;
}

function nonNegativeSecondsBetween(laterExpressionSql, earlierExpressionSql) {
  return `MAX(0, ${secondsBetween(laterExpressionSql, earlierExpressionSql)})`;
}

function elapsedSecondsSince(timestampExpressionSql, referenceExpressionSql = ":now") {
  return nonNegativeSecondsBetween(referenceExpressionSql, timestampExpressionSql);
}

function match(tableName, queryExpressionSql) {
  return `${normalizeSqlIdentifier(tableName, "FTS table name")} MATCH ${normalizeSqlFragment(queryExpressionSql, "FTS query expression")}`;
}

function rank(tableName) {
  return `bm25(${normalizeSqlIdentifier(tableName, "FTS table name")})`;
}

function createVirtualTable(tableName, columns) {
  const columnDefinitions = normalizeFtsColumnDefinitions(columns).join(",\n  ");
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${normalizeSqlIdentifier(tableName, "FTS table name")} USING fts5(\n  ${columnDefinitions}\n)`;
}

function dropVirtualTable(tableName) {
  return `DROP TABLE IF EXISTS ${normalizeSqlIdentifier(tableName, "FTS table name")}`;
}

function columns(returningColumns) {
  return `RETURNING ${normalizeIdentifierList(returningColumns, "returning column")}`;
}

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

function journalMode() {
  return "PRAGMA journal_mode;";
}

function busyTimeout() {
  return "PRAGMA busy_timeout;";
}

function compileOptions() {
  return "PRAGMA compile_options;";
}

function tableInfo(tableName) {
  return `PRAGMA table_info(${normalizeSqlIdentifier(tableName, "table name")});`;
}

function unsupportedJsonAccess() {
  throw new Error("Database JSON access seam is not implemented because runtime SQL does not currently require JSON operators.");
}

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
    return columnNames
      .map((columnName) => {
        if (!Object.hasOwn(valueExpressions, columnName)) {
          throw new Error(`Missing insert value expression for column ${columnName}.`);
        }

        return normalizeSqlFragment(valueExpressions[columnName], "insert value expression");
      })
      .join(", ");
  }

  throw new Error("insert value expressions must be an array or object keyed by insert column.");
}

function composeSqlLines(lines) {
  return lines
    .filter((line) => String(line || "").trim())
    .join("\n");
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

function normalizeFieldNameArray(fieldNames, label) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    throw new Error(`${label} list must contain at least one field name.`);
  }

  return fieldNames.map((fieldName) => normalizeObjectFieldName(fieldName, label));
}

function normalizeObjectFieldName(fieldName, label = "field name") {
  const text = String(fieldName || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`Invalid ${label}: ${text || "(empty)"}.`);
  }

  return text;
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

function normalizeLikeEscapeCharacter(value = "\\") {
  const text = String(value || "\\");

  if (text.length !== 1 || text === "\0") {
    throw new Error("LIKE escape character must be exactly one non-null character.");
  }

  return text;
}

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

function quoteSqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export {
  createSqliteDialectSeams,
  SQLITE_DIALECT_SEAM_CAPABILITIES,
};
