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

  async function offer(options = {}) {
    const taskId = taskIdFrom(options);

    if (!taskId || savedResumeNote(options) || capturedTaskIds.has(taskId) || pendingTaskIds.has(taskId)) {
      return { captured: false, reason: "suppressed" };
    }

    pendingTaskIds.add(taskId);
    try {
      const task = await readCurrentTask(taskId);
      if (!task || String(task.resume_note || "").trim()) {
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

  namespace.taskResumeNoteCapture = { offer };
  global.LongtailForge = namespace;
}(window));
