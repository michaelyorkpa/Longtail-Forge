(function attachUserAdminPage() {
  /**
   * One control, at the subtype the page's own markup renders, or `null`.
   *
   * **Typed-or-null on purpose.** `views/protected/user-admin.html` is static and always carries
   * these controls, but acquisition happens at module evaluation - outside the `try` in
   * `loadUsers` - so refusing here would turn a missing control into a dead page instead of the
   * "Users could not be loaded." status it produces today. The subtype is settled here; presence
   * is settled at the statement that already dereferenced it.
   * @template T
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function findUserAdminControl(selector, constructor) {
    const element = document.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * Narrow at an access this page already made unguarded.
   *
   * Controls the page already guarded keep their guards: this is only for the statements that
   * dereferenced a control directly, which is what makes it required.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireUserAdminValue(value, name) {
    if (value === null) {
      throw new TypeError(`User administration requires its ${name}.`);
    }

    return value;
  }

  const userAdminForm = findUserAdminControl("[data-user-admin-form]", HTMLFormElement);
  const newUserWorkspaceSelect = findUserAdminControl("[data-new-user-workspace]", HTMLSelectElement);
  const newUserUsernameInput = findUserAdminControl("[data-new-user-username]", HTMLInputElement);
  const findUserAccountButton = findUserAdminControl("[data-find-user-account]", HTMLButtonElement);
  const newUserAccountStatus = findUserAdminControl("[data-new-user-account-status]", HTMLElement);
  const newUserRoleSelect = findUserAdminControl("[data-new-user-role]", HTMLSelectElement);
  const newUserClientScopeField = findUserAdminControl("[data-new-user-client-scope-field]", HTMLElement);
  const newUserClientScopeSelect = findUserAdminControl("[data-new-user-client-scope]", HTMLSelectElement);
  const newUserProjectScopeField = findUserAdminControl("[data-new-user-project-scope-field]", HTMLElement);
  const newUserProjectScopeSelect = findUserAdminControl("[data-new-user-project-scope]", HTMLSelectElement);
  const createUserButton = findUserAdminControl("[data-create-user]", HTMLButtonElement);
  const generatedPasswordPanel = findUserAdminControl("[data-generated-password-panel]", HTMLElement);
  const generatedPasswordInput = findUserAdminControl("[data-generated-password]", HTMLInputElement);
  const copyGeneratedPasswordButton = findUserAdminControl("[data-copy-generated-password]", HTMLButtonElement);
  const userAdminStatus = findUserAdminControl("[data-user-admin-status]", HTMLElement);
  const userList = document.querySelector("[data-user-list]");
  const editUserDialog = findUserAdminControl("[data-edit-user-dialog]", HTMLDialogElement);
  const editUserForm = findUserAdminControl("[data-edit-user-form]", HTMLFormElement);
  const editUserIdInput = findUserAdminControl("[data-edit-user-id]", HTMLInputElement);
  const editUserUsernameInput = findUserAdminControl("[data-edit-user-username]", HTMLInputElement);
  const editUserDisplayNameInput = findUserAdminControl("[data-edit-user-display-name]", HTMLInputElement);
  const editUserAltEmailInput = findUserAdminControl("[data-edit-user-alt-email]", HTMLInputElement);
  const editUserTimezoneSelect = findUserAdminControl("[data-edit-user-timezone]", HTMLSelectElement);
  const cancelEditUserButton = findUserAdminControl("[data-cancel-edit-user]", HTMLButtonElement);
  const resetEditUserPasswordButton = findUserAdminControl("[data-reset-edit-user-password]", HTMLButtonElement);
  const saveEditUserButton = findUserAdminControl("[data-save-edit-user]", HTMLButtonElement);
  const workspaceMembershipList = document.querySelector("[data-workspace-membership-list]");
  const userSessionList = findUserAdminControl("[data-user-session-list]", HTMLElement);
  const refreshUserSessionsButton = findUserAdminControl("[data-refresh-user-sessions]", HTMLButtonElement);
  const revokeUserSessionsButton = findUserAdminControl("[data-revoke-user-sessions]", HTMLButtonElement);
  const roleAssignmentRoleSelect = findUserAdminControl("[data-role-assignment-role]", HTMLSelectElement);
  const roleAssignmentScopeSelect = findUserAdminControl("[data-role-assignment-scope]", HTMLSelectElement);
  const addRoleAssignmentButton = findUserAdminControl("[data-add-role-assignment]", HTMLButtonElement);
  const roleAssignmentList = findUserAdminControl("[data-role-assignment-list]", HTMLElement);
  const configureDraftPermissionsButton = findUserAdminControl("[data-configure-draft-permissions]", HTMLButtonElement);
  const rolePermissionsDialog = findUserAdminControl("[data-role-permissions-dialog]", HTMLDialogElement);
  const rolePermissionsForm = findUserAdminControl("[data-role-permissions-form]", HTMLFormElement);
  const rolePermissionsSummary = findUserAdminControl("[data-role-permissions-summary]", HTMLElement);
  const permissionMatrix = findUserAdminControl("[data-permission-matrix]", HTMLElement);
  const cancelRolePermissionsButton = findUserAdminControl("[data-cancel-role-permissions]", HTMLButtonElement);

  /** @type {BrowserUserRecord[]} */
  let users = [];
  /**
   * The assignable roles, as `readRoleOptions` vouched for them.
   * @type {BrowserRoleOption[]}
   */
  let roles = [];
  /** @type {{ id?: unknown, name?: unknown, projects?: { id?: unknown, name?: unknown }[] }[]} */
  /**
   * The client and project scopes, as `readClientProjectScopes` vouched for them.
   * @type {BrowserUserAdminClientScope[]}
   */
  let clients = [];
  let workspaces = [];
  /**
   * The resource catalogue, as `readPermissionResourceCatalog` vouched for it.
   * @type {BrowserPermissionResource[]}
   */
  let permissionResources = [];
  /** @type {BrowserWorkspaceType} */
  let activeWorkspaceType = "business";
  /**
   * The roles this workspace may assign to a new user.
   *
   * `GET /api/users/add-options` builds this from `listAssignableRoleOptions` - the same producer
   * `GET /api/roles` uses - so it is the published role option, read through the same checked
   * reader rather than a second unchecked copy.
   * @type {BrowserRoleOption[]}
   */
  let addUserRoles = [];
  let addUserCanCreate = false;
  /**
   * The account the last lookup matched, with the question it answered.
   *
   * **A page-local record over a published match.** `POST /api/users/lookup` answers
   * `BrowserAccountLookup`; this slot keeps the match alongside the username and workspace it was
   * asked about, because `createUser` re-runs the lookup whenever either has changed since. The
   * match itself is the published contract and is not redescribed.
   * @typedef {{ match: BrowserAccountLookupMatch | null, username: string, workspaceId: string }} AddUserAccountLookup
   */

  /** @type {AddUserAccountLookup | null} */
  let accountLookup = null;
  /**
   * One row of the assignment list this dialog is building.
   *
   * **This is not `BrowserRoleAssignment`, and declaring it as one would be false.** The slot
   * holds two kinds of row: assignments `readRoleAssignments` vouched for, which carry
   * `assignment_id`, `client_id` and `project_id`; and rows `addPendingRoleAssignment` builds
   * locally, which carry **none of those three**. Only the four members below are on every row.
   *
   * Those same four are exactly what the receiver reads. `normalizeAssignments` in
   * `src/services/permissions.service.js` takes `role_id`, `scope_type`, `scope_id` and
   * `permission_overrides` off each entry and derives `client_id`/`project_id` itself - it never
   * reads `assignment_id`. So this model is a statement about the **outgoing payload**, checked
   * against the consumer rather than assumed from the record that happens to share the slot.
   *
   * `permission_overrides` stays `unknown`: a server-sourced row carries whatever the server
   * sent, and `0.33.33.44.8` established that only `normalizePermissionOverrides` output is
   * `PermissionOverrides`.
   * @typedef {{
   *   role_id: string,
   *   scope_type: string,
   *   scope_id: string | null,
   *   permission_overrides: unknown,
   *   assignment_id?: string,
   *   client_id?: string | null,
   *   project_id?: string | null,
   * }} PendingRoleAssignment
   */

  /** @type {PendingRoleAssignment[]} */
  let pendingRoleAssignments = [];
  /** @type {PermissionOverrides} */
  let draftPermissionOverrides = createDefaultPermissionOverrides();
  /**
   * What the permission dialog is currently editing, or `null` when it is closed.
   * @typedef {{ onSave: (overrides: PermissionOverrides) => void, overrides: PermissionOverrides }} PermissionDialogTarget
   */

  /** @type {PermissionDialogTarget | null} */
  let editingPermissionTarget = null;
  let openedUserFromQuery = false;
  /**
   * The sessions `readManagedSessionList` vouched for.
   *
   * Written only by `renderManagedUserSessions`, whose two callers pass that reader's own
   * `sessions` or an empty list - so the compiler checks this chain rather than the declaration
   * asserting it. `isManagedSession` establishes every text member, a `sessionReference`
   * matching its pattern, and a boolean `isCurrent`.
   * @type {BrowserManagedSession[]}
   */
  let managedUserSessions = [];
  let currentUserId = "";

  loadUsers();

  requireUserAdminValue(userAdminForm, "add-user form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUser();
  });

  findUserAccountButton?.addEventListener("click", async () => {
    await findUserAccount();
  });

  newUserWorkspaceSelect?.addEventListener("change", async () => {
    resetAccountLookup();
    await loadAddUserOptions(requireUserAdminValue(newUserWorkspaceSelect, "workspace select").value);
  });

  newUserUsernameInput?.addEventListener("input", resetAccountLookup);
  newUserRoleSelect?.addEventListener("change", renderNewUserScopeOptions);

  requireUserAdminValue(copyGeneratedPasswordButton, "copy-password button").addEventListener("click", async () => {
    await copyGeneratedPassword();
  });

  requireUserAdminValue(editUserForm, "edit-user form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEditedUser();
  });

  requireUserAdminValue(cancelEditUserButton, "cancel button").addEventListener("click", closeEditUserDialog);

  requireUserAdminValue(addRoleAssignmentButton, "add assignment button").addEventListener("click", addPendingRoleAssignment);

  requireUserAdminValue(roleAssignmentRoleSelect, "role select").addEventListener("change", renderScopeOptions);

  requireUserAdminValue(configureDraftPermissionsButton, "configure permissions button").addEventListener("click", () => {
    const role = roles.find((item) => item.role_id === requireUserAdminValue(roleAssignmentRoleSelect, "role select").value);
    const scopeLabel = role ? formatScopeLabel(getDraftAssignment(role)) : "New assignment";

    openPermissionDialog({
      title: `${role?.role_name || "New Role"} - ${scopeLabel}`,
      overrides: draftPermissionOverrides,
      onSave: (overrides) => {
        draftPermissionOverrides = overrides;
      },
    });
  });

  requireUserAdminValue(rolePermissionsForm, "permission form").addEventListener("submit", (event) => {
    event.preventDefault();
    savePermissionDialog();
  });

  requireUserAdminValue(cancelRolePermissionsButton, "cancel permissions button").addEventListener("click", closePermissionDialog);

  requireUserAdminValue(resetEditUserPasswordButton, "reset-password button").addEventListener("click", async () => {
    const user = getEditingUser();

    if (user) {
      await resetUserPassword(user);
    }
  });

  requireUserAdminValue(refreshUserSessionsButton, "refresh sessions button").addEventListener("click", async () => {
    const user = getEditingUser();
    if (user) {
      await loadUserSessions(user);
    }
  });

  requireUserAdminValue(revokeUserSessionsButton, "revoke sessions button").addEventListener("click", async () => {
    const user = getEditingUser();
    if (user) {
      await revokeAllUserSessions(user);
    }
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} BrowserPageController */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserRecord} BrowserUserRecord */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserWorkspaceMembership} BrowserUserWorkspaceMembership */

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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserRoleOption} BrowserRoleOption */

  /** The four columns `readRoles` selects, plus the scope type the service computes. */
  const ROLE_TEXT_MEMBERS = Object.freeze([
    "assignable_scope_type",
    "assignment_scope_type",
    "description",
    "role_id",
    "role_name",
  ]);

  /**
   * One scope the service kept after asking `canAssignRole` for it.
   * @param {unknown} value
   * @returns {boolean}
   */
  function isRoleScope(value) {
    return isResponseRecord(value) && typeof value.label === "string" && typeof value.scopeId === "string";
  }

  /**
   * One assignable role as `GET /api/roles` returns it.
   * @param {unknown} value
   * @returns {value is BrowserRoleOption}
   */
  function isRoleOption(value) {
    return isResponseRecord(value)
      && ROLE_TEXT_MEMBERS.every((member) => typeof value[member] === "string")
      && Array.isArray(value.scopes)
      && value.scopes.every(isRoleScope)
      && value.role_id !== "";
  }

  /**
   * The assignable roles a body carries.
   *
   * **Element validation, not container validation.** Both consumers already asked whether the
   * member was an array; neither asked what was in it. A malformed entry is dropped, which is the
   * answer this estate has given since `0.33.33.38.4.2`.
   * @param {unknown} body
   * @returns {BrowserRoleOption[]}
   */
  function readRoleOptions(body) {
    const envelope = isResponseRecord(body) ? body : null;
    return envelope && Array.isArray(envelope.roles) ? envelope.roles.filter(isRoleOption) : [];
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserRoleAssignment} BrowserRoleAssignment */

  /**
   * One assignment as `GET /api/users/:userId/role-assignments` returns it.
   *
   * Seven members, constructed by `decorateAssignment`. **This is not the delegated record**: the
   * administrator view carries the assignment identity and the parsed overrides that the delegated
   * paths withhold.
   * @param {unknown} value
   * @returns {value is BrowserRoleAssignment}
   */
  function isRoleAssignment(value) {
    return isResponseRecord(value)
      && typeof value.assignment_id === "string"
      && typeof value.role_id === "string"
      && typeof value.scope_type === "string"
      && (value.scope_id === null || typeof value.scope_id === "string")
      && (value.client_id === null || typeof value.client_id === "string")
      && (value.project_id === null || typeof value.project_id === "string")
      && "permission_overrides" in value
      && value.assignment_id !== "";
  }

  /**
   * The role assignments a body carries.
   * @param {unknown} body
   * @returns {BrowserRoleAssignment[]}
   */
  function readRoleAssignments(body) {
    const envelope = isResponseRecord(body) ? body : null;
    return envelope && Array.isArray(envelope.assignments)
      ? envelope.assignments.filter(isRoleAssignment)
      : [];
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAccountLookup} BrowserAccountLookup */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAccountLookupMatch} BrowserAccountLookupMatch */

  /**
   * The account `POST /api/users/lookup` matched.
   *
   * **Three members and no identifier.** `lookupAddUserAccount` builds `alreadyActive`,
   * `displayName` and `username` and sends nothing else, so this predicate checks the whole record.
   * @param {unknown} value
   * @returns {value is BrowserAccountLookupMatch}
   */
  function isAccountLookupMatch(value) {
    return isResponseRecord(value)
      && typeof value.alreadyActive === "boolean"
      && typeof value.displayName === "string"
      && typeof value.username === "string"
      && value.username !== "";
  }

  /**
   * The account lookup a body carries.
   *
   * **A malformed match reads as no match, which is the fail-closed direction.** The consumer's
   * `body.match || null` already turned a falsy match into none; a *truthy* malformed one used to
   * reach the status line and render `Existing account found: undefined.`. Treating it as no match
   * refuses to claim an account exists, and the server stays authoritative either way - `create`
   * finds the existing account itself and answers 409 when it is already a member.
   * @param {unknown} body
   * @returns {BrowserAccountLookup}
   */
  function readAccountLookup(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const match = envelope ? envelope.match : null;
    return {
      match: isAccountLookupMatch(match) ? match : null,
      workspaceId: envelope && typeof envelope.workspaceId === "string" ? envelope.workspaceId : "",
    };
  }


  /**
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * The six members `decorateUserWithMemberships` writes onto a user on the list paths.
   *
   * Every one is a `NOT NULL` column: `user_workspaces.user_workspace_id` (primary key),
   * `workspace_id`, `status`, `created_at` and `updated_at`, plus `workspaces.name` reached
   * through an `INNER JOIN`. So the declaration's six required strings are the producer's own
   * guarantee, and this table validates exactly that - no emptiness constraint is added, because
   * the contract does not promise one.
   */
  const WORKSPACE_MEMBERSHIP_TEXT = Object.freeze([
    "createdAt", "status", "updatedAt", "userWorkspaceId", "workspaceId", "workspaceName",
  ]);

  /**
   * One decorated workspace membership.
   * @param {unknown} value
   * @returns {value is BrowserUserWorkspaceMembership}
   */
  function isWorkspaceMembership(value) {
    return isResponseRecord(value)
      && WORKSPACE_MEMBERSHIP_TEXT.every((member) => typeof value[member] === "string");
  }

  /**
   * Whether a user's `workspaceMemberships` is one this producer could have written.
   *
   * **Optional means "may be absent; if present, still valid".** The single-user read paths do
   * not decorate, so absence is a real answer - and with `exactOptionalPropertyTypes` off, an
   * explicit `undefined` is the same answer and is admitted alongside it. `null` is **not**: the
   * declared type is an array or nothing, and no producer writes `null` here.
   *
   * An empty array is a real answer too - a user who belongs to no active workspace.
   * @param {unknown} value
   */
  function hasReadableWorkspaceMemberships(value) {
    return value === undefined
      || (Array.isArray(value) && value.every(isWorkspaceMembership));
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
      && value.user_id !== ""
      && hasReadableWorkspaceMemberships(value.workspaceMemberships);
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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserListResponse} BrowserUserListResponse */

  /**
   * What `GET /api/users` answered, or `null` when it cannot be vouched for.
   *
   * **This list refuses where `readUserRecords` drops, and the difference is deliberate.** That
   * reader serves four bodies and answers a best-effort list, which `0.33.33.38.4.2` chose for
   * the note list and `0.33.33.38.4.4.1` kept. Here the list *is* the administrative population:
   * a silently shortened one hides an account from role, membership and lifecycle decisions
   * while looking complete. So an element the browser cannot vouch for refuses the response, and
   * the other three bodies keep the policy their own children set.
   *
   * `currentUserId` is required for the same reason it is server-supplied: a page that defaults
   * it to `""` has quietly stopped knowing which account is acting.
   * @param {unknown} body
   * @returns {BrowserUserListResponse | null}
   */
  function readUserListResponse(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { currentUserId, users } = body;
    if (typeof currentUserId !== "string" || currentUserId === "" || !Array.isArray(users)) {
      return null;
    }
    return users.every(isUserRecord) ? { currentUserId, users } : null;
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


  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserCreationResult} BrowserUserCreationResult */

  /**
   * What the create route answered: the flag, the credential, and the two user halves.
   *
   * **Total, because the reads it replaces were.** The raw flag read on an unusable body was
   * already `undefined`, which took the "existing account" branch and left the credential panel
   * hidden - and that is the fail-closed direction for a one-time credential, so it is kept
   * rather than turned into a throw.
   *
   * `initialPassword` is answered as `""` unless the producer sent text, which is the same empty
   * value the producer itself writes when no account was minted.
   * @param {unknown} body
   * @returns {BrowserUserCreationResult}
   */
  function readUserCreation(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const initialPassword = envelope ? envelope.initialPassword : null;
    return {
      accountCreated: envelope?.accountCreated === true,
      initialPassword: typeof initialPassword === "string" ? initialPassword : "",
      user: readUserRecord(body),
      users: readUserRecords(body),
    };
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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserAdminClientScope} BrowserUserAdminClientScope */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAssignableWorkspace} BrowserAssignableWorkspace */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserPermissionResource} BrowserPermissionResource */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceType} BrowserWorkspaceType */

  /** The five members `workspaceToAppValue` writes as text. */
  const ASSIGNABLE_WORKSPACE_TEXT = Object.freeze(["workspaceId", "workspaceName", "workspaceType"]);

  /** The two it reaches through a `LEFT JOIN`, and may therefore answer as `null`. */
  const ASSIGNABLE_WORKSPACE_NULLABLE_TEXT = Object.freeze(["ownerUserId", "ownerUsername"]);

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isBootstrapRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** An identifier this page will submit back to the server. @param {unknown} value */
  function isBootstrapIdentifier(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasBootstrapText(value, keys) {
    return keys.every((key) => typeof value[key] === "string");
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasBootstrapNullableText(value, keys) {
    return keys.every((key) => value[key] === null || typeof value[key] === "string");
  }

  /**
   * One project of a client, in the members this page submits as a role scope.
   *
   * `projects.id` and `projects.name` are both `NOT NULL` columns copied by name, so an
   * unusable one did not come from this producer.
   * @param {unknown} value
   */
  function isClientProjectScope(value) {
    return isBootstrapRecord(value)
      && isBootstrapIdentifier(value.id)
      && typeof value.name === "string";
  }

  /** @param {unknown} value @returns {value is BrowserUserAdminClientScope} */
  function isClientScope(value) {
    return isBootstrapRecord(value)
      && isBootstrapIdentifier(value.id)
      && typeof value.name === "string"
      && Array.isArray(value.projects)
      && value.projects.every(isClientProjectScope);
  }

  /**
   * The client/project role scopes, or `null` when the body is not one this producer sends.
   *
   * **This reads `clients` and nothing else.** The option body also carries
   * `workspaceProjects`, and the shared `clientProjectOptions.normalizeClients` would fold
   * those into a synthetic client so a picker can offer workspace-scoped projects. User Admin
   * has never offered that scope and this reader cannot introduce it, because it never looks
   * at that member - which is a stronger guarantee than removing the row afterwards would be.
   *
   * The envelope is checked as the exact one the producer builds: `view` is written literally,
   * so a body labelling itself anything else is not the options view. A client the page cannot
   * vouch for refuses the whole list rather than being dropped from it - a role-scope picker
   * missing one client looks exactly like a workspace that has one fewer.
   * @param {unknown} body
   * @returns {BrowserUserAdminClientScope[] | null}
   */
  function readClientProjectScopes(body) {
    if (!isBootstrapRecord(body)
      || body.view !== "options"
      || !Array.isArray(body.clients)
      || !Array.isArray(body.workspaceProjects)) {
      return null;
    }

    return body.clients.every(isClientScope)
      ? /** @type {BrowserUserAdminClientScope[]} */ (body.clients)
      : null;
  }

  /** @param {unknown} value @returns {value is BrowserAssignableWorkspace} */
  function isAssignableWorkspace(value) {
    return isBootstrapRecord(value)
      && isBootstrapIdentifier(value.workspaceId)
      && hasBootstrapText(value, ASSIGNABLE_WORKSPACE_TEXT)
      && hasBootstrapNullableText(value, ASSIGNABLE_WORKSPACE_NULLABLE_TEXT);
  }

  /**
   * The workspaces this administrator may assign membership in.
   *
   * A workspace dropped here would remove a membership checkbox from a list the page presents
   * as complete, so one unusable entry refuses the whole response. An empty list is a
   * different thing entirely and is accepted: the server filters by status, membership and
   * `users.manage`, so answering none is a real result the page already renders as "No
   * assignable workspaces."
   * @param {unknown} body
   * @returns {BrowserAssignableWorkspace[] | null}
   */
  function readAssignableWorkspaces(body) {
    if (!isBootstrapRecord(body) || !Array.isArray(body.workspaces)) {
      return null;
    }

    return body.workspaces.every(isAssignableWorkspace)
      ? /** @type {BrowserAssignableWorkspace[]} */ (body.workspaces)
      : null;
  }

  /**
   * One permission resource, as `normalizeResourceDefinition` answers it.
   *
   * `key` and `label` must carry text because the matrix keys its rows on one and labels them
   * with the other, and `operations` must be a non-empty list of non-empty words because a
   * resource with no operations is a row of no controls. `moduleId` is only required to be a
   * string: a framework resource belongs to no contributed module and is sent as `""`.
   * @param {unknown} value
   * @returns {value is BrowserPermissionResource}
   */
  function isPermissionResource(value) {
    return isBootstrapRecord(value)
      && isBootstrapIdentifier(value.key)
      && isBootstrapIdentifier(value.label)
      && typeof value.moduleId === "string"
      && Array.isArray(value.operations)
      && value.operations.length > 0
      && value.operations.every(isBootstrapIdentifier);
  }

  /**
   * The permission catalog, or `null` when one resource in it cannot be vouched for.
   *
   * **Nothing is filtered here, and that is the change.** The page used to normalise this list
   * and drop whatever failed, so a malformed resource left an administrator looking at a
   * permission grid that was missing controls while appearing complete - and a resource
   * denied by omission is indistinguishable from one deliberately left unassigned. The server
   * decides which resources are visible, using module status, workspace terminology and the
   * resource's own required permissions; the browser's job is to render that answer or say it
   * could not read it.
   * @param {unknown} body
   * @returns {BrowserPermissionResource[] | null}
   */
  function readPermissionResourceCatalog(body) {
    if (!isBootstrapRecord(body) || !Array.isArray(body.resources)) {
      return null;
    }

    return body.resources.every(isPermissionResource)
      ? /** @type {BrowserPermissionResource[]} */ (body.resources)
      : null;
  }

  /**
   * The workspace type this page is administering, from `GET /api/settings`.
   *
   * **The server closes this vocabulary; what this reader establishes is that the body is the
   * settings response at all.** `readWorkspaceSettingsFresh` selects the raw
   * `workspaces.workspace_type` column, but `normalizeSettings` then runs the shared
   * `normalizeWorkspaceType`, which trims, lowercases and maps anything outside `WORKSPACE_TYPES`
   * to `"business"`. So a real settings body always carries one of these three, and this check can
   * only refuse a body that is not one - a proxy error page, a redirect, a truncated payload.
   *
   * The raw column *is* open text, which is why `BrowserAssignableWorkspace.workspaceType` stays
   * `string`: `workspaceToAppValue` copies it without ever reaching that normaliser. Two producers
   * reading one column, making two different promises.
   *
   * Answers `null` for a body that is not a record and for a value outside the vocabulary. The
   * caller refuses the bootstrap rather than substituting a default.
   * @param {unknown} body
   * @returns {BrowserWorkspaceType | null}
   */
  function readWorkspaceType(body) {
    if (!isBootstrapRecord(body)) {
      return null;
    }

    const workspaceType = body.workspaceType;
    return workspaceType === "business" || workspaceType === "family" || workspaceType === "personal"
      ? workspaceType
      : null;
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

      const clientScopes = readClientProjectScopes(clientProjectBody);
      const assignableWorkspaces = readAssignableWorkspaces(workspacesBody);
      const resourceCatalog = readPermissionResourceCatalog(permissionResourcesBody);
      const workspaceType = readWorkspaceType(settingsBody);

      if (!clientScopes || !assignableWorkspaces || !resourceCatalog || !workspaceType) {
        throw new Error("The user administration bootstrap could not be read.");
      }

      roles = readRoleOptions(rolesBody);
      clients = clientScopes;
      workspaces = assignableWorkspaces;
      permissionResources = resourceCatalog;
      const userList = readUserListResponse(usersBody);
      if (!userList) {
        throw new Error("The workspace user list could not be read.");
      }
      currentUserId = userList.currentUserId;
      draftPermissionOverrides = normalizePermissionOverrides(draftPermissionOverrides);
      activeWorkspaceType = workspaceType;
      renderRoleOptions();
      applyAddUserOptions(addUserOptionsBody);
      renderUsers(userList.users);
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

    const username = requireUserAdminValue(newUserUsernameInput, "username input").value.trim().toLowerCase();
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
      ? requireUserAdminValue(newUserClientScopeSelect, "client scope select").value
      : scopeType === "project"
        ? requireUserAdminValue(newUserProjectScopeSelect, "project scope select").value
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

    requireUserAdminValue(createUserButton, "create button").disabled = true;
    setUserAdminStatus(accountLookup?.match ? "Adding existing account..." : "Creating account...");

    try {
      const body = await requireApi().postJson("/api/users", {
        assignments,
        username,
        workspaceId,
      });

      const created = readUserCreation(body);

      requireUserAdminValue(userAdminForm, "add-user form").reset();
      if (created.accountCreated) {
        showGeneratedPassword(created.initialPassword);
      } else {
        showGeneratedPassword("");
      }
      resetAccountLookup();
      await loadAddUserOptions(workspaceId);
      renderUsers(created.users);
      setUserAdminStatus(created.accountCreated
        ? `Created ${created.user?.username || username} and added the account to the selected workspace.`
        : `Added existing account ${created.user?.username || username} to the selected workspace.`);
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

    const workspaceSelect = requireUserAdminValue(newUserWorkspaceSelect, "workspace select");
    const usernameInput = requireUserAdminValue(newUserUsernameInput, "username input");

    requireUserAdminValue(createUserButton, "create button").disabled = !canCreateUsers;
    requireUserAdminValue(findUserAccountButton, "find-account button").disabled = !canCreateUsers;
    workspaceSelect.disabled = workspaceSelect.options.length < 2;
    usernameInput.disabled = !canCreateUsers;
    requireUserAdminValue(newUserRoleSelect, "role select").disabled = !canCreateUsers;
    requireUserAdminValue(newUserClientScopeSelect, "client scope select").disabled =
      !canCreateUsers || Boolean(requireUserAdminValue(newUserClientScopeField, "client scope field").hidden);
    requireUserAdminValue(newUserProjectScopeSelect, "project scope select").disabled =
      !canCreateUsers || Boolean(requireUserAdminValue(newUserProjectScopeField, "project scope field").hidden);

    if (!canCreateUsers) {
      usernameInput.value = "";
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

  /**
   * @param {unknown} [options] the `GET /api/users/add-options` body, unchecked as it arrives
   */
  function applyAddUserOptions(options = {}) {
    // Read through this file's own checked readers rather than a bare `Array.isArray`. Both
    // members come from the producers those readers already describe: `workspaces` from the same
    // server-side `readAssignableWorkspaces` that `GET /api/workspaces` uses, and `roles` from the
    // same `listAssignableRoleOptions` as `GET /api/roles`. `readRoleOptions` even documents two
    // consumers; this was the one that never adopted it. A malformed element is now dropped
    // instead of rendered as a blank option, which is the answer this page already gives at load.
    const record = isResponseRecord(options) ? options : null;
    const selectedWorkspaceId = String(record?.selectedWorkspaceId || "");
    const availableWorkspaces = readAssignableWorkspaces(options) || [];
    const workspaceSelect = requireUserAdminValue(newUserWorkspaceSelect, "workspace select");
    const previousWorkspaceId = workspaceSelect.value;

    workspaceSelect.replaceChildren(...availableWorkspaces.map((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.workspaceId;
      option.textContent = formatWorkspaceMembershipName(workspace);
      return option;
    }));
    workspaceSelect.value = selectedWorkspaceId || previousWorkspaceId;
    addUserRoles = readRoleOptions(options);
    addUserCanCreate = record?.canAddUsers === true;
    renderNewUserRoleOptions();
    applyUserCreationAvailability();
  }

  function renderNewUserRoleOptions() {
    const roleSelect = requireUserAdminValue(newUserRoleSelect, "role select");

    roleSelect.replaceChildren(createRoleOption("", "No initial role"));

    addUserRoles.forEach((role) => {
      roleSelect.appendChild(createRoleOption(role.role_id, role.role_name));
    });

    renderNewUserScopeOptions();
  }

  function renderNewUserScopeOptions() {
    const roleSelect = requireUserAdminValue(newUserRoleSelect, "role select");
    const clientScopeSelect = requireUserAdminValue(newUserClientScopeSelect, "client scope select");
    const projectScopeSelect = requireUserAdminValue(newUserProjectScopeSelect, "project scope select");
    const role = addUserRoles.find((item) => item.role_id === roleSelect.value);
    const scopeType = role?.assignment_scope_type || "";
    const scopes = Array.isArray(role?.scopes) ? role.scopes : [];

    requireUserAdminValue(newUserClientScopeField, "client scope field").hidden = scopeType !== "client";
    requireUserAdminValue(newUserProjectScopeField, "project scope field").hidden = scopeType !== "project";
    clientScopeSelect.replaceChildren();
    projectScopeSelect.replaceChildren();

    if (scopeType === "client") {
      clientScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));
    }

    if (scopeType === "project") {
      projectScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));
    }

    applyUserCreationAvailability();
  }

  /** @param {BrowserRoleOption["scopes"][number]} scope */
  function createAddUserScopeOption(scope) {
    const option = document.createElement("option");
    option.value = scope.scopeId;
    option.textContent = scope.label;
    return option;
  }

  async function findUserAccount() {
    const accountStatus = requireUserAdminValue(newUserAccountStatus, "account status");
    const username = requireUserAdminValue(newUserUsernameInput, "username input").value.trim().toLowerCase();
    const workspaceId = requireUserAdminValue(newUserWorkspaceSelect, "workspace select").value;

    if (!isValidEmail(username)) {
      setUserAdminStatus("Enter a valid email address.", true);
      return false;
    }

    requireUserAdminValue(findUserAccountButton, "find-account button").disabled = true;
    accountStatus.textContent = "Searching for an exact account match...";

    try {
      const lookup = readAccountLookup(await requireApi().postJson("/api/users/lookup", { username, workspaceId }));
      const match = lookup.match;
      accountLookup = { match, username, workspaceId };
      accountStatus.textContent = match
        ? match.alreadyActive
          ? `${match.displayName || match.username} already belongs to this workspace.`
          : `Existing account found: ${match.displayName || match.username}.`
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

  /** @param {BrowserUserRecord[]} nextUsers */
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

  /**
   * @param {BrowserUserRecord} user a record that reached `users` through `isUserRecord`
   * @param {{ focusSessions?: boolean }} [options]
   */
  async function openEditUserDialog(user, options = {}) {
    const usernameInput = requireUserAdminValue(editUserUsernameInput, "username input");

    requireUserAdminValue(editUserIdInput, "identity input").value = user.user_id;
    usernameInput.value = user.username;
    requireUserAdminValue(editUserDisplayNameInput, "display name input").value = user.displayName || user.username;
    requireUserAdminValue(editUserAltEmailInput, "alternate email input").value = user.altEmail || "";
    setEditUserTimezoneValue(user.timezone || "America/New_York");
    renderWorkspaceMemberships(user.workspaceMemberships || [], user);
    pendingRoleAssignments = [];
    draftPermissionOverrides = createDefaultPermissionOverrides();
    renderPendingRoleAssignments();
    requireUserAdminValue(editUserDialog, "edit-user dialog").showModal();
    renderManagedUserSessions([]);
    // `0.33.33.44.7` left this union unresolved because `refreshUserSessionsButton` was a bare
    // query owned by the managed-sessions child. That child is this one, so both halves are now
    // typed and the throw-on-absent behaviour is still deliberately unchanged.
    (options.focusSessions
      ? requireUserAdminValue(refreshUserSessionsButton, "refresh sessions button")
      : usernameInput).focus();

    try {
      const [body] = await Promise.all([
        requireApi().getJson(
          `/api/users/${encodeURIComponent(user.user_id)}/role-assignments`,
          { cache: "no-store" },
        ),
        loadUserSessions(user),
      ]);

      pendingRoleAssignments = readRoleAssignments(body);
      renderPendingRoleAssignments();
    } catch (error) {
      setUserAdminStatus(requireErrors().caughtMessage(error, "Role assignments could not be loaded."), true);
    }
  }

  function closeEditUserDialog() {
    const dialog = requireUserAdminValue(editUserDialog, "edit-user dialog");

    if (dialog.open) {
      dialog.close();
    }

    requireUserAdminValue(editUserForm, "edit-user form").reset();
    renderWorkspaceMemberships([], null);
    renderManagedUserSessions([]);
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserManagedSession} BrowserManagedSession */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserManagedSessionUser} BrowserManagedSessionUser */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserManagedSessionList} BrowserManagedSessionList */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSessionRevocationResult} BrowserSessionRevocationResult */

  /** The four text members `toManagedSession` always fills beside its boolean. */
  const MANAGED_SESSION_TEXT = Object.freeze(["createdAt", "expiresAt", "ipAddress", "sessionReference"]);

  /** The three members `toTargetUser` names for the account being managed. */
  const MANAGED_SESSION_USER_TEXT = Object.freeze(["displayName", "userId", "username"]);

  /** The shape the server's own reference validator accepts back. */
  const SESSION_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

  /**
   * One active session an administrator may see.
   *
   * The reference is checked against the same shape the server's `normalizeReference` requires,
   * because a handle this page could not send back is not a session it can offer to revoke.
   * @param {unknown} value
   * @returns {value is BrowserManagedSession}
   */
  function isManagedSession(value) {
    return isResponseRecord(value)
      && MANAGED_SESSION_TEXT.every((member) => typeof value[member] === "string")
      && typeof value.sessionReference === "string"
      && SESSION_REFERENCE_PATTERN.test(value.sessionReference)
      && typeof value.isCurrent === "boolean";
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserManagedSessionUser}
   */
  function isManagedSessionUser(value) {
    return isResponseRecord(value)
      && MANAGED_SESSION_USER_TEXT.every((member) => typeof value[member] === "string")
      && value.userId !== "";
  }

  /**
   * The session list, read as a whole or not at all.
   *
   * **Refused rather than shortened, because this is a security view.** Dropping an element
   * would hide an active session from the administrator looking for exactly that, which is the
   * one failure this panel must not have. `null` takes the load-error path the page already
   * owned, which renders no rows and says the sessions could not be loaded - and that is
   * visibly different from "no sessions are connected".
   * @param {unknown} body
   * @returns {BrowserManagedSessionList | null}
   */
  function readManagedSessionList(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { sessions, user } = body;
    if (!Array.isArray(sessions) || !sessions.every(isManagedSession) || !isManagedSessionUser(user)) {
      return null;
    }
    return { sessions, user };
  }

  /**
   * The acknowledgement both revocation routes answer, or `null` when it cannot be vouched for.
   *
   * `null` never means "nothing was revoked": the request resolved, so the server did the work.
   * It means the browser has no count it may report, and the caller says so without inventing
   * one.
   * @param {unknown} body
   * @returns {BrowserSessionRevocationResult | null}
   */
  function readSessionRevocation(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { ok, revokedCount } = body;
    return ok === true && typeof revokedCount === "number" && Number.isFinite(revokedCount)
      ? { ok: true, revokedCount }
      : null;
  }

  /** @param {BrowserUserRecord} user */
  async function loadUserSessions(user) {
    const refreshButton = requireUserAdminValue(refreshUserSessionsButton, "refresh sessions button");

    refreshButton.disabled = true;
    requireUserAdminValue(userSessionList, "session list")
      .replaceChildren(createSessionStatusItem("Loading active sessions..."));

    try {
      const managed = readManagedSessionList(await requireApi().getJson(
        `/api/users/${encodeURIComponent(user.user_id)}/sessions`,
        { cache: "no-store" },
      ));
      if (!managed) {
        throw new Error("The managed session response could not be read.");
      }
      renderManagedUserSessions(managed.sessions);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        return;
      }
      renderManagedUserSessions([]);
      setUserAdminStatus(requireErrors().caughtMessage(error, "Active sessions could not be loaded."), true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  /** @param {BrowserManagedSession[]} nextSessions */
  function renderManagedUserSessions(nextSessions) {
    const sessionList = requireUserAdminValue(userSessionList, "session list");

    managedUserSessions = Array.isArray(nextSessions) ? nextSessions : [];
    sessionList.replaceChildren();
    requireUserAdminValue(revokeUserSessionsButton, "revoke sessions button").disabled =
      managedUserSessions.length === 0;

    if (!managedUserSessions.length) {
      sessionList.appendChild(createSessionStatusItem("No active sessions are connected to this workspace."));
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
      sessionList.appendChild(item);
    });
  }

  /** @param {BrowserUserRecord | undefined} user @param {BrowserManagedSession} session */
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

  /** @param {BrowserUserRecord} user */
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
      const revocation = readSessionRevocation(await requireApi().deleteJson(
        `/api/users/${encodeURIComponent(user.user_id)}/sessions`,
      ));
      // The request resolved, so the sessions are gone either way; without a count the browser
      // says so rather than reporting one it cannot vouch for. The refresh below shows the truth.
      setUserAdminStatus(revocation
        ? `Revoked ${revocation.revokedCount} session${revocation.revokedCount === 1 ? "" : "s"}.`
        : "Workspace sessions were revoked.");
      await loadUserSessions(user);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        return;
      }
      setUserAdminStatus(requireErrors().caughtMessage(error, "Sessions could not be revoked."), true);
    }
  }

  /** @param {string} message */
  function createSessionStatusItem(message) {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }

  /** @param {BrowserManagedSession["createdAt"]} value an ISO timestamp the reader vouched for */
  function formatSessionDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
  }

  function getEditingUser() {
    const editingUserId = requireUserAdminValue(editUserIdInput, "identity input").value;
    return users.find((user) => user.user_id === editingUserId);
  }

  async function saveEditedUser() {
    const user = getEditingUser();
    const username = requireUserAdminValue(editUserUsernameInput, "username input").value.trim().toLowerCase();
    const displayName = requireUserAdminValue(editUserDisplayNameInput, "display name input").value.trim();
    const altEmail = requireUserAdminValue(editUserAltEmailInput, "alternate email input").value.trim().toLowerCase();
    const timezone = requireUserAdminValue(editUserTimezoneSelect, "timezone select").value;

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

    requireUserAdminValue(saveEditUserButton, "save button").disabled = true;
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
      requireUserAdminValue(saveEditUserButton, "save button").disabled = false;
    }
  }

  function renderRoleOptions() {
    const roleSelect = requireUserAdminValue(roleAssignmentRoleSelect, "role select");

    roleSelect.replaceChildren();

    roles.forEach((role) => {
      const option = document.createElement("option");

      option.value = role.role_id;
      option.textContent = role.role_name;
      option.dataset.scopeType = role.assignable_scope_type;
      roleSelect.appendChild(option);
    });

    if (newUserRoleSelect) {
      renderNewUserRoleOptions();
    }

    renderScopeOptions();
  }

  /** @param {string} value @param {string} label */
  function createRoleOption(value, label) {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    return option;
  }

  function renderScopeOptions() {
    const roleSelect = requireUserAdminValue(roleAssignmentRoleSelect, "role select");
    const scopeSelect = requireUserAdminValue(roleAssignmentScopeSelect, "scope select");
    const role = roles.find((item) => item.role_id === roleSelect.value);
    const scopeType = role?.assignable_scope_type || "workspace";

    scopeSelect.replaceChildren();
    scopeSelect.disabled = scopeType === "workspace" || scopeType === "global";

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

  /** @param {string} value @param {string} label */
  function appendScopeOption(value, label) {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    requireUserAdminValue(roleAssignmentScopeSelect, "scope select").appendChild(option);
  }

  function addPendingRoleAssignment() {
    const roleSelect = requireUserAdminValue(roleAssignmentRoleSelect, "role select");
    const role = roles.find((item) => item.role_id === roleSelect.value);

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
    const assignmentList = requireUserAdminValue(roleAssignmentList, "assignment list");

    assignmentList.replaceChildren();

    if (pendingRoleAssignments.length === 0) {
      const emptyItem = document.createElement("li");

      emptyItem.textContent = "No roles assigned.";
      assignmentList.appendChild(emptyItem);
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
      assignmentList.appendChild(item);
    });
  }

  /**
   * @param {BrowserUserWorkspaceMembership[]} memberships as `BrowserUserRecord` carries them
   * @param {BrowserUserRecord | null | undefined} [user] the account being edited, or nothing
   *
   * Declared because typing the `users` slot gave the `getEditingUser()` default an inferred
   * type that `closeEditUserDialog` immediately contradicted by passing `null`. Null is a real
   * argument here - closing the dialog renders the empty state - so the domain says so rather
   * than the call site being changed to suit an inference. The body already reads `user?.user_id`.
   */
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

  /** @param {PendingRoleAssignment} assignment */
  function formatRoleAssignment(assignment) {
    const role = roles.find((item) => item.role_id === assignment.role_id);
    const scopeLabel = formatScopeLabel(assignment);
    // Normalised rather than read raw: a server-sourced row carries whatever the server sent, and
    // the defaults answer the same falsy values the bare `|| {}` did for an absent member.
    const overrides = normalizePermissionOverrides(assignment.permission_overrides);
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

  /**
   * @param {{ scope_type: string, scope_id: string | null }} assignment the two members this
   *   reads, so a staged row and a saved one both satisfy it
   */
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

  /** @param {BrowserRoleOption} role */
  function getDraftAssignment(role) {
    const scopeType = role.assignable_scope_type === "global" ? "all" : role.assignable_scope_type;

    return {
      role_id: role.role_id,
      scope_type: scopeType,
      scope_id: scopeType === "all"
        ? "all"
        : scopeType === "workspace"
          ? "workspace"
          : requireUserAdminValue(roleAssignmentScopeSelect, "scope select").value,
    };
  }

  /**
   * @param {{ title: string, overrides: unknown, onSave: (overrides: PermissionOverrides) => void }} target
   */
  function openPermissionDialog({ title, overrides, onSave }) {
    editingPermissionTarget = {
      onSave,
      overrides: normalizePermissionOverrides(overrides),
    };
    requireUserAdminValue(rolePermissionsSummary, "permission summary").textContent = title;
    renderPermissionMatrix(editingPermissionTarget.overrides);
    requireUserAdminValue(rolePermissionsDialog, "permission dialog").showModal();
  }

  function closePermissionDialog() {
    const dialog = requireUserAdminValue(rolePermissionsDialog, "permission dialog");

    if (dialog.open) {
      dialog.close();
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

  /** @param {PermissionOverrides} overrides */
  function renderPermissionMatrix(overrides) {
    const matrix = requireUserAdminValue(permissionMatrix, "permission matrix");

    matrix.replaceChildren();

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
      matrix.appendChild(row);
    });

    const billingLabel = document.createElement("label");
    const billingCheckbox = document.createElement("input");

    billingLabel.className = "permission-standalone";
    billingCheckbox.type = "checkbox";
    billingCheckbox.checked = Boolean(overrides.restrictBilling);
    billingCheckbox.dataset.permissionFlag = "restrictBilling";
    billingLabel.append(billingCheckbox, document.createTextNode("Restrict billing detail edits"));
    matrix.appendChild(billingLabel);
  }

  /** @returns {PermissionOverrides} */
  function readPermissionMatrix() {
    const matrix = requireUserAdminValue(permissionMatrix, "permission matrix");
    const overrides = normalizePermissionOverrides(editingPermissionTarget?.overrides || {});
    const checkboxes = matrix.querySelectorAll("[data-permission-resource]");

    checkboxes.forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) {
        return;
      }

      // The selector is the attribute, so both datasets are present on anything it matches. The
      // fallbacks name that rather than assert it, and miss the record exactly as an absent
      // dataset already did.
      const resource = checkbox.dataset.permissionResource ?? "";
      const operation = checkbox.dataset.permissionOperation ?? "";

      overrides.operationAccess[resource][operation] = checkbox.checked;
    });

    const billingFlag = matrix.querySelector("[data-permission-flag='restrictBilling']");

    overrides.restrictBilling = Boolean(billingFlag instanceof HTMLInputElement && billingFlag.checked);
    overrides.allowManualTime = getOperationAllowed(overrides, "time_entries", "create");
    overrides.allowEditTime = getOperationAllowed(overrides, "time_entries", "update");

    return overrides;
  }

