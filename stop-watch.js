const timerGrid =
  document.querySelector("[data-timer-grid]") || createTimerGrid();
const timerCountSelect = document.querySelector("[data-timer-count]");
const timerTemplate = (
  document.getElementById("stopwatch") || createTimeTrackerRoot(1)
).cloneNode(true);

let clients = [];
let timers = [];

function setTimerCount(timerCount) {
  const nextTimerCount = clampTimerCount(timerCount);

  timers.forEach((timer) => timer.dispose());
  timers = [];
  timerGrid.innerHTML = "";

  for (let timerNumber = 1; timerNumber <= nextTimerCount; timerNumber += 1) {
    const root = timerTemplate.cloneNode(true);
    prepareTimerRoot(root, timerNumber);
    timerGrid.appendChild(root);
    const timer = new StopwatchTimer(root, timerNumber);
    timer.setClients(clients);
    timers.push(timer);
  }

  timerGrid.style.setProperty("--timer-count", nextTimerCount);
}

function handleTimerCountChange() {
  const nextCount = Number(timerCountSelect.value);

  if (nextCount === timers.length) {
    return;
  }

  if (nextCount < timers.length && hasDiscardableTimers(nextCount)) {
    const shouldDiscard = window.confirm(
      "Reducing timers will discard time in the hidden timers. Continue?",
    );

    if (!shouldDiscard) {
      timerCountSelect.value = String(timers.length);
      return;
    }
  }

  setTimerCount(nextCount);
}

function clampTimerCount(timerCount) {
  if ([1, 2, 3].includes(timerCount)) {
    return timerCount;
  }

  return 1;
}

function hasDiscardableTimers(nextCount) {
  return timers.slice(nextCount).some((timer) => timer.hasElapsedTime());
}

function pauseOtherTimers(activeTimer) {
  timers.forEach((timer) => {
    if (timer !== activeTimer) {
      timer.pause();
    }
  });
}

async function loadClientProjectData() {
  try {
    const response = await fetch("data/client-project.json");

    if (!response.ok) {
      throw new Error(`Could not load client data: ${response.status}`);
    }

    const data = await response.json();
    clients = Array.isArray(data.clients) ? data.clients : [];
    timers.forEach((timer) => timer.setClients(clients));
  } catch (error) {
    timers.forEach((timer) => timer.disableClientData());
    console.error(error);
  }
}

class StopwatchTimer {
  constructor(root, timerNumber) {
    this.root = root;
    this.timerNumber = timerNumber;
    this.clientSelect =
      root.querySelector("[data-stopwatch-client]") ||
      createSelect(root, "Client", "client", "Select a client");
    this.projectSelect =
      root.querySelector("[data-stopwatch-project]") ||
      createSelect(root, "Project", "project", "Select a project");
    this.descriptionInput =
      root.querySelector("[data-stopwatch-description]") ||
      createDescriptionInput(root);
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
      createButton(root, "Stop", "stop");
    this.resetButton =
      root.querySelector("[data-stopwatch-reset]") ||
      createButton(root, "Reset", "reset");
    this.clearOnResetInput =
      root.querySelector("[data-stopwatch-clear-on-reset]") ||
      createClearOnResetInput(root);
    this.statusMessage =
      root.querySelector("[data-stopwatch-status]") ||
      createStatusMessage(root);

    this.elapsedMilliseconds = 0;
    this.startedAt = 0;
    this.activeStartTime = null;
    this.timerId = null;
    this.clients = [];
    this.isSaving = false;

    this.startTimeTracker = this.startTimeTracker.bind(this);
    this.pause = this.pause.bind(this);
    this.stopTimeTracker = this.stopTimeTracker.bind(this);
    this.resetTimeTracker = this.resetTimeTracker.bind(this);
    this.handleClientChange = this.handleClientChange.bind(this);

    this.startButton.addEventListener("click", this.startTimeTracker);
    this.pauseButton.addEventListener("click", this.pause);
    this.stopButton.addEventListener("click", this.stopTimeTracker);
    this.resetButton.addEventListener("click", this.resetTimeTracker);
    this.clientSelect.addEventListener("change", this.handleClientChange);
    this.projectSelect.addEventListener("change", this.resetTimeTracker);

    this.updateDisplay();
    this.updateButtons();
  }

  dispose() {
    window.clearInterval(this.timerId);
    this.startButton.removeEventListener("click", this.startTimeTracker);
    this.pauseButton.removeEventListener("click", this.pause);
    this.stopButton.removeEventListener("click", this.stopTimeTracker);
    this.resetButton.removeEventListener("click", this.resetTimeTracker);
    this.clientSelect.removeEventListener("change", this.handleClientChange);
    this.projectSelect.removeEventListener("change", this.resetTimeTracker);
  }

  setClients(clients) {
    this.clients = clients;
    this.populateClientOptions();
  }

  disableClientData() {
    this.clientSelect.innerHTML = "";
    this.clientSelect.appendChild(createOption("", "Client data unavailable"));
    this.clientSelect.disabled = true;
    this.projectSelect.disabled = true;
    this.updateButtons();
  }

  startTimeTracker() {
    if (this.timerId) {
      return;
    }

    pauseOtherTimers(this);

    if (this.elapsedMilliseconds === 0 || !this.activeStartTime) {
      this.elapsedMilliseconds = 0;
      this.activeStartTime = new Date();
    }

    this.setStatus("");
    this.startedAt = Date.now() - this.elapsedMilliseconds;
    this.timerId = window.setInterval(() => this.updateElapsedTime(), 100);
    this.updateElapsedTime();
    this.updateButtons();
  }

