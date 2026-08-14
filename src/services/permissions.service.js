// @ts-check

import { createHmac, randomBytes } from "node:crypto";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import { permissionsRepository } from "../repositories/permissions.repo.js";
import { internalEventBus } from "../core/events/event-bus.js";
import { readRequestScopedCache } from "../core/request-cache.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import {
  isValidEmail,
  normalizeDisplayName,
  normalizeProtectedUserFlag,
  normalizeUsername,
} from "../utils/normalizers.js";

/** @typedef {import("../types/http-contracts.js").PermissionResource} PermissionResource */
/** @typedef {import("../types/http-contracts.js").AuthorizationSession} PermissionSession */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {import("../repositories/permissions.repo.js").PermissionAssignmentRow} PermissionAssignmentRow */
/** @typedef {import("../repositories/permissions.repo.js").PermissionAssignmentInput} PermissionAssignmentInput */
/** @typedef {import("../repositories/permissions.repo.js").PermissionClientRow} PermissionClientRow */
/** @typedef {import("../repositories/permissions.repo.js").PermissionProjectRow} PermissionProjectRow */
/** @typedef {import("../repositories/permissions.repo.js").PermissionRoleRow} PermissionRoleRow */
/** @typedef {import("../repositories/permissions.repo.js").PermissionUserRow} PermissionUserRow */
/** @typedef {import("../repositories/permissions.repo.js").PermissionWorkspaceRow} PermissionWorkspaceRow */
/** @typedef {Record<string, unknown>} LooseRecord */
/** @typedef {{roleId: string, scopeType: string, scopeId: string}} RequestedAssignment */
/** @typedef {{actor: PermissionUserRow, actorAssignments: PermissionAssignmentRow[], assignments: PermissionAssignmentInput[], clients: PermissionClientRow[], expectedRevision: string, fullAdministrator: boolean, previousAssignments: PermissionAssignmentRow[], projects: PermissionProjectRow[], roles: PermissionRoleRow[], session: WorkspaceRequestSession, targetUser: PermissionUserRow, workspace: PermissionWorkspaceRow}} RoleAssignmentMutationInput */
/** @typedef {{actorAssignments: PermissionAssignmentRow[], clientsById: Map<string, PermissionClientRow>, projectsById: Map<string, PermissionProjectRow>, workspace: PermissionWorkspaceRow}} DelegatedAuthorityInput */
/**
 * @typedef {Object} PermissionAssignment
 * @property {string} role_id
 * @property {string} scope_type
 * @property {string | null} scope_id
 * @property {string | null | undefined} permission_overrides_json
 */
/**
 * @typedef {Object} PermissionOverrides
 * @property {Record<string, Record<string, boolean>>} [operationAccess]
 * @property {boolean} [restrictBilling]
 * @property {boolean} [allowManualTime]
 * @property {boolean} [allowEditTime]
 */

/** @type {Readonly<Record<string, Set<string>>>} */
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

/** @type {Readonly<Record<string, string>>} */
const ROLE_SCOPE_TYPES = {
  super_admin: "all",
  workspace_admin: "workspace",
  client_admin: "client",
  project_admin: "project",
  client_user: "client",
  project_user: "project",
  client_external_user: "client",
};

const FAMILY_ROLE_LIMITS = new Set(["workspace_admin", "project_user"]);
const PERSONAL_ROLE_LIMITS = new Set(["workspace_admin"]);
const DELEGATED_ASSIGNMENT_REVISION_SECRET = randomBytes(32);

/** @type {Map<string, Set<string>> | null} */
let rolePermissionsCache = null;

/**
 * @param {import("../types/http-contracts.js").RequestSession | null | undefined} session
 */
async function listRoleOptions(session) {
  return listAssignableRoleOptions(session);
}

/**
 * @param {import("../types/http-contracts.js").RequestSession | null | undefined} session
 */
async function listAssignableRoleOptions(session) {
  const activeSession = await assertCanAssignRoles(session);
  const [roles, settings, clients, projects] = await Promise.all([
    permissionsRepository.readRoles(),
    settingsRepository.readWorkspaceSettings(activeSession.workspace_id, activeSession),
    clientsRepository.readAll(activeSession.workspace_id),
    projectsRepository.readAll(activeSession.workspace_id),
  ]);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const options = [];

  for (const role of roles) {
    if (!workspaceTypeAllowsRole(settings.workspaceType, role.role_id)) {
      continue;
    }

    const scopeType = ROLE_SCOPE_TYPES[role.role_id];
    const candidates = scopeType === "all"
      ? [{ scopeId: "all", label: "All workspaces" }]
      : scopeType === "workspace"
        ? [{ scopeId: activeSession.workspace_id, label: "Workspace" }]
        : scopeType === "client"
          ? clients
            .filter((client) => client.status !== "Inactive")
            .map((client) => ({ scopeId: client.id, label: client.name }))
          : projects
            .filter((project) => project.status !== "Inactive")
            .map((project) => ({
              scopeId: project.id,
              label: project.client_id && clientNames.has(project.client_id)
                ? `${clientNames.get(project.client_id)} / ${project.name}`
                : project.name,
            }));
    const scopes = [];

    for (const candidate of candidates) {
      if (await canAssignRole(activeSession, {
        roleId: role.role_id,
        scopeType,
        scopeId: candidate.scopeId,
      })) {
        scopes.push(candidate);
      }
    }

    if (scopes.length > 0) {
      options.push({
        ...role,
        assignment_scope_type: scopeType,
        scopes,
      });
    }
  }

  return { roles: options };
}

