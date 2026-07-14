#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATABASE_FILE = path.join(root, "data", "longtail-forge.db");
const PERSONAL_OWNER_USERNAME = "michaelyork@raymondtec.com";
const RETAINED_NAMED_WORKSPACES = Object.freeze(["York Family", "York-Lasher", "Raymond Tec"]);

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const databaseFile = path.resolve(options.databaseFile || DEFAULT_DATABASE_FILE);
  assertDatabaseExists(databaseFile);

  if (options.apply && !options.databaseFile) {
    throw new Error("Apply mode requires an explicit --database path.");
  }

  if (options.apply && !options.backupFile) {
    throw new Error("Apply mode requires an explicit --backup path for a new verified pre-cleanup backup.");
  }

  const database = new Database(databaseFile, {
    fileMustExist: true,
    readonly: !options.apply,
  });

  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 10000");
    assertIntegrity(database, "Pre-cleanup database");

    const plan = buildCleanupPlan(database, databaseFile, {
      repairDanglingRetainedRoleAssignments: options.repairDanglingRetainedRoleAssignments,
    });
    const report = {
      action: options.apply ? "apply" : "dry-run",
      backup: null,
      databaseFile,
      plan: publicPlan(plan),
      result: null,
    };

    if (!options.apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (plan.blockingForeignKeyViolations.length > 0) {
      throw new Error(
        `Cleanup refused because ${plan.blockingForeignKeyViolations.length} pre-existing foreign-key violation(s) ` +
        "belong to retained or unscoped data. Review the dry-run report before authorizing any retained-data repair.",
      );
    }

    const backupFile = path.resolve(options.backupFile);
    report.backup = await createAndVerifyBackup(database, databaseFile, backupFile, plan.preCleanupInventoryFingerprint);
    report.result = applyCleanup(database, plan);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    database.close();
  }
}

