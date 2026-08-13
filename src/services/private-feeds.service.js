// @ts-check

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import { config } from "../config.js";
import { modulesService } from "../core/modules/modules.service.js";
import {
  createPrivateFeedSubscriptionDescriptor,
  getPrivateFeedProvider,
} from "../core/private-feeds/private-feed-providers.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { privateFeedTokensRepository } from "../repositories/private-feed-tokens.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { securityEventsService } from "../security/security-events.js";
import { AppError } from "../utils/app-error.js";
import { normalizeTimezone } from "../utils/normalizers.js";
import { permissionsService } from "./permissions.service.js";

/** @typedef {import("../types/http-contracts.js").PermissionSession} PermissionSession */
/** @typedef {import("../types/http-contracts.js").PrivateFeedAuthorizationSession} PrivateFeedAuthorizationSession */
/** @typedef {import("../types/private-feed-contracts.js").ParsedPrivateFeedToken} ParsedPrivateFeedToken */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedAuthentication} PrivateFeedAuthentication */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedCollectionResponse} PrivateFeedCollectionResponse */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedCreateResponse} PrivateFeedCreateResponse */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedEligibility} PrivateFeedEligibility */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedManagementSession} PrivateFeedManagementSession */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedPermissionResource} PrivateFeedPermissionResource */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedPublicSubscription} PrivateFeedPublicSubscription */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedReconcileOptions} PrivateFeedReconcileOptions */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedReconcileResult} PrivateFeedReconcileResult */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedRemoveResponse} PrivateFeedRemoveResponse */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedScope} PrivateFeedScope */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedSubscriptionPayload} PrivateFeedSubscriptionPayload */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedTokenRow} PrivateFeedTokenRow */

const PRIVATE_CALENDAR_PROVIDER_ID = "tasks.calendar";
const RAW_TOKEN_PREFIX = "ltf_feed";
const DUMMY_TOKEN_HASH = createHash("sha256").update("longtail-forge-private-feed-dummy").digest();
const VALID_SCOPE_TYPES = new Set(["workspace", "client", "project"]);

/**
 * @param {PrivateFeedManagementSession} session
 * @returns {Promise<PrivateFeedCollectionResponse>}
 */
async function listCalendarSubscriptions(session) {
  assertPublicDemoCapabilityAllowed("private_feeds");
  await assertCanManageCalendarSubscriptions(session);
  const rows = await privateFeedTokensRepository.listForWorkspace(
    session.workspace_id,
    PRIVATE_CALENDAR_PROVIDER_ID,
  );
  return {
    subscriptions: rows.map((row) => toPublicSubscription(row, session)),
  };
}

/**
 * @param {unknown} payloadValue
 * @param {PrivateFeedManagementSession} session
 * @param {string} requestOrigin
 * @returns {Promise<PrivateFeedCreateResponse>}
 */
async function createCalendarSubscription(payloadValue, session, requestOrigin) {
  assertPublicDemoCapabilityAllowed("private_feeds");
  await assertCanManageCalendarSubscriptions(session);
  const payload = readSubscriptionPayload(payloadValue);
  const scope = await resolveScope(payload, session);
  const rawToken = createRawToken();
  const parsedToken = parseRawToken(rawToken);
  const token = await privateFeedTokensRepository.create({
    name: normalizeName(payload?.name),
    providerId: PRIVATE_CALENDAR_PROVIDER_ID,
    scopeClientId: scope.clientId,
    scopeProjectId: scope.projectId,
    scopeType: scope.type,
    tokenHash: hashTokenSecret(parsedToken.secret).toString("hex"),
    tokenSelector: parsedToken.selector,
    userId: session.user_id,
    workspaceId: session.workspace_id,
  });
  if (!token) {
    throw new AppError("The calendar subscription could not be created.", 500);
  }
  await recordLifecycleSecurityEvent(session, "security.private_feed.created", "create", scope.type);
  return {
    feedUrl: buildFeedUrl(rawToken, token.name, requestOrigin),
    subscription: toPublicSubscription(token, session),
  };
}

/**
 * @param {unknown} subscriptionId
 * @param {PrivateFeedManagementSession} session
 * @param {string} requestOrigin
 * @returns {Promise<PrivateFeedCreateResponse>}
 */
