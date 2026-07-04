import { db } from "../core/database.js";

const DEFAULT_APP_SETTINGS = {
  workspace_creation_enabled: "true",
  workspace_install_mode: "self_hosted",
  workspace_type_limit: "",
};

async function readAll() {
  const rows = await db.query(`
SELECT setting_key, setting_value
FROM app_settings
ORDER BY setting_key;
`);
  const settings = { ...DEFAULT_APP_SETTINGS };

  rows.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });

  return settings;
}

async function ensureDefaults() {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    for (const [key, value] of Object.entries(DEFAULT_APP_SETTINGS)) {
      await transaction.run(`
INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at)
VALUES (:key, :value, :createdAt, :updatedAt)
ON CONFLICT(setting_key) DO NOTHING;
`, {
        createdAt: now,
        key,
        updatedAt: now,
        value,
      });
    }
  });
}

async function readWorkspaceCreationPermission(userId) {
  const row = await db.get(`
SELECT can_create_workspaces, allowed_workspace_types_json
FROM user_workspace_creation_permissions
WHERE user_id = :userId
LIMIT 1;
`, { userId });

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

function parseWorkspaceTypes(value) {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((type) => ["business", "personal", "family"].includes(type))
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
