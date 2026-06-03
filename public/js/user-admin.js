const userAdminForm = document.querySelector("[data-user-admin-form]");
const newUserUsernameInput = document.querySelector("[data-new-user-username]");
const newUserRoleSelect = document.querySelector("[data-new-user-role]");
const createUserButton = document.querySelector("[data-create-user]");
const generatedPasswordPanel = document.querySelector("[data-generated-password-panel]");
const generatedPasswordInput = document.querySelector("[data-generated-password]");
const copyGeneratedPasswordButton = document.querySelector("[data-copy-generated-password]");
const userAdminStatus = document.querySelector("[data-user-admin-status]");
const userList = document.querySelector("[data-user-list]");
const editUserDialog = document.querySelector("[data-edit-user-dialog]");
const editUserForm = document.querySelector("[data-edit-user-form]");
const editUserIdInput = document.querySelector("[data-edit-user-id]");
const editUserUsernameInput = document.querySelector("[data-edit-user-username]");
const editUserDisplayNameInput = document.querySelector("[data-edit-user-display-name]");
const editUserAltEmailInput = document.querySelector("[data-edit-user-alt-email]");
const editUserTimezoneSelect = document.querySelector("[data-edit-user-timezone]");
const cancelEditUserButton = document.querySelector("[data-cancel-edit-user]");
const resetEditUserPasswordButton = document.querySelector("[data-reset-edit-user-password]");
const saveEditUserButton = document.querySelector("[data-save-edit-user]");
const workspaceMembershipList = document.querySelector("[data-workspace-membership-list]");
const roleAssignmentRoleSelect = document.querySelector("[data-role-assignment-role]");
const roleAssignmentScopeSelect = document.querySelector("[data-role-assignment-scope]");
const addRoleAssignmentButton = document.querySelector("[data-add-role-assignment]");
const roleAssignmentList = document.querySelector("[data-role-assignment-list]");
const configureDraftPermissionsButton = document.querySelector("[data-configure-draft-permissions]");
const rolePermissionsDialog = document.querySelector("[data-role-permissions-dialog]");
const rolePermissionsForm = document.querySelector("[data-role-permissions-form]");
const rolePermissionsSummary = document.querySelector("[data-role-permissions-summary]");
const permissionMatrix = document.querySelector("[data-permission-matrix]");
const cancelRolePermissionsButton = document.querySelector("[data-cancel-role-permissions]");

const PERMISSION_RESOURCES = [
  { id: "time_entries", label: "Time Entries", operations: ["create", "read", "update", "delete"] },
  { id: "workspace_settings", label: "Workspace Settings", operations: ["read", "update"] },
  { id: "clients", label: "Client Settings", operations: ["create", "read", "update", "delete"] },
  { id: "projects", label: "Project Settings", operations: ["create", "read", "update", "delete"] },
  { id: "users", label: "Users", operations: ["create", "read", "update", "delete"] },
  { id: "reporting", label: "Reporting", operations: ["read"] },
  { id: "audit_logs", label: "Audit Logs", operations: ["read"] },
  { id: "tasks", label: "Tasks", operations: ["create", "read", "update", "delete"] },
  { id: "tickets", label: "Tickets", operations: ["create", "read", "update", "delete"] },
  { id: "notes", label: "Notes", operations: ["create", "read", "update", "delete"] },
  { id: "knowledge_base", label: "Knowledge Base", operations: ["create", "read", "update", "delete"] },
];

let users = [];
let roles = [];
let clients = [];
let workspaces = [];
let activeWorkspaceType = "business";
let pendingRoleAssignments = [];
let draftPermissionOverrides = createDefaultPermissionOverrides();
let editingPermissionTarget = null;
let openedUserFromQuery = false;

loadUsers();

userAdminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createUser();
});

copyGeneratedPasswordButton.addEventListener("click", async () => {
  await copyGeneratedPassword();
});

editUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveEditedUser();
});

cancelEditUserButton.addEventListener("click", closeEditUserDialog);

addRoleAssignmentButton.addEventListener("click", addPendingRoleAssignment);

