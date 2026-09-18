(function attachNotificationPreferences(global) {
  const root = global.LongtailForge || {};

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationEventPreference} BrowserNotificationEventPreference */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationPreferenceCatalog} BrowserNotificationPreferenceCatalog */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationGroupingMode} BrowserNotificationGroupingMode */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationGroupingPreferences} BrowserNotificationGroupingPreferences */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationGroupingOptions} BrowserNotificationGroupingOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationPreferenceGroupOptions} BrowserNotificationPreferenceGroupOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationGroupingPayload} BrowserNotificationGroupingPayload */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationUserPreferencePayload} BrowserNotificationUserPreferencePayload */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotificationWorkspaceDefaultPayload} BrowserNotificationWorkspaceDefaultPayload */

  /**
   * One event as `normalizeEvents` rebuilds it for the renderer.
   *
   * The three members it constructs are named exactly. The rest arrive through the spread of
   * whatever the caller handed `renderPreferenceGroups`, whose contract takes `unknown`, so the
   * members the renderer reads from them are optional and `unknown` - which is all they are.
   * @typedef {object} NormalizedEventPreference
   * @property {string} id
   * @property {boolean} moduleEnabled
   * @property {string} moduleId
   * @property {unknown} [defaultPriority]
   * @property {unknown} [description]
   * @property {unknown} [label]
   * @property {unknown} [userEnabled]
   * @property {unknown} [workspaceEnabled]
   * @property {unknown} [workspacePriority]
   */

  /**
   * One module's events, as `groupEventsByModule` collects them.
   * @typedef {object} PreferenceGroup
   * @property {NormalizedEventPreference[]} events
   * @property {string} label
   * @property {boolean} moduleEnabled
   * @property {string} moduleId
   */

  /**
   * The grouping vocabulary, which `BrowserNotificationGroupingMode` already declares.
   * @type {readonly BrowserNotificationGroupingMode[]}
   */
  const GROUPING_MODES = Object.freeze(["client_project", "notification_type", "record_type"]);

  /** The text members `preferences()` constructs for every configurable event. */
  const EVENT_TEXT_MEMBERS = Object.freeze([
    "defaultPriority",
    "description",
    "id",
    "label",
    "moduleId",
    "workspacePriority",
  ]);

  /**
   * The boolean members `preferences()` constructs for every configurable event.
   *
   * **Booleans, not integer flags.** `enabled` is an `INTEGER` column on both preference tables and
   * the server converts each layer with `Number(row.enabled) === 1` before answering, so a body
   * carrying `1` here is not the shape this producer sends.
   */
  const EVENT_BOOLEAN_MEMBERS = Object.freeze([
    "defaultEnabled",
    "moduleEnabled",
    "userEnabled",
    "workspaceEnabled",
  ]);

  /**
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * A member read the way `value?.[key]` read it: `undefined` for a missing value, and otherwise
   * the member access itself, with the value as receiver. The values read through it are elements
   * the payload readers query and events the renderer was handed - neither constructed here.
   * @param {unknown} value
   * @param {string} key
   * @returns {unknown}
   */
  function optionalMember(value, key) {
    return value === null || value === undefined ? undefined : Reflect.get(Object(value), key, value);
  }

  /**
   * A member read the way `value[key]` read it: a missing value still fails as a `TypeError` at the
   * same read, now naming the member, and anything else is read as `optionalMember` reads it.
   * @param {unknown} value
   * @param {string} key
   * @returns {unknown}
   */
  function requiredMember(value, key) {
    if (value === null || value === undefined) {
      throw new TypeError(`Cannot read notification preference member '${key}' of ${value}.`);
    }
    return optionalMember(value, key);
  }

  /**
   * The source `normalizeEvents` spreads. Spreading `Object(value)` copies exactly what spreading the
   * value copies, and gives the compiler an object to spread.
   * @param {unknown} value
   * @returns {object}
   */
  function recordFields(value) {
    return Object(value);
  }

  /**
   * One merged event preference as `preferences()` builds it.
   *
   * **Element validation, not container validation.** `Array.isArray(body.events)` said only that
   * the container was an array; every element then reached the renderer unchecked.
   * @param {unknown} value
   * @returns {value is BrowserNotificationEventPreference}
   */
  function isEventPreference(value) {
    return isResponseRecord(value)
      && EVENT_TEXT_MEMBERS.every((member) => typeof value[member] === "string")
      && EVENT_BOOLEAN_MEMBERS.every((member) => typeof value[member] === "boolean")
      && value.id !== "";
  }

  /**
   * The viewer's notification preference catalogue.
   *
   * **The envelope was already constructed and only its array was raw.** The three members have
   * always been rebuilt from the body; what changes here is that each element of `events` is checked
   * before it is called a preference record. **A malformed element is dropped rather than rendered**,
   * which is the one behaviour this narrowing adds and the only honest answer once elements are
   * checked at all. A non-array `events`, a missing one, and a non-OK response all behave exactly as
   * before: `[]`, `[]`, and a thrown API error.
   * @returns {Promise<BrowserNotificationPreferenceCatalog>}
   */
  async function loadPreferences() {
    const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      throw apiError(body, "Notification preferences unavailable.", response.status);
    }

    // The catalogue is rebuilt from an `unknown` body rather than read through it. Every
    // behaviour `0.33.33.38.4.10` settled is preserved exactly: a missing or non-array `events`
    // becomes `[]`, a malformed element is dropped, `canManageWorkspaceDefaults` is true only for
    // the literal, and a malformed grouping preference falls back to `client_project`.
    const catalog = isResponseRecord(body) ? body : {};

    return {
      canManageWorkspaceDefaults: catalog.canManageWorkspaceDefaults === true,
      events: Array.isArray(catalog.events) ? catalog.events.filter(isEventPreference) : [],
      groupingPreferences: normalizeGroupingPreferences(catalog.groupingPreferences),
    };
  }

  /** @param {unknown} preferences @param {unknown} [groupingPreferences] */
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
      throw apiError(body, "Unable to save notification preferences.", response.status);
    }

    return body;
  }

  /** @param {unknown} defaults */
  async function saveWorkspaceDefaults(defaults) {
    const response = await fetch("/api/notifications/workspace-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults }),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      throw apiError(body, "Unable to save workspace notification defaults.", response.status);
    }

    return body;
  }

  /**
   * @param {Element | null} container
   * @param {unknown} events
   * @param {BrowserNotificationPreferenceGroupOptions} [options]
   */
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

  /**
   * @param {Element | null} container
   * @param {unknown} [groupingPreferences]
   * @param {BrowserNotificationGroupingOptions} [options]
   */
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

    fieldset.className = "notification-grouping-preferences surface-main-panel";
    legend.textContent = "Notification Grouping";
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

  /**
   * @param {Element | null} container
   * @returns {BrowserNotificationGroupingPayload}
   */
  function readGroupingPreferencesPayload(container) {
    const groupingMode = optionalMember(container?.querySelector("[data-notification-grouping-mode]"), "value") || "client_project";

    return {
      groupingMode: normalizeGroupingMode(groupingMode),
    };
  }

  /**
   * Each element is read as the access it replaced: `?.` where the original chained optionally and
   * a failing read where it did not. A `DOMStringMap` answers a string or `undefined`, so the
   * `typeof` keeps exactly the value the dataset read answered.
   * @param {Element | null} container
   * @returns {BrowserNotificationUserPreferencePayload[]}
   */
  function readUserPreferencesPayload(container) {
    return [...(container?.querySelectorAll("[data-notification-event-id]") || [])].map((row) => {
      const input = row.querySelector("[data-preference-user-enabled]");
      const enabled = optionalMember(input, "disabled")
        ? requiredMember(requiredMember(input, "dataset"), "preferenceOriginalEnabled") !== "false"
        : optionalMember(input, "checked") !== false;
      const id = requiredMember(requiredMember(row, "dataset"), "notificationEventId");

      return {
        id: typeof id === "string" ? id : undefined,
        enabled,
      };
    });
  }

  /**
   * Read as `readUserPreferencesPayload` reads, in the original order: the id, the checkbox, then
   * the priority. A dataset value and a select's value are strings, so each `typeof` keeps exactly
   * what the read answered and applies the fallback the `||` applied.
   * @param {Element | null} container
   * @returns {BrowserNotificationWorkspaceDefaultPayload[]}
   */
  function readWorkspaceDefaultsPayload(container) {
    return [...(container?.querySelectorAll("[data-preference-workspace-enabled]") || [])].map((input) => {
      const row = input.closest("[data-notification-event-id]");
      const id = row ? requiredMember(requiredMember(row, "dataset"), "notificationEventId") : undefined;
      const enabled = requiredMember(input, "checked") !== false;
      const priority = optionalMember(row?.querySelector("[data-preference-workspace-priority]"), "value");

      return {
        id: typeof id === "string" && id ? id : "",
        enabled,
        priority: typeof priority === "string" && priority ? priority : "normal",
      };
    }).filter((preference) => preference.id);
  }

  /**
   * @param {PreferenceGroup} group
   * @param {BrowserNotificationPreferenceGroupOptions} options
   */
  function createPreferenceGroup(group, options) {
    const section = document.createElement("section");
    // The template performs the ToString `createElement` applied to its argument.
    const heading = document.createElement(`${options.headingLevel || "h3"}`);

    section.className = "notification-preference-group surface-main-panel";
    section.dataset.notificationPreferenceModule = group.moduleId;
    section.dataset.notificationPreferenceModuleEnabled = String(group.moduleEnabled !== false);
    heading.textContent = group.label;
    section.appendChild(heading);
    group.events.forEach((event) => {
      section.appendChild(createPreferenceRow(event, options));
    });
    return section;
  }

  /**
   * @param {NormalizedEventPreference} preference
   * @param {BrowserNotificationPreferenceGroupOptions} options
   */
  function createPreferenceRow(preference, options) {
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const description = document.createElement("p");
    const workspaceDefaultDisabled = preference.workspaceEnabled === false;

    row.className = "notification-preference-row surface-main-panel";
    row.dataset.notificationEventId = preference.id;

    // The label and description arrive through the spread, so each reaches the node's own
    // `textContent` setter, which converts them as the assignment did.
    Reflect.set(legend, "textContent", preference.label || preference.id);
    Reflect.set(description, "textContent", preference.description || "");
    description.className = "muted-text";

    row.append(legend, description, createPreferenceMatrix(preference, {
      includeWorkspaceDefaults: options.includeWorkspaceDefaults && options.canManageWorkspaceDefaults,
      workspaceDefaultDisabled,
    }));

    return row;
  }

  /**
   * @param {NormalizedEventPreference} preference
   * @param {{ includeWorkspaceDefaults?: unknown, workspaceDefaultDisabled?: unknown }} [options]
   */
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

  /** @param {string} text */
  function matrixHeader(text) {
    const header = document.createElement("div");

    header.className = "notification-preference-matrix-header";
    header.textContent = text;
    return header;
  }

  /** @param {boolean} workspaceDefaultDisabled */
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

  /** @param {NormalizedEventPreference} preference @param {boolean} workspaceDefaultDisabled */
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

  /** @param {NormalizedEventPreference} preference */
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

  /** @param {NormalizedEventPreference} preference */
  function createWorkspaceDefaultPriorityCell(preference) {
    const cell = document.createElement("div");
    const prioritySelect = document.createElement("select");

    cell.className = "notification-preference-priority-cell";
    prioritySelect.dataset.preferenceWorkspacePriority = "";
    prioritySelect.setAttribute("aria-label", "Workspace default priority");
    ["low", "normal", "high", "urgent"].forEach((priority) => {
      prioritySelect.append(optionElement(priority, priority));
    });
    Reflect.set(prioritySelect, "value", preference.workspacePriority || preference.defaultPriority || "normal");
    cell.appendChild(prioritySelect);
    return cell;
  }

  /**
   * @param {NormalizedEventPreference[]} events
   * @returns {PreferenceGroup[]}
   */
  function groupEventsByModule(events) {
    /** @type {Map<string, PreferenceGroup>} */
    const groups = new Map();

    events.forEach((event) => {
      // A module's first event starts its group, as the `has`/`set` pair did before the push.
      const group = groups.get(event.moduleId);
      if (group) {
        group.events.push(event);
      } else {
        groups.set(event.moduleId, {
          events: [event],
          label: formatModuleLabel(event.moduleId),
          moduleEnabled: event.moduleEnabled !== false,
          moduleId: event.moduleId,
        });
      }
    });

    return [...groups.values()].sort((left, right) => (
      Number(left.moduleEnabled === false) - Number(right.moduleEnabled === false) ||
      left.label.localeCompare(right.label)
    ));
  }

  /**
   * Each event is read member by member as the original read it, so a missing event still fails
   * at its first member.
   * @param {unknown} events
   * @returns {NormalizedEventPreference[]}
   */
  function normalizeEvents(events) {
    /** @type {readonly unknown[]} */
    const list = Array.isArray(events) ? events : [];
    return list.map((event) => ({
      ...recordFields(event),
      id: String(requiredMember(event, "id") || requiredMember(event, "event_type") || requiredMember(event, "eventType") || "").trim(),
      moduleEnabled: requiredMember(event, "moduleEnabled") !== false,
      moduleId: String(requiredMember(event, "moduleId") || requiredMember(event, "module_id") || "framework").trim() || "framework",
    })).filter((event) => event.id);
  }

  /**
   * The viewer's grouping preference, normalised from whatever the body carried.
   *
   * Takes `unknown` because that is what the parsed body is. The two spellings and the
   * `client_project` fallback are `0.33.33.38.4.10`'s and are unchanged.
   * @param {unknown} groupingPreferences
   * @returns {BrowserNotificationGroupingPreferences}
   */
  function normalizeGroupingPreferences(groupingPreferences = {}) {
    const record = isResponseRecord(groupingPreferences) ? groupingPreferences : {};

    return {
      groupingMode: normalizeGroupingMode(record.groupingMode || record.grouping_mode),
    };
  }

  /** @param {unknown} value @returns {BrowserNotificationGroupingMode} */
  function normalizeGroupingMode(value) {
    return GROUPING_MODES.find((mode) => mode === value) || "client_project";
  }

  /** @param {unknown} workspaceType */
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

  /**
   * The parsed body of one response, as `unknown`.
   *
   * **`JSON.parse` returns `any`, and without this annotation that `any` reached three callers.**
   * The transport here is a raw `fetch` rather than `BrowserApi`, so nothing else was going to
   * say what the parsed text is - and the three consumers below normalise from it rather than
   * reading it, which is only a truthful thing to say once the input is `unknown`.
   *
   * The shapes it can answer are unchanged: `null` for an empty body, the parsed value, `null`
   * for unparsable text on an OK response, and `{ error: text }` for unparsable text on a
   * failure, which the error helper reads.
   * @param {Response} response
   * @returns {Promise<unknown>}
   */
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

  /** @param {unknown} moduleId */
  function formatModuleLabel(moduleId) {
    return String(moduleId || "framework")
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Framework";
  }

  /** @param {unknown} body @param {string} fallback @param {number} status */
  function apiError(body, fallback, status) {
    return root.errors?.createError?.(body, fallback, status)
      || new Error(fallback);
  }

  /** @param {string} value @param {string} label */
  function optionElement(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  /** @param {unknown} message */
  function createPlaceholder(message) {
    const placeholder = document.createElement("p");

    placeholder.className = "placeholder-copy";
    // A caller's `emptyText` reaches the node's own setter, which converts it as the assignment did.
    Reflect.set(placeholder, "textContent", message);
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
