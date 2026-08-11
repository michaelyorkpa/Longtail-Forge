// @ts-check
import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";

/** @typedef {import("../types/database-contracts.js").DatabaseAdapter} DatabaseAdapter */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */
/** @typedef {{ private_feed_token_id: string }} PrivateFeedTokenIdRow */

const CALENDAR_SELECT = `
SELECT
  tokens.private_feed_token_id,
  tokens.workspace_id,
  tokens.user_id,
  tokens.provider_id,
  tokens.token_hash,
  tokens.name,
  tokens.scope_type,
  tokens.scope_client_id,
  tokens.scope_project_id,
  tokens.status,
  tokens.revocation_reason,
  tokens.created_at,
  tokens.rotated_at,
  tokens.revoked_at,
  tokens.updated_at,
  users.username AS owner_username,
  users.display_name AS owner_display_name,
  users.user_status,
  users.home_workspace_id,
  users.timezone,
  memberships.status AS membership_status,
  workspaces.status AS workspace_status,
  workspaces.workspace_type,
  tasks_module.status AS tasks_module_status,
  CASE
    WHEN tokens.scope_type = 'project' THEN project_clients.name
    ELSE clients.name
  END AS scope_client_name,
  clients.status AS scope_client_status,
  projects.name AS scope_project_name,
  projects.status AS scope_project_status,
  projects.client_id AS project_client_id,
  project_clients.status AS project_client_status
FROM private_feed_tokens AS tokens
LEFT JOIN users ON users.user_id = tokens.user_id
LEFT JOIN user_workspaces AS memberships
  ON memberships.user_id = tokens.user_id
  AND memberships.workspace_id = tokens.workspace_id
LEFT JOIN workspaces ON workspaces.workspace_id = tokens.workspace_id
LEFT JOIN workspace_modules AS tasks_module
  ON tasks_module.workspace_id = tokens.workspace_id
  AND tasks_module.module_id = 'tasks'
LEFT JOIN clients
  ON clients.workspace_id = tokens.workspace_id
  AND clients.id = tokens.scope_client_id
LEFT JOIN projects
  ON projects.workspace_id = tokens.workspace_id
  AND projects.id = tokens.scope_project_id
LEFT JOIN clients AS project_clients
  ON project_clients.workspace_id = projects.workspace_id
  AND project_clients.id = projects.client_id`;

/**
 * @param {string} workspaceId
 * @param {string} providerId
 * @param {TransactionClient} [database]
 */
async function listForWorkspace(workspaceId, providerId, database = db) {
  return database.query(`${CALENDAR_SELECT}
WHERE tokens.workspace_id = :workspaceId
  AND tokens.provider_id = :providerId
ORDER BY CASE tokens.status WHEN 'active' THEN 0 ELSE 1 END, tokens.created_at DESC, tokens.private_feed_token_id;`, {
    providerId,
    workspaceId,
  });
}

/**
 * @param {string} providerId
 * @param {any} [filters]
 * @param {TransactionClient} [database]
 */
async function listActive(providerId, filters = {}, database = db) {
  const clauses = ["tokens.provider_id = :providerId", "tokens.status = 'active'"];
  const params = { providerId };
  if (filters.workspaceId) {
    clauses.push("tokens.workspace_id = :workspaceId");
    params.workspaceId = filters.workspaceId;
  }
  if (filters.userId) {
    clauses.push("tokens.user_id = :userId");
    params.userId = filters.userId;
  }
  return database.query(`${CALENDAR_SELECT}
WHERE ${clauses.join("\n  AND ")}
ORDER BY tokens.created_at, tokens.private_feed_token_id;`, params);
}

/**
 * @param {string} workspaceId
 * @param {string} subscriptionId
 * @param {string} providerId
 * @param {TransactionClient} [database]
 */
async function readById(workspaceId, subscriptionId, providerId, database = db) {
  return database.get(`${CALENDAR_SELECT}
WHERE tokens.workspace_id = :workspaceId
  AND tokens.private_feed_token_id = :subscriptionId
  AND tokens.provider_id = :providerId
LIMIT 1;`, { providerId, subscriptionId, workspaceId });
}

/**
 * @param {string} providerId
 * @param {string} tokenSelector
 * @param {TransactionClient} [database]
 */
