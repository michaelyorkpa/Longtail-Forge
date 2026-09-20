import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const navigation = createProjectTextReader().readText("public/js/navigation.js");

/**
 * The app shell's notification bell and panel, through the shipped functions.
 *
 * `0.33.33.39.34` typed them against the `BrowserNotification` the list reader validates, while
 * `applyNotificationSummary` keeps reading its members as member accesses because its two callers
 * hold different shapes: the validated bell summary and the bootstrap's plain record. The panel
 * item, the group order, the status line and the date formatter are unchanged; these cases hold
 * each of them to that.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

/** @param {unknown} value @returns {Bag[]} */
function bags(value) {
  assert.ok(Array.isArray(value));
  return value.map((entry) => {
    assert.ok(isBag(entry));
    return entry;
  });
}

const PANEL_FUNCTIONS = [
  "requiredMember", "applyNotificationSummary", "renderNotificationPanel", "sortNotificationPanelItems",
  "createNotificationPanelGroup", "createNotificationPanelItem", "createNotificationPanelActionButton",
  "notificationPriority", "notificationDisplayTitle", "notificationContextTitle", "notificationMetaParts",
  "notificationUpdateTypeLabel", "createNotificationPanelEmpty", "setNotificationPanelStatus", "formatNotificationDate",
];

/** @param {{ workspaceType?: string }} [options] */
function panel({ workspaceType = "business" } = {}) {
  const context = createFakeBrowserContext({ longtailForge: { workspaceContext: { workspaceType } }, iconButton: false });
  const document = context.document;
  const notificationList = document.createElement("div");
  // The double's element has no `prepend`; the DOM's does, and the status line uses it.
  Reflect.set(notificationList, "prepend", (/** @type {Parameters<typeof notificationList.replaceChildren>} */ ...nodes) => {
    notificationList.replaceChildren(...nodes, ...notificationList.children);
  });
  const notificationCount = document.createElement("span");
  const notificationBell = document.createElement("button");
  /** @type {unknown[][]} */
  const mutations = [];
  Object.assign(context, {
    notificationList,
    notificationCount,
    notificationBell,
    mutateNotification: (/** @type {unknown[]} */ ...args) => { mutations.push(args); },
  });
  vm.runInNewContext([
    ...PANEL_FUNCTIONS.map((name) => extractFunctionBlock(navigation, name)),
    `this.panel = { ${PANEL_FUNCTIONS.join(", ")} };`,
  ].join("\n"), context, { filename: "navigation-notification-panel.js" });
  const api = context.panel;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.ok(isCallable(fn), `${name} is lifted`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(fn, api, args);
  };
  return { api, document, member, mutations, notificationBell, notificationCount, notificationList };
}

/** @param {Bag} [overrides] */
const notification = (overrides = {}) => ({
  actor_user_id: "", body: "", created_at: "2026-09-18T10:00:00.000Z", displayType: "Task update",
  displayTitle: "A task moved", dismissed_at: "", event_type: "tasks.updated", metadata: {},
  module_id: "tasks", notification_id: "n-1", priority: "normal", read_at: "", recipient_user_id: "u-1",
  record_id: "t-1", record_type: "task", status: "unread",
  target: { canOpen: true, moduleId: "tasks", recordId: "t-1", recordType: "task", targetExists: true, url: "tasks.html?task=t-1" },
  title: "A task moved", updateTypeLabel: "Updated", url: "tasks.html?task=t-1", workspace_id: "w-1",
  ...overrides,
});

