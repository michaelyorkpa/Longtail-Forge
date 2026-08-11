// @ts-check
import { createHash, randomBytes } from "node:crypto";
import { apiKeysRepository } from "../repositories/api-keys.repo.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { modulesService } from "../core/modules/modules.service.js";
import { AppError } from "../utils/app-error.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import { assertPublicDemoVisitorIdentityMutable } from "../core/public-demo-identities.js";
import { isPublicDemoVisitorIdentity } from "../core/public-demo-runtime.js";

/** @typedef {import("../types/http-contracts.js").ActiveApiKey} ActiveApiKey */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {ActiveApiKey & { name: string, created_at: string, last_used_at: string | null, revoked_at: string | null }} ApiKeyRecord */

const API_KEY_PREFIX = "ltf_live";

/** @param {WorkspaceRequestSession} session */
async function list(session) {
  assertPublicDemoCapabilityAllowed("api_keys");
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  return {
    apiKeys: await apiKeysRepository.readAll(session.workspace_id),
    availableScopes: await modulesService.listAvailableApiScopes(session.workspace_id),
  };
}

/** @param {WorkspaceRequestSession} session */
async function create(payload, session) {
  assertPublicDemoCapabilityAllowed("api_keys");
  assertPublicDemoVisitorIdentityMutable(session.user_id);
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const name = String(payload.name || "").trim();
  const availableScopes = await modulesService.listAvailableApiScopes(session.workspace_id);
  const scopes = normalizeScopes(payload.scopes || [], availableScopes);

  if (!name) {
    throw new AppError("API key name is required.", 400);
  }

  if (scopes.length === 0) {
    throw new AppError("Choose at least one API key scope.", 400);
  }

  const rawKey = createRawApiKey();
  const apiKey = /** @type {ApiKeyRecord} */ (await apiKeysRepository.create({
    workspaceId: session.workspace_id,
    createdByUserId: session.user_id,
    name,
    keyHash: hashApiKey(rawKey),
    keyPrefix: createKeyPrefix(rawKey),
    scopes,
  }));

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
      workspace_id: apiKey.workspace_id,
      scopes,
    },
  });

  return {
    apiKey: toPublicApiKey(apiKey),
    rawKey,
    apiKeys: await apiKeysRepository.readAll(session.workspace_id),
    availableScopes,
  };
}

/** @param {string} apiKeyId @param {WorkspaceRequestSession} session */
async function revoke(apiKeyId, session) {
  assertPublicDemoCapabilityAllowed("api_keys");
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const previousKey = /** @type {ApiKeyRecord | null} */ (
    await apiKeysRepository.readById(session.workspace_id, apiKeyId)
  );

  if (!previousKey) {
    throw new AppError("API key was not found.", 404);
  }
  assertPublicDemoVisitorIdentityMutable(previousKey.created_by_user_id);

  const apiKey = /** @type {ApiKeyRecord} */ (
    await apiKeysRepository.revoke(session.workspace_id, apiKeyId)
  );
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
      workspace_id: previousKey.workspace_id,
    },
  });

  return {
    apiKey: toPublicApiKey(apiKey),
    apiKeys: await apiKeysRepository.readAll(session.workspace_id),
    availableScopes: await modulesService.listAvailableApiScopes(session.workspace_id),
  };
}

/** @param {string} rawKey @returns {Promise<ActiveApiKey | null>} */
async function readActiveKey(rawKey) {
  assertPublicDemoCapabilityAllowed("api_keys");
  const apiKey = /** @type {ApiKeyRecord | null} */ (await apiKeysRepository.readByHash(hashApiKey(rawKey)));

  if (!apiKey || apiKey.status !== "active" || isPublicDemoVisitorIdentity(apiKey.created_by_user_id)) {
    return null;
  }

  return apiKey;
}

/** @param {ActiveApiKey} apiKey @param {string} requiredScope */
function hasScope(apiKey, requiredScope) {
  return apiKey.scopes.includes(requiredScope);
}

/** @param {ActiveApiKey} apiKey */
async function markUsed(apiKey) {
  assertPublicDemoCapabilityAllowed("api_keys");
  assertPublicDemoVisitorIdentityMutable(apiKey.created_by_user_id);
  await apiKeysRepository.updateLastUsed(apiKey.api_key_id);
}

function normalizeScopes(scopes, availableScopes) {
  const publicApiScopeSet = new Set(availableScopes.map((scope) => scope.id || scope.scope));

  return Array.from(new Set(
    scopes
      .map((scope) => String(scope || "").trim())
      .filter((scope) => publicApiScopeSet.has(scope)),
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

/** @param {ApiKeyRecord} apiKey */
function toPublicApiKey(apiKey) {
  return {
    api_key_id: apiKey.api_key_id,
    workspace_id: apiKey.workspace_id,
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
  create,
  hasScope,
  list,
  markUsed,
  readActiveKey,
  revoke,
};
