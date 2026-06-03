import { permissionsRepository } from "../repositories/permissions.repo.js";
import { clientsRepository } from "../repositories/clients.repo.js";
import { projectsRepository } from "../repositories/projects.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import { normalizeProtectedUserFlag } from "../utils/normalizers.js";

const ROLE_LIMITS = {
  super_admin: new Set([
    "super_admin",
    "workspace_admin",
    "client_admin",
    "project_admin",
    "client_user",
    "project_user",
    "client_external_user",
  ]),
  workspace_admin: new Set([
    "workspace_admin",
    "client_admin",
    "project_admin",
    "client_user",
    "project_user",
    "client_external_user",
  ]),
  client_admin: new Set(["project_admin", "client_user", "project_user", "client_external_user"]),
  project_admin: new Set(["project_user"]),
};

const ROLE_SCOPE_TYPES = {
  super_admin: "all",
  workspace_admin: "workspace",
  client_admin: "client",
  project_admin: "client",
  client_user: "client",
  project_user: "project",
  client_external_user: "client",
};

const FAMILY_ROLE_LIMITS = new Set(["workspace_admin", "project_user"]);
const PERSONAL_ROLE_LIMITS = new Set(["workspace_admin"]);

let rolePermissionsCache = null;

async function listRoleOptions(session) {
  await assertCanAssignRoles(session);
  return {
    roles: await permissionsRepository.readRoles(),
  };
}

async function readUserAssignments(session, userId) {
  await assertCanAssignRoles(session);
  return {
    assignments: await readDecoratedAssignments(session.workspace_id, userId),
  };
}

async function replaceUserAssignments(session, userId, payload) {
  await assertCanAssignRoles(session);

  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const previousAssignments = await readDecoratedAssignments(session.workspace_id, userId);
  const assignments = await normalizeAssignments(session, payload.assignments || []);

  await permissionsRepository.replaceUserAssignments(session.workspace_id, userId, assignments);
  const nextAssignments = await readDecoratedAssignments(session.workspace_id, userId);
  await auditService.record({
    session,
    action: "user_role_assignments_updated",
    changeType: "update",
    recordType: "user_role_assignment",
    recordId: userId,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue: previousAssignments,
    newValue: nextAssignments,
    metadata: {
      assigned_user_id: userId,
      assigned_username: user.username,
      assignment_count: nextAssignments.length,
    },
  });

  return { assignments: nextAssignments };
}

async function can(session, action, resource = {}) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.workspace_id,
    session.user_id,
  );
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => {
    const permissions = permissionsByRole.get(assignment.role_id) || new Set();

    return permissions.has(action) &&
      assignmentMatchesResource(assignment, resource, session) &&
      assignmentAllowsAction(assignment, action, resource);
  });
}

async function assertCan(session, action, resource = {}) {
  if (await can(session, action, resource)) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function assertCanInAnyScope(session, action, resource = {}) {
  if (await canInAnyScope(session, action, resource)) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function canInAnyScope(session, action, resource = {}) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.workspace_id,
    session.user_id,
  );
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => (
    (permissionsByRole.get(assignment.role_id) || new Set()).has(action) &&
    assignmentAllowsAction(assignment, action, resource)
  ));
}

async function filterReadableClients(session, clients) {
  if (await can(session, "clients.manage", { workspace_id: session.workspace_id, operation: "read" })) {
    return clients;
  }

  const readableScopes = await readReadableScopes(session);
  return clients.filter((client) => readableScopes.clientIds.has(client.id));
}

async function filterReadableProjects(session, projects) {
  if (await can(session, "projects.manage", { workspace_id: session.workspace_id, operation: "read" })) {
    return projects;
  }

  const readableScopes = await readReadableScopes(session);
  return projects.filter((project) => (
    readableScopes.clientIds.has(project.client_id) || readableScopes.projectIds.has(project.id)
  ));
}

async function filterReadableTimeEntries(session, entries) {
  if (await can(session, "time_entries.edit_all", { workspace_id: session.workspace_id, operation: "read" })) {
    return entries;
  }

  const readableScopes = await readReadableScopes(session);
  return entries.filter((entry) => (
    (
      entry.user_id === session.user_id ||
      canReadAllScopedTimeEntries(readableScopes, entry)
    ) &&
    (readableScopes.clientIds.has(entry.client_id) || readableScopes.projectIds.has(entry.project_id))
  ));
}

async function filterReadableTasks(session, tasks) {
  const readableTasks = [];

  for (const task of tasks) {
    if (await can(session, "tasks.view", {
      workspace_id: session.workspace_id,
      client_id: task.client_id,
      project_id: task.project_id,
      operation: "read",
    })) {
      readableTasks.push(task);
    }
  }

  return readableTasks;
}

