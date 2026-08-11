// @ts-check
/** @typedef {import("../types/framework-contracts.js").ResumeStateBatchReadResolver} ResumeStateBatchReadResolver */
/** @typedef {import("../types/framework-contracts.js").ResumeStateReadResolver} ResumeStateReadResolver */

/** @type {Map<string, ResumeStateReadResolver>} */
const resolvers = new Map();
/** @type {Map<string, ResumeStateBatchReadResolver>} */
const batchResolvers = new Map();

/**
 * @param {string} moduleId
 * @param {string} recordType
 * @param {ResumeStateReadResolver} resolver
 */
function registerResumeStateReadResolver(moduleId, recordType, resolver) {
  const key = resolverKey(moduleId, recordType);

  if (typeof resolver !== "function") {
    throw new TypeError(`Resume state read resolver '${key}' must be a function.`);
  }

  resolvers.set(key, resolver);
  // The most recent registration wins for the whole key: replacing the
  // per-row resolver (tests, module overrides) drops any earlier batch
  // shortcut so both paths always answer with the same policy.
  batchResolvers.delete(key);
  return key;
}

// A batch resolver answers the same read check for many scanned rows at once
// ({ recordIds, rows, session, workspaceId } → Map<recordId, readCheck>), so
// list scans issue one IN-query per record type instead of one read per row.
// Modules without a batch resolver fall back to their per-row resolver.
/**
 * @param {string} moduleId
 * @param {string} recordType
 * @param {ResumeStateBatchReadResolver} batchResolver
 */
function registerResumeStateBatchReadResolver(moduleId, recordType, batchResolver) {
  const key = resolverKey(moduleId, recordType);

  if (typeof batchResolver !== "function") {
    throw new TypeError(`Resume state batch read resolver '${key}' must be a function.`);
  }

  batchResolvers.set(key, batchResolver);
  return key;
}

/** @param {string} moduleId @param {string} recordType */
function readResumeStateReadResolver(moduleId, recordType) {
  return resolvers.get(resolverKey(moduleId, recordType)) || null;
}

/** @param {string} moduleId @param {string} recordType */
function readResumeStateBatchReadResolver(moduleId, recordType) {
  return batchResolvers.get(resolverKey(moduleId, recordType)) || null;
}

function listResumeStateReadResolverIds() {
  return [...resolvers.keys()].sort();
}

function resetResumeStateReadResolvers() {
  resolvers.clear();
  batchResolvers.clear();
}

/** @param {string} moduleId @param {string} recordType */
function resolverKey(moduleId, recordType) {
  const normalizedModuleId = normalizeKeyPart(moduleId, "module ID");
  const normalizedRecordType = normalizeKeyPart(recordType, "record type");

  return `${normalizedModuleId}:${normalizedRecordType}`;
}

/** @param {unknown} value @param {string} label */
function normalizeKeyPart(value, label) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new TypeError(`Resume state read resolver ${label} is required.`);
  }

  return normalizedValue;
}

export {
  listResumeStateReadResolverIds,
  readResumeStateBatchReadResolver,
  readResumeStateReadResolver,
  registerResumeStateBatchReadResolver,
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
};
