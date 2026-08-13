// @ts-check
import { listModuleEntries } from "./registry.js";

/** @typedef {import("../../types/framework-contracts.js").ModuleStartupTask} ModuleStartupTask */

const RUNTIME_KINDS = new Set(["app", "worker"]);
const activatedRuntimes = new Set();
/** @type {Map<string, readonly import("../../types/framework-contracts.js").ModuleStartupTask[]>} */
const startupTasksByRuntime = new Map();

/**
 * Run module-owned registration only after the complete bundled manifest graph
 * has validated in the registry engine.
 *
 * @param {"app" | "worker"} runtime
 */
function activateModuleRuntime(runtime) {
  assertRuntime(runtime);
  if (activatedRuntimes.has(runtime)) {
    return;
  }

  /** @type {ModuleStartupTask[]} */
  const startupTasks = [];
  for (const catalogEntry of listModuleEntries()) {
    const moduleId = catalogEntry.moduleEntry.manifest.id;
    const activationHook = runtime === "app"
      ? catalogEntry.moduleEntry.activateApp
      : catalogEntry.moduleEntry.activateWorker;
    if (!activationHook) {
      continue;
    }

    const result = activationHook({
      moduleId,
      runtime,
      registerStartupTask(task) {
        startupTasks.push(validateStartupTask(moduleId, task));
      },
    });
    if (result && typeof result === "object" && "then" in result && typeof result.then === "function") {
      throw new Error(`Bundled module '${moduleId}' ${runtime} activation must remain synchronous.`);
    }
  }

  assertUniqueStartupTaskIds(runtime, startupTasks);
  startupTasksByRuntime.set(runtime, Object.freeze([...startupTasks]));
  activatedRuntimes.add(runtime);
}

/**
 * @param {"app" | "worker"} runtime
 * @param {{ defer?: boolean, logger?: Pick<Console, "log" | "warn"> }} [options]
 */
async function runModuleStartupTasks(runtime, options = {}) {
  assertRuntime(runtime);
  activateModuleRuntime(runtime);
  const logger = options.logger || console;
  const tasks = startupTasksByRuntime.get(runtime) || [];

  if (options.defer) {
    for (const task of tasks) {
      setTimeout(() => {
        void runStartupTask(task, logger);
      }, 0);
    }
    return;
  }

  for (const task of tasks) {
    await runStartupTask(task, logger);
  }
}

/**
 * @param {ModuleStartupTask} task
 * @param {Pick<Console, "log" | "warn">} logger
 */
async function runStartupTask(task, logger) {
  try {
    const result = await task.run();
    const message = task.formatSuccess?.(result);
    if (message) {
      logger.log(message);
    }
  } catch (error) {
    logger.warn(task.failureMessage || `[module-startup] ${task.id} failed.`);
    logger.warn(error instanceof Error ? error.message : error);
  }
}

/**
 * @param {string} moduleId
 * @param {ModuleStartupTask} task
 */
function validateStartupTask(moduleId, task) {
  if (!task || typeof task !== "object") {
    throw new Error(`Bundled module '${moduleId}' startup task must be an object.`);
  }
  const localId = String(task.id || "").trim();
  if (!localId || typeof task.run !== "function") {
    throw new Error(`Bundled module '${moduleId}' startup task requires id and run.`);
  }
  if (task.formatSuccess !== undefined && typeof task.formatSuccess !== "function") {
    throw new Error(`Bundled module '${moduleId}' startup task '${localId}' formatSuccess must be a function.`);
  }
  return Object.freeze({
    ...task,
    id: `${moduleId}:${localId}`,
    moduleId,
  });
}

/** @param {"app" | "worker"} runtime @param {ModuleStartupTask[]} tasks */
function assertUniqueStartupTaskIds(runtime, tasks) {
  const seen = new Set();
  for (const task of tasks) {
    if (seen.has(task.id)) {
      throw new Error(`Bundled module ${runtime} startup task '${task.id}' is duplicated.`);
    }
    seen.add(task.id);
  }
}

/** @param {"app" | "worker"} runtime */
function assertRuntime(runtime) {
  if (!RUNTIME_KINDS.has(runtime)) {
    throw new Error(`Unknown module runtime '${runtime}'.`);
  }
}

export {
  activateModuleRuntime,
  runModuleStartupTasks,
};