async function rotateCalendarSubscription(subscriptionId, session, requestOrigin) {
  assertPublicDemoCapabilityAllowed("private_feeds");
  await assertCanManageCalendarSubscriptions(session);
  const current = await readManagedSubscription(subscriptionId, session);
  if (current.user_id !== session.user_id) {
    throw new AppError("Only the subscription owner can rotate this calendar URL.", 403);
  }
  if (current.status !== "active") {
    throw new AppError("The calendar subscription is not active.", 409);
  }
  const eligibility = await readEligibility(current);
  if (!eligibility.allowed) {
    await revokeAutomatically([current], eligibility.reason, session);
    throw new AppError("The calendar subscription is no longer eligible.", 409);
  }

  const rawToken = createRawToken();
  const parsedToken = parseRawToken(rawToken);
  const result = await privateFeedTokensRepository.rotate(
    session.workspace_id,
    current.private_feed_token_id,
    PRIVATE_CALENDAR_PROVIDER_ID,
    parsedToken.selector,
    hashTokenSecret(parsedToken.secret).toString("hex"),
  );
  if (!result.changed || !result.token) {
    throw new AppError("The calendar subscription is not active.", 409);
  }
  await recordLifecycleSecurityEvent(session, "security.private_feed.rotated", "rotate", current.scope_type);
  return {
    feedUrl: buildFeedUrl(rawToken, result.token.name, requestOrigin),
    subscription: toPublicSubscription(result.token, session),
  };
}

/**
 * @param {unknown} subscriptionId
 * @param {PrivateFeedManagementSession} session
 * @returns {Promise<PrivateFeedRemoveResponse>}
 */
async function removeCalendarSubscription(subscriptionId, session) {
  assertPublicDemoCapabilityAllowed("private_feeds");
  await assertCanManageCalendarSubscriptions(session);
  const current = await readManagedSubscription(subscriptionId, session);
  const result = await privateFeedTokensRepository.remove(
    session.workspace_id,
    current.private_feed_token_id,
    PRIVATE_CALENDAR_PROVIDER_ID,
  );
  if (!result.changed) {
    throw new AppError("Calendar subscription not found.", 404);
  }
  const wasActive = current.status === "active";
  await recordLifecycleSecurityEvent(
    session,
    wasActive ? "security.private_feed.revoked" : "security.private_feed.deleted",
    wasActive ? "revoke" : "delete",
    current.scope_type,
  );
  return {
    removed: true,
    subscriptionId: current.private_feed_token_id,
  };
}

/**
 * @param {unknown} rawToken
 * @returns {Promise<string | null>}
 */
async function renderCalendar(rawToken) {
  assertPublicDemoCapabilityAllowed("private_feeds");
  const authentication = await authenticateToken(rawToken, PRIVATE_CALENDAR_PROVIDER_ID);
  if (!authentication) {
    return null;
  }

  const provider = getPrivateFeedProvider(PRIVATE_CALENDAR_PROVIDER_ID);
  if (!provider) {
    throw new Error("The Tasks private calendar feed provider is not registered.");
  }
  const content = await provider.render(Object.freeze({
    providerId: PRIVATE_CALENDAR_PROVIDER_ID,
    session: authentication.session,
    subscription: authentication.subscription,
  }));
  if (content === null) {
    return null;
  }
  if (typeof content !== "string") {
    throw new TypeError(`Private feed provider "${provider.id}" must return a string or null.`);
  }
  return content;
}

/**
 * @param {unknown} rawToken
 * @param {string} providerId
 * @returns {Promise<PrivateFeedAuthentication | null>}
 */
async function authenticateToken(rawToken, providerId) {
  const parsedToken = parseRawToken(rawToken);
  const row = await privateFeedTokensRepository.readForAuthentication(providerId, parsedToken.selector);
  const candidateHash = hashTokenSecret(parsedToken.secret);
  const storedHash = readStoredHash(row?.token_hash);
  const hashMatches = timingSafeEqual(candidateHash, storedHash);
  if (!row || row.status !== "active" || !parsedToken.valid || !hashMatches) {
    return null;
  }

  const eligibility = await readEligibility(row);
  if (!eligibility.allowed) {
    try {
      await revokeAutomatically([row], eligibility.reason);
    } catch {
      console.warn("[private-feeds] Ineligible calendar subscription could not be reconciled during authentication.");
    }
    return null;
  }
  return {
    session: sessionFromToken(row),
    subscription: createPrivateFeedSubscriptionDescriptor({
      name: row.name,
      ownerUserId: row.user_id,
      scope: {
        clientId: row.scope_type === "project"
          ? row.project_client_id
          : row.scope_client_id,
        projectId: row.scope_project_id,
        type: row.scope_type,
      },
      subscriptionId: row.private_feed_token_id,
      workspaceId: row.workspace_id,
    }),
  };
}

