// @ts-check

/** @typedef {import("../types/http-contracts.js").PermissionResource} PermissionResource */

/**
 * @param {string} workspaceId
 * @param {string} operation
 * @returns {PermissionResource}
 */
function createWorkspacePermissionResource(workspaceId, operation) {
  return {
    operation,
    workspace_id: workspaceId,
  };
}

/**
 * @param {string} workspaceId
 * @param {string} operation
 * @param {{ clientId?: string | null, projectId?: string | null }} [scope]
 * @returns {PermissionResource}
 */
function createScopedPermissionResource(workspaceId, operation, scope = {}) {
  return {
    client_id: scope.clientId || "",
    operation,
    project_id: scope.projectId || "",
    workspace_id: workspaceId,
  };
}

export {
  createScopedPermissionResource,
  createWorkspacePermissionResource,
};
