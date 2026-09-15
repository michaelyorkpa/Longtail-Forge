(function attachTaskResumeNoteCapture(global) {
  const namespace = global.LongtailForge || {};
  const pendingTaskIds = new Set();
  const capturedTaskIds = new Set();

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserCapturePrompt} BrowserCapturePrompt */

  /**
   * The single-field capture dialog this path cannot ask its question without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.2.6.1` made the read checked. Every page that runs this script
   * loads `shared/capture-prompt.js` ahead of it.
   * @returns {BrowserCapturePrompt}
   */
  function requireCapturePrompt() {
    const capturePrompt = window.LongtailForge?.capturePrompt;
    if (!capturePrompt) {
      throw new Error("Resume-note capture requires LongtailForge.capturePrompt.");
    }
    return capturePrompt;
  }

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
    const apiClient = namespace?.api;
    if (!apiClient) {
      throw new Error("Task resume note capture requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskRecord} BrowserTaskRecord */
  /** @typedef {keyof Pick<BrowserTaskRecord, "task_id" | "resume_note" | "status" | "blocked_reason">} ResumeTaskField */

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isResumeFieldContainer(value) {
    return value !== null && (typeof value === "object" || typeof value === "function");
  }

  /**
   * Options are host input, so inherited channels and their receiver stay intact.
   * Null still fails before the operation's try block; ordinary scalar options have no
   * named channels and reach the same missing-task outcome as before.
   * @param {unknown} value @returns {Record<string, unknown>}
   */
  function readResumeOptions(value) {
    if (value === null || value === undefined) {
      throw new TypeError("Resume-note options must not be null or undefined.");
    }
    return isResumeFieldContainer(value) ? value : {};
  }

  /**
   * Read only the consumed own wire field. Its value stays opaque because these paths
   * deliberately coerce it; this does not promise a complete BrowserTaskRecord.
   * @param {unknown} task @param {ResumeTaskField} field @returns {unknown}
   */
  function resumeTaskField(task, field) {
    return isResumeFieldContainer(task) && Object.hasOwn(task, field) ? task[field] : undefined;
  }

  /**
   * Preserve the original response task and its metadata for callbacks/outcomes.
   * The published readTask reader validates a complete record; requiring that here would
   * replace the existing partial-response handoff with null for unrelated missing fields.
   * @param {unknown} response @returns {unknown}
   */
  function readResumeTaskResponse(response) {
    return isResumeFieldContainer(response) && Object.hasOwn(response, "task") ? response.task || null : null;
  }

  /**
   * Keep optional-call semantics: absent is ignored, noncallable throws at this point,
   * and a callback receives the original options object as its receiver. Its return is
   * still discarded, not awaited; callback errors keep the surrounding operation's handling.
   * @param {Record<string, unknown>} options
   * @param {"onSaved" | "onConsumed" | "onError"} channel @param {unknown} value
   */
  function callResumeChannel(options, channel, value) {
    const callback = options[channel];
    if (callback === null || callback === undefined) return;
    if (typeof callback !== "function") throw new TypeError(`Resume-note ${channel} must be callable.`);
    Reflect.apply(callback, options, [value]);
  }

  /** @param {Record<string, unknown>} [options] */
  function taskIdFrom(options = {}) {
    return String(options.taskId || resumeTaskField(options.task, "task_id") || "").trim();
  }

  /** @param {Record<string, unknown>} [options] */
  function savedResumeNote(options = {}) {
    return String(options.resumeNote ?? resumeTaskField(options.task, "resume_note") ?? "").trim();
  }

  /** @param {string} taskId */
  async function readCurrentTask(taskId) {
    const result = await requireApi().getJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    });
    return readResumeTaskResponse(result);
  }

  /** @param {unknown} task */
  function isActiveTask(task) {
    return task && ["open", "in_progress", "blocked"].includes(String(resumeTaskField(task, "status") || "").trim());
  }

  /** @param {unknown} task */
  function hasBlockedContext(task) {
    return Boolean(task) && (
      String(resumeTaskField(task, "status") || "").trim() === "blocked"
      || Boolean(String(resumeTaskField(task, "blocked_reason") || "").trim())
    );
  }

  /** @param {unknown} [input] */
  async function consume(input = {}) {
    const options = readResumeOptions(input);
    const taskId = taskIdFrom(options);

    if (!taskId) {
      return { consumed: false, reason: "missing-task" };
    }

    try {
      const task = options.task || await readCurrentTask(taskId);
      if (!isActiveTask(task)) {
        return { consumed: false, reason: "inactive-task", task };
      }
      if (!String(resumeTaskField(task, "resume_note") || "").trim()) {
        capturedTaskIds.delete(taskId);
        return { consumed: false, reason: "no-note", task };
      }

      const updated = await requireApi().putJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        resume_note_action: "consume",
      });
      const updatedTask = readResumeTaskResponse(updated);
      capturedTaskIds.delete(taskId);
      callResumeChannel(options, "onConsumed", updatedTask);
      return { consumed: true, task: updatedTask };
    } catch (error) {
      callResumeChannel(options, "onError", error);
      return { consumed: false, error, reason: "error" };
    }
  }

  /** @param {unknown} [input] */
  async function offer(input = {}) {
    const options = readResumeOptions(input);
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
      if (String(resumeTaskField(task, "resume_note") || "").trim()) {
        return { captured: false, reason: "existing-note", task };
      }

      const result = await requireCapturePrompt().open({
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
      callResumeChannel(options, "onSaved", readResumeTaskResponse(updated));
      return { captured: true, task: readResumeTaskResponse(updated) };
    } catch (error) {
      callResumeChannel(options, "onError", error);
      return { captured: false, error, reason: "error" };
    } finally {
      pendingTaskIds.delete(taskId);
    }
  }

  namespace.taskResumeNoteCapture = { consume, offer };
  global.LongtailForge = namespace;
}(window));