/**
 * @param {PrivateFeedReconcileOptions} [options]
 * @returns {Promise<PrivateFeedReconcileResult>}
 */
async function reconcileCalendarSubscriptions(options = {}) {
  try {
    return await reconcileCalendarSubscriptionsUnsafe(options);
  } catch {
    console.warn("[private-feeds] Calendar subscription reconciliation failed.");
    return { failed: true, revokedCount: 0 };
  }
}

/**
 * @param {PrivateFeedReconcileOptions} [options]
 * @returns {Promise<PrivateFeedReconcileResult>}
 */
async function reconcileCalendarSubscriptionsUnsafe({ workspaceId, userId, reason = "entitlement_removed", session } = {}) {
  const rows = await privateFeedTokensRepository.listActive(PRIVATE_CALENDAR_PROVIDER_ID, {
    userId,
    workspaceId,
  });
  /** @type {Map<string, PrivateFeedTokenRow[]>} */
  const invalidByReason = new Map();
  for (const row of rows) {
    const eligibility = await readEligibility(row);
    if (!eligibility.allowed) {
      const invalidReason = eligibility.reason || reason;
      const invalidRows = invalidByReason.get(invalidReason) || [];
      invalidRows.push(row);
      invalidByReason.set(invalidReason, invalidRows);
    }
  }
  let revokedCount = 0;
  for (const [invalidReason, invalidRows] of invalidByReason) {
    revokedCount += await revokeAutomatically(invalidRows, invalidReason, session);
  }
  return { revokedCount };
}

/**
 * @param {PrivateFeedTokenRow} row
 * @returns {Promise<PrivateFeedEligibility>}
 */
async function readEligibility(row) {
  if (row.user_status !== "active") return { allowed: false, reason: "owner_inactive" };
  if (row.membership_status !== "active") return { allowed: false, reason: "membership_inactive" };
  if (String(row.workspace_status || "").toLowerCase() !== "active") return { allowed: false, reason: "workspace_inactive" };
  if (row.tasks_module_status !== "enabled") return { allowed: false, reason: "tasks_module_disabled" };
  if (row.workspace_type !== "business" && row.scope_type === "client") {
    return { allowed: false, reason: "workspace_scope_not_supported" };
  }
  if (row.scope_type === "client" && row.scope_client_status === "Inactive") return { allowed: false, reason: "client_inactive" };
  if (row.scope_type === "project" && row.scope_project_status === "Inactive") return { allowed: false, reason: "project_inactive" };
  if (row.scope_type === "project" && row.project_client_id && row.project_client_status === "Inactive") {
    return { allowed: false, reason: "client_inactive" };
  }
  const allowed = await permissionsService.can(sessionFromToken(row), "tasks.view", permissionResource(row));
  return allowed
    ? { allowed: true, reason: null }
    : { allowed: false, reason: "tasks_permission_removed" };
}

/**
 * @param {PrivateFeedTokenRow[]} rows
 * @param {string} reason
 * @param {PermissionSession} [session]
 * @returns {Promise<number>}
 */
async function revokeAutomatically(rows, reason, session) {
  const result = await privateFeedTokensRepository.revokeMany(
    rows.map((row) => row.private_feed_token_id),
    reason,
  );
  if (result.changed > 0) {
    const workspaceIds = [...new Set(rows.map((row) => row.workspace_id))];
    for (const workspaceId of workspaceIds) {
      await securityEventsService.record({
        eventType: "security.private_feed.automatically_revoked",
        outcome: "success",
        reasonClass: reason,
        metadata: {
          operation: "automatic_revoke",
          reason,
          resource_type: "private_calendar_feed",
          revocation_scope: "calendar_subscription",
        },
        session: session?.workspace_id === workspaceId ? session : undefined,
        workspaceId,
      });
    }
  }
  return result.changed;
}

