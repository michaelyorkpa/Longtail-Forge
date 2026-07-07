const WORKBENCH_CARD_STATE_KEY = "lf_workbench_cards_v1";
const WORKBENCH_CLIENT_FOCUS_KEY = "lf_workbench_client_focus_v1";
const WORKBENCH_FOCUS_MODE_KEY = "lf_workbench_focus_mode_v1";
const WORKBENCH_PROJECT_FOCUS_KEY = "lf_workbench_project_focus_v1";
const WORKBENCH_TASK_FILTER_KEY = "lf_workbench_task_filter_v1";
const PROJECT_FOCUS_MODE_ID = "project-focus";
const DEFAULT_FOCUS_MODE_ID = "pick-up-where-left-off";
const RECOMMENDED_CANDIDATE_LIMIT = 5;
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
const TASK_FILTERS = new Set(["assigned", "today", "soon", "overdue", "in_progress", "has_timer", "all"]);

const workbenchViewHelpers = window.LongtailForge.view;
const api = window.LongtailForge.api;
const modal = window.LongtailForge.modal;
const workbenchHost = document.querySelector("[data-workbench-host]");

let addTaskButton = null;
let focusModeList = null;
let manualBillableInput = null;
let manualClientInput = null;
let manualDescriptionInput = null;
let manualProjectInput = null;
let manualTimerForm = null;
let clientFocusControl = null;
let clientFocusInput = null;
let projectFocusControl = null;
let projectFocusInput = null;
let recommendedActionBody = null;
let recommendedCycleControls = null;
let recommendedCycleNextButton = null;
let recommendedCyclePreviousButton = null;
let secondaryCandidateCountText = null;
let secondaryCandidateList = null;
let statusText = null;
let taskCountText = null;
let taskFilters = null;
let taskList = null;
let taskSortInput = null;
let timeTrackingModuleLink = null;
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
  recommendedCandidateIndex: 0,
  selectedClientId: "",
  selectedProjectId: "",
  taskFilter: "assigned",
  taskItems: [],
  taskOptions: { projects: [] },
  timers: [],
  workCandidates: [],
  workspaceType: "business",
};
let tickIntervalId = null;
let pendingActivatedTimerKey = "";
let transientStatus = {
  isError: false,
  message: "",
};

const workbenchCardRenderers = {
  "active-work-timers": () => {
    renderTimers();
    updateManualTimerState();
  },
  "task-workbench-items": renderTasks,
};
const workbenchCardDataLoaders = {
  "active-work-timers": loadTimerCardData,
  "task-workbench-items": loadTaskCardData,
};

buildWorkbenchHost();
bindWorkbenchEvents();
loadWorkbench();

function buildWorkbenchHost() {
  if (!workbenchHost || !workbenchViewHelpers) {
    return;
  }

  timeTrackingModuleLink = workbenchViewHelpers.createElement("a", {
    className: "button-link",
    attrs: { href: "time-tracker.html" },
    dataset: { workbenchModuleLink: "time-tracking" },
    text: "Time Tracker",
  });

  const header = workbenchViewHelpers.createPageHeader({
    title: "Workbench",
  });
  const headerBody = header.querySelector(".view-page-header-body");
  header.appendChild(workbenchViewHelpers.createDetailActionStrip({
    actions: [timeTrackingModuleLink],
    className: "view-page-header-actions",
  }));

  statusText = workbenchViewHelpers.createStatusMessage({
    className: "workbench-header-status",
    hidden: true,
  });
  headerBody?.appendChild(statusText);

  workbenchHost.replaceChildren(
    header,
    createGuidedFocusPanel(),
    createRecommendedActionPanel(),
    createSecondaryWorkbenchPanel(),
  );
}

function bindWorkbenchEvents() {
  document.querySelectorAll("[data-workbench-secondary-candidate-section]").forEach((section) => {
    section.addEventListener("toggle", handleDisclosureToggle);
  });
  document.querySelectorAll("[data-workbench-card]").forEach((card) => {
    card.addEventListener("toggle", handleWorkbenchCardToggle);
  });
  const timerSummary = timerSectionElement?.querySelector("summary");
  timerSummary?.addEventListener("click", markTimerSectionUserToggle);
  timerSummary?.addEventListener("keydown", markTimerSectionUserToggle);
  focusModeList?.addEventListener("click", handleFocusModeClick);
  clientFocusInput?.addEventListener("change", handleClientFocusChange);
  projectFocusInput?.addEventListener("change", handleProjectFocusChange);
  taskFilters?.addEventListener("click", handleTaskFilterClick);
  taskSortInput?.addEventListener("change", () => renderTasks());
  addTaskButton?.addEventListener("click", openAddTaskAction);
  manualTimerForm?.addEventListener("submit", startManualTimer);
  manualClientInput?.addEventListener("change", () => populateManualProjects({ notifyBillableChange: true }));
  manualProjectInput?.addEventListener("change", () => updateManualBillableDefault({ notify: true }));
}

