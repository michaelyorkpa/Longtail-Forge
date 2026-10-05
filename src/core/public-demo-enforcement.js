import { config } from "../config.js";
import { AppError } from "../utils/app-error.js";
import { internalEventBus } from "./events/event-bus.js";
import { getRequestContext } from "./request-context.js";
import {
  PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS,
  getPublicDemoCapability,
} from "./public-demo-capabilities.js";

const PUBLIC_DEMO_DENIAL_CODE = "public_demo_capability_disabled";
const PUBLIC_DEMO_DENIAL_MESSAGE = "This capability is unavailable in the public demo.";

/** @typedef {{ demoEnabled?: boolean, access?: unknown }} PublicDemoCapabilityOptions */

/** @param {string} capabilityId @param {PublicDemoCapabilityOptions} [options] */
function assertPublicDemoCapabilityAllowed(capabilityId, options = {}) {
  const result = evaluatePublicDemoCapability(capabilityId, options);
  if (!result.allowed) {
    throw new AppError(PUBLIC_DEMO_DENIAL_MESSAGE, 403, {
      code: PUBLIC_DEMO_DENIAL_CODE,
    });
  }
  return result;
}

/** @param {unknown} capabilityId @param {PublicDemoCapabilityOptions} [options] */
function evaluatePublicDemoCapability(capabilityId, options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  const access = normalizeAccess(options.access);
  if (!demoEnabled) {
    return Object.freeze({
      allowed: true,
      capabilityId: normalizeCapabilityId(capabilityId),
      classification: "standard",
    });
  }

  let definition;
  try {
    definition = getPublicDemoCapability(normalizeCapabilityId(capabilityId));
  } catch {
    return Object.freeze({
      allowed: false,
      capabilityId: normalizeCapabilityId(capabilityId),
      classification: "undeclared",
    });
  }

  const allowed = definition.classification === PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.PERMITTED
    || definition.classification === PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.HOURLY_RESETTABLE
    || (definition.classification === PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.READ_ONLY && access === "read");

  return Object.freeze({
    allowed,
    capabilityId: definition.id,
    classification: definition.classification,
  });
}

/** @template T @param {T} contribution @param {PublicDemoCapabilityOptions} [options] @returns {T} */
function filterPublicDemoContributionActions(contribution, options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  if (!demoEnabled) {
    return contribution;
  }
  return /** @type {T} */ (filterContributionValue(contribution, options, ""));
}

/** @param {unknown} value @param {PublicDemoCapabilityOptions} options @param {string} fieldName @returns {unknown} */
function filterContributionValue(value, options, fieldName) {
  if (Array.isArray(value)) {
    const filtered = fieldName === "actions"
      ? value.filter((item) => evaluatePublicDemoCapability(readPublicDemoCapability(item), options).allowed)
      : value;
    return filtered.map((item) => filterContributionValue(item, options, ""));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    filterContributionValue(item, options, key),
  ]));
}

/** @param {unknown} value @returns {unknown} */
function readPublicDemoCapability(value) {
  return value && typeof value === "object" && "publicDemoCapability" in value
    ? value.publicDemoCapability
    : undefined;
}

/** @param {string} capabilityId @param {PublicDemoCapabilityOptions} [options] */
function requirePublicDemoCapability(capabilityId, options = {}) {
  /** @param {import("express").Request} request @param {unknown} _response @param {(error?: unknown) => void} next */
  return function publicDemoCapabilityGate(request, _response, next) {
    try {
      assertPublicDemoCapabilityAllowed(capabilityId, options);
      next();
    } catch (error) {
      const context = getRequestContext(request);
      void internalEventBus.emit("security.public_demo.capability_denied", {
        source: "public-demo-enforcement",
        session: request.session,
        metadata: {
          capability_id: normalizeCapabilityId(capabilityId),
          operation: String(request.method || "").trim().toLowerCase(),
          request_id: context.requestId,
          route_class: classifyRoute(request),
        },
      });
      next(error);
    }
  };
}

/** @param {import("express").Request} request */
function classifyRoute(request) {
  const path = String(request.originalUrl || request.path || "");
  if (path.startsWith("/api/v1/")) return "api-v1";
  if (path === "/api" || path.startsWith("/api/")) return "api-internal";
  return "public-resource";
}

/**
 * @param {unknown} value
 */
function normalizeAccess(value) {
  return value === "read" ? "read" : "execute";
}

/**
 * @param {unknown} value
 */
function normalizeCapabilityId(value) {
  return String(value || "").trim();
}

export {
  PUBLIC_DEMO_DENIAL_CODE,
  PUBLIC_DEMO_DENIAL_MESSAGE,
  assertPublicDemoCapabilityAllowed,
  evaluatePublicDemoCapability,
  filterPublicDemoContributionActions,
  requirePublicDemoCapability,
};
