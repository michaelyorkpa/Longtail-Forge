import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { normalizeSettings, normalizeThemeMode } from "../utils/normalizers.js";
import { DEFAULT_TIMEZONE, normalizeUtcIso } from "../utils/timezones.js";
import { DEFAULT_WORKSPACE_TYPE } from "../utils/workspaces.js";
import { hashPassword, validatePassword } from "../security/passwords.js";
import { modulesService } from "../core/modules/modules.service.js";
import { appSettingsRepository } from "../repositories/app-settings.repo.js";
import { runStartupActions, STARTUP_LIFECYCLES } from "./startup-coordinator.js";
import {
  databaseDialect,
  db,
  querySql,
  runSql,
} from "./provider.js";

const DEFAULT_WORKSPACE_NAME = config.bootstrap.initialWorkspaceName;
const REDACTED_SEED_USERNAME = "[REDACTED]";
const DEFAULT_SUPER_ADMIN_USERNAME = config.bootstrap.superAdminUsername;
const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = config.bootstrap.superAdminDisplayName;
const SUPER_ADMIN_PASSWORD_ENV = "SUPER_ADMIN_PASSWORD";
const FRAMEWORK_MODULE_UPSERT_SQL = databaseDialect.conflict.buildInsertOnConflictDoUpdate({
  columns: ["module_id", "name", "description", "category", "status", "version", "created_at", "updated_at"],
  conflictColumns: ["module_id"],
  tableName: "modules",
  updateColumns: ["name", "description", "category", "status", "version", "updated_at"],
});
const USER_WORKSPACE_INSERT_SQL = databaseDialect.conflict.buildInsertOrIgnore({
  columns: ["user_workspace_id", "user_id", "workspace_id", "status", "created_at", "updated_at"],
  tableName: "user_workspaces",
});
const USER_ROLE_ASSIGNMENT_INSERT_SQL = databaseDialect.conflict.buildInsertOrIgnore({
  columns: [
    "assignment_id",
    "workspace_id",
    "user_id",
    "role_id",
    "scope_type",
    "scope_id",
    "client_id",
    "project_id",
    "permission_overrides_json",
    "created_at",
    "updated_at",
  ],
  tableName: "user_role_assignments",
});
const VERSIONED_REPAIR_INSERT_SQL = databaseDialect.conflict.buildInsertOnConflictDoNothing({
  columns: ["maintenance_id", "lifecycle", "completed_at", "app_version"],
  conflictColumns: ["maintenance_id"],
  tableName: "startup_maintenance_runs",
});

async function runAppStartupMaintenance(options = {}) {
  return runStartupActions(createAppStartupActions(), {
    context: options.context || {},
    now: options.now,
    report: options.report,
  });
}

function createAppStartupActions() {
  return [
    recurringCheck("app.ensure-framework-module", ensureFrameworkModuleRecord),
    versionedRepair("repair.normalize-stored-times-utc-v1", standardizeStoredTimesToUtc),
    recurringCheck("app.ensure-install-settings", appSettingsRepository.ensureDefaults),
    versionedRepair("repair.protect-first-user-v1", protectFirstUser),
    {
      id: "bootstrap.ensure-default-workspace",
      lifecycle: STARTUP_LIFECYCLES.FIRST_INSTALL,
      owner: "app-startup-maintenance",
      async run(context) {
        const result = await ensureDefaultWorkspace();
        context.workspaceId = result.workspaceId;
        return result.created ? undefined : { status: "skipped", reason: "workspace-exists" };
      },
    },
    recurringCheck("app.ensure-workspace-settings", (context) => ensureWorkspaceSettings(context.workspaceId)),
    recurringCheck("app.sync-module-registry", (context) => modulesService.syncModuleRegistry(context.workspaceId)),
    recurringCheck("app.ensure-workspace-module-rows", () => modulesService.ensureAllWorkspaceModuleRows()),
    versionedRepair("repair.redacted-seed-users-v1", (context) => repairRedactedSeedUsers(context.workspaceId)),
    {
      id: "bootstrap.ensure-super-admin",
      lifecycle: STARTUP_LIFECYCLES.FIRST_INSTALL,
      owner: "app-startup-maintenance",
      async run(context) {
        const result = await seedSuperAdminUser(context.workspaceId);
        return result.created ? undefined : { status: "skipped", reason: result.reason };
      },
    },
    versionedRepair("repair.local-time-entry-user-v1", (context) => repairLocalTimeEntryUser(context.workspaceId)),
    recurringCheck("app.ensure-workspace-memberships", (context) => ensureWorkspaceMemberships(context.workspaceId)),
    versionedRepair("repair.deduplicate-workspace-users-v1", repairDuplicateWorkspaceUserRows),
    versionedRepair("repair.user-active-workspaces-v1", repairUserActiveWorkspaces),
    versionedRepair("repair.workspace-type-v1", (context) => ensureWorkspaceType(context.workspaceId)),
    recurringCheck("app.sync-workspace-permission-contracts", ensureWorkspacePermissionContracts),
    versionedRepair("repair.personal-workspace-memberships-v1", repairPersonalWorkspaceMemberships),
    recurringCheck("app.ensure-protected-user-roles", (context) => ensureProtectedUserRoles(context.workspaceId)),
  ];
}