roleAssignmentRoleSelect.addEventListener("change", renderScopeOptions);

configureDraftPermissionsButton.addEventListener("click", () => {
  const role = roles.find((item) => item.role_id === roleAssignmentRoleSelect.value);
  const scopeLabel = role ? formatScopeLabel(getDraftAssignment(role)) : "New assignment";

  openPermissionDialog({
    title: `${role?.role_name || "New Role"} - ${scopeLabel}`,
    overrides: draftPermissionOverrides,
    onSave: (overrides) => {
      draftPermissionOverrides = overrides;
    },
  });
});

rolePermissionsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  savePermissionDialog();
});

cancelRolePermissionsButton.addEventListener("click", closePermissionDialog);

resetEditUserPasswordButton.addEventListener("click", async () => {
  const user = getEditingUser();

  if (user) {
    await resetUserPassword(user);
  }
});

async function loadUsers() {
  setUserAdminStatus("Loading users...");

  try {
    const [usersBody, rolesBody, clientProjectBody, workspacesBody, settingsBody] = await Promise.all([
      window.LongtailForge.api.getJson("/api/users", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/roles", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/client-projects", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/workspaces", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }),
    ]);

    roles = rolesBody.roles || [];
    clients = clientProjectBody.clients || [];
    workspaces = workspacesBody.workspaces || [];
    activeWorkspaceType = normalizeWorkspaceType(settingsBody.workspaceType);
    applyUserCreationAvailability();
    renderRoleOptions();
    renderUsers(usersBody.users || []);
    openUserFromQuery();
    setUserAdminStatus("");
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setUserAdminStatus(error.message || "Users could not be loaded.", true);
  }
}

async function createUser() {
  if (activeWorkspaceType === "personal") {
    setUserAdminStatus("Personal workspaces can only have the creator as a user.", true);
    return;
  }

  const username = newUserUsernameInput.value.trim().toLowerCase();

  if (!isValidEmail(username)) {
    setUserAdminStatus("Enter a valid email address.", true);
    return;
  }

  const initialRoleId = newUserRoleSelect?.value || "";
  const assignments = initialRoleId
    ? [{
        role_id: initialRoleId,
        scope_type: initialRoleId === "super_admin" ? "all" : "workspace",
        scope_id: initialRoleId === "super_admin" ? "all" : "workspace",
        permission_overrides: createDefaultPermissionOverrides(),
      }]
    : [];

  createUserButton.disabled = true;
  setUserAdminStatus("Creating user...");

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, assignments }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "User was not created.");
    }

    userAdminForm.reset();
    showGeneratedPassword(body.initialPassword || "");
    renderUsers(body.users || []);
    setUserAdminStatus(`Created ${body.user?.username || username}.`);
  } catch (error) {
    setUserAdminStatus(error.message || "User was not created.", true);
  } finally {
    createUserButton.disabled = false;
  }
}

function applyUserCreationAvailability() {
  const canCreateUsers = activeWorkspaceType !== "personal";

  createUserButton.disabled = !canCreateUsers;
  newUserUsernameInput.disabled = !canCreateUsers;
  newUserRoleSelect.disabled = !canCreateUsers;

  if (!canCreateUsers) {
    newUserUsernameInput.value = "";
  }
}

function normalizeWorkspaceType(workspaceType) {
  return ["business", "personal", "family"].includes(workspaceType)
    ? workspaceType
    : "business";
}

function renderUsers(nextUsers) {
  users = Array.isArray(nextUsers) ? nextUsers : [];
  renderUserRows(users);
}

function openUserFromQuery() {
  if (openedUserFromQuery) {
    return;
  }

  const userId = new URLSearchParams(window.location.search).get("user") || "";
  const user = users.find((item) => item.user_id === userId);

  if (!user) {
    return;
  }

  openedUserFromQuery = true;
  openEditUserDialog(user);
}

function renderUserRows(users) {
  userList.replaceChildren();

  if (users.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent = "No users yet.";
    row.appendChild(cell);
    userList.appendChild(row);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");

    row.append(
      createTableCell(formatUsername(user)),
      createTableCell(user.displayName || ""),
      createTableCell(formatUserStatus(user.userStatus)),
      createActionsCell(user),
    );
    userList.appendChild(row);
  });
}

