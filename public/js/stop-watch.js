// Multi-timer setup: each timer card owns its own state, while this module coordinates counts.
(function attachStopWatchPage() {
  const timerGrid =
    document.querySelector("[data-timer-grid]") || createTimerGrid();
  const timerCountSelect = document.querySelector("[data-timer-count]");
  const timerTemplate = (
    document.getElementById("stopwatch") || createTimeTrackerRoot(1)
  ).cloneNode(true);

  let clients = [];
  let tagOptions = [];
  let taskOptions = [];
  let timers = [];

  const timerPersistence = {
    loaded: false,
  };

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
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("The stop watch requires LongtailForge.api.");
    }
    return apiClient;
  }
  function workspaceUsesBillableFlag() {
    return window.LongtailForge?.workspaceContext?.workspaceType === "business";
  }

  function billableValue(input) {
    return workspaceUsesBillableFlag() && input.checked ? "yes" : "no";
  }

  function setTimerCount(timerCount) {
    const nextTimerCount = clampTimerCount(timerCount);

    if (nextTimerCount > timers.length) {
      appendTimers(nextTimerCount);
    } else if (nextTimerCount < timers.length) {
      removeTimers(nextTimerCount);
    }

    timerGrid.style.setProperty("--timer-count", nextTimerCount);

    if (timerCountSelect) {
      timerCountSelect.value = String(nextTimerCount);
    }
  }

  async function handleTimerCountChange() {
    const nextCount = Number(timerCountSelect.value);

    if (nextCount === timers.length) {
      return;
    }

    if (nextCount < timers.length) {
      const removedTimers = timers.slice(nextCount);
      const shouldDiscard = !hasDiscardableTimers(nextCount)
        || await confirmTimerRemoval(removedTimers);

      if (!shouldDiscard) {
        timerCountSelect.value = String(timers.length);
        return;
      }
    }

    setTimerCount(nextCount);
  }

  function appendTimers(nextTimerCount) {
    for (
      let timerNumber = timers.length + 1;
      timerNumber <= nextTimerCount;
      timerNumber += 1
    ) {
      const root = getTimerRootForNumber(timerNumber);
      prepareTimerRoot(root, timerNumber);
      timerGrid.appendChild(root);

      const timer = new StopwatchTimer(root, timerNumber);
      timer.setClients(clients);
      timer.setTaskOptions(taskOptions);
      timers.push(timer);
    }
  }

  function removeTimers(nextTimerCount) {
    const removedTimers = timers.splice(nextTimerCount);

    removedTimers.forEach((timer) => {
      timer.discardPersistedState();
      timer.dispose();
      timer.root.remove();
    });
  }

  function getTimerRootForNumber(timerNumber) {
    if (timerNumber === 1) {
      const existingRoot = timerGrid.querySelector("#stopwatch");

      if (existingRoot) {
        return existingRoot;
      }
    }

    return timerTemplate.cloneNode(true);
  }

  function clampTimerCount(timerCount) {
    if ([1, 2, 3, 4].includes(timerCount)) {
      return timerCount;
    }

    return 1;
  }

  function hasDiscardableTimers(nextCount) {
    return timers.slice(nextCount).some((timer) => timer.hasElapsedTime());
  }

  function confirmTimerRemoval(removedTimers) {
    const timerLabels = removedTimers
      .filter((timer) => timer.hasElapsedTime())
      .map((timer) => `Timer ${timer.timerNumber}`);
    const detail =
      timerLabels.length === 1
        ? `${timerLabels[0]} has unsaved time.`
        : `${timerLabels.join(", ")} have unsaved time.`;

    return window.LongtailForge.modal.confirm({
      title: "Remove timers?",
      message: `${detail} Removing timers will discard that time.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      danger: true,
    });
  }

  async function pauseOtherTimers(activeTimer) {
    // Only one timer should actively run at a time.
    await Promise.all(timers.map((timer) => {
      if (timer !== activeTimer) {
        return timer.pause();
      }
      return Promise.resolve();
    }));
  }

  async function loadClientProjectData() {
    try {
      const data = await requireApi().getJson("/api/client-projects?view=options", {
        cache: "no-store",
      });
      clients = normalizeClientProjectOptions(data);
      timers.forEach((timer) => timer.setClients(clients));
    } catch (error) {
      timers.forEach((timer) => timer.disableClientData());
      console.error(error);
    }
  }

  async function loadActiveTimers(options = {}) {
    try {
      const data = await requireApi().getJson("/api/active-timers", {
        cache: "no-store",
      });
      const activeTimers = Array.isArray(data.timers) ? data.timers : [];
      const maxTimerSlot = activeTimers.reduce((maxSlot, timer) => {
        const timerSlot = Number.parseInt(timer.timer_slot, 10);
        return Number.isFinite(timerSlot) ? Math.max(maxSlot, timerSlot) : maxSlot;
      }, 1);

      setTimerCount(clampTimerCount(maxTimerSlot));

      if (options.resetExisting === true) {
        timers.forEach((timer) => timer.clearLocalStateForReload());
      }

      activeTimers.forEach((timerData) => {
        const timerSlot = Number.parseInt(timerData.timer_slot, 10);
        const timer = timers[timerSlot - 1];

        if (timer) {
          timer.restoreFromPersistedTimer(timerData);
        }
      });
    } catch (error) {
      console.error(error);
    } finally {
      timerPersistence.loaded = true;
    }
  }

  async function loadTaskOptions() {
    if (!workspaceHasTasks()) {
      taskOptions = [];
      timers.forEach((timer) => timer.setTaskOptions(taskOptions));
      return;
    }

    try {
      const data = await requireApi().getJson("/api/tasks?status=active&limit=200", {
        cache: "no-store",
      });
      taskOptions = normalizeTaskOptions(data);
    } catch {
      taskOptions = [];
    }

    timers.forEach((timer) => timer.setTaskOptions(taskOptions));
  }

  async function initializeTimeTracker() {
    await window.LongtailForge.workspaceContextReady;
    setTimerCount(1);
    await loadTagOptions();
    await loadClientProjectData();
    await loadTaskOptions();
    await loadActiveTimers();
  }

  class StopwatchTimer {
    constructor(root, timerNumber) {
      // Existing markup is preferred, but missing controls are created for resilience.
      this.root = root;
      this.timerNumber = timerNumber;
      this.clientSelect =
        root.querySelector("[data-stopwatch-client]") ||
        createSelect(root, "Client", "client", "Select a client");
      this.clientControl = this.clientSelect.closest("[data-client-workspace-control]") ||
        this.clientSelect.closest("label");
      this.projectSelect =
        root.querySelector("[data-stopwatch-project]") ||
        createSelect(root, "Project", "project", "Select a project");
      this.descriptionInput =
        root.querySelector("[data-stopwatch-description]") ||
        createDescriptionInput(root);
      const taskLinkControl = ensureTaskLinkControl(root);
      this.taskSelect = taskLinkControl.select;
      this.linkTaskButton = taskLinkControl.button;
      decorateTaskLinkButton(this.linkTaskButton);
      this.tagsContainer =
        root.querySelector("[data-stopwatch-tags]") ||
        createTagsContainer(root);
      this.display =
        root.querySelector("[data-stopwatch-display]") || createDisplay(root);
      this.startButton =
        root.querySelector("[data-stopwatch-start]") ||
        createButton(root, "Start", "start");
      this.pauseButton =
        root.querySelector("[data-stopwatch-pause]") ||
        createButton(root, "Pause", "pause");
      this.stopButton =
        root.querySelector("[data-stopwatch-stop]") ||
        createButton(root, "Save & End", "stop");
      this.stopButton.textContent = "Save & End";
      this.resetButton =
        root.querySelector("[data-stopwatch-reset]") ||
        createButton(root, "Discard", "reset", { danger: true });
      this.resetButton.textContent = "Discard";
      this.resetButton.classList.add("danger-button");
      decorateStopwatchControls({
        pauseButton: this.pauseButton,
        resetButton: this.resetButton,
        startButton: this.startButton,
        stopButton: this.stopButton,
      });
      this.clearOnResetInput =
        root.querySelector("[data-stopwatch-clear-on-reset]") ||
        createClearOnResetInput(root);
      this.billableInput =
        root.querySelector("[data-stopwatch-billable]") ||
        createBillableInput(root);
      this.billableControl = this.billableInput.closest("[data-stopwatch-billable-control]") ||
        this.billableInput.closest("label");
      this.billableControl.hidden = !workspaceUsesBillableFlag();
      if (!workspaceUsesBillableFlag()) {
        this.billableInput.checked = false;
      }
      this.statusMessage =
        root.querySelector("[data-stopwatch-status]") ||
        createStatusMessage(root);
      this.activeIndicator =
        root.querySelector("[data-stopwatch-active-indicator]") ||
        createActiveIndicator(root);

      this.elapsedMilliseconds = 0;
      this.startedAt = 0;
      this.activeStartTime = null;
      this.timerId = null;
      this.clients = [];
      this.taskOptions = [];
      this.isSaving = false;
      this.confirmedClientId = this.clientSelect.value;
      this.confirmedProjectId = this.projectSelect.value;
      this.persistedActiveTimerId = "";
      this.isRestoring = false;
      this.tagPicker = { readTagIds: () => [], setSelected: () => {} };

      this.startTimeTracker = this.startTimeTracker.bind(this);
      this.pause = this.pause.bind(this);
      this.stopTimeTracker = this.stopTimeTracker.bind(this);
      this.resetTimeTracker = this.resetTimeTracker.bind(this);
      this.handleClientChange = this.handleClientChange.bind(this);
      this.handleProjectChange = this.handleProjectChange.bind(this);
      this.persistEditedTimer = this.persistEditedTimer.bind(this);
      this.linkRunningTimerToTask = this.linkRunningTimerToTask.bind(this);
      this.handleTaskSelectionChange = this.handleTaskSelectionChange.bind(this);

      this.startButton.addEventListener("click", this.startTimeTracker);
      this.pauseButton.addEventListener("click", this.pause);
      this.stopButton.addEventListener("click", this.stopTimeTracker);
      this.resetButton.addEventListener("click", this.resetTimeTracker);
      this.clientSelect.addEventListener("change", this.handleClientChange);
      this.projectSelect.addEventListener("change", this.handleProjectChange);
      this.descriptionInput.addEventListener("change", this.persistEditedTimer);
      this.billableInput.addEventListener("change", this.persistEditedTimer);
      this.taskSelect.addEventListener("change", this.handleTaskSelectionChange);
      this.linkTaskButton.addEventListener("click", this.linkRunningTimerToTask);

      this.updateDisplay();
      this.updateButtons();
      this.mountTagPicker();
    }

    dispose() {
      // Removed timer cards drop their listeners before leaving the DOM.
      window.clearInterval(this.timerId);
      this.startButton.removeEventListener("click", this.startTimeTracker);
      this.pauseButton.removeEventListener("click", this.pause);
      this.stopButton.removeEventListener("click", this.stopTimeTracker);
      this.resetButton.removeEventListener("click", this.resetTimeTracker);
      this.clientSelect.removeEventListener("change", this.handleClientChange);
      this.projectSelect.removeEventListener("change", this.handleProjectChange);
      this.descriptionInput.removeEventListener("change", this.persistEditedTimer);
      this.billableInput.removeEventListener("change", this.persistEditedTimer);
      this.taskSelect.removeEventListener("change", this.handleTaskSelectionChange);
      this.linkTaskButton.removeEventListener("click", this.linkRunningTimerToTask);
    }

    setClients(clients) {
      this.clients = clients;
      this.populateClientOptions();
    }

    setTaskOptions(options) {
      this.taskOptions = Array.isArray(options) ? options : [];
      this.populateTaskOptions();
    }

    disableClientData() {
      this.clientSelect.innerHTML = "";
      this.clientSelect.appendChild(createOption("", "Client data unavailable"));
      this.clientSelect.disabled = true;
      this.projectSelect.disabled = true;
      this.updateButtons();
    }

    async startTimeTracker() {
      if (this.timerId) {
        return;
      }

      await pauseOtherTimers(this);

      // A fresh run gets a new start timestamp; paused runs continue from elapsed time.
      if (this.elapsedMilliseconds === 0 || !this.activeStartTime) {
        this.elapsedMilliseconds = 0;
        this.activeStartTime = new Date();
      }

      this.setStatus("");
      this.startedAt = Date.now() - this.elapsedMilliseconds;
      this.timerId = window.setInterval(() => this.updateElapsedTime(), 100);
      this.updateElapsedTime();
      this.updateButtons();
      await this.persistActiveTimer("running");
    }

    async stopTimeTracker() {
      if (
        (!this.timerId && this.elapsedMilliseconds === 0) ||
        !this.activeStartTime
      ) {
        return;
      }

      if (this.timerId) {
        // Pause first so the saved duration is stable while the request is in flight.
        await this.pause({ persist: false });
      }

      this.updateButtons();
      await this.saveTimeEntry();
    }

    async pause(options = {}) {
      if (!this.timerId) {
        return;
      }

      const shouldPersist = options.persist !== false;

      window.clearInterval(this.timerId);
      this.timerId = null;
      this.updateElapsedTime();
      this.updateButtons();

      if (shouldPersist) {
        await this.persistActiveTimer("paused");
      }
    }

    handleTaskSelectionChange() {
      this.updateButtons();
    }

    async linkRunningTimerToTask() {
      const task = this.taskOptions.find((option) => option.id === this.taskSelect.value);

      if (!task || !this.timerId || !this.persistedActiveTimerId || this.isSaving) {
        return;
      }

      this.isSaving = true;
      this.updateButtons();
      this.setStatus("Linking timer to task...");

      try {
        const result = await requireApi().postJson(
          `/api/tasks/${encodeURIComponent(task.id)}/timer/link`,
          { timer_slot: String(this.timerNumber) },
        );

        window.clearInterval(this.timerId);
        this.timerId = null;
        this.persistedActiveTimerId = "";
        await loadActiveTimers({ resetExisting: true });
        window.dispatchEvent?.(new window.CustomEvent("longtailforge:timers-changed", {
          detail: {
            result,
            source: "time-tracker-task-link",
          },
        }));
        await window.LongtailForge.modal.alert({
          title: "Task timer linked",
          message: `The timer is still running and is now linked to ${task.label || "the selected task"}.`,
        });
      } catch (error) {
        this.setStatus(error.message || "Timer could not be linked to the task.");
        console.error(error);
      } finally {
        this.isSaving = false;
        this.updateButtons();
      }
    }

    async resetTimeTracker() {
      if (!await this.confirmTimerReset("Discarding the timer")) {
        return;
      }

      await this.resetTimeTrackerWithoutConfirmation({ compactAfterRemoval: true });
    }

    async resetTimeTrackerWithoutConfirmation(options = {}) {
      const shouldPersist = options.persist !== false;
      const shouldClearInfo = options.ignoreClearPreference || this.clearOnResetInput.checked;
      const shouldClearElapsed = options.forceClearElapsed !== false;
      const shouldCompactAfterRemoval = options.compactAfterRemoval === true;

      window.clearInterval(this.timerId);
      this.timerId = null;
      if (shouldPersist) {
        await this.discardPersistedState();
      }
      if (shouldClearElapsed) {
        this.elapsedMilliseconds = 0;
      }
      if (shouldClearInfo) {
        this.clientSelect.value = "";
        this.populateProjectOptions([]);
        this.descriptionInput.value = "";
        this.tagPicker?.setSelected?.([]);
        this.billableInput.checked = workspaceUsesBillableFlag();
        this.confirmedClientId = "";
        this.confirmedProjectId = "";
        this.selectWorkspaceScopeClientIfNeeded();
        await this.handleClientChange({ shouldReset: false });
      }
      this.activeStartTime = null;
      this.persistedActiveTimerId = "";
      this.updateDisplay();
      this.updateButtons();

      if (shouldCompactAfterRemoval) {
        await loadActiveTimers();
      }
    }

    async saveTimeEntry() {
      const selectedClient = this.getSelectedClient();
      const selectedProject = this.getSelectedProject(selectedClient);

      if (!this.activeStartTime) {
        this.setStatus("Start the timer before saving time.");
        return;
      }

      if (!selectedProject) {
        this.setStatus("Select a project before saving time.");
        return;
      }

      this.isSaving = true;
      this.updateButtons();
      this.setStatus("Saving time entry...");

      // The API stores ISO timestamps plus calculated seconds/hours for reporting.
      const durationSeconds = Math.round(this.elapsedMilliseconds / 1000);
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - durationSeconds * 1000);
      const entry = {
        client_id: selectedClient?.isWorkspaceScope ? "" : selectedClient.id,
        client_name: selectedClient?.isWorkspaceScope ? "" : selectedClient.name,
        project_id: selectedProject.id,
        project_name: selectedProject.name,
        description: this.descriptionInput.value.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds,
        duration_hours: (durationSeconds / 3600).toFixed(4),
        billable: billableValue(this.billableInput),
        invoice_status: "unbilled",
        tagIds: this.readTagIds(),
      };

      let saved = false;

      try {
        if (this.persistedActiveTimerId) {
          await requireApi().postJson(
            `/api/active-timers/${encodeURIComponent(this.timerNumber)}/finalize`,
            entry,
          );
        } else {
          await requireApi().postJson("/api/time-entries", entry);
        }
        this.setStatus("Saved.", "saved");
        saved = true;
      } catch (error) {
        this.setStatus(
          "Time entry was not saved. Start the local server and try again.",
        );
        console.error(error);
      } finally {
        this.isSaving = false;
        if (saved) {
          await this.resetTimeTrackerWithoutConfirmation({ compactAfterRemoval: true, persist: false });
        }
        this.updateButtons();
      }
    }

    populateClientOptions() {
      const previousClientId = this.clientSelect.value;
      this.clientSelect.innerHTML = "";
      this.clientSelect.appendChild(createOption("", "Select a client"));

      this.clients.forEach((client) => {
        this.clientSelect.appendChild(createOption(client.id, clientOptionLabel(client)));
      });

      this.clientSelect.value = this.clients.some(
        (client) => client.id === previousClientId,
      )
        ? previousClientId
        : "";
      this.selectWorkspaceScopeClientIfNeeded();
      this.clientSelect.disabled = this.clients.length === 0;
      this.handleClientChange({ shouldReset: false });
      this.updateButtons();
    }

    selectWorkspaceScopeClientIfNeeded() {
      if (workspaceShowsClientTools()) {
        return;
      }

      const workspaceClient = this.clients.find((client) => client.isWorkspaceScope);

      if (workspaceClient) {
        this.clientSelect.value = workspaceClient.id;
      }
    }

    async handleClientChange(options = {}) {
      const shouldReset = options.shouldReset !== false;

      if (shouldReset && !await this.confirmTimerReset("Changing the client")) {
        // Restore the last confirmed values when the user cancels a destructive change.
        this.clientSelect.value = this.confirmedClientId;
        const restoredClient = this.getSelectedClient();
        this.populateProjectOptions(
          restoredClient ? restoredClient.projects : [],
          this.confirmedProjectId,
        );
        this.updateButtons();
        return;
      }

      const selectedClient = this.clients.find(
        (client) => client.id === this.clientSelect.value,
      );

      this.populateProjectOptions(selectedClient ? selectedClient.projects : []);

      if (shouldReset) {
        await this.resetTimeTrackerWithoutConfirmation();
      }

      this.confirmedClientId = this.clientSelect.value;
      this.confirmedProjectId = this.projectSelect.value;
    }

    async handleProjectChange() {
      if (!await this.confirmTimerReset("Changing the project")) {
        this.projectSelect.value = this.confirmedProjectId;
        this.updateButtons();
        return;
      }

      await this.resetTimeTrackerWithoutConfirmation();
      this.updateBillableDefault();
      this.confirmedClientId = this.clientSelect.value;
      this.confirmedProjectId = this.projectSelect.value;
    }

    async confirmTimerReset(actionLabel) {
      if (!this.hasElapsedTime()) {
        return true;
      }

      const shouldContinue = await window.LongtailForge.modal.confirm({
        title: "Discard timer?",
        message: `${actionLabel} will stop and discard this timer's elapsed time. Continue?`,
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        danger: true,
      });

      if (!shouldContinue) {
        this.setStatus("Timer change canceled.");
      }

      return shouldContinue;
    }

    populateProjectOptions(projects, previousProjectId = this.projectSelect.value) {
      this.projectSelect.innerHTML = "";
      this.projectSelect.appendChild(createOption("", "Select a project"));

      projects.forEach((project) => {
        this.projectSelect.appendChild(createOption(project.id, projectOptionLabel(project)));
      });

      this.projectSelect.value = projects.some(
        (project) => project.id === previousProjectId,
      )
        ? previousProjectId
        : "";
      this.projectSelect.disabled = projects.length === 0;
      this.updateBillableDefault();
      this.populateTaskOptions();
    }

    populateTaskOptions(taskId = this.taskSelect.value) {
      const projectId = this.projectSelect.value;
      const candidates = this.taskOptions.filter((task) => task.project_id === projectId);
      const placeholder = this.timerId
        ? (candidates.length > 0 ? "Select a task" : "No active tasks for this project")
        : "Start timer to link a task";

      this.taskSelect.replaceChildren(createOption("", placeholder));
      candidates.forEach((task) => {
        this.taskSelect.appendChild(createOption(task.id, task.optionLabel || task.label));
      });
      this.taskSelect.value = candidates.some((task) => task.id === taskId) ? taskId : "";
      this.taskSelect.disabled = !this.timerId || !this.persistedActiveTimerId || candidates.length === 0 || this.isSaving;
    }

    getSelectedClient() {
      return this.clients.find((client) => client.id === this.clientSelect.value);
    }

    getSelectedProject(client) {
      if (!client || !Array.isArray(client.projects)) {
        return null;
      }

      return client.projects.find(
        (project) => project.id === this.projectSelect.value,
      );
    }

    updateElapsedTime() {
      this.elapsedMilliseconds = Date.now() - this.startedAt;
      this.updateDisplay();
    }

    updateDisplay() {
      this.display.textContent = formatTime(this.elapsedMilliseconds);
    }

    updateButtons() {
      const hasRequiredDetails = Boolean(
        this.clientSelect.value && this.projectSelect.value,
      );
      const hasElapsedTime =
        this.elapsedMilliseconds > 0 || Boolean(this.timerId);
      const hasSaveableTime = hasElapsedTime && Boolean(this.activeStartTime);

      this.startButton.disabled =
        Boolean(this.timerId) || this.isSaving || !hasRequiredDetails;
      this.pauseButton.disabled = !this.timerId || this.isSaving;
      this.stopButton.disabled = !hasSaveableTime || this.isSaving;
      this.resetButton.disabled = !hasElapsedTime || this.isSaving;
      this.populateTaskOptions();
      this.linkTaskButton.disabled = (
        !this.timerId ||
        !this.persistedActiveTimerId ||
        !this.taskSelect.value ||
        this.isSaving
      );
      this.updateTimerStateLabel();
    }

    updateTimerStateLabel() {
      const isActive = Boolean(this.timerId);
      const isPaused = !isActive && Boolean(this.activeStartTime);
      const state = isActive ? "active" : isPaused ? "paused" : "unused";

      this.activeIndicator.hidden = false;
      this.activeIndicator.textContent = isActive ? "Active" : isPaused ? "Paused" : "Unused";
      this.activeIndicator.dataset.timerState = state;
    }

    hasElapsedTime() {
      return this.elapsedMilliseconds > 0 || Boolean(this.timerId);
    }

    isRunning() {
      return Boolean(this.timerId);
    }

    setStatus(message, type = "") {
      this.statusMessage.textContent = message;
      this.statusMessage.classList.toggle("is-saved", type === "saved");
    }

    updateBillableDefault() {
      if (!workspaceUsesBillableFlag()) {
        this.billableInput.checked = false;
        return;
      }

      const selectedClient = this.getSelectedClient();
      const selectedProject = this.getSelectedProject(selectedClient);
      const billableSource = selectedProject || selectedClient;

      this.billableInput.checked = billableSource?.billable !== "no";
    }

    mountTagPicker(selectedTagIds = []) {
      if (!this.tagsContainer || !window.LongtailForge?.tags?.mountPicker) {
        if (this.tagsContainer) {
          this.tagsContainer.hidden = true;
        }
        return;
      }

      this.tagsContainer.hidden = false;
      window.LongtailForge.tags.mountPicker(this.tagsContainer, {
        tags: tagOptions,
        selectedTagIds,
      }).then((picker) => {
        this.tagPicker = picker || this.tagPicker;
      });
    }

    readTagIds() {
      return this.tagPicker?.readTagIds?.() || [];
    }

    restoreFromPersistedTimer(timerData) {
      this.isRestoring = true;
      this.persistedActiveTimerId = timerData.active_timer_id || "";
      this.clientSelect.value = timerData.client_id || this.findClientIdForProject(timerData.project_id) || "";

      const selectedClient = this.getSelectedClient();
      this.populateProjectOptions(selectedClient ? selectedClient.projects : [], timerData.project_id);
      this.projectSelect.value = timerData.project_id || "";
      this.descriptionInput.value = timerData.description || "";
      this.billableInput.checked = workspaceUsesBillableFlag() && timerData.billable !== "no";
      this.confirmedClientId = this.clientSelect.value;
      this.confirmedProjectId = this.projectSelect.value;

      const accumulatedMilliseconds =
        (Number(timerData.accumulated_elapsed_seconds) || 0) * 1000;

      if (timerData.timer_status === "running") {
        const lastActiveStartTime = new Date(timerData.last_active_start_time || Date.now());
        const runningMilliseconds = Number.isFinite(lastActiveStartTime.getTime())
          ? Date.now() - lastActiveStartTime.getTime()
          : 0;

        this.elapsedMilliseconds = Math.max(0, accumulatedMilliseconds + runningMilliseconds);
        this.startedAt = Date.now() - this.elapsedMilliseconds;
        this.activeStartTime = lastActiveStartTime;
        this.timerId = window.setInterval(() => this.updateElapsedTime(), 100);
      } else {
        this.elapsedMilliseconds = accumulatedMilliseconds;
        this.startedAt = Date.now() - this.elapsedMilliseconds;
        this.activeStartTime = timerData.last_active_start_time
          ? new Date(timerData.last_active_start_time)
          : new Date(Date.now() - this.elapsedMilliseconds);
      }

      this.updateDisplay();
      this.updateButtons();
      this.setStatus("Restored unsaved timer.");
      this.isRestoring = false;
    }

    clearLocalStateForReload() {
      window.clearInterval(this.timerId);
      this.timerId = null;
      this.elapsedMilliseconds = 0;
      this.startedAt = 0;
      this.activeStartTime = null;
      this.persistedActiveTimerId = "";
      this.clientSelect.value = "";
      this.populateProjectOptions([]);
      this.descriptionInput.value = "";
      this.billableInput.checked = workspaceUsesBillableFlag();
      this.tagPicker?.setSelected?.([]);
      this.confirmedClientId = "";
      this.confirmedProjectId = "";
      this.selectWorkspaceScopeClientIfNeeded();
      const selectedClient = this.getSelectedClient();
      this.populateProjectOptions(selectedClient ? selectedClient.projects : []);
      this.setStatus("");
      this.updateDisplay();
      this.updateButtons();
    }

    findClientIdForProject(projectId) {
      const projectKey = String(projectId || "").trim();
      const matchingClient = this.clients.find((client) => (
        Array.isArray(client.projects) &&
        client.projects.some((project) => String(project.id || "").trim() === projectKey)
      ));

      return matchingClient?.id || "";
    }

    async persistEditedTimer() {
      if (this.isRestoring || !this.hasElapsedTime()) {
        return;
      }

      await this.persistActiveTimer(this.timerId ? "running" : "paused");
    }

    async persistActiveTimer(timerStatus) {
      const selectedClient = this.getSelectedClient();
      const selectedProject = this.getSelectedProject(selectedClient);

      if (!selectedProject || this.isSaving) {
        return;
      }

      const now = new Date();
      const elapsedSeconds = Math.max(0, Math.round(this.elapsedMilliseconds / 1000));
      const payload = {
        active_timer_id: this.persistedActiveTimerId,
        timer_slot: String(this.timerNumber),
        client_id: selectedClient?.isWorkspaceScope ? "" : selectedClient?.id || "",
        client_name: selectedClient?.isWorkspaceScope ? "" : selectedClient?.name || "",
        project_id: selectedProject.id,
        project_name: selectedProject.name,
        description: this.descriptionInput.value.trim(),
        billable: billableValue(this.billableInput),
        accumulated_elapsed_seconds: elapsedSeconds,
        last_active_start_time: timerStatus === "running" ? now.toISOString() : null,
        timer_status: timerStatus,
      };

      try {
        const result = await requireApi().putJson(
          `/api/active-timers/${encodeURIComponent(this.timerNumber)}`,
          payload,
        );
        this.persistedActiveTimerId = result?.timer?.active_timer_id || this.persistedActiveTimerId;
        timerPersistence.loaded = true;
        this.updateButtons();
      } catch (error) {
        this.setStatus("Timer is running locally, but persistence failed.");
        console.error(error);
      }
    }

    async discardPersistedState() {
      if (!this.persistedActiveTimerId && !timerPersistence.loaded) {
        return;
      }

      try {
        await requireApi().deleteJson(
          `/api/active-timers/${encodeURIComponent(this.timerNumber)}`,
        );
      } catch (error) {
        console.error(error);
      } finally {
        this.persistedActiveTimerId = "";
      }
    }
  }

  initializeTimeTracker();

  if (timerCountSelect) {
    timerCountSelect.addEventListener("input", handleTimerCountChange);
    timerCountSelect.addEventListener("change", handleTimerCountChange);
  }

  window.timeTrackerDebug = {
    snapshot: () => ({
      // Handy manual check from the browser console after changing timer rendering.
      selectedTimerCount: timerCountSelect ? timerCountSelect.value : "",
      timerInstances: timers.length,
      renderedTimerCards: timerGrid.querySelectorAll(".timer-card").length,
      runningTimers: timers
        .filter((timer) => timer.isRunning())
        .map((timer) => timer.timerNumber),
    }),
    runTimerCountSanityCheck: async () => {
      const originalCount = timers.length;
      const originalTimers = [...timers];
      const runningTimers = originalTimers.filter((timer) => timer.isRunning());
      const increasedCount = Math.min(4, originalCount + 1);
      const canExerciseAdd = increasedCount > originalCount;

      if (canExerciseAdd) {
        setTimerCount(increasedCount);
      }

      const identitiesPreserved = originalTimers.every(
        (timer, index) => timers[index] === timer,
      );
      const runningTimersStayedRunning = runningTimers.every((timer) =>
        timer.isRunning(),
      );

      if (canExerciseAdd) {
        setTimerCount(originalCount);
      }

      return {
        identitiesPreserved,
        runningTimersStayedRunning,
        removedTimersDisposedCleanly:
          !canExerciseAdd || timers.length === originalCount,
        note: canExerciseAdd
          ? "Temporarily added and removed one empty timer."
          : "Already at the maximum timer count, so add/remove was skipped.",
      };
    },
  };

  function prepareTimerRoot(root, timerNumber) {
    root.dataset.stopwatch = "";
    root.classList.add("timer-card");
    root.setAttribute("aria-label", `Timer ${timerNumber}`);
    root.id = timerNumber === 1 ? "stopwatch" : `stopwatch-${timerNumber}`;

    const title = root.querySelector("[data-stopwatch-title]");

    if (title) {
      title.textContent = `Timer ${timerNumber}`;
    }
  }

  function createTimerGrid() {
    const grid = document.createElement("div");
    grid.className = "timer-grid";
    grid.dataset.timerGrid = "";
    document.body.appendChild(grid);
    return grid;
  }

  function createTimeTrackerRoot(timerNumber) {
    const element = document.createElement("section");
    element.className = "timer-card";
    element.dataset.stopwatch = "";
    element.setAttribute("aria-label", `Timer ${timerNumber}`);

    const title = document.createElement("h2");
    title.dataset.stopwatchTitle = "";
    title.textContent = `Timer ${timerNumber}`;
    element.appendChild(title);

    createSelect(element, "Client", "client", "Select a client");
    createSelect(element, "Project", "project", "Select a project").disabled =
      true;
    createDescriptionInput(element);
    createTagsContainer(element);
    createDisplay(element);
    createButton(element, "Start", "start");
    createButton(element, "Pause", "pause");
    createButton(element, "Save & End", "stop");
    createButton(element, "Discard", "reset", { danger: true });
    createClearOnResetInput(element);
    createBillableInput(element);
    createStatusMessage(element);

    return element;
  }

  function createSelect(parent, labelText, fieldName, placeholder) {
    const details = getDetailsContainer(parent);
    const label = document.createElement("label");
    const select = document.createElement("select");

    if (fieldName === "client") {
      label.dataset.clientWorkspaceControl = "";
    }

    select.dataset[`stopwatch${capitalize(fieldName)}`] = "";
    select.appendChild(createOption("", placeholder));

    label.textContent = labelText;
    label.appendChild(select);
    details.appendChild(label);

    return select;
  }

  function createDescriptionInput(parent) {
    const details = getDetailsContainer(parent);
    const label = document.createElement("label");
    const input = document.createElement("input");

    input.type = "text";
    input.placeholder = "What are you working on?";
    input.dataset.stopwatchDescription = "";

    label.textContent = "Description";
    label.appendChild(input);
    details.appendChild(label);

    return input;
  }

  function ensureTaskLinkControl(parent) {
    const existingSelect = parent.querySelector("[data-stopwatch-task]");
    const existingButton = parent.querySelector("[data-stopwatch-link-task]");

    if (existingSelect && existingButton) {
      return { button: existingButton, select: existingSelect };
    }

    const details = getDetailsContainer(parent);
    const wrapper = document.createElement("div");
    const label = document.createElement("label");
    const select = document.createElement("select");
    const button = document.createElement("button");

    wrapper.className = "timer-task-link-control";
    label.textContent = "Link running timer to task";
    select.dataset.stopwatchTask = "";
    select.disabled = true;
    select.appendChild(createOption("", "Start timer to link a task"));
    button.type = "button";
    button.dataset.stopwatchLinkTask = "";
    button.disabled = true;
    button.textContent = "Link Task";
    label.appendChild(select);
    wrapper.append(label, button);
    details.appendChild(wrapper);

    return { button, select };
  }

  function createTagsContainer(parent) {
    const details = getDetailsContainer(parent);
    const element = document.createElement("div");
    element.dataset.stopwatchTags = "";
    details.appendChild(element);
    return element;
  }

  function getDetailsContainer(parent) {
    let details = parent.querySelector("[data-stopwatch-details]");

    if (!details) {
      details = document.createElement("div");
      details.dataset.stopwatchDetails = "";
      parent.appendChild(details);
    }

    return details;
  }

  function createStatusMessage(parent) {
    const element = document.createElement("p");
    element.dataset.stopwatchStatus = "";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    parent.appendChild(element);
    return element;
  }

  function createClearOnResetInput(parent) {
    const label = document.createElement("label");
    label.className = "reset-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.stopwatchClearOnReset = "";

    label.append(
      input,
      document.createTextNode(" Clear Info when Stopped/Discarded"),
    );
    parent.appendChild(label);

    return input;
  }

  function createBillableInput(parent) {
    const label = document.createElement("label");
    label.className = "reset-option";
    label.dataset.stopwatchBillableControl = "";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = workspaceUsesBillableFlag();
    input.dataset.stopwatchBillable = "";

    label.append(
      input,
      document.createTextNode(" Billable?"),
    );
    parent.appendChild(label);

    return input;
  }

  function createDisplay(parent) {
    const element = document.createElement("output");
    element.dataset.stopwatchDisplay = "";
    element.setAttribute("aria-live", "polite");

    parent.appendChild(element);
    return element;
  }

  function createActiveIndicator(parent) {
    const title = parent.querySelector("[data-stopwatch-title]");
    const element = document.createElement("p");

    element.className = "timer-active-indicator";
    element.dataset.stopwatchActiveIndicator = "";
    element.hidden = true;
    element.textContent = "Active";

    if (title) {
      parent.insertBefore(element, title);
    } else {
      parent.prepend(element);
    }

    return element;
  }

  function createButton(parent, label, action, options = {}) {
    let controls = parent.querySelector("[data-stopwatch-controls]");

    if (!controls) {
      controls = document.createElement("div");
      controls.dataset.stopwatchControls = "";
      parent.appendChild(controls);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset[`stopwatch${capitalize(action)}`] = "";
    button.classList.toggle("danger-button", Boolean(options.danger));

    controls.appendChild(button);
    return button;
  }

  function decorateStopwatchControls({ pauseButton, resetButton, startButton, stopButton }) {
    const icons = window.LongtailForge?.icons;

    if (!icons?.decorateButton) {
      return;
    }

    icons.decorateButton(startButton, { icon: "start", label: "Start timer", text: "Start", iconOnly: false });
    icons.decorateButton(pauseButton, { icon: "pause", label: "Pause timer", text: "Pause", iconOnly: false });
    icons.decorateButton(stopButton, { icon: "save", label: "Save and end timer", text: "Save & End", iconOnly: false });
    icons.decorateButton(resetButton, { icon: "delete", label: "Discard timer", text: "Discard", iconOnly: false, variant: "danger" });
  }

  function decorateTaskLinkButton(button) {
    window.LongtailForge?.icons?.decorateButton?.(button, {
      icon: "link",
      iconOnly: false,
      label: "Link running timer to task",
      text: "Link Task",
    });
  }

  function normalizeClientProjectOptions(data) {
    return window.LongtailForge.clientProjectOptions.normalizeClients(data);
  }

  function clientOptionLabel(client) {
    return window.LongtailForge.clientProjectOptions.optionLabel(client);
  }

  function projectOptionLabel(project) {
    return window.LongtailForge.clientProjectOptions.optionLabel(project);
  }

  function workspaceShowsClientTools() {
    const context = window.LongtailForge?.workspaceContext || {};
    const tools = context.workspaceCapabilities?.availableTools || [];

    return Array.isArray(tools) && tools.includes("clients_projects");
  }

  function workspaceHasTasks() {
    const enabledModules = window.LongtailForge?.workspaceContext?.enabledModules || [];
    return !Array.isArray(enabledModules) || enabledModules.length === 0 || enabledModules.includes("tasks");
  }

  function normalizeTaskOptions(data) {
    return Array.isArray(data?.options?.tasks)
      ? data.options.tasks
          .filter((task) => task?.id && task?.project_id && task?.status !== "complete" && task?.status !== "archived")
          .map((task) => ({
            id: task.id || task.task_id,
            label: task.label || task.title || "Untitled Task",
            optionLabel: task.optionLabel || task.displayName || task.label || "Untitled Task",
            project_id: task.project_id || "",
            status: task.status || "open",
          }))
      : [];
  }

  async function loadTagOptions() {
    tagOptions = window.LongtailForge?.tags?.loadTags
      ? await window.LongtailForge.tags.loadTags({ status: "active" })
      : [];
    timers.forEach((timer) => timer.mountTagPicker(timer.readTagIds()));
  }

  function createOption(value, label) {
    return window.LongtailForge.pageController.createOption(value, label);
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  window.LongtailForge.pageController.register("time-tracker", {
    snapshot: () => ({
      clientCount: clients.length,
      persistedTimersLoaded: timerPersistence.loaded,
      runningTimers: timers.filter((timer) => timer.isRunning).length,
      timerCount: timers.length,
    }),
    runSmoke: () => {
      const checks = [
        { name: "timer grid exists", ok: Boolean(timerGrid) },
        { name: "timer count select exists", ok: Boolean(timerCountSelect) },
        { name: "at least one timer exists", ok: timers.length >= 1 },
        { name: "timer count is within supported range", ok: timers.length >= 1 && timers.length <= 4 },
      ];

      return {
        ok: checks.every((check) => check.ok),
        pageId: "time-tracker",
        checks,
      };
    },
  });
})();
