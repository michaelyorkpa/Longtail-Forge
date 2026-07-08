const WORKBENCH_CARD_STATE_KEY = "lf_workbench_cards_v1";
const WORKBENCH_CLIENT_FOCUS_KEY = "lf_workbench_client_focus_v1";
const WORKBENCH_FOCUS_MODE_KEY = "lf_workbench_focus_mode_v1";
const WORKBENCH_PROJECT_FOCUS_KEY = "lf_workbench_project_focus_v1";
const PROJECT_FOCUS_MODE_ID = "project-focus";
const DEFAULT_FOCUS_MODE_ID = "pick-up-where-left-off";
const RECOMMENDED_CANDIDATE_LIMIT = 1;
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
  "notes.edit": [
    { src: "js/shared/notification-subscriptions.js?v=1", test: () => window.LongtailForge?.notificationSubscriptions },
    { src: "js/shared/notes-editor.js?v=4", test: () => window.LongtailForge?.notesEditor },
    { module: true, src: "js/notes.js?v=71", test: () => window.LongtailForge?.notesDialog?.openNoteEditor },
  ],
  "lists.edit": [
    { src: "js/shared/client-project-options.js?v=2", test: () => window.LongtailForge?.clientProjectOptions },
    { module: true, src: "js/lists.js?v=14", test: () => window.LongtailForge?.listsDialog?.openListEditor },
  ],
};
const workbenchViewHelpers = window.LongtailForge.view;
const api = window.LongtailForge.api;
const modal = window.LongtailForge.modal;
const workbenchHost = document.querySelector("[data-workbench-host]");

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
let timeTrackingModuleLink = null;
let workbenchInspectorCountText = null;
let workbenchInspectorList = null;
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
};
const workbenchCardDataLoaders = {
  "active-work-timers": loadTimerCardData,
  "task-workbench-items": loadTaskOptionsData,
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
    createWorkbenchShell(),
  );
}

function createWorkbenchShell() {
  return workbenchViewHelpers.createElement("div", {
    className: "workbench-shell",
    children: [
      workbenchViewHelpers.createElement("div", {
        className: "workbench-main-column",
        children: [
          createGuidedFocusPanel(),
          createRecommendedActionPanel(),
          createSecondaryWorkbenchPanel(),
        ],
      }),
      createWorkbenchInspectorPanel(),
    ],
  });
}

function createWorkbenchInspectorPanel() {
  workbenchInspectorCountText = workbenchViewHelpers.createElement("span", {
    className: "workbench-count",
    dataset: { workbenchInspectorCount: "" },
    text: "0",
  });
  workbenchInspectorList = workbenchViewHelpers.createElement("div", {
    className: "workbench-inspector-list",
    dataset: { workbenchInspectorList: "" },
  });

  return workbenchViewHelpers.createElement("aside", {
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
              workbenchViewHelpers.createElement("h2", {
                id: "workbench-inspector-heading",
                text: "Work context",
              }),
            ],
          }),
          workbenchInspectorCountText,
          workbenchViewHelpers.createElement("p", {
            text: "Permission-safe records from this focus. Open a title to use its existing module modal when one is available.",
          }),
        ],
      }),
      workbenchInspectorList,
    ],
  });
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

async function loadWorkbench() {
  setStatus("Loading Workbench...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await window.LongtailForge.timezones?.loadSessionTimezone?.();
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
  renderWorkbenchInspector();
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

function renderWorkbenchInspector() {
  if (!workbenchInspectorList || !workbenchInspectorCountText) {
    return;
  }

  const candidates = workbenchInspectorCandidates();
  workbenchInspectorCountText.textContent = String(candidates.length);
  workbenchInspectorList.replaceChildren();

  if (state.focusModeId === PROJECT_FOCUS_MODE_ID && !state.selectedProjectId) {
    workbenchInspectorList.appendChild(emptyState("Choose a project to load related work context."));
    return;
  }

  if (candidates.length === 0) {
    workbenchInspectorList.appendChild(emptyState("No related work context for this focus yet."));
    return;
  }

  candidates.forEach((candidate, index) => {
    workbenchInspectorList.appendChild(createWorkbenchInspectorItem(candidate, index));
  });
}

function workbenchInspectorCandidates() {
  const seen = new Set();
  const candidates = [];

  for (const candidate of state.focusCandidates || []) {
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

function createWorkbenchInspectorItem(candidate, index) {
  const title = inspectorCandidateTitle(candidate);
  const context = inspectorCandidateContext(candidate);
  const titleButton = workbenchViewHelpers.createElement("button", {
    className: "workbench-inspector-title",
    attrs: {
      "aria-label": `Open ${title}`,
      type: "button",
    },
    dataset: {
      workbenchInspectorOpen: candidate.recordType || candidate.moduleId || "work",
    },
    text: title,
  });
  const badges = candidateBadges(candidate);

  titleButton.disabled = !candidateCanOpen(candidate);
  titleButton.addEventListener("click", (event) => openCandidate(candidate, event.currentTarget));

  return workbenchViewHelpers.createElement("article", {
    className: "workbench-inspector-item",
    dataset: {
      workbenchInspectorItem: "",
      workbenchInspectorCurrent: index === state.recommendedCandidateIndex ? "true" : "false",
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
    onClick: (event) => openCandidate(candidate, event?.currentTarget || null),
    role: "primary",
  });
  const actionElements = [actionButtonElement];
  const dismissButtonElement = createResumeDismissButton(candidate);

  if (dismissButtonElement) {
    actionElements.push(dismissButtonElement);
  }

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
        actions: actionElements,
        className: "workbench-recommended-actions",
      }),
    ],
  });

  return card;
}