/**
 * @param {import("../types/http-contracts.js").RequestSession | null | undefined} session
 */
async function hasUsableDelegatedRoleScope(session) {
  try {
    const options = await listAssignableRoleOptions(session);
    return options.roles.some((role) => Array.isArray(role.scopes) && role.scopes.length > 0);
  } catch {
    return false;
  }
}

/** @param {PermissionSession | null | undefined} session @param {unknown} assignments */
async function validateUserAssignments(session, assignments) {
  const activeSession = await assertCanAssignRoles(session);
  return normalizeAssignments(activeSession, Array.isArray(assignments) ? assignments : []);
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} userId
 */
async function readUserAssignments(session, userId) {
  const activeSession = await assertCanAssignRoles(session);

  if (!(await isWorkspaceAdministrator(activeSession))) {
    throw new AppError("Use exact account lookup to manage delegated role assignments.", 403);
  }

  return {
    assignments: await readDecoratedAssignments(activeSession.workspace_id, userId),
  };
}

/**
 * @param {import("../types/http-contracts.js").RequestSession | null | undefined} session
 */
/** @param {PermissionSession | null | undefined} session @param {LooseRecord} [payload] */
async function lookupDelegatedRoleAssignmentAccount(session, payload = {}) {
  assertPublicDemoCapabilityAllowed("administration.role_management");
  const activeSession = await assertCanAssignRoles(session);
  const username = normalizeUsername(payload.username);

  if (!isValidEmail(username)) {
    return { match: null };
  }

  const user = await usersRepository.readExactActiveMemberByUsername(activeSession.workspace_id, username);
  if (!user) {
    return { match: null };
  }

  const allAssignments = await permissionsRepository.readAssignmentsForUser(
    activeSession.workspace_id,
    user.user_id,
  );
  const manageableAssignments = [];

  for (const assignment of allAssignments) {
    if (await canAssignExistingRole(activeSession, assignment)) {
      manageableAssignments.push(assignment);
    }
  }

  return {
    match: {
      activeMembership: true,
      assignmentRevision: createDelegatedAssignmentRevision(manageableAssignments, {
        actorUserId: activeSession.user_id,
        targetUserId: user.user_id,
        workspaceId: activeSession.workspace_id,
      }),
      assignments: manageableAssignments.map(decorateDelegatedAssignment),
      displayName: normalizeDisplayName(user.display_name, user.username),
      userId: user.user_id,
      username: user.username,
    },
  };
}

/** @param {PermissionSession | null | undefined} session @param {unknown} userId @param {LooseRecord} payload */
async function replaceUserAssignments(session, userId, payload) {
  assertPublicDemoCapabilityAllowed("administration.role_management");
  const activeSession = await assertCanAssignRoles(session);
  const targetUserId = String(userId || "").trim();
  const fullAdministrator = await isWorkspaceAdministrator(activeSession);
  if (!Array.isArray(payload.assignments)) {
    throw new AppError("Role assignments must be a list.", 400);
  }
  if (
    !fullAdministrator
    && payload.assignments.some((assignment) => (
      Object.hasOwn(assignment || {}, "permission_overrides")
      || Object.hasOwn(assignment || {}, "permission_overrides_json")
    ))
  ) {
    throw new AppError("Delegated role assignments cannot set permission overrides.", 403);
  }
  const assignments = await normalizeAssignments(activeSession, payload.assignments);
  const expectedRevision = String(payload.assignmentRevision || payload.assignment_revision || "").trim();

  if (!fullAdministrator && !expectedRevision) {
    throw new AppError("Refresh the account before changing delegated role assignments.", 409);
  }

  const mutation = await permissionsRepository.mutateUserAssignmentsAtomically({
    actorUserId: activeSession.user_id,
    userId: targetUserId,
    workspaceId: activeSession.workspace_id,
    planMutation: (state) => planRoleAssignmentMutation(/** @type {RoleAssignmentMutationInput} */ ({
      ...state,
      assignments,
      expectedRevision,
      fullAdministrator,
      session: activeSession,
    })),
  });
  const previousAssignments = mutation.plan.safePreviousAssignments;
  const nextAssignments = mutation.plan.fullAdministrator
    ? mutation.nextAssignments.map(decorateAssignment)
    : mutation.nextAssignments
      .filter((assignment) => mutation.plan.manageableKeys.has(assignmentKey(assignment)))
      .map(decorateDelegatedAssignment);
  const response = mutation.plan.fullAdministrator
    ? { assignments: nextAssignments }
    : {
      assignmentRevision: createDelegatedAssignmentRevision(
        mutation.nextAssignments.filter((assignment) => mutation.plan.manageableKeys.has(assignmentKey(assignment))),
        {
          actorUserId: activeSession.user_id,
          targetUserId,
          workspaceId: activeSession.workspace_id,
        },
      ),
      assignments: nextAssignments,
    };
  const mutationTargetUser = /** @type {NonNullable<typeof mutation.targetUser>} */ (mutation.targetUser);

  const { privateFeedsService } = await import("./private-feeds.service.js");
  await privateFeedsService.reconcileCalendarSubscriptions({
    session: activeSession,
    userId: targetUserId,
    workspaceId: activeSession.workspace_id,
  });

  await auditService.record({
    session: activeSession,
    action: "user_role_assignments_updated",
    changeType: "update",
    recordType: "user_role_assignment",
    recordId: targetUserId,
    recordLabel: mutationTargetUser.username,
    recordUrl: mutation.plan.fullAdministrator ? "user-admin.html" : "",
    previousValue: previousAssignments,
    newValue: nextAssignments,
    metadata: {
      assigned_user_id: targetUserId,
      assigned_username: mutationTargetUser.username,
      assignment_count: nextAssignments.length,
      delegation_mode: mutation.plan.fullAdministrator ? "full" : "scoped",
    },
  });
  await internalEventBus.emit("user.role_assignments_updated", {
    metadata: {
      assignment_count: nextAssignments.length,
      delegation_mode: mutation.plan.fullAdministrator ? "full" : "scoped",
    },
    newValue: nextAssignments,
    previousValue: previousAssignments,
    recordId: targetUserId,
    recordType: "user_role_assignment",
    session: activeSession,
    source: "permissions",
  });

  return response;
}

