import { DEFAULT_TIMEZONE, normalizeUtcIso } from "./timezones.js";
import { getWorkspaceCapabilities, normalizeWorkspaceType } from "./workspaces.js";

/** @typedef {import("../types/users-service-contracts.js").UserRow} UserRow */
/** @typedef {import("../types/users-service-contracts.js").UserValue} UserValue */
/** @typedef {import("../types/client-project-contracts.js").BillingContact} BillingContact */
/** @typedef {import("../types/client-project-contracts.js").BillingPeriod} BillingPeriod */
/** @typedef {import("../types/client-project-contracts.js").BillingRounding} BillingRounding */
/** @typedef {import("../types/client-project-contracts.js").ClientAggregateRecord} ClientAggregateRecord */
/** @typedef {import("../types/client-project-contracts.js").ClientRecord} ClientRecord */
/** @typedef {import("../types/client-project-contracts.js").ProjectTaskDefaults} ProjectTaskDefaults */
/** @typedef {Record<string, unknown> & { id?: unknown, workspace_id?: unknown, client_id?: unknown, parent_project_id?: unknown, parentProjectId?: unknown, name?: unknown, status?: unknown, billable?: unknown, billing_rate?: unknown, billing_period?: BillingPeriodInput | null, billing_rounding?: BillingRoundingInput | null, taskDefaults?: ProjectTaskDefaultsInput, task_defaults?: ProjectTaskDefaultsInput }} ClientProjectProjectInput */
/** @typedef {Record<string, unknown> & { id?: unknown, workspace_id?: unknown, parent_client_id?: unknown, parentClientId?: unknown, name?: unknown, status?: unknown, billable?: unknown, billing_rate?: unknown, billing_period?: BillingPeriodInput | null, billing_rounding?: BillingRoundingInput | null, billing_contact?: Partial<BillingContact> | null, childScopeIds?: unknown, projects?: ClientProjectProjectInput[] | null }} ClientProjectClientInput */
/** @typedef {{ clients?: ClientProjectClientInput[] | null }} ClientProjectDataInput */
/** @typedef {{ workspaceName?: unknown, workspaceType?: unknown, workspace_type?: unknown, audit?: AuditSettingsInput | null }} SettingsInput */
/** @typedef {{ priority?: unknown, task_default_priority?: unknown, defaultPriority?: unknown, status?: unknown, task_default_status?: unknown, defaultStatus?: unknown, sortOrder?: unknown, sort_order?: unknown, task_default_sort_order?: unknown, task_default_sort_order_json?: unknown, defaultAssigneeMode?: unknown, default_assignee_mode?: unknown, task_default_assignee_mode?: unknown }} ProjectTaskDefaultsInput */
/** @typedef {{ type?: unknown, startDay?: unknown }} BillingPeriodInput */
/** @typedef {{ type?: unknown, enabled?: unknown, increment?: unknown }} BillingRoundingInput */
/** @typedef {{ loggingEnabled?: unknown, retentionDays?: unknown }} AuditSettingsInput */
/** @typedef {"yes" | "no" | ""} TimeEntryBillable */
/** @typedef {"unbilled" | "billed" | "paid"} TimeEntryInvoiceStatus */
/**
 * @typedef {Object} TimeEntry
 * @property {string} entry_id
 * @property {string} workspace_id
 * @property {string} user_id
 * @property {string} client_id
 * @property {string} client_name
 * @property {string} project_id
 * @property {string} project_name
 * @property {string} task_id
 * @property {string} description
 * @property {string} start_time
 * @property {string} end_time
 * @property {string} duration_seconds
 * @property {string} duration_hours
 * @property {TimeEntryBillable} billable
 * @property {TimeEntryInvoiceStatus} invoice_status
 * @property {string} created_at
 * @property {string} updated_at
 */
/**
 * @typedef {Object} TimeEntryInput
 * @property {unknown} [entry_id]
 * @property {unknown} [workspace_id]
 * @property {unknown} [user_id]
 * @property {unknown} [client_id]
 * @property {unknown} [client_name]
 * @property {unknown} [project_id]
 * @property {unknown} [project_name]
 * @property {unknown} [task_id]
 * @property {unknown} [description]
 * @property {string | number | null} [start_time]
 * @property {string | number | null} [end_time]
 * @property {string | number | null} [duration_seconds]
 * @property {string | number | null} [duration_hours]
 * @property {unknown} [billable]
 * @property {unknown} [invoice_status]
 * @property {unknown} [created_at]
 * @property {unknown} [updated_at]
 */