function createActionsCell(user) {
  const cell = document.createElement("td");
  const actions = document.createElement("div");
  const isProtected = Boolean(user.protectedUser);

  actions.className = "table-actions";
  actions.append(
    createUserActionButton("Edit User", () => openEditUserDialog(user)),
    createUserActionButton("Reset Password", () => resetUserPassword(user)),
    createUserActionButton(
      user.userStatus === "inactive" ? "Reactivate User" : "Deactivate User",
      () => toggleUserStatus(user),
      isProtected,
    ),
    createUserActionButton(
      "Delete User",
      () => deleteUser(user),
      isProtected,
      "danger-button",
    ),
  );
  cell.appendChild(actions);

  return cell;
}

function createUserActionButton(label, onClick, disabled = false, className = "") {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;

  if (className) {
    button.classList.add(className);
  }

  button.addEventListener("click", onClick);
  return button;
}

async function openEditUserDialog(user) {
  editUserIdInput.value = user.user_id;
  editUserUsernameInput.value = user.username;
  editUserDisplayNameInput.value = user.displayName || user.username;
  editUserAltEmailInput.value = user.altEmail || "";
  setEditUserTimezoneValue(user.timezone || "America/New_York");
  renderWorkspaceMemberships(user.workspaceMemberships || [], user);
  pendingRoleAssignments = [];
  draftPermissionOverrides = createDefaultPermissionOverrides();
  renderPendingRoleAssignments();
  editUserDialog.showModal();
  editUserUsernameInput.focus();

  try {
    const body = await window.LongtailForge.api.getJson(
      `/api/users/${encodeURIComponent(user.user_id)}/role-assignments`,
      { cache: "no-store" },
    );

    pendingRoleAssignments = body.assignments || [];
    renderPendingRoleAssignments();
  } catch (error) {
    setUserAdminStatus(error.message || "Role assignments could not be loaded.", true);
  }
}

function closeEditUserDialog() {
  if (editUserDialog.open) {
    editUserDialog.close();
  }

  editUserForm.reset();
  renderWorkspaceMemberships([], null);
}

function getEditingUser() {
  return users.find((user) => user.user_id === editUserIdInput.value);
}

async function saveEditedUser() {
  const user = getEditingUser();
  const username = editUserUsernameInput.value.trim().toLowerCase();
  const displayName = editUserDisplayNameInput.value.trim();
  const altEmail = editUserAltEmailInput.value.trim().toLowerCase();
  const timezone = editUserTimezoneSelect.value;

  if (!user || !isValidEmail(username)) {
    setUserAdminStatus("Enter a valid email address.", true);
    return;
  }

  if (!displayName) {
    setUserAdminStatus("Display name is required.", true);
    return;
  }

  if (altEmail && !isValidEmail(altEmail)) {
    setUserAdminStatus("Enter a valid alternate email address or leave it blank.", true);
    return;
  }

  saveEditUserButton.disabled = true;
  setUserAdminStatus("Saving user...");

  try {
    const body = await window.LongtailForge.api.putJson(
      `/api/users/${encodeURIComponent(user.user_id)}/update`,
      {
        username,
        displayName,
        altEmail,
        timezone,
        workspaceMemberships: readSelectedWorkspaceMemberships(),
      },
    );
    await window.LongtailForge.api.putJson(
      `/api/users/${encodeURIComponent(user.user_id)}/role-assignments`,
      { assignments: pendingRoleAssignments },
    );

    closeEditUserDialog();
    renderUsers(body.users || []);
    setUserAdminStatus(`Saved ${body.user?.username || username}.`);
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setUserAdminStatus(error.message || "User was not saved.", true);
  } finally {
    saveEditUserButton.disabled = false;
  }
}