/** @param {RoleAssignmentMutationInput} input */
function planRoleAssignmentMutation({
  actor,
  actorAssignments,
  assignments,
  clients,
  expectedRevision,
  fullAdministrator,
  previousAssignments,
  projects,
  roles,
  session,
  targetUser,
  workspace,
}) {
  assertFreshRoleAssignmentActors({
    actor,
    actorAssignments,
    session,
    targetUser,
    workspace,
  });
  const roleIds = new Set(roles.map((role) => role.role_id));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const freshFullAdministrator = actorHasFullAssignmentAuthority(
    actor,
    actorAssignments,
    session.workspace_id,
  );

  if (fullAdministrator && !freshFullAdministrator) {
    throw new AppError("Your role-assignment authority changed. Refresh and try again.", 409);
  }

  const requestedKeys = new Set();
  for (const assignment of assignments) {
    const key = assignmentKey(assignment);
    if (requestedKeys.has(key)) {
      throw new AppError("Role assignments cannot contain duplicates.", 400);
    }
    requestedKeys.add(key);

    if (!roleIds.has(assignment.role_id)) {
      throw new AppError("Role assignment contains an unknown role.", 400);
    }

    assertFreshAssignmentScope({
      assignment,
      clientsById,
      projectsById,
      workspace,
    });
  }

  if (fullAdministrator) {
    return {
      assignmentIdsToDelete: previousAssignments.map((assignment) => assignment.assignment_id),
      assignmentsToInsert: assignments,
      fullAdministrator: true,
      manageableKeys: requestedKeys,
      safePreviousAssignments: previousAssignments.map(decorateAssignment),
    };
  }

  if (!actorHasDelegatedAssignmentAuthority({
    actorAssignments,
    clientsById,
    projectsById,
    workspace,
  })) {
    throw new AppError("Your role-assignment authority changed. Refresh and try again.", 409);
  }

  /** @param {PermissionAssignmentInput} assignment */
  const canManage = (assignment) => canAssignRoleFromFreshState({
    actorAssignments,
    assignment,
    clientsById,
    projectsById,
    workspace,
  });
  const manageablePrevious = previousAssignments.filter(canManage);
  const currentRevision = createDelegatedAssignmentRevision(manageablePrevious, {
    actorUserId: session.user_id,
    targetUserId: targetUser.user_id,
    workspaceId: session.workspace_id,
  });

  if (expectedRevision !== currentRevision) {
    throw new AppError("Role assignments changed. Refresh the account and try again.", 409);
  }

  for (const assignment of assignments) {
    if (!canManage(assignment)) {
      throw new AppError("You cannot assign that role.", 403);
    }
  }

  const previousByKey = new Map(manageablePrevious.map((assignment) => [
    assignmentKey(assignment),
    assignment,
  ]));

  return {
    assignmentIdsToDelete: manageablePrevious
      .filter((assignment) => !requestedKeys.has(assignmentKey(assignment)))
      .map((assignment) => assignment.assignment_id),
    assignmentsToInsert: assignments.filter((assignment) => !previousByKey.has(assignmentKey(assignment))),
    fullAdministrator: false,
    manageableKeys: requestedKeys,
    safePreviousAssignments: manageablePrevious.map(decorateDelegatedAssignment),
  };
}

