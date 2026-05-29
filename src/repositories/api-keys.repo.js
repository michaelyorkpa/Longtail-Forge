import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText } from "../db/index.js";

async function create({ organizationId, createdByUserId, name, keyHash, keyPrefix, scopes }) {
  const apiKeyId = randomUUID();
  const now = new Date().toISOString();
  const scopeInserts = scopes.map((scope) => `
INSERT INTO api_key_scopes (api_key_id, scope)
VALUES (${sqlText(apiKeyId)}, ${sqlText(scope)});
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
INSERT INTO api_keys (
  api_key_id,
  organization_id,
  created_by_user_id,
  name,
  key_hash,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
)
VALUES (
  ${sqlText(apiKeyId)},
  ${sqlText(organizationId)},
  ${sqlText(createdByUserId)},
  ${sqlText(name)},
  ${sqlText(keyHash)},
  ${sqlText(keyPrefix)},
  'active',
  ${sqlText(now)},
  NULL,
  NULL
);
${scopeInserts}
COMMIT;
`);

  return readById(organizationId, apiKeyId);
}

async function readByHash(keyHash) {
  const rows = await querySql(`
SELECT
  api_key_id,
  organization_id,
  created_by_user_id,
  name,
  key_hash,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys
WHERE key_hash = ${sqlText(keyHash)}
LIMIT 1;
`);

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    scopes: await readScopes(rows[0].api_key_id),
  };
}

async function readById(organizationId, apiKeyId) {
  const rows = await querySql(`
SELECT
  api_key_id,
  organization_id,
  created_by_user_id,
  name,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys
WHERE organization_id = ${sqlText(organizationId)}
  AND api_key_id = ${sqlText(apiKeyId)}
LIMIT 1;
`);

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    scopes: await readScopes(rows[0].api_key_id),
  };
}

async function readAll(organizationId) {
  const keys = await querySql(`
SELECT
  api_key_id,
  organization_id,
  created_by_user_id,
  name,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY created_at DESC;
`);
  const scopes = await querySql(`
SELECT api_key_id, scope
FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE organization_id = ${sqlText(organizationId)}
)
ORDER BY scope;
`);
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
  await runSql(`
UPDATE api_keys
SET last_used_at = ${sqlText(new Date().toISOString())}
WHERE api_key_id = ${sqlText(apiKeyId)};
`);
}

async function revoke(organizationId, apiKeyId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE api_keys
SET status = 'revoked',
    revoked_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)}
  AND api_key_id = ${sqlText(apiKeyId)}
  AND status != 'revoked';
`);

  return readById(organizationId, apiKeyId);
}

async function readScopes(apiKeyId) {
  const rows = await querySql(`
SELECT scope
FROM api_key_scopes
WHERE api_key_id = ${sqlText(apiKeyId)}
ORDER BY scope;
`);

  return rows.map((row) => row.scope);
}

export const apiKeysRepository = {
  create,
  readAll,
  readByHash,
  readById,
  revoke,
  updateLastUsed,
};
