import { db } from "../core/database.js";

const CLEANUP_BATCH_SIZE = 500;
const UPSERT_SQL = db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: [
    "scope",
    "dimension",
    "key_hash",
    "failure_count",
    "window_expires_at",
    "locked_until",
    "expires_at",
    "created_at",
    "updated_at",
  ],
  conflictColumns: ["scope", "dimension", "key_hash"],
  tableName: "authentication_throttle_entries",
  updateColumns: [
    "failure_count",
    "window_expires_at",
    "locked_until",
    "expires_at",
    "updated_at",
  ],
  valueExpressions: {
    scope: ":scope",
    dimension: ":dimension",
    key_hash: ":keyHash",
    failure_count: ":failureCount",
    window_expires_at: ":windowExpiresAt",
    locked_until: ":lockedUntil",
    expires_at: ":expiresAt",
    created_at: ":createdAt",
    updated_at: ":updatedAt",
  },
});

async function readEntries(keys, now, database = db) {
  return database.transaction(async (transaction) => {
    await pruneExpired(now, transaction);
    const rows = [];
    for (const key of keys) {
      const row = await readEntry(key, transaction);
      if (row && Number(row.expires_at) > now) {
        rows.push(row);
      }
    }
    return rows;
  });
}

async function recordFailures({
  failureLimit,
  keys,
  lockoutMilliseconds,
  now,
  trackedKeyLimit,
  windowMilliseconds,
}, database = db) {
  return database.transaction(async (transaction) => {
    await pruneExpired(now, transaction);
    const timestamp = new Date(now).toISOString();
    const results = [];

    for (const key of keys) {
      const existing = await readEntry(key, transaction);
      const windowActive = Number(existing?.window_expires_at || 0) > now;
      const previousLockActive = Number(existing?.locked_until || 0) > now;
      const failureCount = windowActive ? Number(existing.failure_count || 0) + 1 : 1;
      const windowExpiresAt = windowActive
        ? Number(existing.window_expires_at)
        : now + windowMilliseconds;
      const newlyLocked = !previousLockActive && failureCount >= failureLimit;
      const lockedUntil = previousLockActive
        ? Number(existing.locked_until)
        : newlyLocked
          ? now + lockoutMilliseconds
          : 0;
      const expiresAt = Math.max(windowExpiresAt, lockedUntil);

      await transaction.run(UPSERT_SQL, {
        createdAt: existing?.created_at || timestamp,
        dimension: key.dimension,
        expiresAt,
        failureCount,
        keyHash: key.keyHash,
        lockedUntil,
        scope: key.scope,
        updatedAt: timestamp,
        windowExpiresAt,
      });
      results.push({
        dimension: key.dimension,
        failureCount,
        lockedUntil,
        newlyLocked,
      });
    }

    await enforceTrackedKeyLimit({
      currentKeys: keys,
      now,
      trackedKeyLimit,
    }, transaction);
    return results;
  });
}

async function removeEntries(keys, database = db) {
  return database.transaction(async (transaction) => {
    for (const key of keys) {
      await removeEntry(key, transaction);
    }
  });
}

async function clear(database = db) {
  await database.run("DELETE FROM authentication_throttle_entries;");
}

async function cleanup(now, database = db) {
  return database.transaction((transaction) => pruneExpired(now, transaction));
}

async function readEntry(key, database) {
  return database.get(`
SELECT
  scope,
  dimension,
  key_hash,
  failure_count,
  window_expires_at,
  locked_until,
  expires_at,
  created_at,
  updated_at
FROM authentication_throttle_entries
WHERE scope = :scope
  AND dimension = :dimension
  AND key_hash = :keyHash
LIMIT 1;
`, keyBindings(key));
}

async function removeEntry(key, database) {
  await database.run(`
DELETE FROM authentication_throttle_entries
WHERE scope = :scope
  AND dimension = :dimension
  AND key_hash = :keyHash;
`, keyBindings(key));
}

async function pruneExpired(now, database) {
  const expired = await database.query(`
SELECT scope, dimension, key_hash
FROM authentication_throttle_entries
WHERE expires_at <= :now
ORDER BY expires_at, updated_at
LIMIT :limit;
`, { limit: CLEANUP_BATCH_SIZE, now });
  for (const row of expired) {
    await removeEntry({
      dimension: row.dimension,
      keyHash: row.key_hash,
      scope: row.scope,
    }, database);
  }
  return expired.length;
}

async function enforceTrackedKeyLimit({ currentKeys, now, trackedKeyLimit }, database) {
  const countRow = await database.get(`
SELECT COUNT(1) AS count
FROM authentication_throttle_entries;
`);
  let overflow = Math.max(0, Number(countRow?.count || 0) - trackedKeyLimit);
  if (overflow === 0) {
    return;
  }

  const protectedKeys = new Set(currentKeys.map(keyIdentity));
  const candidates = await database.query(`
SELECT scope, dimension, key_hash
FROM authentication_throttle_entries
WHERE locked_until <= :now
ORDER BY updated_at, expires_at
LIMIT :limit;
`, {
    limit: overflow + protectedKeys.size,
    now,
  });
  for (const row of candidates) {
    const key = {
      dimension: row.dimension,
      keyHash: row.key_hash,
      scope: row.scope,
    };
    if (overflow > 0 && !protectedKeys.has(keyIdentity(key))) {
      await removeEntry(key, database);
      overflow -= 1;
    }
  }
}

function keyBindings(key) {
  return {
    dimension: key.dimension,
    keyHash: key.keyHash,
    scope: key.scope,
  };
}

function keyIdentity(key) {
  return `${key.scope}:${key.dimension}:${key.keyHash}`;
}

export const authenticationThrottleRepository = {
  cleanup,
  clear,
  readEntries,
  recordFailures,
  removeEntries,
};