function createGuidedFocusPanel() {
  focusModeList = workbenchViewHelpers.createElement("div", {
    className: "workbench-focus-question-list",
    attrs: {
      "aria-label": "Workbench focus questions",
      role: "list",
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

  return workbenchViewHelpers.createElement("section", {
    className: ["workbench-focus-panel", "surface-main-panel"],
    attrs: { "aria-labelledby": "workbench-focus-heading" },
    children: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-panel-heading",
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
    label: "Show previous recommendation",
    onClick: () => cycleRecommendedCandidate(-1),
    role: "secondary",
  });
  recommendedCycleNextButton = workbenchViewHelpers.createActionButton({
    className: "workbench-recommended-cycle-button",
    icon: "next",
    iconOnly: true,
    label: "Not this one, show another recommendation",
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

  return workbenchViewHelpers.createElement("section", {
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
}

function createSecondaryWorkbenchPanel() {
  secondaryCandidateCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchSecondaryCandidateCount: "" },
    text: "0",
  });
  secondaryCandidateList = workbenchViewHelpers.createElement("div", {
    className: "workbench-secondary-candidate-list",
    dataset: { workbenchSecondaryCandidates: "" },
  });

  return workbenchViewHelpers.createElement("section", {
    className: "workbench-secondary-panel",
    attrs: { "aria-label": "Secondary Workbench lists" },
    children: [
      createSecondaryCandidateSection(),
      workbenchViewHelpers.createElement("section", {
        className: "workbench-layout",
        attrs: { "aria-label": "Workbench module lists" },
        children: [
          createTimerSection(),
          createTaskSection(),
          createQuickNotesSection(),
        ],
      }),
    ],
  });
}

function createSecondaryCandidateSection() {
  const section = workbenchViewHelpers.createElement("details", {
    className: ["workbench-section", "workbench-secondary-candidates", "surface-main-panel"],
    attrs: { "aria-label": "More work in this focus" },
    dataset: { workbenchSecondaryCandidateSection: "" },
  });
  const bodyId = "workbench-secondary-candidates-body";
  section.append(
    createWorkbenchSectionSummary({
      bodyId,
      count: secondaryCandidateCountText,
      title: "More in this focus",
    }),
    workbenchViewHelpers.createElement("div", {
      attrs: { id: bodyId },
      className: "workbench-section-body",
      children: [secondaryCandidateList],
    }),
  );
  setWorkbenchDisclosureOpen(section, false);
  return section;
}

function createTimerSection() {
  timerCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchTimerCount: "" },
    text: "0",
  });
  manualClientInput = workbenchViewHelpers.createElement("select", { dataset: { workbenchManualClient: "" } });
  manualProjectInput = workbenchViewHelpers.createElement("select", {
    attrs: { required: "" },
    dataset: { workbenchManualProject: "" },
  });
  manualDescriptionInput = workbenchViewHelpers.createElement("input", {
    attrs: { type: "text" },
    dataset: { workbenchManualDescription: "" },
  });
  manualBillableInput = workbenchViewHelpers.createElement("input", {
    attrs: { checked: "", type: "checkbox" },
    dataset: { workbenchManualBillable: "" },
  });
  manualTimerForm = workbenchViewHelpers.createElement("form", {
    className: "workbench-manual-timer-form",
    dataset: { workbenchManualTimerForm: "" },
    children: [
      workbenchViewHelpers.createElement("label", {
        attrs: { "data-client-workspace-control": "" },
        children: ["Client", manualClientInput],
      }),
      workbenchViewHelpers.createElement("label", {
        children: ["Project", manualProjectInput],
      }),
      workbenchViewHelpers.createElement("label", {
        children: ["Description", manualDescriptionInput],
      }),
      workbenchViewHelpers.createElement("label", {
        className: "inline-option workbench-billable-option",
        children: [manualBillableInput, "Billable"],
      }),
      workbenchViewHelpers.createElement("button", {
        attrs: { type: "submit" },
        text: "Start Timer",
      }),
    ],
  });
  timerList = workbenchViewHelpers.createElement("div", {
    className: "workbench-timer-list",
    dataset: { workbenchTimerList: "" },
  });

  timerSectionElement = createWorkbenchCardSection({
    body: [manualTimerForm, timerList],
    cardId: "active-work-timers",
    count: timerCountText,
    defaultOpen: hasActiveOrPausedTimers(),
    rendererId: "active-work-timers",
    title: "Timers",
  });
  return timerSectionElement;
}

function createTaskSection() {
  taskCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchTaskCount: "" },
    text: "0",
  });
  taskFilters = workbenchViewHelpers.createElement("div", {
    className: "workbench-filter-bar",
    dataset: { workbenchTaskFilters: "" },
    children: [
      createTaskFilterButton("assigned", "Assigned to me"),
      createTaskFilterButton("today", "Due today"),
      createTaskFilterButton("soon", "Due soon"),
      createTaskFilterButton("overdue", "Overdue"),
      createTaskFilterButton("in_progress", "In progress"),
      createTaskFilterButton("has_timer", "Has timer"),
      createTaskFilterButton("all", "All"),
    ],
  });
  addTaskButton = workbenchViewHelpers.createElement("button", {
    attrs: { type: "button" },
    dataset: { workbenchAddTask: "" },
    text: "Add Task",
  });
  taskSortInput = workbenchViewHelpers.createElement("select", {
    dataset: { workbenchTaskSort: "" },
    children: [
      option("due_asc", "Due Date"),
      option("priority_desc", "Priority"),
      option("status_asc", "Status"),
    ],
  });
  taskList = workbenchViewHelpers.createElement("div", {
    className: "workbench-task-list",
    dataset: { workbenchTaskList: "" },
  });

  return createWorkbenchCardSection({
    body: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-task-toolbar",
        children: [taskFilters, addTaskButton],
      }),
      workbenchViewHelpers.createElement("label", {
        className: "workbench-sort-control",
        children: ["Sort", taskSortInput],
      }),
      taskList,
    ],
    cardId: "task-workbench-items",
    count: taskCountText,
    rendererId: "task-workbench-items",
    title: "Tasks",
  });
}

