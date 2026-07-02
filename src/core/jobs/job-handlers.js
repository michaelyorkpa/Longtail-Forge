const handlersByType = new Map();

function normalizeJobType(jobType) {
  const text = String(jobType || "").trim();

  if (!text) {
    throw new Error("Job handler registration requires a job type.");
  }

  return text;
}

function registerJobHandler(jobType, handler, options = {}) {
  const normalizedJobType = normalizeJobType(jobType);

  if (typeof handler !== "function") {
    throw new Error(`Job handler for "${normalizedJobType}" must be a function.`);
  }

  if (!options.replace && handlersByType.has(normalizedJobType)) {
    throw new Error(`Job handler for "${normalizedJobType}" is already registered.`);
  }

  handlersByType.set(normalizedJobType, handler);

  return () => {
    if (handlersByType.get(normalizedJobType) === handler) {
      handlersByType.delete(normalizedJobType);
    }
  };
}

function getJobHandler(jobType) {
  return handlersByType.get(normalizeJobType(jobType)) || null;
}

function listRegisteredJobTypes() {
  return [...handlersByType.keys()].sort();
}

function clearJobHandlersForTests() {
  handlersByType.clear();
}

export {
  clearJobHandlersForTests,
  getJobHandler,
  listRegisteredJobTypes,
  registerJobHandler,
};
