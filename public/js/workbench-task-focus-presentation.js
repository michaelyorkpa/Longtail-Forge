(function attachWorkbenchTaskFocusPresentation() {
  const namespace = window.LongtailForge || {};
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusPresentationState} ActiveTaskFocus */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusDisplayTimer} TaskFocusDisplayTimer */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusRelatedItem} TaskFocusRelatedItem */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusRelatedGroup} TaskFocusRelatedGroup */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTaskRecord} BrowserTaskRecord */
  /** @typedef {Partial<{[K in keyof Pick<BrowserTaskRecord, "status" | "priority" | "due_date" | "due_time" | "client_name" | "project_name">]: unknown}> & {directTags?: unknown, direct_tags?: unknown}} TaskFocusSummaryTask */
  /** @typedef {Partial<Pick<ActiveTaskFocus, "status" | "priority" | "contextLabel" | "dueAt">>} TaskFocusSummaryFallback */

  /** @param {import("../../src/types/browser-contracts.js").BrowserWorkbenchTaskFocusPresentationHost} host */
  function create(host) {
    const { mounts, requireView, requireWorkbenchElement, resolvedWorkbenchViewState, setWorkbenchInspectorCopy, emptyState, safeTaskFocusText, safeRelatedContextText, relatedContextSourceLabel, workbenchDetailField, badge, formatToken, formatCandidateDate, formatDuration, readElapsedSeconds, actionButton, createWorkbenchSectionSummary, setWorkbenchDisclosureOpen, createTaskFocusChecklistSection, currentTaskFocusTimer, taskFocusTimerEligibility, taskTimerSurfaceAvailable, taskFocusLifecycleDisabledReason, openFocusedTaskEditor, completeFocusedTask, blockFocusedTask, resumeFocusedTask, saveFocusedTaskTimer, finalizeFocusedTaskTimer, resetFocusedTaskTimer, openTaskFocusRelatedContextItem, taskFocusContextLabel, taskFocusRelatedContextState, taskFocusRelatedContextGroups } = host;
    const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";

    /** @param {ActiveTaskFocus} active */
    function createTaskFocusSummary(active) {
      const workbenchViewHelpers = requireView();
      const task = active?.task || {};
      const title = taskFocusTitle(active);
      const meta = taskFocusContextLabel(task, active);
      const statusTextElement = active.isLoading || active.error
        ? workbenchViewHelpers.createElement("p", {
            className: ["workbench-task-focus-note", active.error ? "is-error" : ""],
            text: active.error || "Loading latest task details...",
          })
        : taskFocusLeadText(task, active);

      return workbenchViewHelpers.createElement("article", {
        className: "workbench-task-focus-summary",
        dataset: { workbenchTaskFocusSummary: "" },
        children: [
          workbenchViewHelpers.createElement("header", {
            className: "workbench-task-focus-summary-header",
            children: [
              workbenchViewHelpers.createElement("div", {
                className: "workbench-task-focus-heading-copy",
                children: [
                  workbenchViewHelpers.createElement("span", {
                    className: "workbench-eyebrow",
                    text: "Task Focus",
                  }),
                  workbenchViewHelpers.createElement("h2", {
                    id: "workbench-task-focus-heading",
                    text: title,
                  }),
                  meta
                    ? workbenchViewHelpers.createElement("p", {
                        className: "workbench-task-focus-meta",
                        text: meta,
                      })
                    : null,
                ],
              }),
              workbenchViewHelpers.createDetailBadgeRow({
                badges: taskFocusBadges(task, active),
                className: "workbench-task-focus-badges",
              }),
            ],
          }),
          statusTextElement,
        ].filter(Boolean),
      });
    }

    /** @param {NonNullable<ActiveTaskFocus["task"]>} task @param {ActiveTaskFocus} _active */
    function taskFocusLeadText(task, _active) {
      const workbenchViewHelpers = requireView();
      const text = safeTaskFocusText(
        task.next_action || task.resume_note || task.description || "",
        "Ready to work.",
      );

      return workbenchViewHelpers.createElement("p", {
        className: "workbench-task-focus-note",
        text,
      });
    }

    /** @param {ActiveTaskFocus} active */
    function createTaskDetailsSection(active) {
      const workbenchViewHelpers = requireView();
      const details = workbenchViewHelpers.createElement("details", {
        className: ["workbench-section", "surface-main-panel", "workbench-task-details-section"],
        dataset: {
          workbenchTaskDetails: "",
          workbenchTaskDetailsReadonly: "true",
        },
      });
      const bodyId = "workbench-task-details-body";
      const body = workbenchViewHelpers.createElement("div", {
        attrs: { id: bodyId },
        className: ["workbench-section-body", "workbench-task-details-body"],
        children: createTaskDetailFields(active),
      });

      details.append(
        createWorkbenchSectionSummary({
          bodyId,
          title: "Task Details",
        }),
        body,
      );
      setWorkbenchDisclosureOpen(details, false);
      return details;
    }

    /** @param {ActiveTaskFocus | null} active */
    function createTaskDetailFields(active) {
      const workbenchViewHelpers = requireView();
      const task = active?.task || {};
      if (active?.isLoading) {
        return [emptyState("Task details are loading.")];
      }
      if (active?.error) {
        return [emptyState(active.error)];
      }

      const status = String(task.status || active?.status || "open").trim();
      const fields = [
        ["Title", taskFocusTitle(active), "title"],
        ["Status", formatToken(status || "open"), "status"],
        ["Priority", formatToken(task.priority || active?.priority || "normal"), "priority"],
        ["Due", taskFocusDueText(task, active), "due"],
        ["Assignees", taskFocusAssigneesText(task), "assignees"],
        ["Client", safeTaskFocusText(task.client_name, "No client"), "client"],
        ["Project", safeTaskFocusText(task.project_name, "No project"), "project"],
        status === "blocked"
          ? ["Blocked reason", safeTaskFocusText(task.blocked_reason, "No blocked reason recorded."), "blocked-reason"]
          : null,
        ["Description", safeTaskFocusText(task.description, "No description."), "description", true],
      ].filter((field) => field !== null);

      return [
        workbenchViewHelpers.createElement("div", {
          className: "workbench-task-detail-grid",
          children: fields.map(([label, value, key, multiline]) => createTaskDetailField(label, value, key, { multiline })),
        }),
      ];
    }

    /** @param {unknown} label @param {unknown} value @param {unknown} key @param {{multiline?: unknown}} [options] */
    function createTaskDetailField(label, value, key, options = {}) {
      const workbenchViewHelpers = requireView();
      return workbenchViewHelpers.createElement("article", {
        className: ["workbench-task-detail-field", options.multiline ? "is-multiline" : ""],
        dataset: { workbenchTaskDetailField: key },
        children: [
          workbenchViewHelpers.createElement("h3", { text: label }),
          workbenchViewHelpers.createElement("p", { text: value }),
        ],
      });
    }

    /** @param {TaskFocusSummaryTask} [task] @param {TaskFocusSummaryFallback | null} [active] */
    function taskFocusBadges(task = {}, active = host.state.activeTaskFocus) {
      const dueText = taskFocusDueText(task, active, { empty: "" });
      return [
        badge(formatToken(task.status || active?.status || "open"), task.status || active?.status || "open"),
        badge(formatToken(task.priority || active?.priority || "normal"), task.priority || active?.priority || "normal"),
        dueText ? badge(`Due ${dueText}`, "due") : null,
        ...taskFocusTagBadges(task),
      ].filter(Boolean);
    }

    /** @param {ActiveTaskFocus | null} [active] */
    function taskFocusTitle(active = host.state.activeTaskFocus) {
      return safeTaskFocusText(active?.task?.title || active?.title, "Focused task");
    }

    /** @param {TaskFocusSummaryTask} [task] @param {TaskFocusSummaryFallback | null} [active] @param {{empty?: string}} [options] */
    function taskFocusDueText(task = {}, active = host.state.activeTaskFocus, options = {}) {
      const fallback = options.empty === undefined ? "No due date" : options.empty;
      const dueDate = String(task.due_date || "").trim();
      const dueTime = String(task.due_time || "").trim();

      if (dueDate && dueTime) {
        return `${dueDate} ${dueTime}`;
      }
      if (dueDate) {
        return dueDate;
      }
      if (active?.dueAt) {
        return formatCandidateDate(active.dueAt);
      }
      return fallback;
    }

    /** The member name comes from BrowserTaskRecord; focus patches do not establish its value.
     * @param {Partial<{[K in keyof Pick<BrowserTaskRecord, "assignees">]: unknown}>} [task]
     */
    function taskFocusAssigneesText(task = {}) {
      const assignees = Array.isArray(task.assignees) ? task.assignees : [];
      const labels = assignees
        .map((/** @type {unknown} */ assignee) => safeTaskFocusText(workbenchDetailField(assignee, "displayName") || workbenchDetailField(assignee, "username") || "", ""))
        .filter(Boolean);

      return labels.length > 0 ? labels.join(", ") : "Unassigned";
    }

    /** @param {TaskFocusSummaryTask} [task] */
    function taskFocusTagBadges(task = {}) {
      const tags = Array.isArray(task.directTags) && task.directTags.length > 0
        ? task.directTags
        : Array.isArray(task.direct_tags)
          ? task.direct_tags
          : [];

      return tags
        .map((/** @type {unknown} */ tag) => {
          if (tag === null || tag === undefined) throw new TypeError("Task Focus tag is unavailable.");
          return safeTaskFocusText(Reflect.get(Object(tag), "name", tag) || Reflect.get(Object(tag), "slug", tag) || "", "");
        })
        .filter(Boolean)
        .map((label) => badge(label, "tag"));
    }

    /** @param {ActiveTaskFocus | null} active */
    function createTaskFocusTimerSection(active) {
      const workbenchViewHelpers = requireView();
      const timer = currentTaskFocusTimer(active);
      const bodyId = "workbench-task-focus-timer-body";
      const count = workbenchViewHelpers.createElement("span", {
        className: "workbench-section-count",
        dataset: { workbenchTaskFocusTimerState: "" },
        text: taskFocusTimerSummaryText(active, timer),
      });
      const details = workbenchViewHelpers.createElement("details", {
        className: ["workbench-section", "surface-main-panel", "workbench-task-timer-section"],
        dataset: {
          workbenchTaskFocusTimer: "",
          workbenchTaskFocusTimerDefaultOpen: "true",
          workbenchTaskFocusTimerLinked: "task",
        },
      });
      const body = workbenchViewHelpers.createElement("div", {
        attrs: { id: bodyId },
        className: ["workbench-section-body", "workbench-task-timer-body"],
        children: createTaskFocusTimerBody(active, timer),
      });

      details.append(
        createWorkbenchSectionSummary({
          bodyId,
          count,
          title: "Task Timer",
        }),
        body,
      );
      setWorkbenchDisclosureOpen(details, true);
      return details;
    }

    /** @param {ActiveTaskFocus | null} active @param {TaskFocusDisplayTimer | null} timer */
    function createTaskFocusTimerBody(active, timer) {
      if (active?.isLoading) {
        return [emptyState("Task timer is loading.")];
      }
      if (active?.error) {
        return [emptyState("Task timer could not be loaded.")];
      }

      const eligibility = taskFocusTimerEligibility(active);

      return [
        createTaskFocusTimerControls(active, timer, eligibility),
      ];
    }

    /** @param {ActiveTaskFocus | null} active @param {TaskFocusDisplayTimer | null} timer @param {ReturnType<typeof taskFocusTimerEligibility>} eligibility */
    function createTaskFocusTimerControls(active, timer, eligibility) {
      const workbenchViewHelpers = requireView();
      const duration = workbenchViewHelpers.createElement("strong", {
        className: "workbench-duration",
        dataset: { workbenchTaskFocusTimerDisplay: "" },
        text: formatDuration(readElapsedSeconds(timer)),
      });
      if (timer?.active_timer_id) {
        duration.dataset.workbenchDuration = timer.active_timer_id;
      }

      const running = timer?.timer_status === "running";
      const startButton = createTaskFocusTimerButton({
        action: "start",
        disabled: !eligibility.eligible || running,
        label: "Start",
        onClick: () => saveFocusedTaskTimer("running"),
        taskId: active?.taskId || "",
      });
      const pauseButton = createTaskFocusTimerButton({
        action: "pause",
        disabled: !eligibility.eligible || !running,
        label: "Pause",
        onClick: () => saveFocusedTaskTimer("paused"),
        taskId: active?.taskId || "",
      });
      const saveButton = createTaskFocusTimerButton({
        action: "save",
        disabled: !eligibility.eligible || !timer,
        label: "Save Time",
        onClick: finalizeFocusedTaskTimer,
        taskId: active?.taskId || "",
      });
      const resetButton = createTaskFocusTimerButton({
        action: "reset",
        danger: true,
        disabled: !timer,
        label: "Reset",
        onClick: resetFocusedTaskTimer,
        taskId: active?.taskId || "",
      });

      return workbenchViewHelpers.createElement("div", {
        className: "workbench-task-focus-timer-control-box",
        dataset: {
          taskId: active?.taskId || "",
          workbenchTaskFocusTimerControls: "",
        },
        children: [
          workbenchViewHelpers.createElement("p", {
            className: "workbench-task-focus-timer-status",
            dataset: { workbenchTaskFocusTimerStatus: "" },
            text: taskFocusTimerStatusText(active, timer, eligibility),
          }),
          workbenchViewHelpers.createElement("div", {
            className: ["task-timer-controls", "surface-dense-actions", "workbench-task-focus-timer-controls"],
            children: [duration, startButton, pauseButton, saveButton, resetButton],
          }),
        ],
      });
    }

    /** The four control literals supply these fields; actionButton installs the listener unchanged.
     * @param {{action: string, danger?: boolean, disabled?: boolean, label: string, onClick: EventListener, taskId: unknown}} options
     */
    function createTaskFocusTimerButton({ action, danger = false, disabled = false, label, onClick, taskId }) {
      const button = actionButton(label, onClick, { danger });
      button.disabled = Boolean(disabled);
      button.dataset.taskId = `${taskId || ""}`;
      button.dataset.workbenchTaskFocusTimerAction = action;
      return button;
    }

    /** @param {ActiveTaskFocus | null} active @param {TaskFocusDisplayTimer | null} timer @param {ReturnType<typeof taskFocusTimerEligibility>} [eligibility] */
    function taskFocusTimerStatusText(active, timer, eligibility = taskFocusTimerEligibility(active)) {
      if (!eligibility.eligible) {
        return eligibility.reason;
      }
      if (timer?.timer_status === "running") {
        return "Running.";
      }
      if (timer) {
        return "Paused.";
      }
      return "No active timer.";
    }

    /** @param {ActiveTaskFocus | null} active @param {TaskFocusDisplayTimer | null} timer */
    function taskFocusTimerSummaryText(active, timer) {
      if (active?.isLoading) {
        return "Loading";
      }
      if (active?.error) {
        return "Unavailable";
      }
      if (timer?.timer_status === "running") {
        return "Running";
      }
      if (timer) {
        return "Paused";
      }
      return "Ready";
    }





    /** @param {TaskFocusRelatedGroup} [group] */
    function createTaskFocusRelatedContextGroup(group = {}) {
      const workbenchViewHelpers = requireView();
      const count = Number.parseInt(`${group.count}`, 10) || (group.items || []).length;
      const header = workbenchViewHelpers.createElement("div", {
        className: "workbench-inspector-group-heading",
        children: [
          workbenchViewHelpers.createElement("h3", {
            text: safeRelatedContextText(group.label, "Related context"),
          }),
          workbenchViewHelpers.createElement("span", {
            className: "workbench-count",
            text: String(count),
          }),
        ],
      });
      const list = workbenchViewHelpers.createElement("div", {
        className: "workbench-inspector-group-list",
        children: (group.items || []).map((item) => createTaskFocusRelatedContextItem(item)),
      });

      return workbenchViewHelpers.createElement("section", {
        className: "workbench-inspector-group",
        dataset: {
          workbenchRelatedContextGroup: group.id || group.reason || "related",
        },
        children: [header, list],
      });
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function createTaskFocusRelatedContextItem(item = {}) {
      const workbenchViewHelpers = requireView();
      const title = relatedContextTitle(item);
      const context = relatedContextContextLabel(item);
      const canOpen = relatedContextCanOpen(item);
      const titleButton = workbenchViewHelpers.createElement("button", {
        className: "workbench-inspector-title",
        attrs: {
          "aria-label": `${relatedContextActionLabel(item)}: ${title}`,
          type: "button",
        },
        dataset: {
          workbenchRelatedContextAction: item.action?.moduleActionId || "",
          workbenchRelatedContextOpen: item.recordType || item.moduleId || "related",
          workbenchRelatedContextRecord: item.recordId || "",
        },
        text: title,
      });
      const badges = relatedContextBadges(item);

      titleButton.disabled = !canOpen;
      titleButton.addEventListener("click", (event) => openTaskFocusRelatedContextItem(item, event.currentTarget));

      return workbenchViewHelpers.createElement("article", {
        className: "workbench-inspector-item",
        dataset: {
          workbenchInspectorItem: "",
          workbenchRelatedContextItem: "",
          workbenchRelatedContextReason: item.reason || "",
          workbenchRelatedContextSource: item.moduleId || "",
        },
        children: [
          titleButton,
          workbenchViewHelpers.createElement("p", {
            className: "workbench-inspector-context",
            text: context,
          }),
          badges.length > 0
            ? workbenchViewHelpers.createElement("div", {
                className: "workbench-inspector-badges",
                children: badges,
              })
            : null,
        ].filter(Boolean),
      });
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function relatedContextTitle(item = {}) {
      return safeRelatedContextText(item.title, `${formatToken(item.recordType || item.moduleId || "Related")} context`);
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function relatedContextContextLabel(item = {}) {
      const parts = [
        relatedContextSourceLabel(item),
        safeRelatedContextText(item.reasonLabel, ""),
        safeRelatedContextText(item.contextLabel, ""),
      ].filter(Boolean);
      const uniqueParts = [...new Set(parts)];

      return uniqueParts.join(" - ") || "Related context";
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function relatedContextBadges(item = {}) {
      return (Array.isArray(item.badges) ? item.badges : [])
        .map((itemBadge) => {
          const label = safeRelatedContextText(workbenchDetailField(itemBadge, "label"), "");
          if (!label) {
            return null;
          }
          return badge(label, workbenchDetailField(itemBadge, "type") || workbenchDetailField(itemBadge, "slug") || "related");
        })
        .filter(Boolean)
        .slice(0, 4);
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function relatedContextCanOpen(item = {}) {
      const action = item.action || {};
      return Boolean((action.type === "module-action" && action.moduleActionId) || action.fallbackUrl);
    }

    /** @param {TaskFocusRelatedItem} [item] */
    function relatedContextActionLabel(item = {}) {
      const actionId = item.action?.moduleActionId || "";
      if (actionId === "files.preview") {
        return "Preview file";
      }
      if (actionId === "tasks.edit") {
        return "Open task";
      }
      if (actionId === "notes.edit") {
        return "Open note";
      }
      if (actionId === "notes.view") {
        return "Open note";
      }
      if (actionId === "lists.edit") {
        return "Open list";
      }
      return item.action?.fallbackUrl ? "Open related context" : "Review related context";
    }

    /** @param {ActiveTaskFocus | null | undefined} active */
    function createTaskFocusActionStrip(active) {
      const workbenchViewHelpers = requireView();
      const isBlocked = String(active?.task?.status || "").trim() === "blocked";
      const blockOrResumeAction = isBlocked
        ? {
            disabledReason: taskFocusLifecycleDisabledReason("resume", active),
            icon: "start",
            id: "resume",
            label: "Resume task",
            onClick: resumeFocusedTask,
          }
        : {
            disabledReason: taskFocusLifecycleDisabledReason("block", active),
            icon: "pause",
            id: "block",
            label: "Block task",
            onClick: blockFocusedTask,
          };
      const actions = [
        createTaskFocusActionButton({
          active,
          icon: "edit",
          id: "edit",
          label: "Edit task",
          onClick: openFocusedTaskEditor,
        }),
        createTaskFocusActionButton({
          active,
          disabledReason: taskFocusLifecycleDisabledReason("complete", active),
          icon: "complete",
          id: "complete",
          label: "Complete task",
          onClick: completeFocusedTask,
        }),
        createTaskFocusActionButton({
          active,
          ...blockOrResumeAction,
        }),
      ];

      return workbenchViewHelpers.createDetailActionStrip({
        actions,
        ariaLabel: "Task Focus actions",
        className: "workbench-task-focus-action-strip",
      });
    }

    /**
     * The strip supplies identity and availability; shared button options own presentation and events.
     * @param {Pick<import("../../src/types/browser-contracts.js").BrowserViewActionButtonOptions, "icon" | "label" | "onClick"> & {active?: Pick<ActiveTaskFocus, "taskId"> | null, disabledReason?: string, id: string}} options
     */
    function createTaskFocusActionButton({ active, disabledReason = "", icon, id, label, onClick }) {
      const workbenchViewHelpers = requireView();
      const taskId = active?.taskId || "";
      const disabled = !taskId || Boolean(disabledReason);
      const title = disabledReason || (!taskId ? "Choose a task before using this action." : label);
      const button = workbenchViewHelpers.createActionButton({
        disabled,
        icon,
        iconOnly: true,
        label,
        onClick,
        role: "secondary",
        text: "",
        title,
      });

      button.dataset.workbenchTaskFocusAction = id;
      button.dataset.workbenchTaskFocusIconOnly = "true";
      button.dataset.taskId = `${taskId}`;
      if (disabledReason) {
        button.dataset.workbenchTaskFocusDisabledReason = disabledReason;
      }
      return button;
    }

    function createTaskFocusPanel() {
      const workbenchViewHelpers = requireView();
      mounts.taskFocusActionMount = workbenchViewHelpers.createElement("div", {
        className: "workbench-task-focus-action-mount",
        dataset: { workbenchTaskFocusActions: "" },
      });
      mounts.taskFocusBody = workbenchViewHelpers.createElement("div", {
        className: "workbench-task-focus-body",
        dataset: { workbenchTaskFocusBody: "" },
      });
      mounts.taskFocusPanelElement = workbenchViewHelpers.createElement("section", {
        className: ["workbench-task-focus-panel", "surface-main-panel"],
        attrs: { "aria-labelledby": "workbench-task-focus-heading" },
        dataset: { workbenchTaskFocusPanel: "" },
        hidden: true,
        children: [
          mounts.taskFocusActionMount,
          mounts.taskFocusBody,
        ],
      });

      return mounts.taskFocusPanelElement;
    }

    function renderTaskFocusSurface() {
      if (!mounts.taskFocusBody || !mounts.taskFocusActionMount) {
        return;
      }

      const isTaskFocus = resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS;
      const active = isTaskFocus ? host.state.activeTaskFocus : null;

      mounts.taskFocusActionMount.hidden = !isTaskFocus;
      mounts.taskFocusBody.hidden = !isTaskFocus;
      mounts.taskFocusActionMount.setAttribute("aria-hidden", isTaskFocus ? "false" : "true");
      mounts.taskFocusBody.setAttribute("aria-hidden", isTaskFocus ? "false" : "true");
      mounts.taskFocusActionMount.replaceChildren();
      mounts.taskFocusBody.replaceChildren();

      if (!isTaskFocus || !active) {
        return;
      }

      mounts.taskFocusActionMount.appendChild(createTaskFocusActionStrip(active));
      const sections = [
        createTaskFocusSummary(active),
        createTaskDetailsSection(active),
        createTaskFocusChecklistSection(active),
      ];
      if (taskTimerSurfaceAvailable()) {
        sections.push(createTaskFocusTimerSection(active));
      }
      mounts.taskFocusBody.append(...sections);
    }

    function renderTaskFocusInspector() {
      syncTaskFocusInspectorCollapseState(host.taskFocusInspectorCollapsed, { enableCollapse: true });
      setWorkbenchInspectorCopy("Task context", "Related work for the focused task.");
      const context = taskFocusRelatedContextState();
      const groups = taskFocusRelatedContextGroups(context);
      const items = groups.flatMap((group) => group.items || []);
      requireWorkbenchElement(mounts.workbenchInspectorCountText).textContent = String(items.length);
      requireWorkbenchElement(mounts.workbenchInspectorList).replaceChildren();

      if (host.taskFocusInspectorCollapsed) {
        return;
      }

      if (host.state.activeTaskFocus?.error) {
        requireWorkbenchElement(mounts.workbenchInspectorList).appendChild(emptyState("Task context is unavailable while task details cannot be loaded."));
        return;
      }

      if (context.isLoading) {
        requireWorkbenchElement(mounts.workbenchInspectorList).appendChild(emptyState("Loading related task context..."));
        return;
      }

      if (context.error) {
        requireWorkbenchElement(mounts.workbenchInspectorList).appendChild(emptyState(context.error));
        return;
      }

      if (items.length === 0) {
        requireWorkbenchElement(mounts.workbenchInspectorList).appendChild(emptyState("No related task context is available yet."));
        return;
      }

      groups.forEach((group) => {
        if ((group.items || []).length > 0) {
          requireWorkbenchElement(mounts.workbenchInspectorList).appendChild(createTaskFocusRelatedContextGroup(group));
        }
      });
    }

    /** @param {boolean} collapsed @param {{enableCollapse?: unknown}} [options] */
    function syncTaskFocusInspectorCollapseState(collapsed, options = {}) {
      const enableCollapse = Boolean(options.enableCollapse);

      if (mounts.workbenchInspectorElement) {
        mounts.workbenchInspectorElement.dataset.workbenchInspectorTaskFocus = enableCollapse ? "true" : "false";
        mounts.workbenchInspectorElement.dataset.workbenchInspectorCollapsed = enableCollapse && collapsed ? "true" : "false";
      }
      if (mounts.workbenchInspectorList) {
        mounts.workbenchInspectorList.hidden = enableCollapse && collapsed;
      }
      if (!mounts.workbenchInspectorCollapseButton) {
        return;
      }

      mounts.workbenchInspectorCollapseButton.hidden = !enableCollapse;
      mounts.workbenchInspectorCollapseButton.disabled = !enableCollapse;
      mounts.workbenchInspectorCollapseButton.setAttribute("aria-expanded", enableCollapse && !collapsed ? "true" : "false");
      mounts.workbenchInspectorCollapseButton.setAttribute("aria-controls", "workbench-inspector-related-context-list");
      mounts.workbenchInspectorCollapseButton.setAttribute(
        "aria-label",
        collapsed ? "Expand Task Focus Inspector" : "Collapse Task Focus Inspector",
      );
      mounts.workbenchInspectorCollapseButton.title = collapsed ? "Expand Task Focus Inspector" : "Collapse Task Focus Inspector";
    }

    return { createPanel: createTaskFocusPanel, renderSurface: renderTaskFocusSurface,
      renderInspector: renderTaskFocusInspector, syncInspectorCollapse: syncTaskFocusInspectorCollapseState,
      title: taskFocusTitle };
  }
  namespace.workbenchTaskFocusPresentation = Object.freeze({ create });
  window.LongtailForge = namespace;
})();
