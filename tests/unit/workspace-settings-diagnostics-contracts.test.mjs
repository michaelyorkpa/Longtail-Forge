import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/workspace-settings.js");

const LIFTED = [
  "isCatalogRecord", "normalizeSettings", "normalizeAuditSettings", "normalizeWorkspaceType",
  "normalizeModuleSettings",
  "formatByteCount", "formatRuntimeValue", "formatRuntimeNumber", "formatRuntimeDate",
  "formatRuntimeList", "formatJobStatus", "formatRuntimeLocation",
  "formatStorageProvider", "formatStorageStatus", "formatScannerStatus",
  "caughtMember", "handleApiError",
  "createRuntimeDiagnosticItem", "createWorkspaceUsersPlaceholder",
  "renderRuntimeDiagnosticWarnings", "updateJobObservabilityMoreButton",
  "requireWorkspaceUsersList", "renderWorkspaceUsers",
  "renderWorkspaceBackupSummary", "renderWorkspaceBackupMessage",
  "renderWorkspaceDeletionSummary", "renderWorkspaceDeletionMessage",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {string} [options.activeWorkspaceId]
 * @param {boolean} [options.withoutUsersList]
 */
function settingsCase(options = {}) {
  const document = new FakeDocument();

  /** @type {{ target: unknown, message: unknown, config: unknown }[]} */
  const statusCalls = [];
  /** @type {string[]} */
  const replacedLocations = [];
  /** @type {Record<string, unknown>[]} */
  const normalizeContributionCalls = [];

  const workspaceUsersList = options.withoutUsersList ? null : document.createElement("div");
  const jobObservabilityMoreButton = document.createElement("button");
  const workspaceBackupSummary = document.createElement("div");
  const workspaceBackupStatus = document.createElement("div");
  const workspaceDeletionSummary = document.createElement("div");
  const workspaceDeletionStatus = document.createElement("div");
  const runtimeDiagnosticsWarnings = document.createElement("div");
  const workspaceSettingsStatus = document.createElement("p");
  const openWorkspaceDeletionButton = document.createElement("button");
  const openWorkspaceDeletionCancelButton = document.createElement("button");

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: { location: { replace: (/** @type {string} */ href) => replacedLocations.push(href) } },
    activeWorkspaceId: options.activeWorkspaceId ?? "",
    workspaceUsersList,
    jobObservabilityMoreButton,
    workspaceBackupSummary,
    workspaceBackupStatus,
    workspaceDeletionSummary,
    workspaceDeletionStatus,
    runtimeDiagnosticsWarnings,
    workspaceSettingsStatus,
    workspaceDeletionState: null,
    requireOpenWorkspaceDeletionButton: () => openWorkspaceDeletionButton,
    requireOpenWorkspaceDeletionCancelButton: () => openWorkspaceDeletionCancelButton,
    requireStatusMessage: () => ({
      /** @param {unknown} target @param {unknown} message @param {unknown} config */
      set: (target, message, config) => statusCalls.push({ target, message, config }),
    }),
    requireSettingsRenderer: () => ({
      /** @param {unknown} contributions @param {Record<string, unknown>} config */
      normalizeContributions: (contributions, config) => {
        normalizeContributionCalls.push({ contributions, config });
        return ["normalized"];
      },
    }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);

  /** @param {import("../../scripts/test-support/fake-dom.mjs").FakeElement} root */
  const itemText = (root) => root.children.map((item) => item.children.map((part) => part.textContent).join(": "));

  /** The users list, for the cases that were given one. */
  const requireUsersList = () => {
    if (!workspaceUsersList) throw new Error("this case was built without a users list");
    return workspaceUsersList;
  };

  return {
    api, sandbox, document, itemText, requireUsersList,
    statusCalls, replacedLocations, normalizeContributionCalls,
    workspaceUsersList, jobObservabilityMoreButton, workspaceBackupSummary, workspaceBackupStatus,
    workspaceDeletionSummary, workspaceDeletionStatus, runtimeDiagnosticsWarnings,
    openWorkspaceDeletionButton, openWorkspaceDeletionCancelButton,
  };
}

describe("Workspace settings normalization", () => {
  it("answers one canonical shape whatever the response omitted", () => {
    const { api } = settingsCase();
    assert.deepEqual(plain(api.normalizeSettings({})), {
      workspaceId: "",
      workspaceName: "",
      workspaceType: "business",
      enabledModules: [],
      moduleSettings: ["normalized"],
      modules: [],
      audit: { loggingEnabled: true, retentionDays: 30 },
    });
  });

  /**
   * **The body is read as a record.** A body that is not one answers the same canonical shape it
   * always did, because every member was read through `?.` and fell back.
   */
  it("answers the same shape for a body that is not a record", () => {
    const { api } = settingsCase();
    for (const body of [null, undefined, "settings", 7, ["settings"]]) {
      assert.equal(api.normalizeSettings(body).workspaceType, "business");
      assert.equal(api.normalizeSettings(body).workspaceId, "");
    }
  });

  it("trims the workspace name", () => {
    const { api } = settingsCase();
    assert.equal(api.normalizeSettings({ workspaceName: "  Acme  " }).workspaceName, "Acme");
  });

  it("reads either workspace id spelling and trims it", () => {
    const { api } = settingsCase();
    assert.equal(api.normalizeSettings({ workspaceId: "  ws-1  " }).workspaceId, "ws-1");
    assert.equal(api.normalizeSettings({ workspace_id: "ws-2" }).workspaceId, "ws-2");
    assert.equal(api.normalizeSettings({ workspaceId: "", workspace_id: "ws-3" }).workspaceId, "ws-3");
  });

  /**
   * The page's own read of `activeWorkspaceId` no longer repeats this fallback: the normalizer is
   * the only place both spellings are consulted, and it answers one member.
   */
  it("is the only place both id spellings are read", () => {
    assert.match(source, /workspaceId: String\(settings\.workspaceId \|\| settings\.workspace_id \|\| ""\)\.trim\(\)/);
    assert.match(source, /activeWorkspaceId = settings\.workspaceId \|\| "";/);
    assert.equal(source.includes("settings.workspaceId || settings.workspace_id || \"\";"), false);
  });

  it("reads either workspace type spelling and refuses an unknown one", () => {
    const { api } = settingsCase();
    assert.equal(api.normalizeSettings({ workspaceType: "personal" }).workspaceType, "personal");
    assert.equal(api.normalizeSettings({ workspace_type: "family" }).workspaceType, "family");
    assert.equal(api.normalizeSettings({ workspaceType: "invented" }).workspaceType, "business");
    assert.equal(api.normalizeWorkspaceType("  personal  "), "personal");
    assert.equal(api.normalizeWorkspaceType(0), "business");
  });

  it("keeps a module list only when it is one", () => {
    const { api } = settingsCase();
    assert.deepEqual(plain(api.normalizeSettings({ enabledModules: ["notes"], modules: ["a"] }).enabledModules), ["notes"]);
    assert.deepEqual(plain(api.normalizeSettings({ enabledModules: "notes" }).enabledModules), []);
    assert.deepEqual(plain(api.normalizeSettings({ modules: "a" }).modules), []);
  });

  it("hands the module contributions their own settings for context", () => {
    const testCase = settingsCase();
    testCase.api.normalizeSettings({ moduleSettings: { notes: {} }, modules: ["notes"] });
    assert.deepEqual(plain(testCase.normalizeContributionCalls.at(-1)?.config), { modules: ["notes"] });
  });
});

describe("Workspace settings audit normalization", () => {
  it("keeps logging on unless it was explicitly turned off", () => {
    const { api } = settingsCase();
    assert.equal(api.normalizeAuditSettings({ loggingEnabled: false }).loggingEnabled, false);
    assert.equal(api.normalizeAuditSettings({ loggingEnabled: true }).loggingEnabled, true);
    assert.equal(api.normalizeAuditSettings({}).loggingEnabled, true);
    assert.equal(api.normalizeAuditSettings(undefined).loggingEnabled, true);
    assert.equal(api.normalizeAuditSettings({ loggingEnabled: 0 }).loggingEnabled, true,
      "only an explicit false turns it off");
  });

  /** The retention allowlist is the contract; anything outside it falls to the default. */
  it("accepts only an offered retention period", () => {
    const { api } = settingsCase();
    for (const days of [7, 14, 30, 60, 90, 180, 365]) {
      assert.equal(api.normalizeAuditSettings({ retentionDays: days }).retentionDays, days);
    }
    for (const days of [1, 31, 400, -30, "abc", null, undefined, {}]) {
      assert.equal(api.normalizeAuditSettings({ retentionDays: days }).retentionDays, 30, String(days));
    }
  });

  it("reads a numeric string retention period", () => {
    const { api } = settingsCase();
    assert.equal(api.normalizeAuditSettings({ retentionDays: "90" }).retentionDays, 90);
  });

  it("reads an audit branch that is not a record as an absent one", () => {
    const { api } = settingsCase();
    assert.deepEqual(plain(api.normalizeAuditSettings("audit")), { loggingEnabled: true, retentionDays: 30 });
    assert.deepEqual(plain(api.normalizeAuditSettings(["audit"])), { loggingEnabled: true, retentionDays: 30 });
  });
});

describe("Workspace settings runtime formatting", () => {
  it("titles a runtime value and names its two special cases", () => {
    const { api } = settingsCase();
    assert.equal(api.formatRuntimeValue("sqlite"), "SQLite");
    assert.equal(api.formatRuntimeValue("wal"), "WAL", "which title-casing alone would answer as Wal");
    assert.equal(api.formatRuntimeValue("SQLITE"), "SQLite");
    assert.equal(api.formatRuntimeValue("pass_through"), "Pass Through");
    assert.equal(api.formatRuntimeValue("in-process worker"), "In Process Worker");
    assert.equal(api.formatRuntimeValue(""), "Unavailable");
    assert.equal(api.formatRuntimeValue(null), "Unavailable");
  });

  it("scales a byte count and floors it at zero", () => {
    const { api } = settingsCase();
    assert.equal(api.formatByteCount(512), "512 B");
    assert.equal(api.formatByteCount(2048), "2.0 KB");
    assert.equal(api.formatByteCount(5 * 1024 * 1024), "5.0 MB");
    assert.equal(api.formatByteCount(3 * 1024 * 1024 * 1024), "3.0 GB");
    assert.equal(api.formatByteCount(-1), "0 B");
    assert.equal(api.formatByteCount("nope"), "0 B");
  });

  it("answers zero for a runtime number it cannot read", () => {
    const { api } = settingsCase();
    assert.equal(api.formatRuntimeNumber(12), "12");
    assert.equal(api.formatRuntimeNumber("12"), "12");
    assert.equal(api.formatRuntimeNumber("nope"), "0");
    assert.equal(api.formatRuntimeNumber(undefined), "0");
  });

  /** Never and Unavailable are different answers: one is "no date", the other "not a date". */
  it("distinguishes an absent date from an unreadable one", () => {
    const { api } = settingsCase();
    assert.equal(api.formatRuntimeDate(""), "Never");
    assert.equal(api.formatRuntimeDate(null), "Never");
    assert.equal(api.formatRuntimeDate("   "), "Never");
    assert.equal(api.formatRuntimeDate("not-a-date"), "Unavailable");
    assert.match(api.formatRuntimeDate("2026-09-13T12:00:00.000Z"), /2026/);
  });

  it("joins a runtime list and answers None for an empty one", () => {
    const { api } = settingsCase();
    assert.equal(api.formatRuntimeList(["  a  ", "", "b"]), "a, b");
    assert.equal(api.formatRuntimeList([]), "None");
    assert.equal(api.formatRuntimeList("a"), "None", "a value that is not a list carries no items");
  });

  it("names the dead-letter queue and titles every other job status", () => {
    const { api } = settingsCase();
    assert.equal(api.formatJobStatus("dead"), "Dead-letter");
    assert.equal(api.formatJobStatus("pending"), "Pending");
    assert.equal(api.formatJobStatus(""), "Unavailable");
  });

  it("shows a redacted location and answers Unavailable without one", () => {
    const { api } = settingsCase();
    assert.equal(api.formatRuntimeLocation({ display: "  /data/app  " }), "/data/app");
    assert.equal(api.formatRuntimeLocation({ display: "" }), "Unavailable");
    assert.equal(api.formatRuntimeLocation(null), "Unavailable");
  });
});

describe("Workspace settings storage and scanner status", () => {
  /** `ok` or an explicit `available` both mean available; the two are checked in that order. */
  it("reads availability from the status or the flag", () => {
    const { api } = settingsCase();
    assert.equal(api.formatStorageStatus({ status: "ok", available: false }), "Available");
    assert.equal(api.formatStorageStatus({ status: "", available: true }), "Available");
    assert.equal(api.formatStorageStatus({ status: "unavailable", available: true }), "Available",
      "an ok-or-available read reaches Available before the unavailable branch");
    assert.equal(api.formatStorageStatus({ status: "unavailable", available: false }), "Unavailable");
    assert.equal(api.formatStorageStatus({ status: "", available: false }), "Unavailable");
  });

  it("falls through to the raw status when neither is decisive", () => {
    const { api } = settingsCase();
    assert.equal(api.formatStorageStatus({ status: "degraded", available: null }), "Degraded");
    assert.equal(api.formatStorageStatus({ status: "", available: null }), "Unavailable");
  });

  it("pairs the provider with its status, and omits an unavailable one", () => {
    const { api } = settingsCase();
    assert.equal(api.formatStorageProvider({ provider: "local", health: { status: "ok", available: true } }), "Local (Available)");
    assert.equal(api.formatStorageProvider({ provider: "local", health: { status: "", available: false } }), "Local");
  });

  /** The scanner reports two states storage does not, and they are named before availability. */
  it("names the scanner's own disabled and pass-through states first", () => {
    const { api } = settingsCase();
    assert.equal(api.formatScannerStatus({ status: "disabled", available: true }), "Disabled");
    assert.equal(api.formatScannerStatus({ status: "pass_through", available: true }), "Pass-through");
    assert.equal(api.formatScannerStatus({ status: "ok", available: null }), "Available");
    assert.equal(api.formatScannerStatus({ status: "unavailable", available: null }), "Unavailable");
    assert.equal(api.formatScannerStatus({ status: "", available: null }), "Unavailable");
  });

  it("reads the status case- and space-insensitively", () => {
    const { api } = settingsCase();
    assert.equal(api.formatScannerStatus({ status: "  DISABLED  ", available: null }), "Disabled");
    assert.equal(api.formatStorageStatus({ status: "  OK  ", available: null }), "Available");
  });
});

describe("Workspace settings caught-value reads", () => {
  /**
   * **The expired-session redirect reads the caught value without acquiring the namespace.**
   * Every other handler on this page uses the shared `requireErrors()` reader; this one does not,
   * so the recovery path cannot be taken out by a load ordering that leaves a member missing.
   */
  it("redirects to login on a 401 without reaching for the namespace", () => {
    const testCase = settingsCase();
    testCase.api.handleApiError({ status: 401, message: "nope" }, "fallback");
    assert.deepEqual(testCase.replacedLocations, ["/login.html"]);
    assert.equal(testCase.statusCalls.length, 0, "and it renders no status message on the way out");
    assert.equal(source.includes("requireErrors().caughtStatus(error) === 401"), false);
  });

  it("renders the caught message for every other failure", () => {
    const testCase = settingsCase();
    testCase.api.handleApiError({ status: 500, message: "Server said no" }, "fallback");
    assert.deepEqual(testCase.replacedLocations, []);
    assert.equal(testCase.statusCalls[0].message, "Server said no");
    assert.deepEqual(plain(testCase.statusCalls[0].config), { type: "error" });
  });

  it("falls back when the caught value carries no message", () => {
    const testCase = settingsCase();
    testCase.api.handleApiError(new Error(""), "Workspace settings could not be loaded.");
    assert.equal(testCase.statusCalls[0].message, "Workspace settings could not be loaded.");
    testCase.api.handleApiError("a string", "fallback");
    assert.equal(testCase.statusCalls[1].message, "fallback");
  });

  /**
   * **`in` rather than `Object.hasOwn`**, because a thrown value may carry the member on its
   * prototype - which is the rule `0.33.33.40.20` settled for caught values. A real `Error`
   * carries `message` exactly that way.
   */
  it("reads a member a thrown value carries on its prototype", () => {
    const { api } = settingsCase();
    class ApiError extends Error {
      get status() {
        return 403;
      }
    }
    const thrown = new ApiError("boom");
    assert.equal(Object.hasOwn(thrown, "status"), false, "the getter lives on the prototype, not the instance");
    assert.equal(api.caughtMember(thrown, "status"), 403, "and an own-property read would miss it");
    assert.equal(api.caughtMember(new Error("boom"), "message"), "boom");
    assert.equal(api.caughtMember(null, "status"), undefined);
    assert.equal(api.caughtMember("string", "status"), undefined);
    assert.equal(api.caughtMember({ status: 403 }, "status"), 403);
  });
});

describe("Workspace settings diagnostic items", () => {
  it("labels an item and answers Unavailable for a blank value", () => {
    const { api } = settingsCase();
    const item = api.createRuntimeDiagnosticItem("Database Provider", "SQLite");
    assert.deepEqual(item.children.map((/** @type {{textContent: string}} */ part) => part.textContent), ["Database Provider", "SQLite"]);
    assert.equal(api.createRuntimeDiagnosticItem("Database File", "").children[1].textContent, "Unavailable");
  });

  it("says so when there are no runtime warnings, and lists them when there are", () => {
    const testCase = settingsCase();
    testCase.api.renderRuntimeDiagnosticWarnings([]);
    assert.deepEqual(testCase.runtimeDiagnosticsWarnings.children.map((/** @type {{textContent: string}} */ n) => n.textContent), ["No runtime support warnings."]);
    assert.equal(testCase.runtimeDiagnosticsWarnings.children[0].className, "runtime-diagnostics-note");

    testCase.api.renderRuntimeDiagnosticWarnings(["One", "Two"]);
    assert.deepEqual(testCase.runtimeDiagnosticsWarnings.children.map((/** @type {{textContent: string}} */ n) => n.textContent), ["One", "Two"]);
    assert.equal(testCase.runtimeDiagnosticsWarnings.children[0].className, "runtime-diagnostics-warning");
  });

  it("hides and disables the load-more control together", () => {
    const testCase = settingsCase();
    testCase.api.updateJobObservabilityMoreButton(false);
    assert.deepEqual([testCase.jobObservabilityMoreButton.hidden, testCase.jobObservabilityMoreButton.disabled], [true, true]);
    testCase.api.updateJobObservabilityMoreButton(true);
    assert.deepEqual([testCase.jobObservabilityMoreButton.hidden, testCase.jobObservabilityMoreButton.disabled], [false, false]);
  });
});

describe("Workspace settings backup summary", () => {
  const backup = {
    packageLabel: "workspace-2026-09-13",
    createdAt: "2026-09-13T12:00:00.000Z",
    createdByName: "Ada",
    fileObjectCount: 12,
    fileObjectBytes: 2048,
    archiveSha256: "abc123",
    secureNotesRecoveryRequired: false,
  };

  it("reports the package, its author, its objects and its checksum", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceBackupSummary(backup);
    const rendered = testCase.itemText(testCase.workspaceBackupSummary);
    assert.equal(rendered[0], "Package: workspace-2026-09-13");
    assert.equal(rendered[2], "Created By: Ada");
    assert.equal(rendered[3], "Files: 12 objects (2.0 KB)");
    assert.equal(rendered[4], "SHA-256: abc123");
  });

  /**
   * **The checksum is read through `String(... || "Unavailable")`, and the fallback runs first.**
   * An omitted member is what separates that from a bare `String(...)`, which would coerce it to
   * the text "undefined" and show that as the checksum; an empty string reaches the diagnostic
   * item's own fallback either way.
   */
  it("names the package, its author and its checksum when the receipt omits them", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceBackupSummary({
      createdAt: backup.createdAt,
      fileObjectCount: backup.fileObjectCount,
      fileObjectBytes: backup.fileObjectBytes,
      secureNotesRecoveryRequired: backup.secureNotesRecoveryRequired,
    });
    const rendered = testCase.itemText(testCase.workspaceBackupSummary);
    assert.equal(rendered[0], "Package: Workspace backup");
    assert.equal(rendered[2], "Created By: Workspace administrator");
    assert.equal(rendered[4], "SHA-256: Unavailable");
  });

  it("replaces the previous summary rather than appending to it", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceBackupSummary(backup);
    testCase.api.renderWorkspaceBackupSummary(null);
    assert.deepEqual(testCase.itemText(testCase.workspaceBackupSummary), ["Latest Backup: No workspace backup has been created yet."]);
  });

  it("says a backup has never been taken rather than showing an empty one", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceBackupSummary(null);
    assert.deepEqual(testCase.itemText(testCase.workspaceBackupSummary), ["Latest Backup: No workspace backup has been created yet."]);
  });

  /** The key is never in the package, and the summary says which of the two cases applies. */
  it("says whether the package needs the separately protected key", () => {
    const needsKey = settingsCase();
    needsKey.api.renderWorkspaceBackupSummary({ ...backup, secureNotesRecoveryRequired: true });
    assert.match(needsKey.workspaceBackupStatus.children[0].textContent, /not included; keep the separately protected/);

    const noKey = settingsCase();
    noKey.api.renderWorkspaceBackupSummary(backup);
    assert.match(noKey.workspaceBackupStatus.children[0].textContent, /contains no Secure Notes key material/);
  });

  it("marks an error message and clears the note when there is none", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceBackupMessage("Failed.", "error");
    assert.equal(testCase.workspaceBackupStatus.children[0].className, "runtime-diagnostics-warning");
    testCase.api.renderWorkspaceBackupMessage("Done.", "success");
    assert.equal(testCase.workspaceBackupStatus.children[0].className, "runtime-diagnostics-note");
    testCase.api.renderWorkspaceBackupMessage("");
    assert.equal(testCase.workspaceBackupStatus.children.length, 0);
  });
});

