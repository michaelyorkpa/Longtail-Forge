// @ts-check

import { db } from "../core/database.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {DatabaseRow & { setting_key: string, setting_value: string }} AppSettingRow */
/** @typedef {DatabaseRow & { can_create_workspaces: unknown, allowed_workspace_types_json: unknown }} WorkspaceCreationPermissionRow */

const DEFAULT_APP_SETTINGS = {
  workspace_creation_enabled: "true",
  workspace_install_mode: "self_hosted",
  workspace_type_limit: "",
};
const DEFAULT_APP_SETTING_INSERT_SQL = db.dialect.conflict.buildInsertOnConflictDoNothing({
  columns: ["setting_key", "setting_value", "created_at", "updated_at"],
  conflictColumns: ["setting_key"],
  tableName: "app_settings",
  valueExpressions: {
    created_at: ":createdAt",
    setting_key: ":key",
    setting_value: ":value",
    updated_at: ":updatedAt",
  },
});

/** @returns {Promise<Record<string, string>>} */
async function readAll() {
  const rows = /** @type {AppSettingRow[]} */ (await db.query(`
SELECT setting_key, setting_value
FROM app_settings
ORDER BY setting_key;
`));
  /** @type {Record<string, string>} */
  const settings = { ...DEFAULT_APP_SETTINGS };

  rows.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });

  return settings;
}

/** @returns {Promise<void>} */
async function ensureDefaults() {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    for (const [key, value] of Object.entries(DEFAULT_APP_SETTINGS)) {
      await transaction.run(`${DEFAULT_APP_SETTING_INSERT_SQL};`, {
        createdAt: now,
        key,
        updatedAt: now,
        value,
      });
    }
  });
}

/** @param {string} userId */
async function readWorkspaceCreationPermission(userId) {
  const row = /** @type {WorkspaceCreationPermissionRow | null} */ (await db.get(`
SELECT can_create_workspaces, allowed_workspace_types_json
FROM user_workspace_creation_permissions
WHERE user_id = :userId
LIMIT 1;
`, { userId }));

  if (!row) {
    return {
      canCreateWorkspaces: true,
      allowedWorkspaceTypes: ["business", "personal", "family"],
    };
  }

  return {
    canCreateWorkspaces: Number(row.can_create_workspaces) === 1,
    allowedWorkspaceTypes: parseWorkspaceTypes(row.allowed_workspace_types_json),
  };
}

/** @param {unknown} value @returns {string[]} */
function parseWorkspaceTypes(value) {
  try {
    const parsed = JSON.parse(String(value ?? ""));

    return Array.isArray(parsed)
      ? parsed.filter((type) => typeof type === "string" && ["business", "personal", "family"].includes(type))
      : [];
  } catch {
    return [];
  }
}

export const appSettingsRepository = {
  ensureDefaults,
  readAll,
  readWorkspaceCreationPermission,
};