/**
 * Normalize the canonical application-facing time-entry record.
 *
 * Duration values intentionally remain decimal strings: persistence and
 * billing consumers perform their own explicit numeric conversion at the
 * calculation boundary.
 *
 * @param {TimeEntryInput} entry
 * @returns {TimeEntry}
 */
function normalizeTimeEntry(entry) {
  const invoiceStatus = entry.invoice_status;

  return {
    entry_id: String(entry.entry_id || "").trim(),
    workspace_id: String(entry.workspace_id || "").trim(),
    user_id: String(entry.user_id || "").trim(),
    client_id: String(entry.client_id || "").trim(),
    client_name: String(entry.client_name || "").trim(),
    project_id: String(entry.project_id || "").trim(),
    project_name: String(entry.project_name || "").trim(),
    task_id: String(entry.task_id || "").trim(),
    description: String(entry.description || "").trim(),
    start_time: normalizeUtcIso(entry.start_time),
    end_time: normalizeUtcIso(entry.end_time),
    duration_seconds: normalizeTimeEntryDuration(entry.duration_seconds),
    duration_hours: normalizeTimeEntryDuration(entry.duration_hours),
    billable: normalizeTimeEntryBillable(entry.billable),
    invoice_status: isTimeEntryInvoiceStatus(invoiceStatus)
      ? invoiceStatus
      : "unbilled",
    created_at: String(entry.created_at || "").trim(),
    updated_at: String(entry.updated_at || "").trim(),
  };
}

/**
 * Preserve the existing string-valued duration contract while making the
 * number-to-string coercion visible to checked consumers.
 *
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
function normalizeTimeEntryDuration(value) {
  return String(value || "0").trim();
}

/**
 * @param {unknown} value
 * @returns {value is TimeEntryInvoiceStatus}
 */
function isTimeEntryInvoiceStatus(value) {
  return value === "unbilled" || value === "billed" || value === "paid";
}

/**
 * @param {unknown} value
 * @returns {TimeEntryBillable}
 */
function normalizeTimeEntryBillable(value) {
  if (value === "yes" || value === true) {
    return "yes";
  }

  if (value === "no" || value === false) {
    return "no";
  }

  return "";
}

/** @param {unknown} value @returns {string} */
function normalizeUsername(value) {
  return normalizeEmail(value);
}

/** @param {unknown} value @returns {string} */
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/** @param {unknown} value @returns {string | null} */
function normalizeOptionalEmail(value) {
  const email = normalizeEmail(value);
  return email || null;
}