function createQuickNotesSection() {
  return createWorkbenchCardSection({
    body: [
      workbenchViewHelpers.createEmptyState({
        className: "workbench-empty-state",
        message: "Notes and knowledge base references will appear here when that module is available.",
        title: "Quick Notes",
      }),
    ],
    cardId: "quick-notes",
    rendererId: "quick-notes",
    title: "Quick Notes",
  });
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

function createWorkbenchSectionSummary({ bodyId = "", count = null, title }) {
  const attrs = { "aria-expanded": "false" };

  if (bodyId) {
    attrs["aria-controls"] = bodyId;
  }

  return workbenchViewHelpers.createElement("summary", {
    className: "workbench-section-summary",
    attrs,
    children: [
      workbenchViewHelpers.createElement("span", {
        className: "workbench-section-title",
        text: title,
      }),
      count,
    ],
  });
}

function createTaskFilterButton(filter, label) {
  return workbenchViewHelpers.createElement("button", {
    attrs: { type: "button" },
    dataset: { workbenchTaskFilter: filter },
    text: label,
  });
}

async function loadWorkbench() {
  setStatus("Loading Workbench...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
    restoreTaskFilter();
    restoreFocusState();
    const [bootstrap, clientProjectData, focusModeData] = await Promise.all([
      api.getJson("/api/workbench/bootstrap", { cache: "no-store" }),
      loadClientProjectData(),
      loadFocusModes(),
    ]);
    const registry = bootstrap.registry || state.registry;
    const sourceData = await loadWorkbenchSourceData(registry);
    const clients = normalizeClientProjectOptions(clientProjectData);
    const workspaceType = currentWorkspaceType();
    const focusModes = curateFocusModes(focusModeData?.modes || []);
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
      taskItems: sourceData.taskItems,
      taskOptions: sourceData.taskOptions || bootstrap.taskOptions || { projects: [] },
      timers: sourceData.timers,
      workCandidates: bootstrap.workCandidates || [],
      workspaceType,
    };
    const focusData = await loadFocusCandidatesForState();
    state = {
      ...state,
      focusCandidates: Array.isArray(focusData?.items) ? focusData.items : [],
      focusContext: focusData?.focusContext || null,
    };
    restoreCardState();
    populateManualTimerForm();
    renderWorkbench();
    startTicking();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Workbench could not be loaded.", { isError: true });
  }
}

