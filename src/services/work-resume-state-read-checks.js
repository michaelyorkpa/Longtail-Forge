const resolvers = new Map();

function registerResumeStateReadResolver(moduleId, recordType, resolver) {
  const key = resolverKey(moduleId, recordType);

  if (typeof resolver !== "function") {
    throw new TypeError(`Resume state read resolver '${key}' must be a function.`);
  }

  resolvers.set(key, resolver);
  return key;
}

function readResumeStateReadResolver(moduleId, recordType) {
  return resolvers.get(resolverKey(moduleId, recordType)) || null;
}

function listResumeStateReadResolverIds() {
  return [...resolvers.keys()].sort();
}

function resetResumeStateReadResolvers() {
  resolvers.clear();
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
  readResumeStateReadResolver,
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
};
