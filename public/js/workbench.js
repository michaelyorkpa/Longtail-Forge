const WORKBENCH_CARD_STATE_KEY = "lf_workbench_cards_v1";
const WORKBENCH_CLIENT_FOCUS_KEY = "lf_workbench_client_focus_v1";
const WORKBENCH_FOCUS_MODE_KEY = "lf_workbench_focus_mode_v1";
const WORKBENCH_PROJECT_FOCUS_KEY = "lf_workbench_project_focus_v1";
const WORKBENCH_TASK_FOCUS_DRIFT_KEY = "lf_workbench_task_focus_drift_v1";
const WORKBENCH_TASK_FOCUS_DRIFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const WORKBENCH_VIEW_STATE_FOCUS_SELECTION = "focus-selection";
const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";
const WORKBENCH_MOBILE_INSPECTOR_MEDIA = "(max-width: 700px)";
const WORKBENCH_WIDE_INSPECTOR_MEDIA = "(min-width: 1100px)";
const PROJECT_FOCUS_MODE_ID = "project-focus";
const DEFAULT_FOCUS_MODE_ID = "pick-up-where-left-off";
const RECOMMENDED_CANDIDATE_LIMIT = 5;
const WORKBENCH_INSPECTOR_LIMIT = 6;
const GUIDED_FOCUS_MODE_IDS = [
  "pick-up-where-left-off",
  "whats-due-next",
  "work-this-week",
  "review-blocked-work",
  PROJECT_FOCUS_MODE_ID,
];
const FOCUS_QUESTION_COPY = {
  "pick-up-where-left-off": {
    description: "Resume a recent work thread without rebuilding context.",
    label: "Pick up where I left off",
  },
  "whats-due-next": {
    description: "Look at overdue work and the next due items.",
    label: "Start with what's due",
  },
  "work-this-week": {
    description: "Stay inside work due during the current week.",
    label: "Work this week",
  },
  "review-blocked-work": {
    description: "Recover work that is blocked or getting stale.",
    label: "Review blocked work",
  },
  [PROJECT_FOCUS_MODE_ID]: {
    description: "Narrow the recommendation to one project context.",
    label: "Focus on a project",
  },
};
const workbenchActionScriptLoads = new Map();
const WORKBENCH_MODULE_ACTION_DEPENDENCIES = {
  "notes.view": [
    { src: "js/shared/notification-subscriptions.js", test: () => window.LongtailForge?.notificationSubscriptions },
    { src: "js/shared/notes-editor.js", test: () => window.LongtailForge?.notesEditor },
    { module: true, src: "js/notes.js", test: () => window.LongtailForge?.notesDialog?.openNoteViewer },
  ],
  "notes.edit": [
    { src: "js/shared/notification-subscriptions.js", test: () => window.LongtailForge?.notificationSubscriptions },
    { src: "js/shared/notes-editor.js", test: () => window.LongtailForge?.notesEditor },
    { module: true, src: "js/notes.js", test: () => window.LongtailForge?.notesDialog?.openNoteEditor },
  ],
  "lists.edit": [
    { src: "js/shared/client-project-options.js", test: () => window.LongtailForge?.clientProjectOptions },
    { module: true, src: "js/lists.js", test: () => window.LongtailForge?.listsDialog?.openListEditor },
  ],
  "tasks.add": [
    { src: "js/shared/capture-prompt.js", test: () => window.LongtailForge?.capturePrompt },
    { src: "js/task-resume-note-capture.js", test: () => window.LongtailForge?.taskResumeNoteCapture },
    { src: "js/task-dialog.js", test: () => window.LongtailForge?.tasksDialog?.openTaskEditor },
  ],
  "tasks.edit": [
    { src: "js/shared/capture-prompt.js", test: () => window.LongtailForge?.capturePrompt },
    { src: "js/task-resume-note-capture.js", test: () => window.LongtailForge?.taskResumeNoteCapture },
    { src: "js/task-dialog.js", test: () => window.LongtailForge?.tasksDialog?.openTaskEditor },
  ],
  "time-entries.add": [
    { src: "js/time-entry-dialog.js", test: () => window.LongtailForge?.timeEntryDialog },
  ],
  "time-entries.edit": [
    { src: "js/time-entry-dialog.js", test: () => window.LongtailForge?.timeEntryDialog },
  ],
  "clients.add": [
    { src: "js/clients-projects.js", test: () => window.LongtailForge?.clientProjectDialog },
  ],
  "clients.edit": [
    { src: "js/clients-projects.js", test: () => window.LongtailForge?.clientProjectDialog },
  ],
  "projects.add": [
    { src: "js/clients-projects.js", test: () => window.LongtailForge?.clientProjectDialog },
  ],
  "projects.edit": [
    { src: "js/clients-projects.js", test: () => window.LongtailForge?.clientProjectDialog },
  ],
};
const workbenchViewHelpers = window.LongtailForge.view;
const api = window.LongtailForge.api;
const modal = window.LongtailForge.modal;
const workbenchHost = document.querySelector("[data-workbench-host]");

let focusModeList = null;
let clientFocusControl = null;
let clientFocusInput = null;
let projectFocusControl = null;
let projectFocusInput = null;
let focusPanelElement = null;
let calendarWeekLinkElement = null;
let recommendedActionBody = null;
let recommendedCycleControls = null;
let recommendedCycleNextButton = null;
let recommendedCyclePreviousButton = null;
let recommendedActionPanelElement = null;
let secondaryWorkbenchPanelElement = null;
let statusText = null;
let taskFocusActionMount = null;
let taskFocusBody = null;
let taskFocusPanelElement = null;
let changeFocusButton = null;
let workbenchInspectorBackdrop = null;
let workbenchInspectorCollapseButton = null;
let workbenchInspectorController = null;
let workbenchInspectorCountText = null;
let workbenchInspectorCloseButton = null;
let workbenchInspectorElement = null;
let workbenchInspectorHeadingText = null;
let workbenchInspectorHelperText = null;
let workbenchInspectorList = null;
let workbenchInspectorMobileQuery = null;
let workbenchInspectorOpenButton = null;
let workbenchInspectorWideQuery = null;
let taskFocusInspectorCollapsed = false;
let timerSectionElement = null;
let timerSectionUserToggled = false;
let timerCountText = null;
let timerList = null;

let state = {
  clients: [],
  currentUserId: "",
  focusCandidates: [],
  focusContext: null,
  focusModeId: DEFAULT_FOCUS_MODE_ID,
  focusModes: [],
  modules: {},
  registry: {
    workbenchCards: [],
    timerSources: [],
    workItemSources: [],
  },
  activeTaskFocus: null,
  recommendedCandidateIndex: 0,
  selectedClientId: "",
  selectedProjectId: "",
  taskOptions: { projects: [] },
  timers: [],
  viewState: WORKBENCH_VIEW_STATE_FOCUS_SELECTION,
  workCandidates: [],
  workspaceType: "business",
};
let tickIntervalId = null;
let pendingActivatedTimerKey = "";
let taskFocusExitCommitted = false;
const recurrenceContinuityTrackers = new Map();
let transientStatus = {
  isError: false,
  message: "",
};

const workbenchCardRenderers = {
  "active-work-timers": () => {
    renderTimers();
  },
};
const workbenchCardDataLoaders = {
  "active-work-timers": loadTimerCardData,
  "task-workbench-items": loadTaskOptionsData,
};

buildWorkbenchHost();
bindWorkbenchEvents();
installTaskFocusExitGuard();
window.LongtailForge.quickActionRefresh?.subscribe({
  actionIds: ["time-tracking.timer.create"],
  onRefresh: refreshWorkbenchTimers,
  recordTypes: ["active_timer"],
});
window.addEventListener("longtailforge:workspace-context-updated", () => {
  updateCalendarWeekLinkVisibility();
});
loadWorkbench();

function buildWorkbenchHost() {
  if (!workbenchHost || !workbenchViewHelpers) {
    return;
  }

  workbenchInspectorOpenButton = workbenchViewHelpers.createActionButton({
    className: "workbench-inspector-open-button",
    icon: "detective-hat",
    iconOnly: true,
    label: "Open Inspector",
    role: "utility",
    text: "",
    title: "Open Inspector",
  });
  changeFocusButton = workbenchViewHelpers.createActionButton({
    className: "workbench-change-focus-button",
    disabled: true,
    label: "Change Focus",
    onClick: changeFocus,
    role: "secondary",
  });

  const header = workbenchViewHelpers.createPageHeader({
    actions: [workbenchInspectorOpenButton, changeFocusButton],
    title: "Workbench",
  });
  const headerBody = header.querySelector(".view-page-header-body");

  statusText = workbenchViewHelpers.createStatusMessage({
    className: "workbench-header-status",
    hidden: true,
  });
  headerBody?.appendChild(statusText);

  workbenchHost.replaceChildren(
    header,
    createWorkbenchShell(),
  );
  initializeWorkbenchInspectorSlideOut();
}

function createWorkbenchShell() {
  workbenchInspectorBackdrop = workbenchViewHelpers.createElement("div", {
    className: "view-slideout-sidebar-backdrop",
    attrs: {
      "aria-hidden": "true",
      "data-workbench-inspector-backdrop": "",
    },
    hidden: true,
  });
  return workbenchViewHelpers.createElement("div", {
    className: "workbench-shell",
    children: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-main-column",
        children: [
          createTaskFocusPanel(),
          createGuidedFocusPanel(),
          createRecommendedActionPanel(),
          createSecondaryWorkbenchPanel(),
        ],
      }),
      workbenchInspectorBackdrop,
      createWorkbenchInspectorPanel(),
    ],
  });
}

function createWorkbenchInspectorPanel() {
  workbenchInspectorCloseButton = workbenchViewHelpers.createActionButton({
    className: "workbench-inspector-close-button",
    icon: "close",
    iconOnly: true,
    label: "Close Inspector",
    role: "utility",
    text: "",
    title: "Close Inspector",
  });
  workbenchInspectorCollapseButton = workbenchViewHelpers.createActionButton({
    className: "workbench-inspector-collapse-button",
    icon: "down",
    iconOnly: true,
    label: "Collapse Task Focus Inspector",
    onClick: toggleTaskFocusInspectorCollapse,
    text: "",
    title: "Collapse Task Focus Inspector",
  });
  workbenchInspectorCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchInspectorCount: "" },
    text: "0",
  });
  workbenchInspectorHeadingText = workbenchViewHelpers.createElement("h2", {
    id: "workbench-inspector-heading",
    text: "More in this focus",
  });
  workbenchInspectorHelperText = workbenchViewHelpers.createElement("p", {
    text: "Other work matching the selected focus. Choose one to focus it.",
  });
  workbenchInspectorList = workbenchViewHelpers.createElement("div", {
    className: "workbench-inspector-list",
    attrs: { id: "workbench-inspector-related-context-list" },
    dataset: { workbenchInspectorList: "" },
  });

  workbenchInspectorElement = workbenchViewHelpers.createElement("aside", {
    id: "workbench-inspector",
    className: ["workbench-inspector", "surface-main-panel"],
    attrs: {
      "aria-labelledby": "workbench-inspector-heading",
    },
    dataset: { workbenchInspector: "" },
    children: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-panel-heading workbench-inspector-heading",
        children: [
          workbenchViewHelpers.createElement("div", {
            className: "workbench-inspector-heading-copy",
            children: [
              workbenchViewHelpers.createElement("span", {
                className: "workbench-eyebrow",
                text: "Inspector",
              }),
              workbenchInspectorHeadingText,
            ],
          }),
          workbenchInspectorCloseButton,
          workbenchInspectorCollapseButton,
          workbenchInspectorCountText,
          workbenchInspectorHelperText,
        ],
      }),
      workbenchInspectorList,
    ],
  });
  syncTaskFocusInspectorCollapseState(false, { enableCollapse: false });
  return workbenchInspectorElement;
}

function initializeWorkbenchInspectorSlideOut() {
  if (
    !workbenchInspectorBackdrop
    || !workbenchInspectorCloseButton
    || !workbenchInspectorElement
    || !workbenchInspectorOpenButton
    || typeof workbenchViewHelpers.createSlideOutSidebarController !== "function"
  ) {
    return;
  }

  workbenchInspectorOpenButton.setAttribute("aria-controls", workbenchInspectorElement.id);
  workbenchInspectorCloseButton.setAttribute("aria-controls", workbenchInspectorElement.id);
  workbenchInspectorController = workbenchViewHelpers.createSlideOutSidebarController({
    backdrop: workbenchInspectorBackdrop,
    closeButton: workbenchInspectorCloseButton,
    drawer: workbenchInspectorElement,
    trigger: workbenchInspectorOpenButton,
  });
  workbenchInspectorMobileQuery = window.matchMedia?.(WORKBENCH_MOBILE_INSPECTOR_MEDIA) || null;
  workbenchInspectorWideQuery = window.matchMedia?.(WORKBENCH_WIDE_INSPECTOR_MEDIA) || null;
  const syncViewport = () => syncWorkbenchInspectorViewport();
  workbenchInspectorMobileQuery?.addEventListener?.("change", syncViewport);
  workbenchInspectorWideQuery?.addEventListener?.("change", syncViewport);
  syncWorkbenchInspectorViewport();
}

function syncWorkbenchInspectorViewport() {
  if (!workbenchInspectorController || !workbenchInspectorElement || !workbenchInspectorOpenButton) {
    return;
  }

  const isMobile = workbenchInspectorMobileQuery?.matches === true;
  const isWide = workbenchInspectorWideQuery?.matches === true;
  workbenchInspectorController.close({ focus: false });
  workbenchInspectorOpenButton.hidden = !isMobile;
  workbenchInspectorCloseButton.hidden = !isMobile;
  workbenchInspectorElement.classList.toggle("view-slideout-sidebar-drawer", isMobile);
  workbenchInspectorElement.classList.toggle("surface-drawer", isMobile);
  workbenchInspectorElement.classList.toggle("workbench-inspector-mobile-drawer", isMobile);

  if (isWide) {
    workbenchInspectorElement.removeAttribute("aria-hidden");
  } else {
    workbenchInspectorElement.setAttribute("aria-hidden", "true");
  }
}

function createTaskFocusPanel() {
  taskFocusActionMount = workbenchViewHelpers.createElement("div", {
    className: "workbench-task-focus-action-mount",
    dataset: { workbenchTaskFocusActions: "" },
  });
  taskFocusBody = workbenchViewHelpers.createElement("div", {
    className: "workbench-task-focus-body",
    dataset: { workbenchTaskFocusBody: "" },
  });
  taskFocusPanelElement = workbenchViewHelpers.createElement("section", {
    className: ["workbench-task-focus-panel", "surface-main-panel"],
    attrs: { "aria-labelledby": "workbench-task-focus-heading" },
    dataset: { workbenchTaskFocusPanel: "" },
    hidden: true,
    children: [
      taskFocusActionMount,
      taskFocusBody,
    ],
  });

  return taskFocusPanelElement;
}

