(function attachNotificationPreferences(global) {
  const root = global.LongtailForge || {};

  async function loadPreferences() {
    const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(body?.error || body?.message || "Notification preferences unavailable.");
    }

    return {
      canManageWorkspaceDefaults: body?.canManageWorkspaceDefaults === true,
      events: Array.isArray(body?.events) ? body.events : [],
      groupingPreferences: normalizeGroupingPreferences(body?.groupingPreferences),
    };
  }

  async function saveUserPreferences(preferences, groupingPreferences = null) {
    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences,
        ...(groupingPreferences ? { groupingPreferences } : {}),
      }),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(body?.error || body?.message || "Unable to save notification preferences.");
    }

    return body;
  }

  async function saveWorkspaceDefaults(defaults) {
    const response = await fetch("/api/notifications/workspace-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults }),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(body?.error || body?.message || "Unable to save workspace notification defaults.");
    }

    return body;
  }

  function renderPreferenceGroups(container, events, options = {}) {
    if (!container) {
      return;
    }

    const normalizedEvents = normalizeEvents(events);
    container.replaceChildren();

    if (normalizedEvents.length === 0) {
      container.appendChild(createPlaceholder(options.emptyText || "No configurable notification types"));
      return;
    }

    groupEventsByModule(normalizedEvents).forEach((group) => {
      container.appendChild(createPreferenceGroup(group, options));
    });
  }

  function renderGroupingPreferences(container, groupingPreferences = {}, options = {}) {
    if (!container) {
      return;
    }

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const selectLabel = document.createElement("label");
    const select = document.createElement("select");
    const helper = document.createElement("p");
    const workspaceType = options.workspaceType || global.LongtailForge?.workspaceContext?.workspaceType || "business";

    fieldset.className = "notification-grouping-preferences";
    legend.textContent = "Notification grouping";
    select.dataset.notificationGroupingMode = "";
    select.setAttribute("aria-label", "Notification grouping");
    groupingOptions(workspaceType).forEach((option) => select.append(optionElement(option.value, option.label)));
    select.value = normalizeGroupingPreferences(groupingPreferences).groupingMode;
    selectLabel.append("Group notifications", select);
    helper.className = "muted-text";
    helper.textContent = "Applies to the All Notifications page.";
    fieldset.append(legend, selectLabel, helper);
    container.replaceChildren(fieldset);
  }

  function readGroupingPreferencesPayload(container) {
    const groupingMode = container?.querySelector("[data-notification-grouping-mode]")?.value || "client_project";

    return {
      groupingMode: normalizeGroupingMode(groupingMode),
    };
  }

  function readUserPreferencesPayload(container) {
    return [...(container?.querySelectorAll("[data-notification-event-id]") || [])].map((row) => {
      const input = row.querySelector("[data-preference-user-enabled]");
      const enabled = input?.disabled
        ? input.dataset.preferenceOriginalEnabled !== "false"
        : input?.checked !== false;

      return {
        id: row.dataset.notificationEventId,
        enabled,
      };
    });
  }

  function readWorkspaceDefaultsPayload(container) {
    return [...(container?.querySelectorAll("[data-preference-workspace-enabled]") || [])].map((input) => {
      const row = input.closest("[data-notification-event-id]");

      return {
        id: row?.dataset.notificationEventId || "",
        enabled: input.checked !== false,
        priority: row?.querySelector("[data-preference-workspace-priority]")?.value || "normal",
      };
    }).filter((preference) => preference.id);
  }

  function createPreferenceGroup(group, options) {
    const section = document.createElement("section");
    const heading = document.createElement(options.headingLevel || "h3");

    section.className = "notification-preference-group";
    section.dataset.notificationPreferenceModule = group.moduleId;
    section.dataset.notificationPreferenceModuleEnabled = String(group.moduleEnabled !== false);
    heading.textContent = group.label;
    section.appendChild(heading);
    group.events.forEach((event) => {
      section.appendChild(createPreferenceRow(event, options));
    });
    return section;
  }

  function createPreferenceRow(preference, options) {
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const description = document.createElement("p");
    const workspaceDefaultDisabled = preference.workspaceEnabled === false;

    row.className = "notification-preference-row";
    row.dataset.notificationEventId = preference.id;

    legend.textContent = preference.label || preference.id;
    description.textContent = preference.description || "";
    description.className = "muted-text";

    row.append(legend, description, createPreferenceMatrix(preference, {
      includeWorkspaceDefaults: options.includeWorkspaceDefaults && options.canManageWorkspaceDefaults,
      workspaceDefaultDisabled,
    }));

    return row;
  }

  function createPreferenceMatrix(preference, options = {}) {
    const matrix = document.createElement("div");
    const workspaceDefaultDisabled = options.workspaceDefaultDisabled === true;

    matrix.className = "notification-preference-matrix";
    matrix.append(
      matrixHeader(""),
      matrixHeader("Enable?"),
      matrixHeader("Priority"),
      createUserPreferenceLabelCell(workspaceDefaultDisabled),
      createUserPreferenceEnableCell(preference, workspaceDefaultDisabled),
      createEmptyPriorityCell(),
    );

    if (options.includeWorkspaceDefaults) {
      matrix.append(
        createWorkspaceDefaultLabelCell(),
        createWorkspaceDefaultEnableCell(preference),
        createWorkspaceDefaultPriorityCell(preference),
      );
    }

    return matrix;
  }

  function matrixHeader(text) {
    const header = document.createElement("div");

    header.className = "notification-preference-matrix-header";
    header.textContent = text;
    return header;
  }

  function createUserPreferenceLabelCell(workspaceDefaultDisabled) {
    const cell = document.createElement("div");
    const title = document.createElement("strong");
    const helper = document.createElement("span");

    cell.className = "notification-preference-label-cell";
    title.textContent = "My preference";
    helper.textContent = workspaceDefaultDisabled
      ? "Workspace default is off."
      : "Personal delivery.";
    cell.append(title, helper);
    return cell;
  }

  function createUserPreferenceEnableCell(preference, workspaceDefaultDisabled) {
    const cell = document.createElement("div");
    const userInput = document.createElement("input");

    cell.className = "notification-preference-enable-cell";
    userInput.type = "checkbox";
    userInput.setAttribute("aria-label", "Enable my preference");
    userInput.checked = preference.userEnabled !== false && !workspaceDefaultDisabled;
    userInput.disabled = workspaceDefaultDisabled;
    userInput.dataset.preferenceUserEnabled = "";
    userInput.dataset.preferenceOriginalEnabled = String(preference.userEnabled !== false);
    if (workspaceDefaultDisabled) {
      userInput.dataset.preferenceDisabledByWorkspaceDefault = "true";
    }
    cell.appendChild(userInput);
    return cell;
  }

  function createEmptyPriorityCell() {
    const cell = document.createElement("div");

    cell.className = "notification-preference-priority-cell is-empty";
    cell.textContent = "-";
    return cell;
  }

  function createWorkspaceDefaultLabelCell() {
    const cell = document.createElement("div");
    const title = document.createElement("strong");
    const helper = document.createElement("span");

    cell.className = "notification-preference-label-cell";
    title.textContent = "Workspace default";
    helper.textContent = "Everyone in this workspace.";
    cell.append(title, helper);
    return cell;
  }

  function createWorkspaceDefaultEnableCell(preference) {
    const cell = document.createElement("div");
    const workspaceInput = document.createElement("input");

    cell.className = "notification-preference-enable-cell";
    workspaceInput.type = "checkbox";
    workspaceInput.setAttribute("aria-label", "Enable workspace default");
    workspaceInput.checked = preference.workspaceEnabled !== false;
    workspaceInput.dataset.preferenceWorkspaceEnabled = "";
    cell.appendChild(workspaceInput);
    return cell;
  }

  function createWorkspaceDefaultPriorityCell(preference) {
    const cell = document.createElement("div");
    const prioritySelect = document.createElement("select");

    cell.className = "notification-preference-priority-cell";
    prioritySelect.dataset.preferenceWorkspacePriority = "";
    prioritySelect.setAttribute("aria-label", "Workspace default priority");
    ["low", "normal", "high", "urgent"].forEach((priority) => {
      prioritySelect.append(optionElement(priority, priority));
    });
    prioritySelect.value = preference.workspacePriority || preference.defaultPriority || "normal";
    cell.appendChild(prioritySelect);
    return cell;
  }

  function groupEventsByModule(events) {
    const groups = new Map();

    events.forEach((event) => {
      if (!groups.has(event.moduleId)) {
        groups.set(event.moduleId, {
          events: [],
          label: formatModuleLabel(event.moduleId),
          moduleEnabled: event.moduleEnabled !== false,
          moduleId: event.moduleId,
        });
      }

      groups.get(event.moduleId).events.push(event);
    });

    return [...groups.values()].sort((left, right) => (
      Number(left.moduleEnabled === false) - Number(right.moduleEnabled === false) ||
      left.label.localeCompare(right.label)
    ));
  }

  function normalizeEvents(events) {
    return (Array.isArray(events) ? events : []).map((event) => ({
      ...event,
      id: String(event.id || event.event_type || event.eventType || "").trim(),
      moduleEnabled: event.moduleEnabled !== false,
      moduleId: String(event.moduleId || event.module_id || "framework").trim() || "framework",
    })).filter((event) => event.id);
  }

  function normalizeGroupingPreferences(groupingPreferences = {}) {
    return {
      groupingMode: normalizeGroupingMode(groupingPreferences?.groupingMode || groupingPreferences?.grouping_mode),
    };
  }

  function normalizeGroupingMode(value) {
    return ["client_project", "notification_type", "record_type"].includes(value) ? value : "client_project";
  }

  function groupingOptions(workspaceType) {
    return [
      {
        value: "client_project",
        label: workspaceType === "business" ? "Client / Project" : "Project",
      },
      {
        value: "notification_type",
        label: "Notification type",
      },
      {
        value: "record_type",
        label: "Record type",
      },
    ];
  }

  async function parseJsonResponse(response) {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return response.ok ? null : { error: text };
    }
  }

  function formatModuleLabel(moduleId) {
    return String(moduleId || "framework")
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Framework";
  }

  function optionElement(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function createPlaceholder(message) {
    const placeholder = document.createElement("p");

    placeholder.className = "placeholder-copy";
    placeholder.textContent = message;
    return placeholder;
  }

  root.notificationPreferences = {
    loadPreferences,
    readGroupingPreferencesPayload,
    readUserPreferencesPayload,
    readWorkspaceDefaultsPayload,
    renderGroupingPreferences,
    renderPreferenceGroups,
    saveUserPreferences,
    saveWorkspaceDefaults,
  };
  global.LongtailForge = root;
})(window);
