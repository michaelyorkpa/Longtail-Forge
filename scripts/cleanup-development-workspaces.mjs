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

/**
 * An open better-sqlite3 handle for a development workspace database.
 * @typedef {InstanceType<typeof Database>} DatabaseHandle
 */

/**
 * A prepared statement re-typed for streaming row iteration.
 * @typedef {ReturnType<DatabaseHandle["prepare"]> & { iterate: (...bindings: unknown[]) => Iterable<Record<string, unknown>> }} IterableStatement
 */

/**
 * The mutation summary better-sqlite3 reports for one executed statement.
 * @typedef {{ changes: number }} StatementRunResult
 */

/**
 * Parsed cleanup command-line options.
 * @typedef {object} CleanupOptions
 * @property {boolean} apply
 * @property {string} backupFile
 * @property {string} databaseFile
 * @property {boolean} help
 * @property {boolean} repairDanglingRetainedRoleAssignments
 */

/**
 * One workspace inventory record, optionally carrying retained-selector detail.
 * @typedef {object} WorkspaceInventoryRow
 * @property {string} workspace_id
 * @property {string} name
 * @property {string} status
 * @property {string} workspace_type
 * @property {string | null} owner_user_id
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} [display_name]
 * @property {string} [member_user_id]
 * @property {string} [member_username]
 * @property {string} [membership_id]
 * @property {string} [membership_status]
 * @property {string} [resolution]
 */

/**
 * One Personal workspace membership row resolved by the confirmed owner username.
 * @typedef {WorkspaceInventoryRow & { user_workspace_id: string, membership_status: string, member_user_id: string, member_username: string }} PersonalWorkspaceMembershipRow
 */

/**
 * A bare workspace identifier row.
 * @typedef {{ workspace_id: string }} WorkspaceIdRow
 */

/**
 * One PRAGMA table_info column row.
 * @typedef {{ name: string }} TableColumnRow
 */

/**
 * One PRAGMA foreign_key_list row.
 * @typedef {{ from: string, table: string }} TableForeignKeyRow
 */

/**
 * One PRAGMA foreign_key_check violation row.
 * @typedef {{ fkid: number, parent: string, rowid: number, table: string }} ForeignKeyCheckRow
 */

/**
 * One PRAGMA integrity_check result row.
 * @typedef {{ integrity_check?: string }} IntegrityCheckRow
 */

/**
 * One user touched by the pending workspace removals.
 * @typedef {object} AffectedUserRow
 * @property {string} user_id
 * @property {string} username
 * @property {string | null} home_workspace_id
 * @property {string | null} active_workspace_id
 * @property {unknown} retained_membership_count
 */

/**
 * The redacted affected-user projection printed in the plan.
 * @typedef {object} PublicAffectedUser
 * @property {string | null} active_workspace_id
 * @property {string | null} home_workspace_id
 * @property {number} retained_membership_count
 * @property {string} user_id
 * @property {string} username
 */

/**
 * One retained user whose home or active workspace must be re-pointed.
 * @typedef {object} RehomeUserRecord
 * @property {string | null} active_workspace_id
 * @property {string} fallback_workspace_id
 * @property {string | null} home_workspace_id
 * @property {string} user_id
 * @property {string} username
 */

/**
 * One user_role_assignments row read while classifying a violation.
 * @typedef {object} RoleAssignmentViolationRow
 * @property {string} assignment_id
 * @property {string} user_id
 * @property {string} role_id
 * @property {string} scope_id
 * @property {string} scope_type
 */

/**
 * One classified pre-existing foreign-key violation.
 * @typedef {object} ForeignKeyViolationRecord
 * @property {string | undefined} assignmentId
 * @property {number} foreignKeyId
 * @property {string} parentTable
 * @property {boolean} repairableByAuthorizedRoleCleanup
 * @property {boolean} removableByWorkspaceCleanup
 * @property {string | undefined} roleId
 * @property {number} rowid
 * @property {string | undefined} scopeId
 * @property {string | undefined} scopeType
 * @property {string} table
 * @property {string | undefined} userId
 * @property {string | null} workspaceId
 */

