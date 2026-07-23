import { createHash } from "node:crypto";
import { config } from "../config.js";
import { internalEventBus } from "../core/events/event-bus.js";
import { authenticationThrottleRepository } from "../repositories/authentication-throttle.repo.js";

const AUTHENTICATION_THROTTLE_MESSAGE = "Too many attempts. Try again later.";
const DEFAULT_TRACKED_KEY_LIMIT = 10000;
const DEFAULT_VERIFICATION_CONCURRENCY_LIMIT = 4;
const DEFAULT_VERIFICATION_CONCURRENCY_PER_IP_LIMIT = 2;
const NOOP = () => {};

function createAuthenticationThrottle(options = {}) {
  const settings = {
    enabled: options.enabled !== false,
    failureLimit: positiveInteger(options.failureLimit, 5),
    lockoutSeconds: positiveInteger(options.lockoutSeconds, 15 * 60),
    trackedKeyLimit: positiveInteger(options.trackedKeyLimit, DEFAULT_TRACKED_KEY_LIMIT),
    verificationConcurrencyLimit: positiveInteger(
      options.verificationConcurrencyLimit,
      DEFAULT_VERIFICATION_CONCURRENCY_LIMIT,
    ),
    verificationConcurrencyPerIpLimit: positiveInteger(
      options.verificationConcurrencyPerIpLimit,
      DEFAULT_VERIFICATION_CONCURRENCY_PER_IP_LIMIT,
    ),
    windowSeconds: positiveInteger(options.windowSeconds, 15 * 60),
  };
  settings.verificationConcurrencyPerIpLimit = Math.min(
    settings.verificationConcurrencyPerIpLimit,
    settings.verificationConcurrencyLimit,
  );
  const clock = typeof options.clock === "function" ? options.clock : Date.now;
  const store = options.store || authenticationThrottleRepository;
  const verificationAdmissions = {
    active: 0,
    byClient: new Map(),
  };

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

  async function admitVerification(context = {}) {
    const release = tryAcquireVerification(context);
    if (!release) {
      return {
        blocked: true,
        admissionLimited: true,
        newlyLockedDimensions: [],
        release: NOOP,
        retryAfterSeconds: 1,
      };
    }

    try {
      const throttleStatus = await check(context);
      if (throttleStatus.blocked) {
        release();
        return {
          ...throttleStatus,
          admissionLimited: false,
          release: NOOP,
        };
      }
    } catch (error) {
      release();
      throw error;
    }

    return {
      blocked: false,
      admissionLimited: false,
      newlyLockedDimensions: [],
      release,
      retryAfterSeconds: 0,
    };
  }

  async function runWithVerificationAdmission(context = {}, operation) {
    if (typeof operation !== "function") {
      throw new TypeError("Verification admission requires an operation.");
    }

    const admission = await admitVerification(context);
    if (admission.blocked) {
      return admission;
    }

    try {
      return {
        ...admission,
        value: await operation(),
      };
    } finally {
      admission.release();
    }
  }

  function tryAcquireVerification(context) {
    const clientKey = createKey(
      normalizeScope(context.scope),
      "ip",
      normalizeIpAddress(context.ipAddress),
    ).keyHash;
    const clientActive = verificationAdmissions.byClient.get(clientKey) || 0;

    if (
      verificationAdmissions.active >= settings.verificationConcurrencyLimit ||
      clientActive >= settings.verificationConcurrencyPerIpLimit
    ) {
      return null;
    }

    verificationAdmissions.active += 1;
    verificationAdmissions.byClient.set(clientKey, clientActive + 1);
    let released = false;

    return () => {
      if (released) {
        return;
      }
      released = true;
      verificationAdmissions.active = Math.max(0, verificationAdmissions.active - 1);
      const remainingForClient = (verificationAdmissions.byClient.get(clientKey) || 1) - 1;
      if (remainingForClient > 0) {
        verificationAdmissions.byClient.set(clientKey, remainingForClient);
      } else {
        verificationAdmissions.byClient.delete(clientKey);
      }
    };
  }

  async function reset(context = {}) {
    await store.removeEntries(contextKeys(context));
  }

  async function clear() {
    await store.clear();
  }

  return Object.freeze({
    admitVerification,
    check,
    clear,
    recordFailure,
    recordSensitiveAction: recordFailure,
    reset,
    runWithVerificationAdmission,
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