/**
   * The permission overrides **this page has normalised**, which is not the wire member.
   *
   * `BrowserRoleAssignment.permission_overrides` is declared `unknown` deliberately, and this
   * child does not change that: nothing validates the value the server sends. What *is*
   * established is the value this module produces - `createDefaultPermissionOverrides` builds
   * every member, and `normalizePermissionOverrides` coerces every member of an arbitrary input
   * into that shape with `Boolean(...)` and `!== false`. So this model is true of anything those
   * two return, and it is declared here rather than published for exactly that reason.
   * @typedef {{
   *   allowEditTime: boolean,
   *   allowManualTime: boolean,
   *   operationAccess: Record<string, Record<string, boolean>>,
   *   restrictBilling: boolean,
   * }} PermissionOverrides
   */

  /** @returns {PermissionOverrides} */
  function createDefaultPermissionOverrides() {
    /** @type {Record<string, Record<string, boolean>>} */
    const operationAccess = {};

    permissionResources.forEach((resource) => {
      /** @type {Record<string, boolean>} */
      const operations = {};

      resource.operations.forEach((operation) => {
        operations[operation] = true;
      });

      operationAccess[resource.key] = operations;
    });

    return {
      restrictBilling: false,
      allowManualTime: true,
      allowEditTime: true,
      operationAccess,
    };
  }

  /**
   * @param {unknown} [overrides] as the wire member carries it: unvalidated, and typed `unknown`
   *   by `BrowserRoleAssignment` on purpose
   * @returns {PermissionOverrides}
   */
  function normalizePermissionOverrides(overrides = {}) {
    const normalized = createDefaultPermissionOverrides();
    // Narrowed rather than trusted. The three flags were already coerced; the nested records were
    // not, and `Object.entries` on a non-record answered index keys that were then written into
    // the matrix. A non-record now contributes nothing, which is what the defaults already meant.
    const source = isResponseRecord(overrides) ? overrides : {};
    const operationAccess = isResponseRecord(source.operationAccess) ? source.operationAccess : {};

    normalized.restrictBilling = Boolean(source.restrictBilling);
    normalized.allowManualTime = source.allowManualTime !== false;
    normalized.allowEditTime = source.allowEditTime !== false;

    Object.entries(operationAccess).forEach(([resourceKey, operations]) => {
      normalized.operationAccess[resourceKey] ||= {};

      Object.entries(isResponseRecord(operations) ? operations : {}).forEach(([operation, allowed]) => {
        normalized.operationAccess[resourceKey][operation] = allowed !== false;
      });
    });

    permissionResources.forEach((resource) => {
      const resourceAccess = operationAccess[resource.key];

      if (!isResponseRecord(resourceAccess)) {
        return;
      }

      resource.operations.forEach((operation) => {
        if (resourceAccess[operation] === false) {
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

  /**
   * @param {PermissionOverrides} overrides
   * @param {string} resource
   * @param {string} operation
   */
  function getOperationAllowed(overrides, resource, operation) {
    return overrides.operationAccess?.[resource]?.[operation] !== false;
  }

  /** @param {string} operation */
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

  /** @param {string} password */
  function showGeneratedPassword(password) {
    requireUserAdminValue(generatedPasswordInput, "generated password input").value = password;
    requireUserAdminValue(generatedPasswordPanel, "generated password panel").hidden = !password;
  }

  async function copyGeneratedPassword() {
    const passwordInput = requireUserAdminValue(generatedPasswordInput, "generated password input");

    if (!passwordInput.value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(passwordInput.value);
    } catch {
      passwordInput.select();
      document.execCommand("copy");
    }

    const copyButton = requireUserAdminValue(copyGeneratedPasswordButton, "copy-password button");
    const originalText = copyButton.textContent;
    copyButton.textContent = "Copied.";
    copyButton.classList.add("is-saved");

    window.setTimeout(() => {
      copyButton.textContent = originalText;
      copyButton.classList.remove("is-saved");
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

  /** @param {string} timezone the account timezone, or the page default when it has none */
  function setEditUserTimezoneValue(timezone) {
    const timezoneSelect = requireUserAdminValue(editUserTimezoneSelect, "timezone select");
    const matchingOption = [...timezoneSelect.options].find((option) => option.value === timezone);

    if (!matchingOption) {
      const option = document.createElement("option");

      option.value = timezone;
      option.textContent = timezone;
      timezoneSelect.appendChild(option);
    }

    timezoneSelect.value = timezone;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function setUserAdminStatus(message, isError = false) {
    requirePageController().setStatus(userAdminStatus, message, { isError });
    requireUserAdminValue(userAdminStatus, "status region").classList.toggle("is-error", isError);
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