/** @param {DelegatedAuthorityInput} input */
function actorHasDelegatedAssignmentAuthority({
  actorAssignments,
  clientsById,
  projectsById,
  workspace,
}) {
  return actorAssignments.some((assignment) => (
    ROLE_LIMITS[assignment.role_id]?.size > 0
    && workspaceTypeAllowsRole(workspace.workspace_type, assignment.role_id)
    && assignmentAllowsAction(assignment, "roles.assign", {
      operation: "update",
      workspace_id: workspace.workspace_id,
    })
    && Boolean(freshAssignmentResource(
      assignment,
      clientsById,
      projectsById,
      workspace.workspace_id,
    ))
  ));
}

/** @param {{actor: PermissionUserRow, actorAssignments: PermissionAssignmentRow[], session: WorkspaceRequestSession, targetUser: PermissionUserRow, workspace: PermissionWorkspaceRow}} input */
function assertFreshRoleAssignmentActors({ actor, actorAssignments, session, targetUser, workspace }) {
  const workspaceIsActive = String(workspace?.status || "").toLowerCase() === "active";
  const actorHasInstallationAuthority = normalizeProtectedUserFlag(actor?.protected_user)
    || actorAssignments.some((/** @type {{ role_id: string; scope_type: string; }} */ assignment) => (
      assignment.role_id === "super_admin"
      && assignment.scope_type === "all"
    ));
  const actorIsActive = actor?.user_status === "active"
    && (actor?.membership_status === "active" || actorHasInstallationAuthority);
  const targetIsActive = targetUser?.user_status === "active" && targetUser?.membership_status === "active";

  if (!workspaceIsActive || !actorIsActive) {
    throw new AppError("Your role-assignment authority changed. Refresh and try again.", 409);
  }

  if (!targetIsActive) {
    throw new AppError("The account is not an active member of this workspace.", 409);
  }

  if (
    targetUser.user_id === session.user_id
    || normalizeProtectedUserFlag(targetUser.protected_user)
  ) {
    throw new AppError("Role assignments cannot be changed for that account.", 400);
  }
}

/** @param {PermissionUserRow} actor @param {PermissionAssignmentRow[]} actorAssignments @param {string} workspaceId */
function actorHasFullAssignmentAuthority(actor, actorAssignments, workspaceId) {
  if (normalizeProtectedUserFlag(actor?.protected_user)) {
    return true;
  }

  return actorAssignments.some((assignment) => (
    (
      assignment.role_id === "super_admin"
      && assignment.scope_type === "all"
    )
    || (
      assignment.role_id === "workspace_admin"
      && assignment.scope_type === "workspace"
      && assignment.scope_id === workspaceId
    )
  ) && assignmentAllowsAction(assignment, "roles.assign", {
    operation: "update",
    workspace_id: workspaceId,
  }));
}

/** @param {DelegatedAuthorityInput & {assignment: PermissionAssignmentInput}} input */
function canAssignRoleFromFreshState({
  actorAssignments,
  assignment,
  clientsById,
  projectsById,
  workspace,
}) {
  if (!workspaceTypeAllowsRole(workspace.workspace_type, assignment.role_id)) {
    return false;
  }

  const resource = freshAssignmentResource(
    assignment,
    clientsById,
    projectsById,
    workspace.workspace_id,
  );
  if (!resource) {
    return false;
  }

  return actorAssignments.some((actorAssignment) => {
    if (!workspaceTypeAllowsRole(workspace.workspace_type, actorAssignment.role_id)) {
      return false;
    }

    if (!assignmentAllowsAction(actorAssignment, "roles.assign", {
      operation: "update",
      workspace_id: workspace.workspace_id,
    })) {
      return false;
    }

    if (
      actorAssignment.role_id === "super_admin"
      && actorAssignment.scope_type === "all"
    ) {
      return ROLE_LIMITS.super_admin.has(assignment.role_id);
    }

    if (
      actorAssignment.role_id === "workspace_admin"
      && actorAssignment.scope_type === "workspace"
      && actorAssignment.scope_id === workspace.workspace_id
    ) {
      return ROLE_LIMITS.workspace_admin.has(assignment.role_id);
    }

    return ROLE_LIMITS[actorAssignment.role_id]?.has(assignment.role_id)
      && assignmentMatchesResource(actorAssignment, resource, {
        workspace_id: workspace.workspace_id,
      });
  });
}

/** @param {{assignment: PermissionAssignmentInput, clientsById: Map<string, PermissionClientRow>, projectsById: Map<string, PermissionProjectRow>, workspace: PermissionWorkspaceRow}} input */
function assertFreshAssignmentScope({ assignment, clientsById, projectsById, workspace }) {
  if (!workspaceTypeAllowsRole(workspace.workspace_type, assignment.role_id)) {
    throw new AppError("That role is not available for this workspace type.", 403);
  }

  if (assignment.scope_type !== ROLE_SCOPE_TYPES[assignment.role_id]) {
    throw new AppError("Role assignment scope does not match the selected role.", 400);
  }

  if (assignment.scope_type === "workspace" && assignment.scope_id !== workspace.workspace_id) {
    throw new AppError("Role assignment scope does not belong to this workspace.", 400);
  }

  if (assignment.scope_type === "all" && assignment.scope_id !== "all") {
    throw new AppError("Role assignment scope does not match the selected role.", 400);
  }

  const scopeId = assignment.scope_id || "";
  if (assignment.scope_type === "client" && !clientsById.has(scopeId)) {
    throw new AppError("Role assignment scope does not belong to this workspace.", 400);
  }

  if (assignment.scope_type === "project" && !projectsById.has(scopeId)) {
    throw new AppError("Role assignment scope does not belong to this workspace.", 400);
  }
}

