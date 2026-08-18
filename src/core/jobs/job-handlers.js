import { config } from "../../config.js";
import { getPublicDemoCapability } from "../public-demo-capabilities.js";
import { assertPublicDemoCapabilityAllowed } from "../public-demo-enforcement.js";

/** @typedef {import("../../types/framework-contracts.js").UnknownJobHandler} UnknownJobHandler */
/** @typedef {import("../../types/framework-contracts.js").JobHandlerOptions} JobHandlerOptions */

/** @type {Map<string, UnknownJobHandler>} */
const handlersByType = new Map();
/** @type {Map<string, string | null>} */
const publicDemoCapabilitiesByType = new Map();

/** @param {unknown} jobType */
function normalizeJobType(jobType) {
  const text = String(jobType || "").trim();

  if (!text) {
    throw new Error("Job handler registration requires a job type.");
  }

  return text;
}

/**
 * @template {import("../../types/job-contracts.js").RegisteredJobType} JobType
 * @overload
 * @param {JobType} jobType
 * @param {import("../../types/framework-contracts.js").JobHandler<JobType>} handler
 * @param {JobHandlerOptions} [options]
 * @returns {() => void}
 */
/**
 * @overload
 * @param {string} jobType
 * @param {UnknownJobHandler} handler
 * @param {JobHandlerOptions} [options]
 * @returns {() => void}
 */
/**
 * @param {unknown} jobType
 * @param {UnknownJobHandler} handler
 * @param {JobHandlerOptions} [options]
 * @returns {() => void}
 */
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

/** @param {unknown} jobType */
function getJobHandler(jobType) {
  return handlersByType.get(normalizeJobType(jobType)) || null;
}

/** @param {unknown} jobType */
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