function renderRoleOptions() {
  roleAssignmentRoleSelect.replaceChildren();

  roles.forEach((role) => {
    const option = document.createElement("option");

    option.value = role.role_id;
    option.textContent = role.role_name;
    option.dataset.scopeType = role.assignable_scope_type;
    roleAssignmentRoleSelect.appendChild(option);
  });

  if (newUserRoleSelect) {
    newUserRoleSelect.replaceChildren(createRoleOption("", "No initial role"));

    roles
      .filter((role) => ["workspace", "global"].includes(role.assignable_scope_type))
      .forEach((role) => {
        newUserRoleSelect.appendChild(createRoleOption(role.role_id, role.role_name));
      });
  }

  renderScopeOptions();
}

function createRoleOption(value, label) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;
  return option;
}

function renderScopeOptions() {
  const role = roles.find((item) => item.role_id === roleAssignmentRoleSelect.value);
  const scopeType = role?.assignable_scope_type || "workspace";

  roleAssignmentScopeSelect.replaceChildren();
  roleAssignmentScopeSelect.disabled = scopeType === "workspace" || scopeType === "global";

  if (scopeType === "global") {
    appendScopeOption("all", "All");
    return;
  }

  if (scopeType === "workspace") {
    appendScopeOption("workspace", "Workspace");
    return;
  }

  if (scopeType === "client") {
    clients.forEach((client) => appendScopeOption(client.id, client.name));
    return;
  }

  clients.forEach((client) => {
    (client.projects || []).forEach((project) => {
      appendScopeOption(project.id, `${client.name} / ${project.name}`);
    });
  });
}

function appendScopeOption(value, label) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;
  roleAssignmentScopeSelect.appendChild(option);
}

function addPendingRoleAssignment() {
  const role = roles.find((item) => item.role_id === roleAssignmentRoleSelect.value);

  if (!role) {
    setUserAdminStatus("Choose a role before adding an assignment.", true);
    return;
  }

  const draftAssignment = getDraftAssignment(role);
  const scopeType = draftAssignment.scope_type;
  const scopeId = draftAssignment.scope_id;

  if (scopeType !== "workspace" && !scopeId) {
    setUserAdminStatus("Choose a scope before adding an assignment.", true);
    return;
  }

  const alreadyAssigned = pendingRoleAssignments.some((assignment) => (
    assignment.role_id === role.role_id &&
    assignment.scope_type === scopeType &&
    assignment.scope_id === scopeId
  ));

  if (alreadyAssigned) {
    setUserAdminStatus("That role assignment is already listed.", true);
    return;
  }

  pendingRoleAssignments.push({
    role_id: role.role_id,
    scope_type: scopeType,
    scope_id: scopeId,
    permission_overrides: clonePermissionOverrides(draftPermissionOverrides),
  });
  draftPermissionOverrides = createDefaultPermissionOverrides();
  renderPendingRoleAssignments();
  setUserAdminStatus("");
}

function renderPendingRoleAssignments() {
  roleAssignmentList.replaceChildren();

  if (pendingRoleAssignments.length === 0) {
    const emptyItem = document.createElement("li");

    emptyItem.textContent = "No roles assigned.";
    roleAssignmentList.appendChild(emptyItem);
    return;
  }

  pendingRoleAssignments.forEach((assignment, index) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const controls = document.createElement("div");
    const permissionsButton = document.createElement("button");
    const removeButton = document.createElement("button");

    label.textContent = formatRoleAssignment(assignment);
    controls.className = "role-assignment-actions";

    permissionsButton.type = "button";
    permissionsButton.textContent = "Permissions";
    permissionsButton.addEventListener("click", () => {
      openPermissionDialog({
        title: formatRoleAssignment(assignment),
        overrides: assignment.permission_overrides,
        onSave: (overrides) => {
          pendingRoleAssignments[index] = {
            ...pendingRoleAssignments[index],
            permission_overrides: overrides,
          };
          renderPendingRoleAssignments();
        },
      });
    });

    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      pendingRoleAssignments.splice(index, 1);
      renderPendingRoleAssignments();
    });

    controls.append(permissionsButton, removeButton);
    item.append(label, controls);
    roleAssignmentList.appendChild(item);
  });
}

