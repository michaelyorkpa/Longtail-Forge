// @ts-check
import { AsyncLocalStorage } from "node:async_hooks";
import {
  closeSqlite,
  formatSqliteHealth,
  getLastSqliteHealth,
  getSql,
  initializeSqliteRuntime,
  querySql,
  readSqliteHealth,
  runSql,
} from "../sqlite.js";
import {
  prepareDatabaseBindings,
  QUESTION_PLACEHOLDERS,
} from "../parameter-bindings.js";
import { createSqliteDialectSeams } from "./sqlite-dialect-seams.js";

/** @typedef {import("../../types/database-contracts.js").DatabaseAdapter} DatabaseAdapter */
/** @typedef {import("../../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../../types/database-contracts.js").TransactionClient} TransactionClient */

const SQLITE_CAPABILITIES = Object.freeze({
  provider: "sqlite",
  adapter: "better-sqlite3",
  stringSql: true,
  parameterizedQueries: true,
  parameterStyle: "named",
  bindingLayer: "named-to-positional",
  driverParameterStyle: "positional",
  transactions: true,
  transactionApi: "callback",
  migrationLocking: true,
  migrationLockStrategy: "lock-file",
  health: true,
});

/** @returns {DatabaseAdapter} */
function createSqliteAdapter() {
  const transactionContext = new AsyncLocalStorage();
  const dialect = createSqliteDialectSeams();
  /** @type {Promise<unknown>} */
  let transactionTail = Promise.resolve();

  function assertNotInsideTransactionContext(operationName) {
    if (transactionContext.getStore()?.active) {
      throw new Error(`Use the transaction client passed to db.transaction() for ${operationName} inside a transaction.`);
    }
  }

  /**
   * @template T
   * @param {() => Promise<T> | T} operation
   * @returns {Promise<T>}
   */
  function waitForOpenTransaction(operation) {
    return transactionTail.catch(() => {}).then(operation);
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   * @returns {Promise<DatabaseRow[]>} result rows
   */
  async function executeQuery(sql, params = []) {
    const statement = prepareSqliteStatement(sql, params);
    return querySql(statement.sql, statement.params, statement);
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   * @returns {Promise<DatabaseRow | null>} first result row, if any
   */
  async function executeGet(sql, params = []) {
    const statement = prepareSqliteStatement(sql, params);
    return getSql(statement.sql, statement.params, statement);
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   * @returns {Promise<unknown>} driver run result
   */
  async function executeRun(sql, params = []) {
    const statement = prepareSqliteStatement(sql, params);
    return runSql(statement.sql, statement.params, statement);
  }

  function prepareSqliteStatement(sql, params) {
    return prepareDatabaseBindings(sql, params, {
      placeholderStyle: QUESTION_PLACEHOLDERS,
    });
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   */
  async function query(sql, params = []) {
    assertNotInsideTransactionContext("queries");
    return waitForOpenTransaction(() => executeQuery(sql, params));
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   */
  async function get(sql, params = []) {
    assertNotInsideTransactionContext("reads");
    return waitForOpenTransaction(() => executeGet(sql, params));
  }

  /**
   * @param {string} sql
   * @param {Record<string, unknown> | unknown[]} [params] named bindings or positional values
   */
  async function run(sql, params = []) {
    assertNotInsideTransactionContext("writes");
    return waitForOpenTransaction(() => executeRun(sql, params));
  }

  /**
   * @template T
   * @param {(transaction: TransactionClient) => Promise<T> | T} callback
   * @returns {Promise<T>}
   */
  async function transaction(callback) {
    if (typeof callback !== "function") {
      throw new Error("Database transaction requires a callback.");
    }

    if (transactionContext.getStore()?.active) {
      throw new Error("Nested database transactions are not supported.");
    }

    const runAfterOpenTransaction = transactionTail.catch(() => {});
    const transactionResult = runAfterOpenTransaction.then(() => transactionContext.run({ active: true }, async () => {
      const transactionClient = Object.freeze({
        capabilities: SQLITE_CAPABILITIES,
        dialect,
        get: executeGet,
        query: executeQuery,
        run: executeRun,
        transaction() {
          throw new Error("Nested database transactions are not supported.");
        },
      });

      await executeRun("BEGIN TRANSACTION;");

      try {
        const result = await callback(transactionClient);
        await executeRun("COMMIT;");
        return result;
      } catch (error) {
        try {
          await executeRun("ROLLBACK;");
        } catch (rollbackError) {
          if (error && typeof error === "object") {
            Object.assign(error, { rollbackError });
          }
        }

        throw error;
      }
    }));
    transactionTail = transactionResult.catch(() => {});
    return transactionResult;
  }

  return Object.freeze({
    provider: "sqlite",
    capabilities: SQLITE_CAPABILITIES,
    close: closeSqlite,
    dialect,
    formatHealth: formatSqliteHealth,
    get,
    getLastHealth: getLastSqliteHealth,
    health: readSqliteHealth,
    initializeRuntime: initializeSqliteRuntime,
    query,
    run,
    transaction,
  });
}

export { createSqliteAdapter, SQLITE_CAPABILITIES };
