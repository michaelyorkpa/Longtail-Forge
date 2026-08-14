import assert from "node:assert/strict";

/** @typedef {import("../../src/types/http-contracts.js").SessionMode} SessionMode */
/** @typedef {import("../../src/types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isFixtureRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {string} label @returns {string} */
export function fixtureString(value, label) {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string`);
  }
  assert.ok(value, `${label} must not be empty`);
  return value;
}

/** @param {Record<string, unknown>} row @param {string[]} keys @param {string} label @returns {string} */
function firstFixtureString(row, keys, label) {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) {
      return row[key];
    }
  }
  assert.fail(`${label} must be a non-empty string`);
}

/** @param {unknown} value @returns {SessionMode} */
function fixtureSessionMode(value) {
  return value === "account_export_recovery" ? value : "normal";
}

/**
 * Validate a database-backed regression fixture at its read boundary so
 * framework service calls receive the same precise session contract as routes.
 *
 * @param {unknown} value
 * @returns {WorkspaceRequestSession & {display_name?: string}}
 */
export function workspaceSessionFixture(value) {
  assert.ok(isFixtureRecord(value), "workspace session fixture must be an object");

  const workspaceId = firstFixtureString(
    value,
    ["workspace_id", "active_workspace_id", "home_workspace_id"],
    "workspace session workspace ID",
  );
  const activeWorkspaceId = typeof value.active_workspace_id === "string"
    ? value.active_workspace_id
    : workspaceId;
  const homeWorkspaceId = typeof value.home_workspace_id === "string"
    ? value.home_workspace_id
    : workspaceId;
  const session = {
    active_workspace_id: activeWorkspaceId,
    home_workspace_id: homeWorkspaceId,
    ip_address: typeof value.ip_address === "string" ? value.ip_address : "127.0.0.1",
    password_change_required: value.password_change_required === true,
    session_mode: fixtureSessionMode(value.session_mode),
    timezone: typeof value.timezone === "string" && value.timezone ? value.timezone : "America/New_York",
    user_id: firstFixtureString(value, ["user_id"], "workspace session user ID"),
    username: firstFixtureString(value, ["username"], "workspace session username"),
    workspace_id: workspaceId,
  };

  return typeof value.display_name === "string"
    ? { ...session, display_name: value.display_name }
    : session;
}