function bindWorkbenchEvents() {
  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    card.addEventListener("toggle", handleWorkbenchCardToggle);
  });
  const timerSummary = timerSectionElement?.querySelector("summary");
  timerSummary?.addEventListener("click", markTimerSectionUserToggle);
  timerSummary?.addEventListener("keydown", markTimerSectionUserToggle);
  focusModeList?.addEventListener("click", handleFocusModeClick);
  clientFocusInput?.addEventListener("change", handleClientFocusChange);
  projectFocusInput?.addEventListener("change", handleProjectFocusChange);
}

function createGuidedFocusPanel() {
  focusModeList = workbenchViewHelpers.createElement("div", {
    className: "workbench-focus-question-list",
    attrs: {
      "aria-label": "Workbench focus questions",
      // A group, not a list: the children are toggle buttons, and the list
      // role requires listitem children (axe aria-required-children).
      role: "group",
    },
    dataset: { workbenchFocusModes: "" },
  });
  clientFocusInput = workbenchViewHelpers.createElement("select", {
    attrs: { "aria-label": "Client focus filter" },
    dataset: { workbenchClientFocusSelect: "" },
  });
  clientFocusControl = workbenchViewHelpers.createElement("label", {
    attrs: { "data-client-workspace-control": "" },
    className: "workbench-client-focus-control",
    children: [
      workbenchViewHelpers.createElement("span", { text: "Client" }),
      clientFocusInput,
    ],
    dataset: { workbenchClientFocusControl: "" },
  });
  projectFocusInput = workbenchViewHelpers.createElement("select", {
    attrs: { "aria-label": "Project focus filter" },
    dataset: { workbenchProjectFocusSelect: "" },
  });
  projectFocusControl = workbenchViewHelpers.createElement("label", {
    className: "workbench-project-focus-control",
    children: [
      workbenchViewHelpers.createElement("span", { text: "Project" }),
      projectFocusInput,
    ],
    dataset: { workbenchProjectFocusControl: "" },
  });

  focusPanelElement = workbenchViewHelpers.createElement("section", {
    className: ["workbench-focus-panel", "surface-main-panel"],
    attrs: { "aria-labelledby": "workbench-focus-heading" },
    children: [
      workbenchViewHelpers.createElement("div", {
        className: ["workbench-panel-heading", "workbench-focus-heading-row"],
        children: [
          workbenchViewHelpers.createElement("div", {
            className: "workbench-focus-heading-copy",
            children: [
              workbenchViewHelpers.createElement("h2", {
                id: "workbench-focus-heading",
                text: "What should we focus on?",
              }),
              workbenchViewHelpers.createElement("p", {
                text: "Pick the question closest to the work you want to resume.",
              }),
            ],
          }),
          createCalendarWeekLink(),
        ],
      }),
      focusModeList,
      workbenchViewHelpers.createElement("div", {
        className: "workbench-focus-scope-controls",
        dataset: { workbenchFocusScopeControls: "" },
        children: [
          clientFocusControl,
          projectFocusControl,
        ],
      }),
    ],
  });

  return focusPanelElement;
}

// Lightweight entry point to the read-only Calendar surface; the calendar
// owns all calendar logic, Workbench only links to its week view. Icon-only
// in the panel's top-right, aligned like the Task modal's heading utilities.
function createCalendarWeekLink() {
  calendarWeekLinkElement = workbenchViewHelpers.createElement("a", {
    className: ["button-link", "icon-button", "workbench-calendar-link"],
    attrs: {
      href: "calendar.html?view=week",
      title: "See this week on the calendar",
      "aria-label": "See this week on the calendar",
    },
    dataset: { workbenchCalendarLink: "" },
    hidden: true,
  });

  const icons = window.LongtailForge?.icons;

  if (icons?.createIcon) {
    calendarWeekLinkElement.appendChild(icons.createIcon("calendar", { size: 18 }));
  }

  return calendarWeekLinkElement;
}

function updateCalendarWeekLinkVisibility() {
  if (!calendarWeekLinkElement) {
    return;
  }

  const navigation = window.LongtailForge?.workspaceContext?.navigation || [];
  calendarWeekLinkElement.hidden = !navigationContainsHref(navigation, "calendar.html");
}

function navigationContainsHref(items, href) {
  return (Array.isArray(items) ? items : []).some((item) => (
    item?.href === href || navigationContainsHref(item?.items, href)
  ));
}

function createRecommendedActionPanel() {
  recommendedActionBody = workbenchViewHelpers.createElement("div", {
    className: "workbench-recommended-body",
    dataset: { workbenchRecommendedAction: "" },
  });
  recommendedCyclePreviousButton = workbenchViewHelpers.createActionButton({
    className: "workbench-recommended-cycle-button",
    icon: "previous",
    iconOnly: true,
    label: "Previous",
    onClick: () => cycleRecommendedCandidate(-1),
    role: "secondary",
  });
  recommendedCycleNextButton = workbenchViewHelpers.createActionButton({
    className: "workbench-recommended-cycle-button",
    icon: "next",
    iconOnly: true,
    label: "Next",
    onClick: () => cycleRecommendedCandidate(1),
    role: "secondary",
  });
  recommendedCycleControls = workbenchViewHelpers.createElement("div", {
    className: "workbench-recommended-cycle-controls",
    attrs: { "aria-label": "Change recommended action" },
    dataset: { workbenchRecommendedCycleControls: "" },
    hidden: true,
    children: [recommendedCyclePreviousButton, recommendedCycleNextButton],
  });

  recommendedActionPanelElement = workbenchViewHelpers.createElement("section", {
    className: ["workbench-recommended-panel", "surface-main-panel"],
    attrs: { "aria-labelledby": "workbench-recommended-heading" },
    children: [
      workbenchViewHelpers.createElement("div", {
        className: ["workbench-panel-heading", "workbench-recommended-heading"],
        children: [
          workbenchViewHelpers.createElement("div", {
            className: "workbench-recommended-heading-copy",
            children: [
              workbenchViewHelpers.createElement("span", {
                className: "workbench-eyebrow",
                text: "Recommended next action",
              }),
              workbenchViewHelpers.createElement("h2", {
                id: "workbench-recommended-heading",
                text: "Start here",
              }),
            ],
          }),
          recommendedCycleControls,
        ],
      }),
      recommendedActionBody,
    ],
  });

  return recommendedActionPanelElement;
}

function createSecondaryWorkbenchPanel() {
  secondaryWorkbenchPanelElement = workbenchViewHelpers.createElement("section", {
    className: "workbench-secondary-panel",
    attrs: { "aria-label": "Workbench module lists" },
    children: [
      workbenchViewHelpers.createElement("section", {
        className: "workbench-layout",
        attrs: { "aria-label": "Workbench module lists" },
        children: [
          createTimerSection(),
        ],
      }),
    ],
  });

  return secondaryWorkbenchPanelElement;
}

function createTimerSection() {
  timerCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchTimerCount: "" },
    text: "0",
  });
  timerList = workbenchViewHelpers.createElement("div", {
    className: "workbench-timer-list",
    dataset: { workbenchTimerList: "" },
  });

  timerSectionElement = createWorkbenchCardSection({
    body: [timerList],
    cardId: "active-work-timers",
    count: timerCountText,
    defaultOpen: shouldOpenTimerSectionByDefault(),
    rendererId: "active-work-timers",
    title: "Timers",
  });
  return timerSectionElement;
}

function createWorkbenchCardSection({ body = [], cardId, count = null, defaultOpen = true, rendererId, title }) {
  const section = workbenchViewHelpers.createElement("details", {
    className: ["workbench-section", "surface-main-panel"],
    dataset: {
      workbenchCard: cardId,
      workbenchRenderer: rendererId,
    },
  });
  const bodyId = `workbench-card-${cardId}-body`;
  section.append(
    createWorkbenchSectionSummary({
      bodyId,
      count,
      title,
    }),
    workbenchViewHelpers.createElement("div", {
      attrs: { id: bodyId },
      className: "workbench-section-body",
      children: body,
    }),
  );
  setWorkbenchDisclosureOpen(section, defaultOpen);
  return section;
}

function createWorkbenchSectionSummary({ bodyId = "", count = null, subtitle = null, title }) {
  const attrs = { "aria-expanded": "false" };

  if (bodyId) {
    attrs["aria-controls"] = bodyId;
  }

  const titleNode = workbenchViewHelpers.createElement("span", {
    className: "workbench-section-title",
    text: title,
  });
  // When a subtitle is supplied it stacks under the title inside the summary so it stays visible
  // even while the section is collapsed (only the summary renders in a closed <details>).
  const heading = subtitle
    ? workbenchViewHelpers.createElement("span", {
      className: "workbench-section-heading",
      children: [titleNode, subtitle],
    })
    : titleNode;

  return workbenchViewHelpers.createElement("summary", {
    className: "workbench-section-summary",
    attrs,
    children: [heading, count],
  });
}

async function loadWorkbench() {
  setStatus("Loading Workbench...");

  try {
    // The cached workspace context and sessionStorage copies render the focus
    // panel and card skeletons immediately; the app-shell bootstrap reconciles
    // through the longtailforge:workspace-context-updated event, and the
    // fan-out below revalidates everything in parallel.
    restoreFocusState();
    renderWarmWorkbench();

    const cachedRegistry = readCachedWorkbenchRegistry();
    const bootstrapPromise = api.getJson("/api/workbench/bootstrap", { cache: "no-store" });
    const restoredFocusPromise = loadFocusCandidatesForState();
    const sourceDataPromise = cachedRegistry
      ? loadWorkbenchSourceData(cachedRegistry)
      : bootstrapPromise.then((bootstrap) => loadWorkbenchSourceData(bootstrap.registry || {}));
    const [bootstrap, clientProjectData, focusModeData, initialSourceData, restoredFocusData] = await Promise.all([
      bootstrapPromise,
      loadClientProjectData(),
      loadFocusModes(),
      sourceDataPromise,
      restoredFocusPromise,
    ]);
    const registry = bootstrap.registry || state.registry;
    const sourceData = cachedRegistry && workbenchRegistryCardsChanged(cachedRegistry, registry)
      ? await loadWorkbenchSourceData(registry)
      : initialSourceData;
    writeCachedWorkbenchRegistry(registry);

    const clients = normalizeClientProjectOptions(clientProjectData);
    const workspaceType = currentWorkspaceType();
    const focusModes = curateFocusModes(focusModeData?.modes || []);
    const restoredSelection = {
      clientId: state.selectedClientId,
      modeId: state.focusModeId,
      projectId: state.selectedProjectId,
    };
    const focusModeId = resolveFocusModeSelection(state.focusModeId, focusModes);
    const selectedClientId = resolveClientSelection(state.selectedClientId, clients, workspaceType);
    const selectedProjectId = resolveProjectSelection(state.selectedProjectId, clients, selectedClientId);

    state = {
      ...state,
      clients,
      currentUserId: bootstrap.currentUserId || "",
      focusModeId,
      focusModes,
      modules: normalizeModuleStateMap(bootstrap.modules || state.modules),
      recommendedCandidateIndex: 0,
      registry,
      selectedClientId,
      selectedProjectId,
      taskOptions: sourceData.taskOptions || bootstrap.taskOptions || { projects: [] },
      timers: sourceData.timers,
      workCandidates: bootstrap.workCandidates || [],
      workspaceType,
    };
    // The candidates fetched with the restored selection stand unless
    // validation against the fresh lists changed the selection.
    const selectionInvalidated = focusModeId !== restoredSelection.modeId
      || selectedClientId !== restoredSelection.clientId
      || selectedProjectId !== restoredSelection.projectId;
    const focusData = selectionInvalidated ? await loadFocusCandidatesForState() : restoredFocusData;
    state = {
      ...state,
      focusCandidates: Array.isArray(focusData?.items) ? focusData.items : [],
      focusContext: focusData?.focusContext || null,
    };
    restoreCardState();
    renderWorkbench();
    startTicking();

    const deepLinkApplied = await applyTaskFocusDeepLink();
    const driftCaptureOffered = await recoverPendingTaskFocusDrift();
    if (!deepLinkApplied && !driftCaptureOffered) {
      setStatus("");
    }
  } catch (error) {
    setStatus(error.message || "Workbench could not be loaded.", { isError: true });
  }
}

// First paint from the cached workspace context and sessionStorage copies:
// warm loads render the full focus-selection panel immediately, cold loads
// keep the restored selection untouched so the parallel candidate fetch uses
// it, and every value is reconciled when the fan-out resolves.
function renderWarmWorkbench() {
  updateCalendarWeekLinkVisibility();
  const cachedFetch = window.LongtailForge.cachedFetch;
  const cachedClientProjects = cachedFetch?.readCached(workbenchCacheKey("client-project-options")) || null;
  const cachedFocusModes = cachedFetch?.readCached(workbenchCacheKey("focus-modes")) || null;
  const cachedRegistry = readCachedWorkbenchRegistry();
  const clients = cachedClientProjects ? normalizeClientProjectOptions(cachedClientProjects) : state.clients;
  const focusModes = cachedFocusModes ? curateFocusModes(cachedFocusModes.modes || []) : state.focusModes;
  const workspaceType = currentWorkspaceType();
  const selectedClientId = cachedClientProjects
    ? resolveClientSelection(state.selectedClientId, clients, workspaceType)
    : state.selectedClientId;

  state = {
    ...state,
    clients,
    focusModeId: cachedFocusModes ? resolveFocusModeSelection(state.focusModeId, focusModes) : state.focusModeId,
    focusModes,
    registry: cachedRegistry || state.registry,
    selectedClientId,
    selectedProjectId: cachedClientProjects
      ? resolveProjectSelection(state.selectedProjectId, clients, selectedClientId)
      : state.selectedProjectId,
    workspaceType,
  };
  restoreCardState();
  renderWorkbench();
}

function workbenchCacheKey(name) {
  const workspaceId = String(window.LongtailForge?.workspaceContext?.workspaceId || "");
  return `${workspaceId}:workbench:${name}`;
}

function readCachedWorkbenchRegistry() {
  return window.LongtailForge.cachedFetch?.readCached(workbenchCacheKey("registry")) || null;
}

function writeCachedWorkbenchRegistry(registry) {
  window.LongtailForge.cachedFetch?.writeCached(workbenchCacheKey("registry"), registry || {});
}

function workbenchRegistryCardsChanged(cachedRegistry, freshRegistry) {
  return JSON.stringify(cachedRegistry?.workbenchCards || []) !== JSON.stringify(freshRegistry?.workbenchCards || []);
}