/**
 * The reported identity of one workspace in a plan or result.
 * @typedef {object} WorkspaceSummary
 * @property {string} displayName
 * @property {string | undefined} membershipId
 * @property {string | null} ownerUserId
 * @property {string | undefined} resolution
 * @property {string} status
 * @property {string} workspaceId
 * @property {string} workspaceType
 */

/**
 * Dependent row counts reported for one workspace scope.
 * @typedef {object} DependentCountRecord
 * @property {WorkspaceSummary | { displayName: string, workspaceId: string }} workspace
 * @property {Record<string, number>} tables
 * @property {number} usersReferencingWorkspace
 * @property {number} sessionsReferencingWorkspace
 */

/**
 * The reflected schema surface the cleanup plan walks.
 * @typedef {object} CleanupSchema
 * @property {Map<string, TableColumnRow[]>} columnsByTable
 * @property {Map<string, TableForeignKeyRow[]>} foreignKeysByTable
 * @property {string[]} tables
 * @property {string[]} workspaceTables
 */

/**
 * The complete deletion plan built before the first destructive statement runs.
 * @typedef {object} CleanupPlan
 * @property {AffectedUserRow[]} affectedUsers
 * @property {ForeignKeyViolationRecord[]} authorizedRoleAssignmentRepairs
 * @property {string} databaseFile
 * @property {ForeignKeyViolationRecord[]} blockingForeignKeyViolations
 * @property {DependentCountRecord[]} dependentCounts
 * @property {ForeignKeyViolationRecord[]} foreignKeyViolations
 * @property {string[]} orphanUserIds
 * @property {string} preCleanupInventoryFingerprint
 * @property {RehomeUserRecord[]} rehomeUsers
 * @property {string[]} removalWorkspaceIds
 * @property {WorkspaceInventoryRow[]} removalWorkspaces
 * @property {string[]} orphanWorkspaceScopes
 * @property {string} retainedFingerprint
 * @property {string} retainedFingerprintAfterAuthorizedRepairs
 * @property {string[]} retainedWorkspaceIds
 * @property {WorkspaceInventoryRow[]} retainedWorkspaces
 * @property {CleanupSchema} schema
 */

/**
 * The redacted plan projection printed in every report.
 * @typedef {object} PublicCleanupPlan
 * @property {PublicAffectedUser[]} affectedUsers
 * @property {ForeignKeyViolationRecord[]} authorizedRoleAssignmentRepairs
 * @property {DependentCountRecord[]} dependentCounts
 * @property {ForeignKeyViolationRecord[]} blockingForeignKeyViolations
 * @property {ForeignKeyViolationRecord[]} foreignKeyViolations
 * @property {string[]} orphanUserIds
 * @property {string[]} orphanWorkspaceScopes
 * @property {number} removalWorkspaceCount
 * @property {WorkspaceSummary[]} removalWorkspaces
 * @property {number} retainedWorkspaceCount
 * @property {WorkspaceSummary[]} retainedWorkspaces
 * @property {RehomeUserRecord[]} userRehomes
 */

/**
 * The verified pre-cleanup backup record.
 * @typedef {object} BackupRecord
 * @property {string} file
 * @property {string} inventoryFingerprint
 * @property {number} sizeBytes
 * @property {boolean} verified
 */

/**
 * The applied-cleanup outcome recorded once the transaction commits.
 * @typedef {object} CleanupResult
 * @property {Record<string, number>} deletionCounts
 * @property {string} foreignKeyCheck
 * @property {string} integrityCheck
 * @property {number} removedWorkspaceCount
 * @property {number} repairedDanglingRoleAssignmentCount
 * @property {WorkspaceSummary[]} remainingWorkspaces
 * @property {string} retainedFingerprint
 * @property {number} retainedWorkspaceCount
 */

/**
 * The report document printed for both dry-run and apply modes.
 * @typedef {object} CleanupReport
 * @property {"apply" | "dry-run"} action
 * @property {BackupRecord | null} backup
 * @property {string} databaseFile
 * @property {PublicCleanupPlan} plan
 * @property {CleanupResult | null} result
 */

