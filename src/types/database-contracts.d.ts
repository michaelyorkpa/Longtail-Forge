import type { Buffer as NodeBuffer } from "node:buffer";

/**
 * Server-only database contracts. Browser declarations must not import or
 * re-export this module because parameter values include Node-owned buffers.
 */

// ---------------------------------------------------------------------------
// Database adapter/dialect seam
// ---------------------------------------------------------------------------

export type DatabaseRow = Record<string, unknown>;

export interface DatabaseHealth extends DatabaseRow {
  provider: string;
}
export type DatabaseParameterInput = string | number | bigint | boolean | NodeBuffer | Date | null | undefined;
export type DatabaseParameterValue = string | number | bigint | NodeBuffer | null;
export type DatabaseNamedParameterInput = DatabaseParameterInput | DatabaseParameterInput[];
export type DatabaseParams = Record<string, DatabaseNamedParameterInput> | DatabaseParameterInput[];
export type DatabasePlaceholderStyle = "dollar" | "question";

export type NormalizedDatabaseParameters =
  | { kind: "none"; values: null }
  | { kind: "array"; values: DatabaseParameterValue[] }
  | { kind: "object"; values: Map<string, DatabaseParameterValue | DatabaseParameterValue[]> };

export interface NamedDatabaseParameterToken {
  end: number;
  name: string;
  start: number;
  type: "named";
}

export interface PositionalDatabaseParameterToken {
  end: number;
  position: number;
  start: number;
  type: "positional";
}

export type DatabaseParameterToken = NamedDatabaseParameterToken | PositionalDatabaseParameterToken;

export interface NamedScalarBinding {
  isArray: false;
  placeholder: string;
  value: DatabaseParameterValue;
  values: [DatabaseParameterValue];
}

export interface NamedArrayBinding {
  isArray: true;
  placeholders: string[];
  values: DatabaseParameterValue[];
}

export type NamedBindingEntry = NamedScalarBinding | NamedArrayBinding;

export type PreparedDatabaseBindings =
  | { hasBindings: false; params: undefined; sql: string; statementCount: number }
  | { hasBindings: true; params: DatabaseParameterValue[]; sql: string; statementCount: number };

export interface PrepareDatabaseBindingsOptions {
  placeholderStyle?: DatabasePlaceholderStyle;
}

export interface BulkValuesBindingOptions<RowType extends object = DatabaseRow> {
  paramPrefix?: string;
  valueForColumn?: (row: RowType, columnName: string, rowIndex: number, columnIndex: number) => DatabaseParameterInput;
}

export interface DatabaseDialectCapabilities {
  booleanStorage: boolean;
  caseInsensitiveComparison: boolean;
  conflictWrites: boolean;
  fullTextSearch: boolean;
  introspection: boolean;
  jsonAccess: boolean;
  physicalIdentity: boolean;
  returningRows: boolean;
  timestampIntervalMath: boolean;
}

export type DatabaseInsertTarget =
  | { tableName: string; table?: never }
  | { table: string; tableName?: never };

export type DatabaseInsertValues = readonly string[] | Readonly<Record<string, string>>;

export type DatabaseInsertOptions = DatabaseInsertTarget & {
  columns: readonly string[];
  returningColumns?: readonly string[];
  valueExpressions?: DatabaseInsertValues;
  values?: DatabaseInsertValues;
};

export type DatabaseInsertConflictNothingOptions = DatabaseInsertOptions & {
  conflictColumns: readonly string[];
};

export type DatabaseInsertConflictUpdateOptions = DatabaseInsertConflictNothingOptions & {
  updateColumns: readonly string[];
};

export type DatabaseInsertAnyConflictUpdateOptions = DatabaseInsertOptions & {
  updateColumns: readonly string[];
};

export interface DatabaseLikeOptions {
  escape?: boolean;
  escapeCharacter?: string;
}

export type DatabaseLikePatternMode =
  | "contains"
  | "exact"
  | "startsWith"
  | "startswith"
  | "starts_with"
  | "starts-with"
  | "endsWith"
  | "endswith"
  | "ends_with"
  | "ends-with";

export interface DatabaseLikePatternOptions {
  escapeCharacter?: string;
  match?: DatabaseLikePatternMode;
  mode?: DatabaseLikePatternMode;
}

export type DatabaseSortDirection = "ASC" | "DESC" | "asc" | "desc";
export type DatabaseBooleanInput = boolean | number | string | null | undefined;
export type DatabaseBooleanStorageValue = 0 | 1 | null;
export type DatabaseBooleanReadValue = boolean | null;
export type DatabaseBooleanBoundFields<RecordType, FieldName extends keyof RecordType> = {
  [Key in keyof RecordType]: Key extends FieldName ? DatabaseBooleanStorageValue : RecordType[Key];
};
export type DatabaseBooleanReadFields<RecordType, FieldName extends keyof RecordType> = {
  [Key in keyof RecordType]: Key extends FieldName ? DatabaseBooleanReadValue : RecordType[Key];
};

export interface DatabaseBooleanReadOptions {
  fallback?: DatabaseBooleanReadValue;
}

export interface DatabaseBooleanFieldsReadOptions<FieldName extends PropertyKey = string> {
  fallbacks?: Partial<Record<FieldName, DatabaseBooleanReadValue>>;
}