/** @param {PermissionAssignmentInput} assignment @param {Map<string, PermissionClientRow>} clientsById @param {Map<string, PermissionProjectRow>} projectsById @param {string} workspaceId @returns {PermissionResource|null} */
function freshAssignmentResource(assignment, clientsById, projectsById, workspaceId) {
  if (assignment.scope_type === "all" || assignment.scope_type === "workspace") {
    return { workspace_id: workspaceId };
  }

  const scopeId = assignment.scope_id || "";
  if (assignment.scope_type === "client") {
    const client = clientsById.get(scopeId);
    if (!client || client.status === "Inactive") {
      return null;
    }

    return {
      client_id: scopeId,
      workspace_id: workspaceId,
    };
  }

  if (assignment.scope_type === "project") {
    const project = projectsById.get(scopeId);
    if (!project || project.status === "Inactive") {
      return null;
    }
    const client = project.client_id ? clientsById.get(project.client_id) : null;
    if (project.client_id && (!client || client.status === "Inactive")) {
      return null;
    }

    return {
      client_id: project.client_id || "",
      project_id: project.id,
      workspace_id: workspaceId,
    };
  }

  return null;
}

/**
 * @param {WorkspaceRequestSession} session
 * @param {PermissionAssignmentRow} assignment
 */
async function canAssignExistingRole(session, assignment) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id, session);
  if (!workspaceTypeAllowsRole(settings.workspaceType, assignment.role_id)) {
    return false;
  }

  return canAssignRole(session, {
    roleId: assignment.role_id,
    scopeId: assignment.scope_id || "",
    scopeType: assignment.scope_type,
  });
}

/** @param {PermissionAssignmentRow[]} assignments @param {{actorUserId: string, targetUserId: string, workspaceId: string}} context */
function createDelegatedAssignmentRevision(assignments, {
  actorUserId,
  targetUserId,
  workspaceId,
}) {
  const revisionSource = assignments
    .map((assignment) => [
      assignment.assignment_id,
      assignment.role_id,
      assignment.scope_type,
      assignment.scope_id || "",
      assignment.updated_at,
    ].join("\u001f"))
    .sort()
    .join("\u001e");

  return createHmac("sha256", DELEGATED_ASSIGNMENT_REVISION_SECRET)
    .update([actorUserId, targetUserId, workspaceId, revisionSource].join("\u001d"))
    .digest("hex");
}

/**
 * @param {PermissionAssignmentInput} assignment
 */
function assignmentKey(assignment) {
  return [
    assignment.role_id,
    assignment.scope_type,
    assignment.scope_id || "",
  ].join("\u001f");
}

/** @param {PermissionAssignmentRow} assignment */
function decorateDelegatedAssignment(assignment) {
  return {
    role_id: assignment.role_id,
    scope_type: assignment.scope_type,
    scope_id: assignment.scope_id,
  };
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 * @param {PermissionResource} resource
 */
async function can(session, action, resource) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  const evaluatedResource = resource || { workspace_id: workspaceSession.workspace_id };

  if (await isInstallationSuperAdmin(workspaceSession)) {
    return true;
  }

  const user = await readCurrentUser(workspaceSession);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await readAssignmentsForSession(workspaceSession);
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => {
    const permissions = permissionsByRole.get(assignment.role_id) || new Set();

    return permissions.has(action) &&
      assignmentMatchesResource(assignment, evaluatedResource, workspaceSession) &&
      assignmentAllowsAction(assignment, action, evaluatedResource);
  });
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 * @param {PermissionResource} resource
 */
async function assertCan(session, action, resource) {
  if (await can(session, action, resource)) {
    return;
  }

  await recordAuthorizationDenied(session, action, resource);
  throw new AppError("You do not have permission to perform that action.", 403);
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 * @param {PermissionResource} [resource]
 * @returns {Promise<WorkspaceRequestSession>}
 */
async function assertCanInAnyScope(session, action, resource) {
  if (await canInAnyScope(session, action, resource)) {
    return /** @type {WorkspaceRequestSession} */ (session);
  }

  await recordAuthorizationDenied(session, action, resource);
  throw new AppError("You do not have permission to perform that action.", 403);
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 * @param {PermissionResource | undefined} resource
 */
async function recordAuthorizationDenied(session, action, resource) {
  const { securityEventsService } = await import("../security/security-events.js");
  await securityEventsService.record({
    actorUserId: session?.user_id,
    actorUserName: session?.username,
    eventType: "security.authorization.denied",
    ipAddress: session && "ip_address" in session ? session.ip_address : undefined,
    metadata: {
      operation: resource?.operation,
      permission: action,
      resource_type: actionToResourceKey(action),
    },
    outcome: "denied",
    reasonClass: "missing_permission",
    session,
    workspaceId: session?.workspace_id,
  });
}

/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 * @param {PermissionResource} [resource]
 */
async function canInAnyScope(session, action, resource) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  const evaluatedResource = resource || { workspace_id: workspaceSession.workspace_id };

  if (await isInstallationSuperAdmin(workspaceSession)) {
    return true;
  }

  const user = await readCurrentUser(workspaceSession);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return true;
  }

  const assignments = await readAssignmentsForSession(workspaceSession);
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => (
    (permissionsByRole.get(assignment.role_id) || new Set()).has(action) &&
    assignmentAllowsAction(assignment, action, evaluatedResource)
  ));
}

