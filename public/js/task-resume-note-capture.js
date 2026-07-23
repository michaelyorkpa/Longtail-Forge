(function attachTaskResumeNoteCapture(global) {
  const namespace = global.LongtailForge || {};
  const pendingTaskIds = new Set();
  const capturedTaskIds = new Set();

  function taskIdFrom(options = {}) {
    return String(options.taskId || options.task?.task_id || "").trim();
  }

  function savedResumeNote(options = {}) {
    return String(options.resumeNote ?? options.task?.resume_note ?? "").trim();
  }

  async function readCurrentTask(taskId) {
    const result = await namespace.api.getJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
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

      const updated = await namespace.api.putJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
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

      const updated = await namespace.api.putJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
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
