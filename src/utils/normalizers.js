import { DEFAULT_TIMEZONE, normalizeUtcIso } from "./timezones.js";
import { getWorkspaceCapabilities, normalizeWorkspaceType } from "./workspaces.js";

function normalizeTimeEntry(entry) {
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
    duration_seconds: String(entry.duration_seconds || "0").trim(),
    duration_hours: String(entry.duration_hours || "0").trim(),
    billable: normalizeTimeEntryBillable(entry.billable),
    invoice_status: ["unbilled", "billed", "paid"].includes(entry.invoice_status)
      ? entry.invoice_status
      : "unbilled",
  };
}

function normalizeTimeEntryBillable(value) {
  if (value === "yes" || value === true) {
    return "yes";
  }

  if (value === "no" || value === false) {
    return "no";
  }

  return "";
}

function normalizeUsername(value) {
  return normalizeEmail(value);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOptionalEmail(value) {
  const email = normalizeEmail(value);
  return email || null;
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDisplayName(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeTimezone(value) {
  const timezone = String(value || "").trim() || DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

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

function normalizeUserStatus(value) {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeProtectedUserFlag(value) {
  return value === true || value === "yes" || value === "1" || value === 1;
}

function normalizeThemeMode(value) {
  return value === "dark" ? "dark" : "light";
}

function userRowToAppValue(row) {
  return {
    user_id: row.user_id,
    username: row.username,
    displayName: normalizeDisplayName(row.display_name, row.username),
    altEmail: normalizeOptionalEmail(row.alt_email),
    timezone: normalizeTimezone(row.timezone),
    themeMode: normalizeThemeMode(row.theme_mode),
    userStatus: normalizeUserStatus(row.user_status),
    protectedUser: normalizeProtectedUserFlag(row.protected_user),
  };
}

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

function normalizeSettings(settings) {
  const workspaceName = String(settings?.workspaceName || "Workspace").trim() || "Workspace";
  const workspaceType = normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type);

  return {
    workspaceName,
    workspaceType,
    workspaceCapabilities: getWorkspaceCapabilities(workspaceType),
    fiscalYear: workspaceType === "business" ? normalizeFiscalYear(settings?.fiscalYear) : { startMonth: 1, startDay: 1 },
    defaultBillingRate: workspaceType === "business" ? String(settings?.defaultBillingRate || "").trim() : "",
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    taskTimersEnabled: settings?.taskTimersEnabled === false ? false : true,
    audit: normalizeAuditSettings(settings?.audit),
  };
}

function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeProjectTaskDefaults(defaults = {}) {
  return {
    priority: normalizeTaskPriority(defaults.priority || defaults.task_default_priority || defaults.defaultPriority),
    status: normalizeTaskStatus(defaults.status || defaults.task_default_status || defaults.defaultStatus),
    sortOrder: normalizeProjectTaskSortOrder(defaults.sortOrder || defaults.sort_order || defaults.task_default_sort_order || defaults.task_default_sort_order_json),
  };
}

function normalizeTaskPriority(value) {
  const priority = String(value || "").trim();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function normalizeTaskStatus(value) {
  const status = String(value || "").trim();
  return ["open", "in_progress", "blocked", "complete", "archived"].includes(status) ? status : "open";
}

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

function parseSortOrderJson(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()) : [];
  } catch {
    return [];
  }
}

function normalizeBillableFlag(value, fallback = "yes") {
  if (value === false || value === "no") {
    return "no";
  }

  if (value === true || value === "yes") {
    return "yes";
  }

  return fallback === "no" ? "no" : "yes";
}

function normalizeFiscalYear(fiscalYear) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(fiscalYear?.startMonth, 10) || 1));
  const startDay = Math.min(
    getDaysInFiscalYearMonth(startMonth),
    Math.max(1, Number.parseInt(fiscalYear?.startDay, 10) || 1),
  );

  return { startMonth, startDay };
}

function getDaysInFiscalYearMonth(month) {
  return new Date(2026, month, 0).getDate();
}

function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return normalizeBillingPeriod(period);
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment)
    ? rounding.increment
    : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

function normalizeAuditSettings(audit) {
  const retentionOptions = [7, 14, 30, 60, 90, 180, 365];
  const retentionDays = Number.parseInt(audit?.retentionDays, 10);

  return {
    loggingEnabled: audit?.loggingEnabled === false ? false : true,
    retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,
  };
}

function normalizeOptionalBillingRounding(rounding) {
  if (!rounding || rounding.type === "inherit") {
    return null;
  }

  return normalizeBillingRounding(rounding);
}

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

function normalizeStatus(status) {
  return ["Active", "Inactive", "Completed"].includes(status) ? status : "Active";
}

function normalizeClientStatus(status) {
  return ["Active", "Inactive"].includes(status) ? status : "Active";
}

export {
  normalizeBillableFlag,
  normalizeBillingContact,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
  normalizeClientProjectData,
  normalizeDisplayName,
  normalizeEmail,
  normalizeOptionalEmail,
  normalizeProtectedUserFlag,
  normalizeSettings,
  normalizeProjectTaskDefaults,
  normalizeThemeMode,
  normalizeWorkspaceType,
  normalizeTimeEntry,
  normalizeTimezone,
  normalizeUserStatus,
  normalizeUsername,
  isValidEmail,
  isValidTimezone,
  userRowToAppValue,
};