function recurringCheck(id, run) {
  return {
    id,
    lifecycle: STARTUP_LIFECYCLES.RECURRING_CHECK,
    owner: "app-startup-maintenance",
    run,
  };
}

function versionedRepair(id, repair) {
  return {
    id,
    lifecycle: STARTUP_LIFECYCLES.VERSIONED_REPAIR,
    owner: "app-startup-maintenance",
    run: (context) => runVersionedRepair(id, () => repair(context)),
  };
}

async function runVersionedRepair(maintenanceId, repair) {
  const completed = await db.get(`
SELECT maintenance_id
FROM startup_maintenance_runs
WHERE maintenance_id = :maintenanceId
LIMIT 1;
`, { maintenanceId });

  if (completed) {
    return { status: "skipped", reason: "versioned-repair-complete" };
  }

  await repair();
  await db.run(`${VERSIONED_REPAIR_INSERT_SQL};`, {
    app_version: config.appVersion,
    completed_at: new Date().toISOString(),
    lifecycle: STARTUP_LIFECYCLES.VERSIONED_REPAIR,
    maintenance_id: maintenanceId,
  });

  return undefined;
}

async function ensureFrameworkModuleRecord() {
  if (!(await tableExists("modules"))) {
    return;
  }

  const now = new Date().toISOString();
  await db.run(`
${FRAMEWORK_MODULE_UPSERT_SQL};
`, {
    category: "framework-service",
    created_at: now,
    description: "Core framework services, Help, Search, Files, settings, and shared runtime behavior.",
    module_id: "framework",
    name: "Framework",
    status: "active",
    updated_at: now,
    version: config.appVersion,
  });
}