/**
 * @param {PrivateFeedSubscriptionPayload} payload
 * @param {PrivateFeedManagementSession} session
 * @returns {Promise<PrivateFeedScope>}
 */
async function resolveScope(payload, session) {
  const scopeTypeValue = String(payload?.scopeType || payload?.scope_type || "workspace").trim().toLowerCase();
  if (!VALID_SCOPE_TYPES.has(scopeTypeValue)) {
    throw new AppError("Choose a workspace, client, or project calendar scope.", 400);
  }
  const scopeType = readScopeType(scopeTypeValue);
  if ((await modulesService.readModuleStatus(session.workspace_id, "tasks")) !== "enabled") {
    throw new AppError("Enable the Tasks module before creating a calendar subscription.", 409);
  }
  if (scopeType === "client") {
    const workspace = await workspacesRepository.readById(session.workspace_id);
    if (workspace?.workspace_type !== "business") {
      throw new AppError("Client calendar scope is available only in Business workspaces.", 400);
    }
  }

  /** @type {string | null} */
  let clientId = null;
  /** @type {string | null} */
  let projectId = null;
  if (scopeType === "client") {
    clientId = normalizeRequiredId(payload?.clientId || payload?.client_id, "Choose an active client.");
    const client = await clientsRepository.readById(session.workspace_id, clientId);
    if (!client || client.status === "Inactive") throw new AppError("Choose an active client.", 400);
  }
  if (scopeType === "project") {
    projectId = normalizeRequiredId(payload?.projectId || payload?.project_id, "Choose an active project.");
    const project = await projectsRepository.readById(session.workspace_id, projectId);
    if (!project || project.status === "Inactive") throw new AppError("Choose an active project.", 400);
    clientId = project.client_id || null;
    if (clientId) {
      const client = await clientsRepository.readById(session.workspace_id, clientId);
      if (!client || client.status === "Inactive") throw new AppError("Choose a project with an active client.", 400);
    }
  }
  const resource = {
    client_id: clientId || undefined,
    operation: "read",
    project_id: projectId || undefined,
    workspace_id: session.workspace_id,
  };
  if (!(await permissionsService.can(session, "tasks.view", resource))) {
    throw new AppError("You do not have Tasks access for that calendar scope.", 403);
  }
  return { clientId, projectId, type: scopeType };
}

/**
 * @param {PrivateFeedTokenRow} row
 * @returns {PrivateFeedPermissionResource}
 */
function permissionResource(row) {
  return {
    client_id: row.scope_type === "project"
      ? row.project_client_id || undefined
      : row.scope_client_id || undefined,
    operation: "read",
    project_id: row.scope_project_id || undefined,
    workspace_id: row.workspace_id,
  };
}

/**
 * @param {PrivateFeedTokenRow} row
 * @returns {PrivateFeedAuthorizationSession}
 */
function sessionFromToken(row) {
  return {
    active_workspace_id: row.workspace_id,
    home_workspace_id: row.home_workspace_id,
    ip_address: "",
    session_mode: "private_feed",
    timezone: normalizeTimezone(row.timezone),
    user_id: row.user_id,
    username: row.owner_username,
    workspace_id: row.workspace_id,
    workspace_type: row.workspace_type,
  };
}

/** @param {PrivateFeedManagementSession} session */
async function assertCanManageCalendarSubscriptions(session) {
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    operation: "update",
    workspace_id: session.workspace_id,
  });
}

/**
 * @param {unknown} subscriptionId
 * @param {PrivateFeedManagementSession} session
 * @returns {Promise<PrivateFeedTokenRow>}
 */
async function readManagedSubscription(subscriptionId, session) {
  const normalizedId = String(subscriptionId || "").trim();
  const token = normalizedId && await privateFeedTokensRepository.readById(
    session.workspace_id,
    normalizedId,
    PRIVATE_CALENDAR_PROVIDER_ID,
  );
  if (!token) throw new AppError("Calendar subscription not found.", 404);
  return token;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 120) throw new AppError("Enter a calendar subscription name up to 120 characters.", 400);
  return name;
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {string}
 */
function normalizeRequiredId(value, message) {
  const id = String(value || "").trim();
  if (!id) throw new AppError(message, 400);
  return id;
}

/** @returns {string} */
function createRawToken() {
  const selector = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return `${RAW_TOKEN_PREFIX}_${selector}_${secret}`;
}