/**
 * @param {PermissionSession | null | undefined} session
 */
async function listGrantedPermissionIdsInAnyScope(session) {
  if (!session?.workspace_id || !session?.user_id) {
    return [];
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  const allPermissionIds = await permissionsRepository.readPermissionIds();
  if (await isInstallationSuperAdmin(workspaceSession)) {
    return allPermissionIds;
  }

  const user = await readCurrentUser(workspaceSession);
  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return allPermissionIds;
  }

  const [assignments, permissionsByRole] = await Promise.all([
    readAssignmentsForSession(workspaceSession),
    readPermissionsByRole(),
  ]);

  return allPermissionIds.filter((permissionId) => assignments.some((assignment) => (
    (permissionsByRole.get(assignment.role_id) || new Set()).has(permissionId) &&
    assignmentAllowsAction(assignment, permissionId, {
      workspace_id: workspaceSession.workspace_id,
    })
  )));
}

// Precomputes one synchronous permission predicate for row-scale filtering:
// the session-level checks run once and permission_overrides_json parses once
// per assignment, instead of per row. Semantics match can(session, action,
// resource) exactly for resources carrying { workspace_id, client_id,
// project_id, operation }.
/**
 * @param {PermissionSession | null | undefined} session
 * @param {string} action
 */
/** @param {PermissionSession|null|undefined} session @param {string} action @param {{operation?: string}} [options] @returns {Promise<(resource?: PermissionResource) => boolean>} */
async function createPermissionEvaluator(session, action, { operation = "read" } = {}) {
  if (!session?.workspace_id || !session?.user_id) {
    return () => false;
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  if (await isInstallationSuperAdmin(workspaceSession)) {
    return () => true;
  }

  const user = await readCurrentUser(workspaceSession);

  if (normalizeProtectedUserFlag(user?.protected_user)) {
    return () => true;
  }

  const [assignments, permissionsByRole] = await Promise.all([
    readAssignmentsForSession(workspaceSession),
    readPermissionsByRole(),
  ]);
  const preparedAssignments = assignments
    .filter((assignment) => (permissionsByRole.get(assignment.role_id) || new Set()).has(action))
    .map((assignment) => ({
      assignment,
      overrides: parseJsonObject(assignment.permission_overrides_json),
    }));

  return (resource = { workspace_id: workspaceSession.workspace_id }) => {
    const evaluatedResource = { operation, ...resource };

    return preparedAssignments.some(({ assignment, overrides }) => (
      assignmentMatchesResource(assignment, evaluatedResource, workspaceSession) &&
      overridesAllowAction(overrides, action, evaluatedResource)
    ));
  };
}

/** @template T @param {PermissionSession & {workspace_id: string}} session @param {T[]} clients @returns {Promise<T[]>} */
async function filterReadableClients(session, clients) {
  if (await can(session, "clients.manage", { workspace_id: session.workspace_id, operation: "read" })) {
    return clients;
  }

  const readableScopes = await readReadableScopes(session);
  return clients.filter((client) => readableScopes.clientIds.has(/** @type {LooseRecord} */ (client).id));
}

/** @template T @param {PermissionSession & {workspace_id: string}} session @param {T[]} projects @returns {Promise<T[]>} */
async function filterReadableProjects(session, projects) {
  if (await can(session, "projects.manage", { workspace_id: session.workspace_id, operation: "read" })) {
    return projects;
  }

  const readableScopes = await readReadableScopes(session);
  return projects.filter((project) => {
    const record = /** @type {LooseRecord} */ (project);
    return readableScopes.clientIds.has(record.client_id) || readableScopes.projectIds.has(record.id);
  });
}

/** @template T @param {WorkspaceRequestSession} session @param {T[]} entries @returns {Promise<T[]>} */
async function filterReadableTimeEntries(session, entries) {
  const visibility = await readTimeEntryVisibility(session);

  if (visibility.all) {
    return entries;
  }

  return entries.filter((entry) => {
    const record = /** @type {LooseRecord} */ (entry);
    return (
    (
      record.user_id === visibility.userId ||
      visibility.editAllClientIds.includes(record.client_id) ||
      visibility.editAllProjectIds.includes(record.project_id)
    ) &&
    (
      visibility.clientIds.includes(record.client_id) ||
      visibility.projectIds.includes(record.project_id)
    )
  );
  });
}

/**
 * @param {WorkspaceRequestSession} session
 */
async function readTimeEntryVisibility(session) {
  if (await can(session, "time_entries.edit_all", {
    workspace_id: session.workspace_id,
    operation: "read",
  })) {
    return {
      all: true,
      clientIds: [],
      editAllClientIds: [],
      editAllProjectIds: [],
      projectIds: [],
      userId: session.user_id,
    };
  }

  const readableScopes = await readReadableScopes(session);
  return {
    all: false,
    clientIds: [...readableScopes.clientIds],
    editAllClientIds: [...readableScopes.editAllClientIds],
    editAllProjectIds: [...readableScopes.editAllProjectIds],
    projectIds: [...readableScopes.projectIds],
    userId: session.user_id,
  };
}

/** @template T @param {WorkspaceRequestSession} session @param {T[]} tasks @returns {Promise<T[]>} */
async function filterReadableTasks(session, tasks) {
  const canReadTask = await createPermissionEvaluator(session, "tasks.view");

  return tasks.filter((task) => {
    const record = /** @type {LooseRecord} */ (task);
    return canReadTask({
    workspace_id: session.workspace_id,
    client_id: record.client_id === null || record.client_id === undefined ? null : String(record.client_id),
    project_id: record.project_id === null || record.project_id === undefined ? null : String(record.project_id),
  });
  });
}

/** @param {WorkspaceRequestSession} session @param {LooseRecord[]} assignments @returns {Promise<PermissionAssignmentInput[]>} */
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

/** @param {WorkspaceRequestSession} session @param {string} scopeType @param {string} scopeId */
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

/**
 * @param {WorkspaceRequestSession} session
 * @param {string} roleId
 */
async function assertWorkspaceTypeAllowsRole(session, roleId) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id, session);

  if (workspaceTypeAllowsRole(settings.workspaceType, roleId)) {
    return;
  }

  throw new AppError("That role is not available for this workspace type.", 403);
}

