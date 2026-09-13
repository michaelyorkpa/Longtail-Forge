import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/workspace-settings.js";
const suites = ["tests/unit/workspace-settings-diagnostics-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function normalizeSettings(body) {",
    "  // @ts-expect-error deliberately added\n  function normalizeSettings(body) {"],
  // **Withdrawn, and inert for a real reason.** Adding a second record predicate that nothing
  // calls cannot change what the page does - a dead function is dead. What the break was reaching
  // for is asserted directly instead: the suite pins that the file declares `isCatalogRecord`
  // exactly once and that both normalizers read through it.
  ["a control lookup goes back to a raw query",
    '  const workspaceUsersDialog = findDialog("[data-workspace-users-dialog]");',
    '  const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");'],
  ["the users list lookup goes back to a raw query",
    '  const workspaceUsersList = findElement("[data-workspace-users-list]");',
    '  const workspaceUsersList = document.querySelector("[data-workspace-users-list]");'],
  ["the load-more lookup goes back to a raw query",
    '  const jobObservabilityMoreButton = findButton("[data-job-observability-more]");',
    '  const jobObservabilityMoreButton = document.querySelector("[data-job-observability-more]");'],
  ["the backup button lookup goes back to a raw query",
    '  const createWorkspaceBackupButton = findButton("[data-create-workspace-backup]");',
    '  const createWorkspaceBackupButton = document.querySelector("[data-create-workspace-backup]");'],
  ["a storage credential name is introduced in an annotation",
    "  /** @typedef {import(\"../../src/types/browser-contracts.js\").BrowserRuntimeStorageDiagnostics} BrowserRuntimeStorageDiagnostics */",
    "  /** @typedef {{ provider: string, accessKey: string }} BrowserRuntimeStorageDiagnostics */"],
  ["a job internal name is introduced in an annotation",
    "  /** @param {BrowserJobFailureSummary} item */\n  function createJobFailureRow(item) {",
    "  /** @param {{ dedupeKey: string }} item */\n  function createJobFailureRow(item) {"],

  // --- the settings normalizer ----------------------------------------------------------------------
  ["a body that is not a record is read through anyway",
    "    const settings = isCatalogRecord(body) ? body : {};",
    "    const settings = body;"],
  ["the workspace name stops being trimmed",
    '    const workspaceName = String(settings.workspaceName || "").trim();',
    '    const workspaceName = String(settings.workspaceName || "");'],
  ["the older workspace id spelling stops being read",
    '      workspaceId: String(settings.workspaceId || settings.workspace_id || "").trim(),',
    '      workspaceId: String(settings.workspaceId || "").trim(),'],
  ["the workspace id stops being trimmed",
    '      workspaceId: String(settings.workspaceId || settings.workspace_id || "").trim(),',
    '      workspaceId: String(settings.workspaceId || settings.workspace_id || ""),'],
  ["the older workspace type spelling stops being read",
    "    const workspaceType = normalizeWorkspaceType(settings.workspaceType || settings.workspace_type);",
    "    const workspaceType = normalizeWorkspaceType(settings.workspaceType);"],
  ["the page reads the dead id fallback again instead of the normalizer's answer",
    '      activeWorkspaceId = settings.workspaceId || "";',
    '      activeWorkspaceId = settings.workspace_id || "";'],
  ["a module list that is not a list is carried anyway",
    "      enabledModules: Array.isArray(settings.enabledModules) ? settings.enabledModules : [],",
    "      enabledModules: settings.enabledModules || [],"],
  ["the modules list that is not a list is carried anyway",
    "      modules: Array.isArray(settings.modules) ? settings.modules : [],",
    "      modules: settings.modules || [],"],
  ["the module contributions lose their own settings context",
    "    return requireSettingsRenderer().normalizeContributions(moduleSettings, {\n      modules: settings?.modules,\n    });",
    "    return requireSettingsRenderer().normalizeContributions(moduleSettings, {});"],
  ["an unknown workspace type is accepted",
    '    return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";',
    "    return workspaceType;"],
  ["a known workspace type is refused",
    '    return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";',
    '    return "business";'],
  ["a workspace type stops being trimmed",
    '    const workspaceType = String(value || "").trim();\n    return ["business", "personal", "family"]',
    '    const workspaceType = String(value || "");\n    return ["business", "personal", "family"]'],

  // --- audit settings -------------------------------------------------------------------------------------
  ["an audit branch that is not a record is read through anyway",
    "    const audit = isCatalogRecord(value) ? value : {};",
    "    const audit = value;"],
  ["audit logging is turned off by anything falsy",
    "      loggingEnabled: audit.loggingEnabled === false ? false : true,",
    "      loggingEnabled: Boolean(audit.loggingEnabled),"],
  ["audit logging can never be turned off",
    "      loggingEnabled: audit.loggingEnabled === false ? false : true,",
    "      loggingEnabled: true,"],
  ["a retention period outside the offered set is accepted",
    "      retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,",
    "      retentionDays: retentionDays || 30,"],
  ["the retention allowlist loses an option",
    "    const retentionOptions = [7, 14, 30, 60, 90, 180, 365];",
    "    const retentionOptions = [7, 14, 30, 60, 180, 365];"],
  ["a retention period stops being read as a number",
    '    const retentionDays = Number.parseInt(String(audit.retentionDays ?? ""), 10);',
    "    const retentionDays = audit.retentionDays;"],

  // --- runtime formatting -------------------------------------------------------------------------------------
  ["a byte count stops being scaled",
    "    if (bytes < 1024) return `${bytes} B`;",
    "    return `${bytes} B`;\n    if (bytes < 1024) return `${bytes} B`;"],
  ["a byte count stops being floored at zero",
    "    const bytes = Math.max(0, Number(value) || 0);",
    "    const bytes = Number(value) || 0;"],
  ["a megabyte is reported as a kilobyte",
    "    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;",
    "    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;"],
  ["an unreadable runtime number stops answering zero",
    '    return Number.isFinite(number) ? String(number) : "0";',
    "    return String(number);"],
  ["an absent date is reported as unreadable",
    '    if (!text) {\n      return "Never";\n    }',
    '    if (!text) {\n      return "Unavailable";\n    }'],
  ["an unreadable date is reported as absent",
    '    if (Number.isNaN(date.getTime())) {\n      return "Unavailable";\n    }',
    '    if (Number.isNaN(date.getTime())) {\n      return "Never";\n    }'],
  ["a date stops being trimmed before it is read",
    '    const text = String(value || "").trim();\n\n    if (!text) {\n      return "Never";',
    '    const text = String(value || "");\n\n    if (!text) {\n      return "Never";'],
  ["an empty runtime list stops answering None",
    '    return items.length > 0 ? items.join(", ") : "None";',
    '    return items.join(", ");'],
  ["a runtime list stops dropping its blanks",
    '      ? values.map((value) => String(value || "").trim()).filter(Boolean)',
    '      ? values.map((value) => String(value || "").trim())'],
  ["a value that is not a list is taken as one item",
    "    const items = Array.isArray(values)\n      ? values.map((value) => String(value || \"\").trim()).filter(Boolean)\n      : [];",
    "    const items = Array.isArray(values)\n      ? values.map((value) => String(value || \"\").trim()).filter(Boolean)\n      : [String(values || \"\")].filter(Boolean);"],
  ["the dead-letter queue loses its name",
    '    return normalized === "dead" ? "Dead-letter" : formatRuntimeValue(normalized);',
    "    return formatRuntimeValue(normalized);"],
  ["an empty runtime value stops answering Unavailable",
    '    if (!normalized) {\n      return "Unavailable";\n    }',
    "    if (!normalized) {\n      return normalized;\n    }"],
  ["SQLite loses its casing",
    '    if (normalized.toLowerCase() === "sqlite") {\n      return "SQLite";\n    }',
    '    if (false) {\n      return "SQLite";\n    }'],
  ["WAL loses its casing",
    '    if (normalized.toLowerCase() === "wal") {\n      return "WAL";\n    }',
    '    if (false) {\n      return "WAL";\n    }'],
  ["a runtime value stops being title-cased",
    "    return normalized\n      .split(/[._\\s-]+/)\n      .filter(Boolean)\n      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))\n      .join(\" \");",
    "    return normalized;"],
  ["a redacted location stops being trimmed",
    '    return String(location?.display || "").trim() || "Unavailable";',
    '    return String(location?.display || "") || "Unavailable";'],
  ["an absent location stops answering Unavailable",
    '    return String(location?.display || "").trim() || "Unavailable";',
    '    return String(location?.display || "").trim();'],

  // --- storage and scanner status -------------------------------------------------------------------------------------
  ["an available storage adapter is reported unavailable",
    '    if (status === "ok" || health.available === true) {\n      return "Available";\n    }\n\n    if (status === "unavailable" || health.available === false) {\n      return "Unavailable";\n    }\n\n    return formatRuntimeValue(status);\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */',
    '    if (false) {\n      return "Available";\n    }\n\n    if (status === "unavailable" || health.available === false) {\n      return "Unavailable";\n    }\n\n    return formatRuntimeValue(status);\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */'],
  ["the storage availability flag stops being read",
    '    if (status === "ok" || health.available === true) {\n      return "Available";\n    }\n\n    if (status === "unavailable" || health.available === false) {\n      return "Unavailable";\n    }\n\n    return formatRuntimeValue(status);\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */\n  function formatScannerStatus',
    '    if (status === "ok") {\n      return "Available";\n    }\n\n    if (status === "unavailable" || health.available === false) {\n      return "Unavailable";\n    }\n\n    return formatRuntimeValue(status);\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */\n  function formatScannerStatus'],
  ["an unreadable storage status stops falling through to its own text",
    '    return formatRuntimeValue(status);\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */\n  function formatScannerStatus',
    '    return "Unavailable";\n  }\n\n  /** @param {{ available: boolean | null, status: string }} health */\n  function formatScannerStatus'],
  ["the status stops being read case-insensitively",
    '    const status = String(health.status || "").trim().toLowerCase();\n\n    if (status === "ok" || health.available === true) {',
    '    const status = String(health.status || "").trim();\n\n    if (status === "ok" || health.available === true) {'],
  ["the provider stops being paired with its status",
    "    return status === \"Unavailable\" ? provider : `${provider} (${status})`;",
    "    return provider;"],
  ["an unavailable provider is paired with its status anyway",
    "    return status === \"Unavailable\" ? provider : `${provider} (${status})`;",
    "    return `${provider} (${status})`;"],
  ["a disabled scanner is reported as unavailable",
    '    if (status === "disabled") {\n      return "Disabled";\n    }',
    '    if (false) {\n      return "Disabled";\n    }'],
  ["a pass-through scanner loses its own state",
    '    if (status === "pass_through") {\n      return "Pass-through";\n    }',
    '    if (false) {\n      return "Pass-through";\n    }'],
  ["a disabled scanner is reported as available",
    '    if (status === "disabled") {\n      return "Disabled";\n    }\n\n    if (status === "pass_through") {',
    '    if (status === "disabled") {\n      return "Available";\n    }\n\n    if (status === "pass_through") {'],

  // --- caught values -------------------------------------------------------------------------------------
  ["the expired-session redirect is routed through the namespace",
    '    if (caughtMember(error, "status") === 401) {',
    "    if (requireErrors().caughtStatus(error) === 401) {"],
  ["a 401 stops redirecting to the login page",
    '    if (caughtMember(error, "status") === 401) {\n      window.location.replace("/login.html");\n      return;\n    }',
    "    if (false) {\n      window.location.replace(\"/login.html\");\n      return;\n    }"],
  ["a 401 renders a status message on its way out",
    '      window.location.replace("/login.html");\n      return;',
    '      window.location.replace("/login.html");'],
  ["every failure is treated as an expired session",
    '    if (caughtMember(error, "status") === 401) {',
    "    if (true) {"],
  ["the caught message stops being preferred over the fallback",
    '    requireStatusMessage().set(workspaceSettingsStatus, String(caughtMember(error, "message") || fallbackMessage), { type: "error" });',
    "    requireStatusMessage().set(workspaceSettingsStatus, fallbackMessage, { type: \"error\" });"],
  ["the failure stops being marked as an error",
    '(caughtMember(error, "message") || fallbackMessage), { type: "error" });',
    '(caughtMember(error, "message") || fallbackMessage));'],
  ["a member on a thrown value's prototype stops being found",
    '    return typeof error === "object" && error !== null && member in error',
    '    return typeof error === "object" && error !== null && Object.hasOwn(error, member)'],
  // **Withdrawn, and inert for a real reason.** Reading the member off an optional chain instead
  // of guarding the type first answers the same thing for every value this takes: `null` and
  // `undefined` short-circuit, and a string, a number or a boolean carries neither `status` nor
  // `message` - and those two members are the whole signature, which is what makes it provable.
  // The guard states what is being read and ships unchanged.

  // --- diagnostic items -------------------------------------------------------------------------------------
  ["a blank diagnostic value stops answering Unavailable",
    '    valueElement.textContent = value || "Unavailable";',
    "    valueElement.textContent = value;"],
  ["a diagnostic item loses its label",
    "    labelElement.textContent = label;",
    '    labelElement.textContent = "";'],
  ["no runtime warnings renders nothing instead of saying so",
    '    if (warnings.length === 0) {\n      const message = document.createElement("p");\n      message.className = "runtime-diagnostics-note";\n      message.textContent = "No runtime support warnings.";\n      runtimeDiagnosticsWarnings.appendChild(message);\n      return;\n    }',
    "    if (warnings.length === 0) {\n      return;\n    }"],
  ["a runtime warning is styled as an ordinary note",
    '      message.className = "runtime-diagnostics-warning";\n      message.textContent = warning;',
    '      message.className = "runtime-diagnostics-note";\n      message.textContent = warning;'],
  ["stale warnings survive the next render",
    "    runtimeDiagnosticsWarnings.replaceChildren();\n\n    if (warnings.length === 0) {",
    "    if (warnings.length === 0) {"],
  ["the load-more control is hidden but left enabled",
    "    jobObservabilityMoreButton.hidden = !show;\n    jobObservabilityMoreButton.disabled = !show;",
    "    jobObservabilityMoreButton.hidden = !show;"],
  ["the load-more control is shown when there is nothing more",
    "    jobObservabilityMoreButton.hidden = !show;",
    "    jobObservabilityMoreButton.hidden = false;"],

  // --- the backup summary -------------------------------------------------------------------------------------
  ["an absent backup renders an empty summary instead of saying so",
    '      workspaceBackupSummary.appendChild(createRuntimeDiagnosticItem("Latest Backup", placeholder));',
    ""],
  ["the backup package loses its label fallback",
    '      createRuntimeDiagnosticItem("Package", backup.packageLabel || "Workspace backup"),',
    '      createRuntimeDiagnosticItem("Package", backup.packageLabel),'],
  ["the backup author loses its fallback",
    '      createRuntimeDiagnosticItem("Created By", backup.createdByName || "Workspace administrator"),',
    '      createRuntimeDiagnosticItem("Created By", backup.createdByName),'],
  ["the backup checksum loses its fallback",
    '      createRuntimeDiagnosticItem("SHA-256", String(backup.archiveSha256 || "Unavailable")),',
    '      createRuntimeDiagnosticItem("SHA-256", String(backup.archiveSha256)),'],
  ["the backup object count and size are swapped",
    "createRuntimeDiagnosticItem(\"Files\", `${formatRuntimeNumber(backup.fileObjectCount)} objects (${formatByteCount(backup.fileObjectBytes)})`),",
    "createRuntimeDiagnosticItem(\"Files\", `${formatRuntimeNumber(backup.fileObjectBytes)} objects (${formatByteCount(backup.fileObjectCount)})`),"],
  ["the package is said to hold no key material when it needs one",
    "    renderWorkspaceBackupMessage(backup.secureNotesRecoveryRequired\n      ? \"Secure Notes are encrypted in the package. The master key is not included; keep the separately protected installation key backup for recovery.\"\n      : \"The package contains no Secure Notes key material.\");",
    "    renderWorkspaceBackupMessage(\"The package contains no Secure Notes key material.\");"],
  ["a stale backup summary survives the next render",
    "    workspaceBackupSummary.replaceChildren();\n    if (!backup) {",
    "    if (!backup) {"],
  ["a backup error is styled as an ordinary note",
    '    note.className = type === "error" ? "runtime-diagnostics-warning" : "runtime-diagnostics-note";',
    '    note.className = "runtime-diagnostics-note";'],

  // --- the deletion summary -------------------------------------------------------------------------------------
  ["the delete control is offered while a deletion is already pending",
    "    requireOpenWorkspaceDeletionButton().hidden = true;\n    requireOpenWorkspaceDeletionCancelButton().hidden = false;",
    "    requireOpenWorkspaceDeletionButton().hidden = false;\n    requireOpenWorkspaceDeletionCancelButton().hidden = false;"],
  ["the cancel control is offered when nothing is pending",
    "      requireOpenWorkspaceDeletionButton().hidden = false;\n      requireOpenWorkspaceDeletionCancelButton().hidden = true;",
    "      requireOpenWorkspaceDeletionButton().hidden = false;\n      requireOpenWorkspaceDeletionCancelButton().hidden = false;"],
  ["the delete control is withheld when nothing is pending",
    "      requireOpenWorkspaceDeletionButton().hidden = false;\n      requireOpenWorkspaceDeletionCancelButton().hidden = true;",
    "      requireOpenWorkspaceDeletionButton().hidden = true;\n      requireOpenWorkspaceDeletionCancelButton().hidden = true;"],
  ["the pending-deletion state is read off the wrong member",
    "    const lifecycle = deletion?.lifecycle;",
    "    const lifecycle = deletion?.backup;"],
  ["the requester loses their fallback name",
    '      createRuntimeDiagnosticItem("Requested By", lifecycle.requestedByName || "Workspace administrator"),',
    '      createRuntimeDiagnosticItem("Requested By", lifecycle.requestedByName),'],
  ["an unprotected deletion is reported as backed up",
    '      createRuntimeDiagnosticItem("Backup Protection", lifecycle.backupProtected ? "Current backup recorded" : "No current backup acknowledged"),',
    '      createRuntimeDiagnosticItem("Backup Protection", "Current backup recorded"),'],
  ["the grace period end is reported as the request time",
    '      createRuntimeDiagnosticItem("Grace Period Ends", formatRuntimeDate(lifecycle.purgeAfter)),',
    '      createRuntimeDiagnosticItem("Grace Period Ends", formatRuntimeDate(lifecycle.requestedAt)),'],
  ["the backup window stops being named",
    "        ? `A workspace backup from the last ${deletion.backup.windowHours} hours is available.`",
    "        ? `A workspace backup is available.`"],
  ["the typed acknowledgement stops being announced when no backup is current",
    '        : "No current workspace backup is available. Scheduling deletion requires the displayed typed acknowledgement.");',
    '        : "No current workspace backup is available.");'],
  ["the acknowledgement warning is shown even with a current backup",
    "      renderWorkspaceDeletionMessage(deletion?.backup?.current\n        ? `A workspace backup from the last ${deletion.backup.windowHours} hours is available.`",
    "      renderWorkspaceDeletionMessage(false\n        ? `A workspace backup from the last ${deletion.backup.windowHours} hours is available.`"],
  ["the pending-deletion note is styled as an ordinary note",
    '    renderWorkspaceDeletionMessage("The workspace remains fully operational during the grace period. Cancel before the displayed time to restore its normal lifecycle state.", "warning");',
    '    renderWorkspaceDeletionMessage("The workspace remains fully operational during the grace period. Cancel before the displayed time to restore its normal lifecycle state.");'],
  ["a deletion error is styled as an ordinary note",
    '    note.className = type === "error" || type === "warning" ? "runtime-diagnostics-warning" : "runtime-diagnostics-note";',
    '    note.className = "runtime-diagnostics-note";'],

  // --- the workspace user list -------------------------------------------------------------------------------------
  ["a user with no membership in this workspace is listed",
    "        membership.workspaceId === activeWorkspaceId && membership.status !== \"inactive\",",
    "        membership.status !== \"inactive\","],
  ["an inactive membership is treated as active",
    "        membership.workspaceId === activeWorkspaceId && membership.status !== \"inactive\",",
    "        membership.workspaceId === activeWorkspaceId,"],
  ["every user is listed regardless of membership",
    "    const activeUsers = users.filter((user) =>\n      (user.workspaceMemberships || []).some((membership) =>",
    "    const activeUsers = users.filter((user) =>\n      true || (user.workspaceMemberships || []).some((membership) =>"],
  ["a user carrying no membership list at all is read through anyway",
    "      (user.workspaceMemberships || []).some((membership) =>",
    "      (user.workspaceMemberships).some((membership) =>"],
  ["an empty list renders nothing instead of saying nobody is assigned",
    '      usersList.appendChild(createWorkspaceUsersPlaceholder("No users are assigned to this workspace."));\n      return;',
    "      return;"],
  ["a user loses their display-name preference",
    "      name.textContent = user.displayName || user.username || user.user_id;",
    "      name.textContent = user.username || user.user_id;"],
  ["a user with no name loses their identity entirely",
    "      name.textContent = user.displayName || user.username || user.user_id;",
    "      name.textContent = user.displayName || user.username;"],
  ["the permissions link stops encoding the user id",
    "        window.location.href = `user-admin.html?user=${encodeURIComponent(user.user_id)}`;",
    "        window.location.href = `user-admin.html?user=${user.user_id}`;"],
  ["a stale user list survives the next render",
    "    usersList.replaceChildren();\n\n    if (activeUsers.length === 0) {",
    "    if (activeUsers.length === 0) {"],
  ["the missing users list stops being named",
    '    if (!workspaceUsersList) {\n      throw new Error("Workspace settings requires the workspace users list.");\n    }\n    return workspaceUsersList;',
    "    return /** @type {HTMLElement} */ (workspaceUsersList);"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