describe("Workspace settings deletion summary", () => {
  const pending = {
    workspaceName: "Acme",
    lifecycle: {
      requestedAt: "2026-09-13T12:00:00.000Z",
      requestedByName: "Ada",
      purgeAfter: "2026-10-13T12:00:00.000Z",
      backupProtected: true,
    },
  };

  /** Exactly one of the two destructive controls shows, and which one is the whole point. */
  it("offers deletion when nothing is pending and cancellation when something is", () => {
    const idle = settingsCase();
    idle.api.renderWorkspaceDeletionSummary({ workspaceName: "Acme", backup: { current: true, windowHours: 24 } });
    assert.deepEqual([idle.openWorkspaceDeletionButton.hidden, idle.openWorkspaceDeletionCancelButton.hidden], [false, true]);

    const scheduled = settingsCase();
    scheduled.api.renderWorkspaceDeletionSummary(pending);
    assert.deepEqual([scheduled.openWorkspaceDeletionButton.hidden, scheduled.openWorkspaceDeletionCancelButton.hidden], [true, false]);
  });

  it("reports the schedule, its author and whether a backup protects it", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary(pending);
    const rendered = testCase.itemText(testCase.workspaceDeletionSummary);
    assert.equal(rendered[0], "Status: Pending deletion");
    assert.equal(rendered[2], "Requested By: Ada");
    assert.equal(rendered[4], "Backup Protection: Current backup recorded");
  });

  it("names the requester when the lifecycle does not", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary({ ...pending, lifecycle: { ...pending.lifecycle, requestedByName: "" } });
    assert.equal(testCase.itemText(testCase.workspaceDeletionSummary)[2], "Requested By: Workspace administrator");
  });

  /** The two timestamps are different facts: when it was asked for, and when it will be purged. */
  it("reports the grace-period end separately from the request time", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary(pending);
    const rendered = testCase.itemText(testCase.workspaceDeletionSummary);
    assert.notEqual(rendered[1].replace("Requested: ", ""), rendered[3].replace("Grace Period Ends: ", ""));
    assert.match(rendered[3], /Oct/);
    assert.match(rendered[1], /Sep/);
  });

  it("replaces the previous deletion summary rather than appending to it", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary(pending);
    testCase.api.renderWorkspaceDeletionSummary(null, "Loading deletion state...");
    assert.deepEqual(testCase.itemText(testCase.workspaceDeletionSummary), ["Status: Loading deletion state..."]);
  });

  it("says when no backup was acknowledged", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary({ ...pending, lifecycle: { ...pending.lifecycle, backupProtected: false } });
    assert.equal(testCase.itemText(testCase.workspaceDeletionSummary)[4], "Backup Protection: No current backup acknowledged");
  });

  /** Without a current backup the page warns that deletion needs the typed acknowledgement. */
  it("names the backup window when one is current and the acknowledgement when none is", () => {
    const withBackup = settingsCase();
    withBackup.api.renderWorkspaceDeletionSummary({ workspaceName: "Acme", backup: { current: true, windowHours: 24 } });
    assert.match(withBackup.workspaceDeletionStatus.children[0].textContent, /from the last 24 hours is available/);

    const without = settingsCase();
    without.api.renderWorkspaceDeletionSummary({ workspaceName: "Acme", backup: { current: false, windowHours: 24 } });
    assert.match(without.workspaceDeletionStatus.children[0].textContent, /requires the displayed typed acknowledgement/);
  });

  it("marks the pending-deletion note as a warning rather than an error", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary(pending);
    assert.equal(testCase.workspaceDeletionStatus.children[0].className, "runtime-diagnostics-warning");
  });

  it("keeps the loading placeholder it is given while the state is unknown", () => {
    const testCase = settingsCase();
    testCase.api.renderWorkspaceDeletionSummary(null, "Loading deletion state...");
    assert.deepEqual(testCase.itemText(testCase.workspaceDeletionSummary), ["Status: Loading deletion state..."]);
  });
});