try {
  await main();
} catch (error) {
  console.error(/** @type {{ message?: unknown }} */ (error)?.message || error);
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
    /** @type {CleanupReport} */
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

/**
 * Build the retained/removal cleanup plan for one database.
 * @param {DatabaseHandle} database
 * @param {string} databaseFile
 * @param {{ repairDanglingRetainedRoleAssignments?: boolean }} [options]
 * @returns {CleanupPlan}
 */
function buildCleanupPlan(database, databaseFile, options = {}) {
  const retainedWorkspaces = resolveRetainedWorkspaces(database);
  const retainedWorkspaceIds = retainedWorkspaces.map((workspace) => workspace.workspace_id);
  const retainedWorkspaceIdSet = new Set(retainedWorkspaceIds);
  const allWorkspaces = /** @type {WorkspaceInventoryRow[]} */ (database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at
FROM workspaces
ORDER BY lower(name), workspace_id;
`).all());
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
        removalWorkspaceIdSet.has(/** @type {string} */ (user.home_workspace_id)) ||
        removalWorkspaceIdSet.has(/** @type {string} */ (user.active_workspace_id))
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

/**
 * Collect every workspace scope that is not on the retained list.
 * @param {DatabaseHandle} database
 * @param {CleanupSchema} schema
 * @param {string[]} retainedWorkspaceIds
 * @returns {string[]}
 */
function readRemovalWorkspaceScopes(database, schema, retainedWorkspaceIds) {
  const removalIds = new Set(
    /** @type {WorkspaceIdRow[]} */ (database.prepare(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id NOT IN (${placeholders(retainedWorkspaceIds)});
`).all(...retainedWorkspaceIds)).map((row) => row.workspace_id),
  );

  for (const table of schema.workspaceTables) {
    const rows = /** @type {WorkspaceIdRow[]} */ (database.prepare(`
SELECT DISTINCT workspace_id
FROM ${quoteIdentifier(table)}
WHERE workspace_id IS NOT NULL
  AND workspace_id NOT IN (${placeholders(retainedWorkspaceIds)});
`).all(...retainedWorkspaceIds));
    rows.forEach((row) => removalIds.add(row.workspace_id));
  }

  return [...removalIds].sort();
}

/**
 * Resolve the four workspaces this cleanup must preserve.
 * @param {DatabaseHandle} database
 * @returns {WorkspaceInventoryRow[]}
 */
