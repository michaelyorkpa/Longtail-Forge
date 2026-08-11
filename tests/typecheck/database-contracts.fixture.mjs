// @ts-check

/** @typedef {import("../../src/types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../../src/types/database-contracts.js").TransactionClient} TransactionClient */

const genericRow = /** @type {DatabaseRow} */ ({ title: "checked" });

// @ts-expect-error Generic database fields must be narrowed or projected before use.
genericRow.title.trim();

/**
 * @param {TransactionClient} transaction
 */
function rejectFullAdapterOperations(transaction) {
  // @ts-expect-error A callback-scoped transaction client cannot open another transaction.
  return transaction.transaction(() => undefined);
}

export { rejectFullAdapterOperations };
