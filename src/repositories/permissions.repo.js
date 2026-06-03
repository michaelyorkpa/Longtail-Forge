import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText, sqlNullableText } from "../db/index.js";

async function readRoles() {
  const roles = await querySql(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`);

  return roles;
}

async function readRolePermissions() {
  return querySql(`
SELECT role_id, permission_id
FROM role_permissions
ORDER BY role_id, permission_id;
`);
}

async function readAssignmentsForWorkspace(workspaceId) {
  return querySql(`
SELECT
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY updated_at DESC, assignment_id;
`);
}

async function readAssignmentsForUser(workspaceId, userId) {
  return querySql(`
SELECT
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
ORDER BY updated_at DESC, assignment_id;
`);
}

async function replaceUserAssignments(workspaceId, userId, assignments) {
  const now = new Date().toISOString();
  const inserts = assignments.map((assignment) => `
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(assignment.role_id)},
  ${sqlText(assignment.scope_type)},
  ${sqlNullableText(assignment.scope_id)},
  ${sqlNullableText(assignment.client_id)},
  ${sqlNullableText(assignment.project_id)},
  ${sqlNullableText(assignment.permission_overrides_json)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
DELETE FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)};
${inserts}
COMMIT;
`);
}

export const permissionsRepository = {
  readAssignmentsForWorkspace,
  readAssignmentsForUser,
  readRolePermissions,
  readRoles,
  replaceUserAssignments,
};