  async stopTimeTracker() {
    if (
      (!this.timerId && this.elapsedMilliseconds === 0) ||
      !this.activeStartTime
    ) {
      return;
    }

    if (this.timerId) {
      this.pause();
    }

    this.updateButtons();
    await this.saveTimeEntry();
  }

  pause() {
    if (!this.timerId) {
      return;
    }

    window.clearInterval(this.timerId);
    this.timerId = null;
    this.updateElapsedTime();
    this.updateButtons();
  }

  resetTimeTracker() {
    window.clearInterval(this.timerId);
    this.timerId = null;
    this.elapsedMilliseconds = 0;
    this.activeStartTime = null;
    this.clearDetailsIfRequested();
    this.updateDisplay();
    this.updateButtons();
  }

  clearDetailsIfRequested() {
    if (!this.clearOnResetInput.checked) {
      return;
    }

    this.clientSelect.value = "";
    this.populateProjectOptions([]);
    this.descriptionInput.value = "";
  }

  async saveTimeEntry() {
    const selectedClient = this.getSelectedClient();
    const selectedProject = this.getSelectedProject(selectedClient);

    if (!this.activeStartTime) {
      this.setStatus("Start the timer before saving time.");
      return;
    }

    if (!selectedClient || !selectedProject) {
      this.setStatus("Select a client and project before saving time.");
      return;
    }

    this.isSaving = true;
    this.updateButtons();
    this.setStatus("Saving time entry...");

    const endTime = new Date();
    const durationSeconds = Math.round(this.elapsedMilliseconds / 1000);
    const entry = {
      client_id: selectedClient.id,
      client_name: selectedClient.name,
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      description: this.descriptionInput.value.trim(),
      start_time: this.activeStartTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
      duration_hours: (durationSeconds / 3600).toFixed(4),
      billable: "yes",
      invoice_status: "unbilled",
    };

    let saved = false;

    try {
      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        throw new Error(`Could not save time entry: ${response.status}`);
      }

      const result = await response.json();
      this.setStatus(`Saved ${result.entry_id} to ${result.file}.`);
      saved = true;
    } catch (error) {
      this.setStatus(
        "Time entry was not saved. Start the local server and try again.",
      );
      console.error(error);
    } finally {
      this.isSaving = false;
      if (saved) {
        this.activeStartTime = null;
      }
      this.updateButtons();
    }
  }

  populateClientOptions() {
    const previousClientId = this.clientSelect.value;
    this.clientSelect.innerHTML = "";
    this.clientSelect.appendChild(createOption("", "Select a client"));

    sortByName(this.clients).forEach((client) => {
      this.clientSelect.appendChild(createOption(client.id, client.name));
    });

    this.clientSelect.value = this.clients.some(
      (client) => client.id === previousClientId,
    )
      ? previousClientId
      : "";
    this.clientSelect.disabled = this.clients.length === 0;
    this.handleClientChange({ shouldReset: false });
    this.updateButtons();
  }

  handleClientChange(options = {}) {
    const selectedClient = this.clients.find(
      (client) => client.id === this.clientSelect.value,
    );

    this.populateProjectOptions(selectedClient ? selectedClient.projects : []);

    if (options.shouldReset !== false) {
      this.resetTimeTracker();
    }
  }

  populateProjectOptions(projects) {
    const previousProjectId = this.projectSelect.value;
    this.projectSelect.innerHTML = "";
    this.projectSelect.appendChild(createOption("", "Select a project"));

    sortByName(projects).forEach((project) => {
      this.projectSelect.appendChild(createOption(project.id, project.name));
    });

    this.projectSelect.value = projects.some(
      (project) => project.id === previousProjectId,
    )
      ? previousProjectId
      : "";
    this.projectSelect.disabled = projects.length === 0;
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
  }

  hasElapsedTime() {
    return this.elapsedMilliseconds > 0 || Boolean(this.timerId);
  }

  setStatus(message) {
    this.statusMessage.textContent = message;
  }
}

setTimerCount(1);
loadClientProjectData();

if (timerCountSelect) {
  timerCountSelect.addEventListener("input", handleTimerCountChange);
  timerCountSelect.addEventListener("change", handleTimerCountChange);
}

window.timeTrackerDebug = () => ({
  selectedTimerCount: timerCountSelect ? timerCountSelect.value : "",
  timerInstances: timers.length,
  renderedTimerCards: timerGrid.querySelectorAll(".timer-card").length,
});

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
  createDisplay(element);
  createButton(element, "Start", "start");
  createButton(element, "Pause", "pause");
  createButton(element, "Stop", "stop");
  createButton(element, "Reset", "reset");
  createClearOnResetInput(element);
  createStatusMessage(element);

  return element;
}

function createSelect(parent, labelText, fieldName, placeholder) {
  const details = getDetailsContainer(parent);
  const label = document.createElement("label");
  const select = document.createElement("select");

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
    document.createTextNode(" Clear Info when Reset"),
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

function createButton(parent, label, action) {
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

  controls.appendChild(button);
  return button;
}

function sortByName(items) {
  return [...items].sort((firstItem, secondItem) =>
    firstItem.name.localeCompare(secondItem.name, undefined, {
      sensitivity: "base",
    }),
  );
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
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
