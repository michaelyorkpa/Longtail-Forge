import { createHash } from "node:crypto";
import { permissionsService } from "../../core/permissions.js";
import { normalizeTimezone } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import {
  taskCalendarRecurrenceInstanceKey,
  taskCalendarResource,
} from "./task-calendar.shared.js";
import { normalizeTaskCalendarFeedScope } from "./task-calendar-feed.scope.js";
import { taskRecurrenceRepository } from "./task-recurrence.repo.js";
import { taskRecurrenceService } from "./task-recurrence.service.js";
import { tasksRepository } from "./tasks.repo.js";

const TASK_CALENDAR_FEED_PAST_DAYS = 90;
const TASK_CALENDAR_FEED_FUTURE_DAYS = 365;
const TASK_CALENDAR_NAME = "Longtail Forge Tasks";
const ICALENDAR_PRODID = "-//Longtail Forge//Tasks Calendar//EN";
const ACTIVE_FEED_STATUSES = new Set(["open", "in_progress", "blocked", "complete"]);

async function buildTasksPrivateCalendarContent({ now = new Date(), session, subscription }) {
  const window = calendarFeedWindow(now, session.timezone);
  const scope = normalizeTaskCalendarFeedScope(subscription?.scope);
  const [tasks, templates, canReadTask] = await Promise.all([
    tasksRepository.readCalendarFeedCandidates(
      session.workspace_id,
      window.startDate,
      window.endDate,
      { scope },
    ),
    taskRecurrenceRepository.readActiveTemplates(session.workspace_id, {
      fromDate: window.startDate,
      includeAssignees: false,
      scope,
      throughDate: window.endDate,
    }),
    permissionsService.createPermissionEvaluator(session, "tasks.view"),
  ]);
  const suppressedInstances = await tasksRepository.readCalendarFeedSuppressedInstances(
    session.workspace_id,
    window.startDate,
    window.endDate,
    templates.map((template) => template.recurrence_template_id),
    { scope },
  );

  return serializeTasksCalendar({
    canReadTask,
    now,
    session,
    subscription,
    suppressedInstances,
    tasks,
    templates,
    window,
  });
}