function renderWorkspaceMemberships(memberships, user = getEditingUser()) {
  workspaceMembershipList.replaceChildren();

  if (!workspaces.length) {
    const item = document.createElement("li");

    item.textContent = "No assignable workspaces.";
    workspaceMembershipList.appendChild(item);
    return;
  }

  const activeWorkspaceIds = new Set(memberships
    .filter((membership) => membership.status !== "inactive")
    .map((membership) => membership.workspaceId));

  workspaces.forEach((workspace) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const checkbox = document.createElement("input");
    const status = document.createElement("span");
    const isPersonalOwnerOnly = workspace.workspaceType === "personal" &&
      workspace.ownerUserId &&
      workspace.ownerUserId !== user?.user_id;

    checkbox.type = "checkbox";
    checkbox.dataset.workspaceMembership = workspace.workspaceId;
    checkbox.checked = !isPersonalOwnerOnly && activeWorkspaceIds.has(workspace.workspaceId);
    checkbox.disabled = isPersonalOwnerOnly;
    name.textContent = formatWorkspaceMembershipName(workspace);
    name.className = "workspace-membership-name";
    status.className = "membership-status";
    status.textContent = isPersonalOwnerOnly
      ? "Owner only"
      : activeWorkspaceIds.has(workspace.workspaceId) ? "Active" : "Inactive";
    item.append(checkbox, name, status);
    workspaceMembershipList.appendChild(item);
  });
}

function readSelectedWorkspaceMemberships() {
  return [...workspaceMembershipList.querySelectorAll("[data-workspace-membership]")]
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.workspaceMembership);
}

function formatRoleAssignment(assignment) {
  const role = roles.find((item) => item.role_id === assignment.role_id);
  const scopeLabel = formatScopeLabel(assignment);
  const overrides = assignment.permission_overrides || {};
  const advanced = [];

  if (overrides.restrictBilling) {
    advanced.push("billing restricted");
  }

  if (overrides.allowManualTime === false) {
    advanced.push("manual time off");
  }

  if (overrides.allowEditTime === false) {
    advanced.push("edit entries off");
  }

  return `${role?.role_name || assignment.role_id} - ${scopeLabel}${advanced.length ? ` (${advanced.join(", ")})` : ""}`;
}

function formatWorkspaceMembershipName(workspace) {
  const workspaceName = workspace.workspaceName || workspace.workspaceId || "Workspace";
  const ownerUsername = workspace.ownerUsername || "";

  if (!ownerUsername || !["personal", "family"].includes(workspace.workspaceType)) {
    return workspaceName;
  }

  return `${workspaceName} [${ownerUsername}]`;
}

function formatScopeLabel(assignment) {
  if (assignment.scope_type === "all" || assignment.scope_id === "all") {
    return "All";
  }

  if (assignment.scope_type === "workspace") {
    return "Workspace";
  }

  if (assignment.scope_type === "client") {
    return clients.find((client) => client.id === assignment.scope_id)?.name || "Client";
  }

  for (const client of clients) {
    const project = (client.projects || []).find((item) => item.id === assignment.scope_id);

    if (project) {
      return `${client.name} / ${project.name}`;
    }
  }

  return "Project";
}

function getDraftAssignment(role) {
  const scopeType = role.assignable_scope_type === "global" ? "all" : role.assignable_scope_type;

  return {
    role_id: role.role_id,
    scope_type: scopeType,
    scope_id: scopeType === "all" ? "all" : scopeType === "workspace" ? "workspace" : roleAssignmentScopeSelect.value,
  };
}

function openPermissionDialog({ title, overrides, onSave }) {
  editingPermissionTarget = {
    onSave,
    overrides: normalizePermissionOverrides(overrides),
  };
  rolePermissionsSummary.textContent = title;
  renderPermissionMatrix(editingPermissionTarget.overrides);
  rolePermissionsDialog.showModal();
}

function closePermissionDialog() {
  if (rolePermissionsDialog.open) {
    rolePermissionsDialog.close();
  }

  editingPermissionTarget = null;
}