describe("applyNotificationSummary reads either summary its callers hold", () => {
  it("shows the badge for a validated summary and for the bootstrap's record", () => {
    const f = panel();
    f.member("applyNotificationSummary")({
      count: 4, highPriorityCount: 1, hasHighPriority: true, hasPriorityAlert: true, hasUrgentPriority: false,
      lowPriorityUnreadCount: 0, totalUnreadCount: 4, unreadCount: 4, urgentPriorityCount: 0,
    });
    assert.equal(f.notificationCount.textContent, "4");
    assert.equal(f.notificationCount.hidden, false);
    assert.equal(f.notificationBell.dataset.notificationPriority, "high");
    assert.equal(f.notificationBell.title, "Priority notifications");
    assert.equal(f.notificationBell.classList.contains("has-priority-alert"), true);

    // `unreadCount` is read first, and `count` is the alias a record may carry instead.
    f.member("applyNotificationSummary")({ unreadCount: 2, count: 7 });
    assert.equal(f.notificationCount.textContent, "2");

    // The bootstrap hands over a plain record, which may carry only the alias.
    f.member("applyNotificationSummary")({ count: 120, hasUrgentPriority: true });
    assert.equal(f.notificationCount.textContent, "99+");
    assert.equal(f.notificationBell.dataset.notificationPriority, "urgent");
  });

  it("hides the badge at zero, defaults an absent summary, and still fails for a missing one", () => {
    const f = panel();
    f.member("applyNotificationSummary")({ unreadCount: 0 });
    assert.equal(f.notificationCount.textContent, "0");
    assert.equal(f.notificationCount.hidden, true);
    assert.equal(f.notificationBell.title, "Notifications");
    f.member("applyNotificationSummary")();
    assert.equal(f.notificationCount.textContent, "0");
    assert.equal(nameOf(thrown(() => f.member("applyNotificationSummary")(null))), "TypeError");
  });
});

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    return error;
  }
  return null;
}