function createSecondaryCandidateItem(candidate) {
  const actions = [{
    label: candidateActionLabel(candidate),
    onClick: (event) => openCandidate(candidate, event?.currentTarget || null),
  }];
  const resumeStateId = candidateResumeStateId(candidate);

  if (resumeStateId) {
    actions.push({
      label: "Dismiss",
      onClick: (event) => dismissResumeCandidate(candidate, event?.currentTarget || null),
      role: "secondary",
    });
  }

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
        actions,
        className: "workbench-secondary-candidate-actions",
      }),
    ],
  });

  return item;
}

function createResumeDismissButton(candidate) {
  if (!candidateResumeStateId(candidate)) {
    return null;
  }

  return workbenchViewHelpers.createActionButton({
    label: "Dismiss",
    onClick: (event) => dismissResumeCandidate(candidate, event?.currentTarget || null),
    role: "secondary",
  });
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
  if (candidateModuleAction(candidate) || candidate.sourceUrl || candidate.primaryAction?.href) {
    return "Open work";
  }

  return candidate.primaryAction?.label || "Review";
}

async function dismissResumeCandidate(candidate, trigger = null) {
  const resumeStateId = candidateResumeStateId(candidate);

  if (!resumeStateId) {
    setStatus("This recommendation cannot be dismissed yet.", { isError: true });
    return;
  }

  setStatus("Dismissing recommendation...");
  try {
    await api.postJson(`/api/work-resume/${encodeURIComponent(resumeStateId)}/dismiss`, {});
    const focusData = await loadFocusCandidatesForState();
    state.focusCandidates = Array.isArray(focusData?.items) ? focusData.items : [];
    state.focusContext = focusData?.focusContext || null;
    state.recommendedCandidateIndex = 0;
    renderFocusModes();
    renderRecommendedAction();
    renderSecondaryFocusCandidates();
    renderWorkbenchInspector();
    setStatus("Recommendation dismissed.");
    trigger?.focus?.();
  } catch (error) {
    setStatus(error.message || "Recommendation could not be dismissed.", { isError: true });
  }
}

async function openCandidate(candidate, trigger = null) {
  const taskId = candidateTaskId(candidate);

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

async function openModuleActionCandidate(candidate, action, trigger = null) {
  if (action.moduleId && !moduleEnabled(action.moduleId)) {
    setStatus(`${action.moduleLabel} is not available in this workspace.`, { isError: true });
    return;
  }

  setStatus(`Opening ${action.moduleLabel.toLowerCase()}...`);
  try {
    await ensureWorkbenchModuleAction(action.actionId);
    const result = await window.LongtailForge.moduleActions.open(action.actionId, {
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

function candidateModuleAction(candidate = {}) {
  if (candidate.moduleId === "notes" && candidate.recordType === "note" && candidate.recordId) {
    return {
      actionId: "notes.edit",
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

function candidateCanOpen(candidate = {}) {
  return Boolean(candidateTaskId(candidate) || candidateModuleAction(candidate) || candidate.sourceUrl || candidate.primaryAction?.href);
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

function looksLikeRawId(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ||
    /^[0-9a-f]{24,}$/i.test(text);
}

function candidateResumeStateId(candidate = {}) {
  return String(candidate.resumeStateId || candidate.resume_state_id || "").trim();
}

async function ensureWorkbenchModuleAction(actionId) {
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

  const key = new window.URL(dependency.src, document.baseURI).href;
  if (workbenchActionScriptLoads.has(key)) {
    return workbenchActionScriptLoads.get(key);
  }

  const promise = dependency.module
    ? import(key)
    : new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = dependency.src;
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
    renderSecondaryFocusCandidates();
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

function cardContributionActive(rendererId) {
  return (state.registry.workbenchCards || []).some((card) => card.renderer === rendererId);
}

function updateModuleLinks() {
  if (timeTrackingModuleLink) {
    timeTrackingModuleLink.hidden = !cardContributionActive("active-work-timers");
  }
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
    focusCandidateCount: state.focusCandidates.length,
    focusModeId: state.focusModeId,
    inspectorCandidateCount: workbenchInspectorCandidates().length,
    recommendedCandidateIndex: state.recommendedCandidateIndex,
    recommendedCandidateWindowSize: recommendedCandidateWindow().length,
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    timerCount: state.timers.length,
    enabledModules: enabledModuleIds(),
    moduleActionCount: window.LongtailForge.moduleActions?.list?.().length || 0,
    workspaceType: state.workspaceType,
  }),
});
