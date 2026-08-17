import { createHash } from "node:crypto";
import { config } from "../config.js";
import { internalEventBus } from "../core/events/event-bus.js";
import { authenticationThrottleRepository } from "../repositories/authentication-throttle.repo.js";

/** @typedef {"ip" | "account"} AuthenticationThrottleDimension */
/** @typedef {{ actorUserId?: unknown, dimensions?: unknown, ipAddress?: unknown, requestId?: unknown, scope?: unknown, username?: unknown, workspaceId?: unknown }} AuthenticationThrottleContext */
/** @typedef {{ dimension: AuthenticationThrottleDimension, keyHash: string, scope: string }} AuthenticationThrottleKey */
/** @typedef {{ locked_until: unknown }} AuthenticationThrottleEntry */
/** @typedef {{ dimension: string, lockedUntil: number, newlyLocked: boolean }} AuthenticationThrottleFailureState */
/** @typedef {{ failureLimit: number, keys: AuthenticationThrottleKey[], lockoutMilliseconds: number, now: number, trackedKeyLimit: number, windowMilliseconds: number }} AuthenticationThrottleFailureOptions */
/** @typedef {{ readEntries: (keys: AuthenticationThrottleKey[], now: number) => Promise<AuthenticationThrottleEntry[]>, recordFailures: (options: AuthenticationThrottleFailureOptions) => Promise<AuthenticationThrottleFailureState[]>, removeEntries: (keys: AuthenticationThrottleKey[]) => Promise<unknown>, clear: () => Promise<unknown> }} AuthenticationThrottleStore */
/** @typedef {{ enabled?: boolean, failureLimit?: unknown, lockoutSeconds?: unknown, trackedKeyLimit?: unknown, verificationConcurrencyLimit?: unknown, verificationConcurrencyPerIpLimit?: unknown, windowSeconds?: unknown, clock?: () => unknown, store?: AuthenticationThrottleStore }} AuthenticationThrottleOptions */
/** @typedef {{ blocked: boolean, newlyLockedDimensions: string[], retryAfterSeconds: number }} AuthenticationThrottleResult */
/** @typedef {AuthenticationThrottleResult & { blocked: true, admissionLimited: boolean, release: () => void }} BlockedVerificationAdmission */
/** @typedef {AuthenticationThrottleResult & { blocked: false, admissionLimited: false, release: () => void }} AllowedVerificationAdmission */
/** @typedef {BlockedVerificationAdmission | AllowedVerificationAdmission} VerificationAdmission */
/** @template T @typedef {BlockedVerificationAdmission | (AllowedVerificationAdmission & { value: T })} VerificationOperationResult */

const AUTHENTICATION_THROTTLE_MESSAGE = "Too many attempts. Try again later.";
const DEFAULT_TRACKED_KEY_LIMIT = 10000;
const DEFAULT_VERIFICATION_CONCURRENCY_LIMIT = 4;
const DEFAULT_VERIFICATION_CONCURRENCY_PER_IP_LIMIT = 2;
const NOOP = () => {};

/** @param {AuthenticationThrottleOptions} [options] */
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
  /** @type {{ active: number, byClient: Map<string, number> }} */
  const verificationAdmissions = {
    active: 0,
    byClient: new Map(),
  };

  /** @param {AuthenticationThrottleContext} [context] @returns {Promise<AuthenticationThrottleResult>} */
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

  /** @param {AuthenticationThrottleContext} [context] @returns {Promise<AuthenticationThrottleResult>} */
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

  /** @param {AuthenticationThrottleContext} [context] @returns {Promise<VerificationAdmission>} */
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
          blocked: true,
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

  /** @template T @param {AuthenticationThrottleContext | undefined} context @param {() => T | Promise<T>} operation @returns {Promise<VerificationOperationResult<T>>} */
  async function runWithVerificationAdmission(context, operation) {
    if (typeof operation !== "function") {
      throw new TypeError("Verification admission requires an operation.");
    }

    const admission = await admitVerification(context || {});
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

  /** @param {AuthenticationThrottleContext} context @returns {(() => void) | null} */
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

  /** @param {AuthenticationThrottleContext} [context] */
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

/** @param {AuthenticationThrottleContext} [context] @param {Partial<AuthenticationThrottleResult>} [result] */
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
      request_id: normalizeText(context.requestId),
      scope: normalizeScope(context.scope),
    },
  });
}

/** @param {AuthenticationThrottleContext} context @returns {AuthenticationThrottleKey[]} */
function contextKeys(context) {
  const scope = normalizeScope(context.scope);
  const dimensions = normalizeDimensions(context.dimensions);
  return dimensions.map((dimension) => dimension === "ip"
    ? createKey(scope, "ip", normalizeIpAddress(context.ipAddress))
    : createKey(scope, "account", normalizeUsername(context.username)));
}

/** @param {unknown} value @returns {AuthenticationThrottleDimension[]} */
function normalizeDimensions(value) {
  if (!Array.isArray(value)) {
    return ["ip", "account"];
  }

  const dimensions = Array.from(new Set(value.filter((dimension) => dimension === "ip" || dimension === "account")));
  return dimensions.length ? dimensions : ["ip", "account"];
}

/** @param {string} scope @param {AuthenticationThrottleDimension} dimension @param {string} value @returns {AuthenticationThrottleKey} */
function createKey(scope, dimension, value) {
  return {
    dimension,
    keyHash: createHash("sha256").update(`v1\0install\0${scope}\0${dimension}\0${value}`).digest("hex"),
    scope,
  };
}

/** @returns {AuthenticationThrottleResult} */
function allowedResult() {
  return {
    blocked: false,
    newlyLockedDimensions: [],
    retryAfterSeconds: 0,
  };
}

/** @param {unknown} value @returns {string} */
function normalizeIpAddress(value) {
  return normalizeText(value).replace(/^::ffff:/, "").toLowerCase().slice(0, 128) || "unknown";
}

/** @param {unknown} value @returns {string} */
function normalizeUsername(value) {
  return normalizeText(value).toLowerCase().slice(0, 320) || "unknown";
}

/** @param {unknown} value @returns {string} */
function normalizeScope(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64) || "authentication";
}

/** @param {unknown} value @returns {string} */
function normalizeText(value) {
  return String(value || "").trim();
}

/** @param {unknown} value @param {number} fallback @returns {number} */
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** @param {unknown} value @returns {number} */
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
