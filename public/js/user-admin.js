const userAdminForm = document.querySelector("[data-user-admin-form]");
const newUserUsernameInput = document.querySelector("[data-new-user-username]");
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
const cancelEditUserButton = document.querySelector("[data-cancel-edit-user]");
const resetEditUserPasswordButton = document.querySelector("[data-reset-edit-user-password]");
const saveEditUserButton = document.querySelector("[data-save-edit-user]");

let users = [];

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

resetEditUserPasswordButton.addEventListener("click", async () => {
  const user = getEditingUser();

  if (user) {
    await resetUserPassword(user);
  }
});

async function loadUsers() {
  setUserAdminStatus("Loading users...");

  try {
    const response = await fetch("/api/users", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "Users could not be loaded.");
    }

    renderUsers(body.users || []);
    setUserAdminStatus("");
  } catch (error) {
    setUserAdminStatus(error.message || "Users could not be loaded.", true);
  }
}

async function createUser() {
  const username = newUserUsernameInput.value.trim();

  if (!username) {
    setUserAdminStatus("Username is required.", true);
    return;
  }

  createUserButton.disabled = true;
  setUserAdminStatus("Creating user...");

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
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

function renderUsers(nextUsers) {
  users = Array.isArray(nextUsers) ? nextUsers : [];
  renderUserRows(users);
}

function renderUserRows(users) {
  userList.replaceChildren();

  if (users.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 3;
    cell.textContent = "No users yet.";
    row.appendChild(cell);
    userList.appendChild(row);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");

    row.append(
      createTableCell(formatUsername(user)),
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

function openEditUserDialog(user) {
  editUserIdInput.value = user.user_id;
  editUserUsernameInput.value = user.username;
  editUserDialog.showModal();
  editUserUsernameInput.focus();
}

function closeEditUserDialog() {
  if (editUserDialog.open) {
    editUserDialog.close();
  }

  editUserForm.reset();
}

function getEditingUser() {
  return users.find((user) => user.user_id === editUserIdInput.value);
}

async function saveEditedUser() {
  const user = getEditingUser();
  const username = editUserUsernameInput.value.trim();

  if (!user || !username) {
    setUserAdminStatus("Username is required.", true);
    return;
  }

  saveEditUserButton.disabled = true;
  setUserAdminStatus("Saving user...");

  try {
    const response = await fetch(`/api/users/${encodeURIComponent(user.user_id)}/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "User was not saved.");
    }

    closeEditUserDialog();
    renderUsers(body.users || []);
    setUserAdminStatus(`Saved ${body.user?.username || username}.`);
  } catch (error) {
    setUserAdminStatus(error.message || "User was not saved.", true);
  } finally {
    saveEditUserButton.disabled = false;
  }
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
  const shouldDelete = window.confirm(
    `Delete ${user.username}? This keeps existing time entry history but removes the user account. This cannot be undone.`,
  );

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
    const response = await fetch(url, { method });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "User change was not saved.");
    }

    onSuccess(body);
    renderUsers(body.users || []);
    setUserAdminStatus(successMessage);
  } catch (error) {
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

function setUserAdminStatus(message, isError = false) {
  userAdminStatus.textContent = message;
  userAdminStatus.classList.toggle("is-error", isError);
}
