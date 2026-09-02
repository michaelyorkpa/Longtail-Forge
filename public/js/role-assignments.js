(function attachRoleAssignmentsPage() {
  const lookupForm = document.querySelector("[data-role-account-lookup]");
  const accountEmailInput = document.querySelector("[data-role-account-email]");
  const findAccountButton = document.querySelector("[data-find-role-account]");
  const statusElement = asStatusElement(document.querySelector("[data-role-assignment-status]"));
  const targetSection = document.querySelector("[data-role-target]");
  const targetHeading = document.querySelector("[data-role-target-heading]");
  const targetAccount = document.querySelector("[data-role-target-account]");
  const assignmentList = document.querySelector("[data-delegated-role-list]");
  const addAssignmentForm = document.querySelector("[data-add-delegated-role]");
  const roleSelect = document.querySelector("[data-delegated-role]");
  const scopeSelect = document.querySelector("[data-delegated-scope]");
  const addAssignmentButton = document.querySelector("[data-add-delegated-role-button]");

  let roleOptions = [];
  let target = null;
  let busy = false;

  loadRoleOptions();

  lookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await findAccount();
  });

  accountEmailInput.addEventListener("input", () => {
    if (target && normalizeEmail(accountEmailInput.value) !== target.username) {
      clearTarget();
      setStatus("");
    }
  });

  roleSelect.addEventListener("change", renderScopeOptions);

  addAssignmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await confirmAddAssignment();
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

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
   * A response body that is a plain object.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserDelegatedRoleAssignment} BrowserDelegatedRoleAssignment */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserRoleAssignmentUpdate} BrowserRoleAssignmentUpdate */

  /**
   * One assignment as the delegated paths emit it.
   *
   * Three members and no more: `decorateDelegatedAssignment` withholds the assignment identity and
   * the permission overrides that the administrator record carries.
   * @param {unknown} value
   * @returns {value is BrowserDelegatedRoleAssignment}
   */
  function isDelegatedAssignment(value) {
    return isResponseRecord(value)
      && typeof value.role_id === "string"
      && typeof value.scope_type === "string"
      && (value.scope_id === null || typeof value.scope_id === "string")
      && value.role_id !== "";
  }

  /**
   * What a role-assignment update resolved to.
   *
   * **The revision is absent for a full administrator and present for a delegated manager**, which
   * is the producer's own union rather than a defensive read. `String(body.assignmentRevision || "")`
   * has always turned that absence into `""`, and this keeps doing so.
   * @param {unknown} body
   * @returns {BrowserRoleAssignmentUpdate}
   */
  function readAssignmentUpdate(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const assignments = envelope && Array.isArray(envelope.assignments)
      ? envelope.assignments.filter(isDelegatedAssignment)
      : [];
    const revision = envelope ? envelope.assignmentRevision : null;
    return typeof revision === "string"
      ? { assignmentRevision: revision, assignments }
      : { assignments };
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAssignmentLookup} BrowserAssignmentLookup */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAssignmentLookupTarget} BrowserAssignmentLookupTarget */

  /**
   * The workspace member `POST /api/role-assignments/lookup` matched.
   *
   * **Not the account lookup's record.** That route searches every account in the installation;
   * this one joins `user_workspaces` and can only identify an active member of the caller's own
   * workspace. Six members here against three there, and the two must not be shared.
   * @param {unknown} value
   * @returns {value is BrowserAssignmentLookupTarget}
   */
  function isAssignmentLookupTarget(value) {
    return isResponseRecord(value)
      && typeof value.activeMembership === "boolean"
      && typeof value.assignmentRevision === "string"
      && Array.isArray(value.assignments)
      && typeof value.displayName === "string"
      && typeof value.userId === "string"
      && typeof value.username === "string"
      && value.userId !== "";
  }

  /**
   * The assignment-target lookup a body carries.
   *
   * **The container check moves to the elements without changing the no-match answer.** The
   * consumer already treated a falsy `match` as no match and `normalizeTarget` already accepted
   * any array as the assignments; a malformed *entry* is now dropped rather than handed to the
   * assignment editor, and a malformed *match* reads as no match, which is the fail-closed
   * direction for a lookup that decides who may be administered.
   * @param {unknown} body
   * @returns {BrowserAssignmentLookup}
   */
  function readAssignmentLookup(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const match = envelope ? envelope.match : null;
    if (!isAssignmentLookupTarget(match)) {
      return { match: null };
    }

    return {
      match: {
        activeMembership: match.activeMembership,
        assignmentRevision: match.assignmentRevision,
        assignments: match.assignments.filter(isDelegatedAssignment),
        displayName: match.displayName,
        userId: match.userId,
        username: match.username,
      },
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
      throw new Error("Role assignments requires LongtailForge.errors.");
    }
    return errors;
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
      throw new Error("Role assignments requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserStatusMessage} BrowserStatusMessage */

  /**
   * The status-message helpers this page cannot report through without. Every page that loads
   * this script also loads `shared/status.js` ahead of it, so the checked read fails exactly
   * where the raw read failed before.
   * @returns {BrowserStatusMessage}
   */
  function requireStatusMessage() {
    const status = window.LongtailForge?.status;
    if (!status) {
      throw new Error("Role assignments requires LongtailForge.status.");
    }
    return status;
  }

  /**
   * A status element the message helpers can drive. They set `hidden`, which only an
   * `HTMLElement` has; anything else was already a silent no-op and stays one.
   * @param {Element | null} node
   * @returns {HTMLElement | null}
   */
  function asStatusElement(node) {
    return node && "hidden" in node ? /** @type {HTMLElement} */ (node) : null;
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
      throw new Error("Role assignments requires LongtailForge.modal.");
    }
    return dialogs;
  }

  async function loadRoleOptions() {
    setBusy(true);
    setStatus("Loading available roles...");

    try {
      const body = await requireApi().getJson("/api/roles", { cache: "no-store" });
      roleOptions = readRoleOptions(body);
      renderRoleOptions();
      setStatus(roleOptions.length ? "" : "No role assignments are available in this workspace.");
    } catch (error) {
      handleLoadError(error, "Available roles could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function findAccount() {
    const username = normalizeEmail(accountEmailInput.value);
    if (!accountEmailInput.checkValidity() || !username) {
      accountEmailInput.reportValidity();
      return;
    }

    setBusy(true);
    clearTarget();
    setStatus("Finding account...");

    try {
      const lookup = readAssignmentLookup(await requireApi().postJson("/api/role-assignments/lookup", {
        username,
      }));

      if (!lookup.match) {
        setStatus("No active workspace member matched that email.");
        accountEmailInput.focus();
        return;
      }

      target = normalizeTarget(lookup.match);
      renderTarget();
      setStatus("");
      targetHeading.focus();
    } catch (error) {
      handleLoadError(error, "The account could not be found.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAddAssignment() {
    if (!target?.assignmentRevision) {
      setStatus("Find the account again before changing assignments.", true);
      accountEmailInput.focus();
      return;
    }

    const assignment = selectedAssignment();
    const descriptor = describeAssignment(assignment);
    if (!assignment || !descriptor) {
      setStatus("Choose a role and scope.", true);
      return;
    }

    if (target.assignments.some((item) => assignmentKey(item) === assignmentKey(assignment))) {
      setStatus("That delegable assignment is already present.", true);
      roleSelect.focus();
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
      title: "Add role assignment?",
      message: `Add ${descriptor.roleLabel} for ${target.username} at ${descriptor.scopeLabel}?`,
      confirmLabel: "Add Assignment",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    await saveAssignments(
      [...target.assignments, assignment],
      `${descriptor.roleLabel} was added at ${descriptor.scopeLabel}.`,
    );
  }

  async function confirmRemoveAssignment(assignment, trigger) {
    const descriptor = describeAssignment(assignment);
    if (!target?.assignmentRevision || !descriptor) return;

    const confirmed = await requireModalDialogs().confirm({
      title: "Remove role assignment?",
      message: `Remove ${descriptor.roleLabel} for ${target.username} at ${descriptor.scopeLabel}?`,
      confirmLabel: "Remove Assignment",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!confirmed) return;

    const saved = await saveAssignments(
      target.assignments.filter((item) => assignmentKey(item) !== assignmentKey(assignment)),
      `${descriptor.roleLabel} was removed from ${descriptor.scopeLabel}.`,
    );

    if (saved) {
      targetHeading.focus();
    } else if (trigger?.isConnected) {
      trigger.focus();
    }
  }

  async function saveAssignments(assignments, successMessage) {
    setBusy(true);
    setStatus("Updating role assignments...");

    try {
      const body = await requireApi().putJson(
        `/api/users/${encodeURIComponent(target.userId)}/role-assignments`,
        {
          assignmentRevision: target.assignmentRevision,
          assignments,
        },
      );
      const update = readAssignmentUpdate(body);
      target.assignments = update.assignments;
      target.assignmentRevision = update.assignmentRevision || "";
      renderTarget();
      setStatus(successMessage);
      return true;
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 409) {
        target.assignmentRevision = "";
        renderTarget();
        setStatus("Assignments changed. Find the account again before making another change.", true);
        findAccountButton.focus();
        return false;
      }
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return false;
      }
      setStatus(requireErrors().caughtMessage(error, "Role assignments could not be updated."), true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function renderTarget() {
    if (!target) {
      clearTarget();
      return;
    }

    targetSection.hidden = false;
    targetHeading.textContent = target.displayName || target.username;
    targetAccount.textContent = target.username;
    assignmentList.replaceChildren();

    if (!target.assignments.length) {
      const emptyItem = document.createElement("li");
      const message = document.createElement("span");
      message.className = "muted-text";
      message.textContent = "No delegable assignments are currently shown.";
      emptyItem.appendChild(message);
      assignmentList.appendChild(emptyItem);
    } else {
      target.assignments.forEach((assignment) => {
        const descriptor = describeAssignment(assignment);
        const item = document.createElement("li");
        const label = document.createElement("span");
        const removeButton = document.createElement("button");

        label.textContent = `${descriptor.roleLabel} — ${descriptor.scopeLabel}`;
        removeButton.type = "button";
        removeButton.className = "danger-button";
        removeButton.textContent = "Remove";
        removeButton.disabled = busy || !target.assignmentRevision;
        removeButton.setAttribute(
          "aria-label",
          `Remove ${descriptor.roleLabel} at ${descriptor.scopeLabel}`,
        );
        removeButton.addEventListener("click", () => confirmRemoveAssignment(assignment, removeButton));
        item.append(label, removeButton);
        assignmentList.appendChild(item);
      });
    }

    renderRoleOptions();
  }

  function renderRoleOptions() {
    const previousRoleId = roleSelect.value;
    roleSelect.replaceChildren(createOption("", "Choose a role"));

    roleOptions.forEach((role) => {
      roleSelect.appendChild(createOption(role.role_id, role.role_name || "Available role"));
    });

    roleSelect.value = roleOptions.some((role) => role.role_id === previousRoleId)
      ? previousRoleId
      : roleOptions[0]?.role_id || "";
    renderScopeOptions();
  }

  function renderScopeOptions() {
    const role = selectedRole();
    const previousScopeId = scopeSelect.value;
    scopeSelect.replaceChildren(createOption("", "Choose a scope"));

    (role?.scopes || []).forEach((scope) => {
      scopeSelect.appendChild(createOption(scope.scopeId, scope.label || "Available scope"));
    });

    scopeSelect.value = (role?.scopes || []).some((scope) => scope.scopeId === previousScopeId)
      ? previousScopeId
      : role?.scopes?.[0]?.scopeId || "";
    updateControls();
  }

  function selectedRole() {
    return roleOptions.find((role) => role.role_id === roleSelect.value) || null;
  }

  function selectedAssignment() {
    const role = selectedRole();
    const scopeId = String(scopeSelect.value || "");
    if (!role || !scopeId) return null;

    return {
      role_id: role.role_id,
      scope_type: role.assignment_scope_type,
      scope_id: scopeId,
    };
  }

  function describeAssignment(assignment) {
    if (!assignment) return null;
    const role = roleOptions.find((option) => option.role_id === assignment.role_id);
    const scope = role?.scopes?.find((option) => option.scopeId === assignment.scope_id);

    return {
      roleLabel: role?.role_name || "Unavailable role",
      scopeLabel: scope?.label || "Unavailable scope",
    };
  }

  function normalizeTarget(match) {
    return {
      assignmentRevision: String(match.assignmentRevision || ""),
      assignments: Array.isArray(match.assignments) ? match.assignments : [],
      displayName: String(match.displayName || ""),
      userId: String(match.userId || ""),
      username: normalizeEmail(match.username),
    };
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function assignmentKey(assignment) {
    return [assignment.role_id, assignment.scope_type, assignment.scope_id].join(":");
  }

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function clearTarget() {
    target = null;
    targetSection.hidden = true;
    targetHeading.textContent = "";
    targetAccount.textContent = "";
    assignmentList.replaceChildren();
    updateControls();
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    updateControls();
  }

  function updateControls() {
    const hasTarget = Boolean(target);
    const hasRevision = Boolean(target?.assignmentRevision);
    findAccountButton.disabled = busy;
    accountEmailInput.disabled = busy;
    roleSelect.disabled = busy || !hasTarget || !hasRevision || roleOptions.length === 0;
    scopeSelect.disabled = busy || !hasTarget || !hasRevision || !selectedRole();
    addAssignmentButton.disabled = busy || !hasTarget || !hasRevision || !selectedAssignment();
    assignmentList.querySelectorAll("button").forEach((button) => {
      button.disabled = busy || !hasRevision;
    });
  }

  function setStatus(message, isError = false) {
    requireStatusMessage().set(statusElement, message, {
      type: isError ? "error" : "",
    });
  }

  function handleLoadError(error, fallbackMessage) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }
    if (error.status === 403) {
      void window.LongtailForge.recovery?.permissionDenied();
    }
    setStatus(error.message || fallbackMessage, true);
  }
})();