/**
 * @param {unknown} value
 * @returns {ParsedPrivateFeedToken}
 */
function parseRawToken(value) {
  const token = String(value || "");
  const match = /^ltf_feed_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/.exec(token);
  return {
    secret: match?.[2] || "invalid-private-feed-secret",
    selector: match?.[1] || "invalid-selector",
    valid: Boolean(match),
  };
}

/**
 * @param {unknown} secret
 * @returns {Buffer}
 */
function hashTokenSecret(secret) {
  return createHash("sha256").update(String(secret || "")).digest();
}

/**
 * @param {unknown} value
 * @returns {Buffer}
 */
function readStoredHash(value) {
  const serializedHash = String(value || "");
  const hash = /^[a-f0-9]{64}$/i.test(serializedHash) ? Buffer.from(serializedHash, "hex") : DUMMY_TOKEN_HASH;
  return hash.length === DUMMY_TOKEN_HASH.length ? hash : DUMMY_TOKEN_HASH;
}

/**
 * @param {string} rawToken
 * @param {unknown} calendarName
 * @param {string} requestOrigin
 * @returns {string}
 */
function buildFeedUrl(rawToken, calendarName, requestOrigin) {
  const baseUrl = String(config.publicUrl || requestOrigin || "").replace(/\/+$/, "");
  if (!baseUrl) throw new AppError("The private calendar feed URL could not be resolved.", 500);
  return `${baseUrl}/feeds/calendar/${encodeURIComponent(rawToken)}/${encodeURI(calendarFeedFilename(calendarName))}.ics`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function calendarFeedFilename(value) {
  const fallback = "Longtail Forge Calendar";
  const name = toWellFormedText(value || fallback)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\?#%[\]]+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  return name || fallback;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toWellFormedText(value) {
  return Array.from(String(value), (character) => (
    character.length === 1 && /[\ud800-\udfff]/.test(character) ? "\ufffd" : character
  )).join("");
}

/**
 * @param {PrivateFeedTokenRow} token
 * @param {PrivateFeedManagementSession} session
 * @returns {PrivateFeedPublicSubscription}
 */
function toPublicSubscription(token, session) {
  return {
    createdAt: token?.created_at || null,
    name: token?.name || "",
    ownedByCurrentUser: token?.user_id === session.user_id,
    owner: {
      displayName: token?.owner_display_name || token?.owner_username || "Unavailable user",
      username: token?.owner_username || "",
    },
    revocationReason: token?.revocation_reason || null,
    revokedAt: token?.revoked_at || null,
    rotatedAt: token?.rotated_at || null,
    scope: {
      label: scopeLabel(token),
      type: token?.scope_type || "workspace",
    },
    status: token?.status || "revoked",
    subscriptionId: token.private_feed_token_id,
    timezone: normalizeTimezone(token?.timezone),
  };
}

/**
 * @param {PrivateFeedTokenRow} token
 * @returns {string}
 */
function scopeLabel(token) {
  if (token?.scope_type === "client") return token.scope_client_name || "Unavailable client";
  if (token?.scope_type === "project") {
    const project = token.scope_project_name || "Unavailable project";
    return token.scope_client_name ? `${token.scope_client_name} / ${project}` : project;
  }
  return "Workspace";
}

/**
 * @param {PrivateFeedManagementSession} session
 * @param {string} eventType
 * @param {string} operation
 * @param {string} scopeType
 */
async function recordLifecycleSecurityEvent(session, eventType, operation, scopeType) {
  await securityEventsService.record({
    eventType,
    outcome: "success",
    reasonClass: `private_feed_${operation}`,
    metadata: {
      operation,
      resource_type: "private_calendar_feed",
      scope: scopeType,
    },
    session,
  });
}

/**
 * @param {unknown} value
 * @returns {PrivateFeedSubscriptionPayload}
 */
function readSubscriptionPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * @param {string} value
 * @returns {import("../types/private-feed-contracts.js").PrivateFeedScopeType}
 */
function readScopeType(value) {
  if (value === "client" || value === "project") return value;
  return "workspace";
}

export const privateFeedsService = {
  createCalendarSubscription,
  listCalendarSubscriptions,
  removeCalendarSubscription,
  reconcileCalendarSubscriptions,
  renderCalendar,
  rotateCalendarSubscription,
};

export { PRIVATE_CALENDAR_PROVIDER_ID };
