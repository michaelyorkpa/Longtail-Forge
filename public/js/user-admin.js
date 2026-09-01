(function attachUserAdminPage() {
  const userAdminForm = document.querySelector("[data-user-admin-form]");
  const newUserWorkspaceSelect = document.querySelector("[data-new-user-workspace]");
  const newUserUsernameInput = document.querySelector("[data-new-user-username]");
  const findUserAccountButton = document.querySelector("[data-find-user-account]");
  const newUserAccountStatus = document.querySelector("[data-new-user-account-status]");
  const newUserRoleSelect = document.querySelector("[data-new-user-role]");
  const newUserClientScopeField = document.querySelector("[data-new-user-client-scope-field]");
  const newUserClientScopeSelect = document.querySelector("[data-new-user-client-scope]");
  const newUserProjectScopeField = document.querySelector("[data-new-user-project-scope-field]");
  const newUserProjectScopeSelect = document.querySelector("[data-new-user-project-scope]");
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
  const userSessionList = document.querySelector("[data-user-session-list]");
  const refreshUserSessionsButton = document.querySelector("[data-refresh-user-sessions]");
  const revokeUserSessionsButton = document.querySelector("[data-revoke-user-sessions]");
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

  let users = [];
  let roles = [];
  /** @type {{ id?: unknown, name?: unknown, projects?: { id?: unknown, name?: unknown }[] }[]} */
  let clients = [];
  let workspaces = [];
  let permissionResources = [];
  let activeWorkspaceType = "business";
  let addUserRoles = [];
  let addUserCanCreate = false;
  let accountLookup = null;
  let pendingRoleAssignments = [];
  let draftPermissionOverrides = createDefaultPermissionOverrides();
  let editingPermissionTarget = null;
  let openedUserFromQuery = false;
  let managedUserSessions = [];
  let currentUserId = "";

  loadUsers();

  userAdminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUser();
  });

  findUserAccountButton?.addEventListener("click", async () => {
    await findUserAccount();
  });

  newUserWorkspaceSelect?.addEventListener("change", async () => {
    resetAccountLookup();
    await loadAddUserOptions(newUserWorkspaceSelect.value);
  });

  newUserUsernameInput?.addEventListener("input", resetAccountLookup);
  newUserRoleSelect?.addEventListener("change", renderNewUserScopeOptions);

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

  refreshUserSessionsButton.addEventListener("click", async () => {
    const user = getEditingUser();
    if (user) {
      await loadUserSessions(user);
    }
  });

  revokeUserSessionsButton.addEventListener("click", async () => {
    const user = getEditingUser();
    if (user) {
      await revokeAllUserSessions(user);
    }
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} BrowserPageController */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserRecord} BrowserUserRecord */

  /**
   * The members `userRowToAppValue` constructs as text on every path.
   *
   * `password`, `home_workspace_id` and `active_workspace_id` are **deliberately absent**: the
   * select carries them and the shaper does not send them, so a record that offered them would
   * not be the one this producer builds.
   */
  const USER_TEXT_MEMBERS = Object.freeze([
    "displayName",
    "preferredLoginLanding",
    "preferredWorkspaceSwitchLanding",
    "themeAutoSource",
    "themeMode",
    "timezone",
    "user_id",
    "userStatus",
    "username",
  ]);

  /** The members the shaper builds with `normalizeBooleanPreference` or the protected-user flag. */
  const USER_BOOLEAN_MEMBERS = Object.freeze([
    "openExternalLinksNewTab",
    "passwordChangeRequired",
    "protectedUser",
  ]);

  /** The two members the shaper genuinely nulls. */
  const USER_NULLABLE_TEXT_MEMBERS = Object.freeze([
    "altEmail",
    "preferredCalendarView",
  ]);

  /**
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One user as the user-administration routes return it.
   * @param {unknown} value
   * @returns {value is BrowserUserRecord}
   */
  function isUserRecord(value) {
    return isResponseRecord(value)
      && USER_TEXT_MEMBERS.every((member) => typeof value[member] === "string")
      && USER_BOOLEAN_MEMBERS.every((member) => typeof value[member] === "boolean")
      && USER_NULLABLE_TEXT_MEMBERS.every((member) => value[member] === null || typeof value[member] === "string")
      && value.user_id !== "";
  }

  /**
   * The user list a body carries.
   *
   * **Element validation, not container validation.** `body.users || []` said only that the member
   * was there; every element then reached the renderer unchecked. A malformed element is dropped,
   * which is the same answer `0.33.33.38.4.2` gave for the note list.
   * @param {unknown} body
   * @returns {BrowserUserRecord[]}
   */
  function readUserRecords(body) {
    const envelope = isResponseRecord(body) ? body : null;
    return envelope && Array.isArray(envelope.users) ? envelope.users.filter(isUserRecord) : [];
  }

  /**
   * The single user a mutation body echoes back, or `null`.
   *
   * `null` rather than a throw: every consumer already wrote `body.user?.username || username`,
   * so an absent user already meant "fall back to the name we sent".
   * @param {unknown} body
   * @returns {BrowserUserRecord | null}
   */
  function readUserRecord(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const user = envelope ? envelope.user : null;
    return isUserRecord(user) ? user : null;
  }


  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("User Admin requires LongtailForge.errors.");
    }
    return errors;
  }

  /**
   * The page controller registry this page cannot run without.
   *
   * Acquired at the point of use rather than stored at module scope, so a missing surface still
   * fails at exactly the moment it failed before `0.33.33.38.2.6.2` made the read checked. Every
   * page that loads this script loads `shared/page-controller.js` ahead of it.
   * @returns {BrowserPageController}
   */
  function requirePageController() {
    const controller = window.LongtailForge?.pageController;
    if (!controller) {
      throw new Error("User Admin requires LongtailForge.pageController.");
    }
    return controller;
  }

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("User administration requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

  /**
   * The alert and confirmation dialogs this file cannot ask a question without. Every page that
   * loads this script also loads `shared/modal.js`, so the checked read fails exactly where the
   * raw read failed before.
   * @returns {BrowserModalDialogs}
   */
  function requireModalDialogs() {
    const dialogs = window.LongtailForge?.modal;
    if (!dialogs) {
      throw new Error("User administration requires LongtailForge.modal.");
    }
    return dialogs;
  }

  async function loadUsers() {
    setUserAdminStatus("Loading users...");

    try {
      const [usersBody, rolesBody, clientProjectBody, workspacesBody, settingsBody, permissionResourcesBody, addUserOptionsBody] = await Promise.all([
        requireApi().getJson("/api/users", { cache: "no-store" }),
        requireApi().getJson("/api/roles", { cache: "no-store" }),
        requireApi().getJson("/api/client-projects?view=options&includeInactive=1", { cache: "no-store" }),
        requireApi().getJson("/api/workspaces", { cache: "no-store" }),
        requireApi().getJson("/api/settings", { cache: "no-store" }),
        requireApi().getJson("/api/users/permission-resources", { cache: "no-store" }),
        requireApi().getJson("/api/users/add-options", { cache: "no-store" }),
      ]);

      roles = rolesBody.roles || [];
      clients = /** @type {{ id?: unknown, name?: unknown, projects?: { id?: unknown, name?: unknown }[] }[]} */ (clientProjectBody.clients || []);
      workspaces = workspacesBody.workspaces || [];
      permissionResources = normalizePermissionResources(permissionResourcesBody.resources);
      currentUserId = String(usersBody.currentUserId || "");
      draftPermissionOverrides = normalizePermissionOverrides(draftPermissionOverrides);
      activeWorkspaceType = normalizeWorkspaceType(settingsBody.workspaceType);
      renderRoleOptions();
      applyAddUserOptions(addUserOptionsBody);
      renderUsers(readUserRecords(usersBody));
      openUserFromQuery();
      setUserAdminStatus("");
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setUserAdminStatus(requireErrors().caughtMessage(error, "Users could not be loaded."), true);
    }
  }

  async function createUser() {
    if (!addUserCanCreate) {
      setUserAdminStatus("Personal workspaces can only have the creator as a user.", true);
      return;
    }

    const username = newUserUsernameInput.value.trim().toLowerCase();
    const workspaceId = newUserWorkspaceSelect?.value || "";

    if (!isValidEmail(username)) {
      setUserAdminStatus("Enter a valid email address.", true);
      return;
    }

    if (!workspaceId) {
      setUserAdminStatus("Choose a workspace.", true);
      return;
    }

    if (!accountLookup || accountLookup.username !== username || accountLookup.workspaceId !== workspaceId) {
      const found = await findUserAccount();

      if (!found) {
        return;
      }
    }

    if (accountLookup?.match?.alreadyActive) {
      setUserAdminStatus("That account already belongs to the selected workspace.", true);
      return;
    }

    const initialRoleId = newUserRoleSelect?.value || "";
    const role = addUserRoles.find((item) => item.role_id === initialRoleId);
    const scopeType = role?.assignment_scope_type || "";
    const scopeId = scopeType === "client"
      ? newUserClientScopeSelect.value
      : scopeType === "project"
        ? newUserProjectScopeSelect.value
        : role?.scopes?.[0]?.scopeId || "";
    const assignments = role ? [{
      role_id: role.role_id,
      scope_type: scopeType,
      scope_id: scopeId,
      permission_overrides: createDefaultPermissionOverrides(),
    }] : [];

    if (role && !scopeId) {
      setUserAdminStatus(`Choose a ${scopeType} scope.`, true);
      return;
    }

    createUserButton.disabled = true;
    setUserAdminStatus(accountLookup?.match ? "Adding existing account..." : "Creating account...");

    try {
      const body = await requireApi().postJson("/api/users", {
        assignments,
        username,
        workspaceId,
      });

      userAdminForm.reset();
      if (body.accountCreated) {
        showGeneratedPassword(body.initialPassword || "");
      } else {
        showGeneratedPassword("");
      }
      resetAccountLookup();
      await loadAddUserOptions(workspaceId);
      const createdUser = readUserRecord(body);
      renderUsers(readUserRecords(body));
      setUserAdminStatus(body.accountCreated
        ? `Created ${createdUser?.username || username} and added the account to the selected workspace.`
        : `Added existing account ${createdUser?.username || username} to the selected workspace.`);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setUserAdminStatus(requireErrors().caughtMessage(error, "User was not added."), true);
    } finally {
      applyUserCreationAvailability();
    }
  }

  function applyUserCreationAvailability() {
    const canCreateUsers = addUserCanCreate;

    createUserButton.disabled = !canCreateUsers;
    findUserAccountButton.disabled = !canCreateUsers;
    newUserWorkspaceSelect.disabled = newUserWorkspaceSelect.options.length < 2;
    newUserUsernameInput.disabled = !canCreateUsers;
    newUserRoleSelect.disabled = !canCreateUsers;
    newUserClientScopeSelect.disabled = !canCreateUsers || newUserClientScopeField.hidden;
    newUserProjectScopeSelect.disabled = !canCreateUsers || newUserProjectScopeField.hidden;

    if (!canCreateUsers) {
      newUserUsernameInput.value = "";
    }
  }

  async function loadAddUserOptions(workspaceId = "") {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";

    try {
      const body = await requireApi().getJson(`/api/users/add-options${query}`, { cache: "no-store" });
      applyAddUserOptions(body);
    } catch (error) {
      addUserCanCreate = false;
      applyUserCreationAvailability();
      setUserAdminStatus(requireErrors().caughtMessage(error, "Add User options could not be loaded."), true);
    }
  }

  function applyAddUserOptions(options = {}) {
    const selectedWorkspaceId = String(options.selectedWorkspaceId || "");
    const availableWorkspaces = Array.isArray(options.workspaces) ? options.workspaces : [];
    const previousWorkspaceId = newUserWorkspaceSelect.value;

    newUserWorkspaceSelect.replaceChildren(...availableWorkspaces.map((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.workspaceId;
      option.textContent = formatWorkspaceMembershipName(workspace);
      return option;
    }));
    newUserWorkspaceSelect.value = selectedWorkspaceId || previousWorkspaceId;
    addUserRoles = Array.isArray(options.roles) ? options.roles : [];
    addUserCanCreate = options.canAddUsers === true;
    renderNewUserRoleOptions();
    applyUserCreationAvailability();
  }

  function renderNewUserRoleOptions() {
    newUserRoleSelect.replaceChildren(createRoleOption("", "No initial role"));

    addUserRoles.forEach((role) => {
      newUserRoleSelect.appendChild(createRoleOption(role.role_id, role.role_name));
    });

    renderNewUserScopeOptions();
  }

  function renderNewUserScopeOptions() {
    const role = addUserRoles.find((item) => item.role_id === newUserRoleSelect.value);
    const scopeType = role?.assignment_scope_type || "";
    const scopes = Array.isArray(role?.scopes) ? role.scopes : [];

    newUserClientScopeField.hidden = scopeType !== "client";
    newUserProjectScopeField.hidden = scopeType !== "project";
    newUserClientScopeSelect.replaceChildren();
    newUserProjectScopeSelect.replaceChildren();

    if (scopeType === "client") {
      newUserClientScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));
    }

    if (scopeType === "project") {
      newUserProjectScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));
    }

    applyUserCreationAvailability();
  }

  function createAddUserScopeOption(scope) {
    const option = document.createElement("option");
    option.value = scope.scopeId;
    option.textContent = scope.label;
    return option;
  }

  async function findUserAccount() {
    const username = newUserUsernameInput.value.trim().toLowerCase();
    const workspaceId = newUserWorkspaceSelect.value;

    if (!isValidEmail(username)) {
      setUserAdminStatus("Enter a valid email address.", true);
      return false;
    }

    findUserAccountButton.disabled = true;
    newUserAccountStatus.textContent = "Searching for an exact account match...";

    try {
      const body = await requireApi().postJson("/api/users/lookup", { username, workspaceId });
      accountLookup = { match: body.match || null, username, workspaceId };
      newUserAccountStatus.textContent = body.match
        ? body.match.alreadyActive
          ? `${body.match.displayName || body.match.username} already belongs to this workspace.`
          : `Existing account found: ${body.match.displayName || body.match.username}.`
        : "No existing account found. A new account and generated password will be created.";
      return true;
    } catch (error) {
      resetAccountLookup();
      setUserAdminStatus(requireErrors().caughtMessage(error, "Account lookup failed."), true);
      return false;
    } finally {
      applyUserCreationAvailability();
    }
  }

  function resetAccountLookup() {
    accountLookup = null;
    if (newUserAccountStatus) {
      newUserAccountStatus.textContent = "";
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
    const isCurrentUser = user.user_id === currentUserId;

    actions.className = "table-actions";
    actions.append(
      createUserActionButton("Edit User", () => openEditUserDialog(user)),
      createUserActionButton("Manage Sessions", () => openEditUserDialog(user, { focusSessions: true })),
      createUserActionButton("Reset Password", () => resetUserPassword(user)),
      createUserActionButton(
        user.userStatus === "inactive" ? "Reactivate User" : "Deactivate User",
        () => toggleUserStatus(user),
        isProtected,
      ),
      createUserActionButton(
        "Delete User",
        () => deleteUser(user),
        isProtected || isCurrentUser,
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

  async function openEditUserDialog(user, options = {}) {
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
    renderManagedUserSessions([]);
    (options.focusSessions ? refreshUserSessionsButton : editUserUsernameInput).focus();

    try {
      const [body] = await Promise.all([
        requireApi().getJson(
          `/api/users/${encodeURIComponent(user.user_id)}/role-assignments`,
          { cache: "no-store" },
        ),
        loadUserSessions(user),
      ]);

      pendingRoleAssignments = body.assignments || [];
      renderPendingRoleAssignments();
    } catch (error) {
      setUserAdminStatus(requireErrors().caughtMessage(error, "Role assignments could not be loaded."), true);
    }
  }

  function closeEditUserDialog() {
    if (editUserDialog.open) {
      editUserDialog.close();
    }

    editUserForm.reset();
    renderWorkspaceMemberships([], null);
    renderManagedUserSessions([]);
  }

  async function loadUserSessions(user) {
    refreshUserSessionsButton.disabled = true;
    userSessionList.replaceChildren(createSessionStatusItem("Loading active sessions..."));

    try {
      const body = await requireApi().getJson(
        `/api/users/${encodeURIComponent(user.user_id)}/sessions`,
        { cache: "no-store" },
      );
      renderManagedUserSessions(body.sessions || []);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        return;
      }
      renderManagedUserSessions([]);
      setUserAdminStatus(requireErrors().caughtMessage(error, "Active sessions could not be loaded."), true);
    } finally {
      refreshUserSessionsButton.disabled = false;
    }
  }

  function renderManagedUserSessions(nextSessions) {
    managedUserSessions = Array.isArray(nextSessions) ? nextSessions : [];
    userSessionList.replaceChildren();
    revokeUserSessionsButton.disabled = managedUserSessions.length === 0;

    if (!managedUserSessions.length) {
      userSessionList.appendChild(createSessionStatusItem("No active sessions are connected to this workspace."));
      return;
    }

    managedUserSessions.forEach((session) => {
      const item = document.createElement("li");
      const detail = document.createElement("span");
      const revokeButton = document.createElement("button");
      const currentLabel = session.isCurrent ? "Current session. " : "";
      const ipLabel = session.ipAddress || "IP unavailable";

      detail.textContent = `${currentLabel}Started ${formatSessionDate(session.createdAt)}; expires ${formatSessionDate(session.expiresAt)}; ${ipLabel}.`;
      revokeButton.type = "button";
      revokeButton.className = "danger-button";
      revokeButton.textContent = "Revoke";
      revokeButton.addEventListener("click", () => revokeUserSession(getEditingUser(), session));
      item.append(detail, revokeButton);
      userSessionList.appendChild(item);
    });
  }

  async function revokeUserSession(user, session) {
    if (!user || !session?.sessionReference) {
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
      title: "Revoke session?",
      message: session.isCurrent
        ? "Revoke your current session? You will need to sign in again."
        : `Revoke this active session for ${user.username}?`,
      confirmLabel: "Revoke Session",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await requireApi().deleteJson(
        `/api/users/${encodeURIComponent(user.user_id)}/sessions/${encodeURIComponent(session.sessionReference)}`,
      );
      setUserAdminStatus("Session revoked.");
      await loadUserSessions(user);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        return;
      }
      setUserAdminStatus(requireErrors().caughtMessage(error, "Session could not be revoked."), true);
    }
  }

  async function revokeAllUserSessions(user) {
    const confirmed = await requireModalDialogs().confirm({
      title: "Log out workspace sessions?",
      message: `Log out every ${user.username} session connected to this workspace?`,
      confirmLabel: "Log Out Sessions",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const body = await requireApi().deleteJson(
        `/api/users/${encodeURIComponent(user.user_id)}/sessions`,
      );
      setUserAdminStatus(`Revoked ${body.revokedCount || 0} session${body.revokedCount === 1 ? "" : "s"}.`);
      await loadUserSessions(user);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        return;
      }
      setUserAdminStatus(requireErrors().caughtMessage(error, "Sessions could not be revoked."), true);
    }
  }

  function createSessionStatusItem(message) {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }

  function formatSessionDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
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
      const body = await requireApi().putJson(
        `/api/users/${encodeURIComponent(user.user_id)}/update`,
        {
          username,
          displayName,
          altEmail,
          timezone,
          workspaceMemberships: readSelectedWorkspaceMemberships(),
        },
      );
      await requireApi().putJson(
        `/api/users/${encodeURIComponent(user.user_id)}/role-assignments`,
        { assignments: pendingRoleAssignments },
      );

      closeEditUserDialog();
      renderUsers(readUserRecords(body));
      setUserAdminStatus(`Saved ${readUserRecord(body)?.username || username}.`);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setUserAdminStatus(requireErrors().caughtMessage(error, "User was not saved."), true);
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
      renderNewUserRoleOptions();
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

    permissionResources.forEach((resource) => {
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
        checkbox.checked = getOperationAllowed(overrides, resource.key, operation);
        checkbox.dataset.permissionResource = resource.key;
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
    const overrides = normalizePermissionOverrides(editingPermissionTarget?.overrides || {});
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
      operationAccess: permissionResources.reduce((access, resource) => {
        access[resource.key] = resource.operations.reduce((operations, operation) => {
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

    Object.entries(operationAccess).forEach(([resourceKey, operations]) => {
      normalized.operationAccess[resourceKey] ||= {};

      Object.entries(operations || {}).forEach(([operation, allowed]) => {
        normalized.operationAccess[resourceKey][operation] = allowed !== false;
      });
    });

    permissionResources.forEach((resource) => {
      resource.operations.forEach((operation) => {
        if (operationAccess[resource.key]?.[operation] === false) {
          normalized.operationAccess[resource.key][operation] = false;
        }
      });
    });

    if (normalized.operationAccess.time_entries) {
      normalized.operationAccess.time_entries.create = normalized.allowManualTime;
      normalized.operationAccess.time_entries.update = normalized.allowEditTime;
      normalized.operationAccess.time_entries.delete = normalized.allowEditTime;
    }

    return normalized;
  }

  function clonePermissionOverrides(overrides) {
    return JSON.parse(JSON.stringify(normalizePermissionOverrides(overrides)));
  }

  function getOperationAllowed(overrides, resource, operation) {
    return overrides.operationAccess?.[resource]?.[operation] !== false;
  }

  function normalizePermissionResources(resources = []) {
    return (Array.isArray(resources) ? resources : [])
      .map((resource) => ({
        key: String(resource?.key || "").trim(),
        label: String(resource?.label || resource?.key || "").trim(),
        operations: [...new Set((resource?.operations || [])
          .map((operation) => String(operation || "").trim())
          .filter(Boolean))],
      }))
      .filter((resource) => resource.key && resource.label && resource.operations.length > 0);
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
    const shouldDelete = await requireModalDialogs().confirm({
      title: "Delete user?",
      message: `Delete ${user.username} from this workspace? This removes the user's current-workspace access. If no other workspace access remains, the account credentials are retired. The email address, display name, contributions, and attribution remain in workspace history.`,
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
        ? await requireApi().deleteJson(url)
        : await requireApi().putJson(url, undefined);

      onSuccess(body);
      renderUsers(readUserRecords(body));
      setUserAdminStatus(successMessage);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setUserAdminStatus(requireErrors().caughtMessage(error, "User change was not saved."), true);
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
    requirePageController().setStatus(userAdminStatus, message, { isError });
    userAdminStatus.classList.toggle("is-error", isError);
  }

  requirePageController().register("user-admin", {
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
        { name: "permission resources loaded", ok: permissionResources.length > 0 },
      ];

      return {
        ok: checks.every((check) => check.ok),
        pageId: "user-admin",
        checks,
      };
    },
  });
})();
