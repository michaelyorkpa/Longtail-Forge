const resolvers = new Map();
const batchResolvers = new Map();

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
function registerResumeStateBatchReadResolver(moduleId, recordType, batchResolver) {
  const key = resolverKey(moduleId, recordType);

  if (typeof batchResolver !== "function") {
    throw new TypeError(`Resume state batch read resolver '${key}' must be a function.`);
  }

  batchResolvers.set(key, batchResolver);
  return key;
}

function readResumeStateReadResolver(moduleId, recordType) {
  return resolvers.get(resolverKey(moduleId, recordType)) || null;
}

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

function resolverKey(moduleId, recordType) {
  const normalizedModuleId = normalizeKeyPart(moduleId, "module ID");
  const normalizedRecordType = normalizeKeyPart(recordType, "record type");

  return `${normalizedModuleId}:${normalizedRecordType}`;
}

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
