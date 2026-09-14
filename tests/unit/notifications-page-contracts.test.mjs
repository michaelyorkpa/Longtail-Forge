import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notifications.js");

/**
 * This checkpoint is annotation-dominated: thirty of the thirty diagnostics were parameters and
 * the values they carried, and an annotation is proved by the compiler rather than by a test.
 *
 * **Exactly two expressions changed**, and both were changed to keep the compiler honest rather
 * than to alter behaviour - so what these cases assert is that the behaviour really is unchanged.
 * The grouping and ordering cases come with them because the same annotations now describe those
 * readers, and a wrong shape there would be silent.
 */

const LIFTED = [
  "normalizeNotificationPagination", "notificationContextTitle",
  "normalizeGroupingMode", "notificationGroupKey",
  "notificationPriority", "notificationUpdateTypeLabel",
  "sortNotificationsForDisplay", "groupNotificationsForDisplay",
  "formatRecordType", "formatDate",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {string} [options.workspaceType]
 * @param {string} [options.groupingMode]
 */
function notificationsCase(options = {}) {
  const { workspaceType = "business", groupingMode = "client_project" } = options;
  const state = { groupingPreferences: { groupingMode } };
  const context = vm.createContext({
    state,
    window: { LongtailForge: { workspaceContext: { workspaceType } } },
    console: { error: () => {} },
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, context), state };
}

/** @param {Record<string, unknown>} [overrides] */
const notification = (overrides = {}) => ({
  notification_id: "n1", title: "A title", body: "", created_at: "2026-09-14T12:00:00.000Z",
  displayTitle: "A title", displayType: "Update", updateTypeLabel: "Update",
  event_type: "task.updated", module_id: "tasks", record_type: "task", status: "active",
  url: "", target: { canOpen: false, recordType: "task" }, ...overrides,
});

describe("Notifications pagination normalizer", () => {
  /**
   * **`String(total)` is the only change here, and `parseInt` already coerced its first argument.**
   * These are the values the published `number | null` can actually hold, plus the shapes the
   * normalizer exists to tolerate.
   */
  it("answers the same pair for every total the contract can carry", () => {
    const { api } = notificationsCase();
    for (const [total, expected] of [[0, 0], [7, 7], [null, 0], [undefined, 0]]) {
      assert.equal(api.normalizeNotificationPagination({ hasMore: false, total }).total, expected, `total: ${String(total)}`);
    }
  });

  it("treats anything but true as no further page", () => {
    const { api } = notificationsCase();
    for (const hasMore of [true, false, undefined, null, "true", 1]) {
      assert.equal(api.normalizeNotificationPagination({ hasMore, total: 0 }).hasMore, hasMore === true, `hasMore: ${String(hasMore)}`);
    }
  });

  it("answers a usable pair when handed nothing at all", () => {
    const { api } = notificationsCase();
    assert.deepEqual(plain(api.normalizeNotificationPagination()), { hasMore: false, total: 0 });
  });

  /**
   * **This is the case the coercion exists for.** Every total the published contract allows is a
   * number or `null`, and for those `parseInt` and a bare `|| 0` answer the same thing - so the
   * reads above cannot tell them apart. A body that breaks the contract can, and a normalizer that
   * passed a string through would put one into `state.pagination.total`.
   */
  it("answers a number even when the body carries a string total", () => {
    const { api } = notificationsCase();
    const normalized = api.normalizeNotificationPagination({ hasMore: false, total: "12" });
    assert.strictEqual(normalized.total, 12);
    assert.equal(typeof normalized.total, "number");
    assert.strictEqual(api.normalizeNotificationPagination({ hasMore: false, total: "not a number" }).total, 0);
  });
});

describe("Notifications task context title", () => {
  const withContext = (/** @type {Record<string, unknown> | undefined} */ context) =>
    notification({ target: { canOpen: true, recordType: "task", ...(context ? { context } : {}) } });

  /**
   * **The `|| {}` stand-in is gone, not the fallback.** An empty object literal has no members, so
   * every read through it was a property access on `{}`; these cases hold the runtime answer fixed
   * across a present context, an absent one, and each half missing.
   */
  it("joins client and project in a business workspace", () => {
    const { api } = notificationsCase();
    assert.equal(api.notificationContextTitle(withContext({ clientName: "Acme", projectName: "Rewrite" })), "Acme / Rewrite");
  });

  it("answers an empty string when the target carries no context at all", () => {
    const { api } = notificationsCase();
    assert.equal(api.notificationContextTitle(withContext(undefined)), "");
  });

  it("drops whichever half is missing rather than joining an empty one", () => {
    const { api } = notificationsCase();
    assert.equal(api.notificationContextTitle(withContext({ projectName: "Rewrite" })), "Rewrite");
    assert.equal(api.notificationContextTitle(withContext({ clientName: "Acme" })), "Acme");
    assert.equal(api.notificationContextTitle(withContext({ clientName: "   ", projectName: "  " })), "");
  });

  it("says nothing for a record that is not a task", () => {
    const { api } = notificationsCase();
    const note = notification({ target: { canOpen: true, recordType: "note", context: { clientName: "Acme", projectName: "Rewrite" } } });
    assert.equal(api.notificationContextTitle(note), "");
  });
});

describe("Notifications grouping and ordering", () => {
  it("keeps the three supported grouping modes and defaults anything else", () => {
    const { api } = notificationsCase();
    for (const mode of ["client_project", "notification_type", "record_type"]) {
      assert.equal(api.normalizeGroupingMode(mode), mode);
    }
    for (const mode of ["", "unknown", "Client_Project"]) {
      assert.equal(api.normalizeGroupingMode(mode), "client_project", `mode: ${mode}`);
    }
  });

  it("groups by the selected mode and keeps every notification in exactly one group", () => {
    const rows = [
      notification({ notification_id: "a", record_type: "task", target: { canOpen: true, recordType: "task", context: { clientName: "Acme", projectName: "Rewrite" } } }),
      notification({ notification_id: "b", record_type: "task", target: { canOpen: true, recordType: "task", context: { clientName: "Acme", projectName: "Rewrite" } } }),
      notification({ notification_id: "c", record_type: "note", target: { canOpen: false, recordType: "note" } }),
    ];
    const grouped = notificationsCase({ groupingMode: "record_type" }).api.groupNotificationsForDisplay(rows);
    assert.equal(grouped.reduce((/** @type {number} */ total, /** @type {{ notifications: unknown[] }} */ group) => total + group.notifications.length, 0), 3);
    // **Counting notifications is not enough**: a key that never collides still yields every
    // notification exactly once, just in a group of its own. Two record types must be two groups,
    // and the two tasks must share one.
    assert.equal(grouped.length, 2, "two record types must produce two groups");
    assert.deepEqual(plain(grouped.map((/** @type {{ notifications: unknown[] }} */ group) => group.notifications.length).sort()), [1, 2]);
    assert.equal(new Set(grouped.map((/** @type {{ id: string }} */ group) => group.id)).size, 2);
    for (const group of grouped) {
      assert.equal(typeof group.id, "string");
      assert.equal(typeof group.label, "string");
    }
  });

  /** A notification whose target names no record type still groups, through the row's own field. */
  it("falls back to the notification's own record type when the target names none", () => {
    const rows = [
      notification({ notification_id: "a", record_type: "time_entry", target: { canOpen: false } }),
      notification({ notification_id: "b", record_type: "time_entry", target: { canOpen: false } }),
    ];
    const grouped = notificationsCase({ groupingMode: "record_type" }).api.groupNotificationsForDisplay(rows);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].label, "Time Entry");
  });

  it("leaves the caller's list untouched while ordering its own copy", () => {
    const { api } = notificationsCase();
    const rows = [notification({ notification_id: "a" }), notification({ notification_id: "b" })];
    const before = plain(rows);
    api.sortNotificationsForDisplay(rows);
    assert.deepEqual(plain(rows), before, "sorting must not reorder the caller's array in place");
  });
});