function serializeTasksCalendar({
  canReadTask = () => true,
  now = new Date(),
  session,
  subscription,
  suppressedInstances = [],
  tasks = [],
  templates = [],
  window = calendarFeedWindow(now, session?.timezone),
}) {
  const readableTemplates = templates.filter((template) => canReadTask(taskCalendarResource(template)));
  const readableTemplateIds = new Set(readableTemplates.map((template) => template.recurrence_template_id));
  const templatesById = new Map(templates.map((template) => [template.recurrence_template_id, template]));
  const tasksByInstance = new Map(tasks
    .filter((task) => task.recurrence_template_id && task.recurrence_instance_date)
    .map((task) => [
      taskCalendarRecurrenceInstanceKey(
        task.recurrence_template_id,
        task.recurrence_instance_date,
      ),
      task,
    ]));
  const suppressedInstanceKeys = new Set(suppressedInstances.map((instance) => (
    taskCalendarRecurrenceInstanceKey(
      instance.recurrence_template_id,
      instance.recurrence_instance_date,
    )
  )));
  const eventComponents = [];
  const calendarName = subscription?.name || TASK_CALENDAR_NAME;
  const calendarTimezone = normalizeTimezone(session?.timezone);
  const timezoneIds = new Set([calendarTimezone]);

  for (const template of readableTemplates) {
    const occurrences = taskRecurrenceService.projectOccurrenceDates(
      template,
      window.startDate,
      window.endDate,
    );
    if (occurrences.length === 0) {
      continue;
    }

    if (template.due_time) {
      timezoneIds.add(normalizeTimezone(template.due_timezone || session?.timezone));
    }
    eventComponents.push({
      key: `series:${occurrences[0]}:${template.recurrence_template_id}`,
      lines: recurringMasterLines(template, occurrences, window, now, session),
    });

    for (const instanceDate of occurrences) {
      const instanceKey = taskCalendarRecurrenceInstanceKey(
        template.recurrence_template_id,
        instanceDate,
      );
      if (suppressedInstanceKeys.has(instanceKey)) {
        eventComponents.push({
          key: `exception:${instanceDate}:${template.recurrence_template_id}`,
          lines: cancelledRecurrenceLines(template, instanceDate, template, now, session),
        });
        continue;
      }
      const task = tasksByInstance.get(instanceKey);
      if (!task) {
        continue;
      }

      const readable = canReadTask(taskCalendarResource(task));
      const insideDueWindow = dateInWindow(task.due_date, window);
      if (!readable || task.status === "archived" || !insideDueWindow) {
        eventComponents.push({
          key: `exception:${instanceDate}:${task.task_id}`,
          lines: cancelledRecurrenceLines(template, instanceDate, task, now, session),
        });
        continue;
      }

      if (hasMaterializedOverride(task, template, instanceDate)) {
        eventComponents.push({
          key: `exception:${instanceDate}:${task.task_id}`,
          lines: recurrenceOverrideLines(template, instanceDate, task, now, session),
        });
      }
    }
  }

  for (const task of tasks) {
    if (!dateInWindow(task.due_date, window) || !ACTIVE_FEED_STATUSES.has(task.status)) {
      continue;
    }
    if (!canReadTask(taskCalendarResource(task))) {
      continue;
    }

    const template = templatesById.get(task.recurrence_template_id);
    const instanceIsInPublishedSeries = template
      && readableTemplateIds.has(template.recurrence_template_id)
      && task.recurrence_instance_date
      && dateInWindow(task.recurrence_instance_date, window);
    if (instanceIsInPublishedSeries) {
      continue;
    }

    eventComponents.push({
      key: `task:${task.due_date}:${task.due_time || "23:59"}:${task.task_id}`,
      lines: singleTaskLines(task, now, session),
    });
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICALENDAR_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeICalendarText(calendarName)}`,
    `X-WR-CALNAME:${escapeICalendarText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeICalendarText(calendarTimezone)}`,
    `X-LONGTAIL-FORGE-WINDOW-START:${toICalendarDate(window.startDate)}`,
    `X-LONGTAIL-FORGE-WINDOW-END:${toICalendarDate(window.endDate)}`,
    ...Array.from(timezoneIds)
      .sort()
      .flatMap((timezone) => timezoneComponentLines(timezone, window)),
    ...eventComponents
      .sort((first, second) => first.key.localeCompare(second.key))
      .flatMap((component) => component.lines),
    "END:VCALENDAR",
  ];

  return renderICalendar(lines);
}

function recurringMasterLines(template, occurrences, window, now, session) {
  const uid = stableCalendarUid(
    "recurrence",
    template.workspace_id || session?.workspace_id,
    template.recurrence_template_id,
  );
  const firstOccurrence = occurrences[0];
  const finalOccurrence = occurrences.at(-1);
  const lines = eventHeader(uid, template.updated_at, now);

  lines.push(...eventStartLines({
    date: firstOccurrence,
    time: template.due_time,
    timezone: template.due_timezone || session?.timezone,
    useLocalTimezone: Boolean(template.due_time),
  }));
  lines.push(`RRULE:${boundedRRule(template, finalOccurrence, session?.timezone)}`);
  lines.push(`SUMMARY:${escapeICalendarText(template.title)}`);
  lines.push(...taskMetadataLines(template));
  lines.push("END:VEVENT");
  return lines;
}

function recurrenceOverrideLines(template, instanceDate, task, now, session) {
  const uid = stableCalendarUid(
    "recurrence",
    template.workspace_id || session?.workspace_id,
    template.recurrence_template_id,
  );
  const lines = eventHeader(uid, task.updated_at, now);

  lines.push(recurrenceIdLine(template, instanceDate, session?.timezone));
  lines.push(...eventStartLines({
    date: task.due_date,
    dueAtUtc: task.due_at_utc,
    time: task.due_time,
    timezone: task.due_timezone || session?.timezone,
  }));
  lines.push(`SUMMARY:${escapeICalendarText(task.title)}`);
  lines.push(...taskMetadataLines(task));
  lines.push("END:VEVENT");
  return lines;
}

function cancelledRecurrenceLines(template, instanceDate, task, now, session) {
  const uid = stableCalendarUid(
    "recurrence",
    template.workspace_id || session?.workspace_id,
    template.recurrence_template_id,
  );
  const lines = eventHeader(uid, task.updated_at, now);

  lines.push(recurrenceIdLine(template, instanceDate, session?.timezone));
  lines.push(...eventStartLines({
    date: instanceDate,
    time: template.due_time,
    timezone: template.due_timezone || session?.timezone,
    useLocalTimezone: Boolean(template.due_time),
  }));
  lines.push("STATUS:CANCELLED");
  lines.push("END:VEVENT");
  return lines;
}

function singleTaskLines(task, now, session) {
  const uid = stableCalendarUid(
    "task",
    task.workspace_id || session?.workspace_id,
    task.task_id,
  );
  const lines = eventHeader(uid, task.updated_at, now);

  lines.push(...eventStartLines({
    date: task.due_date,
    dueAtUtc: task.due_at_utc,
    time: task.due_time,
    timezone: task.due_timezone || session?.timezone,
  }));
  lines.push(`SUMMARY:${escapeICalendarText(task.title)}`);
  lines.push(...taskMetadataLines(task));
  lines.push("END:VEVENT");
  return lines;
}

function eventHeader(uid, updatedAt, now) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICalendarUtc(updatedAt, now)}`,
  ];
  if (isValidDateTime(updatedAt)) {
    lines.push(`LAST-MODIFIED:${toICalendarUtc(updatedAt, now)}`);
  }
  return lines;
}