async function loadWorkbenchSourceData(registry) {
  const sourceData = {
    taskItems: [],
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

async function loadTaskCardData(card) {
  const data = await api.getJson(card.listRoute, { cache: "no-store" });

  return {
    taskItems: data?.source_enabled === false ? [] : Array.isArray(data?.items) ? data.items : [],
    taskOptions: data?.options || { projects: [] },
  };
}

async function loadFocusModes() {
  return api.getJson("/api/workbench/focus-modes", { cache: "no-store" });
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
  if (Array.isArray(data.taskItems)) {
    target.taskItems.push(...data.taskItems);
  }
  if (data.taskOptions) {
    target.taskOptions = data.taskOptions;
  }
}

async function loadClientProjectData() {
  try {
    return await api.getJson("/api/client-projects", { cache: "no-store" });
  } catch {
    return { clients: [], workspaceProjects: [] };
  }
}

function renderWorkbench() {
  renderWorkbenchStatus();
  renderFocusModes();
  renderRecommendedAction();
  renderSecondaryFocusCandidates();
  renderRegisteredWorkbenchCards();
  updateModuleLinks();
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

function renderSecondaryFocusCandidates() {
  const secondaryCandidates = recommendedOverflowCandidates();

  secondaryCandidateCountText.textContent = String(secondaryCandidates.length);
  secondaryCandidateList.replaceChildren();

  if (secondaryCandidates.length === 0) {
    secondaryCandidateList.appendChild(emptyState("No secondary candidates for this focus yet."));
    return;
  }

  secondaryCandidates.forEach((candidate) => {
    secondaryCandidateList.appendChild(createSecondaryCandidateItem(candidate));
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
}

function createRecommendedCandidateCard(candidate, candidateIndex = 0) {
  const actionButtonElement = workbenchViewHelpers.createActionButton({
    label: candidateActionLabel(candidate),
    onClick: (event) => openCandidate(candidate, event?.currentTarget || null),
    role: "primary",
  });
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
        meta: candidate.contextLabel || candidate.reason || "",
        title: candidate.title || "Untitled work",
      }),
      workbenchViewHelpers.createElement("p", {
        className: "workbench-recommended-reason",
        text: candidate.reason || candidate.nextAction || "This is the strongest match for the selected focus.",
      }),
      workbenchViewHelpers.createDetailActionStrip({
        actions: [actionButtonElement],
        className: "workbench-recommended-actions",
      }),
    ],
  });

  return card;
}

function createSecondaryCandidateItem(candidate) {
  const item = workbenchViewHelpers.createElement("article", {
    className: "workbench-secondary-candidate",
    dataset: { workbenchSecondaryCandidate: candidate.candidateId || "" },
    children: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-secondary-candidate-body",
        children: [
          workbenchViewHelpers.createElement("h3", { text: candidate.title || "Untitled work" }),
          workbenchViewHelpers.createElement("p", { text: candidate.contextLabel || candidate.reason || "Ready to review." }),
        ],
      }),
      workbenchViewHelpers.createDetailActionStrip({
        actions: [{
          label: candidateActionLabel(candidate),
          onClick: (event) => openCandidate(candidate, event?.currentTarget || null),
        }],
        className: "workbench-secondary-candidate-actions",
      }),
    ],
  });

  return item;
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
        label: "Review lists below",
        onClick: () => document.querySelector("[data-workbench-secondary-candidate-section] summary")?.focus(),
      },
    ],
    message: "No work matches this focus yet. Capture the next commitment or review the secondary lists below.",
    title: "Nothing needs this focus right now",
  });
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
  if (candidateTaskId(candidate) || candidate.sourceUrl || candidate.primaryAction?.href) {
    return "Open work";
  }

  return candidate.primaryAction?.label || "Review";
}

async function openCandidate(candidate, trigger = null) {
  const taskId = candidateTaskId(candidate);

  if (taskId) {
    await openTaskCandidate(candidate, taskId, trigger);
    return;
  }

  openCandidateNavigationFallback(candidate);
}