// Deep-link contract: workbench.html?taskId=<id> lands directly in Task Focus
// for a readable task. The parameter is consumed before any permission-checked
// read so refresh and later focus changes cannot reapply it. Anything else —
// unknown id, unreadable or cross-workspace task, or a disabled Tasks module —
// falls back to Focus Selection with the same generic message, so the link
// reveals nothing about whether the task exists.
const WORKBENCH_TASK_FOCUS_LINK_FALLBACK = "The linked task could not be opened. Choose a focus to continue.";

function consumeTaskFocusDeepLink() {
  const params = new URLSearchParams(window.location?.search || "");
  const present = params.has("taskId") || params.has("taskID");
  const taskId = String(params.get("taskId") || params.get("taskID") || "").trim();

  if (present) {
    params.delete("taskId");
    params.delete("taskID");
    const query = params.toString();
    const pathname = window.location?.pathname || "workbench.html";
    const hash = window.location?.hash || "";
    window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
  }

  return { present, taskId };
}

async function applyTaskFocusDeepLink() {
  const { present, taskId } = consumeTaskFocusDeepLink();

  if (!present) {
    return false;
  }

  if (!taskId || !moduleEnabled("tasks")) {
    resetTaskFocusState();
    renderWorkbench();
    setStatus(WORKBENCH_TASK_FOCUS_LINK_FALLBACK, { isError: true });
    return true;
  }

  const candidate = (state.focusCandidates || []).find((entry) => candidateTaskId(entry) === taskId)
    || (state.workCandidates || []).find((entry) => candidateTaskId(entry) === taskId)
    || {};

  await enterTaskFocus(candidate, taskId);

  if (state.activeTaskFocus?.error) {
    resetTaskFocusState();
    renderWorkbench();
    setStatus(WORKBENCH_TASK_FOCUS_LINK_FALLBACK, { isError: true });
  }

  return true;
}

async function loadWorkbenchSourceData(registry) {
  const sourceData = {
    taskOptions: null,
    timers: [],
  };
  const cards = Array.isArray(registry?.workbenchCards) ? registry.workbenchCards : [];

  await Promise.all(cards.map(async (card) => {
    const loader = workbenchCardDataLoaders[card.renderer];

    if (!loader || !card.listRoute) {
      return;
    }

    mergeWorkbenchSourceData(sourceData, await loader(card));
  }));

  return sourceData;
}

async function loadTimerCardData(card) {
  const data = await api.getJson(card.listRoute, { cache: "no-store" });

  return {
    timers: Array.isArray(data?.timers) ? data.timers : [],
  };
}

async function loadTaskOptionsData(card) {
  const data = await api.getJson(card.listRoute, { cache: "no-store" });

  return {
    taskOptions: data?.options || { projects: [] },
  };
}

// The warm render consumes the sessionStorage copy; the fan-out resolves with
// the fresh payload (falling back to the cached copy if revalidation fails).
async function loadFocusModes() {
  const result = await window.LongtailForge.cachedFetch.getJson("/api/workbench/focus-modes", {
    cacheKey: workbenchCacheKey("focus-modes"),
  });
  return result.revalidated.catch(() => result.data);
}

async function loadFocusCandidatesForState() {
  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    return {
      focusContext: null,
      items: [],
      mode: PROJECT_FOCUS_MODE_ID,
    };
  }

  const params = new URLSearchParams({
    limit: "25",
    modeId: state.focusModeId || DEFAULT_FOCUS_MODE_ID,
  });
  const selectedClientScopeId = selectedClientCandidateScopeId();

  if (selectedClientScopeId) {
    params.set("clientId", selectedClientScopeId);
  }
  if (state.selectedProjectId) {
    params.set("projectId", state.selectedProjectId);
  }

  return api.getJson(`/api/workbench/focus-candidates?${params.toString()}`, { cache: "no-store" });
}

function mergeWorkbenchSourceData(target, data = {}) {
  if (Array.isArray(data.timers)) {
    target.timers.push(...data.timers);
  }
  if (data.taskOptions) {
    target.taskOptions = data.taskOptions;
  }
}

async function loadClientProjectData() {
  try {
    const result = await window.LongtailForge.cachedFetch.getJson("/api/client-projects?view=options", {
      cacheKey: workbenchCacheKey("client-project-options"),
    });
    return await result.revalidated.catch(() => result.data);
  } catch {
    return { clients: [], workspaceProjects: [] };
  }
}

function renderWorkbench() {
  renderWorkbenchViewState();
  renderWorkbenchStatus();
  renderFocusModes();
  renderRecommendedAction();
  renderTaskFocusSurface();
  renderWorkbenchInspector();
  renderRegisteredWorkbenchCards();
  renderWorkbenchViewState();
}

function renderWorkbenchViewState() {
  const viewState = resolvedWorkbenchViewState();
  const isTaskFocus = viewState === WORKBENCH_VIEW_STATE_TASK_FOCUS;
  const activeTaskFocus = isTaskFocus ? state.activeTaskFocus : null;

  state.viewState = viewState;

  if (workbenchHost) {
    workbenchHost.dataset.workbenchViewState = viewState;
    workbenchHost.dataset.workbenchActiveTaskFocus = activeTaskFocus?.taskId || "";
  }

  toggleWorkbenchStatePanel(taskFocusPanelElement, !isTaskFocus);
  toggleWorkbenchStatePanel(focusPanelElement, isTaskFocus);
  toggleWorkbenchStatePanel(recommendedActionPanelElement, isTaskFocus);
  toggleWorkbenchStatePanel(secondaryWorkbenchPanelElement, false);

  if (!changeFocusButton) {
    return;
  }

  changeFocusButton.disabled = !isTaskFocus;
  changeFocusButton.dataset.workbenchChangeFocus = "";
  changeFocusButton.dataset.workbenchChangeFocusState = viewState;
  changeFocusButton.dataset.workbenchChangeFocusEnabled = isTaskFocus ? "true" : "false";
  changeFocusButton.setAttribute("aria-disabled", isTaskFocus ? "false" : "true");
  changeFocusButton.title = isTaskFocus ? "Return to Focus Selection" : "Choose a task before changing focus";
}

function resolvedWorkbenchViewState() {
  if (state.viewState === WORKBENCH_VIEW_STATE_TASK_FOCUS && state.activeTaskFocus?.taskId) {
    return WORKBENCH_VIEW_STATE_TASK_FOCUS;
  }

  return WORKBENCH_VIEW_STATE_FOCUS_SELECTION;
}

function resetTaskFocusState() {
  state.viewState = WORKBENCH_VIEW_STATE_FOCUS_SELECTION;
  state.activeTaskFocus = null;
  taskFocusInspectorCollapsed = false;
}

function installTaskFocusExitGuard() {
  window.LongtailForge.navigationIntent?.registerExitGuard({
    shouldHold: () => Boolean(taskFocusExitSnapshot()),
    beforeContinue: offerTaskResumeNoteBeforeExit,
    onCommitted() {
      taskFocusExitCommitted = true;
      clearPendingTaskFocusDrift();
    },
    onContinueError(_intent, error) {
      taskFocusExitCommitted = false;
      setStatus(error?.message || "Navigation could not continue.", { isError: true });
    },
  });
  window.addEventListener("beforeunload", writePendingTaskFocusDrift);
  window.addEventListener("pagehide", writePendingTaskFocusDrift);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void recoverPendingTaskFocusDrift();
  });
}

function taskFocusExitSnapshot() {
  if (taskFocusExitCommitted || resolvedWorkbenchViewState() !== WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    return null;
  }
  const taskId = String(state.activeTaskFocus?.taskId || "").trim();
  const timer = currentTaskFocusTimer();
  if (!taskId || !["running", "paused"].includes(timer?.timer_status)) {
    return null;
  }
  return {
    task: state.activeTaskFocus?.task || { task_id: taskId },
    taskId,
    timerStatus: timer.timer_status,
  };
}

async function offerTaskResumeNoteBeforeExit(intent = {}) {
  const snapshot = taskFocusExitSnapshot();
  if (!snapshot) {
    return { captured: false, reason: "not-applicable" };
  }
  const result = await window.LongtailForge.taskResumeNoteCapture?.offer({
    task: snapshot.task,
    taskId: snapshot.taskId,
    trigger: intent.trigger || null,
    onSaved(updatedTask) {
      if (updatedTask?.task_id === state.activeTaskFocus?.taskId) {
        applyActiveTaskFocusTask(updatedTask);
      }
    },
    onError(error) {
      setStatus(error.message || "Resume note could not be saved. Continuing navigation.", { isError: true });
    },
  });
  clearPendingTaskFocusDrift();
  return result || { captured: false, reason: "unavailable" };
}

function writePendingTaskFocusDrift() {
  const snapshot = taskFocusExitSnapshot();
  if (!snapshot) return;
  try {
    window.sessionStorage.setItem(WORKBENCH_TASK_FOCUS_DRIFT_KEY, JSON.stringify({
      taskId: snapshot.taskId,
      timerStatus: snapshot.timerStatus,
      timestamp: Date.now(),
    }));
  } catch {
    // Hard-exit recovery is best effort; no Task content is duplicated here.
  }
}

function clearPendingTaskFocusDrift() {
  try {
    window.sessionStorage.removeItem(WORKBENCH_TASK_FOCUS_DRIFT_KEY);
  } catch {
    // Session storage can be unavailable under strict browser privacy policies.
  }
}

function readPendingTaskFocusDrift() {
  try {
    const marker = JSON.parse(window.sessionStorage.getItem(WORKBENCH_TASK_FOCUS_DRIFT_KEY) || "null");
    const taskId = String(marker?.taskId || "").trim();
    const timestamp = Number(marker?.timestamp || 0);
    const timerStatus = String(marker?.timerStatus || "").trim();
    if (!taskId || !["running", "paused"].includes(timerStatus) || !Number.isFinite(timestamp)
      || timestamp <= 0 || Date.now() - timestamp > WORKBENCH_TASK_FOCUS_DRIFT_MAX_AGE_MS) {
      clearPendingTaskFocusDrift();
      return null;
    }
    return { taskId, timestamp, timerStatus };
  } catch {
    clearPendingTaskFocusDrift();
    return null;
  }
}

async function recoverPendingTaskFocusDrift() {
  const marker = readPendingTaskFocusDrift();
  if (!marker) return false;
  clearPendingTaskFocusDrift();

  const timer = activeOrPausedTimers(state.timers).find((entry) => taskTimerMatches(entry, marker.taskId));
  if (!timer) return false;

  try {
    const result = await api.getJson(`/api/tasks/${encodeURIComponent(marker.taskId)}`, { cache: "no-store" });
    const task = result?.task || null;
    if (!task || ["complete", "archived"].includes(String(task.status || "")) || String(task.resume_note || "").trim()) {
      return false;
    }
    setStatus("Recovering work context...");
    const captureResult = await window.LongtailForge.taskResumeNoteCapture?.offer({
      task,
      taskId: marker.taskId,
      onError(error) {
        setStatus(error.message || "Resume note could not be saved.", { isError: true });
      },
    });
    if (captureResult?.reason !== "error") setStatus("");
    return true;
  } catch {
    return false;
  }
}

function toggleWorkbenchStatePanel(element, hidden) {
  if (!element) {
    return;
  }

  const isHidden = Boolean(hidden);
  element.hidden = isHidden;
  element.setAttribute("aria-hidden", isHidden ? "true" : "false");
  element.style.display = isHidden ? "none" : "";
  if ("inert" in element) {
    element.inert = isHidden;
  }
}

function renderWorkbenchStatus() {
  if (!statusText) {
    return;
  }

  const message = transientStatus.message
    || focusScopeStatusMessage();

  statusText.textContent = message;
  statusText.hidden = !message;
  statusText.classList.toggle("is-error", transientStatus.isError && Boolean(message));
  statusText.dataset.viewTone = transientStatus.isError ? "danger" : "info";
}

function focusScopeStatusMessage() {
  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    return "Select a project to narrow the recommendation.";
  }

  return "";
}

function renderFocusModes() {
  focusModeList.replaceChildren();
  populateFocusScopeOptions();

  if (state.focusModes.length === 0) {
    focusModeList.appendChild(workbenchViewHelpers.createEmptyState({
      message: "Focus choices are temporarily unavailable. You can still use the work lists below.",
      title: "No focus choices",
    }));
    return;
  }

  state.focusModes.forEach((mode) => {
    const copy = FOCUS_QUESTION_COPY[mode.id] || {};
    const active = mode.id === state.focusModeId;
    const button = workbenchViewHelpers.createElement("button", {
      className: "workbench-focus-question",
      attrs: {
        "aria-pressed": active ? "true" : "false",
        type: "button",
      },
      dataset: {
        active: active ? "true" : "false",
        workbenchFocusMode: mode.id,
      },
      children: [
        workbenchViewHelpers.createElement("span", {
          className: "workbench-focus-question-label",
          text: copy.label || mode.label,
        }),
        workbenchViewHelpers.createElement("span", {
          className: "workbench-focus-question-description",
          text: copy.description || mode.description || "",
        }),
      ],
    });
    focusModeList.appendChild(button);
  });

}

function populateFocusScopeOptions() {
  const hasClientScope = usesClientScope();
  const clients = clientFocusOptions();
  const projects = projectFocusOptions(state.clients, state.selectedClientId);

  if (clientFocusControl) {
    clientFocusControl.hidden = !hasClientScope;
  }
  replaceOptions(clientFocusInput, hasClientScope
    ? [
        option("", "All clients"),
        ...clients.map((client) => option(client.id, clientOptionLabel(client))),
      ]
    : [option("", "All clients")]);
  if (clientFocusInput) {
    clientFocusInput.disabled = !hasClientScope || clients.length === 0;
    clientFocusInput.value = hasClientScope && clients.some((client) => client.id === state.selectedClientId)
      ? state.selectedClientId
      : "";
  }

  replaceOptions(projectFocusInput, [
    option("", projects.length ? "All projects" : "No projects available"),
    ...projects.map((project) => option(project.id, project.label)),
  ]);
  projectFocusInput.disabled = projects.length === 0;
  projectFocusInput.value = projects.some((project) => project.id === state.selectedProjectId)
    ? state.selectedProjectId
    : "";
}

function renderRecommendedAction() {
  recommendedActionBody.replaceChildren();

  const candidates = recommendedCandidateWindow();
  state.recommendedCandidateIndex = clampRecommendedCandidateIndex(state.recommendedCandidateIndex, candidates.length);
  updateRecommendedCycleControls(candidates.length);

  const candidate = candidates[state.recommendedCandidateIndex] || null;
  if (!candidate) {
    recommendedActionBody.appendChild(recommendedEmptyState());
    return;
  }

  recommendedActionBody.appendChild(createRecommendedCandidateCard(candidate, state.recommendedCandidateIndex));
}