function eventStartLines({
  date,
  dueAtUtc = "",
  time = "",
  timezone = "",
  useLocalTimezone = false,
}) {
  if (!time) {
    return [
      `DTSTART;VALUE=DATE:${toICalendarDate(date)}`,
      `DTEND;VALUE=DATE:${toICalendarDate(addDaysKey(date, 1))}`,
    ];
  }

  if (useLocalTimezone) {
    const timezoneId = normalizeTimezone(timezone);
    return [`DTSTART;TZID=${timezoneId}:${toICalendarLocal(date, time)}`];
  }

  const canonicalUtc = isValidDateTime(dueAtUtc)
    ? dueAtUtc
    : normalizeUtcIso(`${date}T${time}:00`, normalizeTimezone(timezone));
  return [`DTSTART:${toICalendarUtc(canonicalUtc)}`];
}

function recurrenceIdLine(template, instanceDate, fallbackTimezone) {
  if (!template.due_time) {
    return `RECURRENCE-ID;VALUE=DATE:${toICalendarDate(instanceDate)}`;
  }

  const timezone = normalizeTimezone(template.due_timezone || fallbackTimezone);
  return `RECURRENCE-ID;TZID=${timezone}:${toICalendarLocal(instanceDate, template.due_time)}`;
}

function boundedRRule(template, finalOccurrence, fallbackTimezone) {
  const parts = String(template.rrule || "")
    .split(";")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part && !part.startsWith("UNTIL=") && !part.startsWith("COUNT="));
  const untilDate = [template.recurrence_end_date, finalOccurrence]
    .filter(Boolean)
    .sort()[0] || finalOccurrence;

  if (template.due_time) {
    const timezone = normalizeTimezone(template.due_timezone || fallbackTimezone);
    const untilUtc = normalizeUtcIso(`${untilDate}T${template.due_time}:00`, timezone);
    parts.push(`UNTIL=${toICalendarUtc(untilUtc)}`);
  } else {
    parts.push(`UNTIL=${toICalendarDate(untilDate)}`);
  }

  return parts.join(";");
}

function taskMetadataLines(task) {
  return [
    `X-LONGTAIL-FORGE-STATUS:${escapeICalendarText(task.status || "open")}`,
    `X-LONGTAIL-FORGE-PRIORITY:${escapeICalendarText(task.priority || "normal")}`,
    "TRANSP:TRANSPARENT",
  ];
}

function hasMaterializedOverride(task, template, instanceDate) {
  return task.title !== template.title
    || task.status !== (template.status || "open")
    || task.priority !== (template.priority || "normal")
    || task.due_date !== instanceDate
    || String(task.due_time || "") !== String(template.due_time || "")
    || normalizeTimezone(task.due_timezone) !== normalizeTimezone(template.due_timezone);
}

function stableCalendarUid(kind, workspaceId, recordId) {
  const digest = createHash("sha256")
    .update(["longtail-forge", kind, workspaceId, recordId].join("\0"))
    .digest("hex");
  return `${digest}@calendar.longtailforge.local`;
}