async function normalizeAssignments(session, assignments) {
  const roles = await permissionsRepository.readRoles();
  const roleIds = new Set(roles.map((role) => role.role_id));
  const normalizedAssignments = [];

  for (const assignment of assignments) {
    const roleId = String(assignment.role_id || "").trim();
    const scopeType = String(assignment.scope_type || ROLE_SCOPE_TYPES[roleId] || "").trim();
    const scopeId = String(assignment.scope_id || "").trim();

    if (!roleIds.has(roleId)) {
      throw new AppError("Role assignment contains an unknown role.", 400);
    }

    if (!(await canAssignRole(session, {
      roleId,
      scopeType,
      scopeId,
    }))) {
      throw new AppError("You cannot assign that role.", 403);
    }

    await assertWorkspaceTypeAllowsRole(session, roleId);

    if (scopeType !== ROLE_SCOPE_TYPES[roleId]) {
      throw new AppError("Role assignment scope does not match the selected role.", 400);
    }

    if (scopeType !== "workspace" && scopeType !== "all" && !scopeId) {
      throw new AppError("Client and project role assignments need a scope.", 400);
    }

    await assertAssignmentScopeBelongsToWorkspace(session, scopeType, scopeId);

    normalizedAssignments.push({
      role_id: roleId,
      scope_type: scopeType,
      scope_id: scopeType === "workspace" ? session.workspace_id : scopeType === "all" ? "all" : scopeId,
      client_id: scopeType === "client" ? scopeId : null,
      project_id: scopeType === "project" ? scopeId : null,
      permission_overrides_json: normalizeOverrides(assignment.permission_overrides),
    });
  }

  return normalizedAssignments;
}

async function assertAssignmentScopeBelongsToWorkspace(session, scopeType, scopeId) {
  if (scopeType === "all" || scopeType === "workspace") {
    return;
  }

  const scopeBelongsToWorkspace = scopeType === "client"
    ? await clientsRepository.readById(session.workspace_id, scopeId)
    : await projectsRepository.readById(session.workspace_id, scopeId);

  if (!scopeBelongsToWorkspace) {
    throw new AppError("Role assignment scope does not belong to this workspace.", 400);
  }
}

async function assertWorkspaceTypeAllowsRole(session, roleId) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);

  if (settings.workspaceType === "business") {
    return;
  }

  if (settings.workspaceType === "family" && FAMILY_ROLE_LIMITS.has(roleId)) {
    return;
  }

  if (settings.workspaceType === "personal" && PERSONAL_ROLE_LIMITS.has(roleId)) {
    return;
  }

  throw new AppError("That role is not available for this workspace type.", 403);
}

async function assertCanAssignRoles(session) {
  if (await hasAssignableRoleScope(session)) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function hasAssignableRoleScope(session) {
  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.workspace_id,
    session.user_id,
  );
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => (
    (permissionsByRole.get(assignment.role_id) || new Set()).has("roles.assign") &&
    assignmentAllowsAction(assignment, "roles.assign", { operation: "update" })
  ));
}

async function canAssignRole(session, requestedAssignment) {
  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.workspace_id,
    session.user_id,
  );
  const roleId = requestedAssignment.roleId;
  const assignmentResource = await readAssignmentResource(session.workspace_id, requestedAssignment);

  if (assignments.some((assignment) => assignment.role_id === "super_admin")) {
    return ROLE_LIMITS.super_admin.has(roleId);
  }

  if (assignments.some((assignment) => assignment.role_id === "workspace_admin")) {
    return ROLE_LIMITS.workspace_admin.has(roleId);
  }

  if (assignments.some((assignment) => (
    ROLE_LIMITS[assignment.role_id]?.has(roleId) &&
    assignmentMatchesResource(assignment, assignmentResource, session)
  ))) {
    return true;
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);
  return normalizeProtectedUserFlag(user?.protected_user) && ROLE_LIMITS.super_admin.has(roleId);
}

async function readAssignmentResource(workspaceId, assignment) {
  if (assignment.scopeType === "workspace") {
    return { workspace_id: workspaceId };
  }

  if (assignment.scopeType === "client") {
    return {
      workspace_id: workspaceId,
      client_id: assignment.scopeId,
    };
  }

  if (assignment.scopeType === "project") {
    const project = await projectsRepository.readById(workspaceId, assignment.scopeId);

    return {
      workspace_id: workspaceId,
      client_id: project?.client_id || "",
      project_id: assignment.scopeId,
    };
  }

  return { workspace_id: workspaceId };
}

async function isSuperAdmin(session) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(session.workspace_id, session.user_id);
  return assignments.some((assignment) => assignment.role_id === "super_admin");
}

async function readReadableScopes(session) {
  const assignments = await permissionsRepository.readAssignmentsForUser(session.workspace_id, session.user_id);
  const permissionsByRole = await readPermissionsByRole();
  const clientIds = new Set();
  const projectIds = new Set();
  const editAllClientIds = new Set();
  const editAllProjectIds = new Set();

  assignments.forEach((assignment) => {
    if (assignment.scope_type === "client" && assignment.scope_id) {
      clientIds.add(assignment.scope_id);

      if ((permissionsByRole.get(assignment.role_id) || new Set()).has("time_entries.edit_all")) {
        editAllClientIds.add(assignment.scope_id);
      }
    }

    if (assignment.scope_type === "project" && assignment.scope_id) {
      projectIds.add(assignment.scope_id);

      if ((permissionsByRole.get(assignment.role_id) || new Set()).has("time_entries.edit_all")) {
        editAllProjectIds.add(assignment.scope_id);
      }
    }
  });

  return { clientIds, editAllClientIds, editAllProjectIds, projectIds };
}