describe("Workspace settings user list", () => {
  const users = [
    { user_id: "u1", displayName: "Ada", workspaceMemberships: [{ workspaceId: "ws-1", status: "active" }] },
    { user_id: "u2", displayName: "Grace", workspaceMemberships: [{ workspaceId: "ws-1", status: "inactive" }] },
    { user_id: "u3", displayName: "Alan", workspaceMemberships: [{ workspaceId: "ws-2", status: "active" }] },
    { user_id: "u4", displayName: "Edsger", workspaceMemberships: [] },
    { user_id: "u5", displayName: "Barbara" },
  ];

  /**
   * **This is an access-scoping read, not a display filter.** A user is listed only for a
   * membership in *this* workspace that is not inactive; a membership elsewhere, an inactive one
   * here, and no membership at all each keep the user out.
   */
  it("lists only users with an active membership in this workspace", () => {
    const testCase = settingsCase({ activeWorkspaceId: "ws-1" });
    testCase.api.renderWorkspaceUsers(users);
    assert.deepEqual(
      testCase.requireUsersList().children.map((/** @type {{children: {textContent: string}[]}} */ row) => row.children[0].textContent),
      ["Ada"],
    );
  });

  it("says nobody is assigned rather than drawing an empty list", () => {
    const testCase = settingsCase({ activeWorkspaceId: "ws-9" });
    testCase.api.renderWorkspaceUsers(users);
    assert.deepEqual(
      testCase.requireUsersList().children.map((/** @type {{textContent: string}} */ row) => row.textContent),
      ["No users are assigned to this workspace."],
    );
  });

  it("replaces the previous list rather than appending to it", () => {
    const testCase = settingsCase({ activeWorkspaceId: "ws-1" });
    testCase.api.renderWorkspaceUsers(users);
    testCase.api.renderWorkspaceUsers(users);
    assert.equal(testCase.requireUsersList().children.length, 1);
  });

  it("names a user by display name, then username, then id", () => {
    const testCase = settingsCase({ activeWorkspaceId: "ws-1" });
    testCase.api.renderWorkspaceUsers([
      { user_id: "u1", displayName: "Ada", workspaceMemberships: [{ workspaceId: "ws-1", status: "active" }] },
      { user_id: "u2", username: "grace", workspaceMemberships: [{ workspaceId: "ws-1", status: "active" }] },
      { user_id: "u3", workspaceMemberships: [{ workspaceId: "ws-1", status: "active" }] },
    ]);
    assert.deepEqual(
      testCase.requireUsersList().children.map((/** @type {{children: {textContent: string}[]}} */ row) => row.children[0].textContent),
      ["Ada", "grace", "u3"],
    );
  });

  it("links each row to that user's permissions, with the id encoded", () => {
    const testCase = settingsCase({ activeWorkspaceId: "ws-1" });
    testCase.api.renderWorkspaceUsers([
      { user_id: "u 1/2", displayName: "Ada", workspaceMemberships: [{ workspaceId: "ws-1", status: "active" }] },
    ]);
    const button = testCase.requireUsersList().children[0].children[1];
    assert.equal(button.textContent, "Edit Permissions");
    button.dispatchEvent({ type: "click" });
    assert.equal(testCase.sandbox.window.location.href, "user-admin.html?user=u%201%2F2");
  });

  /**
   * Checked at the use point like this page's other required controls, so a missing list raises
   * where the null dereference did rather than during module evaluation.
   */
  it("names the missing list rather than failing on a null dereference", () => {
    const testCase = settingsCase({ withoutUsersList: true });
    assert.throws(() => testCase.api.requireWorkspaceUsersList(), /requires the workspace users list/);
    assert.throws(() => testCase.api.renderWorkspaceUsers([]), /requires the workspace users list/);
  });
});

