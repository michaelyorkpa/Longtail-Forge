(function () {
  const namespace = window.LongtailForge || {};
  const TIMEZONE_STORAGE_KEY = "lf_timezone";
  const DEFAULT_TIMEZONE = "America/New_York";
  let userTimezone = normalizeTimezone(
    window.localStorage.getItem(TIMEZONE_STORAGE_KEY) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    DEFAULT_TIMEZONE,
  );

  async function loadSessionTimezone() {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });

      if (!response.ok) {
        return userTimezone;
      }

      const body = await response.json().catch(() => ({}));
      setUserTimezone(body.user?.timezone);
    } catch {
      // Keep the last known timezone if the session lookup fails.
    }

    return userTimezone;
  }

  function setUserTimezone(timezone) {
    userTimezone = normalizeTimezone(timezone);
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, userTimezone);
    return userTimezone;
  }

  function getUserTimezone() {
    return userTimezone;
  }

  function normalizeTimezone(timezone) {
    const candidate = String(timezone || "").trim() || DEFAULT_TIMEZONE;

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return DEFAULT_TIMEZONE;
    }
  }

  function zonedDateTimeToUtcIso(dateValue, timeValue, timezone = userTimezone) {
    const parts = parseDateTimeParts(dateValue, timeValue);

    if (!parts) {
      return "";
    }

    return zonedPartsToUtcDate(parts, normalizeTimezone(timezone)).toISOString();
  }

  function parseDateTimeParts(dateValue, timeValue = "00:00:00") {
    if (!dateValue || !timeValue) {
      return null;
    }

    const [year, month, day] = String(dateValue).split("-").map(Number);
    const [hour, minute, second = 0] = String(timeValue).split(":").map(Number);

    if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
      return null;
    }

    return { year, month, day, hour, minute, second, millisecond: 0 };
  }

  function zonedPartsToUtcDate(parts, timezone) {
    const utcGuess = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    );
    const offset = getTimezoneOffsetMilliseconds(new Date(utcGuess), timezone);
    const firstPass = new Date(utcGuess - offset);
    const secondOffset = getTimezoneOffsetMilliseconds(firstPass, timezone);

    return secondOffset === offset ? firstPass : new Date(utcGuess - secondOffset);
  }

  function getTimezoneOffsetMilliseconds(date, timezone) {
    const parts = getZonedParts(date, timezone);
    const zonedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    );

    return zonedAsUtc - date.getTime();
  }

  function getZonedParts(date, timezone = userTimezone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizeTimezone(timezone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
      millisecond: date.getUTCMilliseconds(),
    };
  }

  function formatDateInput(date, timezone = userTimezone) {
    const parts = getZonedParts(date, timezone);

    return [
      parts.year,
      String(parts.month).padStart(2, "0"),
      String(parts.day).padStart(2, "0"),
    ].join("-");
  }

  function formatTimeInput(date, timezone = userTimezone) {
    const parts = getZonedParts(date, timezone);

    return [
      String(parts.hour).padStart(2, "0"),
      String(parts.minute).padStart(2, "0"),
      String(parts.second).padStart(2, "0"),
    ].join(":");
  }

  function formatDate(date, timezone = userTimezone) {
    return new Intl.DateTimeFormat("en-US", { timeZone: normalizeTimezone(timezone) }).format(date);
  }

  function formatDateTime(value, timezone = userTimezone) {
    const date = value instanceof Date ? value : new Date(value);

    if (!Number.isFinite(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      timeZone: normalizeTimezone(timezone),
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  }

  function localDateRangeToUtc(dateValue, timezone = userTimezone) {
    return {
      start: new Date(zonedDateTimeToUtcIso(dateValue, "00:00:00", timezone)),
      end: new Date(zonedDateTimeToUtcIso(dateValue, "23:59:59", timezone)),
    };
  }

  namespace.timezones = {
    formatDate,
    formatDateInput,
    formatDateTime,
    formatTimeInput,
    getUserTimezone,
    loadSessionTimezone,
    localDateRangeToUtc,
    normalizeTimezone,
    setUserTimezone,
    zonedDateTimeToUtcIso,
  };
  window.LongtailForge = namespace;
}());
