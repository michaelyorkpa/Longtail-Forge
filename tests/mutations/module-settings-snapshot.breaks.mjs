import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Small on purpose.** Six of the nine diagnostics were parameter annotations the compiler
// proves. What changed is that three readers take their values through a record proof instead
// of an optional chain, and the module lookup reads each entry as a record. Those are claimed
// to answer what the untyped reads answered, so this attacks the claim rather than the count.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the record proof this checkpoint added -------------------------------------------------------
  ["an array is read as a settings record",
    '    return typeof value === "object" && value !== null && !Array.isArray(value);',
    '    return typeof value === "object" && value !== null;'],
  ["a primitive is read as a settings record",
    "    return isCatalogRecord(value) ? value : {};",
    "    return /** @type {Record<string, unknown>} */ (value ?? {});"],

  // --- the snapshot the page holds -------------------------------------------------------------------
  ["the workspace name stops being trimmed",
    '      workspaceName: String(source.workspaceName || "").trim(),',
    '      workspaceName: String(source.workspaceName || ""),'],
  ["the legacy workspace-type spelling stops being read",
    "      workspaceType: normalizeWorkspaceType(source.workspaceType || source.workspace_type),",
    "      workspaceType: normalizeWorkspaceType(source.workspaceType),"],
  ["the legacy spelling wins over the modern one",
    "      workspaceType: normalizeWorkspaceType(source.workspaceType || source.workspace_type),",
    "      workspaceType: normalizeWorkspaceType(source.workspace_type || source.workspaceType),"],
  ["an unrecognised workspace type is kept",
    '    return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";',
    "    return workspaceType;"],
  ["every workspace type collapses to the default",
    '    return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";',
    '    return "business";'],
  ["a non-list modules member is carried through",
    "      modules: Array.isArray(source.modules) ? source.modules : [],",
    "      modules: /** @type {unknown[]} */ (source.modules ?? []),"],
  ["the enabled-modules list is dropped",
    "      enabledModules: Array.isArray(source.enabledModules) ? source.enabledModules : [],",
    "      enabledModules: [],"],

  // --- the audit defaults ------------------------------------------------------------------------------
  ["audit logging is switched off by anything falsy",
    "      loggingEnabled: source.loggingEnabled === false ? false : true,",
    "      loggingEnabled: Boolean(source.loggingEnabled),"],
  ["audit logging can no longer be switched off",
    "      loggingEnabled: source.loggingEnabled === false ? false : true,",
    "      loggingEnabled: true,"],
  ["an unoffered retention value is kept",
    "      retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,",
    "      retentionDays: retentionDays,"],
  ["the retention options lose a value they offer",
    "    const retentionOptions = [7, 14, 30, 60, 90, 180, 365];",
    "    const retentionOptions = [7, 14, 30, 60, 180, 365];"],
  ["a retention value sent as text stops parsing",
    "    const retentionDays = Number.parseInt(String(source.retentionDays), 10);",
    "    const retentionDays = typeof source.retentionDays === \"number\" ? source.retentionDays : Number.NaN;"],

  // --- the module lookup --------------------------------------------------------------------------------
  ["module entries stop being read as records",
    "      .map(moduleSettingsRecord)\n      .find((module) => module.id === moduleId) || null;",
    "      .map(moduleSettingsRecord)\n      .find(() => true) || null;"],
];

runMutationCampaign({
  sourcePath: "public/js/module-settings.js",
  suites: ["tests/unit/module-settings-snapshot.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