function renderWorkbenchInspector() {
  if (!workbenchInspectorList || !workbenchInspectorCountText) {
    return;
  }

  if (resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    renderTaskFocusInspector();
    return;
  }

  syncTaskFocusInspectorCollapseState(false, { enableCollapse: false });
  setWorkbenchInspectorCopy(
    "More in this focus",
    "Other work matching the selected focus. Choose one to focus it.",
  );

  const candidates = workbenchInspectorCandidates();
  workbenchInspectorCountText.textContent = String(candidates.length);
  workbenchInspectorList.replaceChildren();

  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    workbenchInspectorList.appendChild(emptyState("Choose a project to load related work context."));
    return;
  }

  if (candidates.length === 0) {
    workbenchInspectorList.appendChild(emptyState("No other work matches this focus yet."));
    return;
  }

  candidates.forEach((candidate) => {
    workbenchInspectorList.appendChild(createWorkbenchInspectorItem(candidate));
  });
}

function renderTaskFocusInspector() {
  syncTaskFocusInspectorCollapseState(taskFocusInspectorCollapsed, { enableCollapse: true });
  setWorkbenchInspectorCopy("Task context", "Related work for the focused task.");
  const context = taskFocusRelatedContextState();
  const groups = taskFocusRelatedContextGroups(context);
  const items = groups.flatMap((group) => group.items || []);
  workbenchInspectorCountText.textContent = String(items.length);
  workbenchInspectorList.replaceChildren();

  if (taskFocusInspectorCollapsed) {
    return;
  }

  if (state.activeTaskFocus?.error) {
    workbenchInspectorList.appendChild(emptyState("Task context is unavailable while task details cannot be loaded."));
    return;
  }

  if (context.isLoading) {
    workbenchInspectorList.appendChild(emptyState("Loading related task context..."));
    return;
  }

  if (context.error) {
    workbenchInspectorList.appendChild(emptyState(context.error));
    return;
  }

  if (items.length === 0) {
    workbenchInspectorList.appendChild(emptyState("No related task context is available yet."));
    return;
  }

  groups.forEach((group) => {
    if ((group.items || []).length > 0) {
      workbenchInspectorList.appendChild(createTaskFocusRelatedContextGroup(group));
    }
  });
}

function setWorkbenchInspectorCopy(heading, helper) {
  if (workbenchInspectorHeadingText) {
    workbenchInspectorHeadingText.textContent = heading;
  }
  if (workbenchInspectorHelperText) {
    workbenchInspectorHelperText.textContent = helper;
  }
}

function syncTaskFocusInspectorCollapseState(collapsed, options = {}) {
  const enableCollapse = Boolean(options.enableCollapse);

  if (workbenchInspectorElement) {
    workbenchInspectorElement.dataset.workbenchInspectorTaskFocus = enableCollapse ? "true" : "false";
    workbenchInspectorElement.dataset.workbenchInspectorCollapsed = enableCollapse && collapsed ? "true" : "false";
  }
  if (workbenchInspectorList) {
    workbenchInspectorList.hidden = enableCollapse && collapsed;
  }
  if (!workbenchInspectorCollapseButton) {
    return;
  }

  workbenchInspectorCollapseButton.hidden = !enableCollapse;
  workbenchInspectorCollapseButton.disabled = !enableCollapse;
  workbenchInspectorCollapseButton.setAttribute("aria-expanded", enableCollapse && !collapsed ? "true" : "false");
  workbenchInspectorCollapseButton.setAttribute("aria-controls", "workbench-inspector-related-context-list");
  workbenchInspectorCollapseButton.setAttribute(
    "aria-label",
    collapsed ? "Expand Task Focus Inspector" : "Collapse Task Focus Inspector",
  );
  workbenchInspectorCollapseButton.title = collapsed ? "Expand Task Focus Inspector" : "Collapse Task Focus Inspector";
}

function toggleTaskFocusInspectorCollapse() {
  if (resolvedWorkbenchViewState() !== WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    return;
  }

  taskFocusInspectorCollapsed = !taskFocusInspectorCollapsed;
  renderTaskFocusInspector();
}

function taskFocusRelatedContextState(active = state.activeTaskFocus) {
  return active?.relatedContext || {
    error: "",
    groups: [],
    isLoading: false,
    items: [],
    taskId: active?.taskId || "",
  };
}

function taskFocusRelatedContextGroups(context = taskFocusRelatedContextState()) {
  return Array.isArray(context.groups) ? context.groups : [];
}