function canReadAllScopedTimeEntries(readableScopes, entry) {
  return readableScopes.editAllClientIds.has(entry.client_id) ||
    readableScopes.editAllProjectIds.has(entry.project_id);
}

async function readDecoratedAssignments(workspaceId, userId) {
  const assignments = await permissionsRepository.readAssignmentsForUser(workspaceId, userId);
  return assignments.map(decorateAssignment);
}

function decorateAssignment(assignment) {
  return {
    assignment_id: assignment.assignment_id,
    role_id: assignment.role_id,
    scope_type: assignment.scope_type,
    scope_id: assignment.scope_id,
    client_id: assignment.client_id,
    project_id: assignment.project_id,
    permission_overrides: parseJsonObject(assignment.permission_overrides_json),
  };
}

function assignmentMatchesResource(assignment, resource, session) {
  if (assignment.role_id === "super_admin") {
    return true;
  }

  if (assignment.scope_type === "all") {
    return true;
  }

  if (assignment.scope_type === "workspace") {
    const resourceWorkspaceId = resource.workspace_id;
    return !resourceWorkspaceId || resourceWorkspaceId === session.workspace_id;
  }

  if (assignment.scope_type === "client") {
    return Boolean(resource.client_id) && assignment.scope_id === resource.client_id;
  }

  if (assignment.scope_type === "project") {
    return Boolean(resource.project_id) && assignment.scope_id === resource.project_id;
  }

  return false;
}

function assignmentAllowsAction(assignment, action, resource = {}) {
  const overrides = parseJsonObject(assignment.permission_overrides_json);
  const operationAccess = overrides.operationAccess || {};
  const operation = resource.operation || actionToOperation(action);
  const resourceKey = actionToResourceKey(action);

  if (
    resourceKey &&
    operation &&
    operationAccess[resourceKey]?.[operation] === false
  ) {
    return false;
  }

  if (action === "billing.manage" && overrides.restrictBilling) {
    return false;
  }

  if (action === "time_entries.create" && overrides.allowManualTime === false) {
    return false;
  }

  if (
    (action === "time_entries.edit_all" || action === "time_entries.edit_own") &&
    overrides.allowEditTime === false
  ) {
    return false;
  }

  return true;
}

function actionToOperation(action) {
  if (action.endsWith(".create")) {
    return "create";
  }

  if (action.endsWith(".edit_all") || action.endsWith(".edit_own") || action.endsWith(".manage")) {
    return "update";
  }

  if (action.endsWith(".view")) {
    return "read";
  }

  if (action.endsWith(".assign")) {
    return "update";
  }

  return "";
}

function actionToResourceKey(action) {
  if (action.startsWith("time_entries.")) {
    return "time_entries";
  }

  if (action.startsWith("tasks.")) {
    return "tasks";
  }

  if (action.startsWith("workspace_settings.")) {
    return "workspace_settings";
  }

  if (action.startsWith("clients.")) {
    return "clients";
  }

  if (action.startsWith("projects.")) {
    return "projects";
  }

  if (action.startsWith("users.") || action.startsWith("roles.")) {
    return "users";
  }

  if (action.startsWith("reporting.")) {
    return "reporting";
  }

  if (action.startsWith("audit_logs.")) {
    return "audit_logs";
  }

  return "";
}

async function readPermissionsByRole() {
  if (rolePermissionsCache) {
    return rolePermissionsCache;
  }

  const rows = await permissionsRepository.readRolePermissions();
  rolePermissionsCache = rows.reduce((permissionsByRole, row) => {
    if (!permissionsByRole.has(row.role_id)) {
      permissionsByRole.set(row.role_id, new Set());
    }

    permissionsByRole.get(row.role_id).add(row.permission_id);
    return permissionsByRole;
  }, new Map());

  return rolePermissionsCache;
}

function normalizeOverrides(value) {
  const overrides = parseJsonObject(value);
  const normalized = {
    restrictBilling: Boolean(overrides.restrictBilling),
    allowManualTime: overrides.allowManualTime !== false,
    allowEditTime: overrides.allowEditTime !== false,
    operationAccess: normalizeOperationAccess(overrides.operationAccess),
  };

  return JSON.stringify(normalized);
}

function normalizeOperationAccess(operationAccess = {}) {
  const normalized = {};

  Object.entries(operationAccess).forEach(([resource, operations]) => {
    normalized[resource] = {};

    Object.entries(operations || {}).forEach(([operation, allowed]) => {
      normalized[resource][operation] = allowed !== false;
    });
  });

  return normalized;
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export const permissionsService = {
  assertCan,
  assertCanInAnyScope,
  can,
  canInAnyScope,
  filterReadableClients,
  filterReadableProjects,
  filterReadableTasks,
  filterReadableTimeEntries,
  isSuperAdmin,
  listRoleOptions,
  readUserAssignments,
  replaceUserAssignments,
};
