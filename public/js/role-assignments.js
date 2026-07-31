const lookupForm = document.querySelector("[data-role-account-lookup]");
const accountEmailInput = document.querySelector("[data-role-account-email]");
const findAccountButton = document.querySelector("[data-find-role-account]");
const statusElement = document.querySelector("[data-role-assignment-status]");
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

async function loadRoleOptions() {
  setBusy(true);
  setStatus("Loading available roles...");

  try {
    const body = await window.LongtailForge.api.getJson("/api/roles", { cache: "no-store" });
    roleOptions = Array.isArray(body.roles) ? body.roles : [];
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
    const body = await window.LongtailForge.api.postJson("/api/role-assignments/lookup", {
      username,
    });

    if (!body.match) {
      setStatus("No active workspace member matched that email.");
      accountEmailInput.focus();
      return;
    }

    target = normalizeTarget(body.match);
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

  const confirmed = await window.LongtailForge.modal.confirm({
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

  const confirmed = await window.LongtailForge.modal.confirm({
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
    const body = await window.LongtailForge.api.putJson(
      `/api/users/${encodeURIComponent(target.userId)}/role-assignments`,
      {
        assignmentRevision: target.assignmentRevision,
        assignments,
      },
    );
    target.assignments = Array.isArray(body.assignments) ? body.assignments : [];
    target.assignmentRevision = String(body.assignmentRevision || "");
    renderTarget();
    setStatus(successMessage);
    return true;
  } catch (error) {
    if (error.status === 409) {
      target.assignmentRevision = "";
      renderTarget();
      setStatus("Assignments changed. Find the account again before making another change.", true);
      findAccountButton.focus();
      return false;
    }
    if (error.status === 401) {
      window.location.replace("/login.html");
      return false;
    }
    setStatus(error.message || "Role assignments could not be updated.", true);
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
  window.LongtailForge.status.set(statusElement, message, {
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
