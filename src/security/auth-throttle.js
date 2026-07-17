import { createHash } from "node:crypto";
import { config } from "../config.js";
import { internalEventBus } from "../core/events/event-bus.js";
import { authenticationThrottleRepository } from "../repositories/authentication-throttle.repo.js";

const AUTHENTICATION_THROTTLE_MESSAGE = "Too many attempts. Try again later.";
const DEFAULT_TRACKED_KEY_LIMIT = 10000;

function createAuthenticationThrottle(options = {}) {
  const settings = {
    enabled: options.enabled !== false,
    failureLimit: positiveInteger(options.failureLimit, 5),
    lockoutSeconds: positiveInteger(options.lockoutSeconds, 15 * 60),
    trackedKeyLimit: positiveInteger(options.trackedKeyLimit, DEFAULT_TRACKED_KEY_LIMIT),
    windowSeconds: positiveInteger(options.windowSeconds, 15 * 60),
  };
  const clock = typeof options.clock === "function" ? options.clock : Date.now;
  const store = options.store || authenticationThrottleRepository;

  async function check(context = {}) {
    if (!settings.enabled) {
      return allowedResult();
    }

    const now = normalizeNow(clock());
    const keys = contextKeys(context);
    const entries = await store.readEntries(keys, now);
    const blockedStates = entries.filter((entry) => Number(entry.locked_until) > now);

    return {
      blocked: blockedStates.length > 0,
      newlyLockedDimensions: [],
      retryAfterSeconds: blockedStates.length
        ? Math.max(...blockedStates.map((entry) => Math.ceil((Number(entry.locked_until) - now) / 1000)))
        : 0,
    };
  }

  async function recordFailure(context = {}) {
    if (!settings.enabled) {
      return allowedResult();
    }

    const now = normalizeNow(clock());
    const states = await store.recordFailures({
      failureLimit: settings.failureLimit,
      keys: contextKeys(context),
      lockoutMilliseconds: settings.lockoutSeconds * 1000,
      now,
      trackedKeyLimit: settings.trackedKeyLimit,
      windowMilliseconds: settings.windowSeconds * 1000,
    });
    const newlyLockedDimensions = states.filter((entry) => entry.newlyLocked).map((entry) => entry.dimension);
    const blockedStates = states.filter((entry) => entry.lockedUntil > now);

    return {
      blocked: blockedStates.length > 0,
      newlyLockedDimensions,
      retryAfterSeconds: blockedStates.length
        ? Math.max(...blockedStates.map((entry) => Math.ceil((entry.lockedUntil - now) / 1000)))
        : 0,
    };
  }

  async function reset(context = {}) {
    await store.removeEntries(contextKeys(context));
  }

  async function clear() {
    await store.clear();
  }

  return Object.freeze({
    check,
    clear,
    recordFailure,
    recordSensitiveAction: recordFailure,
    reset,
    settings: Object.freeze({ ...settings }),
  });
}

async function emitAuthenticationThrottleLockout(context = {}, result = {}) {
  if (!result.newlyLockedDimensions?.length) {
    return null;
  }

  return internalEventBus.emit("security.authentication_throttle.lockout", {
    source: "security",
    workspaceId: normalizeText(context.workspaceId),
    actorUserId: normalizeText(context.actorUserId),
    metadata: {
      attempted_username: normalizeUsername(context.username),
      client_ip: normalizeIpAddress(context.ipAddress),
      dimensions: [...result.newlyLockedDimensions],
      scope: normalizeScope(context.scope),
    },
  });
}

function contextKeys(context) {
  const scope = normalizeScope(context.scope);
  return [
    createKey(scope, "ip", normalizeIpAddress(context.ipAddress)),
    createKey(scope, "account", normalizeUsername(context.username)),
  ];
}

function createKey(scope, dimension, value) {
  return {
    dimension,
    keyHash: createHash("sha256").update(`v1\0install\0${scope}\0${dimension}\0${value}`).digest("hex"),
    scope,
  };
}

function allowedResult() {
  return {
    blocked: false,
    newlyLockedDimensions: [],
    retryAfterSeconds: 0,
  };
}

function normalizeIpAddress(value) {
  return normalizeText(value).replace(/^::ffff:/, "").toLowerCase().slice(0, 128) || "unknown";
}

function normalizeUsername(value) {
  return normalizeText(value).toLowerCase().slice(0, 320) || "unknown";
}

function normalizeScope(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64) || "authentication";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNow(value) {
  const now = Number(value);
  return Number.isFinite(now) && now >= 0 ? Math.floor(now) : Date.now();
}

const authenticationThrottle = createAuthenticationThrottle(config.security.authenticationThrottle);

export {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  createAuthenticationThrottle,
  emitAuthenticationThrottleLockout,
};
