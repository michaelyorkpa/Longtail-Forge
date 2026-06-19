const LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT = "linked-context-target.v1";

const LINKED_CONTEXT_TARGET_RESPONSE_FIELDS = Object.freeze([
  "moduleId",
  "targetType",
  "targetId",
  "displayLabel",
  "secondaryLabel",
  "sortKey",
  "sourceUrl",
  "clientId",
  "projectId",
  "workspaceId",
  "isAvailable",
  "primaryContextHints",
]);

const LINKED_CONTEXT_TARGET_REQUIRED_FIELDS = Object.freeze([
  "moduleId",
  "targetType",
  "targetId",
  "displayLabel",
  "secondaryLabel",
  "sortKey",
  "sourceUrl",
  "clientId",
  "projectId",
  "workspaceId",
  "isAvailable",
]);

const SAFE_LABEL_FIELDS = Object.freeze([
  "displayLabel",
  "secondaryLabel",
]);

const RAW_IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAW_IDENTIFIER_TOKEN_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function normalizeLinkedContextTarget(target = {}, provider = {}) {
  const normalized = {
    moduleId: textValue(target.moduleId ?? target.module_id ?? provider.moduleId),
    targetType: textValue(target.targetType ?? target.target_type ?? provider.targetType),
    targetId: textValue(target.targetId ?? target.target_id),
    displayLabel: textValue(target.displayLabel ?? target.display_label),
    secondaryLabel: textValue(target.secondaryLabel ?? target.secondary_label),
    sortKey: textValue(target.sortKey ?? target.sort_key),
    sourceUrl: textValue(target.sourceUrl ?? target.source_url),
    clientId: textValue(target.clientId ?? target.client_id),
    projectId: textValue(target.projectId ?? target.project_id),
    workspaceId: textValue(target.workspaceId ?? target.workspace_id),
    isAvailable: target.isAvailable ?? target.is_available ?? true,
  };

  if (target.primaryContextHints !== undefined || target.primary_context_hints !== undefined) {
    normalized.primaryContextHints = normalizePrimaryContextHints(
      target.primaryContextHints ?? target.primary_context_hints,
    );
  }

  return normalized;
}

function validateLinkedContextTarget(target = {}, provider = {}) {
  const normalized = normalizeLinkedContextTarget(target, provider);
  const errors = [];

  for (const fieldName of LINKED_CONTEXT_TARGET_REQUIRED_FIELDS) {
    if (!Object.hasOwn(normalized, fieldName)) {
      errors.push(`${fieldName} is required.`);
      continue;
    }
    if (fieldName === "isAvailable") {
      if (typeof normalized.isAvailable !== "boolean") {
        errors.push("isAvailable must be a boolean.");
      }
      continue;
    }
    if (typeof normalized[fieldName] !== "string") {
      errors.push(`${fieldName} must be a string.`);
    }
  }

  for (const fieldName of ["moduleId", "targetType", "targetId", "displayLabel", "sortKey", "workspaceId"]) {
    if (!normalized[fieldName]) {
      errors.push(`${fieldName} must not be empty.`);
    }
  }

  for (const fieldName of SAFE_LABEL_FIELDS) {
    const value = normalized[fieldName];
    if (!value) {
      continue;
    }
    if (looksLikeRawIdentifier(value)) {
      errors.push(`${fieldName} must be a safe display label, not a raw identifier.`);
    }
    if (matchesHiddenIdentifier(value, normalized)) {
      errors.push(`${fieldName} must not echo target, client, project, or workspace IDs.`);
    }
  }

  if (normalized.primaryContextHints !== undefined) {
    if (!isPlainObject(normalized.primaryContextHints)) {
      errors.push("primaryContextHints must be an object when provided.");
    } else {
      for (const [fieldName, value] of Object.entries(normalized.primaryContextHints)) {
        if (typeof value !== "string") {
          errors.push(`primaryContextHints.${fieldName} must be a string.`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    target: normalized,
  };
}

function assertLinkedContextTargetContract(target = {}, provider = {}) {
  const result = validateLinkedContextTarget(target, provider);
  if (!result.ok) {
    throw new Error(`Invalid linked context target: ${result.errors.join(" ")}`);
  }

  return result.target;
}

function normalizePrimaryContextHints(value) {
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, fieldValue]) => [fieldName, textValue(fieldValue)]),
  );
}

function matchesHiddenIdentifier(value, target) {
  const normalizedValue = value.toLowerCase();
  return [
    target.targetId,
    target.clientId,
    target.projectId,
    target.workspaceId,
  ].filter(Boolean).some((identifier) => normalizedValue === String(identifier).toLowerCase());
}

function looksLikeRawIdentifier(value) {
  const text = textValue(value);
  return RAW_IDENTIFIER_PATTERN.test(text) || RAW_IDENTIFIER_TOKEN_PATTERN.test(text);
}

function textValue(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export {
  LINKED_CONTEXT_TARGET_REQUIRED_FIELDS,
  LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT,
  LINKED_CONTEXT_TARGET_RESPONSE_FIELDS,
  assertLinkedContextTargetContract,
  looksLikeRawIdentifier,
  normalizeLinkedContextTarget,
  validateLinkedContextTarget,
};
