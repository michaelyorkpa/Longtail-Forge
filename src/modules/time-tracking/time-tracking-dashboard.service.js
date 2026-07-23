import { permissionsService } from "../../core/permissions.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { localDateBoundToUtcIso } from "../../utils/timezones.js";
import { activeTimersService } from "./active-timers.service.js";
import { timeEntriesRepository } from "./time-entries.repo.js";

const ACTIVE_TIMER_ROW_LIMIT = 3;
const RECENT_TIME_ROW_LIMIT = 3;
const RECENT_TIME_WINDOW_DAYS = 7;
const WORKBENCH_URL = "workbench.html";
const TIME_ENTRIES_URL = "time-entries.html";
const REPORTING_URL = "reporting.html";

async function readDashboardEffortSummary(session) {
  const [settings, canUseTimers, canViewReporting] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id, session),
    permissionsService.canInAnyScope(session, "time_entries.create", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "reporting.view", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
  ]);
  const today = localDateKey(new Date(), session.timezone);
  const windowStart = addDaysKey(today, -(RECENT_TIME_WINDOW_DAYS - 1));
  const windowEnd = addDaysKey(today, 1);
  const visibility = canViewReporting
    ? await permissionsService.readTimeEntryVisibility(session)
    : null;
  const [timerResult, entryResult] = await Promise.all([
    canUseTimers ? activeTimersService.listAll(session) : { timers: [] },
    canViewReporting
      ? timeEntriesRepository.readDashboardEffortSummary(session.workspace_id, {
        limit: RECENT_TIME_ROW_LIMIT,
        todayStart: localDateBoundToUtcIso(today, session.timezone),
        visibility,
        windowEnd: localDateBoundToUtcIso(windowEnd, session.timezone),
        windowStart: localDateBoundToUtcIso(windowStart, session.timezone),
      })
      : { entries: [], entriesCount: 0, todaySeconds: 0, totalSeconds: 0 },
  ]);
  const workspaceType = settings.workspaceType || "business";
  const timers = (timerResult.timers || []).filter(isActiveDashboardTimer);
  const entries = canViewReporting
    ? await permissionsService.filterReadableTimeEntries(session, entryResult.entries || [])
    : [];

  return {
    activeTimers: {
      action: { label: "Open Workbench", href: WORKBENCH_URL },
      count: timers.length,
      pausedCount: timers.filter((timer) => timer.timer_status === "paused").length,
      rows: timers.slice(0, ACTIVE_TIMER_ROW_LIMIT).map((timer) => dashboardTimerRow(timer, workspaceType)),
      runningCount: timers.filter((timer) => timer.timer_status === "running").length,
    },
    permissions: {
      canUseTimers,
      canViewReporting,
    },
    recentTime: {
      actions: [
        { label: "View Time Entries", href: TIME_ENTRIES_URL },
        canViewReporting ? { label: "Open Reporting", href: REPORTING_URL } : null,
      ].filter(Boolean),
      entriesCount: entryResult.entriesCount,
      rows: entries.map((entry) => dashboardTimeEntryRow(entry, workspaceType, session.timezone)),
      todaySeconds: entryResult.todaySeconds,
      totalSeconds: entryResult.totalSeconds,
      windowDays: RECENT_TIME_WINDOW_DAYS,
    },
  };
}

function dashboardTimerRow(timer, workspaceType) {
  return {
    action: { label: "Open Workbench", href: WORKBENCH_URL },
    contextLabel: dashboardContextLabel(timer, workspaceType),
    dedupeKey: `time-tracking:active-timer:${timer.timer_slot || timer.active_timer_id || ""}`,
    elapsedLabel: durationLabel(timerElapsedSeconds(timer)),
    elapsedSeconds: timerElapsedSeconds(timer),
    id: timer.timer_slot || timer.active_timer_id || "",
    sourceLabel: "Time Tracking",
    status: timer.timer_status === "running" ? "Running" : "Paused",
    title: timer.source_label || timer.description || "Manual timer",
  };
}

function dashboardTimeEntryRow(entry, workspaceType, timezone) {
  return {
    action: { label: "View Time Entries", href: TIME_ENTRIES_URL },
    contextLabel: dashboardContextLabel(entry, workspaceType),
    dedupeKey: `time-tracking:time-entry:${entry.entry_id || ""}`,
    durationLabel: durationLabel(entry.duration_seconds),
    durationSeconds: Number(entry.duration_seconds) || 0,
    endedAtLabel: entryLocalDateKey(entry, timezone),
    id: entry.entry_id || "",
    sourceLabel: "Time Tracking",
    title: entry.description || entry.project_name || "Time entry",
  };
}

function isActiveDashboardTimer(timer) {
  return ["running", "paused"].includes(timer?.timer_status || "");
}

function entryLocalDateKey(entry, timezone = "America/New_York") {
  const endedAt = new Date(entry?.end_time || "");
  return Number.isNaN(endedAt.getTime()) ? "" : localDateKey(endedAt, timezone);
}

function dashboardContextLabel(record, workspaceType = "business") {
  const clientName = String(record.client_name || "").trim();
  const projectName = String(record.project_name || "").trim();

  if (workspaceType === "business") {
    return [clientName, projectName].filter(Boolean).join(" / ") || "Workspace";
  }

  return projectName || "Workspace";
}

function timerElapsedSeconds(timer) {
  const accumulated = Math.max(0, Number.parseInt(timer?.accumulated_elapsed_seconds, 10) || 0);

  if (timer?.timer_status !== "running" || !timer?.last_active_start_time) {
    return accumulated;
  }

  const lastStartedAt = Date.parse(timer.last_active_start_time);
  if (!Number.isFinite(lastStartedAt)) {
    return accumulated;
  }

  return accumulated + Math.max(0, Math.floor((Date.now() - lastStartedAt) / 1000));
}

function durationLabel(seconds) {
  return `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;
}

function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const timeTrackingDashboardService = {
  readDashboardEffortSummary,
};