async function repairDuplicateWorkspaceUserRows() {
  if (
    !(await tableExists("users")) ||
    !(await tableExists("user_workspaces"))
  ) {
    return;
  }

  const duplicateUserRowId = databaseDialect.identity.rowId({ alias: "__rowid" });
  const duplicateRows = await querySql(`
SELECT
  ${duplicateUserRowId},
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
FROM users
WHERE user_id IN (
  SELECT user_id
  FROM users
  GROUP BY user_id
  HAVING COUNT(1) > 1
)
ORDER BY user_id, ${databaseDialect.identity.rowId()};
`);

  const rowsByUserId = duplicateRows.reduce((groups, row) => {
    if (!groups.has(row.user_id)) {
      groups.set(row.user_id, []);
    }

    groups.get(row.user_id).push(row);
    return groups;
  }, new Map());

  for (const rows of rowsByUserId.values()) {
    const canonical = rows[0];
    const activeMemberships = await db.query(`
SELECT workspace_id
FROM user_workspaces
WHERE user_id = :userId
  AND status = 'active'
ORDER BY created_at, workspace_id;
`, { userId: canonical.user_id });
    const activeWorkspaceIds = new Set(activeMemberships.map((membership) => membership.workspace_id));
    const activeWorkspaceId = activeWorkspaceIds.has(canonical.active_workspace_id)
      ? canonical.active_workspace_id
      : activeMemberships[0]?.workspace_id || canonical.active_workspace_id || canonical.home_workspace_id;
    const preferredTheme = rows.some((row) => row.theme_mode === "dark")
      ? "dark"
      : normalizeThemeMode(canonical.theme_mode);
    const protectedUser = rows.some((row) => row.protected_user === "yes") ? "yes" : canonical.protected_user || "no";
    const activeStatus = rows.some((row) => row.user_status === "active") ? "active" : canonical.user_status || "inactive";
    const duplicateRowIds = rows.slice(1).map((row) => row.__rowid);

    await db.transaction(async (transaction) => {
      await transaction.run(`
UPDATE users
SET
  theme_mode = :preferredTheme,
  user_status = :activeStatus,
  protected_user = :protectedUser,
  active_workspace_id = :activeWorkspaceId
WHERE ${databaseDialect.identity.rowId()} = :canonicalRowId;
`, {
        activeStatus,
        activeWorkspaceId,
        canonicalRowId: canonical.__rowid,
        preferredTheme,
        protectedUser,
      });

      await transaction.run(`
DELETE FROM users
WHERE ${databaseDialect.identity.rowId()} IN (:duplicateRowIds);
`, { duplicateRowIds });
    });
  }

  await runSql(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_user_id
ON users (user_id);
`);
}

async function ensureWorkspacePermissionContracts() {
  if (!(await tableExists("role_permissions"))) {
    return;
  }

  await runSql(`
DELETE FROM role_permissions
WHERE role_id IN ('client_admin', 'project_admin')
  AND permission_id = 'users.manage';
`);

  const ensureRolePermissionSql = databaseDialect.conflict.buildInsertOrIgnore({
    columns: ["role_id", "permission_id"],
    tableName: "role_permissions",
    valueExpressions: {
      permission_id: ":permissionId",
      role_id: ":roleId",
    },
  });

  await db.run(`
${ensureRolePermissionSql};
`, {
    permissionId: "roles.assign",
    roleId: "project_admin",
  });
}

async function repairRedactedSeedUsers(workspaceId) {
  if (!(await tableExists("users"))) {
    return;
  }

  const redactedUsers = await db.query(`
SELECT user_id
FROM users
WHERE home_workspace_id = :workspaceId
  AND username = :redactedUsername;
`, {
    redactedUsername: REDACTED_SEED_USERNAME,
    workspaceId,
  });

  if (redactedUsers.length === 0) {
    return;
  }

  const defaultUser = await db.get(`
SELECT user_id
FROM users
WHERE home_workspace_id = :workspaceId
  AND username = :defaultUsername
LIMIT 1;
`, {
    defaultUsername: DEFAULT_SUPER_ADMIN_USERNAME,
    workspaceId,
  });
  const now = new Date().toISOString();

  if (!defaultUser) {
    await db.transaction(async (transaction) => {
      await transaction.run(`
UPDATE users
SET username = :defaultUsername,
    display_name = :defaultDisplayName
WHERE home_workspace_id = :workspaceId
  AND username = :redactedUsername;
`, {
        defaultDisplayName: DEFAULT_SUPER_ADMIN_DISPLAY_NAME,
        defaultUsername: DEFAULT_SUPER_ADMIN_USERNAME,
        redactedUsername: REDACTED_SEED_USERNAME,
        workspaceId,
      });

      await transaction.run(`
UPDATE sessions
SET username = :defaultUsername
WHERE home_workspace_id = :workspaceId
  AND username = :redactedUsername;
`, {
        defaultUsername: DEFAULT_SUPER_ADMIN_USERNAME,
        redactedUsername: REDACTED_SEED_USERNAME,
        workspaceId,
      });
    });
    return;
  }

  await db.transaction(async (transaction) => {
    for (const [index, user] of redactedUsers.entries()) {
      const retiredUsername = `retired-placeholder-${index + 1}-${user.user_id}@longtailforge.local`;

      await transaction.run(`
UPDATE users
SET username = :retiredUsername,
    display_name = 'Retired Placeholder User',
    user_status = 'inactive',
    protected_user = 'no'
WHERE home_workspace_id = :workspaceId
  AND user_id = :userId
  AND username = :redactedUsername;
`, {
        redactedUsername: REDACTED_SEED_USERNAME,
        retiredUsername,
        userId: user.user_id,
        workspaceId,
      });

      await transaction.run(`
DELETE FROM sessions
WHERE home_workspace_id = :workspaceId
  AND user_id = :userId;
`, {
        userId: user.user_id,
        workspaceId,
      });

      await transaction.run(`
INSERT INTO audit_logs (
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  previous_value_json,
  new_value_json,
  metadata_json
)
VALUES (
  :auditId,
  :workspaceId,
  :createdAt,
  :actorUserId,
  :actorUserName,
  :action,
  :changeType,
  :recordType,
  :recordId,
  :recordLabel,
  :recordUrl,
  :previousValueJson,
  :newValueJson,
  :metadataJson
);
`, {
        action: "redacted_seed_user_repaired",
        actorUserId: "system",
        actorUserName: "system",
        auditId: randomUUID(),
        changeType: "repair",
        createdAt: now,
        metadataJson: JSON.stringify({ reason: "literal redaction placeholder was present in seed user data" }),
        newValueJson: JSON.stringify({ username: retiredUsername, user_status: "inactive" }),
        previousValueJson: JSON.stringify({ username: REDACTED_SEED_USERNAME }),
        recordId: user.user_id,
        recordLabel: retiredUsername,
        recordType: "user",
        recordUrl: "user-admin.html",
        workspaceId,
      });
    }
  });
}

async function standardizeStoredTimesToUtc() {
  await standardizeTableColumns("time_entries", "entry_id", [
    "start_time",
    "end_time",
    "created_at",
    "updated_at",
  ]);
  await standardizeTableColumns("audit_logs", "audit_id", ["created_at"]);

  if (await tableExists("active_work_timers")) {
    await standardizeTableColumns("active_work_timers", "active_timer_id", [
      "last_active_start_time",
      "created_at",
      "updated_at",
    ]);
  }
}

async function standardizeTableColumns(tableName, idColumn, columns) {
  if (!(await tableExists(tableName))) {
    return;
  }

  const rowIdColumn = databaseDialect.identity.rowId({ alias: "__rowid" });
  const rows = await querySql(`
SELECT ${rowIdColumn}, ${[idColumn, ...columns].join(", ")}
FROM ${tableName};
`);
  const repairs = rows
    .map((row) => createUtcRepairPlan(tableName, idColumn, columns, row))
    .filter(Boolean);

  if (repairs.length > 0) {
    await db.transaction(async (transaction) => {
      for (const repair of repairs) {
        await transaction.run(repair.sql, repair.params);
      }
    });
  }
}

function createUtcRepairPlan(tableName, idColumn, columns, row) {
  const params = {
    recordId: row[idColumn],
    rowId: row.__rowid,
  };
  const assignments = columns
    .map((column) => {
      const currentValue = row[column];
      const nextValue = normalizeStoredTime(currentValue);

      if (nextValue === currentValue) {
        return "";
      }

      params[column] = nextValue;
      return `${column} = :${column}`;
    })
    .filter(Boolean);

  if (assignments.length === 0) {
    return null;
  }

  return {
    params,
    sql: `
UPDATE ${tableName}
SET ${assignments.join(", ")}
WHERE ${idColumn} = :recordId
  AND ${databaseDialect.identity.rowId()} = :rowId;
`,
  };
}

function normalizeStoredTime(value) {
  const text = String(value || "").trim();

  if (!text || /z$/i.test(text)) {
    return text;
  }

  return normalizeUtcIso(text, DEFAULT_TIMEZONE);
}

async function tableExists(tableName) {
  const row = await db.get(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = :tableName
LIMIT 1;
`, { tableName });

  return Boolean(row);
}

