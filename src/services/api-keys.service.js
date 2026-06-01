import { createHash, randomBytes } from "node:crypto";
import { apiKeysRepository } from "../repositories/api-keys.repo.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";

const API_KEY_PREFIX = "ltf_live";
const PUBLIC_API_SCOPES = [
  "clients:read",
  "clients:write",
  "projects:read",
  "projects:write",
  "time_entries:read",
  "time_entries:write",
  "tasks:read",
  "tasks:write",
  "notes:read",
  "notes:write",
  "tickets:read",
  "tickets:write",
];
const PUBLIC_API_SCOPE_SET = new Set(PUBLIC_API_SCOPES);

async function list(session) {
  await permissionsService.assertCan(session, "organization_settings.manage", {
    organization_id: session.organization_id,
    operation: "read",
  });

  return {
    apiKeys: await apiKeysRepository.readAll(session.organization_id),
    availableScopes: PUBLIC_API_SCOPES,
  };
}

async function create(payload, session) {
  await permissionsService.assertCan(session, "organization_settings.manage", {
    organization_id: session.organization_id,
    operation: "update",
  });

  const name = String(payload.name || "").trim();
  const scopes = normalizeScopes(payload.scopes || []);

  if (!name) {
    throw new AppError("API key name is required.", 400);
  }

  if (scopes.length === 0) {
    throw new AppError("Choose at least one API key scope.", 400);
  }

  const rawKey = createRawApiKey();
  const apiKey = await apiKeysRepository.create({
    organizationId: session.organization_id,
    createdByUserId: session.user_id,
    name,
    keyHash: hashApiKey(rawKey),
    keyPrefix: createKeyPrefix(rawKey),
    scopes,
  });

  await auditService.record({
    session,
    action: "api_key_created",
    changeType: "create",
    recordType: "api_key",
    recordId: apiKey.api_key_id,
    recordLabel: apiKey.name,
    recordUrl: "api-keys.html",
    previousValue: null,
    newValue: toPublicApiKey(apiKey),
    metadata: {
      key_prefix: apiKey.key_prefix,
      workspace_id: apiKey.workspace_id || apiKey.organization_id,
      scopes,
    },
  });

  return {
    apiKey: toPublicApiKey(apiKey),
    rawKey,
    apiKeys: await apiKeysRepository.readAll(session.organization_id),
    availableScopes: PUBLIC_API_SCOPES,
  };
}

async function revoke(apiKeyId, session) {
  await permissionsService.assertCan(session, "organization_settings.manage", {
    organization_id: session.organization_id,
    operation: "update",
  });

  const previousKey = await apiKeysRepository.readById(session.organization_id, apiKeyId);

  if (!previousKey) {
    throw new AppError("API key was not found.", 404);
  }

  const apiKey = await apiKeysRepository.revoke(session.organization_id, apiKeyId);
  await auditService.record({
    session,
    action: "api_key_revoked",
    changeType: "update",
    recordType: "api_key",
    recordId: apiKeyId,
    recordLabel: previousKey.name,
    recordUrl: "api-keys.html",
    previousValue: toPublicApiKey(previousKey),
    newValue: toPublicApiKey(apiKey),
    metadata: {
      key_prefix: previousKey.key_prefix,
      workspace_id: previousKey.workspace_id || previousKey.organization_id,
    },
  });

  return {
    apiKey: toPublicApiKey(apiKey),
    apiKeys: await apiKeysRepository.readAll(session.organization_id),
    availableScopes: PUBLIC_API_SCOPES,
  };
}

async function readActiveKey(rawKey) {
  const apiKey = await apiKeysRepository.readByHash(hashApiKey(rawKey));

  if (!apiKey || apiKey.status !== "active") {
    return null;
  }

  return apiKey;
}

function hasScope(apiKey, requiredScope) {
  return apiKey.scopes.includes(requiredScope);
}

async function markUsed(apiKey) {
  await apiKeysRepository.updateLastUsed(apiKey.api_key_id);
}

function normalizeScopes(scopes) {
  return Array.from(new Set(
    scopes
      .map((scope) => String(scope || "").trim())
      .filter((scope) => PUBLIC_API_SCOPE_SET.has(scope)),
  ));
}

function createRawApiKey() {
  return `${API_KEY_PREFIX}_${randomBytes(24).toString("base64url")}`;
}

function createKeyPrefix(rawKey) {
  return rawKey.slice(0, 17);
}

function hashApiKey(rawKey) {
  return createHash("sha256").update(String(rawKey || "")).digest("hex");
}

function toPublicApiKey(apiKey) {
  return {
    api_key_id: apiKey.api_key_id,
    workspace_id: apiKey.workspace_id || apiKey.organization_id,
    organization_id: apiKey.organization_id,
    name: apiKey.name,
    key_prefix: apiKey.key_prefix,
    status: apiKey.status,
    scopes: apiKey.scopes || [],
    created_at: apiKey.created_at,
    last_used_at: apiKey.last_used_at,
    revoked_at: apiKey.revoked_at,
  };
}

export const apiKeysService = {
  availableScopes: PUBLIC_API_SCOPES,
  create,
  hasScope,
  list,
  markUsed,
  readActiveKey,
  revoke,
};