function buildCleanupPlan(database, databaseFile, options = {}) {
  const retainedWorkspaces = resolveRetainedWorkspaces(database);
  const retainedWorkspaceIds = retainedWorkspaces.map((workspace) => workspace.workspace_id);
  const retainedWorkspaceIdSet = new Set(retainedWorkspaceIds);
  const allWorkspaces = database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at
FROM workspaces
ORDER BY lower(name), workspace_id;
`).all();
  const removalWorkspaces = allWorkspaces.filter((workspace) => !retainedWorkspaceIdSet.has(workspace.workspace_id));
  const schema = readSchema(database);
  const removalWorkspaceIds = readRemovalWorkspaceScopes(database, schema, retainedWorkspaceIds);
  const existingRemovalWorkspaceIdSet = new Set(removalWorkspaces.map((workspace) => workspace.workspace_id));
  const orphanWorkspaceScopes = removalWorkspaceIds.filter((workspaceId) => !existingRemovalWorkspaceIdSet.has(workspaceId));
  const dependentCounts = removalWorkspaces.map((workspace) => ({
    workspace: workspaceSummary(workspace),
    tables: readDependentCounts(database, schema.workspaceTables, workspace.workspace_id),
    usersReferencingWorkspace: countUsersReferencingWorkspace(database, workspace.workspace_id),
    sessionsReferencingWorkspace: countSessionsReferencingWorkspace(database, workspace.workspace_id),
  }));
  const orphanScopeDependentCounts = orphanWorkspaceScopes.map((workspaceId) => ({
    workspace: {
      displayName: "Missing workspace row",
      workspaceId,
    },
    tables: readDependentCounts(database, schema.workspaceTables, workspaceId),
    usersReferencingWorkspace: countUsersReferencingWorkspace(database, workspaceId),
    sessionsReferencingWorkspace: countSessionsReferencingWorkspace(database, workspaceId),
  }));
  const affectedUsers = readAffectedUsers(database, removalWorkspaceIds, retainedWorkspaceIds);
  const removalWorkspaceIdSet = new Set(removalWorkspaceIds);
  const orphanUserIds = affectedUsers
    .filter((user) => Number(user.retained_membership_count) === 0)
    .map((user) => user.user_id);
  const rehomeUsers = affectedUsers
    .filter((user) =>
      Number(user.retained_membership_count) > 0 &&
      (
        removalWorkspaceIdSet.has(user.home_workspace_id) ||
        removalWorkspaceIdSet.has(user.active_workspace_id)
      ),
    )
    .map((user) => ({
      active_workspace_id: user.active_workspace_id,
      fallback_workspace_id: readFallbackRetainedWorkspace(database, user.user_id, retainedWorkspaceIds),
      home_workspace_id: user.home_workspace_id,
      user_id: user.user_id,
      username: user.username,
    }));

  assertNoRetainedWorkspaceReferencesOrphanUsers(
    database,
    schema,
    retainedWorkspaceIds,
    orphanUserIds,
  );
  const foreignKeyViolations = classifyForeignKeyViolations(
    database,
    schema,
    new Set(removalWorkspaceIds),
    new Set(retainedWorkspaceIds),
  );
  const authorizedRoleAssignmentRepairs = options.repairDanglingRetainedRoleAssignments
    ? foreignKeyViolations.filter((violation) => violation.repairableByAuthorizedRoleCleanup)
    : [];
  const authorizedRoleAssignmentIds = authorizedRoleAssignmentRepairs.map((violation) => violation.assignmentId);

  return {
    affectedUsers,
    authorizedRoleAssignmentRepairs,
    databaseFile,
    blockingForeignKeyViolations: foreignKeyViolations.filter((violation) =>
      !violation.removableByWorkspaceCleanup &&
      !(options.repairDanglingRetainedRoleAssignments && violation.repairableByAuthorizedRoleCleanup),
    ),
    dependentCounts: [...dependentCounts, ...orphanScopeDependentCounts],
    foreignKeyViolations,
    orphanUserIds,
    preCleanupInventoryFingerprint: fingerprintWorkspaceInventory(database),
    rehomeUsers,
    removalWorkspaceIds,
    removalWorkspaces,
    orphanWorkspaceScopes,
    retainedFingerprint: fingerprintRetainedWorkspaceData(database, schema, retainedWorkspaceIds),
    retainedFingerprintAfterAuthorizedRepairs: fingerprintRetainedWorkspaceData(
      database,
      schema,
      retainedWorkspaceIds,
      authorizedRoleAssignmentIds,
    ),
    retainedWorkspaceIds,
    retainedWorkspaces,
    schema,
  };
}

function readRemovalWorkspaceScopes(database, schema, retainedWorkspaceIds) {
  const removalIds = new Set(
    database.prepare(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id NOT IN (${placeholders(retainedWorkspaceIds)});
`).all(...retainedWorkspaceIds).map((row) => row.workspace_id),
  );

  for (const table of schema.workspaceTables) {
    const rows = database.prepare(`
SELECT DISTINCT workspace_id
FROM ${quoteIdentifier(table)}
WHERE workspace_id IS NOT NULL
  AND workspace_id NOT IN (${placeholders(retainedWorkspaceIds)});
`).all(...retainedWorkspaceIds);
    rows.forEach((row) => removalIds.add(row.workspace_id));
  }

  return [...removalIds].sort();
}

