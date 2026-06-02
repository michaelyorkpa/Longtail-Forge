import { permissionsRepository } from "../repositories/permissions.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import { normalizeProtectedUserFlag } from "../utils/normalizers.js";

const ROLE_LIMITS = {
  super_admin: new Set([
    "super_admin",
    "organization_admin",
    "client_admin",
    "project_admin",
    "client_user",
    "project_user",
    "client_external_user",
  ]),
  organization_admin: new Set([
    "organization_admin",
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
  organization_admin: "organization",
  client_admin: "client",
  project_admin: "client",
  client_user: "client",
  project_user: "project",
  client_external_user: "client",
};

const FAMILY_ROLE_LIMITS = new Set(["organization_admin", "project_user"]);
const PERSONAL_ROLE_LIMITS = new Set(["organization_admin"]);

let rolePermissionsCache = null;

async function listRoleOptions(session) {
  await assertCan(session, "roles.assign", { organization_id: session.organization_id });
  return {
    roles: await permissionsRepository.readRoles(),
  };
}

async function readUserAssignments(session, userId) {
  await assertCan(session, "roles.assign", { organization_id: session.organization_id });
  return {
    assignments: await readDecoratedAssignments(session.organization_id, userId),
  };
}

async function replaceUserAssignments(session, userId, payload) {
  await assertCan(session, "roles.assign", { organization_id: session.organization_id });

  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const previousAssignments = await readDecoratedAssignments(session.organization_id, userId);
  const assignments = await normalizeAssignments(session, payload.assignments || []);

  await permissionsRepository.replaceUserAssignments(session.organization_id, userId, assignments);
  const nextAssignments = await readDecoratedAssignments(session.organization_id, userId);
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
  if (!session?.organization_id || !session?.user_id) {
    return false;
  }

  const user = await usersRepository.readById(session.organization_id, session.user_id);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.organization_id,
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

async function filterReadableClients(session, clients) {
  if (await can(session, "clients.manage", { organization_id: session.organization_id, operation: "read" })) {
    return clients;
  }

  const readableScopes = await readReadableScopes(session);
  return clients.filter((client) => readableScopes.clientIds.has(client.id));
}

async function filterReadableProjects(session, projects) {
  if (await can(session, "projects.manage", { organization_id: session.organization_id, operation: "read" })) {
    return projects;
  }

  const readableScopes = await readReadableScopes(session);
  return projects.filter((project) => (
    readableScopes.clientIds.has(project.client_id) || readableScopes.projectIds.has(project.id)
  ));
}

async function filterReadableTimeEntries(session, entries) {
  if (await can(session, "time_entries.edit_all", { organization_id: session.organization_id, operation: "read" })) {
    return entries;
  }

  const readableScopes = await readReadableScopes(session);
  return entries.filter((entry) => (
    entry.user_id === session.user_id &&
    (readableScopes.clientIds.has(entry.client_id) || readableScopes.projectIds.has(entry.project_id))
  ));
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

    if (!(await canAssignRole(session, roleId))) {
      throw new AppError("You cannot assign that role.", 403);
    }

    await assertWorkspaceTypeAllowsRole(session, roleId);

    if (scopeType !== ROLE_SCOPE_TYPES[roleId]) {
      throw new AppError("Role assignment scope does not match the selected role.", 400);
    }

    if (scopeType !== "organization" && scopeType !== "all" && !scopeId) {
      throw new AppError("Client and project role assignments need a scope.", 400);
    }

    normalizedAssignments.push({
      role_id: roleId,
      scope_type: scopeType,
      scope_id: scopeType === "organization" ? session.organization_id : scopeType === "all" ? "all" : scopeId,
      client_id: scopeType === "client" ? scopeId : null,
      project_id: scopeType === "project" ? scopeId : null,
      permission_overrides_json: normalizeOverrides(assignment.permission_overrides),
    });
  }

  return normalizedAssignments;
}

async function assertWorkspaceTypeAllowsRole(session, roleId) {
  const settings = await settingsRepository.readOrganizationSettings(session.organization_id);

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

async function canAssignRole(session, roleId) {
  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.organization_id,
    session.user_id,
  );

  if (assignments.some((assignment) => assignment.role_id === "super_admin")) {
    return ROLE_LIMITS.super_admin.has(roleId);
  }

  if (assignments.some((assignment) => assignment.role_id === "organization_admin")) {
    return ROLE_LIMITS.organization_admin.has(roleId);
  }

  if (assignments.some((assignment) => assignment.role_id === "client_admin")) {
    return ROLE_LIMITS.client_admin.has(roleId);
  }

  if (assignments.some((assignment) => assignment.role_id === "project_admin")) {
    return ROLE_LIMITS.project_admin.has(roleId);
  }

  const user = await usersRepository.readById(session.organization_id, session.user_id);
  return normalizeProtectedUserFlag(user?.protected_user) && ROLE_LIMITS.super_admin.has(roleId);
}

async function isSuperAdmin(session) {
  if (!session?.organization_id || !session?.user_id) {
    return false;
  }

  const user = await usersRepository.readById(session.organization_id, session.user_id);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(session.organization_id, session.user_id);
  return assignments.some((assignment) => assignment.role_id === "super_admin");
}

async function readReadableScopes(session) {
  const assignments = await permissionsRepository.readAssignmentsForUser(session.organization_id, session.user_id);
  const clientIds = new Set();
  const projectIds = new Set();

  assignments.forEach((assignment) => {
    if (assignment.scope_type === "client" && assignment.scope_id) {
      clientIds.add(assignment.scope_id);
    }

    if (assignment.scope_type === "project" && assignment.scope_id) {
      projectIds.add(assignment.scope_id);
    }
  });

  return { clientIds, projectIds };
}

async function readDecoratedAssignments(organizationId, userId) {
  const assignments = await permissionsRepository.readAssignmentsForUser(organizationId, userId);
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

  if (assignment.scope_type === "organization") {
    const resourceWorkspaceId = resource.workspace_id || resource.organization_id;
    return !resourceWorkspaceId || resourceWorkspaceId === session.organization_id;
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

  if (action.startsWith("organization_settings.")) {
    return "organization_settings";
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
  can,
  filterReadableClients,
  filterReadableProjects,
  filterReadableTimeEntries,
  isSuperAdmin,
  listRoleOptions,
  readUserAssignments,
  replaceUserAssignments,
};
