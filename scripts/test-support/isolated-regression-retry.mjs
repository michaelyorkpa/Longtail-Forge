import { runLimitedItems } from "./regression-runner-scheduler.mjs";

const ISOLATED_RETRY_LIMIT = 1;

/**
 * @typedef {{ attemptNumber: number, exitCode: number | null, retry: boolean, seconds: number }} AttemptSummary
 * @typedef {{ attemptNumber?: number, exitCode: number | null, retry?: boolean, seconds?: number }} IsolatedAttemptResult
 * @typedef {{ attemptNumber: number, retry: boolean }} IsolatedAttemptContext
 */

/**
 * @template TItem
 * @typedef {{ item: TItem, originalItemIndex: number }} PendingIsolatedItem
 */

/**
 * @template {IsolatedAttemptResult} TResult
 * @typedef {TResult & { attemptCount: number, attempts: readonly AttemptSummary[], flakyRecovered: boolean, itemIndex: number, retrySerial: boolean }} RetriedIsolatedResult
 */

/**
 * @template TItem
 * @template {IsolatedAttemptResult} TResult
 * @param {readonly TItem[]} items
 * @param {number} concurrency
 * @param {(item: TItem, originalItemIndex: number, attemptContext: IsolatedAttemptContext) => Promise<TResult>} runItem
 * @param {{ onRetry?: (item: TItem, originalItemIndex: number, context: IsolatedAttemptContext) => void }} [options]
 * @returns {Promise<RetriedIsolatedResult<TResult>[]>}
 */
async function runIsolatedItemsWithRetry(items, concurrency, runItem, { onRetry = () => {} } = {}) {
  let pending = items.map((item, originalItemIndex) => ({ item, originalItemIndex }));
  /** @type {Map<number, RetriedIsolatedResult<TResult>>} */
  const finalResults = new Map();

  while (pending.length > 0) {
    const initialResults = await runLimitedItems(
      pending,
      concurrency,
      async ({ item, originalItemIndex }) => ({
        ...await runItem(item, originalItemIndex, { attemptNumber: 1, retry: false }),
        originalItemIndex,
      }),
    );
    const failures = initialResults.filter((result) => result.exitCode !== 0);

    for (const result of initialResults.filter((entry) => entry.exitCode === 0)) {
      finalResults.set(result.originalItemIndex, singleAttemptResult(result));
    }

    if (failures.length > 0) {
      const retryResults = [];
      for (const failure of failures) {
        const pendingItem = /** @type {PendingIsolatedItem<TItem>} */ (pending.find((entry) => entry.originalItemIndex === failure.originalItemIndex));
        const attemptNumber = ISOLATED_RETRY_LIMIT + 1;
        onRetry(pendingItem.item, pendingItem.originalItemIndex, { attemptNumber, retry: true });
        const retry = await runItem(pendingItem.item, pendingItem.originalItemIndex, {
          attemptNumber,
          retry: true,
        });
        const combined = combineAttemptResults(failure, retry);
        finalResults.set(failure.originalItemIndex, combined);
        retryResults.push(combined);
      }

      if (retryResults.some((result) => result.exitCode !== 0)) {
        break;
      }
    }

    const completedIndexes = new Set(initialResults.map((result) => result.originalItemIndex));
    pending = pending.filter((entry) => !completedIndexes.has(entry.originalItemIndex));
  }

  return [...finalResults.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, result]) => result);
}

/**
 * @template {IsolatedAttemptResult} TResult
 * @param {TResult & { itemIndex?: number, originalItemIndex: number }} result
 * @returns {RetriedIsolatedResult<TResult>}
 */
function singleAttemptResult(result) {
  return {
    ...withoutSchedulerIndexes(result),
    attemptCount: 1,
    attempts: [attemptSummary(result)],
    flakyRecovered: false,
    itemIndex: result.originalItemIndex,
    retrySerial: false,
  };
}

/**
 * @template {IsolatedAttemptResult} TResult
 * @param {TResult & { itemIndex?: number, originalItemIndex: number }} initial
 * @param {TResult} retry
 * @returns {RetriedIsolatedResult<TResult>}
 */
function combineAttemptResults(initial, retry) {
  return {
    ...withoutSchedulerIndexes(retry),
    attemptCount: 2,
    attempts: [attemptSummary(initial), attemptSummary(retry)],
    flakyRecovered: retry.exitCode === 0,
    itemIndex: initial.originalItemIndex,
    retrySerial: true,
    seconds: Number(initial.seconds || 0) + Number(retry.seconds || 0),
  };
}

/**
 * @param {IsolatedAttemptResult} result
 * @returns {AttemptSummary}
 */
function attemptSummary(result) {
  return Object.freeze({
    attemptNumber: result.attemptNumber || 1,
    exitCode: result.exitCode,
    retry: Boolean(result.retry),
    seconds: Number(result.seconds || 0),
  });
}

/**
 * @template T
 * @param {T & { itemIndex?: number, originalItemIndex?: number }} result
 * @returns {T}
 */
function withoutSchedulerIndexes(result) {
  const normalized = { ...result };
  delete normalized.itemIndex;
  delete normalized.originalItemIndex;
  return normalized;
}

export {
  ISOLATED_RETRY_LIMIT,
  runIsolatedItemsWithRetry,
};
