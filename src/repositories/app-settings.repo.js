import { querySql, runSql, sqlText } from "../core/database.js";

const DEFAULT_APP_SETTINGS = {
  workspace_creation_enabled: "true",
  workspace_install_mode: "self_hosted",
  workspace_type_limit: "",
};

async function readAll() {
  const rows = await querySql(`
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
  const statements = Object.entries(DEFAULT_APP_SETTINGS).map(([key, value]) => `
INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at)
VALUES (${sqlText(key)}, ${sqlText(value)}, ${sqlText(now)}, ${sqlText(now)})
ON CONFLICT(setting_key) DO NOTHING;
`);

  await runSql(statements.join("\n"));
}

async function readWorkspaceCreationPermission(userId) {
  const rows = await querySql(`
SELECT can_create_workspaces, allowed_workspace_types_json
FROM user_workspace_creation_permissions
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);

  if (!rows[0]) {
    return {
      canCreateWorkspaces: true,
      allowedWorkspaceTypes: ["business", "personal", "family"],
    };
  }

  return {
    canCreateWorkspaces: Number(rows[0].can_create_workspaces) === 1,
    allowedWorkspaceTypes: parseWorkspaceTypes(rows[0].allowed_workspace_types_json),
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
