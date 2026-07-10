async function runRegressionBucketsFailFast(buckets, runBucket) {
  const results = [];

  for (const bucket of buckets) {
    try {
      results.push(...await runBucket(bucket));
    } catch (error) {
      results.push(...(error?.results || []));
      return Object.freeze({
        failure: error?.message || error,
        results: Object.freeze(results),
      });
    }
  }

  return Object.freeze({ failure: null, results: Object.freeze(results) });
}

export { runRegressionBucketsFailFast };