async function readForAuthentication(providerId, tokenSelector, database = db) {
  return database.get(`${CALENDAR_SELECT}
WHERE tokens.provider_id = :providerId
  AND tokens.token_selector = :tokenSelector
  AND tokens.status = 'active'
  AND users.user_status = 'active'
  AND memberships.status = 'active'
  AND lower(workspaces.status) = 'active'
  AND tasks_module.status = 'enabled'
  AND (tokens.scope_type <> 'client' OR clients.status <> 'Inactive')
  AND (tokens.scope_type <> 'project' OR projects.status <> 'Inactive')
  AND (
    tokens.scope_type <> 'project'
    OR projects.client_id IS NULL
    OR project_clients.status <> 'Inactive'
  )
LIMIT 1;`, { providerId, tokenSelector });
}

/**
 * @param {any} input
 * @param {TransactionClient} [database]
 */
async function create({ name, providerId, scopeClientId, scopeProjectId, scopeType, tokenHash, tokenSelector, userId, workspaceId }, database = db) {
  const now = new Date().toISOString();
  const subscriptionId = createRecordId();
  await database.run(`
INSERT INTO private_feed_tokens (
  private_feed_token_id, workspace_id, user_id, provider_id, name, scope_type,
  scope_client_id, scope_project_id, token_selector, token_hash, status,
  revocation_reason, created_at, rotated_at, revoked_at, updated_at
) VALUES (
  :subscriptionId, :workspaceId, :userId, :providerId, :name, :scopeType,
  :scopeClientId, :scopeProjectId, :tokenSelector, :tokenHash, 'active',
  NULL, :now, NULL, NULL, :now
);`, {
    name,
    now,
    providerId,
    scopeClientId,
    scopeProjectId,
    scopeType,
    subscriptionId,
    tokenHash,
    tokenSelector,
    userId,
    workspaceId,
  });
  return readById(workspaceId, subscriptionId, providerId, database);
}

/**
 * @param {string} workspaceId
 * @param {string} subscriptionId
 * @param {string} providerId
 * @param {string} tokenSelector
 * @param {string} tokenHash
 * @param {DatabaseAdapter} [database]
 */
async function rotate(workspaceId, subscriptionId, providerId, tokenSelector, tokenHash, database = db) {
  return database.transaction(async (transaction) => {
    const current = await readById(workspaceId, subscriptionId, providerId, transaction);
    if (!current || current.status !== "active") {
      return { changed: false, token: current };
    }
    const now = new Date().toISOString();
    await transaction.run(`
UPDATE private_feed_tokens
SET token_selector = :tokenSelector,
    token_hash = :tokenHash,
    rotated_at = :now,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND private_feed_token_id = :subscriptionId
  AND provider_id = :providerId
  AND status = 'active';`, { now, providerId, subscriptionId, tokenHash, tokenSelector, workspaceId });
    return {
      changed: true,
      token: await readById(workspaceId, subscriptionId, providerId, transaction),
    };
  });
}

/**
 * @param {string} workspaceId
 * @param {string} subscriptionId
 * @param {string} providerId
 * @param {DatabaseAdapter} [database]
 */
async function remove(workspaceId, subscriptionId, providerId, database = db) {
  return database.transaction(async (transaction) => {
    const current = await readById(workspaceId, subscriptionId, providerId, transaction);
    if (!current) {
      return { changed: false, token: current };
    }
    await transaction.run(`
DELETE FROM private_feed_tokens
WHERE workspace_id = :workspaceId
  AND private_feed_token_id = :subscriptionId
  AND provider_id = :providerId;`, { providerId, subscriptionId, workspaceId });
    return {
      changed: true,
      token: current,
    };
  });
}

/**
 * @param {string[]} subscriptionIds
 * @param {string} reason
 * @param {DatabaseAdapter} [database]
 */
async function revokeMany(subscriptionIds, reason, database = db) {
  if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
    return { changed: 0 };
  }
  return database.transaction(async (transaction) => {
    const current = /** @type {PrivateFeedTokenIdRow[]} */ (await transaction.query(`
SELECT private_feed_token_id
FROM private_feed_tokens
WHERE private_feed_token_id IN (:subscriptionIds)
  AND status = 'active';`, { subscriptionIds }));
    if (current.length === 0) return { changed: 0 };
    const now = new Date().toISOString();
    await transaction.run(`
UPDATE private_feed_tokens
SET status = 'revoked',
    revocation_reason = :reason,
    revoked_at = :now,
    updated_at = :now
WHERE private_feed_token_id IN (:subscriptionIds)
  AND status = 'active';`, {
      now,
      reason,
      subscriptionIds: current.map((row) => row.private_feed_token_id),
    });
    return { changed: current.length };
  });
}

export const privateFeedTokensRepository = {
  create,
  listActive,
  listForWorkspace,
  readById,
  readForAuthentication,
  remove,
  revokeMany,
  rotate,
};
