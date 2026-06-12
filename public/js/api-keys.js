const apiKeyForm = document.querySelector("[data-api-key-form]");
const apiKeyNameInput = document.querySelector("[data-api-key-name]");
const apiKeyScopes = document.querySelector("[data-api-key-scopes]");
const createApiKeyButton = document.querySelector("[data-create-api-key]");
const apiKeySecretPanel = document.querySelector("[data-api-key-secret-panel]");
const apiKeySecretInput = document.querySelector("[data-api-key-secret]");
const copyApiKeyButton = document.querySelector("[data-copy-api-key]");
const apiKeyStatus = document.querySelector("[data-api-key-status]");
const apiKeyList = document.querySelector("[data-api-key-list]");

let availableScopes = [];

loadApiKeys();

apiKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createApiKey();
});

copyApiKeyButton.addEventListener("click", async () => {
  if (!apiKeySecretInput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(apiKeySecretInput.value);
  } catch {
    apiKeySecretInput.select();
    document.execCommand("copy");
  }
});

async function loadApiKeys() {
  setApiKeyStatus("Loading API keys...");

  try {
    const body = await window.LongtailForge.api.getJson("/api/api-keys", { cache: "no-store" });

    availableScopes = normalizeAvailableScopes(body.availableScopes || []);
    renderScopeControls();
    renderApiKeys(body.apiKeys || []);
    setApiKeyStatus("");
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setApiKeyStatus(error.message || "API keys could not be loaded.", true);
  }
}

async function createApiKey() {
  const name = apiKeyNameInput.value.trim();
  const scopes = readSelectedScopes();

  if (!name) {
    setApiKeyStatus("Name is required.", true);
    return;
  }

  if (scopes.length === 0) {
    setApiKeyStatus("Choose at least one scope.", true);
    return;
  }

  createApiKeyButton.disabled = true;
  setApiKeyStatus("Creating API key...");

  try {
    const body = await window.LongtailForge.api.postJson("/api/api-keys", { name, scopes });

    apiKeyForm.reset();
    showRawKey(body.rawKey || "");
    renderApiKeys(body.apiKeys || []);
    setApiKeyStatus(`Created ${body.apiKey?.name || name}.`);
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setApiKeyStatus(error.message || "API key was not created.", true);
  } finally {
    createApiKeyButton.disabled = false;
  }
}

function renderScopeControls() {
  apiKeyScopes.replaceChildren();

  groupScopesByOwner(availableScopes).forEach((group) => {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");

    fieldset.className = "settings-fieldset api-scope-group";
    legend.textContent = group.label;
    fieldset.appendChild(legend);
    group.scopes.forEach((scope) => fieldset.appendChild(createScopeOption(scope)));
    apiKeyScopes.appendChild(fieldset);
  });
}

function createScopeOption(scope) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  const labelText = document.createElement("span");
  const accessLabel = scope.access === "write" ? "Write" : "Read";

  label.className = "inline-option";
  checkbox.type = "checkbox";
  checkbox.value = scope.id;
  checkbox.dataset.apiKeyScope = "";
  labelText.textContent = `${scope.label || scope.id} (${accessLabel}, ${scope.id})`;
  if (scope.description) {
    label.title = scope.description;
  }
  label.append(checkbox, labelText);
  return label;
}

function groupScopesByOwner(scopes) {
  const groupsById = scopes.reduce((groups, scope) => {
    const moduleId = scope.moduleId || "framework";

    if (!groups.has(moduleId)) {
      groups.set(moduleId, {
        id: moduleId,
        label: moduleScopeLabel(moduleId),
        scopes: [],
      });
    }

    groups.get(moduleId).scopes.push(scope);
    return groups;
  }, new Map());

  return [...groupsById.values()]
    .map((group) => ({
      ...group,
      scopes: group.scopes.sort(compareScopes),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function compareScopes(left, right) {
  const accessOrder = { read: 0, write: 1, manage: 2, admin: 3 };

  return (accessOrder[left.access] ?? 10) - (accessOrder[right.access] ?? 10)
    || String(left.label || left.id).localeCompare(String(right.label || right.id))
    || String(left.id).localeCompare(String(right.id));
}

function moduleScopeLabel(moduleId) {
  return {
    "client-projects": "Clients and Projects",
    "time-tracking": "Time Tracking",
    framework: "Framework",
  }[moduleId] || moduleId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderApiKeys(apiKeys) {
  apiKeyList.replaceChildren();

  if (apiKeys.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.textContent = "No API keys yet.";
    row.appendChild(cell);
    apiKeyList.appendChild(row);
    return;
  }

  apiKeys.forEach((apiKey) => {
    const row = document.createElement("tr");

    row.append(
      createCell(apiKey.name),
      createCell(apiKey.key_prefix),
      createCell((apiKey.scopes || []).join(", ")),
      createCell(formatStatus(apiKey.status)),
      createCell(formatDate(apiKey.created_at)),
      createCell(formatDate(apiKey.last_used_at)),
      createActionCell(apiKey),
    );
    apiKeyList.appendChild(row);
  });
}

function createActionCell(apiKey) {
  const cell = document.createElement("td");

  if (apiKey.status === "revoked") {
    cell.textContent = "";
    return cell;
  }

  const button = document.createElement("button");

  button.type = "button";
  button.textContent = "Revoke";
  button.className = "danger-button";
  button.addEventListener("click", () => revokeApiKey(apiKey));
  cell.appendChild(button);
  return cell;
}

async function revokeApiKey(apiKey) {
  const shouldRevoke = await window.LongtailForge.modal.confirm({
    title: "Revoke API key?",
    message: `Revoke ${apiKey.name}? Integrations using this key will stop working.`,
    confirmLabel: "Revoke",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!shouldRevoke) {
    return;
  }

  setApiKeyStatus("Revoking API key...");

  try {
    const body = await window.LongtailForge.api.putJson(
      `/api/api-keys/${encodeURIComponent(apiKey.api_key_id)}/revoke`,
      {},
    );

    renderApiKeys(body.apiKeys || []);
    setApiKeyStatus(`Revoked ${apiKey.name}.`);
  } catch (error) {
    setApiKeyStatus(error.message || "API key was not revoked.", true);
  }
}

function readSelectedScopes() {
  return Array.from(apiKeyScopes.querySelectorAll("[data-api-key-scope]:checked"))
    .map((checkbox) => checkbox.value);
}

function normalizeAvailableScopes(scopes) {
  return scopes.map((scope) => {
    if (typeof scope === "string") {
      return {
        id: scope,
        label: scope,
        description: "",
      };
    }

    return {
      id: String(scope.id || scope.scope || "").trim(),
      label: String(scope.label || scope.id || scope.scope || "").trim(),
      description: String(scope.description || "").trim(),
      moduleId: String(scope.moduleId || "").trim(),
    };
  }).filter((scope) => scope.id);
}

function showRawKey(rawKey) {
  apiKeySecretInput.value = rawKey;
  apiKeySecretPanel.hidden = !rawKey;
}

function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  return cell;
}

function formatStatus(status) {
  return status === "revoked" ? "Revoked" : "Active";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
}

function setApiKeyStatus(message, isError = false) {
  apiKeyStatus.textContent = message;
  apiKeyStatus.classList.toggle("is-error", isError);
}
