import { performance } from "node:perf_hooks";

const STARTUP_LIFECYCLES = Object.freeze({
  BACKGROUND_JOB: "background-job",
  EVERY_BOOT: "every-boot-coordination",
  EXPLICIT_MAINTENANCE: "explicit-admin-cli-maintenance",
  FIRST_INSTALL: "first-install-bootstrap",
  READINESS_ASSERTION: "health-readiness-assertion",
  RECURRING_CHECK: "recurring-lightweight-check",
  VERSIONED_REPAIR: "one-time-migration-versioned-repair",
});

const VALID_LIFECYCLES = new Set(Object.values(STARTUP_LIFECYCLES));

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
      const status = outcome?.status === "skipped" ? "skipped" : "completed";
      const result = createEvent(action, status, elapsedMilliseconds(startedAt, now()), outcome?.reason);
      results.push(result);
      report(result);
    } catch (error) {
      report({
        ...createEvent(action, "failed", elapsedMilliseconds(startedAt, now())),
        errorType: error?.name || "Error",
      });
      throw error;
    }
  }

  return { context, results };
}

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

function elapsedMilliseconds(startedAt, finishedAt) {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

export {
  runStartupActions,
  STARTUP_LIFECYCLES,
};
