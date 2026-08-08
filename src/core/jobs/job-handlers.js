import { config } from "../../config.js";
import { getPublicDemoCapability } from "../public-demo-capabilities.js";
import { assertPublicDemoCapabilityAllowed } from "../public-demo-enforcement.js";

const handlersByType = new Map();
const publicDemoCapabilitiesByType = new Map();

function normalizeJobType(jobType) {
  const text = String(jobType || "").trim();

  if (!text) {
    throw new Error("Job handler registration requires a job type.");
  }

  return text;
}

function registerJobHandler(jobType, handler, options = {}) {
  const normalizedJobType = normalizeJobType(jobType);
  const publicDemoCapability = String(options.publicDemoCapability || "").trim();
  if (publicDemoCapability) {
    getPublicDemoCapability(publicDemoCapability);
  } else if (config.demo.enabled) {
    throw new Error(`Job handler "${normalizedJobType}" must declare a public-demo capability.`);
  }

  if (typeof handler !== "function") {
    throw new Error(`Job handler for "${normalizedJobType}" must be a function.`);
  }

  if (!options.replace && handlersByType.has(normalizedJobType)) {
    throw new Error(`Job handler for "${normalizedJobType}" is already registered.`);
  }

  handlersByType.set(normalizedJobType, handler);
  publicDemoCapabilitiesByType.set(normalizedJobType, publicDemoCapability || null);

  return () => {
    if (handlersByType.get(normalizedJobType) === handler) {
      handlersByType.delete(normalizedJobType);
      publicDemoCapabilitiesByType.delete(normalizedJobType);
    }
  };
}

function getJobHandler(jobType) {
  return handlersByType.get(normalizeJobType(jobType)) || null;
}

function assertRegisteredJobPublicDemoCapabilityAllowed(jobType) {
  const normalizedJobType = normalizeJobType(jobType);
  const capabilityId = publicDemoCapabilitiesByType.get(normalizedJobType) || `jobs.${normalizedJobType}`;
  return assertPublicDemoCapabilityAllowed(capabilityId);
}

function listRegisteredJobTypes() {
  return [...handlersByType.keys()].sort();
}

function clearJobHandlersForTests() {
  handlersByType.clear();
  publicDemoCapabilitiesByType.clear();
}

export {
  assertRegisteredJobPublicDemoCapabilityAllowed,
  clearJobHandlersForTests,
  getJobHandler,
  listRegisteredJobTypes,
  registerJobHandler,
};