function resolveRetainedWorkspaces(database) {
  /** @type {WorkspaceInventoryRow[]} */
  const retained = RETAINED_NAMED_WORKSPACES.map((name) => {
    const matches = /** @type {WorkspaceInventoryRow[]} */ (database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at
FROM workspaces
WHERE name = ?
ORDER BY workspace_id;
`).all(name));

    if (matches.length !== 1) {
      throw new Error(`Expected exactly one retained workspace named ${JSON.stringify(name)}; found ${matches.length}.`);
    }

    return {
      ...matches[0],
      display_name: matches[0].name,
      resolution: "exact-workspace-name",
    };
  });
  const personalMatches = /** @type {PersonalWorkspaceMembershipRow[]} */ (database.prepare(`
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
`).all(PERSONAL_OWNER_USERNAME));
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

/**
 * Reflect the table, column, and foreign-key surface the plan walks.
 * @param {DatabaseHandle} database
 * @returns {CleanupSchema}
 */
function readSchema(database) {
  const tables = /** @type {TableColumnRow[]} */ (database.prepare(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`).all()).map((row) => row.name);
  /** @type {Map<string, TableColumnRow[]>} */
  const columnsByTable = new Map();
  /** @type {Map<string, TableForeignKeyRow[]>} */
  const foreignKeysByTable = new Map();

  for (const table of tables) {
    columnsByTable.set(table, /** @type {TableColumnRow[]} */ (database.prepare(`PRAGMA table_info(${quoteIdentifier(table)});`).all()));
    foreignKeysByTable.set(table, /** @type {TableForeignKeyRow[]} */ (database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)});`).all()));
  }

  return {
    columnsByTable,
    foreignKeysByTable,
    tables,
    workspaceTables: tables.filter((table) =>
      table !== "workspaces" &&
      /** @type {TableColumnRow[]} */ (columnsByTable.get(table)).some((column) => column.name === "workspace_id"),
    ),
  };
}

/**
 * Count the rows each workspace-scoped table holds for one workspace.
 * @param {DatabaseHandle} database
 * @param {string[]} workspaceTables
 * @param {string} workspaceId
 * @returns {Record<string, number>}
 */
function readDependentCounts(database, workspaceTables, workspaceId) {
  /** @type {Record<string, number>} */
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

/**
 * Count the user rows still pointing at one workspace.
 * @param {DatabaseHandle} database
 * @param {string} workspaceId
 * @returns {number}
 */
function countUsersReferencingWorkspace(database, workspaceId) {
  const row = database.prepare(`
SELECT COUNT(1) AS count
FROM users
WHERE home_workspace_id = ?
   OR active_workspace_id = ?;
`).get(workspaceId, workspaceId);
  return Number(row?.count) || 0;
}

/**
 * Count the session rows still pointing at one workspace.
 * @param {DatabaseHandle} database
 * @param {string} workspaceId
 * @returns {number}
 */
function countSessionsReferencingWorkspace(database, workspaceId) {
  const row = database.prepare(`
SELECT COUNT(1) AS count
FROM sessions
WHERE home_workspace_id = ?
   OR active_workspace_id = ?;
`).get(workspaceId, workspaceId);
  return Number(row?.count) || 0;
}

/**
 * Read every user whose membership or home workspace is being removed.
 * @param {DatabaseHandle} database
 * @param {string[]} removalWorkspaceIds
 * @param {string[]} retainedWorkspaceIds
 * @returns {AffectedUserRow[]}
 */
function readAffectedUsers(database, removalWorkspaceIds, retainedWorkspaceIds) {
  if (removalWorkspaceIds.length === 0) {
    return [];
  }

  return /** @type {AffectedUserRow[]} */ (database.prepare(`
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
`).all(...retainedWorkspaceIds, ...removalWorkspaceIds, ...removalWorkspaceIds, ...removalWorkspaceIds));
}

/**
 * Resolve the retained workspace one affected user can be re-homed into.
 * @param {DatabaseHandle} database
 * @param {string} userId
 * @param {string[]} retainedWorkspaceIds
 * @returns {string}
 */
function readFallbackRetainedWorkspace(database, userId, retainedWorkspaceIds) {
  const row = /** @type {WorkspaceIdRow | undefined} */ (database.prepare(`
SELECT uw.workspace_id
FROM user_workspaces uw
INNER JOIN workspaces w ON w.workspace_id = uw.workspace_id
WHERE uw.user_id = ?
  AND uw.workspace_id IN (${placeholders(retainedWorkspaceIds)})
ORDER BY CASE WHEN uw.status = 'active' THEN 0 ELSE 1 END, lower(w.name), uw.workspace_id
LIMIT 1;
`).get(userId, ...retainedWorkspaceIds));

  if (!row?.workspace_id) {
    throw new Error(`Affected retained user ${userId} has no fallback retained workspace membership.`);
  }

  return row.workspace_id;
}

/**
 * Refuse the cleanup when retained rows still reference a removable user.
 * @param {DatabaseHandle} database
 * @param {CleanupSchema} schema
 * @param {string[]} retainedWorkspaceIds
 * @param {string[]} orphanUserIds
 * @returns {void}
 */
function assertNoRetainedWorkspaceReferencesOrphanUsers(database, schema, retainedWorkspaceIds, orphanUserIds) {
  if (orphanUserIds.length === 0) {
    return;
  }

  for (const table of ["workspaces", ...schema.workspaceTables]) {
    const userColumns = table === "workspaces"
      ? ["owner_user_id"]
      : /** @type {TableForeignKeyRow[]} */ (schema.foreignKeysByTable.get(table))
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

/**
 * Create and verify the pre-cleanup backup apply mode requires.
 * @param {DatabaseHandle} database
 * @param {string} databaseFile
 * @param {string} backupFile
 * @param {string} expectedInventoryFingerprint
 * @returns {Promise<BackupRecord>}
 */
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

/**
 * Execute the authorized deletion plan inside one rollback-safe transaction.
 * @param {DatabaseHandle} database
 * @param {CleanupPlan} plan
 * @returns {CleanupResult}
 */
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
    /** @type {Record<string, number>} */
    const deletionCounts = {};

    if (plan.authorizedRoleAssignmentRepairs.length > 0) {
      const assignmentIds = plan.authorizedRoleAssignmentRepairs.map((repair) => repair.assignmentId);
      deletionCounts.authorized_dangling_user_role_assignments = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM user_role_assignments
WHERE assignment_id IN (${placeholders(assignmentIds)});
`).run(...assignmentIds)).changes;

      if (deletionCounts.authorized_dangling_user_role_assignments !== assignmentIds.length) {
        throw new Error("Authorized dangling role-assignment repair count changed before apply; rolling back.");
      }
    }

    if (plan.removalWorkspaceIds.length > 0) {
      deletionCounts.api_key_scopes = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
);
`).run(...plan.removalWorkspaceIds)).changes;

      for (const table of orderWorkspaceTablesForDeletion(plan.schema.workspaceTables)) {
        deletionCounts[table] = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM ${quoteIdentifier(table)}
WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)});
`).run(...plan.removalWorkspaceIds)).changes;
      }

      deletionCounts.sessions = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM sessions
