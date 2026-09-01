(function attachNotificationSubscriptions(global) {
  const root = global.LongtailForge || {};

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = root?.api;
    if (!apiClient) {
      throw new Error("Notification subscriptions requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationSubscription} BrowserNotificationSubscription */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationSubscriptionResult} BrowserNotificationSubscriptionResult */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationTarget} BrowserNotificationTarget */

  /**
   * The ten members `subscriptionRowToAppValue` constructs for every subscription row.
   *
   * Checked rather than assumed: the shaper builds all ten from named columns and defaults the two
   * that the table allows to be null, so a body carrying fewer is not the record it claims to be.
   */
  const SUBSCRIPTION_MEMBERS = Object.freeze([
    "created_at",
    "event_type",
    "module_id",
    "notification_subscription_id",
    "status",
    "target_id",
    "target_type",
    "updated_at",
    "user_id",
    "workspace_id",
  ]);

  /** The four members `normalizeSubscriptionTarget` constructs with `String(...).trim()`. */
  const TARGET_MEMBERS = Object.freeze([
    "event_type",
    "module_id",
    "target_id",
    "target_type",
  ]);

  /**
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One member of a record `hasTextMembers` has already gated.
   *
   * **The gate does the checking and this does the typing, which is why neither is a cast.** The
   * caller has proved every named member is a string before it builds anything; this repeats the
   * check per member so the compiler can follow the same proof, and the fallback is unreachable
   * for any record that passed the gate.
   * @param {unknown} value
   * @returns {string}
   */
  function text(value) {
    return typeof value === "string" ? value : "";
  }

  /**
   * @param {unknown} value
   * @param {readonly string[]} members
   * @returns {boolean}
   */
  function hasTextMembers(value, members) {
    return isResponseRecord(value) && members.every((member) => typeof value[member] === "string");
  }

  /**
   * The subscription row a body carries, or `null` when it carries none.
   *
   * **`null` rather than a fabricated record.** `readSubscription` genuinely returns `null` when the
   * viewer has never followed the target, so absence is a real answer here and inventing an empty
   * row would erase the difference between "no subscription" and "a subscription with blank fields".
   * @param {unknown} value
   * @returns {BrowserNotificationSubscription | null}
   */
  function readSubscription(value) {
    if (!isResponseRecord(value) || !hasTextMembers(value, SUBSCRIPTION_MEMBERS)) {
      return null;
    }

    return {
      created_at: text(value.created_at),
      event_type: text(value.event_type),
      module_id: text(value.module_id),
      notification_subscription_id: text(value.notification_subscription_id),
      status: text(value.status),
      target_id: text(value.target_id),
      target_type: text(value.target_type),
      updated_at: text(value.updated_at),
      user_id: text(value.user_id),
      workspace_id: text(value.workspace_id),
    };
  }

  /**
   * The echoed target a body carries, or `null` when it carries none.
   * @param {unknown} value
   * @returns {BrowserNotificationTarget | null}
   */
  function readTarget(value) {
    if (!isResponseRecord(value) || !hasTextMembers(value, TARGET_MEMBERS)) {
      return null;
    }

    return {
      event_type: text(value.event_type),
      module_id: text(value.module_id),
      target_id: text(value.target_id),
      target_type: text(value.target_type),
    };
  }

  /**
   * Narrow a subscription route body into the result this surface publishes.
   *
   * **Total by construction, because the raw read was total.** Every consumer wrote
   * `result.isFollowing === true`, so a body without the member already meant "not following" and
   * nothing threw. This reproduces that exactly - `isFollowing` is that same comparison - while the
   * two records it carries become checked values instead of unread `unknown`s. **A malformed body
   * still resolves rather than rejecting**, which is the behaviour the toggle depends on.
   * @param {unknown} body
   * @returns {BrowserNotificationSubscriptionResult}
   */
  function readSubscriptionResult(body) {
    const envelope = isResponseRecord(body) ? body : null;
    return {
      isFollowing: envelope ? envelope.isFollowing === true : false,
      subscription: readSubscription(envelope ? envelope.subscription : null),
      target: readTarget(envelope ? envelope.target : null),
    };
  }

  function taskTarget(taskId) {
    return {
      moduleId: "tasks",
      targetType: "task",
      targetId: taskId,
    };
  }

  function noteTarget(noteId) {
    return {
      moduleId: "notes",
      targetType: "note",
      targetId: noteId,
    };
  }

  function targetParams(target) {
    const params = new URLSearchParams({
      moduleId: target.moduleId || target.module_id || "",
      targetType: target.targetType || target.target_type || "",
      targetId: target.targetId || target.target_id || "",
    });
    const eventType = target.eventType || target.event_type || "";

    if (eventType) {
      params.set("eventType", eventType);
    }

    return params;
  }

  /**
   * The viewer's follow state for one target.
   * @param {unknown} target
   * @returns {Promise<BrowserNotificationSubscriptionResult>}
   */
  async function readStatus(target) {
    return readSubscriptionResult(
      await requireApi().getJson(`/api/notifications/subscriptions?${targetParams(target)}`, { cache: "no-store" }),
    );
  }

  /**
   * Follow one target, resolving to the same result shape `readStatus` does.
   * @param {unknown} target
   * @returns {Promise<BrowserNotificationSubscriptionResult>}
   */
  async function follow(target) {
    return readSubscriptionResult(
      await requireApi().postJson("/api/notifications/subscriptions", normalizeTargetPayload(target)),
    );
  }

  /**
   * Stop following one target, resolving to the same result shape `readStatus` does.
   * @param {unknown} target
   * @returns {Promise<BrowserNotificationSubscriptionResult>}
   */
  async function unfollow(target) {
    return readSubscriptionResult(
      await requireApi().deleteJson(`/api/notifications/subscriptions?${targetParams(target)}`),
    );
  }

  function normalizeTargetPayload(target) {
    return {
      eventType: target.eventType || target.event_type || "",
      moduleId: target.moduleId || target.module_id || "",
      targetId: target.targetId || target.target_id || "",
      targetType: target.targetType || target.target_type || "",
    };
  }

  root.notificationSubscriptions = {
    follow,
    noteTarget,
    readStatus,
    taskTarget,
    unfollow,
  };
  global.LongtailForge = root;
})(window);