/** @param {unknown} value @returns {boolean} */
function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** @param {unknown} value @param {string} [fallback] @returns {string} */
function normalizeDisplayName(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

/** @param {unknown} value @returns {string} */
function normalizeTimezone(value) {
  const timezone = String(value || "").trim() || DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** @param {unknown} value @returns {boolean} */
function isValidTimezone(value) {
  const timezone = String(value || "").trim();

  if (!timezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown} value @returns {"active" | "inactive"} */
function normalizeUserStatus(value) {
  return value === "inactive" ? "inactive" : "active";
}

/** @param {unknown} value @returns {boolean} */
function normalizeProtectedUserFlag(value) {
  return value === true || value === "yes" || value === "1" || value === 1;
}

/** @param {unknown} value @returns {"light" | "auto" | "dark"} */
function normalizeThemeMode(value) {
  return typeof value === "string" && ["light", "auto", "dark"].includes(value)
    ? /** @type {"light" | "auto" | "dark"} */ (value)
    : "light";
}

/** @param {unknown} value @returns {"system"} */
function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
}

/** @param {unknown} value @returns {"dashboard" | "workbench" | "tasks" | "notes" | "lists"} */
function normalizeUserLandingPage(value) {
  return typeof value === "string" && ["dashboard", "workbench", "tasks", "notes", "lists"].includes(value)
    ? /** @type {"dashboard" | "workbench" | "tasks" | "notes" | "lists"} */ (value)
    : "dashboard";
}

/** @param {unknown} value @returns {"day" | "week" | "month" | null} */
function normalizeCalendarViewPreference(value) {
  return typeof value === "string" && ["day", "week", "month"].includes(value)
    ? /** @type {"day" | "week" | "month"} */ (value)
    : null;
}

/** @param {unknown} value @returns {boolean} */
function normalizeBooleanPreference(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes" || value === "on";
}

/** @param {UserRow} row @returns {UserValue} */
function userRowToAppValue(row) {
  return {
    user_id: row.user_id,
    username: row.username,
    displayName: normalizeDisplayName(row.display_name, row.username),
    altEmail: normalizeOptionalEmail(row.alt_email),
    timezone: normalizeTimezone(row.timezone),
    themeMode: normalizeThemeMode(row.theme_mode),
    themeAutoSource: normalizeThemeAutoSource(row.theme_auto_source),
    preferredLoginLanding: normalizeUserLandingPage(row.preferred_login_landing),
    preferredWorkspaceSwitchLanding: normalizeUserLandingPage(row.preferred_workspace_switch_landing),
    preferredCalendarView: normalizeCalendarViewPreference(row.preferred_calendar_view),
    openExternalLinksNewTab: normalizeBooleanPreference(row.open_external_links_new_tab),
    passwordChangeRequired: normalizeBooleanPreference(row.password_change_required),
    userStatus: normalizeUserStatus(row.user_status),
    protectedUser: normalizeProtectedUserFlag(row.protected_user),
  };
}

/** @param {ClientProjectDataInput | null | undefined} data @returns {{ clients: ClientAggregateRecord[] }} */
function normalizeClientProjectData(data) {
  const clients = Array.isArray(data?.clients) ? data.clients : [];

  return {
    clients: clients.map((client) => {
      const clientBillable = normalizeBillableFlag(client.billable);

      return {
        id: String(client.id || "").trim(),
        workspace_id: String(client.workspace_id || "").trim(),
        parent_client_id: String(client.parent_client_id || client.parentClientId || "").trim(),
        name: String(client.name || "").trim(),
        status: normalizeClientStatus(client.status),
        billable: clientBillable,
        billing_rate: normalizeBillingRate(client.billing_rate),
        billing_period: normalizeOptionalBillingPeriod(client.billing_period),
        billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
        billing_contact: normalizeBillingContact(client.billing_contact),
        childScopeIds: Array.isArray(client.childScopeIds) ? client.childScopeIds : [],
        projects: Array.isArray(client.projects)
            ? client.projects.map((project) => ({
                id: String(project.id || "").trim(),
                client_id: String(project.client_id || client.id || "").trim(),
                workspace_id: String(project.workspace_id || client.workspace_id || "").trim(),
                parent_project_id: String(project.parent_project_id || project.parentProjectId || "").trim(),
                name: String(project.name || "").trim(),
                billable: normalizeBillableFlag(project.billable, clientBillable),
                billing_rate: normalizeBillingRate(project.billing_rate),
                billing_period: normalizeOptionalBillingPeriod(project.billing_period),
                billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
                taskDefaults: normalizeProjectTaskDefaults(project.taskDefaults || project.task_defaults || project),
                status: normalizeStatus(project.status),
            }))
          : [],
      };
    }),
  };
}

/** @param {SettingsInput | null | undefined} settings */
function normalizeSettings(settings) {
  const workspaceName = String(settings?.workspaceName || "Workspace").trim() || "Workspace";
  const workspaceType = normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type);

  return {
    workspaceName,
    workspaceType,
    workspaceCapabilities: getWorkspaceCapabilities(workspaceType),
    audit: normalizeAuditSettings(settings?.audit),
  };
}

/** @param {unknown} value @returns {string | null} */
function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/** @param {ProjectTaskDefaultsInput} [defaults] @returns {ProjectTaskDefaults} */
function normalizeProjectTaskDefaults(defaults = {}) {
  return {
    priority: normalizeTaskPriority(defaults.priority || defaults.task_default_priority || defaults.defaultPriority),
    status: normalizeTaskStatus(defaults.status || defaults.task_default_status || defaults.defaultStatus),
    sortOrder: normalizeProjectTaskSortOrder(defaults.sortOrder || defaults.sort_order || defaults.task_default_sort_order || defaults.task_default_sort_order_json),
    defaultAssigneeMode: normalizeProjectTaskDefaultAssigneeMode(defaults.defaultAssigneeMode || defaults.default_assignee_mode || defaults.task_default_assignee_mode),
  };
}

/** @param {unknown} value @returns {string} */
function normalizeProjectTaskDefaultAssigneeMode(value) {
  const mode = String(value || "").trim();
  return ["creator", "project_admin", "unassigned"].includes(mode) ? mode : "creator";
}

/** @param {unknown} value @returns {string} */
function normalizeTaskPriority(value) {
  const priority = String(value || "").trim();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

/** @param {unknown} value @returns {string} */
function normalizeTaskStatus(value) {
  const status = String(value || "").trim();
  return ["open", "in_progress", "blocked", "complete", "archived"].includes(status) ? status : "open";
}

/** @param {unknown} value @returns {string[]} */
function normalizeProjectTaskSortOrder(value) {
  const parsed = Array.isArray(value) ? value : parseSortOrderJson(value);
  const allowed = ["due_date", "priority", "status"];
  const ordered = parsed.filter((item) => allowed.includes(item));

  allowed.forEach((item) => {
    if (!ordered.includes(item)) {
      ordered.push(item);
    }
  });

  return ordered.slice(0, allowed.length);
}

/** @param {unknown} value @returns {string[]} */
function parseSortOrderJson(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()) : [];
  } catch {
    return [];
  }
}

