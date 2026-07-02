import { AsyncLocalStorage } from "node:async_hooks";
import {
  closeSqlite,
  formatSqliteHealth,
  getLastSqliteHealth,
  initializeSqliteRuntime,
  querySql,
  readSqliteHealth,
  runSql,
} from "../sqlite.js";

const SQLITE_CAPABILITIES = Object.freeze({
  provider: "sqlite",
  adapter: "sqlite-process",
  stringSql: true,
  parameterizedQueries: true,
  parameterStyle: "named",
  transactions: true,
  transactionApi: "callback",
  migrationLocking: true,
  migrationLockStrategy: "lock-file",
  health: true,
});

function createSqliteAdapter() {
  const transactionContext = new AsyncLocalStorage();
  let transactionTail = Promise.resolve();

  function assertNotInsideTransactionContext(operationName) {
    if (transactionContext.getStore()?.active) {
      throw new Error(`Use the transaction client passed to db.transaction() for ${operationName} inside a transaction.`);
    }
  }

  function waitForOpenTransaction(operation) {
    return transactionTail.catch(() => {}).then(operation);
  }

  async function executeQuery(sql, params = []) {
    return querySql(sql, params);
  }

  async function executeGet(sql, params = []) {
    const rows = await executeQuery(sql, params);
    return rows[0] || null;
  }

  async function executeRun(sql, params = []) {
    return runSql(sql, params);
  }

  async function query(sql, params = []) {
    assertNotInsideTransactionContext("queries");
    return waitForOpenTransaction(() => executeQuery(sql, params));
  }

  async function get(sql, params = []) {
    assertNotInsideTransactionContext("reads");
    return waitForOpenTransaction(() => executeGet(sql, params));
  }

  async function run(sql, params = []) {
    assertNotInsideTransactionContext("writes");
    return waitForOpenTransaction(() => executeRun(sql, params));
  }

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
          error.rollbackError = rollbackError;
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