async function openTaskCandidate(candidate, taskId, trigger = null) {
  if (!moduleEnabled("tasks")) {
    setStatus("Tasks are not available in this workspace.", { isError: true });
    return;
  }

  setStatus("Opening task...");
  try {
    const result = await window.LongtailForge.moduleActions.open("tasks.edit", {
      context: {
        source: "workbench",
        sourceType: "work-candidate",
      },
      candidateId: candidate.candidateId || "",
      recordId: taskId,
      returnFocusTo: trigger || document.activeElement,
      taskId,
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      const detail = result.detail || {};
      if (detail.taskLifecycleAction === "complete") {
        setTaskCompletionStatus(detail);
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

function openCandidateNavigationFallback(candidate) {
  const href = candidate.primaryAction?.href || candidate.sourceUrl || "";

  if (href) {
    setStatus("Opening this work in its module page.");
    window.location.href = href;
    return;
  }

  setStatus("This recommendation does not have an in-place editor or page fallback yet.", { isError: true });
}

function candidateTaskId(candidate = {}) {
  if (candidate.moduleId === "tasks" && candidate.recordType === "task" && candidate.recordId) {
    return candidate.recordId;
  }

  return "";
}

async function handleFocusModeClick(event) {
  const button = event.target.closest("[data-workbench-focus-mode]");

  if (!button) {
    return;
  }

  await selectFocusMode(button.dataset.workbenchFocusMode || DEFAULT_FOCUS_MODE_ID);
}

async function handleClientFocusChange() {
  state.selectedClientId = resolveClientSelection(clientFocusInput.value || "", state.clients, state.workspaceType);
  state.selectedProjectId = resolveProjectSelection(state.selectedProjectId, state.clients, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_CLIENT_FOCUS_KEY, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_PROJECT_FOCUS_KEY, state.selectedProjectId);
  populateFocusScopeOptions();
  await refreshFocusCandidates();
}

async function handleProjectFocusChange() {
  state.selectedProjectId = resolveProjectSelection(projectFocusInput.value || "", state.clients, state.selectedClientId);
  window.localStorage.setItem(WORKBENCH_PROJECT_FOCUS_KEY, state.selectedProjectId);
  await refreshFocusCandidates();
}

async function selectFocusMode(modeId) {
  state.focusModeId = resolveFocusModeSelection(modeId, state.focusModes);
  window.localStorage.setItem(WORKBENCH_FOCUS_MODE_KEY, state.focusModeId);

  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    state.focusCandidates = [];
    state.focusContext = null;
    state.recommendedCandidateIndex = 0;
    renderWorkbenchStatus();
    renderFocusModes();
    renderRecommendedAction();
    renderSecondaryFocusCandidates();
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
    renderSecondaryFocusCandidates();
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
  const timers = sortedTimers(state.timers);
  timerCountText.textContent = String(timers.length);
  timerList.replaceChildren();
  syncTimerSectionOpenState();

  if (timers.length === 0) {
    timerList.appendChild(emptyState("No active or paused timers."));
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

function renderTasks() {
  const taskCardActive = cardContributionActive("task-workbench-items");
  const taskCard = document.querySelector('[data-workbench-renderer="task-workbench-items"]');
  const tasks = taskCardActive ? sortedTasks(filteredTasks()) : [];

  taskCard.hidden = !taskCardActive;
  taskCountText.textContent = String(tasks.length);
  taskList.replaceChildren();
  updateTaskFilterState();

  if (!taskCardActive) {
    return;
  }

  if (tasks.length === 0) {
    taskList.appendChild(emptyState("No tasks match the current filters."));
    return;
  }

  tasks.forEach((task) => taskList.appendChild(createTaskItem(task)));
}

function cardContributionActive(rendererId) {
  return (state.registry.workbenchCards || []).some((card) => card.renderer === rendererId);
}

function updateModuleLinks() {
  if (timeTrackingModuleLink) {
    timeTrackingModuleLink.hidden = !cardContributionActive("active-work-timers");
  }
}

function createTaskItem(task) {
  const item = document.createElement("article");
  const header = document.createElement("div");
  const titleBlock = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("div");
  const detail = document.createElement("p");
  const actions = document.createElement("div");
  const timer = task.timer;
  const running = timer?.timer_status === "running";

  item.className = "workbench-task-item";
  header.className = "workbench-task-header";
  titleBlock.className = "workbench-task-title-block";
  meta.className = "workbench-card-meta";
  actions.className = "workbench-actions";
  title.textContent = task.title;
  meta.append(
    badge(formatToken(task.status), task.status),
    badge(formatToken(task.priority), task.priority),
  );
  if (timer) {
    meta.append(badge(running ? "Timer running" : "Timer paused", running ? "running" : "paused"));
  }
  titleBlock.append(title);
  appendTaskTagChips(titleBlock, task);
  header.append(titleBlock, meta);
  detail.textContent = taskDetailText(task);

  const startButton = actionButton(running ? "Running" : "Start Timer", () => startTaskTimer(task));
  const pauseButton = actionButton("Pause", () => pauseTaskTimer(task));
  const saveButton = actionButton("Save & End", () => finalizeTaskTimer(task));
  const completeButton = actionButton("Complete", () => completeTask(task));
  const openButton = actionButton("Open Task", () => openTaskAction(task));

  startButton.disabled = running || !taskCanUseTimer(task);
  pauseButton.disabled = !running || !taskCanUseTimer(task);
  saveButton.disabled = !timer || !taskCanUseTimer(task);
  completeButton.disabled = task.status === "complete" || task.status === "archived" || Boolean(timer);
  completeButton.title = timer ? "Save or discard the task timer before completing this task." : "";
  actions.append(startButton, pauseButton, saveButton, completeButton, openButton);
  item.append(header, detail, actions);
  return item;
}

function appendTaskTagChips(container, task) {
  const directTags = Array.isArray(task.directTags)
    ? task.directTags
    : Array.isArray(task.direct_tags) ? task.direct_tags : [];
  const visibleTags = directTags.slice(0, 2);
  const hiddenCount = Math.max(0, directTags.length - visibleTags.length);

  if (visibleTags.length === 0 && hiddenCount === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "workbench-task-tag-list";

  visibleTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip workbench-task-tag-chip";
    chip.textContent = tag.name || tag.slug || "Tag";
    if (tag.color) {
      chip.style.setProperty("--tag-color", tag.color);
    }
    list.appendChild(chip);
  });

  if (hiddenCount > 0) {
    const overflow = document.createElement("span");
    overflow.className = "tag-chip workbench-task-tag-chip workbench-task-tag-overflow";
    overflow.textContent = `+${hiddenCount}`;
    overflow.title = `${hiddenCount} more direct ${hiddenCount === 1 ? "tag" : "tags"}`;
    list.appendChild(overflow);
  }

  container.appendChild(list);
}

async function startManualTimer(event) {
  event.preventDefault();
  const selectedClient = currentManualClient();
  const selectedProject = currentManualProject(selectedClient);
  const timerSlot = nextManualTimerSlot();

  if (!selectedProject) {
    setStatus("Select a project before starting a timer.", { isError: true });
    return;
  }

  pendingActivatedTimerKey = `manual-slot:${timerSlot}`;
  setStatus("Starting timer...");
  try {
    await api.putJson(`/api/active-timers/${encodeURIComponent(timerSlot)}`, {
      client_id: selectedClient?.isWorkspaceScope ? "" : selectedClient?.id || "",
      client_name: selectedClient?.isWorkspaceScope ? "" : selectedClient?.name || "",
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      description: manualDescriptionInput.value.trim(),
      billable: manualBillableInput.checked ? "yes" : "no",
      accumulated_elapsed_seconds: 0,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    });
    manualDescriptionInput.value = "";
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Timer could not be started.", { isError: true });
  }
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
    await saveTaskTimer(timer.source_id, "paused", readElapsedSeconds(timer), timer.active_timer_id);
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
    await api.putJson(`/api/tasks/${encodeURIComponent(taskId)}/timer`, {
      active_timer_id: activeTimerId,
      timer_status: timerStatus,
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: new Date().toISOString(),
    });
    await loadWorkbench();
  } catch (error) {
    setStatus(error.message || "Task timer could not be updated.", { isError: true });
  }
}

async function startTaskTimer(task) {
  pendingActivatedTimerKey = `task:${task.task_id}`;
  await saveTaskTimer(task.task_id, "running", task.timer ? readElapsedSeconds(task.timer) : 0, task.timer?.active_timer_id || "");
}

async function pauseTaskTimer(task) {
  if (task.timer) {
    await saveTaskTimer(task.task_id, "paused", readElapsedSeconds(task.timer), task.timer.active_timer_id);
  }
}

async function finalizeTaskTimer(task) {
  if (!task.timer) {
    return;
  }

  setStatus("Saving task time...");
  try {
    await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/timer/finalize`, {
      duration_seconds: Math.max(1, readElapsedSeconds(task.timer)),
      end_time: new Date().toISOString(),
    });
    await loadWorkbench();
    setStatus("Task time saved.");
  } catch (error) {
    setStatus(error.message || "Task time could not be saved.", { isError: true });
  }
}

async function completeTask(task) {
  const confirmed = await modal.confirm({
    title: "Complete task",
    message: `Complete "${task.title}"?`,
    confirmLabel: "Complete",
  });

  if (!confirmed) {
    return;
  }

  setStatus("Completing task...");
  try {
    await api.postJson(`/api/tasks/${encodeURIComponent(task.task_id)}/complete`, {});
    await loadWorkbench();
    setStatus("Task completed.");
  } catch (error) {
    setStatus(error.message || "Task could not be completed.", { isError: true });
  }
}

async function openAddTaskAction() {
  setStatus("Opening task form...");
  try {
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

async function openTaskAction(task) {
  setStatus("Opening task...");
  try {
    const result = await window.LongtailForge.moduleActions.open("tasks.edit", {
      context: { source: "workbench", sourceType: "task-workbench-item" },
      recordId: task.task_id,
      taskId: task.task_id,
    }, { refresh: loadWorkbench, setStatus });
    if (result.completed) {
      const detail = result.detail || {};
      if (detail.taskLifecycleAction === "complete") {
        setTaskCompletionStatus(detail);
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

function setTaskCompletionStatus(detail = {}) {
  if (detail.createdTask?.title) {
    setStatus(`Created next recurring task: ${detail.createdTask.title}`);
    return;
  }
  if (detail.recurrenceQueued === true) {
    setStatus("Next recurring task queued.");
    return;
  }
  setStatus("Task completed.");
}

async function finalizeTimer(timer) {
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
    await api.deleteJson(`/api/active-timers/${encodeURIComponent(timer.timer_slot)}`);
    await loadWorkbench();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Timer could not be discarded.", { isError: true });
  }
}

function populateManualTimerForm() {
  replaceOptions(manualClientInput, [
    option("", "Select a client"),
    ...state.clients.map((client) => option(client.id, clientOptionLabel(client))),
  ]);
  if (state.clients.length === 1 && state.clients[0].isWorkspaceScope) {
    manualClientInput.value = state.clients[0].id;
  }
  populateManualProjects();
}

function populateManualProjects(options = {}) {
  const client = currentManualClient();
  const projects = client?.projects || [];

  replaceOptions(manualProjectInput, [
    option("", "Select a project"),
    ...projects.map((project) => option(project.id, project.name)),
  ]);
  updateManualBillableDefault({ notify: Boolean(options.notifyBillableChange) });
}

function updateManualTimerState() {
  const enabled = moduleEnabled("time-tracking") && state.clients.length > 0;
  manualTimerForm.hidden = !enabled;
}

function currentManualClient() {
  return state.clients.find((client) => client.id === manualClientInput.value);
}

function currentManualProject(client) {
  return (client?.projects || []).find((project) => project.id === manualProjectInput.value);
}

function nextManualTimerSlot() {
  const manualSlots = new Set(state.timers
    .filter((timer) => timer.source_type === "manual")
    .map((timer) => Number.parseInt(timer.timer_slot, 10))
    .filter(Number.isFinite));
  let slot = 1;

  while (manualSlots.has(slot)) {
    slot += 1;
  }

  return String(slot);
}

function updateManualBillableDefault(options = {}) {
  const selectedClient = currentManualClient();
  const selectedProject = currentManualProject(selectedClient);
  const billableSource = selectedProject || selectedClient;
  const nextChecked = billableSource?.billable !== "no";
  const changed = manualBillableInput.checked !== nextChecked;

  manualBillableInput.checked = nextChecked;
  if (changed && options.notify) {
    flashManualBillableFlag();
  }
}

function flashManualBillableFlag() {
  const label = manualBillableInput.closest("label");

  if (!label) {
    return;
  }

  flashElement(label, "is-billable-inherited");
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

function filteredTasks() {
  const today = todayKey();
  const soon = addDaysKey(today, 7);

  return state.taskItems.filter((task) => {
    if (state.taskFilter === "assigned") {
      return task.assigned_to_current_user && isActiveTask(task);
    }
    if (state.taskFilter === "today") {
      return task.due_date === today && isActiveTask(task);
    }
    if (state.taskFilter === "soon") {
      return Boolean(task.due_date && task.due_date >= today && task.due_date <= soon && isActiveTask(task));
    }
    if (state.taskFilter === "overdue") {
      return Boolean(task.due_date && task.due_date < today && isActiveTask(task));
    }
    if (state.taskFilter === "in_progress") {
      return task.status === "in_progress";
    }
    if (state.taskFilter === "has_timer") {
      return Boolean(task.timer);
    }

    return isActiveTask(task);
  });
}

function sortedTasks(tasks) {
  const projectSortOrders = readTaskProjectSortOrders(tasks);

  return [...tasks].sort((first, second) => {
    if (taskSortInput?.value === "priority_desc") {
      return priorityRank(second.priority) - priorityRank(first.priority) || dueSortValue(first).localeCompare(dueSortValue(second));
    }
    if (taskSortInput?.value === "status_asc") {
      return String(first.status || "").localeCompare(String(second.status || "")) || dueSortValue(first).localeCompare(dueSortValue(second));
    }
    if (projectSortOrders.size > 0) {
      const projectOrderResult = compareByProjectSortOrder(first, second, projectSortOrders);
      if (projectOrderResult !== 0) {
        return projectOrderResult;
      }
    }
    return dueSortValue(first).localeCompare(dueSortValue(second)) || priorityRank(second.priority) - priorityRank(first.priority);
  });
}

function readTaskProjectSortOrders(tasks) {
  if ((taskSortInput?.value || "due_asc") !== "due_asc") {
    return new Map();
  }

  const projectsById = new Map((state.taskOptions?.projects || []).map((project) => [project.id, project]));
  const projectSortOrders = new Map();

  tasks.forEach((task) => {
    const projectId = task.project_id || "";
    if (!projectId || projectSortOrders.has(projectId)) {
      return;
    }

    const sortOrder = normalizeProjectTaskSortOrder(projectsById.get(projectId)?.taskDefaults?.sortOrder || []);
    if (sortOrder.length > 0) {
      projectSortOrders.set(projectId, sortOrder);
    }
  });

  return projectSortOrders;
}

function compareByProjectSortOrder(firstTask, secondTask, projectSortOrders) {
  if ((firstTask.project_id || "") !== (secondTask.project_id || "")) {
    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
  }

  const sortOrder = projectSortOrders.get(firstTask.project_id || "");
  if (!sortOrder) {
    return 0;
  }

  return sortOrder.reduce((result, sortItem) => {
    if (result !== 0) {
      return result;
    }

    if (sortItem === "priority") {
      return priorityRank(secondTask.priority) - priorityRank(firstTask.priority);
    }

    if (sortItem === "status") {
      return String(firstTask.status || "").localeCompare(String(secondTask.status || ""));
    }

    return dueSortValue(firstTask).localeCompare(dueSortValue(secondTask));
  }, 0);
}

function normalizeProjectTaskSortOrder(value) {
  const rawItems = Array.isArray(value) ? value : [];
  const allowed = ["due_date", "priority", "status"];
  const ordered = rawItems.filter((item) => allowed.includes(item));

  allowed.forEach((item) => {
    if (!ordered.includes(item)) {
      ordered.push(item);
    }
  });

  return ordered.length === allowed.length ? ordered : [];
}

function sortedTimers(timers) {
  return [...timers].sort((first, second) => {
    if (first.timer_status !== second.timer_status) {
      return first.timer_status === "running" ? -1 : 1;
    }
    return String(second.updated_at || "").localeCompare(String(first.updated_at || ""));
  });
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

function handleTaskFilterClick(event) {
  const button = event.target.closest("[data-workbench-task-filter]");

  if (!button) {
    return;
  }

  const filter = TASK_FILTERS.has(button.dataset.workbenchTaskFilter) ? button.dataset.workbenchTaskFilter : "assigned";
  state.taskFilter = filter;
  window.localStorage.setItem(WORKBENCH_TASK_FILTER_KEY, filter);
  renderTasks();
}

function updateTaskFilterState() {
  taskFilters?.querySelectorAll("[data-workbench-task-filter]").forEach((button) => {
    button.dataset.active = button.dataset.workbenchTaskFilter === state.taskFilter ? "true" : "false";
  });
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
    setWorkbenchDisclosureOpen(timerSectionElement, hasActiveOrPausedTimers());
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
  return state.timers.length > 0;
}

function isTimerWorkbenchCard(card) {
  return card?.dataset?.workbenchCard === "active-work-timers";
}

function restoreTaskFilter() {
  const saved = window.localStorage.getItem(WORKBENCH_TASK_FILTER_KEY);
  state.taskFilter = TASK_FILTERS.has(saved) ? saved : "assigned";
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
  const scopedClients = selectedClientId
    ? (clients || []).filter((client) => client.id === selectedClientId)
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

function taskCanUseTimer(task) {
  return moduleEnabled("tasks") &&
    moduleEnabled("time-tracking") &&
    task.project_id &&
    task.status !== "complete" &&
    task.status !== "archived";
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

function isActiveTask(task) {
  return task.status !== "complete" && task.status !== "archived";
}

function taskDetailText(task) {
  const parts = [
    [task.client_name, task.project_name].filter(Boolean).join(" / "),
    task.due_date ? `Due ${formatDue(task)}` : "",
    task.assignees?.length ? task.assignees.map(displayUser).join(", ") : "Unassigned",
  ].filter(Boolean);

  return parts.join(" | ");
}

function sourceLabel(timer) {
  if (timer.source_type === "task") {
    return "Task";
  }

  return "Manual";
}

function displayUser(user) {
  return String(user.displayName || user.display_name || user.username || user.user_id || "").trim();
}

function formatDue(task) {
  if (!task.due_date) {
    return "No due date";
  }

  return task.due_time ? `${task.due_date} ${task.due_time}` : task.due_date;
}

function formatCandidateDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function dueSortValue(task) {
  return `${task.due_date || "9999-12-31"}T${task.due_time || "23:59"}`;
}

function priorityRank(priority) {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[priority] || 0;
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
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
    focusCandidateCount: state.focusCandidates.length,
    focusModeId: state.focusModeId,
    recommendedCandidateIndex: state.recommendedCandidateIndex,
    recommendedCandidateWindowSize: recommendedCandidateWindow().length,
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    taskCount: state.taskItems.length,
    taskFilter: state.taskFilter,
    timerCount: state.timers.length,
    enabledModules: enabledModuleIds(),
    moduleActionCount: window.LongtailForge.moduleActions?.list?.().length || 0,
    workspaceType: state.workspaceType,
  }),
});
