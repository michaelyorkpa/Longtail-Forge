const registeredIndexers = new Map();

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

function getSearchIndexer(indexerId) {
  return registeredIndexers.get(indexerId) || null;
}

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
