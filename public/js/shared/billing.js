(function () {
  const namespace = window.LongtailForge || {};
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];

  function parseMoney(value) {
    const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : 0;
  }

  function parseOptionalMoney(value) {
    const text = String(value ?? "").trim();

    if (!text) {
      return null;
    }

    const amount = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : null;
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

  function roundSeconds(seconds, rounding) {
    const normalizedRounding = normalizeBillingRounding(rounding);

    if (!normalizedRounding.enabled) {
      return seconds;
    }

    const incrementSeconds = {
      nearestHour: 3600,
      nearestHalfHour: 1800,
      nearestQuarterHour: 900,
    }[normalizedRounding.increment];

    return Math.round(seconds / incrementSeconds) * incrementSeconds;
  }

  function normalizeSettings(settings) {
    return {
      defaultBillingRate: parseMoney(settings?.defaultBillingRate),
      billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
      billingRounding: normalizeBillingRounding(settings?.billingRounding),
    };
  }

  function normalizeClients(data, options = {}) {
    const includeInactive = Boolean(options.includeInactive);

    return Array.isArray(data?.clients)
      ? data.clients
          .filter((client) => includeInactive || client.status !== "Inactive")
          .map((client) => normalizeClient(client))
      : [];
  }

  function normalizeClient(client) {
    const billable = normalizeBillableFlag(client?.billable);

    return {
      id: String(client?.id || "").trim(),
      name: String(client?.name || "").trim(),
      status: client?.status === "Inactive" ? "Inactive" : "Active",
      billable,
      billingRate: parseOptionalMoney(client?.billing_rate),
      billingPeriod: normalizeOptionalBillingPeriod(client?.billing_period),
      billingRounding: normalizeOptionalBillingRounding(client?.billing_rounding),
      projects: Array.isArray(client?.projects)
        ? client.projects.map((project) => normalizeProject(project, billable))
        : [],
    };
  }

  function normalizeProject(project, fallbackBillable = "yes") {
    return {
      id: String(project?.id || "").trim(),
      name: String(project?.name || "").trim(),
      billable: normalizeBillableFlag(project?.billable, fallbackBillable),
      billingRate: parseOptionalMoney(project?.billing_rate),
      billingPeriod: normalizeOptionalBillingPeriod(project?.billing_period),
      billingRounding: normalizeOptionalBillingRounding(project?.billing_rounding),
    };
  }

  function normalizeTimeEntries(data) {
    return Array.isArray(data?.entries)
      ? data.entries.map((entry) => ({
          clientId: entry.client_id,
          clientName: entry.client_name,
          projectId: entry.project_id,
          projectName: entry.project_name,
          endTime: new Date(entry.end_time),
          durationSeconds: Number(entry.duration_seconds) || 0,
          billable: entry.billable === "no" ? "no" : "yes",
        }))
      : [];
  }

  function getReportProjects(client, entries) {
    const records = window.LongtailForge.records;
    const projectsByKey = new Map();

    client.projects.forEach((project) => {
      projectsByKey.set(records.getProjectMatchKey(project), project);
    });

    entries
      .filter((entry) => records.matchesClient(entry, client))
      .forEach((entry) => {
        const project = {
          id: entry.projectId || records.normalizeKey(entry.projectName),
          name: entry.projectName || entry.projectId || "Untitled Project",
          billingRate: null,
          billingPeriod: null,
          billingRounding: null,
          billable: client.billable,
        };
        const key = records.getProjectMatchKey(project);

        if (!projectsByKey.has(key)) {
          projectsByKey.set(key, project);
        }
      });

    return [...projectsByKey.values()];
  }

  function getProjectBillingRate(settings, client, project) {
    return project.billingRate ?? client.billingRate ?? settings.defaultBillingRate;
  }

  function getEffectiveClientBillingPeriod(settings, client) {
    return client.billingPeriod || settings.billingPeriod;
  }

  function getEffectiveProjectBillingPeriod(settings, client, project) {
    return project.billingPeriod || getEffectiveClientBillingPeriod(settings, client);
  }

  function getEffectiveClientBillingRounding(settings, client) {
    return client.billingRounding || settings.billingRounding;
  }

  function getEffectiveProjectBillingRounding(settings, client, project) {
    return project.billingRounding || getEffectiveClientBillingRounding(settings, client);
  }

  function getMonthRange(date) {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }

  function getTrailingMonthStarts(monthsBack, today = new Date()) {
    const months = [];

    for (let offset = monthsBack; offset >= 0; offset -= 1) {
      months.push(new Date(today.getFullYear(), today.getMonth() - offset, 1));
    }

    return months;
  }

  function isEntryInRange(entry, range) {
    return Boolean(
      range &&
      Number.isFinite(entry.endTime.getTime()) &&
      entry.endTime >= range.start &&
      entry.endTime < range.end,
    );
  }

  function summarizeProject(settings, client, project, entries, range) {
    const records = window.LongtailForge.records;
    const projectEntries = entries
      .filter((entry) =>
        records.matchesProject(entry, project) &&
        isEntryInRange(entry, range),
      );
    const rawSeconds = projectEntries
      .reduce((seconds, entry) => seconds + entry.durationSeconds, 0);
    const rawBillableSeconds = projectEntries
      .filter((entry) => entry.billable === "yes")
      .reduce((seconds, entry) => seconds + entry.durationSeconds, 0);

    if (rawSeconds === 0) {
      return null;
    }

    const rounding = getEffectiveProjectBillingRounding(settings, client, project);
    const roundedBillableSeconds = roundSeconds(rawBillableSeconds, rounding);
    const displaySeconds = rawBillableSeconds > 0
      ? roundedBillableSeconds
      : roundSeconds(rawSeconds, rounding);
    const rate = getProjectBillingRate(settings, client, project);
    const amount = (roundedBillableSeconds / 3600) * rate;

    return {
      amount,
      billableSeconds: roundedBillableSeconds,
      displaySeconds,
      entries: projectEntries,
      project,
      rate,
      rawBillableSeconds,
      rawSeconds,
    };
  }

  function summarizeClientForRange(settings, client, entries, range) {
    const records = window.LongtailForge.records;
    const clientEntries = entries.filter((entry) => records.matchesClient(entry, client));
    const projectSummaries = getReportProjects(client, entries)
      .map((project) => summarizeProject(settings, client, project, clientEntries, range))
      .filter(Boolean);
    const totals = projectSummaries.reduce((summary, projectSummary) => ({
      amount: summary.amount + projectSummary.amount,
      billableSeconds: summary.billableSeconds + projectSummary.billableSeconds,
      displaySeconds: summary.displaySeconds + projectSummary.displaySeconds,
      rawSeconds: summary.rawSeconds + projectSummary.rawSeconds,
    }), {
      amount: 0,
      billableSeconds: 0,
      displaySeconds: 0,
      rawSeconds: 0,
    });

    return {
      ...totals,
      client,
      projectSummaries,
    };
  }

  function summarizeClientsForRange(settings, clients, entries, range, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const records = window.LongtailForge.records;

    return records.sortByName(clients)
      .filter((client) => includeInactive || client.status === "Active")
      .map((client) => summarizeClientForRange(settings, client, entries, range));
  }

  function getBillingPeriodRange(period, mode, today = new Date()) {
    const normalizedPeriod = normalizeBillingPeriod(period);
    let start;

    if (normalizedPeriod.type === "custom") {
      start = getCurrentCustomPeriodStart(today, normalizedPeriod.startDay);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    if (mode === "last") {
      start = addMonths(start, -1);
    }

    return {
      start,
      end: addMonths(start, 1),
    };
  }

  function getCurrentCustomPeriodStart(date, startDay) {
    const currentMonthStart = new Date(date.getFullYear(), date.getMonth(), startDay);

    if (date >= currentMonthStart) {
      return currentMonthStart;
    }

    return new Date(date.getFullYear(), date.getMonth() - 1, startDay);
  }

  function addMonths(date, monthCount) {
    return new Date(date.getFullYear(), date.getMonth() + monthCount, date.getDate());
  }

  namespace.billing = {
    addMonths,
    getBillingPeriodRange,
    getCurrentCustomPeriodStart,
    getEffectiveClientBillingPeriod,
    getEffectiveClientBillingRounding,
    getEffectiveProjectBillingPeriod,
    getEffectiveProjectBillingRounding,
    getMonthRange,
    getProjectBillingRate,
    getReportProjects,
    getTrailingMonthStarts,
    isEntryInRange,
    normalizeBillableFlag,
    normalizeBillingPeriod,
    normalizeBillingRounding,
    normalizeClients,
    normalizeOptionalBillingPeriod,
    normalizeOptionalBillingRounding,
    normalizeSettings,
    normalizeTimeEntries,
    parseMoney,
    parseOptionalMoney,
    roundSeconds,
    summarizeClientForRange,
    summarizeClientsForRange,
    summarizeProject,
  };
  window.LongtailForge = namespace;
}());