function timezoneComponentLines(timezone, window) {
  const start = new Date(`${addDaysKey(window.startDate, -730)}T00:00:00.000Z`);
  const end = new Date(`${addDaysKey(window.endDate, 370)}T23:59:59.999Z`);
  const transitions = findTimezoneTransitions(timezone, start, end);

  if (transitions.length === 0) {
    const offset = timezoneOffsetMinutes(start, timezone);
    return [
      "BEGIN:VTIMEZONE",
      `TZID:${timezone}`,
      "BEGIN:STANDARD",
      `DTSTART:${start.getUTCFullYear()}0101T000000`,
      `TZOFFSETFROM:${formatTimezoneOffset(offset)}`,
      `TZOFFSETTO:${formatTimezoneOffset(offset)}`,
      `TZNAME:${escapeICalendarText(timezoneName(start, timezone))}`,
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }

  const standardOffset = Math.min(...transitions.flatMap((transition) => [
    transition.fromOffset,
    transition.toOffset,
  ]));
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timezone}`,
    ...transitions.flatMap((transition) => {
      const local = localPartsAtOffset(transition.instant, transition.fromOffset);
      const type = transition.toOffset > standardOffset ? "DAYLIGHT" : "STANDARD";
      return [
        `BEGIN:${type}`,
        `DTSTART:${formatDateTimeParts(local)}`,
        `TZOFFSETFROM:${formatTimezoneOffset(transition.fromOffset)}`,
        `TZOFFSETTO:${formatTimezoneOffset(transition.toOffset)}`,
        `TZNAME:${escapeICalendarText(timezoneName(transition.instant, timezone))}`,
        `END:${type}`,
      ];
    }),
    "END:VTIMEZONE",
  ];
}

function findTimezoneTransitions(timezone, start, end) {
  const transitions = [];
  const stepMilliseconds = 6 * 60 * 60 * 1000;
  let previousInstant = new Date(start);
  let previousOffset = timezoneOffsetMinutes(previousInstant, timezone);

  for (
    let timestamp = start.getTime() + stepMilliseconds;
    timestamp <= end.getTime();
    timestamp += stepMilliseconds
  ) {
    const instant = new Date(timestamp);
    const offset = timezoneOffsetMinutes(instant, timezone);
    if (offset !== previousOffset) {
      const transitionInstant = findTransitionInstant(
        timezone,
        previousInstant,
        instant,
        previousOffset,
      );
      transitions.push({
        fromOffset: previousOffset,
        instant: transitionInstant,
        toOffset: timezoneOffsetMinutes(transitionInstant, timezone),
      });
      previousOffset = offset;
    }
    previousInstant = instant;
  }

  return transitions;
}

function findTransitionInstant(timezone, lowerDate, upperDate, fromOffset) {
  let lower = Math.floor(lowerDate.getTime() / 60000) * 60000;
  let upper = Math.ceil(upperDate.getTime() / 60000) * 60000;

  while (upper - lower > 60000) {
    const midpoint = Math.floor((lower + upper) / 120000) * 60000;
    if (timezoneOffsetMinutes(new Date(midpoint), timezone) === fromOffset) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }

  return new Date(upper);
}

function timezoneOffsetMinutes(date, timezone) {
  const parts = zonedDateTimeParts(date, timezone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((zonedAsUtc - date.getTime()) / 60000);
}

function zonedDateTimeParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date)
    .map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function localPartsAtOffset(date, offsetMinutes) {
  const local = new Date(date.getTime() + (offsetMinutes * 60 * 1000));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}

function timezoneName(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  });
  return formatter.formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value || timezone;
}

function formatTimezoneOffset(offsetMinutes) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}${minutes}`;
}

function calendarFeedWindow(now, timezone) {
  const today = localDateKey(now, normalizeTimezone(timezone));
  return {
    startDate: addDaysKey(today, -TASK_CALENDAR_FEED_PAST_DAYS),
    endDate: addDaysKey(today, TASK_CALENDAR_FEED_FUTURE_DAYS),
  };
}

function localDateKey(date, timezone) {
  const parts = zonedDateTimeParts(date, timezone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInWindow(date, window) {
  return Boolean(date && date >= window.startDate && date <= window.endDate);
}

function toICalendarDate(date) {
  return String(date || "").replaceAll("-", "");
}

function toICalendarLocal(date, time) {
  return `${toICalendarDate(date)}T${String(time || "00:00").replaceAll(":", "").padEnd(6, "0")}`;
}

function toICalendarUtc(value, fallback = new Date()) {
  const date = new Date(value || fallback);
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date(fallback);
  return safeDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDateTimeParts(parts) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
    "T",
    String(parts.hour).padStart(2, "0"),
    String(parts.minute).padStart(2, "0"),
    String(parts.second).padStart(2, "0"),
  ].join("");
}

function isValidDateTime(value) {
  return Boolean(value) && Number.isFinite(new Date(value).getTime());
}

function escapeICalendarText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function renderICalendar(lines) {
  return `${lines.flatMap(foldICalendarLine).join("\r\n")}\r\n`;
}

function foldICalendarLine(line) {
  const segments = [];
  let segment = "";
  let byteLimit = 75;

  for (const character of String(line)) {
    const candidate = segment + character;
    if (Buffer.byteLength(candidate, "utf8") > byteLimit && segment) {
      segments.push(segments.length === 0 ? segment : ` ${segment}`);
      segment = character;
      byteLimit = 74;
    } else {
      segment = candidate;
    }
  }
  segments.push(segments.length === 0 ? segment : ` ${segment}`);
  return segments;
}

export {
  TASK_CALENDAR_FEED_FUTURE_DAYS,
  TASK_CALENDAR_FEED_PAST_DAYS,
  buildTasksPrivateCalendarContent,
  calendarFeedWindow,
  escapeICalendarText,
  foldICalendarLine,
  serializeTasksCalendar,
};