function createTaskFocusRelatedContextGroup(group = {}) {
  const count = Number.parseInt(group.count, 10) || (group.items || []).length;
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

function createTaskFocusRelatedContextItem(item = {}) {
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

function workbenchInspectorCandidates() {
  const seen = new Set();
  const candidates = [];

  for (const candidate of recommendedOverflowCandidates()) {
    const key = inspectorCandidateKey(candidate);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(candidate);

    if (candidates.length >= WORKBENCH_INSPECTOR_LIMIT) {
      break;
    }
  }

  return candidates;
}

function createWorkbenchInspectorItem(candidate) {
  const title = inspectorCandidateTitle(candidate);
  const context = inspectorCandidateContext(candidate);
  const openMode = resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_FOCUS_SELECTION
    ? "candidate-primary"
    : "context-open";
  const titleButton = workbenchViewHelpers.createElement("button", {
    className: "workbench-inspector-title",
    attrs: {
      "aria-label": `${candidateActionLabel(candidate)}: ${title}`,
      type: "button",
    },
    dataset: {
      workbenchInspectorOpen: candidate.recordType || candidate.moduleId || "work",
      workbenchInspectorOpenMode: openMode,
    },
    text: title,
  });
  const badges = candidateBadges(candidate);

  titleButton.disabled = !candidateCanOpen(candidate);
  titleButton.addEventListener("click", (event) => openCandidate(candidate, event.currentTarget, { mode: openMode }));

  return workbenchViewHelpers.createElement("article", {
    className: "workbench-inspector-item",
    dataset: {
      workbenchInspectorItem: "",
      workbenchInspectorCurrent: "false",
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

function recommendedCandidateWindow() {
  return state.focusCandidates.slice(0, RECOMMENDED_CANDIDATE_LIMIT);
}

function recommendedOverflowCandidates() {
  return state.focusCandidates.slice(recommendedCandidateWindow().length);
}

function clampRecommendedCandidateIndex(index, candidateCount) {
  if (candidateCount <= 0) {
    return 0;
  }

  const parsedIndex = Number.parseInt(index, 10);
  if (!Number.isFinite(parsedIndex) || parsedIndex < 0) {
    return 0;
  }

  return Math.min(parsedIndex, candidateCount - 1);
}

function updateRecommendedCycleControls(candidateCount) {
  const canCycle = candidateCount > 1;

  if (recommendedCycleControls) {
    recommendedCycleControls.hidden = !canCycle;
    recommendedCycleControls.dataset.workbenchRecommendedCycleCount = String(candidateCount);
    recommendedCycleControls.dataset.workbenchRecommendedCycleIndex = String(state.recommendedCandidateIndex);
  }
  if (recommendedCyclePreviousButton) {
    recommendedCyclePreviousButton.disabled = !canCycle;
  }
  if (recommendedCycleNextButton) {
    recommendedCycleNextButton.disabled = !canCycle;
  }
}

function cycleRecommendedCandidate(direction) {
  const candidates = recommendedCandidateWindow();

  if (candidates.length <= 1) {
    return;
  }

  state.recommendedCandidateIndex = (state.recommendedCandidateIndex + direction + candidates.length) % candidates.length;
  renderRecommendedAction();
  renderWorkbenchInspector();
}

function createRecommendedCandidateCard(candidate, candidateIndex = 0) {
  const actionButtonElement = workbenchViewHelpers.createActionButton({
    label: candidateActionLabel(candidate),
    onClick: (event) => openCandidate(candidate, event?.currentTarget || null, { mode: "candidate-primary" }),
    role: "primary",
  });
  const actionElements = [actionButtonElement];

  const card = workbenchViewHelpers.createElement("article", {
    className: "workbench-recommended-card",
    dataset: {
      workbenchRecommendedCard: "",
      workbenchRecommendedIndex: candidateIndex,
      workbenchRecommendedWindowSize: recommendedCandidateWindow().length,
    },
    children: [
      workbenchViewHelpers.createDetailHeader({
        badges: candidateBadges(candidate),
        meta: recommendedCandidateMeta(candidate),
        title: safeCandidateText(candidate.title, "Untitled work"),
      }),
      workbenchViewHelpers.createElement("p", {
        className: "workbench-recommended-reason",
        text: safeCandidateText(candidate.reason, "")
          || safeCandidateText(candidate.nextAction, "")
          || "This is the strongest match for the selected focus.",
      }),
      workbenchViewHelpers.createDetailActionStrip({
        actions: actionElements,
        className: "workbench-recommended-actions",
      }),
    ],
  });

  return card;
}

function recommendedCandidateMeta(candidate = {}) {
  // Prefer real client/project context so identically-titled work is
  // distinguishable; never surface copy carrying a raw identifier.
  return candidateClientProjectLabel(candidate)
    || safeCandidateText(candidate.contextLabel, "")
    || safeCandidateText(candidate.reason, "");
}

function candidateClientProjectLabel(candidate = {}) {
  const parts = [];
  const clientId = String(candidate.clientId || "").trim();
  const projectId = String(candidate.projectId || "").trim();
  const client = clientId
    ? (state.clients || []).find((entry) => entry.id === clientId && !entry.isWorkspaceScope)
    : null;

  if (client) {
    parts.push(clientOptionLabel(client) || client.name || "");
  }

  if (projectId) {
    for (const entry of state.clients || []) {
      const project = (entry.projects || []).find((item) => item.id === projectId);

      if (project) {
        parts.push(project.optionLabel || project.name || "");
        break;
      }
    }
  }

  return parts.filter(Boolean).join(" / ");
}

function recommendedEmptyState() {
  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    return workbenchViewHelpers.createEmptyState({
      actions: [{
        label: "Choose a project",
        onClick: () => projectFocusInput?.focus(),
      }],
      message: "Select a project to narrow the recommendation.",
      title: "Choose a project first",
    });
  }

  return workbenchViewHelpers.createEmptyState({
    actions: [
      {
        label: "Add Task",
        onClick: openAddTaskAction,
      },
      {
        label: "Adjust focus",
        onClick: focusActiveFocusQuestion,
      },
    ],
    message: "No work matches this focus yet. Capture the next commitment or adjust the focus.",
    title: "Nothing needs this focus right now",
  });
}

function renderTaskFocusSurface() {
  if (!taskFocusBody || !taskFocusActionMount) {
    return;
  }

  const isTaskFocus = resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS;
  const active = isTaskFocus ? state.activeTaskFocus : null;

  taskFocusActionMount.hidden = !isTaskFocus;
  taskFocusBody.hidden = !isTaskFocus;
  taskFocusActionMount.setAttribute("aria-hidden", isTaskFocus ? "false" : "true");
  taskFocusBody.setAttribute("aria-hidden", isTaskFocus ? "false" : "true");
  taskFocusActionMount.replaceChildren();
  taskFocusBody.replaceChildren();

  if (!isTaskFocus || !active) {
    return;
  }

  taskFocusActionMount.appendChild(createTaskFocusActionStrip(active));
  const sections = [
    createTaskFocusSummary(active),
    createTaskDetailsSection(active),
    createTaskFocusChecklistSection(active),
  ];
  if (taskTimerSurfaceAvailable()) {
    sections.push(createTaskFocusTimerSection(active));
  }
  taskFocusBody.append(...sections);
}

function createTaskFocusActionStrip(active) {
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
      disabledReason: taskFocusLifecycleDisabledReason("block", active),
      icon: "pause",
      id: "block",
      label: "Block task",
      onClick: blockFocusedTask,
    }),
  ];

  return workbenchViewHelpers.createDetailActionStrip({
    actions,
    ariaLabel: "Task Focus actions",
    className: "workbench-task-focus-action-strip",
  });
}

function createTaskFocusActionButton({ active, disabledReason = "", icon, id, label, onClick }) {
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
  button.dataset.taskId = taskId;
  if (disabledReason) {
    button.dataset.workbenchTaskFocusDisabledReason = disabledReason;
  }
  return button;
}

function taskFocusLifecycleDisabledReason(action, active = state.activeTaskFocus) {
  const task = active?.task || null;
  const status = String(task?.status || "").trim();

  if (!active?.taskId) {
    return "Choose a task before using this action.";
  }
  if (active.isLoading || !task) {
    return "Task details are loading.";
  }
  if (active.error) {
    return "Task details could not be loaded.";
  }
  if (action === "complete" && ["complete", "archived"].includes(status)) {
    return "Task is already complete or archived.";
  }
  if (action === "block" && status === "blocked") {
    return "Task is already blocked.";
  }
  if (action === "block" && ["complete", "archived"].includes(status)) {
    return "Completed and archived tasks cannot be blocked.";
  }

  return "";
}

function createTaskFocusSummary(active) {
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

function taskFocusLeadText(task, _active) {
  const text = safeTaskFocusText(
    task.next_action || task.resume_note || task.description || "",
    "Ready to work.",
  );

  return workbenchViewHelpers.createElement("p", {
    className: "workbench-task-focus-note",
    text,
  });
}

function createTaskDetailsSection(active) {
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

function createTaskFocusChecklistSection(active) {
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

function createTaskFocusTimerSection(active) {
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

function createTaskFocusTimerControls(active, timer, eligibility) {
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

function createTaskFocusTimerButton({ action, danger = false, disabled = false, label, onClick, taskId }) {
  const button = actionButton(label, onClick, { danger });
  button.disabled = Boolean(disabled);
  button.dataset.taskId = taskId || "";
  button.dataset.workbenchTaskFocusTimerAction = action;
  return button;
}

function currentTaskFocusTimer(active = state.activeTaskFocus) {
  const taskId = String(active?.taskId || active?.task?.task_id || "");
  if (!taskId) {
    return null;
  }

  return activeOrPausedTimers(state.timers).find((timer) => taskTimerMatches(timer, taskId)) || null;
}

function taskTimerMatches(timer, taskId) {
  const sourceId = String(timer?.task_id || timer?.source_id || "");
  return Boolean(
    taskId &&
    sourceId === taskId &&
    (timer?.source_type === "task" || timer?.source_module_id === "tasks" || timer?.active_task_timer_id),
  );
}

function taskFocusTimerEligibility(active = state.activeTaskFocus) {
  const task = active?.task || null;
  const status = String(task?.status || "").trim();
  const options = state.taskOptions || {};

  if (!active?.taskId) {
    return { eligible: false, reason: "Choose a task before using a task timer." };
  }
  if (active.isLoading || !task) {
    return { eligible: false, reason: "Task details are loading." };
  }
  if (active.error) {
    return { eligible: false, reason: "Task details could not be loaded." };
  }
  if (!moduleEnabled("tasks")) {
    return { eligible: false, reason: "Tasks are not available in this workspace." };
  }
  if (!moduleEnabled("time-tracking") || options.timeTrackingEnabled === false) {
    return { eligible: false, reason: "Time Tracking is disabled." };
  }
  if (options.taskTimersEnabled === false) {
    return { eligible: false, reason: "Task timers are disabled." };
  }
  if (!task.project_id) {
    return { eligible: false, reason: "Task timers require a project-linked task." };
  }
  if (status === "complete" || status === "archived") {
    return { eligible: false, reason: "Completed and archived tasks cannot use task timers." };
  }

  return { eligible: true, reason: "" };
}

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

function createTaskFocusChecklistBody(active, items) {
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

function createTaskFocusChecklistItem(item, active) {
  const itemId = String(item?.task_checklist_item_id || "");
  const labelText = safeTaskFocusText(item?.label, "Checklist item");
  const checkbox = workbenchViewHelpers.createElement("input", {
    attrs: {
      "aria-label": `Mark ${labelText} complete`,
      type: "checkbox",
    },
    dataset: { workbenchTaskFocusChecklistToggle: "" },
  });
  checkbox.checked = Boolean(item?.is_checked);
  checkbox.disabled = Boolean(active?.checklistMutationItemId);

  return workbenchViewHelpers.createElement("label", {
    className: ["workbench-task-checklist-item", item?.is_checked ? "is-checked" : ""],
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

function taskFocusChecklistItems(task = {}) {
  return Array.isArray(task?.checklistItems) ? task.checklistItems : [];
}

function taskFocusChecklistProgress(task = {}, items = taskFocusChecklistItems(task)) {
  const provided = task?.checklistProgress;
  if (provided) {
    return provided;
  }

  const completed = items.filter((item) => item?.is_checked).length;
  const next = items.find((item) => !item?.is_checked);
  return {
    completed_count: completed,
    next_incomplete_item_label: next?.label || "",
    total_count: items.length,
  };
}

const TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX = 20;

function formatTaskFocusChecklistProgress(progress = {}, { truncate = true } = {}) {
  const total = Number(progress?.total_count) || 0;
  const completed = Number(progress?.completed_count) || 0;
  const rawNextLabel = safeTaskFocusText(progress?.next_incomplete_item_label, "");
  const base = `${completed} / ${total} complete`;
  if (!rawNextLabel) {
    return base;
  }
  const nextLabel = truncate
    ? truncateTaskFocusChecklistLabel(rawNextLabel, TASK_FOCUS_CHECKLIST_NEXT_LABEL_MAX)
    : rawNextLabel;
  return `${base}. Next: ${nextLabel}`;
}

function truncateTaskFocusChecklistLabel(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function createTaskDetailFields(active) {
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
  ].filter(Boolean);

  return [
    workbenchViewHelpers.createElement("div", {
      className: "workbench-task-detail-grid",
      children: fields.map(([label, value, key, multiline]) => createTaskDetailField(label, value, key, { multiline })),
    }),
  ];
}

function createTaskDetailField(label, value, key, options = {}) {
  return workbenchViewHelpers.createElement("article", {
    className: ["workbench-task-detail-field", options.multiline ? "is-multiline" : ""],
    dataset: { workbenchTaskDetailField: key },
    children: [
      workbenchViewHelpers.createElement("h3", { text: label }),
      workbenchViewHelpers.createElement("p", { text: value }),
    ],
  });
}

function taskFocusBadges(task = {}, active = state.activeTaskFocus) {
  const dueText = taskFocusDueText(task, active, { empty: "" });
  return [
    badge(formatToken(task.status || active?.status || "open"), task.status || active?.status || "open"),
    badge(formatToken(task.priority || active?.priority || "normal"), task.priority || active?.priority || "normal"),
    dueText ? badge(`Due ${dueText}`, "due") : null,
    ...taskFocusTagBadges(task),
  ].filter(Boolean);
}

function taskFocusTitle(active = state.activeTaskFocus) {
  return safeTaskFocusText(active?.task?.title || active?.title, "Focused task");
}

function taskFocusContextLabel(task = {}, active = state.activeTaskFocus) {
  const readableContext = [task.client_name, task.project_name]
    .map((value) => safeTaskFocusText(value, ""))
    .filter(Boolean)
    .join(" / ");

  return safeTaskFocusText(readableContext || active?.contextLabel || "", "");
}

function taskFocusDueText(task = {}, active = state.activeTaskFocus, options = {}) {
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

function taskFocusAssigneesText(task = {}) {
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  const labels = assignees
    .map((assignee) => safeTaskFocusText(assignee.displayName || assignee.username || "", ""))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "Unassigned";
}

function taskFocusTagBadges(task = {}) {
  const tags = Array.isArray(task.directTags) && task.directTags.length > 0
    ? task.directTags
    : Array.isArray(task.direct_tags)
      ? task.direct_tags
      : [];

  return tags
    .map((tag) => safeTaskFocusText(tag.name || tag.slug || "", ""))
    .filter(Boolean)
    .map((label) => badge(label, "tag"));
}

function safeTaskFocusText(value, fallback = "") {
  return safeCandidateText(value, fallback);
}

function candidateBadges(candidate) {
  return [
    candidate.moduleId ? badge(formatToken(candidate.moduleId), candidate.moduleId) : null,
    candidate.status ? badge(formatToken(candidate.status), candidate.status) : null,
    candidate.priority ? badge(formatToken(candidate.priority), candidate.priority) : null,
    candidate.dueAt ? badge(`Due ${formatCandidateDate(candidate.dueAt)}`, "due") : null,
  ].filter(Boolean);
}

function candidateActionLabel(candidate) {
  if (candidateTaskId(candidate)) {
    return "Focus task";
  }

  if (isManualTimerCandidate(candidate)) {
    return "Continue in Time Tracking";
  }

  if (candidateModuleAction(candidate)) {
    return candidate.primaryAction?.label || "Open work";
  }

  if (candidate.sourceUrl || candidate.primaryAction?.href) {
    return "Open work";
  }

  return candidate.primaryAction?.label || "Review";
}

async function openCandidate(candidate, trigger = null, options = {}) {
  const mode = options.mode || "candidate-primary";
  const taskId = candidateTaskId(candidate);

  if (mode === "candidate-primary") {
    if (taskId) {
      await enterTaskFocus(candidate, taskId);
      changeFocusButton?.focus?.();
      return;
    }

    // Notes and Lists have registered Workbench modal actions, so open them in place instead of
    // navigating away to their module page.
    const action = candidateModuleAction(candidate);
    if (action) {
      await openModuleActionCandidate(candidate, action, trigger);
      return;
    }

    openNonTaskFocusFallback(candidate);
    trigger?.focus?.();
    return;
  }

  if (taskId) {
    await openTaskCandidate(candidate, taskId, trigger);
    return;
  }

  const action = candidateModuleAction(candidate);

  if (action) {
    await openModuleActionCandidate(candidate, action, trigger);
    return;
  }

  openCandidateNavigationFallback(candidate);
}

async function enterTaskFocus(candidate, taskId) {
  if (!moduleEnabled("tasks")) {
    setStatus("Tasks are not available in this workspace.", { isError: true });
    return;
  }

  taskFocusExitCommitted = false;
  state.viewState = WORKBENCH_VIEW_STATE_TASK_FOCUS;
  state.activeTaskFocus = taskFocusFromCandidate(candidate, taskId);
  taskFocusInspectorCollapsed = false;
  renderWorkbench();
  setStatus("Loading focused task...");
  await refreshActiveTaskFocus();
  if (!state.activeTaskFocus?.error) {
    setStatus(`Task Focus active: ${taskFocusTitle()}`);
  }
}

function taskFocusFromCandidate(candidate, taskId) {
  return {
    candidateId: candidate.candidateId || "",
    contextLabel: safeCandidateText(candidate.contextLabel || candidate.reason || "", "Ready to review."),
    dueAt: candidate.dueAt || candidate.due_at || "",
    error: "",
    checklistError: "",
    checklistMutationItemId: "",
    isLoading: true,
    priority: candidate.priority || "",
    relatedContext: {
      error: "",
      groups: [],
      isLoading: true,
      items: [],
      taskId,
    },
    status: candidate.status || "",
    task: null,
    taskId,
    title: safeCandidateText(candidate.title, "Focused task"),
  };
}

async function refreshActiveTaskFocus() {
  const taskId = state.activeTaskFocus?.taskId || "";

  if (!taskId) {
    return;
  }

  state.activeTaskFocus = {
    ...state.activeTaskFocus,
    error: "",
    isLoading: true,
  };
  renderTaskFocusSurface();
  renderWorkbenchInspector();

  try {
    const result = await api.getJson(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    if (state.activeTaskFocus?.taskId !== taskId) {
      return;
    }
    applyActiveTaskFocusTask(result.task || null);
    renderTaskFocusSurface();
    renderWorkbenchInspector();
    renderWorkbenchViewState();
    await refreshTaskFocusRelatedContext(taskId);
  } catch (error) {
    if (state.activeTaskFocus?.taskId !== taskId) {
      return;
    }
    state.activeTaskFocus = {
      ...state.activeTaskFocus,
      error: error.message || "Focused task details could not be loaded.",
      isLoading: false,
    };
    renderTaskFocusSurface();
    renderWorkbenchInspector();
    setStatus(state.activeTaskFocus.error, { isError: true });
  }
}

async function refreshTaskFocusRelatedContext(taskId = state.activeTaskFocus?.taskId || "") {
  if (!taskId || !state.activeTaskFocus || state.activeTaskFocus.taskId !== taskId) {
    return;
  }

  state.activeTaskFocus = {
    ...state.activeTaskFocus,
    relatedContext: {
      ...taskFocusRelatedContextState(state.activeTaskFocus),
      error: "",
      groups: [],
      isLoading: true,
      items: [],
      taskId,
    },
  };
  renderTaskFocusInspector();

  try {
    const result = await api.getJson(
      `/api/workbench/task-focus/${encodeURIComponent(taskId)}/related-context`,
      { cache: "no-store" },
    );
    if (!state.activeTaskFocus || state.activeTaskFocus.taskId !== taskId) {
      return;
    }
    state.activeTaskFocus = {
      ...state.activeTaskFocus,
      relatedContext: normalizeTaskFocusRelatedContext(result, taskId),
    };
    renderTaskFocusInspector();
  } catch (error) {
    if (!state.activeTaskFocus || state.activeTaskFocus.taskId !== taskId) {
      return;
    }
    state.activeTaskFocus = {
      ...state.activeTaskFocus,
      relatedContext: {
        error: error.message || "Related task context could not be loaded.",
        groups: [],
        isLoading: false,
        items: [],
        taskId,
      },
    };
    renderTaskFocusInspector();
  }
}

function normalizeTaskFocusRelatedContext(result = {}, taskId = "") {
  const groups = (Array.isArray(result.groups) ? result.groups : [])
    .map((group) => ({
      ...group,
      items: Array.isArray(group.items) ? group.items : [],
    }));

  return {
    error: "",
    groups,
    isLoading: false,
    items: Array.isArray(result.items) ? result.items : groups.flatMap((group) => group.items || []),
    meta: result.meta || {},
    task: result.task || null,
    taskId: result.meta?.selectedTaskId || taskId,
  };
}

function applyActiveTaskFocusTask(task) {
  if (!state.activeTaskFocus) {
    return;
  }

  const nextTask = task ? preserveTaskFocusChecklistData(task, state.activeTaskFocus.task) : null;

  state.activeTaskFocus = {
    ...state.activeTaskFocus,
    checklistError: "",
    checklistMutationItemId: "",
    contextLabel: taskFocusContextLabel(nextTask || {}, state.activeTaskFocus) || state.activeTaskFocus.contextLabel,
    dueAt: nextTask?.due_at_utc || nextTask?.due_date || state.activeTaskFocus.dueAt || "",
    error: "",
    isLoading: false,
    priority: nextTask?.priority || state.activeTaskFocus.priority || "",
    status: nextTask?.status || state.activeTaskFocus.status || "",
    task: nextTask,
    title: safeTaskFocusText(nextTask?.title || state.activeTaskFocus.title, "Focused task"),
  };
}

// Some task payloads (e.g. the task timer endpoints) return the raw task row without the
// enriched `checklistItems`/`checklistProgress` that the task detail endpoint provides. Those
// mutations never touch the checklist, so carry the existing checklist data forward instead of
// letting the focused checklist section collapse until the next full refresh.
function preserveTaskFocusChecklistData(nextTask, existingTask = {}) {
  const merged = { ...nextTask };
  if (!Array.isArray(merged.checklistItems) && Array.isArray(existingTask?.checklistItems)) {
    merged.checklistItems = existingTask.checklistItems;
  }
  if (!merged.checklistProgress && existingTask?.checklistProgress) {
    merged.checklistProgress = existingTask.checklistProgress;
  }
  return merged;
}

function applyTaskFocusChecklistResult(result = {}) {
  if (!state.activeTaskFocus) {
    return;
  }

  const existingTask = state.activeTaskFocus.task || {};
  const nextTask = result.task || {
    ...existingTask,
    checklistItems: result.items || existingTask.checklistItems || [],
    checklistProgress: result.checklistProgress || existingTask.checklistProgress,
  };
  applyActiveTaskFocusTask(nextTask);
  state.activeTaskFocus = {
    ...state.activeTaskFocus,
    checklistError: "",
    checklistMutationItemId: "",
  };
}

async function openFocusedTaskEditor(event) {
  const taskId = state.activeTaskFocus?.taskId || "";

  if (!taskId) {
    setStatus("Choose a task before editing.", { isError: true });
    return;
  }

  await openTaskCandidate(activeTaskFocusCandidate(), taskId, event?.currentTarget || null);
  if (resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    await refreshActiveTaskFocus();
  }
}

async function completeFocusedTask(event) {
  const taskId = state.activeTaskFocus?.taskId || "";

  if (!taskId) {
    setStatus("Choose a task before completing it.", { isError: true });
    return;
  }

  setStatus("Completing task...");
  try {
    const result = await api.postJson(`/api/tasks/${encodeURIComponent(taskId)}/complete`, {});
    resetTaskFocusState();
    await refreshFocusCandidates();
    renderWorkbench();
    const completionDetail = {
      ...result,
      recordId: result.task?.task_id || taskId,
    };
    setTaskCompletionStatus(completionDetail);
    const returnFocusTo = document.querySelector("[data-workbench-focus-mode][data-active=\"true\"]");
    await openTaskCandidate({
      candidateId: `task-completion:${taskId}`,
      moduleId: "tasks",
      recordId: taskId,
      recordType: "task_completion_follow_up",
      title: result.task?.next_action || result.task?.title || "Task follow-up",
    }, taskId, returnFocusTo || event?.currentTarget || null, {
      focusTarget: "next_action",
    });
    if (completionDetail.recurrenceContinuity) {
      renderTaskRecurrenceContinuity(completionDetail.recurrenceContinuity);
    } else {
      setStatus("Task completed.");
    }
    focusActiveFocusQuestion();
  } catch (error) {
    setStatus(error.message || "Task was not completed.", { isError: true });
  }
}

async function blockFocusedTask(event) {
  const taskId = state.activeTaskFocus?.taskId || "";

  if (!taskId) {
    setStatus("Choose a task before blocking it.", { isError: true });
    return;
  }

  await openTaskCandidate(activeTaskFocusCandidate(), taskId, event?.currentTarget || null, {
    defaults: { status: "blocked" },
    focusTarget: "blocked_reason",
    promptBlockedReason: true,
  });
  if (resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    await refreshActiveTaskFocus();
  }
}

async function handleTaskFocusChecklistChange(event) {
  const checkbox = event.target.closest("[data-workbench-task-focus-checklist-toggle]");
  const taskId = state.activeTaskFocus?.taskId || "";
  const itemId = checkbox?.closest("[data-workbench-task-focus-checklist-item]")?.dataset.taskChecklistItem || "";

  if (!checkbox || !taskId || !itemId) {
    return;
  }

  const checked = checkbox.checked;
  state.activeTaskFocus = {
    ...state.activeTaskFocus,
    checklistError: "",
    checklistMutationItemId: itemId,
  };
  setStatus(checked ? "Checking checklist item..." : "Unchecking checklist item...");
  renderTaskFocusSurface();

  try {
    const action = checked ? "check" : "uncheck";
    const result = await api.postJson(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/${action}`,
      {},
    );
    if (state.activeTaskFocus?.taskId !== taskId) {
      return;
    }
    applyTaskFocusChecklistResult(result);
    renderWorkbench();
    setStatus(checked ? "Checklist item checked." : "Checklist item unchecked.");
  } catch (error) {
    if (state.activeTaskFocus?.taskId !== taskId) {
      return;
    }
    state.activeTaskFocus = {
      ...state.activeTaskFocus,
      checklistError: error.message || "Checklist item was not updated.",
      checklistMutationItemId: "",
    };
    renderTaskFocusSurface();
    setStatus(state.activeTaskFocus.checklistError, { isError: true });
  }
}

function activeTaskFocusCandidate() {
  const active = state.activeTaskFocus || {};
  const task = active.task || {};
  return {
    candidateId: active.candidateId || "",
    contextLabel: active.contextLabel || taskFocusContextLabel(task, active),
    moduleId: "tasks",
    recordId: active.taskId || task.task_id || "",
    recordType: "task",
    title: taskFocusTitle(active),
  };
}

async function changeFocus(event) {
  if (resolvedWorkbenchViewState() !== WORKBENCH_VIEW_STATE_TASK_FOCUS) {
    return;
  }

  const continueChangeFocus = () => {
    resetTaskFocusState();
    renderWorkbench();
    setStatus("Choose the next focus.");
    focusActiveFocusQuestion();
  };
  if (window.LongtailForge.navigationIntent) {
    await window.LongtailForge.navigationIntent.request({
      kind: "workbench-change-focus",
      trigger: event?.currentTarget || null,
      continue: continueChangeFocus,
    });
    return;
  }
  continueChangeFocus();
}

function focusActiveFocusQuestion() {
  const activeButton = document.querySelector("[data-workbench-focus-mode][data-active=\"true\"]");

  if (activeButton && typeof activeButton.focus === "function") {
    activeButton.focus();
    return;
  }

  focusModeList?.querySelector("button")?.focus?.();
}

async function openTaskCandidate(candidate, taskId, trigger = null, editorOptions = {}) {
  if (!moduleEnabled("tasks")) {
    setStatus("Tasks are not available in this workspace.", { isError: true });
    return;
  }

  setStatus("Opening task...");
  try {
    await ensureWorkbenchModuleAction("tasks.edit");
    const result = await window.LongtailForge.moduleActions.open("tasks.edit", {
      context: {
        source: "workbench",
        sourceType: "work-candidate",
      },
      candidateId: candidate.candidateId || "",
      defaults: editorOptions.defaults || {},
      focusTarget: editorOptions.focusTarget || "",
      promptBlockedReason: editorOptions.promptBlockedReason === true,
      recordId: taskId,
      returnFocusTo: trigger || document.activeElement,
      taskId,
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      const detail = result.detail || {};
      if (detail.taskLifecycleAction === "complete") {
        resetTaskFocusState();
        await refreshFocusCandidates();
        renderWorkbench();
        setTaskCompletionStatus(detail);
        focusActiveFocusQuestion();
        return;
      }
      setStatus("Task updated.");
      return;
    }
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task could not be opened.", { isError: true });
  }
}

function openNonTaskFocusFallback(candidate) {
  const href = candidatePageFallback(candidate);

  if (href) {
    setStatus(isManualTimerCandidate(candidate)
      ? "Continuing this timer in Time Tracking."
      : "Opening this work in its module page until Task Focus supports this type.");
    navigateFromWorkbench(href, "work-candidate-fallback");
    return;
  }

  setStatus("Task Focus is currently available for task candidates only. This work type needs an explicit page fallback.", { isError: true });
}

async function openModuleActionCandidate(candidate, action, trigger = null) {
  if (action.moduleId && !moduleEnabled(action.moduleId)) {
    setStatus(`${action.moduleLabel} is not available in this workspace.`, { isError: true });
    return;
  }

  setStatus(`Opening ${action.moduleLabel.toLowerCase()}...`);
  try {
    await ensureWorkbenchModuleAction(action.actionId);
    const result = await window.LongtailForge.moduleActions.open(action.actionId, {
      ...(action.params || {}),
      context: {
        source: "workbench",
        sourceType: "work-candidate",
      },
      candidateId: candidate.candidateId || "",
      recordId: action.recordId,
      returnFocusTo: trigger || document.activeElement,
      [action.recordParam]: action.recordId,
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      setStatus(`${action.moduleLabel} updated.`);
      return;
    }
    setStatus("");
  } catch (error) {
    setStatus(error.message || `${action.moduleLabel} could not be opened.`, { isError: true });
  }
}

async function openTaskFocusRelatedContextItem(item = {}, trigger = null) {
  const action = item.action || {};

  if (action.type === "module-action" && action.moduleActionId) {
    await openRelatedContextModuleAction(item, action, trigger);
    return;
  }

  if (action.fallbackUrl) {
    setStatus(`Opening ${relatedContextSourceLabel(item).toLowerCase()}...`);
    navigateFromWorkbench(action.fallbackUrl, "related-context-fallback");
    return;
  }

  setStatus("This related item does not have a safe opener yet.", { isError: true });
}

async function openRelatedContextModuleAction(item = {}, action = {}, trigger = null) {
  const sourceLabel = relatedContextSourceLabel(item);
  const params = {
    ...(action.params || {}),
    context: {
      source: "workbench",
      sourceTaskId: state.activeTaskFocus?.taskId || "",
      sourceType: "task-focus-related-context",
    },
    recordId: item.recordId || "",
    returnFocusTo: trigger || document.activeElement,
  };

  setStatus(`Opening ${sourceLabel.toLowerCase()}...`);
  try {
    await ensureWorkbenchModuleAction(action.moduleActionId);
    const result = await window.LongtailForge.moduleActions.open(action.moduleActionId, params, {
      refresh: loadWorkbench,
      setStatus,
    });
    if (result.completed) {
      setStatus(`${sourceLabel} opened.`);
      return;
    }
    setStatus("");
  } catch (error) {
    if (action.fallbackUrl) {
      setStatus(`Opening ${sourceLabel.toLowerCase()} in its module page.`);
      navigateFromWorkbench(action.fallbackUrl, "related-context-error-fallback");
      return;
    }
    setStatus(error.message || `${sourceLabel} could not be opened.`, { isError: true });
  }
}

function ensureWorkbenchFilePreviewAction(actionId) {
  if (actionId !== "files.preview" || !window.LongtailForge?.filePreview?.openFilePreview) {
    return;
  }
  if (window.LongtailForge.filesDialog?.openFilePreviewAction) {
    return;
  }

  const existingFilesDialog = window.LongtailForge.filesDialog || {};
  window.LongtailForge.filesDialog = Object.freeze({
    ...existingFilesDialog,
    openFilePreviewAction: (params = {}, hostContext = null) => {
      const attachmentOrRow = params.attachment || params.row || params.file || params;
      return window.LongtailForge.filePreview.openFilePreview(attachmentOrRow, {
        trigger: params.returnFocusTo || hostContext?.trigger || null,
      });
    },
  });
  window.LongtailForge.moduleActions?.register?.({
    actionId: "files.preview",
    id: "files.preview",
    label: "Preview File",
    mode: "preview",
    moduleId: "framework",
    open: window.LongtailForge.filesDialog.openFilePreviewAction,
    recordType: "file_attachment",
    requiredPermissions: ["files.view"],
    title: "Preview File",
  });
}

function openCandidateNavigationFallback(candidate) {
  const href = candidatePageFallback(candidate);

  if (href) {
    setStatus(isManualTimerCandidate(candidate)
      ? "Continuing this timer in Time Tracking."
      : "Opening this work in its module page.");
    navigateFromWorkbench(href, "work-candidate-navigation");
    return;
  }

  setStatus("This recommendation does not have an in-place editor or page fallback yet.", { isError: true });
}

function navigateFromWorkbench(href, kind = "workbench-navigation") {
  if (window.LongtailForge.navigationIntent) {
    void window.LongtailForge.navigationIntent.navigate(href, { kind });
    return;
  }
  window.location.href = href;
}

function candidateTaskId(candidate = {}) {
  if (candidate.moduleId === "tasks" && candidate.recordType === "task" && candidate.recordId) {
    return candidate.recordId;
  }

  return "";
}

function candidateModuleAction(candidate = {}) {
  const primaryAction = candidate.primaryAction || {};
  if (primaryAction.type === "module-action" && primaryAction.id && candidate.moduleId && candidate.recordId) {
    return {
      actionId: primaryAction.id,
      moduleId: candidate.moduleId,
      moduleLabel: formatToken(candidate.moduleId) || "Work",
      params: primaryAction.params || {},
      recordId: candidate.recordId,
      recordParam: "recordId",
    };
  }

  if (candidate.moduleId === "notes" && candidate.recordType === "note" && candidate.recordId) {
    return {
      actionId: "notes.view",
      moduleId: "notes",
      moduleLabel: "Note",
      recordId: candidate.recordId,
      recordParam: "noteId",
    };
  }

  if (candidate.moduleId === "lists" && candidate.recordType === "list" && candidate.recordId) {
    return {
      actionId: "lists.edit",
      moduleId: "lists",
      moduleLabel: "List",
      recordId: candidate.recordId,
      recordParam: "listId",
    };
  }

  return null;
}

async function refreshWorkbenchTimers() {
  const card = (state.registry.workbenchCards || []).find((entry) => entry.renderer === "active-work-timers");

  if (!card) {
    return;
  }

  try {
    const sourceData = await loadTimerCardData(card);
    state.timers = sourceData.timers;
    renderTimers();
  } catch (error) {
    setStatus(error.message || "Timers could not be refreshed.", { isError: true });
  }
}

function isManualTimerCandidate(candidate = {}) {
  return candidate.moduleId === "time-tracking"
    && candidate.recordType === "active_work_timer"
    && (candidate.metadata?.source_type || "manual") === "manual";
}

function candidatePageFallback(candidate = {}) {
  if (isManualTimerCandidate(candidate)) {
    return "time-tracker.html";
  }

  return candidate.primaryAction?.href || candidate.sourceUrl || "";
}

function candidateCanOpen(candidate = {}) {
  return Boolean(candidateTaskId(candidate)
    || candidateModuleAction(candidate)
    || isManualTimerCandidate(candidate)
    || candidate.sourceUrl
    || candidate.primaryAction?.href);
}

function inspectorCandidateKey(candidate = {}) {
  return [
    candidate.moduleId || "",
    candidate.recordType || "",
    candidate.recordId || "",
    candidate.candidateId || "",
  ].join(":");
}

function inspectorCandidateTitle(candidate = {}) {
  const title = String(candidate.title || "").trim();

  if (title && !looksLikeRawId(title)) {
    return title;
  }

  const label = formatToken(candidate.recordType || candidate.moduleId || "work");
  return label ? `${label} context` : "Work context";
}

function inspectorCandidateContext(candidate = {}) {
  const context = String(candidate.contextLabel || "").trim();

  if (context && !looksLikeRawId(context)) {
    return context;
  }

  const reason = String(candidate.reason || candidate.nextAction || "").trim();
  if (reason && !looksLikeRawId(reason)) {
    return reason;
  }

  return "Ready to review.";
}

function relatedContextTitle(item = {}) {
  return safeRelatedContextText(item.title, `${formatToken(item.recordType || item.moduleId || "Related")} context`);
}

function relatedContextSourceLabel(item = {}) {
  return safeRelatedContextText(item.sourceLabel, formatToken(item.moduleId || item.recordType || "Related"));
}

function relatedContextContextLabel(item = {}) {
  const parts = [
    relatedContextSourceLabel(item),
    safeRelatedContextText(item.reasonLabel, ""),
    safeRelatedContextText(item.contextLabel, ""),
  ].filter(Boolean);
  const uniqueParts = [...new Set(parts)];

  return uniqueParts.join(" - ") || "Related context";
}

function relatedContextBadges(item = {}) {
  return (Array.isArray(item.badges) ? item.badges : [])
    .map((itemBadge) => {
      const label = safeRelatedContextText(itemBadge.label, "");
      if (!label) {
        return null;
      }
      return badge(label, itemBadge.type || itemBadge.slug || "related");
    })
    .filter(Boolean)
    .slice(0, 4);
}

function relatedContextCanOpen(item = {}) {
  const action = item.action || {};
  return Boolean((action.type === "module-action" && action.moduleActionId) || action.fallbackUrl);
}

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

function safeRelatedContextText(value, fallback = "") {
  const text = String(value || "").trim();
  return text && !looksLikeRawId(text) ? text : fallback;
}

function safeCandidateText(value, fallback = "") {
  const text = String(value || "").trim();

  return text && !looksLikeRawId(text) ? text : fallback;
}

function looksLikeRawId(value) {
  // Matches embedded identifiers too ("Timer Paused for <uuid>."), not only
  // whole-string ids: copy that carries a raw id anywhere is not user-safe.
  const text = String(value || "").trim();
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text) ||
    /\b[0-9a-f]{24,}\b/i.test(text);
}

async function ensureWorkbenchModuleAction(actionId) {
  ensureWorkbenchFilePreviewAction(actionId);
  const dependencies = WORKBENCH_MODULE_ACTION_DEPENDENCIES[actionId] || [];

  for (const dependency of dependencies) {
    await loadWorkbenchActionDependency(dependency);
  }

  if (!window.LongtailForge?.moduleActions?.open) {
    throw new Error("Module action registry is unavailable.");
  }
}

function loadWorkbenchActionDependency(dependency) {
  if (dependency.test?.()) {
    return Promise.resolve();
  }

  const versionedSrc = window.LongtailForge?.assetVersion?.url(dependency.src) || dependency.src;
  const key = new window.URL(versionedSrc, document.baseURI).href;
  if (workbenchActionScriptLoads.has(key)) {
    return workbenchActionScriptLoads.get(key);
  }

  const promise = dependency.module
    ? import(key)
    : new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = versionedSrc;
        script.async = false;
        script.addEventListener("load", () => resolve());
        script.addEventListener("error", () => reject(new Error(`Could not load ${dependency.src}.`)));
        document.body.appendChild(script);
      });

  const checkedPromise = promise.then(() => {
    if (!dependency.test?.()) {
      throw new Error(`Loaded ${dependency.src}, but the expected helper is unavailable.`);
    }
  });

  workbenchActionScriptLoads.set(key, checkedPromise);
  return checkedPromise;
}

async function handleFocusModeClick(event) {
  const button = event.target.closest("[data-workbench-focus-mode]");

  if (!button) {
    return;
  }

  await selectFocusMode(button.dataset.workbenchFocusMode || DEFAULT_FOCUS_MODE_ID);
}

async function handleClientFocusChange() {
  resetTaskFocusState();
  state.selectedClientId = resolveClientSelection(clientFocusInput.value || "", state.clients, state.workspaceType);
  state.selectedProjectId = resolveProjectSelection(state.selectedProjectId, state.clients, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_CLIENT_FOCUS_KEY, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_PROJECT_FOCUS_KEY, state.selectedProjectId);
  populateFocusScopeOptions();
  await refreshFocusCandidates();
}

async function handleProjectFocusChange() {
  resetTaskFocusState();
  state.selectedProjectId = resolveProjectSelection(projectFocusInput.value || "", state.clients, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_PROJECT_FOCUS_KEY, state.selectedProjectId);
  await refreshFocusCandidates();
}

async function selectFocusMode(modeId) {
  resetTaskFocusState();
  state.focusModeId = resolveFocusModeSelection(modeId, state.focusModes);
  window.localStorage.setItem(WORKBENCH_FOCUS_MODE_KEY, state.focusModeId);

  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    state.focusCandidates = [];
    state.focusContext = null;
    state.recommendedCandidateIndex = 0;
    renderWorkbenchStatus();
    renderFocusModes();
    renderRecommendedAction();
    renderWorkbenchInspector();
    projectFocusInput?.focus();
    return;
  }

  await refreshFocusCandidates();
}

async function refreshFocusCandidates() {
  setStatus("Loading focus...");
  try {
    const focusData = await loadFocusCandidatesForState();
    state.focusCandidates = Array.isArray(focusData?.items) ? focusData.items : [];
    state.focusContext = focusData?.focusContext || null;
    state.recommendedCandidateIndex = 0;
    renderFocusModes();
    renderRecommendedAction();
    renderWorkbenchInspector();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Focus could not be loaded.", { isError: true });
  }
}

function renderRegisteredWorkbenchCards() {
  const activeCards = new Map((state.registry.workbenchCards || []).map((card) => [card.renderer, card]));

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    const rendererId = card.dataset.workbenchRenderer || "";
    const contribution = activeCards.get(rendererId);
    const renderer = workbenchCardRenderers[rendererId];

    card.hidden = !contribution || !renderer;

    if (contribution && renderer) {
      renderer(contribution);
    }
  });
}

function renderTimers() {
  const timers = sortedTimers(visibleTimerPanelTimers());
  const emptyMessage = timerPanelEmptyStateText();

  updateTimerSectionTitle();
  timerCountText.textContent = String(timers.length);
  timerList.replaceChildren();
  syncTimerSectionOpenState();

  if (timers.length === 0) {
    timerList.appendChild(emptyState(emptyMessage));
    return;
  }

  timers.forEach((timer) => timerList.appendChild(createTimerCard(timer)));
  flashActivatedTimer(timers);
}

function createTimerCard(timer) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const body = document.createElement("div");
  const title = document.createElement("span");
  const meta = document.createElement("span");
  const sourceBadge = badge(sourceLabel(timer), timer.source_enabled ? "" : "disabled");
  const stateBadge = badge(formatToken(timer.timer_status), timer.timer_status);
  const duration = document.createElement("strong");
  const context = document.createElement("p");
  const description = document.createElement("p");
  const actions = document.createElement("div");

  details.className = "workbench-timer-card";
  details.dataset.workbenchTimerKey = timerKey(timer);
  body.className = "workbench-timer-body";
  title.className = "workbench-timer-title";
  meta.className = "workbench-card-meta";
  duration.className = "workbench-duration";
  duration.dataset.workbenchDuration = timer.active_timer_id;
  duration.textContent = formatDuration(readElapsedSeconds(timer));
  context.textContent = [timer.client_name, timer.project_name].filter(Boolean).join(" / ") || "Project timer";
  description.textContent = timer.description || timer.source_label || "";
  title.textContent = timer.source_label || timer.description || "Project timer";
  meta.append(sourceBadge, stateBadge);
  if (!timer.source_enabled) {
    meta.append(badge("Recovery", "recovery"));
  }
  summary.append(title, meta);
  summary.setAttribute("aria-expanded", "false");

  actions.className = "workbench-actions";
  const running = timer.timer_status === "running";
  const canUseSourceActions = timer.source_type === "manual" || timer.source_enabled;
  const startButton = actionButton("Start", () => startExistingTimer(timer));
  const pauseButton = actionButton("Pause", () => pauseExistingTimer(timer));
  const saveButton = actionButton("Save & End", () => finalizeTimer(timer));
  const discardButton = actionButton("Discard", () => discardTimer(timer), { danger: true });

  startButton.disabled = running || !moduleEnabled("time-tracking") || !canUseSourceActions;
  pauseButton.disabled = !running || !moduleEnabled("time-tracking");
  saveButton.disabled = !moduleEnabled("time-tracking");
  discardButton.disabled = !moduleEnabled("time-tracking");
  actions.append(startButton, pauseButton, saveButton, discardButton);
  body.append(duration, context, description, actions);
  details.append(summary, body);
  details.addEventListener("toggle", handleDisclosureToggle);
  setWorkbenchDisclosureOpen(details, true);
  return details;
}

async function startExistingTimer(timer) {
  pendingActivatedTimerKey = timerKey(timer);
  if (timer.source_type === "task" && timer.source_enabled) {
    await saveTaskTimer(timer.source_id, "running", readElapsedSeconds(timer), timer.active_timer_id);
    return;
  }

  await updateTimerStatus(timer, "running");
}

async function pauseExistingTimer(timer) {
  if (timer.source_type === "task" && timer.source_enabled) {
    const result = await saveTaskTimer(timer.source_id, "paused", readElapsedSeconds(timer), timer.active_timer_id);
    if (result?.task) {
      offerTaskResumeNote(result.task);
    }
    return;
  }

  await updateTimerStatus(timer, "paused");
}

async function updateTimerStatus(timer, timerStatus) {
  setStatus(timerStatus === "running" ? "Starting timer..." : "Pausing timer...");
  try {
    await api.putJson(`/api/workbench/timers/${encodeURIComponent(timer.timer_slot)}/status`, {
      accumulated_elapsed_seconds: readElapsedSeconds(timer),
      last_active_start_time: new Date().toISOString(),
      timer_status: timerStatus,
    });
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Timer could not be updated.", { isError: true });
  }
}

async function saveTaskTimer(taskId, timerStatus, elapsedSeconds, activeTimerId = "") {
  setStatus(timerStatus === "running" ? "Starting task timer..." : "Pausing task timer...");
  try {
    const result = await api.putJson(`/api/tasks/${encodeURIComponent(taskId)}/timer`, {
      active_task_timer_id: activeTimerId,
      timer_status: timerStatus,
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: new Date().toISOString(),
    });
    await loadWorkbench();
    return result;
  } catch (error) {
    setStatus(error.message || "Task timer could not be updated.", { isError: true });
    return null;
  }
}

async function saveFocusedTaskTimer(timerStatus) {
  const taskId = state.activeTaskFocus?.taskId || "";
  const timer = currentTaskFocusTimer();

  if (!taskId) {
    setStatus("Choose a task before using a task timer.", { isError: true });
    return;
  }

  if (timerStatus === "running") {
    pendingActivatedTimerKey = `task:${taskId}`;
  }
  setStatus(timerStatus === "running" ? "Starting task timer..." : "Pausing task timer...");

  try {
    const result = await api.putJson(`/api/tasks/${encodeURIComponent(taskId)}/timer`, {
      active_task_timer_id: timer?.active_task_timer_id || timer?.active_timer_id || "",
      timer_status: timerStatus,
      accumulated_elapsed_seconds: readElapsedSeconds(timer),
      last_active_start_time: new Date().toISOString(),
    });
    await refreshWorkbenchAfterTaskFocusTimerMutation(result, taskId);
    if (timerStatus === "paused") {
      offerTaskResumeNote(result.task || state.activeTaskFocus?.task);
    }
    setStatus(timerStatus === "running" ? "Task timer started." : "Task timer paused.");
  } catch (error) {
    setStatus(error.message || "Task timer could not be updated.", { isError: true });
  }
}

async function finalizeFocusedTaskTimer(event) {
  const taskId = state.activeTaskFocus?.taskId || "";
  const timer = currentTaskFocusTimer();

  if (!taskId || !timer) {
    setStatus("Start a task timer before saving time.", { isError: true });
    return;
  }

  setStatus("Saving task timer...");
  try {
    const result = await api.postJson(`/api/tasks/${encodeURIComponent(taskId)}/timer/finalize`, {
      duration_seconds: Math.max(1, readElapsedSeconds(timer)),
      end_time: new Date().toISOString(),
    });
    await refreshWorkbenchAfterTaskFocusTimerMutation(result, taskId);
    offerTaskResumeNote(result.task || state.activeTaskFocus?.task, event?.currentTarget || null);
    setStatus("Task time saved.");
  } catch (error) {
    setStatus(error.message || "Task time could not be saved.", { isError: true });
  }
}

async function resetFocusedTaskTimer() {
  const taskId = state.activeTaskFocus?.taskId || "";
  const taskTitle = taskFocusTitle();

  if (!taskId || !currentTaskFocusTimer()) {
    setStatus("No task timer is active.", { isError: true });
    return;
  }

  const confirmed = await modal.confirm({
    title: "Reset task timer",
    message: `Reset the timer for "${taskTitle}"?`,
    confirmLabel: "Reset",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Resetting task timer...");
  try {
    const result = await api.deleteJson(`/api/tasks/${encodeURIComponent(taskId)}/timer`);
    await refreshWorkbenchAfterTaskFocusTimerMutation(result, taskId);
    setStatus("Task timer reset.");
  } catch (error) {
    setStatus(error.message || "Task timer could not be reset.", { isError: true });
  }
}

async function refreshWorkbenchAfterTaskFocusTimerMutation(result, taskId) {
  if (result?.task && state.activeTaskFocus?.taskId === taskId) {
    applyActiveTaskFocusTask(result.task);
  }

  await loadWorkbench();

  if (result?.task && state.activeTaskFocus?.taskId === taskId) {
    applyActiveTaskFocusTask(result.task);
    renderTaskFocusSurface();
    renderWorkbenchInspector();
    renderWorkbenchViewState();
  }
}

async function openAddTaskAction() {
  setStatus("Opening task form...");
  try {
    await ensureWorkbenchModuleAction("tasks.add");
    const result = await window.LongtailForge.moduleActions.open("tasks.add", {
      context: { source: "workbench" },
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      setStatus("Task created.");
      return;
    }
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Task form could not be opened.", { isError: true });
  }
}

function setTaskCompletionStatus(detail = {}) {
  const continuity = detail.recurrenceContinuity || null;
  if (continuity) {
    renderTaskRecurrenceContinuity(continuity);
    trackTaskRecurrenceContinuity(detail.recordId || detail.task?.task_id || "", continuity);
    return;
  }
  setStatus("Task completed.");
}

function renderTaskRecurrenceContinuity(continuity) {
  const tasksDialog = window.LongtailForge.tasksDialog;
  const message = tasksDialog?.recurrenceContinuityMessage?.(continuity) || "Task completed.";
  setStatus(message);
  tasksDialog?.renderRecurrenceContinuity?.(statusText, continuity);
}

function trackTaskRecurrenceContinuity(taskId, initialContinuity) {
  if (!taskId || initialContinuity?.status !== "pending") {
    return;
  }

  const tracker = Symbol(taskId);
  recurrenceContinuityTrackers.set(taskId, tracker);
  window.LongtailForge.tasksDialog?.pollRecurrenceContinuity?.(taskId, {
    initialContinuity,
    onUpdate: async (continuity) => {
      if (recurrenceContinuityTrackers.get(taskId) !== tracker) {
        return;
      }
      if (continuity?.status === "available") {
        await refreshFocusCandidates();
      }
      renderTaskRecurrenceContinuity(continuity);
    },
  }).catch(() => {
    // Preserve the scheduled-date message; a later read or recurrence sweep can converge it.
  }).finally(() => {
    if (recurrenceContinuityTrackers.get(taskId) === tracker) {
      recurrenceContinuityTrackers.delete(taskId);
    }
  });
}

async function finalizeTimer(timer) {
  if (timer.source_type === "task" && timer.source_enabled && timer.source_id) {
    await finalizeSourceTaskTimer(timer);
    return;
  }

  const durationSeconds = Math.max(1, readElapsedSeconds(timer));
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - durationSeconds * 1000);

  setStatus("Saving time...");
  try {
    await api.postJson(`/api/active-timers/${encodeURIComponent(timer.timer_slot)}/finalize`, {
      client_id: timer.client_id,
      client_name: timer.client_name,
      project_id: timer.project_id,
      project_name: timer.project_name,
      description: timer.description || timer.source_label,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
      duration_hours: (durationSeconds / 3600).toFixed(4),
      billable: timer.billable,
      invoice_status: "unbilled",
    });
    await loadWorkbench();
    setStatus("Time saved.");
  } catch (error) {
    setStatus(error.message || "Time could not be saved.", { isError: true });
  }
}

async function finalizeSourceTaskTimer(timer) {
  const durationSeconds = Math.max(1, readElapsedSeconds(timer));

  setStatus("Saving task timer...");
  try {
    const result = await api.postJson(`/api/tasks/${encodeURIComponent(timer.source_id)}/timer/finalize`, {
      duration_seconds: durationSeconds,
      end_time: new Date().toISOString(),
    });
    await loadWorkbench();
    offerTaskResumeNote(result.task);
    setStatus("Task time saved.");
  } catch (error) {
    setStatus(error.message || "Task time could not be saved.", { isError: true });
  }
}

function offerTaskResumeNote(task, trigger = null) {
  void window.LongtailForge.taskResumeNoteCapture?.offer({
    task,
    trigger,
    onSaved(updatedTask) {
      if (updatedTask?.task_id === state.activeTaskFocus?.taskId) {
        applyActiveTaskFocusTask(updatedTask);
        renderTaskFocusSurface();
      }
    },
    onError(error) {
      setStatus(error.message || "Resume note could not be saved.", { isError: true });
    },
  });
}

async function discardTimer(timer) {
  const confirmed = await modal.confirm({
    title: "Discard timer",
    message: `Discard "${timer.source_label || timer.description || "this timer"}"?`,
    confirmLabel: "Discard",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Discarding timer...");
  try {
    if (timer.source_type === "task" && timer.source_enabled && timer.source_id) {
      await api.deleteJson(`/api/tasks/${encodeURIComponent(timer.source_id)}/timer`);
    } else {
      await api.deleteJson(`/api/active-timers/${encodeURIComponent(timer.timer_slot)}`);
    }
    await loadWorkbench();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Timer could not be discarded.", { isError: true });
  }
}

function flashActivatedTimer(timers) {
  if (!pendingActivatedTimerKey) {
    return;
  }

  const activatedTimer = timers.find((timer) =>
    timer.timer_status === "running" && timerKey(timer) === pendingActivatedTimerKey,
  );
  pendingActivatedTimerKey = "";

  if (!activatedTimer) {
    return;
  }

  const card = timerList.querySelector(`[data-workbench-timer-key="${cssEscape(timerKey(activatedTimer))}"]`);
  if (card) {
    flashElement(card, "is-newly-active");
  }
}

function flashElement(element, className) {
  element.classList.remove(className);
  window.setTimeout(() => {
    const handleAnimationEnd = () => {
      element.classList.remove(className);
      element.removeEventListener("animationend", handleAnimationEnd);
    };

    element.addEventListener("animationend", handleAnimationEnd);
    element.classList.add(className);
  }, 0);
}

function sortedTimers(timers) {
  return [...timers].sort((first, second) => {
    if (first.timer_status !== second.timer_status) {
      return first.timer_status === "running" ? -1 : 1;
    }
    return String(second.updated_at || "").localeCompare(String(first.updated_at || ""));
  });
}

function activeOrPausedTimers(timers = []) {
  return (Array.isArray(timers) ? timers : []).filter((timer) => ["running", "paused"].includes(timer?.timer_status));
}

function visibleTimerPanelTimers() {
  const timers = activeOrPausedTimers(state.timers).filter((timer) => (
    taskTimerSurfaceAvailable() || !isTaskTimer(timer)
  ));

  if (!isTaskFocusView()) {
    return timers;
  }

  const focusedTaskId = currentTaskFocusId();
  return timers.filter((timer) => !taskTimerMatches(timer, focusedTaskId));
}

function isTaskTimer(timer) {
  return Boolean(
    timer?.source_type === "task" || timer?.source_module_id === "tasks" || timer?.active_task_timer_id,
  );
}

function taskTimerSurfaceAvailable() {
  const options = state.taskOptions || {};
  return moduleEnabled("tasks") &&
    moduleEnabled("time-tracking") &&
    options.timeTrackingEnabled !== false &&
    options.taskTimersEnabled !== false;
}

function currentTaskFocusId() {
  if (!isTaskFocusView()) {
    return "";
  }

  return String(state.activeTaskFocus?.taskId || state.activeTaskFocus?.task?.task_id || "");
}

function timerPanelEmptyStateText() {
  return isTaskFocusView() ? "No other active or paused timers." : "No active or paused timers.";
}

function updateTimerSectionTitle() {
  const title = timerSectionElement?.querySelector(".workbench-section-title");

  if (title) {
    title.textContent = isTaskFocusView() ? "Other Active Timers" : "Timers";
  }
}

function isTaskFocusView() {
  return resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS;
}

function timerKey(timer) {
  if (timer.source_type === "task" && timer.source_id) {
    return `task:${timer.source_id}`;
  }

  if (timer.source_type === "manual") {
    return `manual-slot:${timer.timer_slot}`;
  }

  return `timer:${timer.active_timer_id || timer.timer_slot || ""}`;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replaceAll('"', '\\"');
}

function handleDisclosureToggle(event) {
  updateDisclosureExpandedState(event.currentTarget);
}

function handleWorkbenchCardToggle(event) {
  const card = event.currentTarget;

  updateDisclosureExpandedState(card);
  if (isTimerWorkbenchCard(card)) {
    if (event.isTrusted) {
      timerSectionUserToggled = true;
    }
    return;
  }

  persistCardState();
}

function markTimerSectionUserToggle(event) {
  if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) {
    return;
  }
  timerSectionUserToggled = true;
}

function syncTimerSectionOpenState() {
  if (!timerSectionElement) {
    return;
  }
  if (!timerSectionUserToggled) {
    setWorkbenchDisclosureOpen(timerSectionElement, shouldOpenTimerSectionByDefault());
  } else {
    updateDisclosureExpandedState(timerSectionElement);
  }
}

function setWorkbenchDisclosureOpen(details, open) {
  if (!details) {
    return;
  }
  details.open = Boolean(open);
  updateDisclosureExpandedState(details);
}

function updateDisclosureExpandedState(details) {
  const summary = details?.querySelector("summary");

  if (!summary) {
    return;
  }

  const expanded = details.open ? "true" : "false";
  summary.setAttribute("aria-expanded", expanded);
  details.dataset.workbenchExpanded = expanded;
}

function hasActiveOrPausedTimers() {
  return visibleTimerPanelTimers().length > 0;
}

function shouldOpenTimerSectionByDefault() {
  return isTaskFocusView() || hasActiveOrPausedTimers();
}

function isTimerWorkbenchCard(card) {
  return card?.dataset?.workbenchCard === "active-work-timers";
}

function restoreCardState() {
  const savedState = readCardState();

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    const cardId = card.dataset.workbenchCard;
    if (isTimerWorkbenchCard(card)) {
      return;
    }
    if (Object.hasOwn(savedState, cardId)) {
      setWorkbenchDisclosureOpen(card, savedState[cardId]);
    }
  });
  syncTimerSectionOpenState();
}

function persistCardState() {
  const stateByCard = {};

  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    if (isTimerWorkbenchCard(card)) {
      return;
    }
    stateByCard[card.dataset.workbenchCard] = card.open;
  });
  window.localStorage.setItem(WORKBENCH_CARD_STATE_KEY, JSON.stringify(stateByCard));
}

function readCardState() {
  try {
    const value = JSON.parse(window.localStorage.getItem(WORKBENCH_CARD_STATE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function startTicking() {
  if (tickIntervalId) {
    window.clearInterval(tickIntervalId);
  }

  tickIntervalId = window.setInterval(() => {
    state.timers.forEach((timer) => {
      const element = document.querySelector(`[data-workbench-duration="${timer.active_timer_id}"]`);
      if (element) {
        element.textContent = formatDuration(readElapsedSeconds(timer));
      }
    });
  }, 1000);
}

function readElapsedSeconds(timer) {
  if (!timer) {
    return 0;
  }

  const baseSeconds = Number.parseInt(timer.accumulated_elapsed_seconds, 10) || 0;
  if (timer.timer_status !== "running" || !timer.last_active_start_time) {
    return baseSeconds;
  }

  const startedAt = new Date(timer.last_active_start_time).getTime();
  return baseSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function curateFocusModes(modes = []) {
  const modesById = new Map((Array.isArray(modes) ? modes : []).map((mode) => [mode.id, mode]));

  return GUIDED_FOCUS_MODE_IDS
    .map((modeId) => modesById.get(modeId))
    .filter(Boolean);
}

function resolveFocusModeSelection(modeId, modes = []) {
  const available = new Set(modes.map((mode) => mode.id));

  if (available.has(modeId)) {
    return modeId;
  }
  if (available.has(DEFAULT_FOCUS_MODE_ID)) {
    return DEFAULT_FOCUS_MODE_ID;
  }

  return modes[0]?.id || DEFAULT_FOCUS_MODE_ID;
}

function restoreFocusState() {
  state.focusModeId = window.localStorage.getItem(WORKBENCH_FOCUS_MODE_KEY) || DEFAULT_FOCUS_MODE_ID;
  state.selectedClientId = window.localStorage.getItem(WORKBENCH_CLIENT_FOCUS_KEY) || "";
  state.selectedProjectId = window.localStorage.getItem(WORKBENCH_PROJECT_FOCUS_KEY) || "";
}

function resolveClientSelection(clientId, clients = [], workspaceType = state.workspaceType) {
  const value = String(clientId || "").trim();

  if (!usesClientScope(workspaceType) || !value) {
    return "";
  }

  return clients.some((client) => client.id === value) ? value : "";
}

function resolveProjectSelection(projectId, clients = [], clientId = state.selectedClientId) {
  const value = String(projectId || "").trim();
  const projects = projectFocusOptions(clients, clientId);

  if (value && projects.some((project) => project.id === value)) {
    return value;
  }

  return "";
}

function clientFocusOptions(clients = state.clients) {
  return (clients || []).filter((client) => client?.id);
}

function projectFocusOptions(clients = state.clients, clientId = state.selectedClientId) {
  const projects = [];
  const seen = new Set();
  const selectedClientId = String(clientId || "").trim();
  const scopedClientIds = selectedClientId ? descendantClientScopeIds(clients, selectedClientId) : [];
  const scopedClients = selectedClientId
    ? (clients || []).filter((client) => scopedClientIds.includes(client.id))
    : (clients || []);

  scopedClients.forEach((client) => {
    (client.projects || []).forEach((project) => {
      if (!project.id || seen.has(project.id)) {
        return;
      }
      seen.add(project.id);
      projects.push({
        id: project.id,
        label: [
          selectedClientId || client.isWorkspaceScope ? "" : clientOptionLabel(client),
          project.optionLabel || project.displayName || project.name,
        ]
          .filter(Boolean)
          .join(" / "),
      });
    });
  });

  return projects;
}

function descendantClientScopeIds(clients = state.clients, clientId = "") {
  const normalizedClientId = String(clientId || "").trim();

  if (!normalizedClientId) {
    return [];
  }

  const descendants = new Set([normalizedClientId]);
  const pending = [normalizedClientId];

  while (pending.length > 0) {
    const currentId = pending.pop();

    (clients || []).forEach((client) => {
      const candidateId = String(client?.id || "").trim();
      const parentId = String(client?.parent_client_id || "").trim();

      if (!candidateId || descendants.has(candidateId) || parentId !== currentId) {
        return;
      }

      descendants.add(candidateId);
      pending.push(candidateId);
    });
  }

  return [...descendants];
}

function normalizeClientProjectOptions(data) {
  return window.LongtailForge.clientProjectOptions.normalizeClients(data);
}

function clientOptionLabel(client) {
  return window.LongtailForge.clientProjectOptions.optionLabel(client);
}

function selectedClientCandidateScopeId() {
  const client = state.clients.find((item) => item.id === state.selectedClientId);

  if (!usesClientScope() || !client || client.isWorkspaceScope) {
    return "";
  }

  return client.id;
}

function usesClientScope(workspaceType = state.workspaceType) {
  return normalizeWorkspaceType(workspaceType) === "business";
}

function currentWorkspaceType() {
  return normalizeWorkspaceType(
    window.LongtailForge?.workspaceContext?.workspaceType ||
      document.body?.dataset?.workspaceType ||
      state.workspaceType,
  );
}

function normalizeWorkspaceType(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["business", "personal", "family"].includes(text) ? text : "business";
}

function moduleEnabled(moduleId) {
  return state.modules?.[moduleId]?.enabled === true;
}

function normalizeModuleStateMap(modules) {
  return modules && typeof modules === "object" && !Array.isArray(modules) ? modules : {};
}

function enabledModuleIds() {
  return Object.entries(state.modules || {})
    .filter(([, moduleState]) => moduleState?.enabled === true)
    .map(([moduleId]) => moduleId);
}

function sourceLabel(timer) {
  if (timer.source_type === "task") {
    return "Task";
  }

  return "Manual";
}

function formatCandidateDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function badge(label, type = "") {
  const element = document.createElement("span");
  element.className = "workbench-badge";
  if (type) {
    element.dataset.badgeType = type;
  }
  element.textContent = label;
  return element;
}

function actionButton(label, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("danger-button", Boolean(options.danger));
  button.addEventListener("click", handler);
  return button;
}

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "workbench-empty-state";
  element.textContent = message;
  return element;
}

function replaceOptions(select, options) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  select.replaceChildren(...options);
  if ([...select.options].some((item) => item.value === previousValue)) {
    select.value = previousValue;
  }
}

function option(value, label) {
  return window.LongtailForge.pageController.createOption(value, label);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number.parseInt(totalSeconds, 10) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatToken(value) {
  return String(value || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setStatus(message, options = {}) {
  if (!statusText) {
    return;
  }
  transientStatus = {
    isError: Boolean(options.isError),
    message: String(message || ""),
  };
  renderWorkbenchStatus();
}

window.LongtailForge.pageController.register("workbench", {
  snapshot: () => ({
    activeTaskFocusId: state.activeTaskFocus?.taskId || "",
    focusCandidateCount: state.focusCandidates.length,
    focusModeId: state.focusModeId,
    inspectorCandidateCount: resolvedWorkbenchViewState() === WORKBENCH_VIEW_STATE_TASK_FOCUS
      ? taskFocusRelatedContextGroups().flatMap((group) => group.items || []).length
      : workbenchInspectorCandidates().length,
    recommendedCandidateIndex: state.recommendedCandidateIndex,
    recommendedCandidateWindowSize: recommendedCandidateWindow().length,
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    taskFocusInspectorCollapsed,
    timerCount: state.timers.length,
    enabledModules: enabledModuleIds(),
    moduleActionCount: window.LongtailForge.moduleActions?.list?.().length || 0,
    viewState: resolvedWorkbenchViewState(),
    workspaceType: state.workspaceType,
  }),
});