function savePermissionDialog() {
  if (!editingPermissionTarget) {
    closePermissionDialog();
    return;
  }

  editingPermissionTarget.onSave(readPermissionMatrix());
  closePermissionDialog();
}

function renderPermissionMatrix(overrides) {
  permissionMatrix.replaceChildren();

  PERMISSION_RESOURCES.forEach((resource) => {
    const row = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const operations = document.createElement("div");

    row.className = "permission-resource";
    legend.textContent = resource.label;
    operations.className = "permission-operation-list";

    resource.operations.forEach((operation) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");

      checkbox.type = "checkbox";
      checkbox.checked = getOperationAllowed(overrides, resource.id, operation);
      checkbox.dataset.permissionResource = resource.id;
      checkbox.dataset.permissionOperation = operation;
      label.append(checkbox, document.createTextNode(formatOperationLabel(operation)));
      operations.appendChild(label);
    });

    row.append(legend, operations);
    permissionMatrix.appendChild(row);
  });

  const billingLabel = document.createElement("label");
  const billingCheckbox = document.createElement("input");

  billingLabel.className = "permission-standalone";
  billingCheckbox.type = "checkbox";
  billingCheckbox.checked = Boolean(overrides.restrictBilling);
  billingCheckbox.dataset.permissionFlag = "restrictBilling";
  billingLabel.append(billingCheckbox, document.createTextNode("Restrict billing detail edits"));
  permissionMatrix.appendChild(billingLabel);
}

function readPermissionMatrix() {
  const overrides = createDefaultPermissionOverrides();
  const checkboxes = permissionMatrix.querySelectorAll("[data-permission-resource]");

  checkboxes.forEach((checkbox) => {
    const resource = checkbox.dataset.permissionResource;
    const operation = checkbox.dataset.permissionOperation;

    overrides.operationAccess[resource][operation] = checkbox.checked;
  });

  overrides.restrictBilling = Boolean(permissionMatrix.querySelector("[data-permission-flag='restrictBilling']")?.checked);
  overrides.allowManualTime = getOperationAllowed(overrides, "time_entries", "create");
  overrides.allowEditTime = getOperationAllowed(overrides, "time_entries", "update");

  return overrides;
}

function createDefaultPermissionOverrides() {
  return {
    restrictBilling: false,
    allowManualTime: true,
    allowEditTime: true,
    operationAccess: PERMISSION_RESOURCES.reduce((access, resource) => {
      access[resource.id] = resource.operations.reduce((operations, operation) => {
        operations[operation] = true;
        return operations;
      }, {});
      return access;
    }, {}),
  };
}

function normalizePermissionOverrides(overrides = {}) {
  const normalized = createDefaultPermissionOverrides();
  const operationAccess = overrides.operationAccess || {};

  normalized.restrictBilling = Boolean(overrides.restrictBilling);
  normalized.allowManualTime = overrides.allowManualTime !== false;
  normalized.allowEditTime = overrides.allowEditTime !== false;

  PERMISSION_RESOURCES.forEach((resource) => {
    resource.operations.forEach((operation) => {
      if (operationAccess[resource.id]?.[operation] === false) {
        normalized.operationAccess[resource.id][operation] = false;
      }
    });
  });

  normalized.operationAccess.time_entries.create = normalized.allowManualTime;
  normalized.operationAccess.time_entries.update = normalized.allowEditTime;
  normalized.operationAccess.time_entries.delete = normalized.allowEditTime;

  return normalized;
}

function clonePermissionOverrides(overrides) {
  return JSON.parse(JSON.stringify(normalizePermissionOverrides(overrides)));
}

function getOperationAllowed(overrides, resource, operation) {
  return overrides.operationAccess?.[resource]?.[operation] !== false;
}

function formatOperationLabel(operation) {
  return operation.charAt(0).toUpperCase() + operation.slice(1);
}

async function resetUserPassword(user) {
  await runUserAction({
    url: `/api/users/${encodeURIComponent(user.user_id)}/reset-password`,
    method: "PUT",
    successMessage: `Reset password for ${user.username}.`,
    onSuccess: (body) => {
      showGeneratedPassword(body.initialPassword || "");
      closeEditUserDialog();
    },
  });
}

