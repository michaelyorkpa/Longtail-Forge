(function attachApiKeysPage() {
  const apiKeyForm = document.querySelector("[data-api-key-form]");
  const apiKeyNameInput = document.querySelector("[data-api-key-name]");
  const apiKeyScopes = document.querySelector("[data-api-key-scopes]");
  const createApiKeyButton = document.querySelector("[data-create-api-key]");
  const apiKeySecretPanel = document.querySelector("[data-api-key-secret-panel]");
  const apiKeySecretInput = document.querySelector("[data-api-key-secret]");
  const copyApiKeyButton = document.querySelector("[data-copy-api-key]");
  const apiKeyStatus = document.querySelector("[data-api-key-status]");
  const apiKeyList = document.querySelector("[data-api-key-list]");

  /** @type {NormalizedApiScope[]} */
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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

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
      throw new Error("API keys requires LongtailForge.errors.");
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
      throw new Error("API keys requires LongtailForge.api.");
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
      throw new Error("API keys requires LongtailForge.modal.");
    }
    return dialogs;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApiKeyCollection} BrowserApiKeyCollection */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApiKeyListEntry} BrowserApiKeyListEntry */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApiKeyRecord} BrowserApiKeyRecord */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApiKeySecret} BrowserApiKeySecret */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApiScope} BrowserApiScope */

  /**
   * One scope as this page renders it, after trimming.
   *
   * **`Omit<BrowserApiScope, "scope">` rather than a new vocabulary.** The published record
   * writes `id` and `scope` as the same value twice, and this page reads only `id`, so the
   * derived row drops the duplicate and keeps every other member under the estate's own names.
   * @typedef {Omit<BrowserApiScope, "scope">} NormalizedApiScope
   */

  /**
   * One owner's scopes, grouped for a fieldset.
   * @typedef {{ id: string, label: string, scopes: NormalizedApiScope[] }} ApiScopeGroup
   */

  /** The seven text columns the list selects beside the two nullable ones and the scopes. */
  const API_KEY_ENTRY_TEXT = Object.freeze([
    "api_key_id",
    "created_at",
    "created_by_user_id",
    "key_prefix",
    "name",
    "status",
    "workspace_id",
  ]);

  /** The six text members `toPublicApiKey` writes beside the two nullable ones and the scopes. */
  const API_KEY_RECORD_TEXT = Object.freeze([
    "api_key_id",
    "created_at",
    "key_prefix",
    "name",
    "status",
    "workspace_id",
  ]);

  /** The two timestamps both records answer as text or `null`. */
  const API_KEY_NULLABLE_TEXT = Object.freeze(["last_used_at", "revoked_at"]);

  /** The six text members the scope catalogue writes by name. */
  const API_SCOPE_TEXT = Object.freeze(["access", "description", "id", "label", "moduleId", "scope"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * @param {unknown} value
   * @returns {value is string}
   */
  function isText(value) {
    return typeof value === "string";
  }

  /**
   * @param {unknown} value
   * @returns {value is string | null}
   */
  function isNullableText(value) {
    return value === null || typeof value === "string";
  }

  /**
   * The shape the list entry and the public record share: scopes and two nullable timestamps.
   * @param {Record<string, unknown>} value
   */
  function hasApiKeyShape(value) {
    return Array.isArray(value.scopes) && value.scopes.every(isText)
      && API_KEY_NULLABLE_TEXT.every((member) => isNullableText(value[member]));
  }

  /**
   * An API key as the workspace list sends it. **Never the hash**: the list selects nine columns
   * by name and `key_hash` is not one of them.
   * @param {unknown} value
   * @returns {value is BrowserApiKeyListEntry}
   */
  function isApiKeyListEntry(value) {
    return isResponseRecord(value)
      && API_KEY_ENTRY_TEXT.every((member) => isText(value[member]))
      && hasApiKeyShape(value);
  }

  /**
   * An API key as `toPublicApiKey` reconstructs it: the list entry without its creator.
   * @param {unknown} value
   * @returns {value is BrowserApiKeyRecord}
   */
  function isApiKeyRecord(value) {
    return isResponseRecord(value)
      && API_KEY_RECORD_TEXT.every((member) => isText(value[member]))
      && hasApiKeyShape(value);
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserApiScope}
   */
  function isApiScope(value) {
    return isResponseRecord(value) && API_SCOPE_TEXT.every((member) => isText(value[member]));
  }

  /**
   * The two members every API key route answers, read totally.
   *
   * An unusable body or a non-list member yields an empty list, exactly as the `|| []` reads
   * did, and an element the browser cannot vouch for is dropped rather than rendered.
   * @param {unknown} body
   * @returns {BrowserApiKeyCollection}
   */
  function readApiKeyCollection(body) {
    const apiKeys = isResponseRecord(body) ? body.apiKeys : null;
    const scopes = isResponseRecord(body) ? body.availableScopes : null;
    return {
      apiKeys: Array.isArray(apiKeys) ? apiKeys.filter(isApiKeyListEntry) : [],
      availableScopes: Array.isArray(scopes) ? scopes.filter(isApiScope) : [],
    };
  }

  /**
   * The one-time secret the create route answers, or `null` when the browser cannot vouch for
   * it. A missing raw key already hid the secret panel, and a `null` here takes that same path.
   * @param {unknown} body
   * @returns {BrowserApiKeySecret | null}
   */
  function readApiKeySecret(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { apiKey, rawKey } = body;
    return isText(rawKey) && rawKey !== "" && isApiKeyRecord(apiKey) ? { apiKey, rawKey } : null;
  }

  async function loadApiKeys() {
    setApiKeyStatus("Loading API keys...");

    try {
      const collection = readApiKeyCollection(await requireApi().getJson("/api/api-keys", { cache: "no-store" }));

      availableScopes = normalizeAvailableScopes(collection.availableScopes);
      renderScopeControls();
      renderApiKeys(collection.apiKeys);
      setApiKeyStatus("");
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setApiKeyStatus(requireErrors().caughtMessage(error, "API keys could not be loaded."), true);
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
      const body = await requireApi().postJson("/api/api-keys", { name, scopes });
      const issued = readApiKeySecret(body);

      apiKeyForm.reset();
      showRawKey(issued?.rawKey || "");
      renderApiKeys(readApiKeyCollection(body).apiKeys);
      setApiKeyStatus(`Created ${issued?.apiKey.name || name}.`);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      setApiKeyStatus(requireErrors().caughtMessage(error, "API key was not created."), true);
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

  /** @param {NormalizedApiScope} scope */
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

  /** @param {NormalizedApiScope[]} scopes @returns {ApiScopeGroup[]} */
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

  /**
   * Order two scopes by access, then label, then id.
   *
   * **The table is read by own key.** Indexing it with a wire string read the prototype too,
   * so a scope whose access named a member of `Object.prototype` answered a *function* - and
   * `?? 10` does not catch one, because a function is not nullish. It would have reached the
   * subtraction and made the comparator answer `NaN`. This is the own-key discipline settled
   * in `0.33.33.40.30`: `Object.hasOwn` for a literal table keyed by a wire value.
   * @param {NormalizedApiScope} left
   * @param {NormalizedApiScope} right
   */
  function compareScopes(left, right) {
    /** @type {Record<string, number>} */
    const accessOrder = { read: 0, write: 1, manage: 2, admin: 3 };
    /** @param {string} access */
    const rank = (access) => (Object.hasOwn(accessOrder, access) ? accessOrder[access] : 10);

    return (rank(left.access) - rank(right.access))
      || String(left.label || left.id).localeCompare(String(right.label || right.id))
      || String(left.id).localeCompare(String(right.id));
  }

  /**
   * The owner label for a module id, or one derived from the id itself.
   *
   * Read by own key for the same reason as `compareScopes`: indexing this literal with a wire
   * string answered `Object.prototype`'s members, so a module id of `toString` returned a
   * function rather than falling through to the derived label.
   * @param {string} moduleId
   */
  function moduleScopeLabel(moduleId) {
    /** @type {Record<string, string>} */
    const ownerLabels = {
      "client-projects": "Clients and Projects",
      "time-tracking": "Time Tracking",
      framework: "Framework",
    };

    return (Object.hasOwn(ownerLabels, moduleId) ? ownerLabels[moduleId] : "") || moduleId
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  /** @param {BrowserApiKeyListEntry[]} apiKeys */
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

  /** @param {BrowserApiKeyListEntry} apiKey */
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

  /** @param {BrowserApiKeyListEntry} apiKey */
  async function revokeApiKey(apiKey) {
    const shouldRevoke = await requireModalDialogs().confirm({
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
      const body = await requireApi().putJson(
        `/api/api-keys/${encodeURIComponent(apiKey.api_key_id)}/revoke`,
        {},
      );

      renderApiKeys(readApiKeyCollection(body).apiKeys);
      setApiKeyStatus(`Revoked ${apiKey.name}.`);
    } catch (error) {
      setApiKeyStatus(requireErrors().caughtMessage(error, "API key was not revoked."), true);
    }
  }

  function readSelectedScopes() {
    return Array.from(apiKeyScopes.querySelectorAll("[data-api-key-scope]:checked"))
      .map((checkbox) => checkbox.value);
  }

  /**
   * Trim the catalogue's scopes into the rows this page renders.
   *
   * **`access` was being dropped here, and two readers depend on it.** The catalogue writes it
   * by name and `isApiScope` proves it is text, but this rebuilt the row without it - so
   * `createScopeOption` saw `undefined`, compared it against `"write"`, and labelled every
   * scope "Read" including the write and manage ones, while `compareScopes` scored them all
   * 10 and never applied its access ordering. Carrying it through is a behaviour change on
   * both surfaces, and a deliberate one: this is pre-existing and is not introduced here.
   *
   * The parameter is `BrowserApiScope[]` because that is what the only caller passes, proved
   * by `isApiScope` before it arrives. The earlier bare-string branch described a caller that
   * does not exist, and the trimming stays because a catalogue entry may still be padded.
   * @param {BrowserApiScope[]} scopes
   * @returns {NormalizedApiScope[]}
   */
  function normalizeAvailableScopes(scopes) {
    return scopes.map((scope) => ({
      access: scope.access.trim(),
      description: scope.description.trim(),
      id: (scope.id || scope.scope).trim(),
      label: (scope.label || scope.id || scope.scope).trim(),
      moduleId: scope.moduleId.trim(),
    })).filter((scope) => scope.id);
  }

  /** @param {string} rawKey */
  function showRawKey(rawKey) {
    apiKeySecretInput.value = rawKey;
    apiKeySecretPanel.hidden = !rawKey;
  }

  /** @param {string} value */
  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "";
    return cell;
  }

  /** @param {string} status */
  function formatStatus(status) {
    return status === "revoked" ? "Revoked" : "Active";
  }

  /** @param {string | null} value */
  function formatDate(value) {
    if (!value) {
      return "";
    }

    return new Date(value).toLocaleString();
  }

  /** @param {string} message @param {boolean} [isError] */
  function setApiKeyStatus(message, isError = false) {
    apiKeyStatus.textContent = message;
    apiKeyStatus.classList.toggle("is-error", isError);
  }
})();
