import { randomUUID } from "node:crypto";
import { auditLogsRepository } from "../repositories/audit-logs.repo.js";

const CHANGE_TYPES = new Set([
  "create",
  "update",
  "delete",
  "archive",
  "restore",
  "login",
  "logout",
  "settings_change",
]);

const RECORD_TYPES = new Set([
  "organization",
  "organization_setting",
  "user",
  "client",
  "project",
  "time_entry",
]);

async function record(event) {
  const organizationId = event.organizationId || event.session?.organization_id || "";
  const action = String(event.action || "").trim();
  const changeType = normalizeEnum(event.changeType, CHANGE_TYPES, "update");
  const recordType = normalizeEnum(event.recordType, RECORD_TYPES, "organization");

  if (!organizationId || !action) {
    return null;
  }

  const entry = {
    audit_id: event.auditId || randomUUID(),
    organization_id: organizationId,
    created_at: event.createdAt || new Date().toISOString(),
    actor_user_id: event.actorUserId ?? event.session?.user_id ?? null,
    actor_user_name: event.actorUserName ?? event.session?.username ?? null,
    action,
    change_type: changeType,
    record_type: recordType,
    record_id: nullableString(event.recordId),
    record_label: nullableString(event.recordLabel),
    record_url: nullableString(event.recordUrl),
    previous_value_json: stringifyNullableJson(event.previousValue),
    new_value_json: stringifyNullableJson(event.newValue),
    metadata_json: stringifyNullableJson(event.metadata),
  };

  await auditLogsRepository.create(entry);
  return entry;
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || "").trim();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function nullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function stringifyNullableJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

export const auditService = {
  record,
};
