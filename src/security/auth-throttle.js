import { config } from "../config.js";
import { internalEventBus } from "../core/events/event-bus.js";

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
  const entries = new Map();

  function check(context = {}) {
    if (!settings.enabled) {
      return allowedResult();
    }

    const now = clock();
    const states = contextKeys(context).map(({ dimension, key }) => ({
      dimension,
      entry: readActiveEntry(key, now),
    }));
    const blockedStates = states.filter(({ entry }) => entry?.lockedUntil > now);

    return {
      blocked: blockedStates.length > 0,
      newlyLockedDimensions: [],
      retryAfterSeconds: blockedStates.length
        ? Math.max(...blockedStates.map(({ entry }) => Math.ceil((entry.lockedUntil - now) / 1000)))
        : 0,
    };
  }

  function recordFailure(context = {}) {
    if (!settings.enabled) {
      return allowedResult();
    }

    const now = clock();
    const newlyLockedDimensions = [];
    const states = contextKeys(context).map(({ dimension, key }) => {
      const entry = readActiveEntry(key, now) || {
        failureTimes: [],
        lockedUntil: 0,
        touchedAt: now,
      };
      entry.failureTimes.push(now);
      entry.touchedAt = now;

      if (entry.lockedUntil <= now && entry.failureTimes.length >= settings.failureLimit) {
        entry.lockedUntil = now + settings.lockoutSeconds * 1000;
        newlyLockedDimensions.push(dimension);
      }

      setEntry(key, entry);
      return entry;
    });
    const blockedStates = states.filter((entry) => entry.lockedUntil > now);

    return {
      blocked: blockedStates.length > 0,
      newlyLockedDimensions,
      retryAfterSeconds: blockedStates.length
        ? Math.max(...blockedStates.map((entry) => Math.ceil((entry.lockedUntil - now) / 1000)))
        : 0,
    };
  }

  function reset(context = {}) {
    for (const { key } of contextKeys(context)) {
      entries.delete(key);
    }
  }

  function clear() {
    entries.clear();
  }

  function readActiveEntry(key, now) {
    const entry = entries.get(key);

    if (!entry) {
      return null;
    }

    entry.failureTimes = entry.failureTimes.filter(
      (failureTime) => now - failureTime < settings.windowSeconds * 1000,
    );

    if (entry.lockedUntil <= now && entry.failureTimes.length === 0) {
      entries.delete(key);
      return null;
    }

    entry.touchedAt = now;
    setEntry(key, entry);
    return entry;
  }

  function setEntry(key, entry) {
    entries.delete(key);

    while (entries.size >= settings.trackedKeyLimit) {
      entries.delete(entries.keys().next().value);
    }

    entries.set(key, entry);
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
    { dimension: "ip", key: `${scope}:ip:${normalizeIpAddress(context.ipAddress)}` },
    { dimension: "account", key: `${scope}:account:${normalizeUsername(context.username)}` },
  ];
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

const authenticationThrottle = createAuthenticationThrottle(config.security.authenticationThrottle);

export {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  createAuthenticationThrottle,
  emitAuthenticationThrottleLockout,
};