function resolveRetainedWorkspaces(database) {
  const retained = RETAINED_NAMED_WORKSPACES.map((name) => {
    const matches = database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at
FROM workspaces
WHERE name = ?
ORDER BY workspace_id;
`).all(name);

    if (matches.length !== 1) {
      throw new Error(`Expected exactly one retained workspace named ${JSON.stringify(name)}; found ${matches.length}.`);
    }

    return {
      ...matches[0],
      display_name: matches[0].name,
      resolution: "exact-workspace-name",
    };
  });
  const personalMatches = database.prepare(`
SELECT
  w.workspace_id,
  w.name,
  w.status,
  w.workspace_type,
  w.owner_user_id,
  w.created_at,
  w.updated_at,
  uw.user_workspace_id,
  uw.status AS membership_status,
  u.user_id AS member_user_id,
  u.username AS member_username
FROM workspaces w
INNER JOIN user_workspaces uw ON uw.workspace_id = w.workspace_id
INNER JOIN users u ON u.user_id = uw.user_id
WHERE w.name = 'Personal'
  AND w.workspace_type = 'personal'
  AND lower(u.username) = lower(?)
ORDER BY w.workspace_id, uw.user_workspace_id;
`).all(PERSONAL_OWNER_USERNAME);
  const personalWorkspaceIds = [...new Set(personalMatches.map((row) => row.workspace_id))];

  if (personalWorkspaceIds.length !== 1 || personalMatches.length !== 1) {
    throw new Error(
      `Expected exactly one Personal workspace membership for ${PERSONAL_OWNER_USERNAME}; ` +
      `found ${personalWorkspaceIds.length} workspaces and ${personalMatches.length} memberships.`,
    );
  }

  const personal = personalMatches[0];
  retained.splice(2, 0, {
    workspace_id: personal.workspace_id,
    name: personal.name,
    status: personal.status,
    workspace_type: personal.workspace_type,
    owner_user_id: personal.owner_user_id,
    created_at: personal.created_at,
    updated_at: personal.updated_at,
    display_name: `Personal [${personal.member_username}]`,
    member_user_id: personal.member_user_id,
    member_username: personal.member_username,
    membership_id: personal.user_workspace_id,
    membership_status: personal.membership_status,
    resolution: "personal-membership-username",
  });

  if (new Set(retained.map((workspace) => workspace.workspace_id)).size !== 4) {
    throw new Error("The retained workspace selectors did not resolve to four distinct workspace IDs.");
  }

  return retained;
}

function readSchema(database) {
  const tables = database.prepare(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`).all().map((row) => row.name);
  const columnsByTable = new Map();
  const foreignKeysByTable = new Map();

  for (const table of tables) {
    columnsByTable.set(table, database.prepare(`PRAGMA table_info(${quoteIdentifier(table)});`).all());
    foreignKeysByTable.set(table, database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)});`).all());
  }

  return {
    columnsByTable,
    foreignKeysByTable,
    tables,
    workspaceTables: tables.filter((table) =>
      table !== "workspaces" &&
      columnsByTable.get(table).some((column) => column.name === "workspace_id"),
    ),
  };
}

function readDependentCounts(database, workspaceTables, workspaceId) {
  const counts = {};

  for (const table of workspaceTables) {
    const row = database.prepare(`
SELECT COUNT(1) AS count
FROM ${quoteIdentifier(table)}
WHERE workspace_id = ?;
`).get(workspaceId);
    const count = Number(row?.count) || 0;

    if (count > 0) {
      counts[table] = count;
    }
  }

  return counts;
}

function countUsersReferencingWorkspace(database, workspaceId) {
  const row = database.prepare(`
SELECT COUNT(1) AS count
FROM users
WHERE home_workspace_id = ?
   OR active_workspace_id = ?;
`).get(workspaceId, workspaceId);
  return Number(row?.count) || 0;
}

function countSessionsReferencingWorkspace(database, workspaceId) {
  const row = database.prepare(`
SELECT COUNT(1) AS count
FROM sessions
WHERE home_workspace_id = ?
   OR active_workspace_id = ?;
`).get(workspaceId, workspaceId);
  return Number(row?.count) || 0;
}

function readAffectedUsers(database, removalWorkspaceIds, retainedWorkspaceIds) {
  if (removalWorkspaceIds.length === 0) {
    return [];
  }

  return database.prepare(`
SELECT
  u.user_id,
  u.username,
  u.home_workspace_id,
  u.active_workspace_id,
  SUM(CASE WHEN retained.workspace_id IS NOT NULL THEN 1 ELSE 0 END) AS retained_membership_count
FROM users u
LEFT JOIN user_workspaces retained
  ON retained.user_id = u.user_id
  AND retained.workspace_id IN (${placeholders(retainedWorkspaceIds)})
WHERE u.home_workspace_id IN (${placeholders(removalWorkspaceIds)})
   OR u.active_workspace_id IN (${placeholders(removalWorkspaceIds)})
   OR EXISTS (
     SELECT 1
     FROM user_workspaces removed
     WHERE removed.user_id = u.user_id
       AND removed.workspace_id IN (${placeholders(removalWorkspaceIds)})
   )
GROUP BY u.user_id
ORDER BY lower(u.username), u.user_id;
`).all(...retainedWorkspaceIds, ...removalWorkspaceIds, ...removalWorkspaceIds, ...removalWorkspaceIds);
}

function readFallbackRetainedWorkspace(database, userId, retainedWorkspaceIds) {
  const row = database.prepare(`
SELECT uw.workspace_id
FROM user_workspaces uw
INNER JOIN workspaces w ON w.workspace_id = uw.workspace_id
WHERE uw.user_id = ?
  AND uw.workspace_id IN (${placeholders(retainedWorkspaceIds)})
ORDER BY CASE WHEN uw.status = 'active' THEN 0 ELSE 1 END, lower(w.name), uw.workspace_id
LIMIT 1;
`).get(userId, ...retainedWorkspaceIds);

  if (!row?.workspace_id) {
    throw new Error(`Affected retained user ${userId} has no fallback retained workspace membership.`);
  }

  return row.workspace_id;
}

function assertNoRetainedWorkspaceReferencesOrphanUsers(database, schema, retainedWorkspaceIds, orphanUserIds) {
  if (orphanUserIds.length === 0) {
    return;
  }

  for (const table of ["workspaces", ...schema.workspaceTables]) {
    const userColumns = table === "workspaces"
      ? ["owner_user_id"]
      : schema.foreignKeysByTable.get(table)
        .filter((foreignKey) => foreignKey.table === "users")
        .map((foreignKey) => foreignKey.from);

    for (const column of userColumns) {
      const row = database.prepare(`
SELECT COUNT(1) AS count
FROM ${quoteIdentifier(table)}
WHERE workspace_id IN (${placeholders(retainedWorkspaceIds)})
  AND ${quoteIdentifier(column)} IN (${placeholders(orphanUserIds)});
`).get(...retainedWorkspaceIds, ...orphanUserIds);

      if ((Number(row?.count) || 0) > 0) {
        throw new Error(
          `Cleanup refused because retained ${table}.${column} rows reference a user otherwise eligible for fixture-user removal.`,
        );
      }
    }
  }
}

async function createAndVerifyBackup(database, databaseFile, backupFile, expectedInventoryFingerprint) {
  if (path.resolve(databaseFile) === path.resolve(backupFile)) {
    throw new Error("Backup path must differ from the source database path.");
  }

  if (fs.existsSync(backupFile)) {
    throw new Error(`Backup path already exists; refusing to overwrite ${backupFile}.`);
  }

  await fsPromises.mkdir(path.dirname(backupFile), { recursive: true });
  await database.backup(backupFile);
  const stats = await fsPromises.stat(backupFile);

  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Backup verification failed because ${backupFile} is missing or empty.`);
  }

  const backupDatabase = new Database(backupFile, { fileMustExist: true, readonly: true });

  try {
    assertIntegrity(backupDatabase, "Pre-cleanup backup");
    const backupFingerprint = fingerprintWorkspaceInventory(backupDatabase);

    if (backupFingerprint !== expectedInventoryFingerprint) {
      throw new Error("Backup verification failed because its workspace and membership inventory differs from the source database.");
    }

    return {
      file: backupFile,
      inventoryFingerprint: backupFingerprint,
      sizeBytes: stats.size,
      verified: true,
    };
  } finally {
    backupDatabase.close();
  }
}