describe("Notifications small formatters", () => {
  it("names a record type readably and falls back when it carries none", () => {
    const { api } = notificationsCase();
    assert.equal(api.formatRecordType("task"), "Task");
    assert.equal(api.formatRecordType("time_entry"), "Time Entry");
    assert.equal(api.formatRecordType(""), "Notification");
    assert.equal(api.formatRecordType(null), "Notification");
  });

  it("answers an empty string for a date it cannot read", () => {
    const { api } = notificationsCase();
    assert.equal(api.formatDate(""), "");
    assert.equal(api.formatDate("not a date"), "");
    assert.notEqual(api.formatDate("2026-09-14T12:00:00.000Z"), "");
  });
});

describe("Notifications shapes this page states rather than invents", () => {
  /** The published record was already imported for the state slot; the readers now declare it too. */
  it("declares the published notification for every reader that takes one", () => {
    for (const reader of [
      "notificationGroupKey", "createNotificationRow", "notificationDisplayTitle",
      "notificationContextTitle", "notificationMetaParts", "notificationUpdateTypeLabel",
      "notificationPriority",
    ]) {
      assert.match(source, new RegExp(`@param \\{BrowserNotification\\}[^\\n]*\\n[^\\n]*function ${reader}\\(`));
    }
    assert.match(source, /@typedef \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserNotification\} BrowserNotification/);
  });

  it("names its own display group rather than borrowing a published one", () => {
    assert.match(source, /@typedef \{\{ id: string, label: string, notifications: BrowserNotification\[\] \}\} NotificationDisplayGroup/);
  });

  /** The stand-in that hid the published optional context. */
  it("reads the optional target context through the chain, not through an empty literal", () => {
    assert.match(source, /const context = notification\.target\?\.context;/);
    assert.doesNotMatch(source, /notification\.target\?\.context \|\| \{\}/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });
});
