/** @type {Map<string, import("../../types/framework-contracts.js").SearchIndexer>} */
const registeredIndexers = new Map();

/**
 * @param {string} indexerId
 * @param {import("../../types/framework-contracts.js").SearchIndexer} indexer
 */
function registerSearchIndexer(indexerId, indexer) {
  if (typeof indexerId !== "string" || !indexerId.trim()) {
    throw new Error("Search indexer ID must be a non-empty string.");
  }
  if (typeof indexer !== "function") {
    throw new Error(`Search indexer '${indexerId}' must be a function.`);
  }

  registeredIndexers.set(indexerId, indexer);

  return () => {
    if (registeredIndexers.get(indexerId) === indexer) {
      registeredIndexers.delete(indexerId);
    }
  };
}

/**
 * @param {string} indexerId
 */
function getSearchIndexer(indexerId) {
  return registeredIndexers.get(indexerId) || null;
}

/**
 * @param {string} indexerId
 */
function hasSearchIndexer(indexerId) {
  return registeredIndexers.has(indexerId);
}

function listSearchIndexerIds() {
  return [...registeredIndexers.keys()].sort();
}

function clearSearchIndexersForTests() {
  registeredIndexers.clear();
}

export {
  clearSearchIndexersForTests,
  getSearchIndexer,
  hasSearchIndexer,
  listSearchIndexerIds,
  registerSearchIndexer,
};