/**
 * @param {string} workspaceType
 * @param {string} roleId
 */
function workspaceTypeAllowsRole(workspaceType, roleId) {
  return workspaceType === "business" ||
    (workspaceType === "family" && FAMILY_ROLE_LIMITS.has(roleId)) ||
    (workspaceType === "personal" && PERSONAL_ROLE_LIMITS.has(roleId));
}

/**
 * @param {PermissionSession | null | undefined} session
 * @returns {Promise<WorkspaceRequestSession>}
 */
async function assertCanAssignRoles(session) {
  if (session?.workspace_id && session.user_id) {
    const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
    if (await hasAssignableRoleScope(workspaceSession)) {
      return workspaceSession;
    }
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

/**
 * @param {WorkspaceRequestSession} session
 */
async function hasAssignableRoleScope(session) {
  if (await isInstallationSuperAdmin(session)) {
    return true;
  }

  const assignments = await readAssignmentsForSession(session);
  const permissionsByRole = await readPermissionsByRole();

  return assignments.some((assignment) => (
    (permissionsByRole.get(assignment.role_id) || new Set()).has("roles.assign") &&
    assignmentAllowsAction(assignment, "roles.assign", {
      operation: "update",
      workspace_id: session.workspace_id,
    })
  ));
}

/** @param {WorkspaceRequestSession} session @param {RequestedAssignment} requestedAssignment */
async function canAssignRole(session, requestedAssignment) {
  if (await isInstallationSuperAdmin(session)) {
    return ROLE_LIMITS.super_admin.has(requestedAssignment.roleId);
  }

  const assignments = await readAssignmentsForSession(session);
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

  const user = await readCurrentUser(session);
  return normalizeProtectedUserFlag(user?.protected_user) && ROLE_LIMITS.super_admin.has(roleId);
}

/** @param {string} workspaceId @param {RequestedAssignment} assignment @returns {Promise<PermissionResource>} */
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

/**
 * @param {PermissionSession | null | undefined} session
 */
async function isSuperAdmin(session) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  return isInstallationSuperAdmin(session);
}

/**
 * @param {PermissionSession} session
 */
async function isInstallationSuperAdmin(session) {
  const cache = readRequestCache(session);
  const userId = session?.user_id || "";

  if (!userId) {
    return false;
  }

  if (!cache.superAdmins.has(userId)) {
    const user = await usersRepository.readFirstByUserId(userId);
    cache.superAdmins.set(
      userId,
      normalizeProtectedUserFlag(user?.protected_user) ||
        await permissionsRepository.hasSuperAdminAssignment(userId),
    );
  }

  return cache.superAdmins.get(userId);
}

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession} session
 */
