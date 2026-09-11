(function attachRoleAssignmentsPage() {
  /**
   * One control, at the subtype `views/protected/role-assignments.html` renders, or `null`.
   *
   * **Typed-or-null on purpose**, the reading `0.33.33.44.5` settled and `0.33.33.44.12` reused:
   * the markup is static and always carries these controls, but acquisition runs at module
   * evaluation - outside every `try` on this page - so refusing here would turn a missing control
   * into a dead page instead of the status this page already produces. The subtype is settled
   * here; presence is settled at the statement that already dereferenced it.
   * @template T
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function findRoleControl(selector, constructor) {
    const element = document.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * Narrow at an access this page already made unguarded.
   * @template T
   * @param {T | null} value
   * @param {string} name
   * @returns {T}
   */
  function requireRoleValue(value, name) {
    if (value === null) {
      throw new TypeError(`Role Assignments requires its ${name}.`);
    }

    return value;
  }

  const lookupForm = findRoleControl("[data-role-account-lookup]", HTMLFormElement);
  const accountEmailInput = findRoleControl("[data-role-account-email]", HTMLInputElement);
  const findAccountButton = findRoleControl("[data-find-role-account]", HTMLButtonElement);
  const statusElement = asStatusElement(document.querySelector("[data-role-assignment-status]"));
  const targetSection = findRoleControl("[data-role-target]", HTMLElement);
  const targetHeading = findRoleControl("[data-role-target-heading]", HTMLElement);
  const targetAccount = findRoleControl("[data-role-target-account]", HTMLElement);
  const assignmentList = findRoleControl("[data-delegated-role-list]", HTMLElement);
  const addAssignmentForm = findRoleControl("[data-add-delegated-role]", HTMLFormElement);
  const roleSelect = findRoleControl("[data-delegated-role]", HTMLSelectElement);
  const scopeSelect = findRoleControl("[data-delegated-scope]", HTMLSelectElement);
  const addAssignmentButton = findRoleControl("[data-add-delegated-role-button]", HTMLButtonElement);

  /**
   * The roles this workspace may delegate.
   *
   * Established by `readRoleOptions`, which filters the body through `isRoleOption` and answers
   * `BrowserRoleOption[]` - so `role_id`, `role_name` and `scopes` are facts here.
   * @type {BrowserRoleOption[]}
   */
  let roleOptions = [];
  /**
   * The account being administered, or `null` before one is found.
   *
   * Rebuilt by `normalizeTarget` from a match `readAssignmentLookup` already vouched for: that
   * reader refuses a malformed match outright and filters `assignments` through
   * `isDelegatedAssignment`, so every element here is a checked `BrowserDelegatedRoleAssignment`.
   * @type {NormalizedAssignmentTarget | null}
   */
  let target = null;
  let busy = false;

  loadRoleOptions();

  requireRoleValue(lookupForm, "account lookup form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await findAccount();
  });

  const emailInput = requireRoleValue(accountEmailInput, "account email field");

  emailInput.addEventListener("input", () => {
    if (target && normalizeEmail(emailInput.value) !== target.username) {
      clearTarget();
      setStatus("");
    }
  });

  requireRoleValue(roleSelect, "role select").addEventListener("change", renderScopeOptions);

  requireRoleValue(addAssignmentForm, "add assignment form").addEventListener("submit", async (event) => {
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

  /** @typedef {import("../../src/types/browser-contracts.js").LongtailForgeBrowserNamespace} LongtailForgeBrowserNamespace */

  /**
   * The namespace root the optional members on this page are reached through.
   *
   * **The root is checked and the member is not, because those are different facts.** Every
   * read keeps its own `?.` exactly where it stands: a missing root failed at the property
   * read before and fails here, in the same expression and the same region, while a present
   * root that publishes no such member goes on short-circuiting as it always did.
   *
   * Read per call rather than captured, so a root replaced between invocations is seen.
   * @returns {LongtailForgeBrowserNamespace}
   */
  function requireNamespace() {
    const namespace = window.LongtailForge;

    if (!namespace) {
      throw new Error("Role Assignments requires the LongtailForge namespace.");
    }

    return namespace;
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
   * This page's own status node, kept rather than retired.
   *
   * `0.33.33.38.3.1` retired `workspace-settings.js`'s copy and
   * `workspace-deletion-dialog-dom-contracts` pins that the retirement was **scoped to that one
   * page** - this cohort of five keeps its own helper. `0.33.33.44.19` removed it here and that
   * contract refused the sweep, correctly.
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
    const username = normalizeEmail(emailInput.value);
    if (!emailInput.checkValidity() || !username) {
      emailInput.reportValidity();
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
        emailInput.focus();
        return;
      }

      target = normalizeTarget(lookup.match);
      renderTarget();
      setStatus("");
      requireRoleValue(targetHeading, "target heading").focus();
    } catch (error) {
      handleLoadError(error, "The account could not be found.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAddAssignment() {
    if (!target?.assignmentRevision) {
      setStatus("Find the account again before changing assignments.", true);
      emailInput.focus();
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
      requireRoleValue(roleSelect, "role select").focus();
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

  /**
   * @param {BrowserDelegatedRoleAssignment} assignment
   * @param {HTMLButtonElement} trigger
   */
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
      requireRoleValue(targetHeading, "target heading").focus();
    } else if (trigger?.isConnected) {
      trigger.focus();
    }
  }

  /**
   * @param {BrowserRoleAssignmentUpdate["assignments"]} assignments
   * @param {string} successMessage
   * @returns {Promise<boolean>}
   */
  async function saveAssignments(assignments, successMessage) {
    // Only reachable with a found account: every caller runs from the target's own controls.
    const account = requireRoleValue(target, "assignment target");
    setBusy(true);
    setStatus("Updating role assignments...");

    try {
      const body = await requireApi().putJson(
        `/api/users/${encodeURIComponent(account.userId)}/role-assignments`,
        {
          assignmentRevision: account.assignmentRevision,
          assignments,
        },
      );
      const update = readAssignmentUpdate(body);
      account.assignments = update.assignments;
      account.assignmentRevision = update.assignmentRevision || "";
      renderTarget();
      setStatus(successMessage);
      return true;
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 409) {
        account.assignmentRevision = "";
        renderTarget();
        setStatus("Assignments changed. Find the account again before making another change.", true);
        requireRoleValue(findAccountButton, "find account button").focus();
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

    const section = requireRoleValue(targetSection, "target section");
    const heading = requireRoleValue(targetHeading, "target heading");
    const account = requireRoleValue(targetAccount, "target account");
    const list = requireRoleValue(assignmentList, "assignment list");

    section.hidden = false;
    heading.textContent = target.displayName || target.username;
    account.textContent = target.username;
    list.replaceChildren();

    if (!target.assignments.length) {
      const emptyItem = document.createElement("li");
      const message = document.createElement("span");
      message.className = "muted-text";
      message.textContent = "No delegable assignments are currently shown.";
      emptyItem.appendChild(message);
      list.appendChild(emptyItem);
    } else {
      target.assignments.forEach((assignment) => {
        const descriptor = describeAssignment(assignment);

        // Unreachable for a checked element: `readAssignmentLookup` already dropped anything
        // `isDelegatedAssignment` refused, so every assignment here describes. Skipping is the
        // same answer that reader gives, rather than the throw an undescribable entry used to get.
        if (!descriptor) {
          return;
        }

        const item = document.createElement("li");
        const label = document.createElement("span");
        const removeButton = document.createElement("button");

        label.textContent = `${descriptor.roleLabel} — ${descriptor.scopeLabel}`;
        removeButton.type = "button";
        removeButton.className = "danger-button";
        removeButton.textContent = "Remove";
        removeButton.disabled = busy || !target?.assignmentRevision;
        removeButton.setAttribute(
          "aria-label",
          `Remove ${descriptor.roleLabel} at ${descriptor.scopeLabel}`,
        );
        removeButton.addEventListener("click", () => confirmRemoveAssignment(assignment, removeButton));
        item.append(label, removeButton);
        list.appendChild(item);
      });
    }

    renderRoleOptions();
  }

  function renderRoleOptions() {
    const select = requireRoleValue(roleSelect, "role select");
    const previousRoleId = select.value;
    select.replaceChildren(createOption("", "Choose a role"));

    roleOptions.forEach((role) => {
      select.appendChild(createOption(role.role_id, role.role_name || "Available role"));
    });

    select.value = roleOptions.some((role) => role.role_id === previousRoleId)
      ? previousRoleId
      : roleOptions[0]?.role_id || "";
    renderScopeOptions();
  }

  function renderScopeOptions() {
    const select = requireRoleValue(scopeSelect, "scope select");
    const role = selectedRole();
    const previousScopeId = select.value;
    select.replaceChildren(createOption("", "Choose a scope"));

    (role?.scopes || []).forEach((scope) => {
      select.appendChild(createOption(scope.scopeId, scope.label || "Available scope"));
    });

    select.value = (role?.scopes || []).some((scope) => scope.scopeId === previousScopeId)
      ? previousScopeId
      : role?.scopes?.[0]?.scopeId || "";
    updateControls();
  }

  /** @returns {BrowserRoleOption | null} */
  function selectedRole() {
    return roleOptions.find((role) => role.role_id === requireRoleValue(roleSelect, "role select").value) || null;
  }

  function selectedAssignment() {
    const role = selectedRole();
    const scopeId = String(requireRoleValue(scopeSelect, "scope select").value || "");
    if (!role || !scopeId) return null;

    return {
      role_id: role.role_id,
      scope_type: role.assignment_scope_type,
      scope_id: scopeId,
    };
  }

  /**
   * @param {BrowserDelegatedRoleAssignment | null} assignment
   * @returns {{ roleLabel: string, scopeLabel: string } | null}
   */
  function describeAssignment(assignment) {
    if (!assignment) return null;
    const role = roleOptions.find((option) => option.role_id === assignment.role_id);
    const scope = role?.scopes?.find((option) => option.scopeId === assignment.scope_id);

    return {
      roleLabel: role?.role_name || "Unavailable role",
      scopeLabel: scope?.label || "Unavailable scope",
    };
  }

  /**
   * @typedef {{
   *   assignmentRevision: string,
   *   assignments: BrowserDelegatedRoleAssignment[],
   *   displayName: string,
   *   userId: string,
   *   username: string,
   * }} NormalizedAssignmentTarget
   */

  /**
   * @param {import("../../src/types/browser-contracts.js").BrowserAssignmentLookupTarget} match
   * @returns {NormalizedAssignmentTarget}
   */
  function normalizeTarget(match) {
    return {
      assignmentRevision: String(match.assignmentRevision || ""),
      assignments: Array.isArray(match.assignments) ? match.assignments : [],
      displayName: String(match.displayName || ""),
      userId: String(match.userId || ""),
      username: normalizeEmail(match.username),
    };
  }

  /** @param {unknown} value @returns {string} */
  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  /** @param {BrowserDelegatedRoleAssignment} assignment @returns {string} */
  function assignmentKey(assignment) {
    return [assignment.role_id, assignment.scope_type, assignment.scope_id].join(":");
  }

  /** @param {string} value @param {string} label @returns {HTMLOptionElement} */
  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function clearTarget() {
    target = null;
    requireRoleValue(targetSection, "target section").hidden = true;
    requireRoleValue(targetHeading, "target heading").textContent = "";
    requireRoleValue(targetAccount, "target account").textContent = "";
    requireRoleValue(assignmentList, "assignment list").replaceChildren();
    updateControls();
  }

  /** @param {boolean} nextBusy */
  function setBusy(nextBusy) {
    busy = nextBusy;
    updateControls();
  }

  function updateControls() {
    const hasTarget = Boolean(target);
    const hasRevision = Boolean(target?.assignmentRevision);
    requireRoleValue(findAccountButton, "find account button").disabled = busy;
    requireRoleValue(accountEmailInput, "account email field").disabled = busy;
    requireRoleValue(roleSelect, "role select").disabled = busy || !hasTarget || !hasRevision || roleOptions.length === 0;
    requireRoleValue(scopeSelect, "scope select").disabled = busy || !hasTarget || !hasRevision || !selectedRole();
    requireRoleValue(addAssignmentButton, "add assignment button").disabled = busy || !hasTarget || !hasRevision || !selectedAssignment();
    requireRoleValue(assignmentList, "assignment list").querySelectorAll("button").forEach((button) => {
      button.disabled = busy || !hasRevision;
    });
  }

  /** @param {string} message @param {boolean} [isError] */
  function setStatus(message, isError = false) {
    requireStatusMessage().set(statusElement, message, {
      type: isError ? "error" : "",
    });
  }

  /** @param {unknown} error @param {string} fallbackMessage */
  function handleLoadError(error, fallbackMessage) {
    // Narrowed inline and read as plain members. Two contracts constrain this:
    // `optional-member-root-contracts` pins that the 401 redirect returns *before* anything
    // reaches the namespace root - so `requireErrors()`, which throws without a root, cannot be
    // used here - and that same suite lifts this function with only `requireNamespace` beside it,
    // so it may not call `isResponseRecord` either. `in` answers both without a cast, and the
    // properties touched and their order are exactly what shipped.
    const caught = typeof error === "object" && error !== null ? error : {};
    const status = "status" in caught ? caught.status : undefined;

    if (status === 401) {
      window.location.replace("/login.html");
      return;
    }
    if (status === 403) {
      void requireNamespace().recovery?.permissionDenied();
    }

    const message = "message" in caught ? caught.message : undefined;
    setStatus(typeof message === "string" && message ? message : fallbackMessage, true);
  }
})();
