const filesSettingsForm = document.querySelector("[data-files-settings-form]");
const policyModeSelect = document.querySelector("[data-file-policy-mode]");
const allowedExtensionsInput = document.querySelector("[data-allowed-extensions]");
const blockedExtensionsInput = document.querySelector("[data-blocked-extensions]");
const internalStorageLimitInput = document.querySelector("[data-internal-storage-limit]");
const perUserStorageLimitInput = document.querySelector("[data-per-user-storage-limit]");
const storageAccountingContainer = document.querySelector("[data-storage-accounting]");
const filesSettingsStatus = document.querySelector("[data-files-settings-status]");
const saveFilesSettingsButton = document.querySelector("[data-save-files-settings]");
const api = window.LongtailForge.api;

filesSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveFilesSettings();
});

loadFilesSettings();

async function loadFilesSettings() {
  setStatus("Loading Files settings...");

  try {
    const result = await api.getJson("/api/files/settings", { cache: "no-store" });
    renderSettings(result.settings || {});
    renderAccounting(result.accounting || {});
    setStatus("");
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    setStatus(error.message || "Files settings could not be loaded.", true);
  }
}

async function saveFilesSettings() {
  const payload = readSettingsPayload();

  setStatus("Saving Files settings...");
  saveFilesSettingsButton.disabled = true;

  try {
    const result = await api.putJson("/api/files/settings", payload);
    renderSettings(result.settings || {});
    renderAccounting(result.accounting || {});
    setStatus("Files settings saved.");
  } catch (error) {
    setStatus(error.message || "Files settings were not saved.", true);
  } finally {
    saveFilesSettingsButton.disabled = false;
  }
}

function renderSettings(settings) {
  policyModeSelect.value = settings.fileTypePolicyMode || "safe_default";
  allowedExtensionsInput.value = formatExtensions(settings.allowedExtensions || []);
  blockedExtensionsInput.value = formatExtensions(settings.blockedExtensions || []);
  internalStorageLimitInput.value = settings.internalStorageLimitBytes ?? "";
  perUserStorageLimitInput.value = settings.perUserStorageLimitBytes ?? "";
}

function renderAccounting(accounting) {
  const totals = accounting.totals || {};
  const items = [
    ["Internal files", totals.internalFileCount || 0],
    ["Internal storage", formatBytes(totals.internalBytes || 0)],
    ["External files", totals.externalFileCount || 0],
    ["External reported", formatBytes(totals.externalReportedBytes || 0)],
  ];

  storageAccountingContainer.replaceChildren(...items.map(([label, value]) => {
    const card = document.createElement("div");
    const heading = document.createElement("span");
    const strong = document.createElement("strong");

    card.className = "settings-summary-item";
    heading.textContent = label;
    strong.textContent = String(value);
    card.append(heading, strong);
    return card;
  }));
}

function readSettingsPayload() {
  return {
    allowedExtensions: parseExtensions(allowedExtensionsInput.value),
    blockedExtensions: parseExtensions(blockedExtensionsInput.value),
    fileTypePolicyMode: policyModeSelect.value || "safe_default",
    internalStorageLimitBytes: nullableInteger(internalStorageLimitInput.value),
    perUserStorageLimitBytes: nullableInteger(perUserStorageLimitInput.value),
  };
}

function parseExtensions(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.startsWith(".") ? item : `.${item}`);
}

function formatExtensions(extensions) {
  return [...extensions].sort().join(", ");
}

function nullableInteger(value) {
  if (value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatBytes(value) {
  const bytes = Number(value || 0);

  if (!bytes) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStatus(message, isError = false) {
  filesSettingsStatus.textContent = message;
  filesSettingsStatus.classList.toggle("error-text", isError);
}