function applyCleanup(database, plan) {
  if (plan.blockingForeignKeyViolations.length > 0) {
    throw new Error(
      `Cleanup refused because ${plan.blockingForeignKeyViolations.length} pre-existing foreign-key violation(s) ` +
      "belong to retained or unscoped data. Review the dry-run report before authorizing any retained-data repair.",
    );
  }

  database.exec("BEGIN IMMEDIATE;");

  try {
    database.pragma("defer_foreign_keys = ON");
    const deletionCounts = {};

    if (plan.authorizedRoleAssignmentRepairs.length > 0) {
      const assignmentIds = plan.authorizedRoleAssignmentRepairs.map((repair) => repair.assignmentId);
      deletionCounts.authorized_dangling_user_role_assignments = database.prepare(`
DELETE FROM user_role_assignments
WHERE assignment_id IN (${placeholders(assignmentIds)});
`).run(...assignmentIds).changes;

      if (deletionCounts.authorized_dangling_user_role_assignments !== assignmentIds.length) {
        throw new Error("Authorized dangling role-assignment repair count changed before apply; rolling back.");
      }
    }

    if (plan.removalWorkspaceIds.length > 0) {
      deletionCounts.api_key_scopes = database.prepare(`
DELETE FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
);
`).run(...plan.removalWorkspaceIds).changes;

      for (const table of orderWorkspaceTablesForDeletion(plan.schema.workspaceTables)) {
        deletionCounts[table] = database.prepare(`
DELETE FROM ${quoteIdentifier(table)}
WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)});
`).run(...plan.removalWorkspaceIds).changes;
      }

      deletionCounts.sessions = database.prepare(`
DELETE FROM sessions
WHERE home_workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
   OR active_workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
   ${plan.orphanUserIds.length > 0 ? `OR user_id IN (${placeholders(plan.orphanUserIds)})` : ""};
`).run(...plan.removalWorkspaceIds, ...plan.removalWorkspaceIds, ...plan.orphanUserIds).changes;

      for (const user of plan.rehomeUsers) {
        database.prepare(`
UPDATE users
SET home_workspace_id = CASE
      WHEN home_workspace_id IN (${placeholders(plan.removalWorkspaceIds)}) THEN ?
      ELSE home_workspace_id
    END,
    active_workspace_id = CASE
      WHEN active_workspace_id IN (${placeholders(plan.removalWorkspaceIds)}) THEN ?
      ELSE active_workspace_id
    END
WHERE user_id = ?;
`).run(
          ...plan.removalWorkspaceIds,
          user.fallback_workspace_id,
          ...plan.removalWorkspaceIds,
          user.fallback_workspace_id,
          user.user_id,
        );
      }

      if (plan.orphanUserIds.length > 0) {
        deletionCounts.user_workspace_creation_permissions = database.prepare(`
DELETE FROM user_workspace_creation_permissions
WHERE user_id IN (${placeholders(plan.orphanUserIds)});
`).run(...plan.orphanUserIds).changes;
        deletionCounts.users = database.prepare(`
DELETE FROM users
WHERE user_id IN (${placeholders(plan.orphanUserIds)});
`).run(...plan.orphanUserIds).changes;
      }

      deletionCounts.workspaces = database.prepare(`
DELETE FROM workspaces
WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)});
`).run(...plan.removalWorkspaceIds).changes;
    }

    const retainedAfter = resolveRetainedWorkspaces(database);
    const retainedFingerprintAfter = fingerprintRetainedWorkspaceData(
      database,
      plan.schema,
      plan.retainedWorkspaceIds,
    );

    if (
      retainedAfter.length !== 4 ||
      retainedFingerprintAfter !== plan.retainedFingerprintAfterAuthorizedRepairs
    ) {
      throw new Error("Retained workspace data, memberships, roles, settings, or ownership changed during cleanup; rolling back.");
    }

    const remainingWorkspaceCount = Number(database.prepare("SELECT COUNT(1) AS count FROM workspaces;").get()?.count) || 0;

    if (remainingWorkspaceCount !== 4) {
      throw new Error(`Cleanup expected four remaining workspaces but found ${remainingWorkspaceCount}; rolling back.`);
    }

    assertHealthyDatabase(database, "Post-cleanup database");
    database.exec("COMMIT;");

    return {
      deletionCounts: Object.fromEntries(Object.entries(deletionCounts).filter(([, count]) => count > 0)),
      foreignKeyCheck: "ok",
      integrityCheck: "ok",
      removedWorkspaceCount: plan.removalWorkspaceIds.length,
      repairedDanglingRoleAssignmentCount: plan.authorizedRoleAssignmentRepairs.length,
      remainingWorkspaces: retainedAfter.map(workspaceSummary),
      retainedFingerprint: retainedFingerprintAfter,
      retainedWorkspaceCount: retainedAfter.length,
    };
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function fingerprintRetainedWorkspaceData(
  database,
  schema,
  retainedWorkspaceIds,
  excludedRoleAssignmentIds = [],
) {
  const hash = createHash("sha256");

  for (const table of ["workspaces", ...schema.workspaceTables].sort()) {
    const exclusionSql = table === "user_role_assignments" && excludedRoleAssignmentIds.length > 0
      ? `AND assignment_id NOT IN (${placeholders(excludedRoleAssignmentIds)})`
      : "";
    const rows = database.prepare(`
SELECT *
FROM ${quoteIdentifier(table)}
WHERE workspace_id IN (${placeholders(retainedWorkspaceIds)})
  ${exclusionSql}
ORDER BY workspace_id, rowid;
`).iterate(...retainedWorkspaceIds, ...(
      table === "user_role_assignments" ? excludedRoleAssignmentIds : []
    ));

    hash.update(`${table}\n`);
    for (const row of rows) {
      hash.update(`${JSON.stringify(row)}\n`);
    }
  }

  const apiKeyScopes = database.prepare(`
SELECT scopes.*
FROM api_key_scopes scopes
INNER JOIN api_keys keys ON keys.api_key_id = scopes.api_key_id
WHERE keys.workspace_id IN (${placeholders(retainedWorkspaceIds)})
ORDER BY scopes.api_key_id, scopes.scope;
`).iterate(...retainedWorkspaceIds);

  hash.update("api_key_scopes\n");
  for (const row of apiKeyScopes) {
    hash.update(`${JSON.stringify(row)}\n`);
  }

  return hash.digest("hex");
}

function fingerprintWorkspaceInventory(database) {
  const workspaces = database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id
FROM workspaces
ORDER BY workspace_id;
`).all();
  const memberships = database.prepare(`
SELECT user_workspace_id, user_id, workspace_id, status
FROM user_workspaces
ORDER BY user_workspace_id;
`).all();
  return createHash("sha256").update(JSON.stringify([workspaces, memberships])).digest("hex");
}

function assertIntegrity(database, label) {
  const integrityRows = database.pragma("integrity_check");

  if (integrityRows.length !== 1 || String(integrityRows[0]?.integrity_check || "").toLowerCase() !== "ok") {
    throw new Error(`${label} failed PRAGMA integrity_check.`);
  }
}

function assertHealthyDatabase(database, label) {
  assertIntegrity(database, label);
  const foreignKeyRows = database.pragma("foreign_key_check");

  if (foreignKeyRows.length > 0) {
    throw new Error(`${label} failed PRAGMA foreign_key_check with ${foreignKeyRows.length} violation(s).`);
  }
}

function publicPlan(plan) {
  return {
    affectedUsers: plan.affectedUsers.map((user) => ({
      active_workspace_id: user.active_workspace_id,
      home_workspace_id: user.home_workspace_id,
      retained_membership_count: Number(user.retained_membership_count) || 0,
      user_id: user.user_id,
      username: user.username,
    })),
    authorizedRoleAssignmentRepairs: plan.authorizedRoleAssignmentRepairs,
    dependentCounts: plan.dependentCounts,
    blockingForeignKeyViolations: plan.blockingForeignKeyViolations,
    foreignKeyViolations: plan.foreignKeyViolations,
    orphanUserIds: plan.orphanUserIds,
    orphanWorkspaceScopes: plan.orphanWorkspaceScopes,
    removalWorkspaceCount: plan.removalWorkspaces.length,
    removalWorkspaces: plan.removalWorkspaces.map(workspaceSummary),
    retainedWorkspaceCount: plan.retainedWorkspaces.length,
    retainedWorkspaces: plan.retainedWorkspaces.map(workspaceSummary),
    userRehomes: plan.rehomeUsers,
  };
}

function classifyForeignKeyViolations(database, schema, removalWorkspaceIds, retainedWorkspaceIds) {
  return database.pragma("foreign_key_check").map((violation) => {
    const columns = schema.columnsByTable.get(violation.table) || [];
    const hasWorkspaceId = columns.some((column) => column.name === "workspace_id");
    const row = hasWorkspaceId
      ? database.prepare(`
SELECT workspace_id
FROM ${quoteIdentifier(violation.table)}
WHERE rowid = ?;
`).get(violation.rowid)
      : null;
    const workspaceId = row?.workspace_id || null;
    const roleAssignment = violation.table === "user_role_assignments"
      ? database.prepare(`
SELECT assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id
FROM user_role_assignments
WHERE rowid = ?;
`).get(violation.rowid)
      : null;
    const referencedUserExists = roleAssignment
      ? Boolean(database.prepare("SELECT 1 FROM users WHERE user_id = ?;").get(roleAssignment.user_id))
      : true;
    const repairableByAuthorizedRoleCleanup = Boolean(
      roleAssignment &&
      violation.parent === "users" &&
      retainedWorkspaceIds.has(workspaceId) &&
      !referencedUserExists
    );

    return {
      assignmentId: roleAssignment?.assignment_id || undefined,
      foreignKeyId: violation.fkid,
      parentTable: violation.parent,
      repairableByAuthorizedRoleCleanup,
      removableByWorkspaceCleanup: Boolean(workspaceId && removalWorkspaceIds.has(workspaceId)),
      roleId: roleAssignment?.role_id || undefined,
      rowid: violation.rowid,
      scopeId: roleAssignment?.scope_id || undefined,
      scopeType: roleAssignment?.scope_type || undefined,
      table: violation.table,
      userId: roleAssignment?.user_id || undefined,
      workspaceId,
    };
  });
}

function workspaceSummary(workspace) {
  return {
    displayName: workspace.display_name || workspace.name,
    membershipId: workspace.membership_id || undefined,
    ownerUserId: workspace.owner_user_id || null,
    resolution: workspace.resolution || undefined,
    status: workspace.status,
    workspaceId: workspace.workspace_id,
    workspaceType: workspace.workspace_type,
  };
}

function orderWorkspaceTablesForDeletion(workspaceTables) {
  return [...workspaceTables].sort((left, right) => {
    if (left === "search_index_fts") {
      return -1;
    }
    if (right === "search_index_fts") {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function placeholders(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("A non-empty value list is required for cleanup SQL.");
  }
  return values.map(() => "?").join(", ");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function assertDatabaseExists(databaseFile) {
  if (!fs.existsSync(databaseFile) || !fs.statSync(databaseFile).isFile()) {
    throw new Error(`Database file does not exist: ${databaseFile}`);
  }
}

function parseArgs(values) {
  const options = {
    apply: false,
    backupFile: "",
    databaseFile: "",
    help: false,
    repairDanglingRetainedRoleAssignments: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--apply") {
      options.apply = true;
    } else if (value === "--database") {
      options.databaseFile = String(values[index + 1] || "").trim();
      index += 1;
    } else if (value === "--backup") {
      options.backupFile = String(values[index + 1] || "").trim();
      index += 1;
    } else if (value === "--repair-dangling-retained-role-assignments") {
      options.repairDanglingRetainedRoleAssignments = true;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown cleanup option: ${value}`);
    }
  }

  return options;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/cleanup-development-workspaces.mjs [--database <sqlite-file>]",
    "  node scripts/cleanup-development-workspaces.mjs --apply --database <sqlite-file> --backup <new-backup-file> [--repair-dangling-retained-role-assignments]",
    "",
    "Without --apply the command is read-only and prints the retained/removal inventory plus dependent counts.",
    "Apply mode requires an explicit database path and creates and verifies a new backup before one transactional cleanup.",
    "The retained-role repair flag only removes reported assignments whose user row no longer exists.",
  ].join("\n"));
}
