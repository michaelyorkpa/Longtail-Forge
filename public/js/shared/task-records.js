// @ts-check

/**
 * Single-task response records: what the server actually sends back when one task is the answer.
 *
 * Extracted by `0.33.33.38.4.3.1` from `public/js/tasks.js`, `public/js/task-dialog.js` and
 * `public/js/workbench.js`, which between them read `result.task` and `result.targetTask` from
 * eleven endpoints and trusted every one of them.
 *
 * **There are two final task shapes and the producers draw the line, not the routes.** The three
 * task-timer routes answer `task: updatedTask || task` where `updatedTask` is
 * `tasksRepository.readById` - the base record `taskRowToAppValue` reconstructs, plus the
 * `assignees` that `attachAssignees` adds. Everything else - create, read, update, complete,
 * reopen, archive, restore, skip-to-current - reaches `attachTaskDetails`, which adds ten members
 * built by ten other producers. One field table lives here so the three surfaces cannot drift
 * apart from the shaper or from each other.
 *
 * **It answers `null` rather than throwing.** Every call site already had its own fallback for an
 * absent task, and this module preserves each one rather than replacing it with an exception.
 *
 * It holds no rendering, no lifecycle rule and no state.
 *
 * @param {Window} global
 */
(function attachTaskRecords(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks into
  // the shared type environment the way a top-level `const` leaks into the shared lexical one,
  // which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskAssignee} BrowserTaskAssignee */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskRecord} BrowserTaskRecord */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskDetail} BrowserTaskDetail */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskListItem} BrowserTaskListItem */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskListPagination} BrowserTaskListPagination */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskListOptions} BrowserTaskListOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskListEnvelope} BrowserTaskListEnvelope */

  const namespace = global.LongtailForge || {};

  /**
   * The thirty text members `taskRowToAppValue` reconstructs.
   *
   * Twenty-seven carry a total fallback and three are passed through from `NOT NULL` columns, so
   * every one of them is a string on every path and none of them is ever `null`.
   */
  const TASK_TEXT_MEMBERS = Object.freeze([
    "archived_at",
    "archived_by_user_id",
    "blocked_reason",
    "client_id",
    "client_name",
    "completed_at",
    "completed_by_user_id",
    "created_at",
    "created_by_user_id",
    "description",
    "due_at_utc",
    "due_date",
    "due_time",
    "due_timezone",
    "last_worked_at",
    "next_action",
    "priority",
    "project_id",
    "project_name",
    "recurrence_instance_date",
    "recurrence_template_id",
    "resume_note",
    "source_id",
    "source_type",
    "status",
    "task_id",
    "title",
    "updated_at",
    "updated_by_user_id",
    "workspace_id",
  ]);

  /** The ten members `attachTaskDetails` and `attachReminderDetailsToTask` add, all present on every path. */
  const TASK_DETAIL_MEMBERS = Object.freeze([
    "checklistProgress",
    "completionMetrics",
    "recurrenceContinuity",
    "recurrenceDetails",
    "recurrenceRecovery",
    "relationshipSummary",
    "reminderDetails",
    "resumeContext",
  ]);

  /** The two detail members that are arrays rather than opaque records. */
  const TASK_DETAIL_ARRAYS = Object.freeze(["checklistItems", "tags"]);

  /** The four members `assigneeRowToAppValue` builds. */
  const ASSIGNEE_MEMBERS = Object.freeze(["displayName", "task_assignee_id", "user_id", "username"]);

  /** The five members `attachTaskListProjectionDetails` adds to every list item. */
  const TASK_LIST_MEMBERS = Object.freeze([
    "checklistProgress",
    "completionMetrics",
    "parentTask",
    "relationshipSummary",
    "resumeContext",
  ]);

  /**
   * The five members the tag decorator adds - **when it runs at all**.
   *
   * `decorateRecordsForTarget` returns its records untouched when the tags module is not readable
   * for the session, so a workspace with tags disabled sends list items without any of these.
   * They are checked when present and never required.
   */
  const TASK_LIST_TAG_MEMBERS = Object.freeze([
    "directTags",
    "effectiveTags",
    "propagatedTags",
    "tagAssignments",
    "tags",
  ]);

  /** The four members `queryTasksResult` builds for the paging cursor. */
  const TASK_PAGINATION_NUMBERS = Object.freeze(["limit", "pageSize"]);

  /** The four option collections `readOptions` gets from four other producers. */
  const TASK_OPTION_COLLECTIONS = Object.freeze(["clients", "projects", "tasks", "users"]);

  /** The two option collections `readOptions` spreads from server constants. */
  const TASK_OPTION_TEXT_LISTS = Object.freeze(["priorities", "statuses"]);

  /** The two option flags `readOptions` constructs itself. */
  const TASK_OPTION_FLAGS = Object.freeze(["taskTimersEnabled", "timeTrackingEnabled"]);

  /**
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One assignee as `assigneeRowToAppValue` builds it.
   * @param {unknown} value
   * @returns {value is BrowserTaskAssignee}
   */
  function isTaskAssignee(value) {
    return isResponseRecord(value)
      && ASSIGNEE_MEMBERS.every((member) => typeof value[member] === "string")
      && value.task_assignee_id !== "";
  }

  /**
   * A task as `taskRowToAppValue` and `attachAssignees` build it.
   *
   * **`estimate_minutes` is the only nullable member** and `reminder_override_enabled` is a real
   * boolean the shaper converted from the stored integer flag, so the integer is refused here.
   * `billable` is the one union the producer genuinely closes.
   * @param {unknown} value
   * @returns {value is BrowserTaskRecord}
   */
  function isTaskRecord(value) {
    return isResponseRecord(value)
      && TASK_TEXT_MEMBERS.every((member) => typeof value[member] === "string")
      && value.task_id !== ""
      && (value.billable === "no" || value.billable === "yes")
      && (value.estimate_minutes === null || typeof value.estimate_minutes === "number")
      && typeof value.reminder_override_enabled === "boolean"
      && Array.isArray(value.assignees)
      && value.assignees.every(isTaskAssignee);
  }

  /**
   * A task as `attachTaskDetails` builds it.
   *
   * The ten added members are ten other producers, so their presence is checked and their shapes
   * are not. `recurrenceRecovery` is `null` on the four routes that call the shaper without a
   * session, which is a value rather than an absence.
   * @param {unknown} value
   * @returns {value is BrowserTaskDetail}
   */
  function isTaskDetail(value) {
    // The detail members are read while `value` is still the open record `isResponseRecord`
    // proved, because once `isTaskRecord` has narrowed it the ten added members are no longer
    // indexable by name. The base check therefore runs last; the order is a typing constraint,
    // not a semantic one.
    return isResponseRecord(value)
      && TASK_DETAIL_MEMBERS.every((member) => member in value)
      && TASK_DETAIL_ARRAYS.every((member) => Array.isArray(value[member]))
      && isTaskRecord(value);
  }

  /**
   * A task as `GET /api/tasks` sends it.
   *
   * **The base record is checked by `isTaskRecord` rather than restated here.** This adds only
   * what the list projection adds, which is five members - not the ten `attachTaskDetails` builds,
   * and including `parentTask`, which no detail route sends.
   * @param {unknown} value
   * @returns {value is BrowserTaskListItem}
   */
  function isTaskListItem(value) {
    // Read the added members while `value` is still the open record `isResponseRecord` proved; the
    // base check runs last, as in `isTaskDetail`.
    return isResponseRecord(value)
      && TASK_LIST_MEMBERS.every((member) => member in value)
      && TASK_LIST_TAG_MEMBERS.every((member) => !(member in value) || Array.isArray(value[member]))
      && isTaskRecord(value);
  }

  /**
   * The paging cursor `queryTasksResult` builds.
   * @param {unknown} value
   * @returns {value is BrowserTaskListPagination}
   */
  function isTaskListPagination(value) {
    return isResponseRecord(value)
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && TASK_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number");
  }

  /**
   * The option catalog `readOptions` builds.
   *
   * The four collections come from four other producers and are checked as containers only, which
   * is the whole of what this boundary can honestly say about them.
   * @param {unknown} value
   * @returns {value is BrowserTaskListOptions}
   */
  function isTaskListOptions(value) {
    return isResponseRecord(value)
      && typeof value.workspaceType === "string"
      && TASK_OPTION_FLAGS.every((member) => typeof value[member] === "boolean")
      && TASK_OPTION_COLLECTIONS.every((member) => Array.isArray(value[member]))
      && TASK_OPTION_TEXT_LISTS.every((member) => Array.isArray(value[member])
        && value[member].every((entry) => typeof entry === "string"));
  }

  /**
   * The task list envelope, with every element checked.
   *
   * **A malformed task is dropped rather than emptying the list**, which is the answer this estate
   * has given since `0.33.33.38.4.2` and the closest thing to what `result.tasks || []` did.
   * `options` and `pagination` answer `null` when they cannot be vouched for, which is exactly the
   * absence both consumers already handled - one falls back to the state it holds, the other runs
   * a total normaliser with its own defaults.
   * @param {unknown} body
   * @returns {BrowserTaskListEnvelope}
   */
  function readTaskList(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const options = envelope ? envelope.options : null;
    const pagination = envelope ? envelope.pagination : null;
    const currentUserId = envelope ? envelope.currentUserId : null;
    return {
      currentUserId: typeof currentUserId === "string" ? currentUserId : "",
      options: isTaskListOptions(options) ? options : null,
      pagination: isTaskListPagination(pagination) ? pagination : null,
      tasks: envelope && Array.isArray(envelope.tasks) ? envelope.tasks.filter(isTaskListItem) : [],
    };
  }

  /**
   * The detailed tasks a bulk action changed.
   *
   * `bulkUpdate` collects `readTaggedTaskWithDetails` output and the lifecycle services' own
   * `task`, so these are **detail** records rather than list items - which is why they flow into
   * `upsertTask` beside the single-task responses and why `isTaskDetail` is the right check.
   * @param {unknown} body
   * @returns {BrowserTaskDetail[]}
   */
  function readBulkTasks(body) {
    const envelope = isResponseRecord(body) ? body : null;
    return envelope && Array.isArray(envelope.tasks) ? envelope.tasks.filter(isTaskDetail) : [];
  }

  /**
   * The base task a timer route sent, or `null`.
   * @param {unknown} body
   * @returns {BrowserTaskRecord | null}
   */
  function readTask(body) {
    const task = isResponseRecord(body) ? body.task : null;
    return isTaskRecord(task) ? task : null;
  }

  /**
   * The detailed task a create, read, update or lifecycle route sent, or `null`.
   * @param {unknown} body
   * @returns {BrowserTaskDetail | null}
   */
  function readTaskDetail(body) {
    const task = isResponseRecord(body) ? body.task : null;
    return isTaskDetail(task) ? task : null;
  }

  /**
   * The detailed task the skip-to-current route retained, or `null`.
   *
   * The member name differs and the producer does not: the service builds it with
   * `readTaggedTaskWithDetails`, the same shaper `task` comes from.
   * @param {unknown} body
   * @returns {BrowserTaskDetail | null}
   */
  function readSkipToCurrentTarget(body) {
    const target = isResponseRecord(body) ? body.targetTask : null;
    return isTaskDetail(target) ? target : null;
  }

  namespace.taskRecords = Object.freeze({
    readBulkTasks,
    readSkipToCurrentTarget,
    readTask,
    readTaskDetail,
    readTaskList,
  });

  global.LongtailForge = namespace;
}(window));
