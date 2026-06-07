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
    };
  }

  async function saveUserPreferences(preferences) {
    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
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
    const userToggle = document.createElement("label");
    const userInput = document.createElement("input");
    const workspaceDefaultDisabled = preference.workspaceEnabled === false;

    row.className = "notification-preference-row";
    row.dataset.notificationEventId = preference.id;

    legend.textContent = preference.label || preference.id;
    description.textContent = preference.description || "";
    description.className = "muted-text";

    userInput.type = "checkbox";
    userInput.checked = preference.userEnabled !== false && !workspaceDefaultDisabled;
    userInput.disabled = workspaceDefaultDisabled;
    userInput.dataset.preferenceUserEnabled = "";
    userInput.dataset.preferenceOriginalEnabled = String(preference.userEnabled !== false);
    if (workspaceDefaultDisabled) {
      userInput.dataset.preferenceDisabledByWorkspaceDefault = "true";
    }
    userToggle.append(userInput, document.createTextNode(" Enabled"));

    row.append(legend, description, userToggle);

    if (workspaceDefaultDisabled) {
      const workspaceNotice = document.createElement("p");

      workspaceNotice.className = "settings-help";
      workspaceNotice.textContent = "Disabled by workspace default.";
      row.appendChild(workspaceNotice);
    }

    if (options.includeWorkspaceDefaults && options.canManageWorkspaceDefaults) {
      row.appendChild(createWorkspaceDefaultControls(preference));
    }

    return row;
  }

  function createWorkspaceDefaultControls(preference) {
    const controls = document.createElement("div");
    const workspaceToggle = document.createElement("label");
    const workspaceInput = document.createElement("input");
    const priorityLabel = document.createElement("label");
    const prioritySelect = document.createElement("select");

    controls.className = "notification-workspace-default-controls";

    workspaceInput.type = "checkbox";
    workspaceInput.checked = preference.workspaceEnabled !== false;
    workspaceInput.dataset.preferenceWorkspaceEnabled = "";
    workspaceToggle.append(workspaceInput, document.createTextNode(" Workspace default"));

    prioritySelect.dataset.preferenceWorkspacePriority = "";
    ["low", "normal", "high", "urgent"].forEach((priority) => {
      prioritySelect.append(optionElement(priority, priority));
    });
    prioritySelect.value = preference.workspacePriority || preference.defaultPriority || "normal";
    priorityLabel.append(document.createTextNode("Priority"), prioritySelect);

    controls.append(workspaceToggle, priorityLabel);
    return controls;
  }

  function groupEventsByModule(events) {
    const groups = new Map();

    events.forEach((event) => {
      if (!groups.has(event.moduleId)) {
        groups.set(event.moduleId, {
          events: [],
          label: formatModuleLabel(event.moduleId),
          moduleId: event.moduleId,
        });
      }

      groups.get(event.moduleId).events.push(event);
    });

    return [...groups.values()];
  }

  function normalizeEvents(events) {
    return (Array.isArray(events) ? events : []).map((event) => ({
      ...event,
      id: String(event.id || event.event_type || event.eventType || "").trim(),
      moduleId: String(event.moduleId || event.module_id || "framework").trim() || "framework",
    })).filter((event) => event.id);
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
    readUserPreferencesPayload,
    readWorkspaceDefaultsPayload,
    renderPreferenceGroups,
    saveUserPreferences,
    saveWorkspaceDefaults,
  };
  global.LongtailForge = root;
})(window);
