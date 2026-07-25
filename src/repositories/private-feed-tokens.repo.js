import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";

async function readForUser(workspaceId, userId, providerId, database = db) {
  return database.get(`
SELECT
  private_feed_token_id,
  workspace_id,
  user_id,
  provider_id,
  status,
  created_at,
  rotated_at,
  disabled_at,
  updated_at
FROM private_feed_tokens
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND provider_id = :providerId
LIMIT 1;
`, { providerId, userId, workspaceId });
}

async function readForAuthentication(providerId, tokenSelector, database = db) {
  return database.get(`
SELECT
  private_feed_tokens.private_feed_token_id,
  private_feed_tokens.workspace_id,
  private_feed_tokens.user_id,
  private_feed_tokens.provider_id,
  private_feed_tokens.token_hash,
  private_feed_tokens.status,
  private_feed_tokens.created_at,
  private_feed_tokens.rotated_at,
  private_feed_tokens.disabled_at,
  users.home_workspace_id,
  users.username,
  users.timezone,
  workspaces.workspace_type
FROM private_feed_tokens
INNER JOIN users
  ON users.user_id = private_feed_tokens.user_id
INNER JOIN workspaces
  ON workspaces.workspace_id = private_feed_tokens.workspace_id
INNER JOIN user_workspaces
  ON user_workspaces.user_id = private_feed_tokens.user_id
  AND user_workspaces.workspace_id = private_feed_tokens.workspace_id
WHERE private_feed_tokens.provider_id = :providerId
  AND private_feed_tokens.token_selector = :tokenSelector
  AND users.user_status = 'active'
  AND user_workspaces.status = 'active'
  AND lower(workspaces.status) = 'active'
LIMIT 1;
`, { providerId, tokenSelector });
}

async function activate({
  allowActiveReplace,
  providerId,
  tokenHash,
  tokenSelector,
  userId,
  workspaceId,
}, database = db) {
  return database.transaction(async (transaction) => {
    const existing = await readForUser(workspaceId, userId, providerId, transaction);
    if (existing?.status === "active" && !allowActiveReplace) {
      return { changed: false, reason: "already_active", token: existing };
    }
    if ((!existing || existing.status !== "active") && allowActiveReplace) {
      return { changed: false, reason: "not_active", token: existing };
    }

    const now = new Date().toISOString();
    if (existing) {
      await transaction.run(`
UPDATE private_feed_tokens
SET token_selector = :tokenSelector,
    token_hash = :tokenHash,
    status = 'active',
    rotated_at = :rotatedAt,
    disabled_at = NULL,
    updated_at = :updatedAt
WHERE private_feed_token_id = :privateFeedTokenId;
`, {
        privateFeedTokenId: existing.private_feed_token_id,
        rotatedAt: now,
        tokenHash,
        tokenSelector,
        updatedAt: now,
      });
    } else {
      await transaction.run(`
INSERT INTO private_feed_tokens (
  private_feed_token_id,
  workspace_id,
  user_id,
  provider_id,
  token_selector,
  token_hash,
  status,
  created_at,
  rotated_at,
  disabled_at,
  updated_at
)
VALUES (
  :privateFeedTokenId,
  :workspaceId,
  :userId,
  :providerId,
  :tokenSelector,
  :tokenHash,
  'active',
  :createdAt,
  NULL,
  NULL,
  :updatedAt
);
`, {
        createdAt: now,
        privateFeedTokenId: randomUUID(),
        providerId,
        tokenHash,
        tokenSelector,
        updatedAt: now,
        userId,
        workspaceId,
      });
    }

    return {
      changed: true,
      reason: existing ? "replaced" : "created",
      token: await readForUser(workspaceId, userId, providerId, transaction),
    };
  });
}

async function disable(workspaceId, userId, providerId, database = db) {
  return database.transaction(async (transaction) => {
    const existing = await readForUser(workspaceId, userId, providerId, transaction);
    if (!existing || existing.status !== "active") {
      return { changed: false, token: existing };
    }

    const now = new Date().toISOString();
    await transaction.run(`
UPDATE private_feed_tokens
SET status = 'disabled',
    disabled_at = :disabledAt,
    updated_at = :updatedAt
WHERE private_feed_token_id = :privateFeedTokenId
  AND status = 'active';
`, {
      disabledAt: now,
      privateFeedTokenId: existing.private_feed_token_id,
      updatedAt: now,
    });

    return {
      changed: true,
      token: await readForUser(workspaceId, userId, providerId, transaction),
    };
  });
}

export const privateFeedTokensRepository = {
  activate,
  disable,
  readForAuthentication,
  readForUser,
};
