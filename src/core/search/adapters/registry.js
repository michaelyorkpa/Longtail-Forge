import { createSqliteSearchAdapter, SQLITE_SEARCH_ADAPTER_ID } from "./sqlite-search-adapter.js";

const adapters = new Map();

registerSearchBackendAdapter(createSqliteSearchAdapter());

function registerSearchBackendAdapter(adapter) {
  validateAdapter(adapter);
  adapters.set(adapter.id, adapter);

  return () => {
    if (adapters.get(adapter.id) === adapter) {
      adapters.delete(adapter.id);
    }
  };
}

function getSearchBackendAdapter(adapterId = SQLITE_SEARCH_ADAPTER_ID) {
  return adapters.get(adapterId) || null;
}

function listSearchBackendAdapters() {
  return [...adapters.values()].map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    engine: adapter.engine,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("Search backend adapter must be an object.");
  }
  if (typeof adapter.id !== "string" || !adapter.id.trim()) {
    throw new Error("Search backend adapter id must be a non-empty string.");
  }
  if (typeof adapter.label !== "string" || !adapter.label.trim()) {
    throw new Error(`Search backend adapter '${adapter.id}' label must be a non-empty string.`);
  }
  if (typeof adapter.engine !== "string" || !adapter.engine.trim()) {
    throw new Error(`Search backend adapter '${adapter.id}' engine must be a non-empty string.`);
  }
  if (typeof adapter.getCapabilities !== "function") {
    throw new Error(`Search backend adapter '${adapter.id}' must expose getCapabilities().`);
  }
}

export {
  getSearchBackendAdapter,
  listSearchBackendAdapters,
  registerSearchBackendAdapter,
  SQLITE_SEARCH_ADAPTER_ID,
};