async function ensureDefaultWorkspace() {
  const workspaces = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");

  if (workspaces.length > 0) {
    return {
      created: false,
      workspaceId: workspaces[0].workspace_id,
    };
  }

  const seedSettings = getDefaultSettings();
  const workspaceId = randomUUID();
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (:workspaceId, :workspaceName, 'Active', :workspaceType, :createdAt, :updatedAt);
`, {
      createdAt: now,
      updatedAt: now,
      workspaceId,
      workspaceName: seedSettings.workspaceName,
      workspaceType: DEFAULT_WORKSPACE_TYPE,
    });

    await transaction.run(`
INSERT INTO workspace_settings (
  workspace_id,
  created_at,
  updated_at
)
VALUES (
  :workspaceId,
  :createdAt,
  :updatedAt
);
`, {
      createdAt: now,
      updatedAt: now,
      workspaceId,
    });
  });

  return {
    created: true,
    workspaceId,
  };
}

async function ensureWorkspaceSettings(workspaceId) {
  const settings = await db.get(`
SELECT workspace_id
FROM workspace_settings
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  if (settings) {
    return;
  }

  const now = new Date().toISOString();

  await db.run(`
INSERT INTO workspace_settings (
  workspace_id,
  created_at,
  updated_at
)
VALUES (
  :workspaceId,
  :createdAt,
  :updatedAt
);
`, {
    createdAt: now,
    updatedAt: now,
    workspaceId,
  });
}