describe("the panel renders what the list reader validated", () => {
  it("promotes urgent and high items, groups the rest, and orders by date then id", () => {
    const f = panel();
    f.member("renderNotificationPanel")([
      notification({ notification_id: "n-normal", priority: "normal" }),
      notification({ notification_id: "n-low", priority: "low" }),
      notification({ notification_id: "n-high", priority: "high" }),
      notification({ notification_id: "n-urgent-old", priority: "urgent", created_at: "2026-09-17T10:00:00.000Z" }),
      notification({ notification_id: "n-urgent-b", priority: "urgent" }),
      notification({ notification_id: "n-urgent-a", priority: "urgent" }),
    ]);
    assert.deepEqual(f.notificationList.querySelectorAll("[data-notification-panel-item]").map((item) => item.dataset.notificationPanelItem),
      ["n-urgent-b", "n-urgent-a", "n-urgent-old", "n-high", "n-normal", "n-low"],
      "newest first, then the later id, with the groups after the promoted items");
    assert.deepEqual(f.notificationList.querySelectorAll("section").map((group) => group.dataset.notificationPriorityGroup), ["normal", "low"]);
    assert.deepEqual(f.notificationList.querySelectorAll("h3").map((heading) => heading.textContent), ["Normal", "Low priority"]);
  });

  it("renders the empty placeholder when nothing survives", () => {
    const f = panel();
    f.member("renderNotificationPanel")([]);
    assert.equal(f.notificationList.querySelector(".notification-panel-empty")?.textContent, "No notifications");
  });

  it("builds a linked item, its labels and its actions", () => {
    const f = panel();
    const item = f.member("createNotificationPanelItem")(notification({ status: "read" }));
    assert.ok(isBag(item) && isCallable(item.querySelector));
    /** @param {string} selector */
    const find = (selector) => {
      const found = Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (item.querySelector), item, [selector]);
      assert.ok(isBag(found), `${selector} renders`);
      return found;
    };
    const title = find(".notification-panel-title");
    assert.equal(title.tagName, "A");
    assert.equal(title.href, "tasks.html?task=t-1");
    assert.equal(title.textContent, "A task moved");
    assert.equal(find(".notification-type-badge").textContent, "Updated");
    assert.equal(find(".notification-meta").textContent, f.member("formatNotificationDate")("2026-09-18T10:00:00.000Z"),
      "a task notification shows the date alone");
    const [readButton, dismissButton] = bags(Reflect.apply(
      /** @type {(...args: unknown[]) => unknown} */ (item.querySelectorAll), item, ["button"]));
    assert.deepEqual([readButton?.textContent, dismissButton?.textContent], ["Read", "Dismiss"]);
    assert.equal(readButton?.disabled, true, "a read notification cannot be read again");
    assert.ok(!dismissButton?.disabled, "but it can still be dismissed");
    const unread = f.member("createNotificationPanelItem")(notification());
    assert.ok(isBag(unread) && isCallable(unread.querySelectorAll));
    const [unreadRead] = bags(Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (unread.querySelectorAll), unread, ["button"]));
    assert.equal(unreadRead?.disabled, false, "an unread one can be read");
  });

  it("uses a span with no href when a notification carries no URL, and falls back through its labels", () => {
    const f = panel();
    const item = f.member("createNotificationPanelItem")(notification({
      url: "", displayTitle: "", updateTypeLabel: "", displayType: "", record_type: "note",
      target: { canOpen: false, moduleId: "notes", recordId: "note-1", recordType: "note", targetExists: true, url: "" },
    }));
    assert.ok(isBag(item) && isCallable(item.querySelector));
    const title = Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (item.querySelector), item, [".notification-panel-title"]);
    assert.ok(isBag(title));
    assert.equal(title.tagName, "SPAN");
    assert.equal(title.href, undefined, "no href is written onto a span");
    assert.equal(title.textContent, "A task moved", "the title falls back to the record's own title");
    const badge = Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (item.querySelector), item, [".notification-type-badge"]);
    assert.ok(isBag(badge));
    assert.equal(badge.textContent, "tasks.updated", "and the type badge falls back to the event type");
  });

  it("titles a task item with its client and project, by workspace type", () => {
    const context = { clientName: "Northwind", projectName: "Rollout" };
    const withContext = notification({ target: { canOpen: true, context, moduleId: "tasks", recordId: "t-1", recordType: "task", targetExists: true, url: "tasks.html" } });
    const business = panel();
    assert.equal(business.member("notificationContextTitle")(withContext), "Northwind / Rollout");
    const personal = panel({ workspaceType: "personal" });
    assert.equal(personal.member("notificationContextTitle")(withContext), "Rollout");
    assert.equal(personal.member("notificationContextTitle")(notification()), "", "a target with no context has no title");
  });
});

describe("the panel's status line and date", () => {
  it("creates, updates and removes the status in place", () => {
    const f = panel();
    f.member("setNotificationPanelStatus")("Notification action failed.", true);
    const status = f.notificationList.querySelector("[data-notification-panel-status]");
    assert.ok(status);
    assert.equal(status.getAttribute("role"), "status");
    assert.equal(status.classList.contains("notification-panel-status"), true);
    assert.equal(status.classList.contains("is-error"), true);
    f.member("setNotificationPanelStatus")("Working");
    assert.equal(f.notificationList.querySelectorAll("[data-notification-panel-status]").length, 1, "the same node is reused");
    assert.equal(f.notificationList.querySelector("[data-notification-panel-status]")?.textContent, "Working");
    assert.equal(f.notificationList.querySelector("[data-notification-panel-status]")?.classList.contains("is-error"), false);
    f.member("setNotificationPanelStatus")("");
    assert.equal(f.notificationList.querySelectorAll("[data-notification-panel-status]").length, 0);
  });

  it("formats a date it can read and answers empty for anything else", () => {
    const f = panel();
    assert.equal(f.member("formatNotificationDate")(""), "");
    assert.equal(f.member("formatNotificationDate")("not a date"), "");
    assert.equal(f.member("formatNotificationDate")("2026-09-18T10:00:00.000Z"), new Date("2026-09-18T10:00:00.000Z").toLocaleString());
  });
});