/** @param {unknown} value @param {unknown} [fallback] @returns {"yes" | "no"} */
function normalizeBillableFlag(value, fallback = "yes") {
  if (value === false || value === "no") {
    return "no";
  }

  if (value === true || value === "yes") {
    return "yes";
  }

  return fallback === "no" ? "no" : "yes";
}

/** @param {BillingPeriodInput | null | undefined} period @returns {BillingPeriod} */
function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(String(period?.startDay ?? ""), 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

/** @param {BillingPeriodInput | null | undefined} period @returns {BillingPeriod | null} */
function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return normalizeBillingPeriod(period);
}

/** @param {BillingRoundingInput | null | undefined} rounding @returns {BillingRounding} */
function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = typeof rounding?.increment === "string" && increments.includes(rounding.increment)
    ? rounding.increment
    : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

/** @param {AuditSettingsInput | null | undefined} audit */
function normalizeAuditSettings(audit) {
  const retentionOptions = [7, 14, 30, 60, 90, 180, 365];
  const retentionDays = Number.parseInt(String(audit?.retentionDays ?? ""), 10);

  return {
    loggingEnabled: audit?.loggingEnabled === false ? false : true,
    retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,
  };
}

/** @param {BillingRoundingInput | null | undefined} rounding @returns {BillingRounding | null} */
function normalizeOptionalBillingRounding(rounding) {
  if (!rounding || rounding.type === "inherit") {
    return null;
  }

  return normalizeBillingRounding(rounding);
}

/** @param {Partial<BillingContact> | null | undefined} contact @returns {BillingContact} */
function normalizeBillingContact(contact) {
  return {
    name: String(contact?.name || "").trim(),
    email: String(contact?.email || "").trim(),
    alternate_name: String(contact?.alternate_name || "").trim(),
    alternate_email: String(contact?.alternate_email || "").trim(),
    phone_number: String(contact?.phone_number || "").trim(),
    alternate_phone_number: String(contact?.alternate_phone_number || "").trim(),
    street_address_1: String(contact?.street_address_1 || "").trim(),
    street_address_2: String(contact?.street_address_2 || "").trim(),
    city: String(contact?.city || "").trim(),
    state: String(contact?.state || "").trim(),
    zip_code: String(contact?.zip_code || "").trim(),
  };
}

/** @param {unknown} status @returns {string} */
function normalizeStatus(status) {
  return typeof status === "string" && ["Active", "Inactive", "Completed"].includes(status) ? status : "Active";
}

/** @param {unknown} status @returns {string} */
function normalizeClientStatus(status) {
  return typeof status === "string" && ["Active", "Inactive"].includes(status) ? status : "Active";
}

export {
  normalizeBillableFlag,
  normalizeBillingContact,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
  normalizeBooleanPreference,
  normalizeCalendarViewPreference,
  normalizeClientProjectData,
  normalizeDisplayName,
  normalizeEmail,
  normalizeOptionalEmail,
  normalizeProtectedUserFlag,
  normalizeSettings,
  normalizeProjectTaskDefaults,
  normalizeThemeAutoSource,
  normalizeThemeMode,
  normalizeUserLandingPage,
  normalizeWorkspaceType,
  normalizeTimeEntry,
  normalizeTimeEntryBillable,
  normalizeTimezone,
  normalizeUserStatus,
  normalizeUsername,
  isValidEmail,
  isValidTimezone,
  userRowToAppValue,
};
