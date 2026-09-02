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
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskClientOption} BrowserTaskClientOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskProjectOption} BrowserTaskProjectOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskPickerOption} BrowserTaskPickerOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTaskUserOption} BrowserTaskUserOption */
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

  /**
   * The client-option members this catalog can vouch for.
   *
   * Two are guaranteed by `clientRowToAppClient` and three are reconstructed by
   * `readClientOptionPayload`. Everything else in the record arrived through two spreads and is
   * the client-projects estate's to describe.
   */
  const CLIENT_OPTION_TEXT = Object.freeze(["displayName", "id", "name", "optionLabel", "parent_client_id"]);

  /** The project option adds the client relationship its row shaper guarantees as text. */
  const PROJECT_OPTION_TEXT = Object.freeze(["client_id", "displayName", "id", "name", "optionLabel"]);

  /** The thirteen members `taskPickerOption` reconstructs, all text. */
  const TASK_PICKER_OPTION_TEXT = Object.freeze([
    "client_id",
    "client_name",
    "displayName",
    "due_date",
    "due_time",
    "id",
    "label",
    "optionLabel",
    "priority",
    "project_id",
    "project_name",
    "status",
    "task_id",
  ]);

  /** The three members of `userRowToAppValue` this catalog promises. */
  const USER_OPTION_TEXT = Object.freeze(["displayName", "user_id", "username"]);

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
   * A vocabulary entry the server spread from its own constants.
   * @param {unknown} value
   * @returns {value is string}
   */
  function isText(value) {
    return typeof value === "string";
  }

  /**
   * One client as `readClientOptionPayload` sends it.
   * @param {unknown} value
   * @returns {value is BrowserTaskClientOption}
   */
  function isClientOption(value) {
    return isResponseRecord(value)
      && CLIENT_OPTION_TEXT.every((member) => typeof value[member] === "string")
      && typeof value.hierarchyDepth === "number"
      && value.id !== "";
  }

  /**
   * One project as `readProjectOptionPayload` sends it.
   *
   * `client_id` is text and may be the empty string; a project without a client is not a malformed
   * project, and the page's own comparison has always read that empty string.
   * @param {unknown} value
   * @returns {value is BrowserTaskProjectOption}
   */
  function isProjectOption(value) {
    return isResponseRecord(value)
      && PROJECT_OPTION_TEXT.every((member) => typeof value[member] === "string")
      && typeof value.hierarchyDepth === "number"
      && value.id !== "";
  }

  /**
   * One task as `taskPickerOption` sends it.
   * @param {unknown} value
   * @returns {value is BrowserTaskPickerOption}
   */
  function isTaskPickerOption(value) {
    return isResponseRecord(value)
      && TASK_PICKER_OPTION_TEXT.every((member) => typeof value[member] === "string")
      && value.task_id !== "";
  }

  /**
   * One workspace member as the catalog sends it.
   *
   * Three members of the fifteen `userRowToAppValue` builds, and the contract says so.
   * @param {unknown} value
   * @returns {value is BrowserTaskUserOption}
   */
  function isUserOption(value) {
    return isResponseRecord(value)
      && USER_OPTION_TEXT.every((member) => typeof value[member] === "string")
      && value.user_id !== "";
  }

  /**
   * The option catalog `readOptions` builds, with every collection element checked.
   *
   * **A malformed option is dropped; a malformed catalog is refused.** The two are different
   * failures and the page already treats them differently: an absent catalog falls back to the
   * stand-in the page holds, while a selector with one unusable entry has always simply rendered
   * the rest. Refusing the whole catalog because one client is malformed would empty every picker
   * on the page, which is the opposite of what `result.options || state.options` used to do.
   * @param {unknown} value
   * @returns {BrowserTaskListOptions | null}
   */
  function readTaskListOptions(value) {
    // The refusal is table-driven, because the tables are the authority the proofs read. The
    // reconstruction below then re-reads each member by name: a table-driven `every` proves the
    // shape at runtime but carries no narrowing into the object literal, and this owner does not
    // cast its way out of that.
    if (!isResponseRecord(value)
      || typeof value.workspaceType !== "string"
      || !TASK_OPTION_FLAGS.every((member) => typeof value[member] === "boolean")
      || !TASK_OPTION_COLLECTIONS.every((member) => Array.isArray(value[member]))
      || !TASK_OPTION_TEXT_LISTS.every((member) => Array.isArray(value[member])
        && value[member].every(isText))) {
      return null;
    }

    const { clients, priorities, projects, statuses, tasks, users } = value;
    if (!Array.isArray(clients) || !Array.isArray(projects) || !Array.isArray(tasks)
      || !Array.isArray(users) || !Array.isArray(priorities) || !Array.isArray(statuses)) {
      return null;
    }

    return {
      clients: clients.filter(isClientOption),
      priorities: priorities.filter(isText),
      projects: projects.filter(isProjectOption),
      statuses: statuses.filter(isText),
      taskTimersEnabled: value.taskTimersEnabled === true,
      tasks: tasks.filter(isTaskPickerOption),
      timeTrackingEnabled: value.timeTrackingEnabled === true,
      users: users.filter(isUserOption),
      workspaceType: value.workspaceType,
    };
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
      options: readTaskListOptions(options),
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
