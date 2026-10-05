/**
 * Task lifecycle legality: given a status, and a timer where one applies, which transitions are
 * legal.
 *
 * Extracted by `0.33.33.37` from `public/js/tasks.js`, `public/js/workbench.js`, and
 * `public/js/task-dialog.js`, which had the same rule written eleven times in two spellings - the
 * active set `["open", "in_progress", "blocked"]` six times and its complement
 * `["complete", "archived"]` five more.
 *
 * **This module answers legality and nothing else.** The three surfaces keep their own
 * responsibilities, which are genuinely different rather than three copies: Tasks resolves
 * boolean row visibility from a descriptor, Workbench produces a human-readable disabled reason
 * from Task Focus session state, and Task Dialog updates DOM state from its own closure. Those
 * are not consolidated here, and the primitives below are deliberately small so no surface has
 * its own composition forced on it - Workbench treats an already-blocked task as a reason not to
 * block, while Task Dialog turns the same status into a Resume affordance, and both are correct.
 *
 * It holds no descriptor structure, no permission rule, and no message copy.
 *
 * @param {Window} global
 */
(function attachTaskLifecycleLegality(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks into
  // the shared type environment the way a top-level `const` leaks into the shared lexical one,
  // which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.

  /**
   * The lifecycle statuses a task can hold. The browser-facing spelling of the vocabulary
   * `src/modules/tasks/tasks.service.js` enforces on the server.
   *
   * Declared here rather than reusing the published `TaskLifecycleStatus`, whose trailing `string`
   * member collapses that union to `string` and so discriminates nothing. Narrowing the server
   * type is `task-block-recovery-engine`'s to own; `0.33.33.37` did not reach into it.
   * @typedef {"open" | "in_progress" | "blocked" | "complete" | "archived"} TaskLifecycleStatus
   */

  /** @typedef {{ timer_status?: string } | null | undefined} TaskTimerLike */

  const namespace = global.LongtailForge || {};

  /**
   * Statuses a task can still be worked on from. Frozen because callers hand it straight to
   * descriptor `visibleStatuses` arrays.
   * @type {readonly TaskLifecycleStatus[]}
   */
  const ACTIVE_STATUSES = Object.freeze(["open", "in_progress", "blocked"]);

  /** @type {ReadonlySet<string>} */
  const ACTIVE_STATUS_SET = new Set(ACTIVE_STATUSES);
  /** @type {ReadonlySet<string>} */
  const TERMINAL_STATUS_SET = new Set(["complete", "archived"]);

  /**
   * The statuses from which a task is still actionable.
   * @returns {TaskLifecycleStatus[]}
   */
  function activeStatuses() {
    return [...ACTIVE_STATUSES];
  }

  /**
   * Whether a task has reached an end state. Completed and archived tasks cannot be completed
   * again, blocked, or resumed.
   * @param {unknown} status
   * @returns {boolean}
   */
  function isTerminalStatus(status) {
    return typeof status === "string" && TERMINAL_STATUS_SET.has(status);
  }

  /**
   * Whether a task in this status may still be completed.
   * @param {unknown} status
   * @returns {boolean}
   */
  function canCompleteStatus(status) {
    return typeof status === "string" && ACTIVE_STATUS_SET.has(status);
  }

  /**
   * Whether a timer satisfies an action's declared timer visibility.
   *
   * `none` means the action applies only when no timer exists, `running` only while one is
   * running, and `paused` to any timer that is not running - a paused timer and a stopped-but-
   * present one are the same case to a resume affordance. An unrecognised or absent visibility
   * imposes no timer condition.
   *
   * @param {TaskTimerLike} timer
   * @param {unknown} visibility
   * @returns {boolean}
   */
  function timerMatchesVisibility(timer, visibility) {
    if (visibility === "none") {
      return !timer;
    }
    if (visibility === "running") {
      return timer?.timer_status === "running";
    }
    if (visibility === "paused") {
      return Boolean(timer && timer.timer_status !== "running");
    }
    return true;
  }

  namespace.taskLifecycleLegality = Object.freeze({
    activeStatuses,
    canCompleteStatus,
    isTerminalStatus,
    timerMatchesVisibility,
  });
  global.LongtailForge = namespace;
})(window);
