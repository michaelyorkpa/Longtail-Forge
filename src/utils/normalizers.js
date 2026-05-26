function normalizeTimeEntry(entry) {
  return {
    entry_id: String(entry.entry_id || "").trim(),
    organization_id: String(entry.organization_id || "").trim(),
    user_id: String(entry.user_id || "").trim(),
    client_id: String(entry.client_id || "").trim(),
    client_name: String(entry.client_name || "").trim(),
    project_id: String(entry.project_id || "").trim(),
    project_name: String(entry.project_name || "").trim(),
    description: String(entry.description || "").trim(),
    start_time: String(entry.start_time || "").trim(),
    end_time: String(entry.end_time || "").trim(),
    duration_seconds: String(entry.duration_seconds || "0").trim(),
    duration_hours: String(entry.duration_hours || "0").trim(),
    billable: entry.billable === "no" ? "no" : "yes",
    invoice_status: ["unbilled", "billed", "paid"].includes(entry.invoice_status)
      ? entry.invoice_status
      : "unbilled",
  };
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeUserStatus(value) {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeProtectedUserFlag(value) {
  return value === true || value === "yes" || value === "1" || value === 1;
}

function normalizeThemeMode(value) {
  return ["light", "dark", "auto"].includes(value) ? value : "light";
}

function userRowToAppValue(row) {
  return {
    user_id: row.user_id,
    username: row.username,
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
        name: String(client.name || "").trim(),
        status: normalizeClientStatus(client.status),
        billable: clientBillable,
        billing_rate: normalizeBillingRate(client.billing_rate),
        billing_period: normalizeOptionalBillingPeriod(client.billing_period),
        billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
        billing_contact: normalizeBillingContact(client.billing_contact),
        projects: Array.isArray(client.projects)
          ? client.projects.map((project) => ({
              id: String(project.id || "").trim(),
              name: String(project.name || "").trim(),
              billable: normalizeBillableFlag(project.billable, clientBillable),
              billing_rate: normalizeBillingRate(project.billing_rate),
              billing_period: normalizeOptionalBillingPeriod(project.billing_period),
              billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
              status: normalizeStatus(project.status),
            }))
          : [],
      };
    }),
  };
}

function normalizeSettings(settings) {
  return {
    organizationName: String(settings?.organizationName || "Organization").trim() || "Organization",
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
}

function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
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
  normalizeProtectedUserFlag,
  normalizeSettings,
  normalizeThemeMode,
  normalizeTimeEntry,
  normalizeUserStatus,
  normalizeUsername,
  userRowToAppValue,
};
