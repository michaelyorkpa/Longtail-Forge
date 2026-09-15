import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/module-settings.js");

/**
 * The settings snapshot this page builds, and the readers that depend on it.
 *
 * Six of the nine diagnostics were parameter annotations the compiler proves. What changed at
 * runtime is that three readers now take their values through a record proof rather than an
 * optional chain, and the module lookup reads each list entry as a record. Those are claimed to
 * answer exactly what the untyped reads answered, so the cases below hold that still across the
 * shapes a wire body can actually carry.
 *
 * `module-settings-catalog-contracts.test.mjs` already covers the catalog readers; this is the
 * snapshot half.
 */

const LIFTED = [
  "isCatalogRecord", "moduleSettingsRecord", "normalizeSettings",
  "normalizeWorkspaceType", "normalizeAuditSettings",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function settingsCase() {
  const sandbox = vm.createContext({});
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

describe("Module settings record proof", () => {
  it("answers a record as itself and an empty record for everything else", () => {
    const api = settingsCase();
    assert.deepEqual(plain(api.moduleSettingsRecord({ a: 1 })), { a: 1 });
    for (const value of [null, undefined, "settings", 5, true, [1, 2]]) {
      assert.deepEqual(plain(api.moduleSettingsRecord(value)), {}, `value: ${JSON.stringify(value)}`);
    }
  });
});

describe("Module settings snapshot", () => {
  it("answers the five members this page holds", () => {
    const api = settingsCase();
    assert.deepEqual(Object.keys(api.normalizeSettings({})).sort(), [
      "audit", "enabledModules", "modules", "workspaceName", "workspaceType",
    ]);
  });

  it("carries the workspace name, trimmed", () => {
    const api = settingsCase();
    assert.equal(api.normalizeSettings({ workspaceName: "  Acme  " }).workspaceName, "Acme");
    assert.equal(api.normalizeSettings({}).workspaceName, "");
  });

  /** The legacy snake_case spelling is still accepted, and camelCase still wins. */
  it("reads the workspace type from either spelling, preferring the modern one", () => {
    const api = settingsCase();
    assert.equal(api.normalizeSettings({ workspace_type: "personal" }).workspaceType, "personal");
    assert.equal(api.normalizeSettings({ workspaceType: "family", workspace_type: "personal" }).workspaceType, "family");
  });

  it("defaults an unrecognised workspace type to business", () => {
    const api = settingsCase();
    for (const value of ["", "enterprise", null, undefined, 5, {}]) {
      assert.equal(api.normalizeWorkspaceType(value), "business", `value: ${JSON.stringify(value)}`);
    }
    for (const value of ["business", "personal", "family"]) {
      assert.equal(api.normalizeWorkspaceType(value), value);
    }
  });

  /** The lists are proved to be arrays and nothing more; their elements stay untouched. */
  it("keeps a list of any elements and refuses anything that is not a list", () => {
    const api = settingsCase();
    const entries = [{ id: "tasks" }, "loose", null];
    assert.deepEqual(plain(api.normalizeSettings({ modules: entries }).modules), plain(entries));
    // Both lists carry through, not just the one the render path reads. An earlier version
    // asserted only the empty case for enabled modules, and a mutation that always answered
    // an empty list survived it.
    const enabled = ["tasks", "notes"];
    assert.deepEqual(plain(api.normalizeSettings({ enabledModules: enabled }).enabledModules), enabled);
    assert.deepEqual(
      plain(api.normalizeSettings({ enabledModules: enabled, modules: entries })),
      { audit: { loggingEnabled: true, retentionDays: 30 }, enabledModules: enabled, modules: plain(entries), workspaceName: "", workspaceType: "business" },
      "both lists survive the same snapshot",
    );
    for (const value of [null, undefined, "modules", 5, {}]) {
      assert.deepEqual(plain(api.normalizeSettings({ modules: value }).modules), [], `value: ${JSON.stringify(value)}`);
      assert.deepEqual(plain(api.normalizeSettings({ enabledModules: value }).enabledModules), []);
    }
  });

  /**
   * **Non-throwing first.** The record proof is what lets a non-record body reach the same
   * defaults; without it the reader would crash rather than answer.
   */
  it("answers a complete snapshot for a body it cannot read", () => {
    const api = settingsCase();
    for (const value of [null, undefined, "settings", 5, true, []]) {
      assert.doesNotThrow(() => api.normalizeSettings(value), `value: ${JSON.stringify(value)}`);
      assert.deepEqual(plain(api.normalizeSettings(value)), {
        audit: { loggingEnabled: true, retentionDays: 30 },
        enabledModules: [],
        modules: [],
        workspaceName: "",
        workspaceType: "business",
      }, `value: ${JSON.stringify(value)}`);
    }
  });
});

describe("Module settings audit defaults", () => {
  /** Logging is on unless the body says exactly `false`, which is what the untyped read did. */
  it("keeps logging on unless it is switched off exactly", () => {
    const api = settingsCase();
    assert.equal(api.normalizeAuditSettings({ loggingEnabled: false }).loggingEnabled, false);
    for (const value of [true, undefined, null, 0, "", "false"]) {
      assert.equal(api.normalizeAuditSettings({ loggingEnabled: value }).loggingEnabled, true, `value: ${JSON.stringify(value)}`);
    }
  });

  it("keeps a retention value the options offer", () => {
    const api = settingsCase();
    for (const days of [7, 14, 30, 60, 90, 180, 365]) {
      assert.equal(api.normalizeAuditSettings({ retentionDays: days }).retentionDays, days);
    }
  });

  it("defaults a retention value the options do not offer", () => {
    const api = settingsCase();
    for (const days of [0, 1, 31, 400, -7, "", null, undefined, {}, "thirty"]) {
      assert.equal(api.normalizeAuditSettings({ retentionDays: days }).retentionDays, 30, `days: ${JSON.stringify(days)}`);
    }
  });

  /** A numeric string still parses, because the reader coerced before parsing and still does. */
  it("accepts a retention value the body sent as text", () => {
    const api = settingsCase();
    assert.equal(api.normalizeAuditSettings({ retentionDays: "90" }).retentionDays, 90);
  });

  it("answers the defaults for an audit bag it cannot read", () => {
    const api = settingsCase();
    for (const value of [null, undefined, "audit", 5, []]) {
      assert.doesNotThrow(() => api.normalizeAuditSettings(value), `value: ${JSON.stringify(value)}`);
      assert.deepEqual(plain(api.normalizeAuditSettings(value)), { loggingEnabled: true, retentionDays: 30 });
    }
  });
});

describe("module-settings.js shapes this page states rather than invents", () => {
  it("names its snapshot over the members the normalizer writes", () => {
    assert.match(source, /@typedef \{object\} ModuleSettingsSnapshot/);
    assert.match(source, /@property \{unknown\[\]\} modules/);
  });

  /** The record proof reuses the catalog check already in this file rather than copying it. */
  it("builds the record proof on the check already here", () => {
    assert.match(source, /function moduleSettingsRecord\(value\) \{\n\s*return isCatalogRecord\(value\) \? value : \{\};/);
  });

  /** The status options are the published ones, not a local restatement. */
  it("forwards the published status options", () => {
    assert.match(source, /@param \{BrowserStatusMessageOptions\} \[options\]/);
  });

  /** The module lookup reads each list entry as a record, since the snapshot proves no element. */
  it("reads each module entry as a record before matching its id", () => {
    assert.match(source, /\.map\(moduleSettingsRecord\)\n\s*\.find\(\(module\) => module\.id === moduleId\)/);
  });

  /** The normalization body must not carry the legacy module flags the UI contract forbids. */
  it("carries no legacy module flag, no suppression, and only the cast the status element earns", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\b(?:timeTrackingEnabled|tasksEnabled|taskTimersEnabled)\b/);
    // Two assertions, both pre-existing and both behind a check this file already makes:
    // `asStatusElement` after proving `hidden` is present, and the catalog reader after
    // validating its sections. This checkpoint adds neither.
    const casts = source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || [];
    assert.equal(casts.length, 2, "only the two checked assertions this file already had");
    assert.match(source, /"hidden" in node \? \/\*\* @type \{HTMLElement\} \*\/ \(node\)/);
  });
});