async function deactivateUser(user) {
  await runUserAction({
    url: `/api/users/${encodeURIComponent(user.user_id)}/deactivate`,
    method: "PUT",
    successMessage: `Deactivated ${user.username}.`,
  });
}

async function reactivateUser(user) {
  await runUserAction({
    url: `/api/users/${encodeURIComponent(user.user_id)}/reactivate`,
    method: "PUT",
    successMessage: `Reactivated ${user.username}.`,
  });
}

async function toggleUserStatus(user) {
  if (user.userStatus === "inactive") {
    await reactivateUser(user);
    return;
  }

  await deactivateUser(user);
}

async function deleteUser(user) {
  const shouldDelete = await window.LongtailForge.modal.confirm({
    title: "Delete user?",
    message: `Delete ${user.username}? This keeps existing time entry history but removes the user account. This cannot be undone.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!shouldDelete) {
    return;
  }

  await runUserAction({
    url: `/api/users/${encodeURIComponent(user.user_id)}`,
    method: "DELETE",
    successMessage: `Deleted ${user.username}.`,
  });
}

async function runUserAction({ url, method, successMessage, onSuccess = () => {} }) {
  setUserAdminStatus("Saving user change...");

  try {
    const body = method === "DELETE"
      ? await window.LongtailForge.api.deleteJson(url)
      : await window.LongtailForge.api.putJson(url, undefined);

    onSuccess(body);
    renderUsers(body.users || []);
    setUserAdminStatus(successMessage);
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setUserAdminStatus(error.message || "User change was not saved.", true);
  }
}

function showGeneratedPassword(password) {
  generatedPasswordInput.value = password;
  generatedPasswordPanel.hidden = !password;
}

async function copyGeneratedPassword() {
  if (!generatedPasswordInput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(generatedPasswordInput.value);
  } catch {
    generatedPasswordInput.select();
    document.execCommand("copy");
  }

  const originalText = copyGeneratedPasswordButton.textContent;
  copyGeneratedPasswordButton.textContent = "Copied.";
  copyGeneratedPasswordButton.classList.add("is-saved");

  window.setTimeout(() => {
    copyGeneratedPasswordButton.textContent = originalText;
    copyGeneratedPasswordButton.classList.remove("is-saved");
  }, 1600);
}

function createTableCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  return cell;
}

function formatUsername(user) {
  return user.protectedUser ? `${user.username} (protected)` : user.username;
}

function formatUserStatus(userStatus) {
  return userStatus === "inactive" ? "Inactive" : "Active";
}

function setEditUserTimezoneValue(timezone) {
  const matchingOption = [...editUserTimezoneSelect.options].find((option) => option.value === timezone);

  if (!matchingOption) {
    const option = document.createElement("option");

    option.value = timezone;
    option.textContent = timezone;
    editUserTimezoneSelect.appendChild(option);
  }

  editUserTimezoneSelect.value = timezone;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function setUserAdminStatus(message, isError = false) {
  window.LongtailForge.pageController.setStatus(userAdminStatus, message, { isError });
  userAdminStatus.classList.toggle("is-error", isError);
}

window.LongtailForge.pageController.register("user-admin", {
  snapshot: () => ({
    activeWorkspaceType,
    clientCount: clients.length,
    pendingRoleAssignmentCount: pendingRoleAssignments.length,
    roleCount: roles.length,
    userCount: users.length,
    workspaceCount: workspaces.length,
  }),
  runSmoke: () => {
    const checks = [
      { name: "user admin form exists", ok: Boolean(userAdminForm) },
      { name: "user list exists", ok: Boolean(userList) },
      { name: "roles array loaded", ok: Array.isArray(roles) },
      { name: "users array loaded", ok: Array.isArray(users) },
      { name: "permission resources configured", ok: PERMISSION_RESOURCES.length > 0 },
    ];

    return {
      ok: checks.every((check) => check.ok),
      pageId: "user-admin",
      checks,
    };
  },
});