export type DatabaseFtsColumn = string | {
  indexed?: boolean;
  name: string;
  unindexed?: boolean;
};

export type DatabaseRowIdOptions = string | (
  { alias?: string } & (
    | { tableAlias?: string; table?: never }
    | { table?: string; tableAlias?: never }
  )
);

export interface DatabaseDialect {
  readonly provider: string;
  readonly contractVersion: string;
  readonly capabilities: Readonly<DatabaseDialectCapabilities>;
  readonly boolean: {
    bind(value: DatabaseBooleanInput): DatabaseBooleanStorageValue;
    bindFields<RecordType extends Record<string, unknown>, FieldName extends Extract<keyof RecordType, string>>(
      values: RecordType,
      fieldNames: readonly FieldName[],
    ): DatabaseBooleanBoundFields<RecordType, FieldName>;
    read(value: DatabaseBooleanInput): DatabaseBooleanReadValue;
    readField(row: DatabaseRow, fieldName: string, options?: DatabaseBooleanReadOptions): DatabaseBooleanReadValue;
    readFields<RecordType extends Record<string, unknown>, FieldName extends Extract<keyof RecordType, string>>(
      row: RecordType,
      fieldNames: readonly FieldName[],
      options?: DatabaseBooleanFieldsReadOptions<FieldName>,
    ): DatabaseBooleanReadFields<RecordType, FieldName>;
  };
  readonly comparison: {
    collateNoCase(expressionSql: string): string;
    containsNoCase(leftSql: string, rightSql: string, options?: DatabaseLikeOptions): string;
    equalsNoCase(leftSql: string, rightSql: string): string;
    escapeLikePattern(value: unknown, options?: Pick<DatabaseLikePatternOptions, "escapeCharacter">): string;
    likePattern(value: unknown, options?: DatabaseLikePatternOptions): string;
    likeNoCase(leftSql: string, rightSql: string, options?: DatabaseLikeOptions): string;
    orderByNoCase(expressionSql: string, direction?: DatabaseSortDirection): string;
  };
  readonly conflict: {
    buildInsertOnAnyConflictDoUpdate(options: DatabaseInsertAnyConflictUpdateOptions): string;
    buildInsertOnConflictDoNothing(options: DatabaseInsertConflictNothingOptions): string;
    buildInsertOnConflictDoUpdate(options: DatabaseInsertConflictUpdateOptions): string;
    buildInsertOrIgnore(options: DatabaseInsertOptions): string;
    excludedColumn(columnName: string): string;
    insertOrIgnoreInto(tableName: string): string;
    onAnyConflictDoUpdateSet(updateColumns: readonly string[]): string;
    onConflictDoNothing(conflictColumns: readonly string[]): string;
    onConflictDoUpdateSet(conflictColumns: readonly string[], updateColumns: readonly string[]): string;
  };
  readonly identity: {
    lastInsertRowId(): string;
    rowId(options?: DatabaseRowIdOptions): string;
  };
  readonly introspection: {
    busyTimeout(): string;
    compileOptions(): string;
    databaseList(): string;
    deferForeignKeys(): string;
    foreignKeyCheck(): string;
    foreignKeys(): string;
    integrityCheck(): string;
    journalMode(): string;
    scopedTableRows(tableName: string, scopeColumn: string): Readonly<{ count: string; delete: string }>;
    tableInfo(tableName: string): string;
    tableNames(): string;
  };
  readonly json: {
    readonly supported: false;
    value(): never;
  };
  readonly returning: {
    columns(columns: readonly string[]): string;
  };
  readonly search: {
    createVirtualTable(tableName: string, columns: readonly DatabaseFtsColumn[]): string;
    dropVirtualTable(tableName: string): string;
    match(tableName: string, queryExpressionSql: string): string;
    rank(tableName: string): string;
  };
  readonly time: {
    elapsedSecondsSince(timestampExpressionSql: string, referenceExpressionSql?: string): string;
    nonNegativeSecondsBetween(laterExpressionSql: string, earlierExpressionSql: string): string;
    secondsBetween(laterExpressionSql: string, earlierExpressionSql: string): string;
  };
}

export interface TransactionClient {
  readonly capabilities: Record<string, unknown>;
  readonly dialect: DatabaseDialect;
  query(sql: string, params?: DatabaseParams): Promise<DatabaseRow[]>;
  get(sql: string, params?: DatabaseParams): Promise<DatabaseRow | null>;
  run(sql: string, params?: DatabaseParams): Promise<unknown>;
}

export interface DatabaseAdapter extends TransactionClient {
  readonly provider: string;
  close(): Promise<void>;
  health(): Promise<DatabaseHealth>;
  initializeRuntime?(): Promise<DatabaseHealth>;
  getLastHealth?(): DatabaseHealth | null;
  formatHealth?(health?: DatabaseHealth | null): string;
  transaction<T>(work: (transaction: TransactionClient) => Promise<T> | T): Promise<T>;
}

// Compatibility names retained for checked consumers converted before the
// adapter and transaction-client distinction was made explicit.
export type DatabaseTransaction = TransactionClient;
export type DatabaseSeam = DatabaseAdapter;