describe("Workspace settings shapes this page states rather than invents", () => {
  /**
   * The runtime diagnostics sections are published and checked in the shared declaration, so the
   * formatters read those rather than a local restatement. The two health records answer the same
   * two questions, so the shared pair is what the status formatters take.
   */
  it("types the diagnostics formatters from the published contracts", () => {
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(source, /BrowserRuntimeStorageDiagnostics\} BrowserRuntimeStorageDiagnostics/);
    assert.match(source, /BrowserRuntimePathLocation\} BrowserRuntimePathLocation/);
    assert.match(contracts, /export interface BrowserRuntimeStorageDiagnostics \{/);
    assert.match(source, /@param \{\{ available: boolean \| null, status: string \}\} health/);
  });

  /**
   * These two guards are the reason this file must never name a storage credential or a signed
   * URL, even inside a type annotation. Asserted here as well as in the sibling contracts so the
   * next author sees it in the file's own suite.
   */
  it("names no storage credential, signed URL, or job internal", () => {
    assert.doesNotMatch(source, /payload_json|dedupe_key|dedupeKey|storageKey|localRoot|CLAMD|CLAMSCAN|masterKey|process\.env/i);
    assert.doesNotMatch(source, /LONGTAIL_S3|S3_BUCKET|S3_ENDPOINT|accessKey|secretAccessKey|signedUrl|presigned/i);
  });

  it("reuses the page's own record predicate rather than adding a second one", () => {
    assert.equal(source.split("function isCatalogRecord").length - 1, 1);
    assert.match(source, /const settings = isCatalogRecord\(body\) \? body : \{\};/);
    assert.match(source, /const audit = isCatalogRecord\(value\) \? value : \{\};/);
  });

  it("routes every remaining control lookup through a checked helper", () => {
    for (const helper of ["findDialog", "findElement", "findButton", "findInput", "findSelect", "findForm"]) {
      assert.match(source, new RegExp(`function ${helper}\\(selector\\)`));
    }
    assert.match(source, /const workspaceUsersDialog = findDialog\("\[data-workspace-users-dialog\]"\)/);
    assert.match(source, /const workspaceUsersList = findElement\("\[data-workspace-users-list\]"\)/);
    assert.match(source, /const jobObservabilityMoreButton = findButton\("\[data-job-observability-more\]"\)/);
    assert.match(source, /const createWorkspaceBackupButton = findButton\("\[data-create-workspace-backup\]"\)/);
  });

  it("carries no suppression", () => {
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
