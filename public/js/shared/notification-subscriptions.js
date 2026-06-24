(function attachNotificationSubscriptions(global) {
  const root = global.LongtailForge || {};

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
    return root.api.getJson(`/api/notifications/subscriptions?${targetParams(target)}`, { cache: "no-store" });
  }

  async function follow(target) {
    return root.api.postJson("/api/notifications/subscriptions", normalizeTargetPayload(target));
  }

  async function unfollow(target) {
    return root.api.deleteJson(`/api/notifications/subscriptions?${targetParams(target)}`);
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
