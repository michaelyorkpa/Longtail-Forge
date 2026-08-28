(function attachTaskResumeNoteCapture(global) {
  const namespace = global.LongtailForge || {};
  const pendingTaskIds = new Set();
  const capturedTaskIds = new Set();

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

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
    const client = namespace?.api;
    if (!client) {
      throw new Error("Task resume note capture requires LongtailForge.api.");
    }
    return client;
  }
  function taskIdFrom(options = {}) {
    return String(options.taskId || options.task?.task_id || "").trim();
  }

  function savedResumeNote(options = {}) {
    return String(options.resumeNote ?? options.task?.resume_note ?? "").trim();
  }

  async function readCurrentTask(taskId) {
    const result = await requireApi().getJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    });
    return result?.task || null;
  }

  function isActiveTask(task) {
    return task && ["open", "in_progress", "blocked"].includes(String(task.status || "").trim());
  }

  function hasBlockedContext(task) {
    return Boolean(task) && (
      String(task.status || "").trim() === "blocked"
      || Boolean(String(task.blocked_reason || "").trim())
    );
  }

  async function consume(options = {}) {
    const taskId = taskIdFrom(options);

    if (!taskId) {
      return { consumed: false, reason: "missing-task" };
    }

    try {
      const task = options.task || await readCurrentTask(taskId);
      if (!isActiveTask(task)) {
        return { consumed: false, reason: "inactive-task", task };
      }
      if (!String(task.resume_note || "").trim()) {
        capturedTaskIds.delete(taskId);
        return { consumed: false, reason: "no-note", task };
      }

      const updated = await requireApi().putJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        resume_note_action: "consume",
      });
      const updatedTask = updated?.task || null;
      capturedTaskIds.delete(taskId);
      options.onConsumed?.(updatedTask);
      return { consumed: true, task: updatedTask };
    } catch (error) {
      options.onError?.(error);
      return { consumed: false, error, reason: "error" };
    }
  }

  async function offer(options = {}) {
    const taskId = taskIdFrom(options);

    if (!taskId) {
      return { captured: false, reason: "suppressed" };
    }
    if (hasBlockedContext(options.task)) {
      return { captured: false, reason: "blocked-task", task: options.task };
    }
    if (savedResumeNote(options) || capturedTaskIds.has(taskId) || pendingTaskIds.has(taskId)) {
      return { captured: false, reason: "suppressed" };
    }

    pendingTaskIds.add(taskId);
    try {
      const task = await readCurrentTask(taskId);
      if (!isActiveTask(task)) {
        return { captured: false, reason: "inactive-task", task };
      }
      if (hasBlockedContext(task)) {
        return { captured: false, reason: "blocked-task", task };
      }
      if (String(task.resume_note || "").trim()) {
        return { captured: false, reason: "existing-note", task };
      }

      const result = await namespace.capturePrompt.open({
        prompt: "Add resume note?",
        label: "Resume note",
        multiline: false,
        confirmLabel: "Yes",
        cancelLabel: "No",
        parent: options.parent || null,
        trigger: options.trigger || null,
      });
      if (!result.confirmed) {
        return { captured: false, reason: "dismissed", task };
      }

      const updated = await requireApi().putJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        resume_note: result.value,
        resume_note_action: "capture",
      });
      capturedTaskIds.add(taskId);
      options.onSaved?.(updated?.task || null);
      return { captured: true, task: updated?.task || null };
    } catch (error) {
      options.onError?.(error);
      return { captured: false, error, reason: "error" };
    } finally {
      pendingTaskIds.delete(taskId);
    }
  }

  namespace.taskResumeNoteCapture = { consume, offer };
  global.LongtailForge = namespace;
}(window));
