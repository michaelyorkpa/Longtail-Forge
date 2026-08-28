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

  async function readStatus(target) {
    return requireApi().getJson(`/api/notifications/subscriptions?${targetParams(target)}`, { cache: "no-store" });
  }

  async function follow(target) {
    return requireApi().postJson("/api/notifications/subscriptions", normalizeTargetPayload(target));
  }

  async function unfollow(target) {
    return requireApi().deleteJson(`/api/notifications/subscriptions?${targetParams(target)}`);
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
