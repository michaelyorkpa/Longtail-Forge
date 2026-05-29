const DEFAULT_TIMEZONE = "America/New_York";

function normalizeUtcIso(value, sourceTimezone = DEFAULT_TIMEZONE, fallback = new Date()) {
  const text = String(value || "").trim();
  const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback);

  if (!text) {
    return toValidIso(fallbackDate);
  }

  if (hasExplicitTimezone(text)) {
    return toValidIso(new Date(text), toValidIso(fallbackDate));
  }

  const parts = parseDateTimeParts(text);

  if (!parts) {
    return toValidIso(new Date(text), toValidIso(fallbackDate));
  }

  return zonedDateTimeToUtc(parts, sourceTimezone).toISOString();
}

function hasExplicitTimezone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value || "").trim());
}

function parseDateTimeParts(value) {
  const match = String(value || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
    millisecond: Number((match[7] || "0").padEnd(3, "0")),
  };
}

function zonedDateTimeToUtc(parts, timezone = DEFAULT_TIMEZONE) {
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

  if (secondOffset !== offset) {
    return new Date(utcGuess - secondOffset);
  }

  return firstPass;
}

function getTimezoneOffsetMilliseconds(date, timezone = DEFAULT_TIMEZONE) {
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

function getZonedParts(date, timezone = DEFAULT_TIMEZONE) {
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

function localDateBoundToUtcIso(dateValue, timezone = DEFAULT_TIMEZONE, edge = "start") {
  const text = String(dateValue || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return normalizeUtcIso(text, timezone);
  }

  return normalizeUtcIso(
    edge === "end" ? `${text}T23:59:59.999` : `${text}T00:00:00.000`,
    timezone,
  );
}

function toValidIso(date, fallbackIso = new Date().toISOString()) {
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallbackIso;
}

export {
  DEFAULT_TIMEZONE,
  hasExplicitTimezone,
  localDateBoundToUtcIso,
  normalizeUtcIso,
  zonedDateTimeToUtc,
};