WHERE home_workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
   OR active_workspace_id IN (${placeholders(plan.removalWorkspaceIds)})
   ${plan.orphanUserIds.length > 0 ? `OR user_id IN (${placeholders(plan.orphanUserIds)})` : ""};
`).run(...plan.removalWorkspaceIds, ...plan.removalWorkspaceIds, ...plan.orphanUserIds)).changes;

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
        deletionCounts.user_workspace_creation_permissions = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM user_workspace_creation_permissions
WHERE user_id IN (${placeholders(plan.orphanUserIds)});
`).run(...plan.orphanUserIds)).changes;
        deletionCounts.users = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM users
WHERE user_id IN (${placeholders(plan.orphanUserIds)});
`).run(...plan.orphanUserIds)).changes;
      }

      deletionCounts.workspaces = /** @type {StatementRunResult} */ (database.prepare(`
DELETE FROM workspaces
WHERE workspace_id IN (${placeholders(plan.removalWorkspaceIds)});
`).run(...plan.removalWorkspaceIds)).changes;
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

/**
 * Fingerprint every retained workspace row so cleanup can prove it changed nothing.
 * @param {DatabaseHandle} database
 * @param {CleanupSchema} schema
 * @param {string[]} retainedWorkspaceIds
 * @param {(string | undefined)[]} [excludedRoleAssignmentIds]
 * @returns {string}
 */
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
    const rows = /** @type {IterableStatement} */ (database.prepare(`
SELECT *
FROM ${quoteIdentifier(table)}
WHERE workspace_id IN (${placeholders(retainedWorkspaceIds)})
  ${exclusionSql}
ORDER BY workspace_id, rowid;
`)).iterate(...retainedWorkspaceIds, ...(
      table === "user_role_assignments" ? excludedRoleAssignmentIds : []
    ));

    hash.update(`${table}\n`);
    for (const row of rows) {
      hash.update(`${JSON.stringify(row)}\n`);
    }
  }

  const apiKeyScopes = /** @type {IterableStatement} */ (database.prepare(`
