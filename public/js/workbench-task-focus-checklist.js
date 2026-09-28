(function attachWorkbenchTaskFocusChecklist() {
  const namespace = window.LongtailForge || {};
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusChecklistState} ActiveTaskFocus */
  /** @param {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusChecklistHost} host */
  function create(host) {
    const { requireView, emptyState, safeTaskFocusText, createWorkbenchSectionSummary,
      setWorkbenchDisclosureOpen, handleTaskFocusChecklistChange } = host;
    const TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX = 20;

    /** @param {ActiveTaskFocus | null} active */
    function createTaskFocusChecklistSection(active) {
      const workbenchViewHelpers = requireView();
      const task = active?.task || {};
      const items = taskFocusChecklistItems(task);
      const bodyId = "workbench-task-focus-checklist-body";
      const progress = taskFocusChecklistProgress(task, items);
      const summaryProgress = workbenchViewHelpers.createElement("span", {
        className: "workbench-checklist-summary-progress",
        dataset: { workbenchTaskFocusChecklistSummary: "" },
        attrs: { title: formatTaskFocusChecklistProgress(progress, { truncate: false }) },
        text: formatTaskFocusChecklistProgress(progress),
      });
      const details = workbenchViewHelpers.createElement("details", {
        className: ["workbench-section", "surface-main-panel", "workbench-task-checklist-section"],
        dataset: {
          workbenchTaskFocusChecklist: "",
          workbenchTaskFocusChecklistMount: "",
          workbenchTaskFocusChecklistStructure: "check-only",
        },
      });
      const body = workbenchViewHelpers.createElement("div", {
        attrs: { id: bodyId },
        className: ["workbench-section-body", "workbench-task-checklist-body"],
        children: createTaskFocusChecklistBody(active, items),
      });

      body.addEventListener("change", handleTaskFocusChecklistChange);
      details.append(
        createWorkbenchSectionSummary({
          bodyId,
          subtitle: summaryProgress,
          title: "Checklist",
        }),
        body,
      );
      setWorkbenchDisclosureOpen(details, items.length > 0);
      return details;
    }

    /** @param {ActiveTaskFocus | null} active @param {unknown[]} items */
    function createTaskFocusChecklistBody(active, items) {
      const workbenchViewHelpers = requireView();
      if (active?.isLoading) {
        return [emptyState("Checklist is loading.")];
      }
      if (active?.error) {
        return [emptyState("Checklist could not be loaded.")];
      }

      // The progress line now lives in the always-visible section summary; the body only carries the
      // error copy (when present) and the checklist rows.
      const children = [];

      if (active?.checklistError) {
        children.push(workbenchViewHelpers.createElement("p", {
          className: ["workbench-task-focus-note", "is-error"],
          dataset: { workbenchTaskFocusChecklistError: "" },
          text: active.checklistError,
        }));
      }

      if (items.length === 0) {
        children.push(workbenchViewHelpers.createEmptyState({
          message: "Edit task to add checklist items.",
          title: "No checklist items",
        }));
        return children;
      }

      children.push(workbenchViewHelpers.createElement("div", {
        className: "workbench-task-checklist-list",
        dataset: { workbenchTaskFocusChecklistList: "" },
        children: items.map((item) => createTaskFocusChecklistItem(item, active)),
      }));
      return children;
    }

    /** @param {unknown} item @param {ActiveTaskFocus | null} active */
    function createTaskFocusChecklistItem(item, active) {
      const workbenchViewHelpers = requireView();
      const itemId = String(taskFocusChecklistField(item, "task_checklist_item_id") || "");
      const labelText = safeTaskFocusText(taskFocusChecklistField(item, "label"), "Checklist item");
      const checkbox = workbenchViewHelpers.createElement("input", {
        attrs: {
          "aria-label": `Mark ${labelText} complete`,
          type: "checkbox",
        },
        dataset: { workbenchTaskFocusChecklistToggle: "" },
      });
      checkbox.checked = Boolean(taskFocusChecklistField(item, "is_checked"));
      checkbox.disabled = Boolean(active?.checklistMutationItemId);

      return workbenchViewHelpers.createElement("label", {
        className: ["workbench-task-checklist-item", taskFocusChecklistField(item, "is_checked") ? "is-checked" : ""],
        dataset: {
          taskChecklistItem: itemId,
          workbenchTaskFocusChecklistItem: itemId,
        },
        children: [
          checkbox,
          workbenchViewHelpers.createElement("span", {
            className: "workbench-task-checklist-label",
            text: labelText,
          }),
        ],
      });
    }

    /** @param {{checklistItems?: unknown} | null} [task] @returns {unknown[]} */
    function taskFocusChecklistItems(task = {}) {
      return Array.isArray(task?.checklistItems) ? task.checklistItems : [];
    }

    /** @param {{checklistProgress?: unknown, checklistItems?: unknown} | null} [task] @param {unknown[]} [items] */
    function taskFocusChecklistProgress(task = {}, items = taskFocusChecklistItems(task)) {
      const provided = task?.checklistProgress;
      if (provided) {
        return provided;
      }

      const completed = items.filter((item) => taskFocusChecklistField(item, "is_checked")).length;
      const next = items.find((item) => !taskFocusChecklistField(item, "is_checked"));
      return {
        completed_count: completed,
        next_incomplete_item_label: taskFocusChecklistField(next, "label") || "",
        total_count: items.length,
      };
    }

    /** @param {unknown} [progress] */
    function formatTaskFocusChecklistProgress(progress = {}, { truncate = true } = {}) {
      const total = Number(taskFocusChecklistField(progress, "total_count")) || 0;
      const completed = Number(taskFocusChecklistField(progress, "completed_count")) || 0;
      const rawNextLabel = safeTaskFocusText(taskFocusChecklistField(progress, "next_incomplete_item_label"), "");
      const base = `${completed} / ${total} complete`;
      if (!rawNextLabel) {
        return base;
      }
      const nextLabel = truncate
        ? truncateTaskFocusChecklistLabel(rawNextLabel, TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX)
        : rawNextLabel;
      return `${base}. Next: ${nextLabel}`;
    }

    /** @param {unknown} text @param {number} max */
    function truncateTaskFocusChecklistLabel(text, max) {
      const value = String(text || "");
      return value.length > max ? `${value.slice(0, max)}…` : value;
    }

    /**
     * Tasks' checklistRowToAppValue produces id/label/check state and taskChecklistProgress
     * produces counts and the next label. The shared detail reader leaves both opaque.
     * These local projections prove no wire schema: optional reads box primitives and
     * preserve inherited members, getters and their receiver. Required reads retain the
     * existing non-null precondition, without validating unused response members.
     * @param {unknown} value @param {string} key @returns {unknown}
     */
    function taskFocusChecklistField(value, key) {
      return value == null ? undefined : Reflect.get(Object(value), key, value);
    }
    return { render: createTaskFocusChecklistSection };
  }
  namespace.workbenchTaskFocusChecklist = Object.freeze({ create });
  window.LongtailForge = namespace;
})();