function getDefaultSettings() {
  return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
}

async function seedSuperAdminUser(workspaceId) {
  const existingAdministrators = await db.query(`
SELECT users.user_id
FROM users
WHERE users.protected_user = 'yes'
   OR EXISTS (
     SELECT 1
     FROM user_role_assignments
     WHERE user_role_assignments.user_id = users.user_id
       AND user_role_assignments.role_id = 'super_admin'
   )
ORDER BY
  CASE WHEN users.protected_user = 'yes' THEN 0 ELSE 1 END,
  users.username,
  users.user_id
LIMIT 1;
`);

  if (existingAdministrators.length > 0) {
    return { created: false, reason: "super-admin-exists" };
  }

  const existingUsers = await db.query(`
SELECT user_id
FROM users
LIMIT 1;
`);

  if (existingUsers.length > 0) {
    return { created: false, reason: "existing-install-users" };
  }

  const password = getSuperAdminPassword();
  const userId = randomUUID();

  await db.run(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  :userId,
  :workspaceId,
  :username,
  :displayName,
  NULL,
  :timezone,
  :password,
  'light',
  'active',
  'yes',
  :activeWorkspaceId
);
`, {
      activeWorkspaceId: workspaceId,
      displayName: DEFAULT_SUPER_ADMIN_DISPLAY_NAME,
      password: await hashPassword(password),
      timezone: DEFAULT_TIMEZONE,
      userId,
      username: DEFAULT_SUPER_ADMIN_USERNAME,
      workspaceId,
  });

  return { created: true };
}

async function repairLocalTimeEntryUser(workspaceId) {
  const user = await db.get(`
SELECT user_id
FROM users
WHERE home_workspace_id = :workspaceId
  AND username = :username
LIMIT 1;
`, {
    username: DEFAULT_SUPER_ADMIN_USERNAME,
    workspaceId,
  });

  if (!user) {
    return;
  }

  await db.run(`
UPDATE time_entries
SET user_id = :userId
WHERE workspace_id = :workspaceId
  AND (user_id = 'local_user' OR user_id = '');
`, {
    userId: user.user_id,
    workspaceId,
  });
}

async function ensureWorkspaceMemberships(workspaceId) {
  const membershipTable = await tableExists("user_workspaces");
  const hasOwnerColumn = await columnsExist("workspaces", ["owner_user_id"]);

  if (!membershipTable) {
    return;
  }

  const users = await db.query(`
SELECT user_id, user_status
FROM users
WHERE home_workspace_id = :workspaceId;
`, { workspaceId });

  const now = new Date().toISOString();

  if (users.length > 0) {
    await db.transaction(async (transaction) => {
      for (const user of users) {
        await transaction.run(`
${USER_WORKSPACE_INSERT_SQL};
`, {
          created_at: now,
          status: user.user_status === "inactive" ? "inactive" : "active",
          updated_at: now,
          user_id: user.user_id,
          user_workspace_id: randomUUID(),
          workspace_id: workspaceId,
        });
      }
    });
  }

  if (!hasOwnerColumn) {
    return;
  }

  await db.run(`
UPDATE workspaces
SET owner_user_id = COALESCE(
  owner_user_id,
  (
    SELECT user_id
    FROM users
    WHERE home_workspace_id = :workspaceId
      AND protected_user = 'yes'
    ORDER BY username
    LIMIT 1
  ),
  (
    SELECT user_id
    FROM users
    WHERE home_workspace_id = :workspaceId
    ORDER BY username
    LIMIT 1
  )
)
WHERE workspace_id = :workspaceId;
`, { workspaceId });
}

async function repairUserActiveWorkspaces() {
  if (
    !(await tableExists("users")) ||
    !(await tableExists("user_workspaces")) ||
    !(await tableExists("sessions")) ||
    !(await columnsExist("users", ["active_workspace_id"])) ||
    !(await columnsExist("sessions", ["active_workspace_id"]))
  ) {
    return;
  }

  await runSql(`
UPDATE users
SET active_workspace_id = home_workspace_id
WHERE active_workspace_id IS NULL OR active_workspace_id = '';
`);

  const rows = await querySql(`
SELECT sessions.user_id, sessions.active_workspace_id
FROM sessions
INNER JOIN (
  SELECT user_id, MAX(updated_at) AS latest_updated_at
  FROM sessions
  WHERE active_workspace_id IS NOT NULL
    AND active_workspace_id != ''
  GROUP BY user_id
) AS latest_session
  ON latest_session.user_id = sessions.user_id
  AND latest_session.latest_updated_at = sessions.updated_at
INNER JOIN user_workspaces
  ON user_workspaces.user_id = sessions.user_id
  AND user_workspaces.workspace_id = sessions.active_workspace_id
  AND user_workspaces.status = 'active';
`);

  if (rows.length > 0) {
    await db.transaction(async (transaction) => {
      for (const row of rows) {
        await transaction.run(`
UPDATE users
SET active_workspace_id = :activeWorkspaceId
WHERE user_id = :userId;
`, {
          activeWorkspaceId: row.active_workspace_id,
          userId: row.user_id,
        });
      }
    });
  }
}

async function ensureWorkspaceType(workspaceId) {
  if (!(await columnsExist("workspaces", ["workspace_type"]))) {
    return;
  }

  await db.run(`
UPDATE workspaces
SET workspace_type = :workspaceType
WHERE workspace_id = :workspaceId
  AND workspace_type NOT IN ('business', 'personal', 'family');
`, {
    workspaceId,
    workspaceType: DEFAULT_WORKSPACE_TYPE,
  });
}

async function repairPersonalWorkspaceMemberships() {
  if (
    !(await tableExists("user_workspaces")) ||
    !(await columnsExist("workspaces", ["owner_user_id", "workspace_type"]))
  ) {
    return;
  }

  await db.run(`
UPDATE user_workspaces
SET status = 'inactive',
    updated_at = :updatedAt
WHERE status = 'active'
  AND workspace_id IN (
    SELECT workspace_id
    FROM workspaces
    WHERE workspace_type = 'personal'
      AND owner_user_id IS NOT NULL
  )
  AND user_id != (
    SELECT owner_user_id
    FROM workspaces
    WHERE workspaces.workspace_id = user_workspaces.workspace_id
  );
`, { updatedAt: new Date().toISOString() });
}

async function ensureProtectedUserRoles(workspaceId) {
  await db.run(`
UPDATE user_role_assignments
SET scope_type = 'all',
    scope_id = 'all',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND role_id = 'super_admin'
  AND scope_type = 'workspace';
`, {
    updatedAt: new Date().toISOString(),
    workspaceId,
  });

  const rows = await db.query(`
SELECT user_id
FROM users
WHERE home_workspace_id = :workspaceId
  AND protected_user = 'yes';
`, { workspaceId });

  const now = new Date().toISOString();

  if (rows.length > 0) {
    await db.transaction(async (transaction) => {
      for (const row of rows) {
        await transaction.run(`
${USER_ROLE_ASSIGNMENT_INSERT_SQL};
`, {
          assignment_id: randomUUID(),
          client_id: null,
          created_at: now,
          permission_overrides_json: null,
          project_id: null,
          role_id: "super_admin",
          scope_id: "all",
          scope_type: "all",
          updated_at: now,
          user_id: row.user_id,
          workspace_id: workspaceId,
        });
      }
    });
  }
}

function getSuperAdminPassword() {
  const password = config.bootstrap.superAdminPassword;

  if (!password) {
    throw new Error(
      `${SUPER_ADMIN_PASSWORD_ENV} is required to create the initial super administrator. Set it in the local .env file or the deployment secret store before first launch.`,
    );
  }

  const validation = validatePassword(password, DEFAULT_SUPER_ADMIN_USERNAME);

  if (!validation.valid) {
    throw new Error(
      `${SUPER_ADMIN_PASSWORD_ENV} does not meet password requirements: ${validation.errors.join("; ")}`,
    );
  }

  return password;
}

async function protectFirstUser() {
  await runSql(`
UPDATE users
SET protected_user = 'yes'
WHERE ${databaseDialect.identity.rowId()} = (
  SELECT ${databaseDialect.identity.rowId()}
  FROM users
  ORDER BY ${databaseDialect.identity.rowId()}
  LIMIT 1
);
`);
}

async function columnsExist(tableName, columnNames) {
  const columns = await querySql(databaseDialect.introspection.tableInfo(tableName));
  const existingColumnNames = new Set(columns.map((column) => column.name));

  return columnNames.every((columnName) => existingColumnNames.has(columnName));
}

export {
  createAppStartupActions,
  runAppStartupMaintenance,
};
