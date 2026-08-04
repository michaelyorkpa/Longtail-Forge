import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";

const API_KEY_COLUMNS = [
  "api_key_id",
  "workspace_id",
  "created_by_user_id",
  "name",
  "key_hash",
  "key_prefix",
  "status",
  "created_at",
  "last_used_at",
  "revoked_at",
];
const API_KEY_INSERT_SQL = `
INSERT INTO api_keys (
  ${API_KEY_COLUMNS.join(",\n  ")}
)
VALUES (
  :apiKeyId,
  :workspaceId,
  :createdByUserId,
  :name,
  :keyHash,
  :keyPrefix,
  :status,
  :createdAt,
  NULL,
  NULL
);
`;

async function create({ workspaceId, createdByUserId, name, keyHash, keyPrefix, scopes }) {
  const apiKeyId = createRecordId();
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(API_KEY_INSERT_SQL, {
      apiKeyId,
      createdAt: now,
      createdByUserId: text(createdByUserId),
      keyHash: text(keyHash),
      keyPrefix: text(keyPrefix),
      name: text(name),
      status: "active",
      workspaceId: text(workspaceId),
    });

    for (const scope of scopes) {
      await transaction.run(`
INSERT INTO api_key_scopes (api_key_id, scope)
VALUES (:apiKeyId, :scope);
`, {
        apiKeyId,
        scope: text(scope),
      });
    }
  });

  return readById(workspaceId, apiKeyId);
}

async function readByHash(keyHash) {
  const row = await db.get(`
SELECT
  api_keys.api_key_id,
  api_keys.workspace_id,
  api_keys.created_by_user_id,
  api_keys.name,
  api_keys.key_hash,
  api_keys.key_prefix,
  api_keys.status,
  api_keys.created_at,
  api_keys.last_used_at,
  api_keys.revoked_at
FROM api_keys
INNER JOIN workspaces ON workspaces.workspace_id = api_keys.workspace_id
WHERE key_hash = :keyHash
  AND lower(workspaces.status) = 'active'
LIMIT 1;
`, { keyHash: text(keyHash) });

  if (!row) {
    return null;
  }

  return {
    ...row,
    scopes: await readScopes(row.api_key_id),
  };
}

async function readById(workspaceId, apiKeyId) {
  const row = await db.get(`
SELECT
  api_key_id,
  workspace_id,
  created_by_user_id,
  name,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys
WHERE workspace_id = :workspaceId
  AND api_key_id = :apiKeyId
LIMIT 1;
`, {
    apiKeyId: text(apiKeyId),
    workspaceId: text(workspaceId),
  });

  if (!row) {
    return null;
  }

  return {
    ...row,
    scopes: await readScopes(row.api_key_id),
  };
}

async function readAll(workspaceId) {
  const keys = await db.query(`
SELECT
  api_key_id,
  workspace_id,
  created_by_user_id,
  name,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys
WHERE workspace_id = :workspaceId
ORDER BY created_at DESC;
`, { workspaceId: text(workspaceId) });
  const scopes = await db.query(`
SELECT api_key_id, scope
FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE workspace_id = :workspaceId
)
ORDER BY scope;
`, { workspaceId: text(workspaceId) });
  const scopesByKeyId = scopes.reduce((map, row) => {
    if (!map.has(row.api_key_id)) {
      map.set(row.api_key_id, []);
    }

    map.get(row.api_key_id).push(row.scope);
    return map;
  }, new Map());

  return keys.map((key) => ({
    ...key,
    scopes: scopesByKeyId.get(key.api_key_id) || [],
  }));
}

async function updateLastUsed(apiKeyId) {
  await db.run(`
UPDATE api_keys
SET last_used_at = :lastUsedAt
WHERE api_key_id = :apiKeyId;
`, {
    apiKeyId: text(apiKeyId),
    lastUsedAt: new Date().toISOString(),
  });
}

async function revoke(workspaceId, apiKeyId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE api_keys
SET status = 'revoked',
    revoked_at = :revokedAt
WHERE workspace_id = :workspaceId
  AND api_key_id = :apiKeyId
  AND status != 'revoked';
`, {
    apiKeyId: text(apiKeyId),
    revokedAt: now,
    workspaceId: text(workspaceId),
  });

  return readById(workspaceId, apiKeyId);
}

async function readScopes(apiKeyId) {
  const rows = await db.query(`
SELECT scope
FROM api_key_scopes
WHERE api_key_id = :apiKeyId
ORDER BY scope;
`, { apiKeyId: text(apiKeyId) });

  return rows.map((row) => row.scope);
}

function text(value) {
  return String(value ?? "");
}

export const apiKeysRepository = {
  create,
  readAll,
  readByHash,
  readById,
  revoke,
  updateLastUsed,
};