SELECT scopes.*
FROM api_key_scopes scopes
INNER JOIN api_keys keys ON keys.api_key_id = scopes.api_key_id
WHERE keys.workspace_id IN (${placeholders(retainedWorkspaceIds)})
ORDER BY scopes.api_key_id, scopes.scope;
`)).iterate(...retainedWorkspaceIds);

  hash.update("api_key_scopes\n");
  for (const row of apiKeyScopes) {
    hash.update(`${JSON.stringify(row)}\n`);
  }

  return hash.digest("hex");
}

/**
 * Fingerprint the whole workspace and membership inventory.
 * @param {DatabaseHandle} database
 * @returns {string}
 */
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

/**
 * Refuse to continue unless PRAGMA integrity_check reports a healthy database.
 * @param {DatabaseHandle} database
 * @param {string} label
 * @returns {void}
 */
function assertIntegrity(database, label) {
  const integrityRows = /** @type {IntegrityCheckRow[]} */ (database.pragma("integrity_check"));

  if (integrityRows.length !== 1 || String(integrityRows[0]?.integrity_check || "").toLowerCase() !== "ok") {
    throw new Error(`${label} failed PRAGMA integrity_check.`);
  }
}

/**
 * Refuse to commit unless integrity and foreign-key checks both pass.
 * @param {DatabaseHandle} database
 * @param {string} label
 * @returns {void}
 */
function assertHealthyDatabase(database, label) {
  assertIntegrity(database, label);
  const foreignKeyRows = /** @type {ForeignKeyCheckRow[]} */ (database.pragma("foreign_key_check"));

  if (foreignKeyRows.length > 0) {
    throw new Error(`${label} failed PRAGMA foreign_key_check with ${foreignKeyRows.length} violation(s).`);
  }
}

/**
 * Project the plan into the shape printed by the dry-run inventory report.
 * @param {CleanupPlan} plan
 * @returns {PublicCleanupPlan}
 */
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

/**
 * Classify every pre-existing foreign-key violation as removable, repairable, or blocking.
 * @param {DatabaseHandle} database
 * @param {CleanupSchema} schema
 * @param {Set<string>} removalWorkspaceIds
 * @param {Set<string>} retainedWorkspaceIds
 * @returns {ForeignKeyViolationRecord[]}
 */
function classifyForeignKeyViolations(database, schema, removalWorkspaceIds, retainedWorkspaceIds) {
  return /** @type {ForeignKeyCheckRow[]} */ (database.pragma("foreign_key_check")).map((violation) => {
    const columns = schema.columnsByTable.get(violation.table) || [];
    const hasWorkspaceId = columns.some((column) => column.name === "workspace_id");
    const row = hasWorkspaceId
      ? /** @type {WorkspaceIdRow | undefined} */ (database.prepare(`
SELECT workspace_id
FROM ${quoteIdentifier(violation.table)}
WHERE rowid = ?;
`).get(violation.rowid))
      : null;
    const workspaceId = row?.workspace_id || null;
    const roleAssignment = violation.table === "user_role_assignments"
      ? /** @type {RoleAssignmentViolationRow | undefined} */ (database.prepare(`
SELECT assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id
FROM user_role_assignments
WHERE rowid = ?;
`).get(violation.rowid))
      : null;
    const referencedUserExists = roleAssignment
      ? Boolean(database.prepare("SELECT 1 FROM users WHERE user_id = ?;").get(roleAssignment.user_id))
      : true;
    const repairableByAuthorizedRoleCleanup = Boolean(
      roleAssignment &&
      violation.parent === "users" &&
      retainedWorkspaceIds.has(/** @type {string} */ (workspaceId)) &&
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

/**
 * Summarize one workspace for the plan and result reports.
 * @param {WorkspaceInventoryRow} workspace
 * @returns {WorkspaceSummary}
 */
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

/**
 * Order workspace-scoped tables so dependent search rows are deleted first.
 * @param {string[]} workspaceTables
 * @returns {string[]}
 */
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

/**
 * Render a non-empty bound-parameter placeholder list.
 * @param {unknown[]} values
 * @returns {string}
 */
function placeholders(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("A non-empty value list is required for cleanup SQL.");
  }
  return values.map(() => "?").join(", ");
}

/**
 * Quote one SQL identifier.
 * @param {unknown} value
 * @returns {string}
 */
function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Refuse to run against a missing database file.
 * @param {string} databaseFile
 * @returns {void}
 */
function assertDatabaseExists(databaseFile) {
  if (!fs.existsSync(databaseFile) || !fs.statSync(databaseFile).isFile()) {
    throw new Error(`Database file does not exist: ${databaseFile}`);
  }
}

/**
 * Parse the cleanup command line.
 * @param {string[]} values
 * @returns {CleanupOptions}
 */
function parseArgs(values) {
  /** @type {CleanupOptions} */
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