async function isWorkspaceAdministrator(session) {
  if (!session?.workspace_id || !session?.user_id) {
    return false;
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  if (await isSuperAdmin(workspaceSession)) {
    return true;
  }

  const assignments = await readAssignmentsForSession(workspaceSession);
  return assignments.some((assignment) => (
    assignment.role_id === "workspace_admin" &&
    assignmentMatchesResource(assignment, { workspace_id: workspaceSession.workspace_id }, workspaceSession)
  ));
}

/**
 * @param {PermissionSession & {workspace_id: string}} session
 */
async function readReadableScopes(session) {
  const assignments = await readAssignmentsForSession(session);
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

/**
 * @param {PermissionSession & {workspace_id: string}} session
 */
async function readCurrentUser(session) {
  const cache = readRequestCache(session);
  const cacheKey = `${session.workspace_id}:${session.user_id}`;

  if (!cache.users.has(cacheKey)) {
    cache.users.set(cacheKey, await usersRepository.readById(session.workspace_id, session.user_id));
  }

  return cache.users.get(cacheKey);
}

/**
 * @param {PermissionSession & {workspace_id: string}} session
 */
async function readAssignmentsForSession(session) {
  const cache = readRequestCache(session);
  const cacheKey = `${session.workspace_id}:${session.user_id}`;
  const cachedAssignments = cache.assignments.get(cacheKey);
  if (cachedAssignments) {
    return cachedAssignments;
  }

  const assignments = await permissionsRepository.readAssignmentsForUser(
    session.workspace_id,
    session.user_id,
  );
  cache.assignments.set(cacheKey, assignments);
  return assignments;
}

/**
 * @param {PermissionSession} session
 * @returns {{ assignments: Map<string, PermissionAssignment[]>, superAdmins: Map<string, boolean>, users: Map<string, Awaited<ReturnType<typeof usersRepository.readById>>> }}
 */
function readRequestCache(session) {
  return {
    assignments: readRequestScopedCache(session, "permissions.assignments"),
    superAdmins: readRequestScopedCache(session, "permissions.superAdmins"),
    users: readRequestScopedCache(session, "permissions.users"),
  };
}

/**
 * @param {string} workspaceId
 * @param {string} userId
 */
async function readDecoratedAssignments(workspaceId, userId) {
  const assignments = await permissionsRepository.readAssignmentsForUser(workspaceId, userId);
  return assignments.map(decorateAssignment);
}

/** @param {PermissionAssignmentRow} assignment */
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

/**
 * @param {PermissionAssignment} assignment
 * @param {PermissionResource} resource
 * @param {{ workspace_id: string }} session
 */
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

/**
 * @param {PermissionAssignment} assignment
 * @param {string} action
 * @param {PermissionResource} resource
 */
function assignmentAllowsAction(assignment, action, resource) {
  return overridesAllowAction(parseJsonObject(assignment.permission_overrides_json), action, resource);
}

/**
 * @param {PermissionOverrides} overrides
 * @param {string} action
 * @param {PermissionResource} resource
 */
function overridesAllowAction(overrides, action, resource) {
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

/**
 * @param {string} action
 */
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

/**
 * @param {string} action
 */
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

  if (action.startsWith("tags.")) {
    return "tags";
  }

  return "";
}

/** @returns {Promise<Map<string, Set<string>>>} */
async function readPermissionsByRole() {
  if (rolePermissionsCache) {
    return rolePermissionsCache;
  }

  const rows = await permissionsRepository.readRolePermissions();
  /** @type {Map<string, Set<string>>} */
  const permissionsByRole = new Map();
  rows.forEach((row) => {
    if (!permissionsByRole.has(row.role_id)) {
      permissionsByRole.set(row.role_id, new Set());
    }

    const permissionSet = permissionsByRole.get(row.role_id);
    if (permissionSet) {
      permissionSet.add(row.permission_id);
    }
  });
  rolePermissionsCache = permissionsByRole;

  return rolePermissionsCache;
}

/**
 * @param {unknown} value
 */
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

/** @param {unknown} [operationAccess] @returns {Record<string, Record<string, boolean>>} */
function normalizeOperationAccess(operationAccess = {}) {
  /** @type {Record<string, Record<string, boolean>>} */
  const normalized = {};
  if (!operationAccess || typeof operationAccess !== "object" || Array.isArray(operationAccess)) {
    return normalized;
  }

  Object.entries(operationAccess).forEach(([resource, operations]) => {
    normalized[resource] = {};

    Object.entries(operations && typeof operations === "object" && !Array.isArray(operations) ? operations : {}).forEach(([operation, allowed]) => {
      normalized[resource][operation] = allowed !== false;
    });
  });

  return normalized;
}

/**
 * @param {unknown} value
 */
function parseJsonObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

export const permissionsService = {
  assertCan,
  assertCanInAnyScope,
  can,
  canInAnyScope,
  createPermissionEvaluator,
  filterReadableClients,
  filterReadableProjects,
  filterReadableTasks,
  filterReadableTimeEntries,
  hasUsableDelegatedRoleScope,
  readTimeEntryVisibility,
  isSuperAdmin,
  isWorkspaceAdministrator,
  listGrantedPermissionIdsInAnyScope,
  listAssignableRoleOptions,
  listRoleOptions,
  lookupDelegatedRoleAssignmentAccount,
  readUserAssignments,
  replaceUserAssignments,
  validateUserAssignments,
};
