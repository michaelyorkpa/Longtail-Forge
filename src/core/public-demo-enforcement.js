// @ts-check

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

function assertPublicDemoCapabilityAllowed(capabilityId, options = {}) {
  const result = evaluatePublicDemoCapability(capabilityId, options);
  if (!result.allowed) {
    throw new AppError(PUBLIC_DEMO_DENIAL_MESSAGE, 403, {
      code: PUBLIC_DEMO_DENIAL_CODE,
    });
  }
  return result;
}

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
    definition = getPublicDemoCapability(capabilityId);
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

function filterPublicDemoContributionActions(contribution, options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  if (!demoEnabled) {
    return contribution;
  }
  return filterContributionValue(contribution, options, "");
}

function filterContributionValue(value, options, fieldName) {
  if (Array.isArray(value)) {
    const filtered = fieldName === "actions"
      ? value.filter((item) => evaluatePublicDemoCapability(item?.publicDemoCapability, options).allowed)
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

function requirePublicDemoCapability(capabilityId, options = {}) {
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

function classifyRoute(request) {
  const path = String(request.originalUrl || request.path || "");
  if (path.startsWith("/api/v1/")) return "api-v1";
  if (path === "/api" || path.startsWith("/api/")) return "api-internal";
  return "public-resource";
}

function normalizeAccess(value) {
  return value === "read" ? "read" : "execute";
}

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
