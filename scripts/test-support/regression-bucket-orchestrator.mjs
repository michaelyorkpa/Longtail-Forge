/**
 * @template TResult
 * @typedef {Error & { results?: readonly TResult[] }} BucketRunError
 */

/**
 * @template TBucket
 * @template TResult
 * @param {readonly TBucket[]} buckets
 * @param {(bucket: TBucket) => Promise<readonly TResult[]>} runBucket
 * @returns {Promise<{ failure: unknown, results: readonly TResult[] }>}
 */
async function runRegressionBucketsFailFast(buckets, runBucket) {
  /** @type {TResult[]} */
  const results = [];

  for (const bucket of buckets) {
    try {
      results.push(...await runBucket(bucket));
    } catch (error) {
      results.push(...(/** @type {BucketRunError<TResult>} */ (error)?.results || []));
      return Object.freeze({
        failure: /** @type {BucketRunError<TResult>} */ (error)?.message || error,
        results: Object.freeze(results),
      });
    }
  }

  return Object.freeze({ failure: null, results: Object.freeze(results) });
}

export { runRegressionBucketsFailFast };
