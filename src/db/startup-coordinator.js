// @ts-check
import { performance } from "node:perf_hooks";

/** @typedef {import("../types/database-contracts.js").DatabaseStartupAction} DatabaseStartupAction */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupContext} DatabaseStartupContext */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupLifecycle} DatabaseStartupLifecycle */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupOptions} DatabaseStartupOptions */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupPhaseEvent} DatabaseStartupPhaseEvent */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupStatus} DatabaseStartupStatus */

/** @type {Readonly<Record<string, DatabaseStartupLifecycle>>} */
const STARTUP_LIFECYCLES = Object.freeze({
  BACKGROUND_JOB: "background-job",
  EVERY_BOOT: "every-boot-coordination",
  EXPLICIT_MAINTENANCE: "explicit-admin-cli-maintenance",
  FIRST_INSTALL: "first-install-bootstrap",
  READINESS_ASSERTION: "health-readiness-assertion",
  RECURRING_CHECK: "recurring-lightweight-check",
  VERSIONED_REPAIR: "one-time-migration-versioned-repair",
});

/** @type {ReadonlySet<DatabaseStartupLifecycle>} */
const VALID_LIFECYCLES = new Set(Object.values(STARTUP_LIFECYCLES));

/** @param {DatabaseStartupAction[]} actions @param {DatabaseStartupOptions} [options] */
async function runStartupActions(actions, options = {}) {
  validateStartupActions(actions);

  const context = options.context || {};
  const now = options.now || (() => performance.now());
  const report = options.report || (() => {});
  const results = [];

  for (const action of actions) {
    const startedAt = now();
    report(createEvent(action, "started", 0));

    try {
      const outcome = await action.run(context);
      const startupOutcome = isStartupOutcome(outcome) ? outcome : null;
      const status = startupOutcome?.status === "skipped" ? "skipped" : "completed";
      const result = createEvent(action, status, elapsedMilliseconds(startedAt, now()), startupOutcome?.reason);
      results.push(result);
      report(result);
    } catch (error) {
      report({
        ...createEvent(action, "failed", elapsedMilliseconds(startedAt, now())),
        errorType: error && typeof error === "object" && "name" in error ? String(error.name || "Error") : "Error",
      });
      throw error;
    }
  }

  return { context, results };
}

/** @param {unknown} value @returns {value is import("../types/database-contracts.js").DatabaseStartupOutcome} */
function isStartupOutcome(value) {
  return Boolean(value && typeof value === "object");
}

/** @param {DatabaseStartupAction[]} actions */
function validateStartupActions(actions) {
  if (!Array.isArray(actions)) {
    throw new TypeError("Startup actions must be an array.");
  }

  const actionIds = new Set();

  for (const action of actions) {
    if (!action?.id || typeof action.id !== "string") {
      throw new TypeError("Every startup action requires a stable string id.");
    }

    if (actionIds.has(action.id)) {
      throw new Error(`Duplicate startup action id: ${action.id}`);
    }

    if (!VALID_LIFECYCLES.has(action.lifecycle)) {
      throw new Error(`Startup action ${action.id} has an unknown lifecycle: ${action.lifecycle}`);
    }

    if (!action.owner || typeof action.owner !== "string") {
      throw new TypeError(`Startup action ${action.id} requires an owner.`);
    }

    if (typeof action.run !== "function") {
      throw new TypeError(`Startup action ${action.id} requires a run function.`);
    }

    actionIds.add(action.id);
  }
}

/** @param {DatabaseStartupAction} action @param {DatabaseStartupStatus} status @param {number} durationMs @param {string} [reason] @returns {DatabaseStartupPhaseEvent} */
function createEvent(action, status, durationMs, reason = "") {
  return {
    durationMs,
    id: action.id,
    lifecycle: action.lifecycle,
    owner: action.owner,
    ...(reason ? { reason } : {}),
    status,
  };
}

/** @param {number} startedAt @param {number} finishedAt */
function elapsedMilliseconds(startedAt, finishedAt) {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

export {
  runStartupActions,
  STARTUP_LIFECYCLES,
};
